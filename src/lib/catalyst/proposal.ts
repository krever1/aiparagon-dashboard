// The client proposal (Catalyst · Client Proposal), as the current dashboard reads, draws and edits it since v132 and
// v138 (v132DocOf, v132MdToDoc, v132DocMd, v132BrandOf, v132Md, v132SrcLabels, v132EditSave, v132Uses). Pure
// functions: the server and the browser both use them, and the tests check them.

import { type Chart, chartKey, chartText, checkCharts, hex } from './charts'

export type PropSection = { title: string; body: string; sources: string[] }
export type PropDoc = {
  title?: string
  subtitle?: string
  kicker?: string
  client?: string
  prepared_for?: string
  prepared_by?: string
  date?: string
  note?: string
  sections: PropSection[]
  visuals?: unknown
}
export type Brand = {
  colors?: { primary?: string; accent?: string; text?: string }
  fonts?: { heading?: string; body?: string }
  logo_url?: string
  found?: unknown[]
}

export const KICKER = 'Proposal and Scope of Work'
/** How long a run may take before the card stops showing it as written (the current dashboard's 15 minutes). */
export const PROPOSAL_STALE_MS = 15 * 60 * 1000

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** A jsonb value that may arrive as a JSON string (apJson). */
export function asJson(v: unknown): Record<string, unknown> {
  let x = v
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x)
    } catch {
      x = null
    }
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

/** A proposal kept only as markdown: the first # line is the title, each ## starts a section. */
export function mdToDoc(md: unknown): PropDoc {
  const doc: PropDoc = { title: '', sections: [] }
  let cur: PropSection | null = null
  for (const l of str(md).replace(/\r\n?/g, '\n').split('\n')) {
    let m: RegExpMatchArray | null
    if (!doc.title && (m = l.match(/^#\s+(.+)/))) {
      doc.title = m[1].trim()
      continue
    }
    if ((m = l.match(/^##\s+(.+)/))) {
      cur = { title: m[1].trim(), body: '', sources: [] }
      doc.sections.push(cur)
      continue
    }
    if (cur) cur.body += l + '\n'
  }
  for (const s of doc.sections) s.body = s.body.trim()
  return doc
}

function normSection(v: unknown): PropSection {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { ...(o as object), title: str(o.title), body: str(o.body), sources: Array.isArray(o.sources) ? o.sources.map(str) : [] }
}

/** The saved document: data.doc when it has sections, else the markdown read as one. */
export function proposalDoc(row: { data?: unknown; content_md?: unknown }): PropDoc {
  const d = asJson(row.data)
  const doc = d.doc as Record<string, unknown> | undefined
  if (doc && typeof doc === 'object' && Array.isArray(doc.sections)) return { ...(doc as object), sections: doc.sections.map(normSection) } as PropDoc
  return mdToDoc(row.content_md)
}

/** The markdown the proposal is kept as: the title, the subtitle, who it is for and from, each section with its charts. */
export function docMd(doc: PropDoc): string {
  const L = ['# ' + (doc.title || 'Proposal')]
  if (doc.subtitle) L.push('', doc.subtitle)
  const meta = [doc.prepared_for ? 'Prepared for ' + doc.prepared_for : '', doc.prepared_by ? 'Prepared by ' + doc.prepared_by : '', doc.date || ''].filter(Boolean)
  if (meta.length) L.push('', meta.join(' · '))
  const charts = checkCharts(doc.visuals)
  for (const s of doc.sections || []) {
    L.push('', '## ' + s.title, '', s.body || '')
    for (const c of charts.filter((v) => chartKey(v.after) === chartKey(s.title))) L.push('', chartText(c))
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** The brand the document is drawn in: its own, else the brand of the proposal template in use now. */
export function brandOf(data: unknown, templateBrand: unknown): Brand {
  const b = asJson(data).brand as Brand | undefined
  if (b && typeof b === 'object' && ((b.colors && Object.keys(b.colors).length) || b.logo_url)) return b
  return (templateBrand && typeof templateBrand === 'object' ? templateBrand : {}) as Brand
}

/** A font name with nothing that could break out of CSS, and no theme placeholder (+mn-lt). */
export function fontName(n: unknown): string {
  const s = str(n).replace(/["';{}<>]/g, '').trim()
  return /^\+m[nj]-/.test(s) ? '' : s.slice(0, 60)
}

export function fontStack(name: unknown, kind: 'serif' | 'sans'): string {
  const fb = kind === 'serif' ? 'Georgia,"Times New Roman",serif' : '"Helvetica Neue",Arial,sans-serif'
  const n = fontName(name).replace(/[^\w \-]/g, '')
  return n ? '"' + n + '",' + fb : fb
}

/** A brand color at a tenth of its strength on white (the chips' background). */
export function tint(h: unknown): string {
  const x = hex(h)
  if (!x) return '#F2F4F8'
  const m = (i: number) => Math.round(parseInt(x.slice(i, i + 2), 16) * 0.1 + 255 * 0.9)
  return `rgb(${m(1)},${m(3)},${m(5)})`
}

/** The document's colors and fonts as CSS variables: --b1 main, --b2 accent, --bt text, --bs chips, --bh/--bb fonts. */
export function brandVars(b: Brand): Record<string, string> {
  const c = b.colors || {}
  const f = b.fonts || {}
  const p1 = hex(c.primary) || '#1C2647'
  const p2 = hex(c.accent) || hex(c.primary) || '#B08A3E'
  return {
    '--b1': p1,
    '--b2': p2,
    '--bt': hex(c.text) || '#1D2433',
    '--bs': tint(p1),
    '--bh': fontStack(f.heading, 'sans'),
    '--bb': fontStack(f.body, 'serif'),
  }
}

const SYS_FONTS = /^(arial|helvetica|helvetica neue|times new roman|times|georgia|calibri|cambria|aptos|garamond|verdana|tahoma|segoe ui|courier new|trebuchet ms)$/i

/** The brand's fonts to load from Google Fonts (names only, no system fonts), each with a second address without the
 * weights for a family that lacks them. */
export function fontLinks(b: Brand): { name: string; urls: [string, string] }[] {
  const f = b.fonts || {}
  const out: { name: string; urls: [string, string] }[] = []
  for (const raw of [f.heading, f.body]) {
    const n = fontName(raw)
    if (!n || !/^[A-Za-z0-9 ]{2,40}$/.test(n) || SYS_FONTS.test(n) || out.some((x) => x.name === n)) continue
    const fam = encodeURIComponent(n).replace(/%20/g, '+')
    out.push({
      name: n,
      urls: [`https://fonts.googleapis.com/css2?family=${fam}:wght@400;600;700&display=swap`, `https://fonts.googleapis.com/css2?family=${fam}&display=swap`],
    })
  }
  return out
}

/** The logo: an https address only. */
export function logoOf(b: Brand): string {
  const u = str(b.logo_url)
  return /^https:\/\//.test(u) ? u : ''
}

/** Where each section came from, as the chips above it say (unknown keys left out, each once, in the section's order). */
export function srcLabels(sources: string[], call: { date?: string; title?: string } | null, day: (iso: string) => string): string[] {
  const lbl: Record<string, string> = {
    template: 'Structure from your template',
    questions: 'Sorted by your discovery call questions',
    past: 'Written like your past assessment',
    call: call?.date ? 'From the call on ' + day(call.date) : call?.title ? 'From the call' : 'From the meetings',
    assessment: 'From the assessment',
    research: 'From the prospect brief',
    consultation: 'From the consultation guide',
    discovery: 'From the follow-up guide',
    growth_plan: 'From the proposal presentation',
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of sources) {
    if (!lbl[k] || seen.has(k)) continue
    seen.add(k)
    out.push(lbl[k])
  }
  return out
}

/** Which section each chart goes under: the one it names, else the last. */
export function chartsBySection(doc: PropDoc): Map<number, Chart[]> {
  const out = new Map<number, Chart[]>()
  const n = doc.sections.length
  if (!n) return out
  for (const c of checkCharts(doc.visuals)) {
    let i = doc.sections.findIndex((s) => chartKey(s.title) === chartKey(c.after))
    if (i < 0) i = n - 1
    out.set(i, [...(out.get(i) ?? []), c])
  }
  return out
}

// ---------- the body's markdown, safely ----------

export type Inline = { k: 'text'; text: string } | { k: 'strong' | 'em' | 'fill'; kids: Inline[] }
export type Block = { k: 'h'; kids: Inline[] } | { k: 'ul' | 'ol'; items: Inline[][] } | { k: 'p'; lines: Inline[][] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/**
 * A line's bold, italic and [FILL IN …] / [TO CONFIRM …] / [ASSUMED …] markers, in the order the current dashboard
 * applies them (v132Inline: the markers first, then bold, then italic), as a tree. Text never becomes markup: only those
 * three are read.
 */
export function inline(s: string): Inline[] {
  let h = esc(String(s ?? ''))
  h = h.replace(/\[((?:FILL IN|ASSUMED|TO CONFIRM)[^\]]*)\]/gi, '\u0001F[$1]\u0002F')
  h = h.replace(/\*\*([^*]+)\*\*/g, '\u0001S$1\u0002S').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1\u0001E$2\u0002E')
  const root: Inline[] = []
  const stack: { k: 'strong' | 'em' | 'fill'; kids: Inline[] }[] = []
  const KIND = { F: 'fill', S: 'strong', E: 'em' } as const
  const top = () => (stack.length ? stack[stack.length - 1].kids : root)
  for (const part of h.split(/(\u0001[FSE]|\u0002[FSE])/)) {
    if (!part) continue
    if (part[0] === '\u0001') {
      const node = { k: KIND[part[1] as 'F' | 'S' | 'E'], kids: [] as Inline[] }
      top().push(node)
      stack.push(node)
    } else if (part[0] === '\u0002') {
      const k = KIND[part[1] as 'F' | 'S' | 'E']
      const at = stack.map((x) => x.k).lastIndexOf(k)
      if (at >= 0) stack.length = at
    } else top().push({ k: 'text', text: unesc(part) })
  }
  return root
}

/** The body as blocks: small headings, lists (renumbered), paragraphs with their line breaks. */
export function mdBlocks(md: unknown): Block[] {
  const out: Block[] = []
  let list: { k: 'ul' | 'ol'; items: string[] } | null = null
  let para: string[] = []
  const fp = () => {
    if (para.length) out.push({ k: 'p', lines: para.map(inline) })
    para = []
  }
  const fl = () => {
    if (list) out.push({ k: list.k, items: list.items.map(inline) })
    list = null
  }
  for (const line of str(md).replace(/\r\n?/g, '\n').split('\n')) {
    const s = line.trim()
    let m: RegExpMatchArray | null
    if (!s) {
      fp()
      fl()
      continue
    }
    if ((m = s.match(/^#{1,6}\s+(.*)$/))) {
      fp()
      fl()
      out.push({ k: 'h', kids: inline(m[1]) })
      continue
    }
    if ((m = s.match(/^[-*•]\s+(.*)$/))) {
      fp()
      if (!list || list.k !== 'ul') {
        fl()
        list = { k: 'ul', items: [] }
      }
      list.items.push(m[1])
      continue
    }
    if ((m = s.match(/^\d{1,2}[.)]\s+(.*)$/))) {
      fp()
      if (!list || list.k !== 'ol') {
        fl()
        list = { k: 'ol', items: [] }
      }
      list.items.push(m[1])
      continue
    }
    fl()
    para.push(s)
  }
  fp()
  fl()
  return out
}

// ---------- edits ----------

export type DocEdits = { title: string; subtitle: string | null; sections: { title: string; body: string }[] }

const flat = (s: unknown) => str(s).replace(/\s+/g, ' ').trim()

/**
 * The document after an edit in place (v132EditSave): an empty title keeps the old one, the subtitle changes only when
 * the document has one, an empty section title keeps the old one, and a chart stays under its section when the section
 * is renamed. Sections are matched by position; extra ones are ignored.
 */
export function applyEdits(before: PropDoc, e: DocEdits): PropDoc {
  const doc = JSON.parse(JSON.stringify(before)) as PropDoc
  const t = flat(e.title)
  if (t) doc.title = t
  if (before.subtitle && e.subtitle !== null && e.subtitle !== undefined) doc.subtitle = flat(e.subtitle)
  doc.sections.forEach((x, i) => {
    const ed = e.sections[i]
    if (!ed) return
    const was = x.title
    x.title = flat(ed.title) || x.title
    x.body = str(ed.body)
    if (was !== x.title && Array.isArray(doc.visuals)) {
      for (const v of doc.visuals as Record<string, unknown>[]) if (v && chartKey(v.after) === chartKey(was)) v.after = x.title
    }
  })
  return doc
}

// ---------- what a run reads ----------

/** A line of the question's list: a past document, a call, an email, or anything else; off when it is missing. */
export type UseRow = { ok: boolean; kind: 'doc' | 'call' | 'mail' | 'plain'; text: string; date?: string; after?: string; more?: number }

/** "Using 3 past documents, 2 call transcripts and 3 emails", or "Built from" when there is none of those. */
export function usesSummary(rows: UseRow[]): string {
  const on = rows.filter((x) => x.ok)
  const nd = on.filter((x) => x.kind === 'doc').length
  const nc = on.filter((x) => x.kind === 'call').length
  const nm = on.reduce((n, x) => n + (x.kind === 'mail' ? x.more || 1 : 0), 0)
  const parts = [
    nd ? nd + ' past document' + (nd === 1 ? '' : 's') : '',
    nc ? (nc === 1 ? 'the call transcript' : nc + ' call transcripts') : '',
    nm ? (nm === 1 ? 'an email' : nm + ' emails') : '',
  ].filter(Boolean)
  if (!parts.length) return 'Built from'
  return 'Using ' + (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0])
}

// ---------- a run in progress ----------

/** A client proposal being written, kept for the team (ai_settings `catalyst_proposal_runs`, by the lead's email). */
export type ProposalRun = { t0: string; by?: string; uses: UseRow[] }

export function proposalRunsFrom(value: unknown): Record<string, ProposalRun> {
  const out: Record<string, ProposalRun> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [email, v] of Object.entries(value as Record<string, unknown>)) {
    const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    if (!Date.parse(str(r.t0))) continue
    out[email.toLowerCase()] = {
      t0: str(r.t0),
      by: str(r.by) || undefined,
      uses: Array.isArray(r.uses) ? (r.uses as UseRow[]).filter((u) => u && typeof u.text === 'string').slice(0, 20) : [],
    }
  }
  return out
}

/**
 * The run still under way for a lead: started less than 15 minutes ago, and no proposal saved since (a proposal saved
 * up to 5 seconds before the start counts, as the current dashboard's check did).
 */
export function pendingProposal(runs: Record<string, ProposalRun>, emails: string[], newestAt: string | null, now: number): ProposalRun | null {
  const r = emails.map((e) => runs[e.toLowerCase()]).find(Boolean)
  if (!r) return null
  const t0 = Date.parse(r.t0)
  if (now - t0 > PROPOSAL_STALE_MS) return null
  if (newestAt && Date.parse(newestAt) > t0 - 5000) return null
  return r
}

// ---------- what the lead page gets ----------

/** The newest proposal, as the page draws it. */
export type ProposalView = {
  id: string
  title: string
  createdAt: string | null
  doc: PropDoc
  brand: Brand
  /** the call it was written from: a date and title for one call, both empty for the meetings' notes */
  call: { date: string; title: string } | null
  /** where it came from, as the card's line names it */
  from: string[]
  edited: { at: string; by: string } | null
}

export type ProposalData = {
  view: ProposalView | null
  /** the proposal template in use (the card's line before the first proposal) */
  template: string | null
  run: ProposalRun | null
}
