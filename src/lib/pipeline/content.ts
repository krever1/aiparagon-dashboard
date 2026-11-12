// Content Transformation (NW_PAGES['e3.create'] in the current dashboard, as v110 to v127 left it, with v97's drafts,
// v113's formats and cards, v126's What should change? and the content library): the drafts Engine 3 · Content from
// Source writes from the team's own material (agent_outputs content_generation content_draft, one per content_requests
// row), their review (agent_feedback draft_review: ready, or changes asked), the ideas (the newest organic brief's five
// things and the team's idea_notes) and the pieces kept in the library (content_pieces). Pure: the page, the server and
// the tests use it.

import { arr, json } from './intel'
import { type SnapItem, orgFallback, snapItems, tidy, words } from '@/lib/touchpoint/approvals'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>

/** A list item the model wrote: a string, or an object with its words in one of these fields. */
function lineOf(x: unknown): string {
  if (typeof x === 'string') return x.trim()
  if (x && typeof x === 'object') {
    const o = x as Row
    return str(o.text ?? o.claim ?? o.point ?? o.title ?? o.name ?? '').trim()
  }
  return x === null || x === undefined ? '' : String(x).trim()
}
const lines = (v: unknown) => arr(v).map(lineOf).filter(Boolean)
export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)

// ---------- names ----------

/** The four formats a request is filed under (AP_CF_FMT; content_requests.format takes only these). */
export const FMT: Readonly<Record<string, string>> = { ad: 'Paid ad', thought_leadership: 'Thought leadership', newsletter: 'Newsletter', email: 'Email' }
/** The newer formats (v113), filed under one of the four and named by content_type, as Content from Source names them. */
export const NEW_FMT: Readonly<Record<string, string>> = {
  report: 'Report',
  white_paper: 'White paper',
  news_article: 'Article',
  how_to: 'How-to guide',
  event_kit: 'Event materials',
  deck: 'Presentation deck',
  webinar_deck: 'Webinar deck',
  video: 'Video script',
  clips: 'Short clips',
  other: 'Custom piece',
}
/** What the material was (AP_CF_SRC, with the kinds v113's form added). */
export const SRC: Readonly<Record<string, string>> = {
  article: 'Article',
  podcast: 'Podcast',
  interview: 'Interview',
  book_chapter: 'Book chapter',
  transcript: 'Transcript',
  other: 'Content',
  brief: 'The briefs',
  report: 'Document or report',
  presentation: 'Presentation',
  video: 'Video',
  call: 'Call or meeting',
}

/** A request's or a draft's format, by the name its own markdown gives it: a newer format by its content type. */
export const fmtName = (format: string, contentType = '') => NEW_FMT[contentType] || FMT[format] || 'Draft'

/** A piece's kind as the Create pages name it (NW_CK with v113's formats), and the word for one (v126). */
const KIND: Readonly<Record<string, readonly [string, string]>> = {
  thought_leadership: ['LinkedIn post', 'post'],
  newsletter: ['Newsletter', 'issue'],
  email: ['Email', 'email'],
  adcopy: ['Paid ad', 'ad'],
  report: ['Report', 'report'],
  white_paper: ['White paper', 'white paper'],
  news_article: ['Article or news story', 'article'],
  how_to: ['How-to guide', 'guide'],
  event_kit: ['Event materials', 'event kit'],
  deck: ['Presentation deck', 'deck'],
  webinar_deck: ['Webinar deck', 'webinar deck'],
  video: ['Video script', 'script'],
  clips: ['Short clips', 'clip plan'],
  other: ['Something else', 'draft'],
}
export const kindName = (k: string) => KIND[k]?.[0] ?? 'Draft'
export const kindNoun = (k: string) => KIND[k]?.[1] ?? 'draft'

// ---------- requests and drafts ----------

export const RUNNING: readonly string[] = ['queued', 'extracting', 'drafting']
const RUN_WORD: Readonly<Record<string, string>> = { queued: 'Queued', extracting: 'Reading', drafting: 'Writing' }

export type Pulled = { ideas: number; stories: number; frameworks: number; dataPoints: number; quotes: number }
const pulledOf = (v: unknown): Pulled | null => {
  const e = json(v)
  if (!Object.keys(e).length) return null
  return {
    ideas: arr(e.core_ideas).length,
    stories: arr(e.stories).length,
    frameworks: arr(e.frameworks).length,
    dataPoints: arr(e.data_points).length,
    quotes: arr(e.quotes).length,
  }
}

/** A content request (content_requests), as the page reads it. */
export type Req = {
  id: string
  createdAt: string
  updatedAt: string
  requestedBy: string
  startMode: string
  format: string
  contentType: string
  title: string
  sourceType: string
  status: string
  error: string
  outputId: string
  pulled: Pulled | null
}
export const reqOf = (r: Row): Req => ({
  id: str(r.id),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  requestedBy: str(r.requested_by),
  startMode: str(r.start_mode),
  format: str(r.format),
  contentType: str(r.content_type),
  title: str(r.title),
  sourceType: str(r.source_type),
  status: str(r.status),
  error: str(r.error),
  outputId: str(r.output_id),
  pulled: pulledOf(r.extraction),
})

export type Hook = { label: string; text: string }
/** What a draft took from each brief (the creative brief Content from Source keeps on it). */
export type DraftBrief = {
  title: string
  primary: string
  substance: string[]
  packaging: string[]
  strategic: string[]
  intelRun: string
  intelApproved: boolean
  adRun: string
  adApproved: boolean
}
/** The house settings a draft followed (data.house): rules, the template, knowledge base documents, asks followed. */
export type House = { rules: number | null; template: string; kbDocs: number | null; feedback: number; contentType: string }
export type Draft = {
  id: string
  runId: string
  title: string
  createdAt: string
  format: string
  contentType: string
  startMode: string
  sourceType: string
  requestId: string
  hooks: Hook[]
  body: string
  cta: string
  headline: string
  hashtags: string[]
  trace: { body: string; hooks: string; claims: string }
  flags: string[]
  brief: DraftBrief
  pulled: Pulled | null
  house: House
  voice: string
}

const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const yes = (v: unknown) => v === true || v === 'true'

/** A content draft row (agent_outputs) as the page uses it; its data may be kept as a string. */
export function draftOf(o: Row): Draft {
  const d = json(o.data)
  const b = json(d.brief)
  const tr = json(d.trace)
  const hs = json(d.house)
  let title = str(d.title || o.title)
  if (/^draft title$/i.test(title.trim())) title = str(b.title)
  return {
    id: str(o.id),
    runId: str(o.run_id),
    title: title || 'Content draft',
    createdAt: str(o.created_at),
    format: str(d.format),
    contentType: str(d.content_type),
    startMode: str(d.start_mode),
    sourceType: str(d.source_type),
    requestId: str(d.request_id),
    hooks: arr(d.hooks)
      .map((h) => (typeof h === 'string' ? { label: '', text: h.trim() } : { label: str(json(h).label).trim(), text: str(json(h).text).trim() }))
      .filter((h) => h.text),
    body: str(d.body),
    cta: str(d.cta).trim(),
    headline: str(d.headline).trim(),
    hashtags: lines(d.hashtags),
    trace: { body: lineOf(tr.body), hooks: lineOf(tr.hooks), claims: lineOf(tr.claims) },
    flags: lines(d.review_flags),
    brief: {
      title: str(b.title),
      primary: str(b.primary_signal),
      substance: lines(b.substance),
      packaging: lines(b.packaging),
      strategic: lines(b.strategic),
      intelRun: str(b.intel_run),
      intelApproved: yes(b.intel_approved),
      adRun: str(b.ad_run),
      adApproved: yes(b.ad_approved),
    },
    pulled: pulledOf(d.extraction),
    house: {
      rules: numOrNull(hs.rules),
      template: str(hs.template),
      kbDocs: numOrNull(hs.kb_docs),
      feedback: Number(hs.feedback) || 0,
      contentType: str(hs.content_type),
    },
    voice: str(d.voice),
  }
}

/** A draft's kind, as the Create pages name them; an ad draft is the Paid ad tile (v126Kind). */
export function kindOf(d: Pick<Draft, 'format' | 'contentType' | 'house'>): string {
  const k = d.house.contentType || d.contentType || d.format
  return k === 'ad' ? 'adcopy' : k
}
/** Subject lines for newsletters and emails, hooks for everything else. */
export const hookWord = (format: string) => (format === 'newsletter' || format === 'email' ? 'Subject' : 'Hook')
export const hookLabel = (d: Pick<Draft, 'format' | 'hooks'>, i: number) => d.hooks[i]?.label || hookWord(d.format) + ' ' + 'ABC'.charAt(i)

/** Where a draft belongs: drafts made from the briefs are Marketing Generation's, the rest are this page's (v97DraftOrigin). */
export type Origin = 'mine' | 'brief'
export const reqOrigin = (r: Pick<Req, 'sourceType'> | undefined): Origin => (r && r.sourceType === 'brief' ? 'brief' : 'mine')
export function draftOrigin(d: Pick<Draft, 'sourceType' | 'requestId'>, reqs: Pick<Req, 'id' | 'sourceType'>[]): Origin {
  if (d.sourceType === 'brief') return 'brief'
  return reqOrigin(reqs.find((r) => r.id === d.requestId))
}

// ---------- the review ----------

/** A draft review (agent_feedback draft_review): marked ready, or changes asked. Newest first. */
export type Review = { id: string; target: string; action: string; feedback: string; author: string; createdAt: string }
export const reviewOf = (r: Row): Review => ({
  id: str(r.id),
  target: str(r.target_id),
  action: str(r.action),
  feedback: str(r.feedback),
  author: str(r.author),
  createdAt: str(r.created_at),
})
/** The sign-off on a draft, if any (apCfReview). */
export const readyOf = (id: string, revs: Review[]) => revs.find((r) => r.target === id && r.action === 'ready')
/** The changes asked on a draft (v126For). */
export const asksOf = (id: string, revs: Review[]) => revs.filter((r) => r.target === id && r.action === 'changes' && r.feedback.trim())

/** The four review checks (AP_CF_CHECKS). */
export const CHECKS: readonly string[] = [
  'The story and framework match the source.',
  'The voice sounds like us and the wording is original.',
  'Offer, CTA and destination are accurate.',
  'Claims, testimonials and regulated-use hooks have had the right review.',
]
/** The line under the checks (cfRevStat). */
export function checkLine(left: number): string {
  return left ? plural(left, 'item') + ' to check before marking this ready.' : 'All checked. Mark it ready when you are happy.'
}

/** What was off, for What should change? on a draft (V126_WHY). */
export const DRAFT_WHY: readonly (readonly [string, string])[] = [
  ['voice', 'Off-voice'],
  ['long', 'Too long'],
  ['generic', 'Too generic'],
  ['salesy', 'Too salesy'],
  ['hook', 'Weak hook'],
  ['example', 'Needs a real example'],
  ['audience', 'Wrong audience'],
  ['point', 'Unclear point'],
]
/** The saved sentence: "LinkedIn post: too long, too salesy. Cut the intro." (v126Text), 600 characters at most. */
export function askText(kind: string, picked: string[], note: string): string {
  const w = DRAFT_WHY.filter(([k]) => picked.includes(k)).map(([, l]) => l.toLowerCase())
  const n = str(note).replace(/\s+/g, ' ').trim()
  return (kindName(kind) + ': ' + [w.length ? w.join(', ') + '.' : '', n].filter(Boolean).join(' ')).slice(0, 600)
}
export function askProblem(picked: string[], note: string): string | null {
  return !picked.length && str(note).replace(/\s+/g, ' ').trim().length < 12 ? 'Pick what was off, or write a sentence.' : null
}

// ---------- the drafts tab ----------

/** A request still working, or one that did not finish (nwProgRows): 8 at most. */
export type Prog = { req: Req; tone: 'bad' | 'warn' | 'info'; pill: string; line: string; retry: boolean }
export function progRows(reqs: Req[], now: number, kicks: Record<string, string>, day: (iso: string) => string): Prog[] {
  const age = (r: Req) => now - (Date.parse(r.updatedAt || r.createdAt) || 0)
  return reqs
    .filter((r) => {
      const running = RUNNING.includes(r.status)
      return (running && age(r) < 12 * 60_000) || r.status === 'error' || (!!kicks[r.id] && r.status !== 'done')
    })
    .slice(0, 8)
    .map((r) => {
      const running = RUNNING.includes(r.status)
      const stale = running && age(r) > 4 * 60_000
      const kick = r.status !== 'done' ? kicks[r.id] : ''
      const failed = r.status === 'error'
      return {
        req: r,
        tone: failed ? 'bad' : stale || kick ? 'warn' : 'info',
        pill: failed ? 'Did not finish' : stale || kick ? 'Not picked up' : RUN_WORD[r.status] || 'Working',
        line: failed && r.error ? r.error : kick ? 'The workflow did not start: ' + kick : fmtName(r.format, r.contentType) + ' · ' + day(r.createdAt),
        retry: failed || stale || !!kick,
      }
    })
}
/** The requests writing a draft right now (nwCtRunning). */
export const runningReqs = (reqs: Req[], now: number) =>
  reqs.filter((r) => RUNNING.includes(r.status) && now - (Date.parse(r.updatedAt || r.createdAt) || 0) < 12 * 60_000)

/** A draft's row in the list: what it is, when, and where it came from. */
export function draftLine(d: Draft, day: string): string {
  return fmtName(d.format, d.contentType) + ' · ' + day + (d.startMode === 'idea' ? ' · from an idea' : '')
}
/** The line over the draft: what it was made from, and what it became. */
export function madeFrom(d: Draft): string {
  return (d.startMode === 'idea' ? 'New idea' : SRC[d.sourceType] || 'Your source') + ' → ' + fmtName(d.format, d.contentType)
}
/** Which brief led the packaging: the ads brief, the organic brief, or neither said. */
export const leadOf = (b: DraftBrief): 'ad' | 'org' | '' => (b.primary === 'ad_strategist' ? 'ad' : b.primary === 'intel_tracker' ? 'org' : '')
/** The line under the title: the source and which brief led (v97's tidy wording, whichever parts the draft has). */
export function sourceLine(d: Draft, reqTitle: string): string {
  const lead = leadOf(d.brief)
  const s = [reqTitle ? 'From “' + reqTitle + '”' : '', lead ? 'led by the ' + (lead === 'ad' ? 'advertisement' : 'organic') + ' brief' : ''].filter(Boolean).join(' · ')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

/** Cards for decks, scripts, clip plans and event kits (v113): "Slide 1:", "Scene 2:" and the like start a card. */
const CARD_RE = /^(?:#{1,3}\s*)?(?:\*\*)?((?:Slide|Scene|Clip|Step|Card)\s*(?:\d+)?\s*[:.)-])/i
export type Body = { paras: string[]; cards: { h: string; lines: { text: string; note: boolean }[] }[] }
const paras = (t: string) =>
  String(t || '')
    .split(/\n{2,}|\n(?=\S)/)
    .map((p) => p.trim())
    .filter(Boolean)
/** A draft's body as paragraphs, or, when two or more lines start a card, the lines before them and the cards (apCfParas). */
export function bodyOf(t: string): Body {
  const all = String(t || '').split(/\n/)
  if (all.filter((l) => CARD_RE.test(l.trim())).length < 2) return { paras: paras(t), cards: [] }
  const cards: Body['cards'] = []
  const lead: string[] = []
  for (const l of all) {
    const s = l.trim()
    if (!s) continue
    if (CARD_RE.test(s)) cards.push({ h: s.replace(/^#{1,3}\s*/, '').replace(/\*\*/g, ''), lines: [] })
    else if (cards.length) cards[cards.length - 1].lines.push({ text: s, note: /^(Notes|From|Caption|Post copy)\s*:/i.test(s) })
    else lead.push(s)
  }
  return { paras: lead.length ? paras(lead.join('\n')) : [], cards }
}

/** The version a teammate copies: the picked hook, the body, the call to action and the hashtags (apCfDraftText). */
export function draftText(d: Draft, hi: number): string {
  return [d.hooks[hi]?.text ?? '', d.body, d.cta, d.hashtags.join(' ')].filter(Boolean).join('\n\n')
}
/** Every hook or subject line, one per line, each with its label. */
export const hooksText = (d: Draft) => d.hooks.map((h) => (h.label ? h.label + ': ' : '') + h.text).join('\n')
/** The .txt download (apCfDownload): its name and its text. */
export function draftFile(d: Draft): { name: string; text: string } {
  const L: string[] = [d.title, 'Format: ' + fmtName(d.format, d.contentType), '']
  for (const h of d.hooks) L.push((h.label || 'Hook') + ': ' + h.text)
  L.push('', d.body, '', d.cta ? 'CTA: ' + d.cta : '', d.headline ? 'Headline: ' + d.headline : '', d.hashtags.join(' '))
  if (d.flags.length) {
    L.push('', 'Check before publishing:')
    for (const f of d.flags) L.push('- ' + f)
  }
  const name =
    (
      d.title
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'draft'
    ) + '.txt'
  return { name, text: L.join('\n') }
}

// ---------- how a draft was made ----------

const pulledLine = (p: Pulled | null): string[] =>
  p
    ? [
        p.ideas ? plural(p.ideas, 'idea') : '',
        p.stories ? plural(p.stories, 'story', 'stories') : '',
        p.frameworks ? plural(p.frameworks, 'framework') : '',
        p.dataPoints ? plural(p.dataPoints, 'data point') : '',
        p.quotes ? plural(p.quotes, 'quote') : '',
      ].filter(Boolean)
    : []

export type Made = {
  heading: string
  lead: string
  you: { title: string; text: string; items: string[] }
  org: { led: boolean; day: string; text: string; items: string[] }
  ads: { led: boolean; day: string; text: string; items: string[] }
  house: string
}
/** How this draft was made (the e9MadeD panel): from the team, the two briefs, and the house settings it followed. */
export function madeOf(d: Draft, req: Req | undefined, briefDay: (kind: 'org' | 'ads', run: string) => string): Made {
  const lead = leadOf(d.brief)
  const pulled = pulledLine(d.pulled ?? req?.pulled ?? null)
  const b = d.brief
  const approved = (ok: boolean) => (ok ? 'Approved at the time.' : 'Not approved yet at the time, so it was the newest instead.')
  const h = d.house
  const house = [
    h.rules !== null ? plural(h.rules, 'house rule') : '',
    h.template ? 'template “' + h.template + '”' : 'no template',
    h.kbDocs !== null ? plural(h.kbDocs, 'knowledge base document') : '',
    d.voice ? 'voice: ' + d.voice : '',
    h.feedback > 0 ? plural(h.feedback, 'ask') + ' from earlier drafts' : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    heading: 'Your ' + (d.startMode === 'idea' ? 'idea' : (SRC[d.sourceType] || 'source').toLowerCase()) + ', packaged with the market briefs',
    lead:
      (lead === 'ad'
        ? 'The ad brief led the packaging, the organic brief supported it.'
        : lead === 'org'
          ? 'The organic brief led the packaging, the ad brief supported it.'
          : 'Both briefs shaped the packaging.') + ' Every claim comes from your source.',
    you: {
      title: req?.title || d.title || 'Your source',
      text: pulled.length ? 'Pulled out: ' + pulled.join(' · ') : 'Your own words and point of view.',
      items: b.substance.slice(0, 2).map((x) => words(x, 14)),
    },
    org: {
      led: lead === 'org',
      day: b.intelRun ? briefDay('org', b.intelRun) || 'Earlier brief' : '',
      text: b.intelRun ? approved(b.intelApproved) : 'No organic brief was on file.',
      items: b.packaging.slice(0, 2).map((x) => words(x, 14)),
    },
    ads: {
      led: lead === 'ad',
      day: b.adRun ? briefDay('ads', b.adRun) || 'Earlier brief' : '',
      text: b.adRun ? approved(b.adApproved) : 'No ad brief was on file.',
      items: b.strategic.slice(0, 2).map((x) => words(x, 14)),
    },
    house,
  }
}

// ---------- the content library ----------

export const PIECE_ST: Readonly<Record<string, string>> = { draft: 'Draft', ready: 'Ready', used: 'Used' }
export type Piece = {
  id: string
  title: string
  format: string
  status: string
  hooks: string[]
  body: string
  cta: string
  headline: string
  tags: string[]
  notes: string
  sourceDraftId: string
  sourceRequestId: string
  createdAt: string
  updatedAt: string
  updatedBy: string
}
export const pieceOf = (p: Row): Piece => ({
  id: str(p.id),
  title: str(p.title),
  format: str(p.format),
  status: str(p.status) || 'draft',
  hooks: arr(p.hooks).map((h) => (typeof h === 'string' ? h : str(json(h).text))).map((s) => s.trim()).filter(Boolean),
  body: str(p.body),
  cta: str(p.cta),
  headline: str(p.headline),
  tags: arr(p.tags).map((t) => str(t)).filter(Boolean),
  notes: str(p.notes),
  sourceDraftId: str(p.source_draft_id),
  sourceRequestId: str(p.source_request_id),
  createdAt: str(p.created_at),
  updatedAt: str(p.updated_at),
  updatedBy: str(p.updated_by),
})

/** The piece editor's boxes. */
export type PieceForm = {
  title: string
  format: string
  hooks: string
  body: string
  cta: string
  headline: string
  tags: string
  status: string
  notes: string
}
/** The library's own formats in the editor: the four, and Other. */
export const PIECE_FMT: readonly (readonly [string, string])[] = [...Object.entries(FMT), ['other', 'Other']]
export const formOfPiece = (p: Piece): PieceForm => ({
  title: p.title,
  format: p.format in FMT ? p.format : 'other',
  hooks: p.hooks.join('\n'),
  body: p.body,
  cta: p.cta,
  headline: p.headline,
  tags: p.tags.join(', '),
  status: p.status in PIECE_ST ? p.status : 'draft',
  notes: p.notes,
})
/** A draft as a new library piece (apCpFromDraft): the hook on screen first, then the others. */
export function formOfDraft(d: Draft, hi: number): PieceForm {
  const hooks = d.hooks.map((h) => h.text)
  const k = hooks.length ? Math.min(hi, hooks.length - 1) : 0
  const ord = hooks.length ? [hooks[k], ...hooks.filter((_, i) => i !== k)] : []
  return {
    title: d.title,
    format: d.format in FMT ? d.format : d.format ? 'other' : 'ad',
    hooks: ord.join('\n'),
    body: d.body,
    cta: d.cta,
    headline: d.headline,
    tags: '',
    status: 'draft',
    notes: '',
  }
}
/** Tags as the library keeps them (apCxTags): lower case, no #, dashes for spaces, 30 characters, 12 at most, once each. */
export function tagsOf(s: string | string[]): string[] {
  const a = (Array.isArray(s) ? s : String(s || '').split(','))
    .map((t) =>
      String(t || '')
        .trim()
        .toLowerCase()
        .replace(/^#/, '')
        .replace(/\s+/g, '-')
        .slice(0, 30),
    )
    .filter(Boolean)
  return a.filter((t, i) => a.indexOf(t) === i).slice(0, 12)
}
export type PieceRow = {
  title: string
  format: string
  hooks: string[]
  body: string
  cta: string
  headline: string
  tags: string[]
  status: string
  notes: string
}
/** The editor's boxes as a row (apCpForm), and what stops a save. */
export function pieceRow(f: PieceForm): { ok: true; row: PieceRow } | { ok: false; error: string } {
  const row: PieceRow = {
    title: str(f.title).trim().slice(0, 200) || 'Untitled piece',
    format: str(f.format) in FMT ? str(f.format) : 'other',
    hooks: str(f.hooks)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10),
    body: str(f.body).slice(0, 60000),
    cta: str(f.cta).trim().slice(0, 200),
    headline: str(f.headline).trim().slice(0, 200),
    tags: tagsOf(str(f.tags).slice(0, 300)),
    status: str(f.status) in PIECE_ST ? str(f.status) : 'draft',
    notes: str(f.notes).trim().slice(0, 2000),
  }
  if (!row.body.trim() && !row.hooks.length) return { ok: false, error: 'Add a body or at least one hook.' }
  return { ok: true, row }
}
/** What ⧉ Copy gives in the editor: the first hook, the body and the call to action (apCpText). */
export const pieceText = (f: Pick<PieceRow, 'hooks' | 'body' | 'cta'>) => [f.hooks[0] || '', f.body || '', f.cta || ''].filter(Boolean).join('\n\n')

// ---------- ideas ----------

export type Note = { id: string; note: string; tags: string[]; status: string; createdBy: string; createdAt: string }
export const noteOf = (n: Row): Note => ({
  id: str(n.id),
  note: str(n.note),
  tags: arr(n.tags).map((t) => str(t)).filter(Boolean),
  status: str(n.status),
  createdBy: str(n.created_by),
  createdAt: str(n.created_at),
})
/** The ideas still open (nwCtOpenIdeas): not used or archived. */
export const openNotes = (notes: Note[]) => notes.filter((n) => n.status !== 'used' && n.status !== 'archived')
/** A new idea's tags (nwIdeaSave): split at commas, 8 at most. */
export const noteTags = (s: string) =>
  String(s || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8)

/** The newest organic brief's five things (nwCtIdeas): its snapshot, else its TL;DR. */
export function briefIdeas(md: string, snapshot: unknown): SnapItem[] {
  return (snapItems(snapshot) ?? orgFallback(md)).filter((x) => x && x.text).slice(0, 5).map((x) => ({ text: tidy(x.text), why: tidy(x.why), tag: x.tag }))
}
/** How many of the brief's five things the Ideas tab shows. */
export const briefIdeasCount = (b: { items: SnapItem[] } | null) => (b ? b.items.length : 0)
/** A tag as a label: dashes and underscores as spaces, the first letter capital (apLabelCase). */
export function labelCase(s: string): string {
  const t = String(s || '')
    .replace(/[-_]+/g, ' ')
    .trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/** What the team has given the engine (nwCtPieces): the saved pieces, then the material of earlier requests, once by title, newest first. */
export type Shelf = { k: 'piece' | 'request'; id: string; title: string; sub: string; tags: string[]; at: string }
export function shelfOf(pieces: Piece[], reqs: Req[], day: (iso: string) => string): Shelf[] {
  const out: Shelf[] = []
  for (const p of pieces.slice(0, 60)) {
    const at = p.updatedAt || p.createdAt
    out.push({
      k: 'piece',
      id: p.id,
      title: p.title || 'Untitled',
      tags: p.tags,
      sub: [FMT[p.format] || 'Piece', PIECE_ST[p.status] || '', (p.status === 'draft' ? 'saved ' : 'updated ') + day(at)].filter(Boolean).join(' · '),
      at,
    })
  }
  for (const r of reqs) {
    if (r.startMode === 'idea' || r.sourceType === 'brief' || !r.title) continue
    out.push({ k: 'request', id: r.id, title: r.title, tags: [], sub: (SRC[r.sourceType] || 'Material') + ' · added ' + day(r.createdAt), at: r.createdAt })
  }
  const seen = new Set<string>()
  return out
    .filter((x) => {
      const t = x.title.toLowerCase().replace(/^sample · /, '')
      if (seen.has(t)) return false
      seen.add(t)
      return true
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

// ---------- the address ----------

export type Tab = 'new' | 'drafts' | 'ideas'
/** The tab an address asks for: the old words carried over (library is Ideas, requests is Drafts). */
export function tabOf(w: string | null): Tab {
  const t = ({ library: 'ideas', requests: 'drafts', voice: 'new', how: 'new' } as Record<string, string>)[w ?? ''] ?? w
  return t === 'drafts' || t === 'ideas' ? t : 'new'
}
/** A draft's own address on this page. */
export const draftHref = (id: string) => '/content-transformation?tab=drafts&draft=' + encodeURIComponent(id)
