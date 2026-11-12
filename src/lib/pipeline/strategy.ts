// The strategy read on Ad Testing (nwTsReadHtml, nwTsReadCard and nwTsReadsHtml as v107 left them, with v98's
// reference chips, v106's Remember and v113's daily read in the current dashboard): what Engine 3 · Strategy Insights
// wrote (agent_outputs strategy_insights), each [CODE] in its text as a chip naming what it read, where each source
// opens, what it read, a read started and waited for, and the remembered list (ai_settings e3_prefs.memory) with the
// house rules made from it (ai_rules source profile:memory). Pure: the page, the server and the tests use it.

import { arr, json } from './intel'
import { dayText } from './ad-testing'

export type Ref = { kind: string; label: string; runId: string; id: string; which: string }
export type Rec = { title: string; why: string; angle: string; evidence: string[]; start: string; format: string; priority: string }
export type Read = {
  id: string
  runId: string
  title: string
  createdAt: string
  focus: string
  requestedBy: string
  daily: boolean
  flags: string[]
  headline: string
  summary: string
  visionRead: string
  gaps: string[]
  missing: string[]
  recs: Rec[]
  doubleDown: string[]
  changeOrStop: string[]
  contentMix: string
  refs: Record<string, Ref>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
/** A list the model wrote: strings, or items with a text (v104ReadLines reads both). */
function strs(v: unknown): string[] {
  return arr(v)
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? str((x as Record<string, unknown>).text) || str((x as Record<string, unknown>).point) : ''))
    .map((s) => s.trim())
    .filter(Boolean)
}

/** A strategy read row as the page uses it; its data may be kept as a string. */
export function readOf(row: Record<string, unknown>): Read {
  const d = json(row.data)
  const I = json(d.insights)
  const vf = json(I.vision_fit)
  const refs: Record<string, Ref> = {}
  for (const [k, v] of Object.entries(json(d.refs))) {
    const r = json(v)
    refs[k] = { kind: str(r.kind), label: str(r.label), runId: str(r.run_id), id: str(r.id), which: str(r.which) }
  }
  const recs = arr(I.recommendations)
    .map((x) => json(x))
    .map((r) => ({
      title: str(r.title),
      why: str(r.why),
      angle: str(r.angle),
      evidence: strs(r.evidence),
      start: str(r.start),
      format: str(r.format),
      priority: str(r.priority),
    }))
    .filter((r) => r.title)
  return {
    id: String(row.id ?? ''),
    runId: str(row.run_id),
    title: str(row.title),
    createdAt: str(row.created_at),
    focus: str(d.focus),
    requestedBy: str(d.requested_by),
    daily: d.daily === true || d.daily === 'true',
    flags: strs(d.review_flags),
    headline: str(I.headline),
    summary: str(I.summary),
    visionRead: str(vf.read),
    gaps: strs(vf.gaps),
    missing: strs(I.missing),
    recs,
    doubleDown: strs(I.double_down),
    changeOrStop: strs(I.change_or_stop),
    contentMix: str(I.content_mix),
    refs,
  }
}

/** The line over a read: its day, then who asked; the read n8n makes each morning says so (v113). */
export function readLine(r: Read, now: number, timeZone?: string): string {
  return 'Strategy read · ' + dayShort(r.createdAt, now, timeZone) + (r.daily ? ' · Daily read' : r.requestedBy ? ' · asked by ' + r.requestedBy.split('@')[0] : '')
}
/** A day as nwDay writes it: "9 Nov", with the year when it is not this one. */
export function dayShort(v: string, now: number, timeZone?: string): string {
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00Z' : v)
  if (Number.isNaN(t.getTime())) return ''
  return dayText(v, t.getUTCFullYear() !== new Date(now).getUTCFullYear(), timeZone)
}

// ---------- the codes in the text ----------

const CODE = /\[([A-Z]{1,2}\d{0,3})\]/g
/** What a code reads as in the text (v98RefShort). */
export function refShort(code: string, r: Ref): string {
  if (code === 'OB') return 'Organic brief'
  if (code === 'AB') return 'Ad brief'
  const k = code.charAt(0)
  const dm = r.label.match(/\d{4}-\d{2}-\d{2}/)
  if (k === 'C') return 'Campaign' + (dm ? ' ' + dayText(dm[0]) : '')
  if (k === 'D') return 'Draft'
  if (k === 'L') return 'Library'
  if (k === 'I') return 'Idea'
  if (k === 'R') return /^Ad /.test(r.label) ? 'Ad result' : 'Post result'
  return code
}
/** Its whole name, with readable days (v98RefLabel). */
export const refLabel = (r: Ref) => r.label.replace(/\d{4}-\d{2}-\d{2}/g, (m) => dayText(m, true))

export type Part = { text: string } | { code: string; short: string; label: string }
/**
 * A text from the read as plain parts and chips (v98Txt): a code it knows becomes a chip, one it does not is left
 * out, and no space is left before a full stop or a comma.
 */
export function parts(s: string, refs: Record<string, Ref>): Part[] {
  const kept: { code: string; r: Ref }[] = []
  const marked = String(s || '')
    .replace(/\u0000/g, '')
    .replace(CODE, (_m, c: string) => {
      const r = refs[c]
      if (!r) return ''
      kept.push({ code: c, r })
      return '\u0000' + (kept.length - 1) + '\u0000'
    })
    .replace(/\s+([.,;:])/g, '$1')
  const out: Part[] = []
  marked.split(/\u0000(\d+)\u0000/).forEach((p, i) => {
    if (i % 2 === 0) {
      if (p) out.push({ text: p })
    } else {
      const k = kept[Number(p)]
      out.push({ code: k.code, short: refShort(k.code, k.r), label: refLabel(k.r) })
    }
  })
  return out
}
/** The text without its codes (v106ReadPlain), for what is remembered. */
export const plain = (s: string) =>
  String(s || '')
    .replace(/\s*\[[A-Z]{1,2}\d{0,3}\]/g, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

/** A recommendation's sources, by the codes it names (nwTsRefBtns). */
export function evidenceOf(r: Rec, refs: Record<string, Ref>): { code: string; ref: Ref }[] {
  const out: { code: string; ref: Ref }[] = []
  for (const e of r.evidence) {
    const code = e.replace(/[[\]\s]/g, '')
    if (refs[code] && !out.some((x) => x.code === code)) out.push({ code, ref: refs[code] })
  }
  return out
}

/**
 * Where a source opens (v98RefGo): a brief on the briefs page, a result on Results, a draft on Content Transformation's
 * Drafts (at that draft), a library piece or an idea on its Ideas, and a campaign on Marketing Generation, still in the
 * current dashboard.
 */
export type Go = { href: string } | { legacy: string } | { tab: 'results' }
export function refGo(r: Ref): Go {
  if (r.kind === 'brief') {
    const ads = r.which === 'paid'
    const q = new URLSearchParams()
    if (ads) q.set('tab', 'ads')
    if (r.runId) q.set('run', r.runId)
    const s = q.toString()
    return { href: '/briefs' + (s ? '?' + s : '') }
  }
  if (r.kind === 'campaign') return { legacy: 'marketing-generation' }
  if (r.kind === 'result') return { tab: 'results' }
  if (r.kind === 'draft' && r.id) return { href: '/content-transformation?tab=drafts&draft=' + encodeURIComponent(r.id) }
  return { href: '/content-transformation?tab=ideas' }
}

/** What a recommendation is made in (v98Make): a campaign or an ad on Marketing Generation, anything else on Content Transformation. */
export const makeIn = (r: Rec) => (r.start === 'marketing' || r.format === 'ad' ? 'marketing-generation' : 'content-transformation')
export const PRIORITY: Record<string, string> = { now: 'Now', next: 'Next', later: 'Later' }
export const FORMAT: Record<string, string> = { thought_leadership: 'Thought leadership', ad: 'Paid ad', newsletter: 'Newsletter', email: 'Email' }
export const formatName = (f: string) => FORMAT[f] || f || 'Content'

/** The gaps column: the vision fit's gaps, else what is missing; what is missing shows apart only when both are given. */
export const gapsOf = (r: Read) => (r.gaps.length ? r.gaps : r.missing)
export const sharpenOf = (r: Read) => (r.gaps.length && r.missing.length ? r.missing : [])
export const hasMore = (r: Read) => !!(r.doubleDown.length || r.changeOrStop.length || r.contentMix || sharpenOf(r).length)

// ---------- what it read ----------

export type Reads = { voice: boolean; ctx: boolean; camps: number; drafts: number; lib: number; ideas: number; posts: number; ads: number; ob: string; ab: string }
export type Chip = { label: string; value: string; ok: boolean; go: Go }
/** The chips over New read, in the current dashboard's order (nwTsReadsHtml). */
export function chips(R: Reads, now: number, timeZone?: string): Chip[] {
  const briefs = [R.ob ? 'organic ' + dayShort(R.ob, now, timeZone) : '', R.ab ? 'ads ' + dayShort(R.ab, now, timeZone) : ''].filter(Boolean).join(', ')
  return [
    { label: 'Voice', value: R.voice ? 'set' : 'not set', ok: R.voice, go: { legacy: 'company-profile' } },
    { label: 'Offer and context', value: R.ctx ? 'set' : 'not set', ok: R.ctx, go: { legacy: 'company-profile' } },
    { label: 'Campaigns', value: String(R.camps), ok: true, go: { legacy: 'marketing-generation' } },
    { label: 'Drafts', value: String(R.drafts), ok: true, go: { href: '/content-transformation?tab=drafts' } },
    { label: 'Library', value: String(R.lib), ok: true, go: { href: '/content-transformation?tab=ideas' } },
    { label: 'Open ideas', value: String(R.ideas), ok: true, go: { href: '/content-transformation?tab=ideas' } },
    { label: 'Post results', value: String(R.posts), ok: R.posts > 0, go: { tab: 'results' } },
    { label: 'Ad results', value: String(R.ads), ok: R.ads > 0, go: { tab: 'results' } },
    { label: 'Briefs', value: briefs || 'none yet', ok: !!briefs, go: { href: '/briefs' } },
  ]
}
/** Whether the offer and context are set (v98Ctx): an offer, what makes the firm different, or claims to avoid. */
export function ctxSet(v: unknown): boolean {
  const c = json(v)
  return !!(str(c.offer) || str(c.differentiator) || str(c.avoid_claims))
}

// ---------- a read started and waited for ----------

/** A read started from the dashboard, kept for the team in ai_settings strategy_runs. */
export type Run = { runId: string; t: number; by: string; focus: string }
export const RUN_KEY = 'strategy_runs'
/** How long a read is waited for before the page says it is taking longer (v98InsPoll), and how long that is said. */
export const WAIT_MS = 5 * 60e3
export const SLOW_MS = 30 * 60e3

export function runsOf(v: unknown): Run[] {
  return arr(json(v).runs)
    .map((x) => json(x))
    .map((r) => ({ runId: str(r.run_id), t: Number(r.t) || 0, by: str(r.by), focus: str(r.focus) }))
    .filter((r) => r.runId && r.t)
}
/** The list kept after a new run: the newest first, a day of them. */
export function runsWith(old: Run[], run: Run, now: number) {
  return [run, ...old.filter((r) => r.runId !== run.runId && now - r.t < 864e5)].slice(0, 20).map((r) => ({ run_id: r.runId, t: r.t, by: r.by, focus: r.focus }))
}

/** What became of a run: its read, or the note n8n saved when it could not make one. */
export type Outcome = { runId: string; ok: boolean; error: string }
export type RunState = { st: 'running'; run: Run } | { st: 'slow'; run: Run } | { st: 'failed'; run: Run; error: string } | null
/**
 * Where the newest run started from the dashboard stands: running for five minutes, then taking longer than usual
 * for half an hour; one that failed says why for half an hour; one that finished, or older, says nothing.
 */
export function runState(runs: Run[], outcomes: Outcome[], now: number): RunState {
  const run = runs.reduce<Run | null>((a, r) => (!a || r.t > a.t ? r : a), null)
  if (!run) return null
  const o = outcomes.find((x) => x.runId === run.runId)
  const age = now - run.t
  if (o) return !o.ok && age < SLOW_MS ? { st: 'failed', run, error: o.error } : null
  if (age < WAIT_MS) return { st: 'running', run }
  if (age < SLOW_MS) return { st: 'slow', run }
  return null
}
/** The note a run that failed left (v98InsPoll): its error, else its title. */
export function errorOf(row: Record<string, unknown>): string {
  const d = json(row.data)
  return str(d.error) || str(row.title) || 'The strategy read did not finish. Try again.'
}
export const SLOW_TEXT = 'This is taking longer than usual. It may still finish, so check back in a few minutes.'

/** "Started 3 minutes ago" (v98Ago). */
export function startedAgo(t: number, now: number): string {
  const m = Math.round((now - t) / 60000)
  return m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m + ' minutes ago'
}

// ---------- remembered for every run ----------

export type Mem = { id: string; text: string; at: string; by: string }
export type MemKind = 'dd' | 'cs'
export const memId = (readId: string, k: MemKind, i: number) => 'read:' + readId + ':' + k + ':' + i
/** A long text cut at a word with an ellipsis (v97Clip). */
export function clipWord(t0: string, n: number): string {
  const t = String(t0 || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t
}
/** What is remembered from a line of the read (v106Remember). */
export function memItem(r: Read, k: MemKind, i: number, by: string, at: string): Mem | null {
  const t = plain((k === 'dd' ? r.doubleDown : r.changeOrStop)[i] ?? '')
  if (!t) return null
  return { id: memId(r.id, k, i), text: clipWord((k === 'dd' ? 'Double down: ' : 'Change or stop: ') + t, 300), at, by }
}
/** The remembered list as stored (v104Prefs): items with a text. */
export function memOf(v: unknown): Mem[] {
  return arr(json(v).memory)
    .map((x) => json(x))
    .filter((m) => str(m.text))
    .map((m) => ({ id: str(m.id), text: str(m.text), at: str(m.at), by: str(m.by) }))
}
/** The list with an item put first (once), forty at most (v104MemSave). */
export const memWith = (mem: Mem[], item: Mem) => [item, ...mem.filter((m) => m.id !== item.id)].slice(0, 40)

/** A text tidied for a rule (v104Tidy): one line, no full stop or comma at the end. */
export const tidy = (t: string) =>
  String(t || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.;,]+$/, '')
/** A list as few rules as fit, each under `max` characters (v104Chunk). */
export function chunk(prefix: string, items: string[], max = 900): string[] {
  const out: string[] = []
  let cur = ''
  for (const t of items.map(tidy).filter(Boolean)) {
    const add = (cur ? '; ' : '') + t
    if (cur && (prefix + cur + add + '.').length > max) {
      out.push(prefix + cur + '.')
      cur = t
    } else cur += add
  }
  if (cur) out.push(prefix + cur + '.')
  return out
}
/** The house rules the remembered list becomes, for the post writer (v104RulesSync with v104MemSave's words). */
export const MEM_SOURCE = 'profile:memory'
export const memRules = (mem: Mem[]) =>
  chunk(
    'The team asked to remember: ',
    mem.map((m) => m.text),
  )
    .map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 2000))
    .filter((t) => t.length > 2)

export const INFO_INS = {
  title: 'What the strategy read looks at',
  body: [
    'It reads your voice and context, your library, drafts and campaigns, the ideas you saved and the results you logged. Then it recommends what to make next, in line with your mission and offer.',
    'It works with what is here now and gets sharper as you log results and save ideas. Nothing is published.',
  ],
}
