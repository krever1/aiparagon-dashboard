// Import a CSV on Ad Testing (v106 in the current dashboard): a file of ads or posts with their numbers (an export
// from Meta, LinkedIn or a spreadsheet), or a CRM export with one row per lead, counted by ad. The file is read in the
// browser; which column holds what is guessed from the headers and can be changed; numbers and dates are read the way
// the file writes them; each row becomes a new result or updates one already logged (same kind and name, the same
// platform and day when both say). Pure: the window, the server and the tests all use it.

export type Mode = 'rows' | 'leads'
export type Kind = 'ad' | 'post'
export type Stage = 'lead' | 'qualified' | 'booked' | 'won' | 'skip'
export type Field = readonly [key: string, label: string, names: readonly string[]]

/** The columns a results file can have, and the names exports give them (V106_F). */
export const F_ROWS: readonly Field[] = [
  ['title', 'Name of the ad or post', ['ad or post', 'ad name', 'ad', 'post', 'title', 'name', 'creative', 'creative name', 'headline', 'hook', 'campaign name', 'campaign']],
  ['kind', 'Ad or post', ['kind', 'type']],
  ['platform', 'Where', ['where', 'platform', 'channel', 'network', 'placement', 'publisher platform']],
  ['posted_on', 'Date', ['date', 'posted on', 'posted', 'day', 'reporting starts', 'start date', 'starts', 'published', 'date posted']],
  ['period_end', 'End date', ['reporting ends', 'end date', 'ends']],
  ['spend', 'Spend', ['spend', 'amount spent', 'amount spent usd', 'total spent', 'cost', 'spent']],
  ['impressions', 'Impressions', ['impressions', 'impr']],
  ['clicks', 'Clicks', ['clicks', 'link clicks', 'clicks all', 'outbound clicks']],
  ['leads', 'Leads', ['leads', 'results', 'form submissions', 'lead form submissions', 'on facebook leads', 'conversions']],
  ['qualified', 'Qualified leads', ['qualified leads', 'qualified', 'sqls', 'sql', 'mqls', 'mql']],
  ['bookings', 'Booked calls', ['booked calls', 'bookings', 'booked', 'meetings booked', 'meetings', 'calls booked', 'appointments']],
  ['won', 'Clients won', ['clients won', 'won', 'deals won', 'closed won', 'new clients']],
  ['revenue', 'Revenue', ['revenue', 'revenue usd', 'deal value', 'closed won amount', 'amount won']],
  ['reactions', 'Reactions', ['reactions', 'likes', 'post reactions']],
  ['comments', 'Comments', ['comments']],
  ['shares', 'Shares', ['shares', 'reposts']],
  ['url', 'Link', ['link', 'url', 'permalink', 'post url']],
  ['notes', 'Notes', ['notes', 'note']],
]

/** The columns of a CRM export of leads (V106_FL). */
export const F_LEADS: readonly Field[] = [
  [
    'title',
    'Ad or campaign',
    ['ad name', 'ad', 'utm content', 'campaign name', 'campaign', 'utm campaign', 'original source drill down 2', 'original source drill down 1', 'source', 'lead source'],
  ],
  ['stage', 'Stage', ['lifecycle stage', 'stage', 'deal stage', 'lead status', 'status']],
  ['posted_on', 'Date', ['create date', 'created', 'date', 'created at']],
]

/** What a lead's stage counts as (V106_ST); a booked call also counts as qualified. */
export const STAGES: readonly (readonly [Stage, string])[] = [
  ['lead', 'Lead'],
  ['qualified', 'Qualified'],
  ['booked', 'Booked a call'],
  ['won', 'Became a client'],
  ['skip', 'Leave out'],
]

export const NUMS = ['spend', 'impressions', 'clicks', 'leads', 'qualified', 'bookings', 'won', 'revenue', 'reactions', 'comments', 'shares'] as const
export type NumKey = (typeof NUMS)[number]
const AD_ONLY: readonly string[] = ['spend', 'leads', 'qualified', 'bookings', 'won', 'revenue']
/** The columns the window offers for the mode and kind: a file of posts has no ad numbers. */
export const fieldsFor = (mode: Mode, kind: Kind) => (mode === 'leads' ? F_LEADS : F_ROWS.filter((f) => kind === 'ad' || !AD_ONLY.includes(f[0])))

export const MAX_ROWS = 5000
export const MAX_STAGES = 40
export const MAX_BYTES = 3 * 1024 * 1024

/** A header as words (v106Norm): lowercase, no bracketed parts, no punctuation. */
export const norm = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Comma, semicolon or tab separated, by what the first lines use most; a quote only opens at the start of a field (v106Csv). */
export function parseCsv(text: string): { rows: string[][]; delim: string } {
  const t = String(text || '').replace(/^﻿/, '')
  const head = t
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 8)
    .join('\n')
  const cnt = (c: string) => head.split(c).length - 1
  const d = cnt('\t') > cnt(',') && cnt('\t') >= cnt(';') ? '\t' : cnt(';') > cnt(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let f = ''
  let q = false
  let more = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          f += '"'
          i++
        } else q = false
      } else f += c
      continue
    }
    if (c === '"' && f === '') {
      q = true
      continue
    }
    if (c === d) {
      row.push(f)
      f = ''
      continue
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(f)
      f = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      if (rows.length > MAX_ROWS + 20) {
        more = true
        break
      }
      continue
    }
    f += c
  }
  if (!more) {
    row.push(f)
    if (row.some((x) => x.trim())) rows.push(row)
  }
  return { rows: rows.map((r) => r.map((x) => x.trim())), delim: d }
}

/** Which column holds what, from the headers (v106Guess): an exact name first, then a long name inside a header. */
export function guess(head: string[], F: readonly Field[]): Record<string, number> {
  const H = head.map(norm)
  const map: Record<string, number> = {}
  const used = new Set<number>()
  for (const f of F) {
    let k = -1
    for (const s of f[2]) {
      const i = H.findIndex((h, j) => !used.has(j) && h === s)
      if (i >= 0) {
        k = i
        break
      }
    }
    if (k < 0) {
      for (const s of f[2]) {
        if (s.length < 5) continue
        const i = H.findIndex((h, j) => !used.has(j) && h.includes(s))
        if (i >= 0) {
          k = i
          break
        }
      }
    }
    if (k >= 0) {
      map[f[0]] = k
      used.add(k)
    }
  }
  return map
}

/** The header is the first line that names two columns we know; an export can open with lines about the report. */
export function headAt(R: string[][]): number {
  for (let i = 0; i < Math.min(R.length, 15); i++) {
    if (Math.max(Object.keys(guess(R[i], F_ROWS)).length, Object.keys(guess(R[i], F_LEADS)).length) >= 2) return i
  }
  return 0
}

/** Whether a column writes decimals with a comma ("1.250,50"), by what most of it does (v106DecComma). */
export function decComma(vals: string[], delim: string): boolean {
  let c = 0
  let p = 0
  for (const v0 of vals) {
    const v = String(v0 || '').trim()
    if (/\d,\d{1,2}(?!\d)\D*$/.test(v)) c++
    else if (/\d\.\d{1,2}(?!\d)\D*$/.test(v)) p++
  }
  return c > p ? true : p > c ? false : delim === ';'
}

/** A number as the file writes it: "$1,250.50", "1.250,50 €" or "18.000" (v106Num). */
export function parseNum(s0: string, dc: boolean): number | null {
  const s = String(s0 || '').trim()
  if (!s) return null
  let t = s.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(t)) return null
  t = dc ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Whether a column writes the day first (20/09/2026), by what most of it does (v106DayFirst). */
export function dayFirst(vals: string[]): boolean {
  let df = 0
  let mf = 0
  for (const v of vals) {
    const s = String(v || '').trim()
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s)
    if (!m) continue
    if (+m[1] > 12) df++
    else if (+m[2] > 12) mf++
    else if (s.includes('.')) df++
  }
  return df > mf
}

function ymd(y: number, mo: number, d: number, today: string): string | null {
  const x = new Date(Date.UTC(y, mo - 1, d))
  if (!(y > 1999 && y < 2100) || x.getUTCMonth() !== mo - 1 || x.getUTCDate() !== d) return null
  const s = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  return s > today ? null : s
}

/** A day as the file writes it: 2026-09-20, 09/20/2026, 20.09.2026 or "Sep 20, 2026"; never a day after today (v106Day). */
export function parseDay(s0: string, df: boolean, today: string): string | null {
  const s = String(s0 || '').trim()
  if (!s) return null
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return ymd(+m[1], +m[2], +m[3], today)
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?!\d)/.exec(s)
  if (m) {
    let y = +m[3]
    if (y < 100) y += 2000
    return df ? ymd(y, +m[2], +m[1], today) : ymd(y, +m[1], +m[2], today)
  }
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(s) && /\b\d{4}\b/.test(s)) {
    const t = Date.parse(s)
    if (!Number.isNaN(t)) {
      const x = new Date(t)
      return ymd(x.getFullYear(), x.getMonth() + 1, x.getDate(), today)
    }
  }
  return null
}

/** What a stage's name most likely means (v106StageGuess): a lost or bad fit is only a lead (a curly apostrophe too). */
export function stageGuess(v: string): Stage {
  const s = String(v || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
  if (!s) return 'lead'
  if (/unqual|disqual|not (a )?(fit|qualified|interested)|bad fit|junk|spam|\blost\b|no answer|no show|no-show|cancel|won'?t|\bwont\b|declin|unresponsive|not now/.test(s))
    return 'lead'
  if (/\bwon\b|customer|client|signed|evangelist/.test(s)) return 'won'
  if (/meeting|booked|appointment|demo|call (scheduled|booked)|scheduled|consult/.test(s)) return 'booked'
  if (/qualif|\bsql\b|\bmql\b|opportunit|good fit|interested/.test(s)) return 'qualified'
  return 'lead'
}

// ---------- what the import writes ----------

/** A result already logged, as the import matches against it. */
export type Existing = { id: string; kind: Kind; title: string; platform: string; postedOn: string; periodStart: string }
const startOf = (r: Existing) => r.postedOn || r.periodStart || ''

/** The results a row could update (v106Cands): same kind, same name, the same platform when both say. */
export function cands(ex: Existing[] | Map<string, Existing[]>, kind: Kind, title: string, platform: string): Existing[] {
  const t = title.trim().toLowerCase()
  const p = platform.trim().toLowerCase()
  const pool = ex instanceof Map ? (ex.get(kind + '|' + t) ?? []) : ex.filter((r) => r.kind === kind && r.title.trim().toLowerCase() === t)
  return pool.filter((r) => !p || !r.platform || r.platform.trim().toLowerCase() === p)
}
/** The results logged, by kind and name, so a big file is matched without reading them all for every row. */
function byName(ex: Existing[]): Map<string, Existing[]> {
  const m = new Map<string, Existing[]>()
  for (const r of ex) {
    const k = r.kind + '|' + r.title.trim().toLowerCase()
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}

export type ImportState = { mode: Mode; kind: Kind; rows: string[][]; map: Record<string, number>; stages: Record<string, Stage>; delim: string }
export type ImportRow = {
  kind: Kind
  title: string
  platform: string | null
  posted_on: string | null
  period_end: string | null
  url: string | null
  notes: string | null
  match: string | null
  matchDay: string | null
} & Partial<Record<NumKey, number | null>>

/** The stage values of a CRM file, in the order they first appear; the window names the first forty. */
export function stageValues(I: ImportState): string[] {
  const k = I.map.stage
  if (k === undefined) return []
  const out: string[] = []
  for (const r of I.rows) {
    const v = String(r[k] ?? '').trim()
    if (!out.includes(v)) out.push(v)
  }
  return out
}

/**
 * What the import will write (v106ImpRows): one result per ad or post in the file (the same ad on the same day and
 * platform twice, as two ad sets, added together), or per ad counted from the leads; each matched to a result already
 * logged, each logged result at most once.
 */
export function importRows(I: ImportState, ex0: Existing[], today: string): ImportRow[] {
  const M = I.map
  if (M.title === undefined) return []
  const ex = byName(ex0)
  const cell = (r: string[], f: string) => (M[f] !== undefined ? String(r[M[f]] ?? '').trim() : '')
  const col = (f: string) => (M[f] !== undefined ? I.rows.map((r) => String(r[M[f]] ?? '')) : [])
  const df = dayFirst(col('posted_on').concat(col('period_end')))
  if (I.mode === 'leads') {
    const T: Record<string, ImportRow & { leads: number; qualified: number; bookings: number; won: number }> = {}
    const order: string[] = []
    for (const r of I.rows) {
      const t = cell(r, 'title')
      if (!t) continue
      const st: Stage = M.stage !== undefined ? (I.stages[cell(r, 'stage')] ?? 'lead') : 'lead'
      if (st === 'skip') continue
      const d = parseDay(cell(r, 'posted_on'), df, today)
      const C = cands(ex, 'ad', t, '')
      let m: Existing | null = null
      if (C.length === 1) m = C[0]
      else if (C.length > 1) {
        const dated = C.filter((x) => startOf(x)).sort((a, b) => (startOf(a) < startOf(b) ? -1 : 1))
        if (d) {
          const pre = dated.filter((x) => startOf(x) <= d)
          m = pre.length ? pre[pre.length - 1] : (dated[0] ?? C[0])
        } else m = dated.length ? dated[dated.length - 1] : C[0]
      }
      const key = m ? 'id:' + m.id : 'new:' + t.toLowerCase()
      if (!T[key]) {
        T[key] = {
          kind: 'ad', title: m ? m.title : t.slice(0, 200), platform: null, posted_on: null, period_end: null, url: null, notes: null,
          match: m ? m.id : null, matchDay: m ? startOf(m) || null : null, leads: 0, qualified: 0, bookings: 0, won: 0,
        }
        order.push(key)
      }
      const x = T[key]
      x.leads++
      if (st === 'qualified' || st === 'booked' || st === 'won') x.qualified++
      if (st === 'booked' || st === 'won') x.bookings++
      if (st === 'won') x.won++
      if (!m && d && (!x.posted_on || d < x.posted_on)) x.posted_on = d
    }
    return order.map((k) => T[k])
  }
  const dc: Record<string, boolean> = {}
  for (const f of NUMS) dc[f] = decComma(col(f), I.delim)
  const num = (r: string[], f: NumKey) => {
    const n = parseNum(cell(r, f), dc[f])
    if (n === null || n < 0) return null
    return f === 'spend' || f === 'revenue' ? Math.round(n * 100) / 100 : Math.round(n)
  }
  const by: Record<string, ImportRow> = {}
  const order: string[] = []
  for (const r of I.rows) {
    const t = cell(r, 'title')
    if (!t) continue
    const kv = norm(cell(r, 'kind'))
    const kind: Kind = M.kind !== undefined && kv ? (/^(ad|ads|paid|sponsored|promoted)\b/.test(kv) ? 'ad' : 'post') : I.kind
    const url = cell(r, 'url')
    const o: ImportRow = {
      kind,
      title: t.slice(0, 200),
      platform: cell(r, 'platform').slice(0, 60) || null,
      posted_on: parseDay(cell(r, 'posted_on'), df, today),
      period_end: parseDay(cell(r, 'period_end'), df, today),
      url: /^https?:\/\//i.test(url) ? url.slice(0, 500) : null,
      notes: cell(r, 'notes').slice(0, 600) || null,
      match: null,
      matchDay: null,
    }
    for (const f of NUMS) o[f] = num(r, f)
    if (o.kind !== 'ad') for (const f of AD_ONLY) o[f as NumKey] = null
    if (!NUMS.some((f) => o[f] !== null && o[f] !== undefined)) continue
    const k = [o.kind, o.title.toLowerCase(), String(o.platform || '').toLowerCase(), o.posted_on || ''].join('|')
    if (!by[k]) {
      by[k] = o
      order.push(k)
      continue
    }
    for (const f of NUMS) if (o[f] !== null && o[f] !== undefined) by[k][f] = Math.round(((by[k][f] ?? 0) + (o[f] as number)) * 100) / 100
  }
  const out = order.map((k) => by[k])
  const used = new Set<string>()
  for (const o of out) {
    const C = cands(ex, o.kind, o.title, o.platform || '').filter((r) => !used.has(r.id))
    let m: Existing | null = null
    if (o.posted_on) {
      m = C.find((r) => startOf(r) === o.posted_on) ?? null
      if (!m) {
        const nd = C.filter((r) => !startOf(r))
        if (nd.length === 1) m = nd[0]
      }
    } else if (C.length === 1) m = C[0]
    o.match = m ? m.id : null
    o.matchDay = m ? startOf(m) || null : null
    if (m) used.add(m.id)
  }
  return out
}

// ---------- the window ----------

export type FileRead =
  | { ok: true; head: string[]; rows: string[][]; cut: boolean; delim: string; mode: Mode; map: Record<string, number>; stages: Record<string, Stage> }
  | { ok: false; error: string }

/** The columns guessed for the mode, and for a CRM file what each stage most likely means (v106ImpMap). */
export function remap(I: Pick<ImportState, 'mode' | 'rows'> & { head: string[] }): { map: Record<string, number>; stages: Record<string, Stage> } {
  const map = guess(I.head, I.mode === 'leads' ? F_LEADS : F_ROWS)
  const stages: Record<string, Stage> = {}
  if (I.mode === 'leads') for (const v of stageValues({ ...I, map, kind: 'ad', stages: {}, delim: ',' })) stages[v] = stageGuess(v)
  return { map, stages }
}

/**
 * A file's text as the window reads it (v106ImpFile): its header row (the first line naming two columns we know),
 * 5,000 rows at most, and a CRM export (people with a stage, no spend or impressions) read as leads.
 */
export function readFile(text: string): FileRead {
  const { rows: R, delim } = parseCsv(text)
  const h = headAt(R)
  if (R.length - h < 2) return { ok: false, error: 'No rows found. Use a CSV with a header row and at least one row of results.' }
  const head = R[h]
  const rows = R.slice(h + 1, h + 1 + MAX_ROWS)
  const g = guess(head, F_LEADS)
  const gr = guess(head, F_ROWS)
  const mode: Mode = g.stage !== undefined && gr.spend === undefined && gr.impressions === undefined ? 'leads' : 'rows'
  return { ok: true, head, rows, cut: R.length - h - 1 > MAX_ROWS, delim, mode, ...remap({ mode, rows, head }) }
}

export const plural = (n: number, w: string) => n.toLocaleString('en-US') + ' ' + w + (n === 1 ? '' : 's')

// ---------- what the server writes ----------

export const CHUNK = 100
const DAY = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[\w-]{1,64}$/
const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
function day(v: unknown, today: string): string | null {
  if (typeof v !== 'string' || !DAY.test(v) || v > today) return null
  const [y, m, d] = v.split('-').map(Number)
  return ymd(y, m, d, today)
}
function numOk(v: unknown, f: NumKey): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return f === 'spend' || f === 'revenue' ? Math.round(n * 100) / 100 : Math.round(n)
}

/** A row sent from the window, checked again on the server: anything it does not take is left out or refused. */
export function checkRow(o0: unknown, mode: Mode, today: string): ImportRow | null {
  if (!o0 || typeof o0 !== 'object') return null
  const o = o0 as Record<string, unknown>
  const k = o.kind
  const kind: Kind | null = mode === 'leads' ? 'ad' : k === 'ad' ? 'ad' : k === 'post' ? 'post' : null
  if (!kind) return null
  const title = s(o.title, 200)
  if (!title) return null
  const url = s(o.url, 500)
  const r: ImportRow = {
    kind,
    title,
    platform: s(o.platform, 60) || null,
    posted_on: day(o.posted_on, today),
    period_end: mode === 'leads' ? null : day(o.period_end, today),
    url: mode === 'leads' || !/^https?:\/\//i.test(url) ? null : url,
    notes: mode === 'leads' ? null : s(o.notes, 600) || null,
    match: typeof o.match === 'string' && ID.test(o.match) ? o.match : null,
    matchDay: null,
  }
  const keys: readonly NumKey[] = mode === 'leads' ? ['leads', 'qualified', 'bookings', 'won'] : NUMS
  for (const f of NUMS) r[f] = keys.includes(f) ? numOk(o[f], f) : null
  if (kind !== 'ad') for (const f of AD_ONLY) r[f as NumKey] = null
  if (!NUMS.some((f) => r[f] !== null && r[f] !== undefined)) return null
  return r
}

/**
 * What the import writes (v106ImpGo): a new result for a row that matched none (attribution csv, or crm for a CRM
 * file), and for one that matched, only the numbers the file gives (with the end date and link from a results file).
 */
export function dbWrite(rows: ImportRow[], mode: Mode, who: string, now: string): { add: Record<string, unknown>[]; upd: [string, Record<string, unknown>][] } {
  const src = mode === 'leads' ? 'crm' : 'csv'
  const add: Record<string, unknown>[] = []
  const upd: [string, Record<string, unknown>][] = []
  for (const o of rows) {
    if (o.match) {
      const p: Record<string, unknown> = { updated_by: who, updated_at: now, attribution: src }
      const fields: string[] = mode === 'leads' ? ['leads', 'qualified', 'bookings', 'won'] : [...NUMS, 'period_end', 'url']
      for (const f of fields) {
        const v = (o as Record<string, unknown>)[f]
        if (v !== null && v !== undefined) p[f] = v
      }
      upd.push([o.match, p])
    } else {
      add.push({
        kind: o.kind, title: o.title, platform: o.platform || null, url: o.url || null, posted_on: o.posted_on || null, period_start: o.posted_on || null,
        period_end: o.period_end || null, notes: o.notes || null,
        ...Object.fromEntries(NUMS.map((f) => [f, o[f] ?? null])),
        attribution: src, created_by: who, updated_by: who, updated_at: now,
      })
    }
  }
  return { add, upd }
}
