// A small stand-in for Supabase's data API (PostgREST, /rest/v1) over in-memory tables, enough for the app's queries:
// select (columns), filters (eq, neq, in, is, like, ilike, gt, gte, lt, lte, not.*, or=(...)), order, limit/offset,
// single-object answers (Accept: application/vnd.pgrst.object+json), counts, PATCH updates, POST inserts and upserts,
// DELETE. Like the real project's row rules for this app, it answers only a signed-in user (the caller's own token),
// never the public key alone, so a test fails if the app ever reads or writes without the person's session.

import { randomUUID } from 'node:crypto'

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

/** Primary keys, for upserts (the app's tables; anything else falls back to `id`). */
const KEYS = {
  e1_leads: 'email',
  agent_outputs: 'id',
  ai_settings: 'key',
  call_meta: 'call_id',
  hubspot_contacts: 'email',
  agent_feedback: 'id',
  lead_files: 'id',
  catalyst_sources: 'id',
}

/** Other unique columns, as in the project (an ad's link is kept once: ad_records_url_unique; a page's slug once). */
const UNIQUE = { ad_records: ['ad_library_url'], landing_pages: ['slug'] }

/** Check constraints the app must respect, as in the project (23514 when a row breaks one). */
const CHECKS = {
  landing_pages: (r) =>
    (r.slug === undefined || (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(r.slug)) && String(r.slug).length >= 3 && String(r.slug).length <= 60)) &&
    (r.status === undefined || ['draft', 'live', 'paused'].includes(r.status)) &&
    (r.kind === undefined || ['book_call', 'webinar', 'download', 'newsletter_signup', 'landing'].includes(r.kind)),
  content_requests: (r) =>
    (r.format === undefined || ['ad', 'thought_leadership', 'newsletter', 'email'].includes(r.format)) &&
    (r.start_mode === undefined || ['source', 'idea'].includes(r.start_mode)) &&
    (r.status === undefined || ['queued', 'extracting', 'drafting', 'done', 'error'].includes(r.status)),
  content_results: (r) =>
    (r.kind === undefined || ['post', 'ad'].includes(r.kind)) &&
    (r.title === undefined || String(r.title ?? '').trim().length > 0) &&
    ['impressions', 'reactions', 'comments', 'shares', 'clicks', 'spend', 'leads', 'bookings'].every((k) => r[k] === undefined || r[k] === null || Number(r[k]) >= 0),
}

/** Column defaults a new row gets, as in the project (beyond the id and created_at every table gets here). */
const DEFAULTS = {
  landing_pages: () => ({ title: '', status: 'draft', kind: 'landing', content: {}, ads: [], add_to_pipeline: true, updated_at: new Date().toISOString(), published_at: null }),
  content_pieces: () => ({ status: 'draft', tags: [], updated_at: new Date().toISOString() }),
  idea_notes: () => ({ status: 'open', tags: [], updated_at: new Date().toISOString() }),
  content_requests: () => ({ status: 'queued', updated_at: new Date().toISOString() }),
}

/** Tables whose new rows get a uuid, as the project makes them (the app checks those ids are uuids). */
const UUID_IDS = new Set(['content_pieces', 'idea_notes', 'content_requests'])

/** Row rules for deletes, as in the project: a landing page can be deleted only while a draft that never went live. */
const DELETABLE = { landing_pages: (r) => r.status === 'draft' && !r.published_at }

/**
 * Views, as in the project: winner_creatives is every ad_records row, so a write to ad_records shows in it. A test that
 * seeds winner_creatives itself reads its own rows there instead.
 */
const VIEWS = { winner_creatives: 'ad_records' }

const clone = (v) => JSON.parse(JSON.stringify(v))

/** PostgREST's text form of a value, for comparing (filters always arrive as text). */
function text(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function likeToRegex(pattern, flags) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*')
  return new RegExp('^' + esc + '$', flags)
}

function unquote(s) {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s
}

/** Splits "a,b,(c,d),e" on commas at the top level (not inside parentheses or quotes). */
function splitTop(s) {
  const out = []
  let depth = 0
  let quoted = false
  let cur = ''
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === '(') depth++
    if (!quoted && ch === ')') depth--
    if (!quoted && depth === 0 && ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/** One condition: column and "op.value" (op may be prefixed by "not."). */
function test(row, column, expr) {
  let negate = false
  if (expr.startsWith('not.')) {
    negate = true
    expr = expr.slice(4)
  }
  const dot = expr.indexOf('.')
  const op = dot < 0 ? expr : expr.slice(0, dot)
  const arg = dot < 0 ? '' : expr.slice(dot + 1)
  const raw = row[column]
  const v = text(raw)
  let ok
  switch (op) {
    case 'eq': ok = v !== null && v === arg; break
    case 'neq': ok = v !== null && v !== arg; break
    case 'gt': ok = v !== null && v > arg; break
    case 'gte': ok = v !== null && v >= arg; break
    case 'lt': ok = v !== null && v < arg; break
    case 'lte': ok = v !== null && v <= arg; break
    case 'like': ok = v !== null && likeToRegex(arg, '').test(v); break
    case 'ilike': ok = v !== null && likeToRegex(arg, 'i').test(v); break
    case 'in': {
      const list = splitTop(arg.replace(/^\(|\)$/g, '')).map(unquote)
      ok = v !== null && list.includes(v)
      break
    }
    case 'is': {
      const a = arg.toLowerCase()
      ok = a === 'null' ? raw === null || raw === undefined : a === 'true' ? raw === true : a === 'false' ? raw === false : false
      break
    }
    default:
      throw new Error('stub: filter not supported: ' + op)
  }
  return negate ? !ok : ok
}

/** or=(a.eq.1,b.is.null,and(c.eq.2,d.eq.3)) */
function orGroup(row, inside) {
  return splitTop(inside).some((part) => {
    if (part.startsWith('and(')) return splitTop(part.slice(4, -1)).every((p) => cond(row, p))
    return cond(row, part)
  })
}
function cond(row, part) {
  const dot = part.indexOf('.')
  return test(row, part.slice(0, dot), part.slice(dot + 1))
}

function matches(row, params) {
  for (const [key, value] of params) {
    if (RESERVED.has(key)) continue
    if (key === 'or') {
      if (!orGroup(row, value.replace(/^\(|\)$/g, ''))) return false
      continue
    }
    if (key === 'and') {
      if (!splitTop(value.replace(/^\(|\)$/g, '')).every((p) => cond(row, p))) return false
      continue
    }
    if (!test(row, key, value)) return false
  }
  return true
}

function sortRows(rows, order) {
  if (!order) return rows
  const parts = order.split(',').map((p) => {
    const [col, ...mods] = p.split('.')
    return { col, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : null }
  })
  return [...rows].sort((a, b) => {
    for (const { col, desc, nullsFirst } of parts) {
      const x = a[col]
      const y = b[col]
      const xn = x === null || x === undefined
      const yn = y === null || y === undefined
      if (xn || yn) {
        if (xn && yn) continue
        // PostgreSQL: nulls sort last ascending and first descending, unless told otherwise.
        const first = nullsFirst ?? desc
        return xn === first ? -1 : 1
      }
      const tx = typeof x === 'number' && typeof y === 'number' ? x - y : String(text(x)).localeCompare(String(text(y)))
      if (tx !== 0) return desc ? -tx : tx
    }
    return 0
  })
}

function project(rows, select) {
  if (!select || select === '*') return rows
  const cols = splitTop(select).map((c) => c.trim()).filter(Boolean)
  if (cols.includes('*')) return rows
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c.split(':').pop(), r[c.split(':').pop()] ?? null])))
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

/**
 * The data API. `initial()` returns the starting tables ({table: rows[]}); `claimsOf(req)` returns the caller's
 * verified token claims or null.
 */
export function createRest(initial, claimsOf) {
  let tables = clone(initial())
  let seq = 1

  function table(name) {
    if (!tables[name]) tables[name] = []
    return tables[name]
  }

  function handle(req, res, url, rawBody) {
    const asked = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, '').split('/')[0])
    const name = VIEWS[asked] && !(asked in tables) ? VIEWS[asked] : asked
    const claims = claimsOf(req)
    if (!claims || claims.role !== 'authenticated') {
      return send(res, 401, { code: 'PGRST301', message: 'stub: this app reads and writes as the signed-in person only' })
    }
    const params = [...url.searchParams.entries()]
    const prefer = String(req.headers.prefer || '')
    const wantsObject = String(req.headers.accept || '').includes('application/vnd.pgrst.object+json')
    const rows = table(name)

    if (req.method === 'GET' || req.method === 'HEAD') {
      let found = rows.filter((r) => matches(r, params))
      const total = found.length
      found = sortRows(found, url.searchParams.get('order'))
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined
      found = found.slice(offset, limit === undefined ? undefined : offset + limit)
      const out = project(clone(found), url.searchParams.get('select'))
      const headers = {}
      if (/count=(exact|planned|estimated)/.test(prefer)) {
        headers['content-range'] = (out.length ? `${offset}-${offset + out.length - 1}` : '*') + '/' + total
      }
      if (req.method === 'HEAD') return send(res, 200, undefined, headers)
      if (wantsObject) {
        if (out.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
        return send(res, 200, out[0], headers)
      }
      return send(res, 200, out, headers)
    }

    let body = null
    try {
      body = rawBody ? JSON.parse(rawBody) : null
    } catch {
      return send(res, 400, { message: 'stub: body is not JSON' })
    }
    const representation = /return=representation/.test(prefer)

    if (req.method === 'PATCH') {
      const hit = rows.filter((r) => matches(r, params))
      if (CHECKS[name] && hit.some((r) => !CHECKS[name]({ ...r, ...body }))) return send(res, 400, { code: '23514', message: `new row for relation "${name}" violates a check constraint` })
      const clashP = (UNIQUE[name] || []).find((c) => body && body[c] !== undefined && body[c] !== null && rows.some((r) => !hit.includes(r) && r[c] === body[c]))
      if (clashP) return send(res, 409, { code: '23505', message: `duplicate key value violates unique constraint (${name}.${clashP})` })
      for (const r of hit) Object.assign(r, body)
      const out = project(clone(hit), url.searchParams.get('select'))
      if (!representation) return send(res, 204)
      return wantsObject ? send(res, 200, out[0] ?? null) : send(res, 200, out)
    }

    if (req.method === 'POST') {
      const list = Array.isArray(body) ? body : [body]
      const key = url.searchParams.get('on_conflict') || KEYS[name] || 'id'
      const merge = /resolution=merge-duplicates/.test(prefer)
      const ignore = /resolution=ignore-duplicates/.test(prefer)
      const written = []
      for (const item of list) {
        const row = { ...item }
        if (CHECKS[name] && !CHECKS[name](row)) return send(res, 400, { code: '23514', message: `new row for relation "${name}" violates a check constraint` })
        if (key === 'id' && row.id === undefined) row.id = UUID_IDS.has(name) ? randomUUID() : `stub-${name}-${seq++}`
        if (row.created_at === undefined && name !== 'ai_settings') row.created_at = new Date().toISOString()
        const existing = row[key] !== undefined ? rows.find((r) => r[key] === row[key]) : undefined
        const clash = (UNIQUE[name] || []).find((c) => row[c] !== undefined && row[c] !== null && rows.some((r) => r !== existing && r[c] === row[c]))
        if (clash) return send(res, 409, { code: '23505', message: `duplicate key value violates unique constraint (${name}.${clash})` })
        if (existing) {
          if (ignore) continue
          if (!merge) return send(res, 409, { code: '23505', message: `duplicate key value violates unique constraint (${name}.${key})` })
          Object.assign(existing, row)
          written.push(existing)
        } else {
          const fresh = DEFAULTS[name] ? { ...DEFAULTS[name](), ...row } : row
          rows.push(fresh)
          written.push(fresh)
        }
      }
      const out = project(clone(written), url.searchParams.get('select'))
      if (!representation) return send(res, 201)
      return wantsObject ? send(res, 201, out[0] ?? null) : send(res, 201, out)
    }

    if (req.method === 'DELETE') {
      const keep = []
      const gone = []
      for (const r of rows) (matches(r, params) && (!DELETABLE[name] || DELETABLE[name](r)) ? gone : keep).push(r)
      tables[name] = keep
      if (!representation) return send(res, 204)
      return send(res, 200, project(clone(gone), url.searchParams.get('select')))
    }

    return send(res, 405, { message: 'stub: method not supported' })
  }

  return {
    handle,
    /** Back to the starting tables. */
    reset() {
      tables = clone(initial())
    },
    /** Replace some tables (a test's own rows). */
    seed(partial) {
      for (const [name, rows] of Object.entries(partial || {})) tables[name] = clone(rows)
    },
    dump(name) {
      return name ? clone(table(name)) : clone(tables)
    },
    /** Changes one row by id, as a workflow with its own credentials does. */
    patch(name, id, fields) {
      const row = table(name).find((r) => String(r.id) === String(id))
      if (row) Object.assign(row, fields)
      return !!row
    },
  }
}
