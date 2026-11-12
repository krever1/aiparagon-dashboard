// The brief editor's rules (v111): what an organic or ads brief holds while it is edited, the rows each section lists,
// and what removing or editing a row or a section changes in the brief's markdown, data, snapshot or ads brief fields.
// Plain functions on plain values, so the editor, the server and the tests share them. Every change returns a new
// brief and leaves the old one as it was (the editor keeps the old ones for Undo).

import { type SnapItem, adFallback, orgFallback, snapItems, tldr } from '@/lib/touchpoint/approvals'
import { type Kind, devsOf, mdPlain, shiftsOf } from './briefs'
import { arr, json, num } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const one = (v: unknown) => str(v).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
const copy = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

export type Rev = { hidden: string[]; removed: string[] }
export type Snap = Record<string, unknown> & { items?: unknown }
export type OrgDoc = { md: string; data: Record<string, unknown>; snap: Snap | null; rev: Rev }
/** The ads brief's fields the agents read (V111_CB). */
export const CB_KEYS = ['differentiation_angle', 'winning_hooks', 'copy_formula', 'winning_offers', 'core_pain_points', 'objection_themes', 'cross_niche_sources', 'source_ad_ids'] as const
export type CB = Record<(typeof CB_KEYS)[number], unknown>
export type AdsDoc = { cb: CB; snap: Snap | null; rev: Rev }
export type Doc = OrgDoc | AdsDoc
export type LogEntry = { v: 'removed' | 'edited'; w: string; n: string }

/** An ads brief's fields as the editor holds them: the two texts as text, the lists as lists (v111CbOf). */
export function cbOf(row: Record<string, unknown>): CB {
  const o = {} as CB
  for (const k of CB_KEYS) o[k] = k === 'copy_formula' || k === 'differentiation_angle' ? str(row[k]) : arr(row[k])
  return o
}

/** An organic brief's data as the editor holds it: parsed, without the saved review. */
export function orgDataOf(v: unknown): Record<string, unknown> {
  const d = copy(json(v))
  delete d.review
  return d
}

/** A snapshot as the editor holds it: an object, or null. */
export function snapOf(v: unknown): Snap | null {
  let x = v
  for (let i = 0; i < 2 && typeof x === 'string'; i++) {
    try {
      x = JSON.parse(x)
    } catch {
      return null
    }
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? (copy(x) as Snap) : null
}

export const revOf = (r: { hidden?: string[]; removed?: string[] } | null | undefined): Rev => ({ hidden: [...(r?.hidden ?? [])], removed: [...(r?.removed ?? [])] })

// ---------- the markdown (v111MdDrop, v111MdTidy) ----------

const MDN: Record<string, number> = { short: 1, shift: 3, dev: 4, themes: 5 }
const head = (n: number) => new RegExp('^##\\s*' + n + '\\\\?\\.')
const stop = (l: string) => /^##\s|^---\s*$/.test(l)

/** Three or more line breaks become two, and a "---" right after another goes. */
export function mdTidy(md: string): string {
  const out: string[] = []
  for (const l of md.replace(/\n{3,}/g, '\n\n').split('\n')) {
    if (/^---\s*$/.test(l)) {
      const prev = [...out].reverse().find((x) => x.trim())
      if (prev !== undefined && /^---\s*$/.test(prev)) continue
    }
    out.push(l)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/** "## <n>." taken out, up to the next "## " heading or "---" line, and a "---" right after it. */
export function mdDrop(md: string, n: number): string {
  const lines = md.split('\n')
  const a = lines.findIndex((l) => head(n).test(l))
  if (a < 0) return md
  let z = a + 1
  while (z < lines.length && !stop(lines[z])) z++
  if (z < lines.length && /^---\s*$/.test(lines[z]) && a > 0) z++
  return mdTidy([...lines.slice(0, a), ...lines.slice(z)].join('\n'))
}

/** The lines of "## <n>." (after its heading), as indexes into the markdown's lines. */
function secLines(lines: string[], n: number): number[] {
  const a = lines.findIndex((l) => head(n).test(l))
  if (a < 0) return []
  const out: number[] = []
  for (let i = a + 1; i < lines.length && !stop(lines[i]); i++) out.push(i)
  return out
}

// ---------- the short version: the TL;DR lines (v111TlLines, v111TlLine) ----------

/** The TL;DR's bullet lines, as indexes into the markdown's lines, as tldr() reads them. */
export function tlIdx(md: string): number[] {
  const lines = md.split('\n')
  const i = lines.findIndex((l) => /TL;DR/i.test(l))
  if (i < 0) return []
  const out: number[] = []
  // up to the next section, bullets or not (tldr() reads on into the next section when the TL;DR has none)
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\s*(##|---)/.test(lines[j])) break
    if (/^\s*[-*]\s+/.test(lines[j])) out.push(j)
  }
  return out
}

/** A TL;DR line written again: its bullet kept, "**Lead**: text", and a bold link in its lead kept. */
export function tlLine(raw: string, lead: string, text: string): string {
  const pre = /^(\s*[-*]\s+)/.exec(raw)?.[1] ?? '- '
  const h = one(lead).replace(/[[\]]/g, '')
  const t = one(text)
  if (!h) return pre + t
  const link = /\*\*\[[^\]]*\]\((https?:[^)\s]+)\)\*\*/.exec(raw)
  return pre + (link ? '**[' + h + '](' + link[1] + ')**' : '**' + h + '**') + ': ' + t
}

const tlUrl = (raw: string) => /\]\((https?:[^)\s]+)\)/.exec(raw)?.[1] ?? ''

// ---------- what changed: the shift blocks of "## 3." (v111ShiftBlocks, v111ShiftTxt) ----------

/** Each shift's block in "## 3.", as a range of characters, when they map one to one onto the shifts shown. */
export function shiftBlocks(md: string): { a: number; z: number }[] | null {
  const m = /^##\s*3\\?\.[^\n]*\n/m.exec(md)
  if (!m) return null
  const a0 = m.index + m[0].length
  const rest = md.slice(a0)
  const e = rest.search(/^##\s|^---\s*$/m)
  const body = e >= 0 ? rest.slice(0, e) : rest
  const cuts = [0]
  const re = /\n(?=\s*(?:\*\*)?Shift)/g
  let x: RegExpExecArray | null
  while ((x = re.exec(body))) cuts.push(x.index + 1)
  cuts.push(body.length)
  const blocks: { a: number; z: number }[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const text = body.slice(cuts[i], cuts[i + 1])
    if (shiftsOf('## 3.\n' + text, {}).length === 1) blocks.push({ a: a0 + cuts[i], z: a0 + cuts[i + 1] })
  }
  return blocks.length && blocks.length === shiftsOf(md, {}).length ? blocks : null
}

export function shiftTxt(f: { h: string; obs: string; interp: string; use: string }, who: string, url: string): string {
  const lines = ['**Shift: ' + one(f.h) + '**']
  if (one(f.interp)) lines.push('- ' + one(f.interp))
  if (one(f.obs)) lines.push('- **Evidence:** ' + (url ? '[' + (one(who) || 'Source') + '](' + url + '): ' : '') + one(f.obs))
  if (one(f.use)) lines.push('- **For our content:** ' + one(f.use))
  return lines.join('\n') + '\n'
}

/** The brief's own list of shifts (when "## 3." does not list them): the shown ones' places in it. */
const shiftIdx = (d: Record<string, unknown>) =>
  arr(d.sophistication_shifts)
    .map((x, i) => ({ x: json(x), i }))
    .filter((y) => y.x.note || y.x.summary)
    .map((y) => y.i)

// ---------- notable developments: the lines of "## 4." (v111DevLines, v111DevTxt, v111DevTidy) ----------

/** The development lines of "## 4.", as devsOf reads them, as indexes into the markdown's lines. */
export function devIdx(md: string): number[] {
  const lines = md.split('\n')
  const out: number[] = []
  for (const i of secLines(lines, 4)) {
    const t = lines[i].trim()
    if (!t || /^###\s+/.test(t) || /^\*\*([^*[\]]+)\*\*\s*$/.test(t) || !/^(\*\*|\[)/.test(t)) continue
    if (/^(?:\*\*)?\[([^\]]+)\]\((https?:[^)\s]+)\)/.test(t) || /^\*\*(.+?)\*\*/.test(t)) out.push(i)
  }
  return out
}

export function devTxt(f: { h: string; t: string; why: string }, who: string, url: string): string {
  const h = one(f.h)
  const t = one(f.t)
  const why = one(f.why) ? ' *Why it matters:* ' + one(f.why) : ''
  if (h) return '**' + h + '** · ' + (url ? '[' + (one(who) || 'Source') + '](' + url + '): ' : '') + t + why
  if (url) return '[' + (one(who) || 'Source') + '](' + url + '): ' + t + why
  return '**' + t.slice(0, 60).replace(/\s+\S*$/, '') + '** · ' + t + why
}

/** Group headings with nothing under them go; with no development left, the whole "## 4." goes. */
export function devTidy(md: string): string {
  if (!devIdx(md).length) return mdDrop(md, 4)
  const lines = md.split('\n')
  const sec = secLines(lines, 4)
  const isHead = (l: string) => /^###\s+/.test(l.trim()) || /^\*\*([^*[\]]+)\*\*\s*$/.test(l.trim())
  const devs = new Set(devIdx(md))
  const drop = new Set<number>()
  sec.forEach((i, k) => {
    if (!isHead(lines[i])) return
    let has = false
    for (const j of sec.slice(k + 1)) {
      if (isHead(lines[j])) break
      if (devs.has(j)) has = true
    }
    if (!has) drop.add(i)
  })
  return mdTidy(lines.filter((_, i) => !drop.has(i)).join('\n'))
}

// ---------- the rows each section lists (v111Rows) ----------

export type Row = { h: string; t: string; meta: string; url: string; flag: boolean; fields: Record<string, string>; target?: string }

/** Which rows can be edited and with which fields (V111_FORM): name, label, a long text or not. */
export const FORM: Readonly<Record<string, readonly (readonly [string, string, boolean])[]>> = {
  short: [
    ['h', 'Lead', false],
    ['t', 'What it says', true],
  ],
  five: [
    ['h', 'The point', false],
    ['t', 'What the agent saw', true],
    ['tag', 'Tag', false],
  ],
  shift: [
    ['h', 'The shift', false],
    ['obs', 'What it saw', true],
    ['interp', 'What it means', true],
    ['use', 'How to use it', true],
  ],
  dev: [
    ['h', 'Headline', false],
    ['t', 'What happened', true],
    ['why', 'Why it matters', true],
  ],
  angle: [['t', 'The short version', true]],
  formula: [['t', 'Draft skeleton', false]],
  hook: [['t', 'Hook pattern', true]],
  offer: [
    ['h', 'Offer', false],
    ['price', 'Price shown', false],
    ['t', 'Notes', true],
  ],
  pain: [['t', 'Pain', false]],
  obj: [['t', 'Objection', false]],
  cross: [['t', 'Pattern', false]],
}

const five = (snap: Snap | null, fallback: SnapItem[]): SnapItem[] => (snapItems(snap) ?? fallback).filter((x) => x && x.text).slice(0, 5)

/** An organic brief's rows in a section; the posts come from its evidence (with their record numbers). */
export function orgRows(doc: OrgDoc, k: string, posts: { url: string; who: string; topic: string; type: string; eng: number | null; postId: string }[] = []): Row[] {
  const gone = new Set(doc.rev.removed)
  const flagged = (url: string) => !!url && gone.has(url)
  if (k === 'five')
    return five(doc.snap, orgFallback(doc.md)).map((x) => ({ h: x.text, t: x.why, meta: x.tag, url: '', flag: false, fields: { h: x.text, t: x.why, tag: x.tag } }))
  if (k === 'short') {
    const lines = doc.md.split('\n')
    const parsed = tldr(doc.md)
    return tlIdx(doc.md).map((i, n) => {
      const p = parsed[n] ?? { title: '', text: '' }
      const url = tlUrl(lines[i])
      return { h: p.title, t: p.text, meta: '', url, flag: flagged(url), fields: { h: p.title, t: p.text } }
    })
  }
  if (k === 'shift')
    return shiftsOf(doc.md, doc.data).map((s) => ({
      h: s.title,
      t: s.obs || s.interp,
      meta: s.who,
      url: s.url,
      flag: flagged(s.url),
      fields: { h: s.title, obs: s.obs, interp: s.interp, use: s.use },
    }))
  if (k === 'dev') {
    const devs = devsOf(doc.md)
    if (devs.length !== devIdx(doc.md).length) return []
    return devs.map((d) => ({
      h: d.title || d.who,
      t: d.text,
      meta: [d.cat, d.who].filter(Boolean).join(' · '),
      url: d.url,
      flag: flagged(d.url),
      fields: { h: d.title, t: d.text, why: d.why },
    }))
  }
  if (k === 'post')
    return posts
      .filter((p) => p.url && !gone.has(p.url))
      .map((p, i) => ({
        h: 'O' + (i + 1) + ' · ' + (p.who || 'Post'),
        t: clip(p.topic, 140),
        meta: [p.type, p.eng !== null ? p.eng + ' engagement' : ''].filter(Boolean).join(' · '),
        url: p.url,
        flag: false,
        fields: {},
        target: p.postId || p.url,
      }))
  return []
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s)
const hookText = (h: unknown) => (typeof h === 'string' ? h : str(json(h).pattern || json(h).hook || json(h).text))
const crossText = (x: unknown) => (typeof x === 'string' ? x : Object.values(json(x)).map(str).filter(Boolean).join(' · '))

/** An ads brief's rows in a section; the ads come from its evidence. */
export function adsRows(doc: AdsDoc, k: string, ads: { key: string; adv: string; hook: string; days: number | null; status: string; target: string }[] = []): Row[] {
  const cb = doc.cb
  const plain = (list: unknown, f: (x: unknown) => string = str) =>
    arr(list).map((x) => {
      const t = mdPlain(f(x))
      return { h: '', t, meta: '', url: '', flag: false, fields: { t } }
    })
  if (k === 'afive')
    return five(doc.snap, adFallback({ winning_hooks: cb.winning_hooks, core_pain_points: cb.core_pain_points })).map((x) => ({
      h: x.text,
      t: x.why,
      meta: x.tag,
      url: '',
      flag: false,
      fields: { h: x.text, t: x.why, tag: x.tag },
    }))
  if (k === 'angle') {
    const t = mdPlain(cb.differentiation_angle)
    return t ? [{ h: '', t, meta: '', url: '', flag: false, fields: { t } }] : []
  }
  if (k === 'formula') {
    const t = str(cb.copy_formula).trim()
    return t ? [{ h: '', t: t.replace(/\s*->\s*/g, ' → '), meta: '', url: '', flag: false, fields: { t } }] : []
  }
  if (k === 'hook') return plain(cb.winning_hooks, hookText)
  if (k === 'offer')
    return arr(cb.winning_offers).map((o0) => {
      const o = typeof o0 === 'string' ? { type: o0 } : json(o0)
      const price = str(o.price_point)
      return { h: str(o.type) || 'Offer', t: str(o.notes), meta: price ? 'Price shown: ' + price : '', url: '', flag: false, fields: { h: str(o.type), price, t: str(o.notes) } }
    })
  if (k === 'pain') return plain(cb.core_pain_points)
  if (k === 'obj') return plain(cb.objection_themes)
  if (k === 'cross') return plain(cb.cross_niche_sources, crossText)
  if (k === 'ad') {
    const gone = new Set(doc.rev.removed)
    return ads
      .filter((a) => !gone.has(a.key))
      .map((a, i) => ({
        h: 'P' + (i + 1) + ' · ' + (a.adv || 'Advertiser'),
        t: clip(a.hook, 140),
        meta: [a.days !== null ? a.days + (a.days === 1 ? ' day running' : ' days running') : '', a.status].filter(Boolean).join(' · '),
        url: '',
        flag: false,
        fields: { key: a.key },
        target: a.target,
      }))
  }
  return []
}

// ---------- the sections and what a change is called ----------

/** The sections the editor lists, in order (v111EdHtml). */
export const ED_SECS: Readonly<Record<Kind, readonly { k: string; title: string; kicker?: string; rows: string[]; note?: string; lock?: readonly [string, string] }[]>> = {
  org: [
    { k: 'five', title: 'Five things working', rows: ['five'] },
    { k: 'short', title: 'The short version', rows: ['short'] },
    { k: 'shift', title: 'What changed', rows: ['shift'] },
    { k: 'dev', title: 'Notable developments', rows: ['dev'] },
    { k: 'themes', title: 'Themes and topic watch', rows: [], note: 'Counted from the posts. Removing a post takes it out of the topic watch.' },
    { k: 'hand', title: 'Content handoff', rows: [], note: 'Guidance for writers, the same on every brief.' },
    { k: 'post', title: 'Posts behind this brief', kicker: 'Evidence', rows: ['post'], lock: ['Remove single posts', 'The evidence stays. Remove single posts instead.'] },
  ],
  ads: [
    { k: 'five', title: 'Five things working', rows: ['afive'] },
    { k: 'short', title: 'One-minute read', rows: ['angle'] },
    { k: 'arch', title: 'Creative structure', rows: ['formula', 'hook'], lock: ['Needed for drafts', 'Every ad is built on these. Edit or remove single hooks.'] },
    { k: 'offer', title: 'Offer ideas', rows: ['offer'] },
    { k: 'pain', title: 'Buyer pains and objections', rows: ['pain', 'obj'] },
    { k: 'cross', title: 'Borrowed from other markets', rows: ['cross'] },
    { k: 'test', title: 'Test plan', rows: [], note: 'The same on every brief.' },
    { k: 'ad', title: 'Ads behind this brief', kicker: 'Evidence', rows: ['ad'], lock: ['Remove single ads', 'The evidence stays. Remove single ads instead.'] },
  ],
}

/** A list's kicker inside a section with two, and what an empty list says. */
export const ROWS_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  five: ['', 'No findings left.'],
  afive: ['', 'No findings left.'],
  short: ['', 'This brief has no short version.'],
  shift: ['', 'No shifts in this brief.'],
  dev: ['', 'No developments in this brief.'],
  post: ['', 'No posts listed.'],
  angle: ['', 'This brief has no angle written up.'],
  formula: ['Draft skeleton', 'No copy formula.'],
  hook: ['Hooks', 'No hooks.'],
  offer: ['', 'No offers in this brief.'],
  pain: ['Pains', 'No pains.'],
  obj: ['Likely objections', 'No objections.'],
  cross: ['', 'Nothing borrowed in this brief.'],
  ad: ['', 'No ads listed.'],
}

/** What a removed or edited row is counted as (v111ItDel, v111ItSave). */
export const W_OF: Readonly<Record<string, string>> = { short: 'line', five: 'finding', afive: 'finding', shift: 'shift', dev: 'dev', post: 'post', hook: 'hook', offer: 'offer', pain: 'pain', obj: 'obj', cross: 'cross', ad: 'ad', angle: 'angle', formula: 'formula' }

const WORDS: Readonly<Record<string, readonly [string, string]>> = {
  post: ['post', 'posts'],
  line: ['line in the short version', 'lines in the short version'],
  finding: ['finding', 'findings'],
  shift: ['shift', 'shifts'],
  dev: ['development', 'developments'],
  hook: ['hook', 'hooks'],
  offer: ['offer', 'offers'],
  pain: ['pain', 'pains'],
  obj: ['objection', 'objections'],
  cross: ['pattern from other markets', 'patterns from other markets'],
  ad: ['ad', 'ads'],
}

const join = (l: string[]) => (l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1])

/** What the changes were, in up to three sentences (v111Sum). */
export function sumOf(log: LogEntry[]): string {
  const counts = (v: 'removed' | 'edited') => {
    const n: Record<string, number> = {}
    for (const e of log) if (e.v === v && e.w !== 'section') n[e.w] = (n[e.w] ?? 0) + 1
    return Object.entries(n).map(([w, c]) =>
      w === 'angle' ? 'the short version' : w === 'formula' ? 'the draft skeleton' : c + ' ' + (WORDS[w] ? WORDS[w][c === 1 ? 0 : 1] : w),
    )
  }
  const removed = counts('removed')
  const secs = [...new Set(log.filter((e) => e.v === 'removed' && e.w === 'section').map((e) => e.n))]
  const edited = counts('edited')
  return [removed.length ? 'Removed ' + join(removed) + '.' : '', secs.length ? 'Took out ' + join(secs) + '.' : '', edited.length ? 'Edited ' + join(edited) + '.' : '']
    .filter(Boolean)
    .join(' ')
}

// ---------- changes ----------

export type Change = { doc: Doc; log?: LogEntry; err?: string; toast?: string }

const hide = (rev: Rev, k: string) => (rev.hidden.includes(k) ? rev.hidden : [...rev.hidden, k])
const SEC_TITLE = (kind: Kind, k: string) => ED_SECS[kind].find((s) => s.k === k)?.title ?? k

/** Remove a whole section (v111SecDel). */
export function secDel(kind: Kind, doc0: Doc, k: string): Change {
  const sec = ED_SECS[kind].find((s) => s.k === k)
  if (!sec || sec.lock) return { doc: doc0 }
  const log: LogEntry = { v: 'removed', w: 'section', n: SEC_TITLE(kind, k) }
  if (kind === 'org') {
    const doc = copy(doc0) as OrgDoc
    if (k === 'five') doc.snap = { ...(doc.snap ?? {}), items: [] }
    if (k in MDN) doc.md = mdDrop(doc.md, MDN[k])
    if (k === 'shift') doc.data.sophistication_shifts = []
    if (k === 'themes') doc.data.topic_watch = {}
    doc.rev.hidden = hide(doc.rev, k)
    return { doc, log, toast: 'Removed ' + sec.title + '.' }
  }
  const doc = copy(doc0) as AdsDoc
  if (k === 'short') doc.cb.differentiation_angle = ''
  if (k === 'five') doc.snap = { ...(doc.snap ?? {}), items: [] }
  if (k === 'offer') doc.cb.winning_offers = []
  if (k === 'pain') {
    doc.cb.core_pain_points = []
    doc.cb.objection_themes = []
  }
  if (k === 'cross') doc.cb.cross_niche_sources = []
  doc.rev.hidden = hide(doc.rev, k)
  return { doc, log, toast: 'Removed ' + sec.title + '.' }
}

/** A post taken out of an organic brief (v111PostDel): its lists, its topic watch, its lines, and flagged elsewhere. */
function postDel(doc: OrgDoc, url: string) {
  const keep = (v: unknown) => arr(v).filter((x) => str(json(x).url) !== url)
  const d = doc.data
  if (d.items !== undefined) d.items = keep(d.items)
  if (d.high_value_items !== undefined) d.high_value_items = keep(d.high_value_items)
  if (num(d.keep) !== null && Array.isArray(d.items)) d.n_kept = d.items.length
  const tw = json(d.topic_watch)
  if (Object.keys(tw).length) d.topic_watch = Object.fromEntries(Object.entries(tw).map(([k, v]) => [k, keep(v)]))
  const lines = doc.md.split('\n')
  const inSec = new Set([...secLines(lines, 4), ...secLines(lines, 5)])
  doc.md = devTidy(mdTidy(lines.filter((l, i) => !(inSec.has(i) && l.includes('(' + url + ')'))).join('\n')))
  if (!doc.rev.removed.includes(url)) doc.rev.removed.push(url)
}

/** Remove one row (v111ItDel). `key` is a post's link or an ad's key. */
export function rowDel(kind: Kind, doc0: Doc, k: string, i: number, key = ''): Change {
  const log: LogEntry = { v: 'removed', w: W_OF[k] ?? k, n: '' }
  if (kind === 'org') {
    const doc = copy(doc0) as OrgDoc
    if (k === 'five') {
      const items = five(doc.snap, orgFallback(doc.md))
      items.splice(i, 1)
      doc.snap = { ...(doc.snap ?? {}), items }
      // none left: the section goes, or the brief's fallback would show again (the old editor let it come back)
      if (!items.length) doc.rev.hidden = hide(doc.rev, 'five')
    } else if (k === 'short') {
      const idx = tlIdx(doc.md)
      if (idx[i] === undefined) return { doc: doc0 }
      const lines = doc.md.split('\n')
      lines.splice(idx[i], 1)
      doc.md = mdTidy(lines.join('\n'))
      if (!tlIdx(doc.md).length) {
        doc.md = mdDrop(doc.md, 1)
        doc.rev.hidden = hide(doc.rev, 'short')
      }
    } else if (k === 'shift') {
      const blocks = shiftBlocks(doc.md)
      if (blocks?.[i]) doc.md = mdTidy(doc.md.slice(0, blocks[i].a) + doc.md.slice(blocks[i].z))
      else {
        const at = shiftIdx(doc.data)[i]
        if (at === undefined) return { doc: doc0 }
        const list = arr(doc.data.sophistication_shifts)
        list.splice(at, 1)
        doc.data.sophistication_shifts = list
      }
    } else if (k === 'dev') {
      const idx = devIdx(doc.md)
      if (idx[i] === undefined) return { doc: doc0 }
      const lines = doc.md.split('\n')
      lines.splice(idx[i], 1)
      doc.md = devTidy(lines.join('\n'))
    } else if (k === 'post') {
      if (!key) return { doc: doc0 }
      postDel(doc, key)
      return { doc, log, toast: 'Post removed. Findings that quoted it are flagged.' }
    } else return { doc: doc0 }
    return { doc, log, toast: 'Removed.' }
  }
  const doc = copy(doc0) as AdsDoc
  const cb = doc.cb
  const cut = (f: keyof CB) => {
    const l = arr(cb[f])
    l.splice(i, 1)
    cb[f] = l
  }
  if (k === 'afive') {
    const items = five(doc.snap, adFallback({ winning_hooks: cb.winning_hooks, core_pain_points: cb.core_pain_points }))
    items.splice(i, 1)
    doc.snap = { ...(doc.snap ?? {}), items }
    if (!items.length) doc.rev.hidden = hide(doc.rev, 'five')
  } else if (k === 'hook') {
    if (arr(cb.winning_hooks).length <= 1) return { doc: doc0, err: 'Keep at least one hook. Every ad opens with one.' }
    cut('winning_hooks')
  } else if (k === 'offer') cut('winning_offers')
  else if (k === 'pain') cut('core_pain_points')
  else if (k === 'obj') cut('objection_themes')
  else if (k === 'cross') cut('cross_niche_sources')
  else if (k === 'ad') {
    if (!key) return { doc: doc0 }
    if (!doc.rev.removed.includes(key)) doc.rev.removed.push(key)
    cb.source_ad_ids = arr(cb.source_ad_ids).filter((x) => str(x) !== key)
    return { doc, log, toast: 'Ad removed from the brief.' }
  } else return { doc: doc0 }
  return { doc, log, toast: 'Removed.' }
}

/** Edit one row with what the form says (v111ItSave): the same values close it, all empty is refused. */
export function rowEdit(kind: Kind, doc0: Doc, k: string, i: number, row: Row, vals: Record<string, string>): Change & { same?: boolean } {
  const fields = FORM[k] ?? []
  const v: Record<string, string> = {}
  for (const [name] of fields) v[name] = str(vals[name]).trim()
  if (fields.every(([name]) => v[name] === str(row.fields[name]).trim())) return { doc: doc0, same: true }
  if (fields.every(([name]) => !v[name])) return { doc: doc0, err: 'That would leave it empty. Remove it instead.' }
  const log: LogEntry = { v: 'edited', w: W_OF[k] ?? k, n: '' }
  if (kind === 'org') {
    const doc = copy(doc0) as OrgDoc
    if (k === 'five') {
      const items = five(doc.snap, orgFallback(doc.md))
      if (!items[i]) return { doc: doc0 }
      const old = json(arr(snapOf(doc.snap)?.items)[i])
      items[i] = { ...old, text: v.h, why: v.t, tag: v.tag || items[i].tag || '' } as SnapItem
      doc.snap = { ...(doc.snap ?? {}), items }
    } else if (k === 'short') {
      const idx = tlIdx(doc.md)
      if (idx[i] === undefined) return { doc: doc0 }
      const lines = doc.md.split('\n')
      lines[idx[i]] = tlLine(lines[idx[i]], v.h, v.t)
      doc.md = lines.join('\n')
    } else if (k === 'shift') {
      const blocks = shiftBlocks(doc.md)
      if (blocks?.[i]) doc.md = mdTidy(doc.md.slice(0, blocks[i].a) + shiftTxt(v as { h: string; obs: string; interp: string; use: string }, row.meta, row.url) + doc.md.slice(blocks[i].z))
      else {
        const at = shiftIdx(doc.data)[i]
        if (at === undefined) return { doc: doc0 }
        const list = arr(doc.data.sophistication_shifts)
        list[at] = { ...json(list[at]), note: v.h + (v.interp ? '. ' + v.interp : ''), summary: v.obs }
        doc.data.sophistication_shifts = list
      }
    } else if (k === 'dev') {
      const idx = devIdx(doc.md)
      const d = devsOf(doc.md)[i]
      if (idx[i] === undefined || !d) return { doc: doc0 }
      const lines = doc.md.split('\n')
      lines[idx[i]] = devTxt(v as { h: string; t: string; why: string }, d.who, d.url)
      doc.md = lines.join('\n')
    } else return { doc: doc0 }
    return { doc, log }
  }
  const doc = copy(doc0) as AdsDoc
  const cb = doc.cb
  const put = (f: keyof CB, val: unknown) => {
    const l = arr(cb[f])
    if (i >= l.length) return false
    l[i] = val
    cb[f] = l
    return true
  }
  if (k === 'afive') {
    const items = five(doc.snap, adFallback({ winning_hooks: cb.winning_hooks, core_pain_points: cb.core_pain_points }))
    if (!items[i]) return { doc: doc0 }
    const old = json(arr(snapOf(doc.snap)?.items)[i])
    items[i] = { ...old, text: v.h, why: v.t, tag: v.tag || items[i].tag || '' } as SnapItem
    doc.snap = { ...(doc.snap ?? {}), items }
  } else if (k === 'angle') cb.differentiation_angle = v.t
  else if (k === 'formula') cb.copy_formula = v.t
  else if (k === 'hook') {
    const h = arr(cb.winning_hooks)[i]
    if (!put('winning_hooks', typeof h === 'string' || h === undefined ? v.t : { ...json(h), pattern: v.t, hook: v.t, text: v.t })) return { doc: doc0 }
  } else if (k === 'offer') {
    const o = arr(cb.winning_offers)[i]
    if (!put('winning_offers', { ...(typeof o === 'string' ? {} : json(o)), type: v.h, price_point: v.price || null, notes: v.t })) return { doc: doc0 }
  } else if (k === 'pain') put('core_pain_points', v.t)
  else if (k === 'obj') put('objection_themes', v.t)
  else if (k === 'cross') put('cross_niche_sources', v.t)
  else return { doc: doc0 }
  return { doc, log }
}

// ---------- saving ----------

/** The review saved with an edited brief (v111RevNew): who, when, what, the note, and the agent's version kept. */
export function reviewNew(x: {
  by: string
  at: string
  changes: string
  note: string
  rev: Rev
  prev: Record<string, unknown>
  original: unknown
}): Record<string, unknown> {
  return {
    by: x.by,
    at: x.at,
    changes: x.changes,
    note: x.note,
    hidden: x.rev.hidden,
    removed: x.rev.removed,
    original: x.prev.original ?? x.original,
    history: [...arr(x.prev.history), { by: x.by, at: x.at, changes: x.changes }].slice(-12),
  }
}

/** The note for the record as it is saved: one line, no bold marks (v111One). */
export const noteOf = (v: unknown) => one(v)
