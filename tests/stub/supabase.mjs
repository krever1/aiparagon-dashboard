// A stand-in for Supabase for the browser tests, with made-up accounts and rows. It never talks to the real project.
// Auth (GoTrue): password sign-in, refresh, the user check, sign-out and password reset.
// Data (PostgREST, /rest/v1): see rest.mjs; the starting rows are in fixtures.mjs.
// n8n (/webhook/*): the dashboard's webhooks, each checking the caller's token in the body's `auth` as the real ones do.
// doc-reader, fathom-proxy (status, list a page at a time, transcript, access, connect, disconnect), catalyst-emails,
// call-actions, slack-proxy and call-to-crm answer from fixtures.mjs or as the workflows would; the three stage runs (the
// full run, the custom run, Meeting Prep) answer started; the Intel Tracker's custom run (intel-run) answers with its
// run id and the names it tracks; any webhook can be given a canned answer.
// Test-only routes: GET /health, GET /__calls (requests seen, passwords left out), POST /__reset (calls, the account
// override, the rows, the documents and canned answers back to the start), POST /__as {email} (from now on /user
// answers as that account, to test a session that is not the team's), POST /__seed {table: rows[]} (a test's own rows),
// GET /__rows?table=<name>, POST /__docs {id: {kind, text} | {ok: false, message}} (documents doc-reader can read),
// POST /__hook {path, status, body} (a canned answer for /webhook/<path>), POST /__fathom {connected, hint, items?, ...}
// (the team's Fathom key as the Fathom proxy keeps it, and the first page of calls it lists when a test gives one), GET /__storage (the files kept), POST /__storage {deny} (Storage
// turns signed-in teammates away, as before its rules for them were added).
// Storage (/storage/v1): an upload address signed for a signed-in session, the upload to it, public reads and removal,
// for the lead-files bucket; it answers the browser's CORS checks. catalyst-proposal answers started;
// file-ingest reads a stored file and saves its text on the row as Lead File Text Ingest does (a file named "scan..."
// has none); hubspot-file-sync answers synced.
import http from 'node:http'
import crypto from 'node:crypto'
import { createRest } from './rest.mjs'
import { fixtures, docs as docFixtures, fathomCalls, fathomOlderCalls, fathomTranscripts, hubspotEmails } from './fixtures.mjs'

const PORT = Number(process.env.STUB_PORT || 54399)
const SECRET = 'stub-only-secret'
const PASSWORD = 'correct horse battery'
const USERS = {
  'qa.teammate@aiparagonconsulting.com': { id: '00000000-0000-4000-8000-0000000000a1', name: 'QA Teammate' },
  'outsider@example.org': { id: '00000000-0000-4000-8000-0000000000b2', name: 'Someone Else' },
}

let calls = []
let actAs = null
let docs = docFixtures()
let hooks = {}
// the team's Fathom key, as Dashboard · Fathom Proxy keeps it
const FATHOM = () => ({ connected: true, hint: 'ab12', updated_by: 'qa.teammate@aiparagonconsulting.com', updated_at: '2026-11-01T10:00:00Z' })
let fathom = FATHOM()
const refresh = new Map() // refresh token -> email
// Storage: path -> {type, body (Buffer)}, lead-files in `store`, the ads' pictures (creatives) in `creatives`; signed
// upload tokens -> bucket and path
let store = new Map()
let creatives = new Map()
let signed = new Map()
const bucketOf = (b) => (b === 'creatives' ? creatives : store)
let denyStorage = false
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,apikey,content-type,x-upsert,cache-control,x-client-info',
}

const b64url = (b) => Buffer.from(b).toString('base64url')
function jwt(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', SECRET).update(head + '.' + body).digest('base64url')
  return head + '.' + body + '.' + sig
}
function verify(token) {
  const [h, b, s] = String(token || '').split('.')
  if (!h || !b || !s) return null
  const want = crypto.createHmac('sha256', SECRET).update(h + '.' + b).digest('base64url')
  if (want !== s) return null
  const p = JSON.parse(Buffer.from(b, 'base64url').toString())
  return p.exp * 1000 > Date.now() ? p : null
}
function userJson(email) {
  const u = USERS[email]
  const now = new Date().toISOString()
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email, phone: '',
    email_confirmed_at: now, confirmed_at: now, last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: u.name },
    identities: [], created_at: now, updated_at: now, is_anonymous: false,
  }
}
function session(email) {
  const now = Math.floor(Date.now() / 1000)
  const u = USERS[email]
  const access_token = jwt({
    aud: 'authenticated', exp: now + 3600, iat: now, sub: u.id, email, role: 'authenticated', aal: 'aal1',
    session_id: crypto.randomUUID(), is_anonymous: false, user_metadata: { display_name: u.name }, app_metadata: { provider: 'email' },
  })
  const refresh_token = crypto.randomBytes(12).toString('hex')
  refresh.set(refresh_token, email)
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(email) }
}

/** The caller's verified claims from `Authorization: Bearer <token>`, or null (the public key alone is not a session). */
function claimsOf(req) {
  return verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
}
const rest = createRest(fixtures, claimsOf)

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

/** Storage for the lead-files bucket, as the app and the browser use it. */
function storage(req, res, url, buf, body) {
  const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\//, ''))
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }
  let m
  if (req.method === 'POST' && (m = p.match(/^object\/upload\/sign\/(lead-files|creatives)\/(.+)$/))) {
    if (!claimsOf(req)) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'Invalid Compact JWS' }, CORS)
    // the creatives bucket takes the team's uploads under uploads/ only, as the project's rule does
    if (denyStorage || (m[1] === 'creatives' && !m[2].startsWith('uploads/'))) {
      return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, CORS)
    }
    const token = crypto.randomBytes(10).toString('hex')
    signed.set(token, m[1] + '/' + m[2])
    return send(res, 200, { url: '/object/upload/sign/' + m[1] + '/' + m[2] + '?token=' + token }, CORS)
  }
  if (req.method === 'PUT' && (m = p.match(/^object\/upload\/sign\/(lead-files|creatives)\/(.+)$/))) {
    const token = url.searchParams.get('token')
    if (!token || signed.get(token) !== m[1] + '/' + m[2]) return send(res, 400, { statusCode: '400', error: 'InvalidSignature', message: 'The signature does not match' }, CORS)
    signed.delete(token)
    bucketOf(m[1]).set(m[2], { type: String(req.headers['content-type'] || 'application/octet-stream'), body: buf })
    return send(res, 200, { Key: m[1] + '/' + m[2] }, CORS)
  }
  if (req.method === 'GET' && (m = p.match(/^object\/public\/(lead-files|creatives)\/(.+)$/))) {
    const f = bucketOf(m[1]).get(m[2])
    if (!f) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' }, CORS)
    res.writeHead(200, { 'content-type': f.type, ...CORS })
    return res.end(f.body)
  }
  if (req.method === 'DELETE' && p === 'object/lead-files') {
    // without a rule for teammates, Storage removes nothing and says nothing
    if (!claimsOf(req) || denyStorage) return send(res, 200, [], CORS)
    const gone = (body.prefixes || []).filter((x) => store.delete(x)).map((name) => ({ name, bucket_id: 'lead-files' }))
    return send(res, 200, gone, CORS)
  }
  return send(res, 400, { statusCode: '404', error: 'not_found', message: 'stub: storage route not supported' }, CORS)
}

/** Lead File Text Ingest: the file's text on its row (a file named "scan..." has none, as an image-only PDF). */
function ingest(body) {
  const key = String(body.fileUrl || '').replace(/^.*\/object\/public\/lead-files\//, '')
  const f = store.get(decodeURIComponent(key))
  const scan = /scan/i.test(String(body.fileName || ''))
  const text = scan ? null : f ? f.body.toString('utf8').slice(0, 60000) : 'Text read from ' + body.fileName
  rest.patch(body.table === 'guide_files' ? 'guide_files' : 'lead_files', body.fileId, { file_text: text, indexed_at: new Date().toISOString() })
  return { ok: true, chars: text ? text.length : 0, extracted: !!text }
}
const fail = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, error: code, error_description: msg })

http
  .createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      const url = new URL(req.url, 'http://stub')
      const binary = url.pathname.startsWith('/storage/v1/object/upload/sign/') && req.method === 'PUT'
      const raw = binary ? '' : buf.toString('utf8')
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
      if (url.pathname === '/health') return send(res, 200, { ok: true })
      if (url.pathname === '/__calls') return send(res, 200, calls)
      if (url.pathname === '/__reset') {
        calls = []
        actAs = null
        rest.reset()
        docs = docFixtures()
        hooks = {}
        fathom = FATHOM()
        store = new Map()
        signed = new Map()
        creatives = new Map()
        denyStorage = false
        return send(res, 200, { ok: true })
      }
      if (url.pathname === '/__storage') {
        if (req.method === 'POST') {
          denyStorage = !!body.deny
          return send(res, 200, { ok: true })
        }
        const kept = url.searchParams.get('bucket') === 'creatives' ? creatives : store
        return send(res, 200, Object.fromEntries([...kept].map(([k, v]) => [k, { type: v.type, size: v.body.length }])))
      }
      if (url.pathname === '/__docs') { Object.assign(docs, body); return send(res, 200, { ok: true }) }
      if (url.pathname === '/__hook') { hooks[body.path] = { status: body.status || 200, body: body.body }; return send(res, 200, { ok: true }) }
      if (url.pathname === '/__as') { actAs = body.email || null; return send(res, 200, { ok: true }) }
      if (url.pathname === '/__fathom') { fathom = { ...body }; return send(res, 200, { ok: true }) }
      if (url.pathname === '/__seed') { rest.seed(body); return send(res, 200, { ok: true }) }
      if (url.pathname === '/__rows') return send(res, 200, rest.dump(url.searchParams.get('table') || undefined))

      const seen = Array.isArray(body) ? body : { ...body }
      if (!Array.isArray(seen)) delete seen.password
      calls.push({ method: req.method, path: url.pathname, query: url.search, body: seen, ...(binary ? { size: buf.length, type: req.headers['content-type'] } : {}) })
      if (url.pathname.startsWith('/storage/v1/')) return storage(req, res, url, buf, body)

      if (req.method === 'POST' && url.pathname === '/auth/v1/token') {
        const grant = url.searchParams.get('grant_type')
        if (grant === 'password') {
          const email = String(body.email || '').toLowerCase()
          if (!USERS[email] || body.password !== PASSWORD) return fail(res, 400, 'invalid_credentials', 'Invalid login credentials')
          return send(res, 200, session(email))
        }
        if (grant === 'refresh_token') {
          const email = refresh.get(body.refresh_token)
          if (!email) return fail(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
          refresh.delete(body.refresh_token)
          return send(res, 200, session(email))
        }
        return fail(res, 400, 'unsupported_grant_type', 'Unsupported grant type')
      }
      if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
        const claims = verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
        if (!claims) return fail(res, 401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature')
        return send(res, 200, userJson(actAs || claims.email))
      }
      if (req.method === 'POST' && url.pathname === '/auth/v1/logout') return send(res, 204)
      if (req.method === 'POST' && url.pathname === '/auth/v1/recover') return send(res, 200, {})
      if (url.pathname.startsWith('/rest/v1/')) return rest.handle(req, res, url, raw)
      if (req.method === 'POST' && url.pathname.startsWith('/webhook/')) {
        const name = url.pathname.slice('/webhook/'.length)
        // Check Dashboard User: the body's `auth` must be a signed-in session.
        if (!verify(body.auth)) return send(res, 401, { code: 'unauthorized', message: 'stub: the request carries no signed-in user' })
        const canned = hooks[name]
        if (canned) return send(res, canned.status, canned.body)
        if (name === 'doc-reader') {
          const d = docs[body.id]
          if (!d) return send(res, 200, { ok: false, message: 'Could not read that document.' })
          return send(res, 200, d.ok === false ? d : { ok: true, ...d })
        }
        if (name === 'fathom-proxy') {
          const off = { ok: false, code: 'not_connected', message: 'Fathom is not connected. Paste a Fathom API key to connect it.' }
          if (body.action === 'status') return send(res, 200, fathom.connected ? { ok: true, ...fathom } : { ok: true, connected: false })
          if (body.action === 'connect') {
            const key = String(body.key || '')
            if (key.startsWith('bad')) return send(res, 200, { ok: false, code: 'bad_key', message: 'Fathom did not accept that key.' })
            fathom = { connected: true, hint: key.slice(-4), updated_by: 'qa.teammate@aiparagonconsulting.com', updated_at: new Date().toISOString() }
            return send(res, 200, { ok: true, connected: true, hint: fathom.hint })
          }
          if (body.action === 'disconnect') {
            fathom = { connected: false }
            return send(res, 200, { ok: true, connected: false })
          }
          if (!fathom.connected) return send(res, 200, off)
          if (body.action === 'list') {
            if (body.cursor === 'page2') return send(res, 200, { ok: true, items: fathomOlderCalls(), next_cursor: null })
            // a test can give its own first page ({connected: true, items}), dated from now
            return send(res, 200, { ok: true, items: fathom.items ?? fathomCalls(), next_cursor: 'page2' })
          }
          if (body.action === 'transcript') return send(res, 200, { ok: true, transcript: fathomTranscripts()[body.id] || [] })
          if (body.action === 'access') {
            const access = Object.fromEntries((body.tokens || []).map((t) => [t, /TeamOnly/.test(t) ? 'team' : 'anyone']))
            return send(res, 200, { ok: true, access })
          }
          return send(res, 200, { ok: false, code: 'bad_action', message: 'stub: unknown action' })
        }
        // Meetings · Post-call Actions answers that it started; the test writes the row the workflow would save
        if (name === 'call-actions') return send(res, 200, { ok: true, started: true })
        // Catalyst · Client Proposal answers once its caller check passes; the test writes the row it would save
        if (name === 'catalyst-proposal') {
          if (!body.leadEmail) return send(res, 400, { ok: false, code: 'bad_request', message: 'stub: leadEmail is required' })
          return send(res, 200, { ok: true, started: true })
        }
        if (name === 'file-ingest') return send(res, 200, ingest(body))
        if (name === 'hubspot-file-sync') return send(res, 200, { synced: true, hubspotFileId: 'HF-1', noteId: 'N-1' })
        if (name === 'slack-proxy') {
          if (body.action === 'channels') {
            return send(res, 200, { ok: true, channels: [{ id: 'C1', name: 'new-leads', member: true }, { id: 'C2', name: 'random', member: false }] })
          }
          if (body.action === 'post') return send(res, 200, { ok: true, ts: '1.2' })
          return send(res, 200, { ok: false, message: 'stub: unknown action' })
        }
        if (name === 'call-to-crm') {
          const contacts = (body.emails || []).map((e) => ({ email: e, name: e === 'robin.sample@example.com' ? 'Robin Sample' : '' }))
          return send(res, 200, { ok: true, synced_at: '2026-11-05T12:00:00Z', engagement_id: 'E-1', contacts })
        }
        if (name === 'catalyst-emails') {
          const all = hubspotEmails()
          const items = (body.emails || []).flatMap((e) => all[String(e).toLowerCase()] || []).slice(0, body.limit || 8)
          return send(res, 200, { ok: true, items, total: items.length })
        }
        // Engine 3 · Intel Tracker: a custom run starts and says which names it tracks
        if (name === 'intel-run') {
          const names = (body.competitors || []).map((c) => c.name).filter(Boolean)
          return send(res, 200, { ok: true, run_id: 'agent1_custom_stub', tracking: names })
        }
        // Engine 3 · Ad Strategist: a run starts; Engine 3 · Advertiser Industries: names an industry for the advertisers
        // whose ads say what they sell (a test gives its own answer with /__hook)
        if (name === 'ad-strategist-run') return send(res, 200, { ok: true, run_id: 'agent2_stub' })
        // Engine 3 · Strategy Insights: a read started as insights_stub; the test writes the read (or the error row) n8n
        // would save under it, or gives another answer with stubHook
        if (name === 'e3-strategy-insights') return send(res, 200, { ok: true, started: true, run_id: 'insights_stub', counts: {} })
        // Engine 3 · Ad Results Sync: nothing connected yet (a test gives connected platforms, and the rows a sync updated, with stubHook)
        if (name === 'e3-ad-results') {
          return send(res, 200, body.action === 'sync' ? { ok: true, rows: 0 } : { ok: true, meta: { connected: false }, linkedin: { connected: false } })
        }
        // Engine 3 · Ad Upload Analyzer: reads an ad (an advertiser named "Unreadable…" cannot be read), or writes copy
        if (name === 'ad-upload' && body.mode === 'copy') {
          const n = Number(body.count) || 3
          const variants = Array.from({ length: n }, (_, i) => ({
            angle: ['Time back', 'Proof', 'Simple start', 'Risk', 'Speed'][i % 5],
            hook: 'Stub hook ' + (i + 1) + ' for ' + (body.offer?.name || 'the offer'),
            primary_text: 'Stub primary text ' + (i + 1) + '.',
            headline: 'Stub headline ' + (i + 1),
            cta: 'Book a call',
            image_direction: 'A clear desk',
            pattern_borrowed: 'Proof first',
          }))
          return send(res, 200, { ok: true, variants, takeaways: ['Lead with the result'], guideline_notes: ['Kept to plain words', 'No promises of results'] })
        }
        if (name === 'ad-upload') {
          if (/^unreadable/i.test(String(body.advertiser || ''))) return send(res, 200, { ok: false, error: 'The analyzer could not read this ad.' })
          const imgs = Array.isArray(body.images) ? body.images : []
          return send(res, 200, {
            ok: true,
            analysis: {
              hook: body.copy ? String(body.copy).split('\n')[0] : 'Hook read from the screenshot',
              body: body.copy || 'Body read from the screenshot.',
              cta: 'Learn more',
              copy_formula: 'Problem -> Proof -> Offer',
              offer_inferred: 'Free audit',
              price_point_inferred: 0,
              funnel_stage: 'mof',
              format: imgs.length > 1 ? 'carousel' : imgs.length ? 'static_image' : 'text',
              extracted_patterns: ['Proof first: a client result'],
              visual: { visual_hook: 'A checklist on a desk', text_on_image: 'Free audit' },
              takeaways: ['Opens with a result', 'Names the offer'],
              confidence: 0.8,
            },
          })
        }
        // Engine 3 · Custom Ad Strategy: answers with the brief it would save (a test writes the rows it would save)
        if (name === 'ad-brief') {
          return send(res, 200, { ok: true, run_id: 'agent2_custom_stub', brief: { differentiation_angle: 'Proof you can check in a week.', winning_hooks: ['Your week back', 'Proof first'] } })
        }
        // Low-Ticket Ads Content Agent: answers that it started
        if (name === 'e3-low-ticket-run') return send(res, 200, { ok: true, started: true })
        if (name === 'e3-ad-industries') return send(res, 200, { ok: true, industries: {} })
        if (['870a1ffa-cbc6-4085-894a-6f3bc90a40f2', 'e1-custom-run-erica', 'catalyst-meeting-prep'].includes(name)) {
          return send(res, 200, { ok: true, started: true })
        }
        return send(res, 404, { code: 404, message: 'stub: the requested webhook "' + name + '" is not registered.' })
      }
      return fail(res, 404, 'not_found', 'Not found in the stub: ' + req.method + ' ' + url.pathname)
    })
  })
  .listen(PORT, '127.0.0.1', () => console.log('supabase stub on ' + PORT))
