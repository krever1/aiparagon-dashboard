// A stand-in for Supabase for the browser tests, with made-up accounts and rows. It never talks to the real project.
// Auth (GoTrue): password sign-in, refresh, the user check, sign-out and password reset.
// Data (PostgREST, /rest/v1): see rest.mjs; the starting rows are in fixtures.mjs.
// Test-only routes: GET /health, GET /__calls (requests seen, passwords left out), POST /__reset (calls, the account
// override and the rows back to the start), POST /__as {email} (from now on /user answers as that account, to test a
// session that is not the team's), POST /__seed {table: rows[]} (a test's own rows), GET /__rows?table=<name>.
import http from 'node:http'
import crypto from 'node:crypto'
import { createRest } from './rest.mjs'
import { fixtures } from './fixtures.mjs'

const PORT = Number(process.env.STUB_PORT || 54399)
const SECRET = 'stub-only-secret'
const PASSWORD = 'correct horse battery'
const USERS = {
  'qa.teammate@aiparagonconsulting.com': { id: '00000000-0000-4000-8000-0000000000a1', name: 'QA Teammate' },
  'outsider@example.org': { id: '00000000-0000-4000-8000-0000000000b2', name: 'Someone Else' },
}

let calls = []
let actAs = null
const refresh = new Map() // refresh token -> email

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

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const fail = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, error: code, error_description: msg })

http
  .createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const url = new URL(req.url, 'http://stub')
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
      if (url.pathname === '/health') return send(res, 200, { ok: true })
      if (url.pathname === '/__calls') return send(res, 200, calls)
      if (url.pathname === '/__reset') { calls = []; actAs = null; rest.reset(); return send(res, 200, { ok: true }) }
      if (url.pathname === '/__as') { actAs = body.email || null; return send(res, 200, { ok: true }) }
      if (url.pathname === '/__seed') { rest.seed(body); return send(res, 200, { ok: true }) }
      if (url.pathname === '/__rows') return send(res, 200, rest.dump(url.searchParams.get('table') || undefined))

      const seen = Array.isArray(body) ? body : { ...body }
      if (!Array.isArray(seen)) delete seen.password
      calls.push({ method: req.method, path: url.pathname, query: url.search, body: seen })

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
      return fail(res, 404, 'not_found', 'Not found in the stub: ' + req.method + ' ' + url.pathname)
    })
  })
  .listen(PORT, '127.0.0.1', () => console.log('supabase stub on ' + PORT))
