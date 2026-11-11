// Approvals' rules (nwApprovalAll, nwApprovalsHtml and nwRowHtml as v117 and v127 left them): one list of everything
// waiting for a person, the filter tabs and their counts, and what a tab shows. Pure: the page and the tests both use it.

import { legacyUrl, pageBySlug } from '@/lib/nav'

export type Kind = 'brief' | 'ad' | 'draft' | 'reply' | 'lead' | 'comment' | 'failed'

/** The tabs after All, in the current dashboard's order: the kind, its label, and its word in the address (?tab=). */
export const KINDS: readonly (readonly [Kind, string, string])[] = [
  ['brief', 'Briefs', 'briefs'],
  ['ad', 'Ads', 'ads'],
  ['draft', 'Drafts', 'drafts'],
  ['reply', 'Replies', 'replies'],
  ['lead', 'Leads', 'leads'],
  ['comment', 'Comments', 'comments'],
  ['failed', 'Failed', 'failed'],
]

export type Icon = 'file' | 'megaphone' | 'pen' | 'message' | 'users' | 'alert'
/** A tag under a row: words, or a day drawn in the viewer's time zone ("5 Nov", "Campaign of 5 Nov"). */
export type Tag = { text: string; tone?: 'bad' | 'warn' } | { day: string; before?: string }
/** Where Review goes: the reply window here, or a page (`out`: still in the current dashboard). */
export type Review = { kind: 'reply' } | { kind: 'link'; href: string; label?: string; out?: boolean }

export type ReplyRow = {
  id: string
  competitor: string
  platform: string
  action: string
  draft: string
  sourceUrl: string
  createdAt: string
}

export type Item = {
  key: string
  kind: Kind
  icon: Icon
  img?: string
  title: string
  /** a day after the title ("Organic brief · 5 Nov"), drawn in the viewer's time zone */
  titleDay?: string
  text: string
  tags: Tag[]
  /** it can be approved (or resolved) from the list */
  approve: boolean
  approveLabel?: string
  review: Review
  when: string
  /** a reply more than a week old: left out of the counts and of All */
  stale?: boolean
  reply?: ReplyRow
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** "1 reply", "3 replies", "2 failed requests" (nwKindLabel). */
export function kindLabel(k: Kind, n: number): string {
  const one: Record<Kind, string> = { brief: 'brief', ad: 'ad', draft: 'draft', reply: 'reply', lead: 'lead', comment: 'comment', failed: 'failed request' }
  const many: Partial<Record<Kind, string>> = { reply: 'replies', failed: 'failed requests' }
  return n + ' ' + (n === 1 ? one[k] : (many[k] ?? one[k] + 's'))
}

/** Cut to n characters at a word, with an ellipsis (nwClip). */
export function clip(t: string, n: number): string {
  const s = str(t).replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s
}

/** A snapshot line as the current dashboard tidies it: dashes become commas, spaces fold (e9Clean). */
export const tidy = (s: unknown) =>
  str(s)
    .replace(/\s*[‒-―]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

/** The first n words, with an ellipsis when there were more (e9Words). */
export function words(s: unknown, n: number): string {
  const w = str(s).split(/\s+/).filter(Boolean)
  return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' ')
}

/** Markdown's emphasis and links taken out of a TL;DR line (apCfClean). */
const mdClean = (s: unknown) =>
  str(s)
    .replace(/\\([_*#])/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()

/** The TL;DR bullets of an intel brief's markdown: [{title, text}] (apCfTldr). */
export function tldr(md: string): { title: string; text: string }[] {
  const s = str(md)
  const i = s.search(/TL;DR/i)
  if (i < 0) return []
  const out: { title: string; text: string }[] = []
  for (const line of s.slice(i).split('\n').slice(1)) {
    if (/^\s*(##|---)/.test(line) && out.length) break
    const m = /^\s*[-*]\s+(.*)$/.exec(line)
    if (!m) continue
    const b = /^\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(m[1])
    out.push(b ? { title: mdClean(b[1]).replace(/:$/, ''), text: mdClean(b[2]) } : { title: '', text: mdClean(m[1]) })
  }
  return out
}

export type SnapItem = { text: string; why: string; tag: string }

/** A brief's snapshot ("five things, one minute"): JSON, maybe stored as a string twice over (e9Parse, e9Snap). */
export function snapItems(v: unknown): SnapItem[] | null {
  let x = v
  for (let i = 0; i < 2 && typeof x === 'string'; i++) {
    try {
      x = JSON.parse(x)
    } catch {
      return null
    }
  }
  const items = x && typeof x === 'object' ? (x as { items?: unknown }).items : null
  if (!Array.isArray(items) || !items.length) return null
  return items.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>
    return { text: str(o.text), why: str(o.why), tag: str(o.tag) }
  })
}

/** The organic brief's fallback when it has no snapshot: its TL;DR (e9OrgFallback). */
export const orgFallback = (md: string): SnapItem[] =>
  tldr(md)
    .slice(0, 5)
    .map((x) => ({ text: words(x.title || x.text, 8), why: words(x.text, 16), tag: 'Theme' }))

const list = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

/** The ads brief's fallback: its winning hooks, then one pain point (e9AdFallback). */
export const adFallback = (b: { winning_hooks?: unknown; core_pain_points?: unknown }): SnapItem[] =>
  list(b.winning_hooks)
    .slice(0, 4)
    .map((h) => ({ text: words(h, 8), why: '', tag: 'Hook' }))
    .concat(
      list(b.core_pain_points)
        .slice(0, 1)
        .map((p) => ({ text: words(p, 8), why: '', tag: 'Pain' })),
    )

/** "text. why" (nwItemLine). */
export const itemLine = (it: SnapItem | undefined) => (it ? tidy(it.text) + (it.why ? '. ' + tidy(it.why) : '') : '')

/** A brief waits for a decision when it has none, or its newest one was undone ("reopened") or an edit ("edited"). */
export function undecided(decisions: { action: string }[]): boolean {
  const d = decisions[0]
  return !d || d.action === 'reopened' || d.action === 'edited'
}

/** Whole days since a time (nwDaysAgo), or null. */
export function daysAgo(iso: string, now: number): number | null {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.floor((now - t) / 864e5)
}

export type IntelBrief = { run_id: string; created_at: string; content_md: string; n_items: number }
export type AdsBrief = { run_id: string; created_at: string; winning_hooks: unknown; core_pain_points: unknown }
/** A content request (content_requests): one with status error waits as a failed request. */
export type ContentRequest = { id: string; title: string; status: string; error: string; created_at: string }
/** A content draft (agent_outputs, content_generation content_draft), its data read from JSON. */
export type ContentDraft = { id: string; title: string; created_at: string; data: Record<string, unknown> }
/** A book a call or low-ticket campaign (agent_outputs, low_ticket_content): the newest row of a run, data read. */
export type Campaign = { run_id: string; created_at: string; data: Record<string, unknown> }

export type ApprovalInput = {
  intel: IntelBrief | null
  ads: AdsBrief | null
  /** brief_approval decisions by run id, newest first */
  decisions: Record<string, { action: string }[]>
  /** snapshots by run id */
  snaps: Record<string, unknown>
  /** pending replies, newest first */
  replies: ReplyRow[]
  /** content requests, newest first (the newest 60, as apCfLoad reads them) */
  requests?: ContentRequest[]
  /** content drafts, newest first, and the ones marked ready (a draft_review row with action ready) */
  drafts?: ContentDraft[]
  ready?: string[]
  /** campaigns, newest first, one per run; their ad hooks by run (funnel_packages); each image's newest decision */
  campaigns?: Campaign[]
  hooks?: Record<string, string[]>
  adDecisions?: Record<string, string>
  /** the current dashboard's address, where the briefs page still lives */
  legacy: string
  now: number
}

/** A hook as a campaign keeps it: a line, or {hook | text | line} (v97Hook). */
export function hookText(h: unknown): string {
  if (typeof h === 'string') return h
  const o = (h ?? {}) as Record<string, unknown>
  return str(o.hook || o.text || o.line)
}

/** A campaign's ad images that have a file (the ones that can be decided on). */
export function adImages(c: Campaign): { file: string; url: string; label: string }[] {
  return list(c.data.ad_images)
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !!(i as Record<string, unknown>).file)
    .map((i) => ({ file: str(i.file), url: str(i.url), label: str(i.label) }))
}

/** The labels Approvals gives a draft's format (AP_CF_FMT); any other format is Content. */
export const FORMATS: Record<string, string> = { ad: 'Paid ad', thought_leadership: 'Thought leadership', newsletter: 'Newsletter', email: 'Email' }

/** A draft's title (apCfDraftTitle): its own, the brief's when the agent left "Draft title", else Content draft. */
export function draftTitle(o: ContentDraft): string {
  let t = str(o.data.title || o.title)
  if (/^draft title$/i.test(t)) t = str(((o.data.brief ?? {}) as Record<string, unknown>).title)
  return t || 'Content draft'
}

/** Everything waiting for a person, in the current dashboard's order (failed requests, the organic brief, the ads brief, ads, drafts, replies, leads, comments). */
export function approvalItems(x: ApprovalInput): Item[] {
  const out: Item[] = []
  const at = (slug: string, label?: string): Review => ({ kind: 'link', href: legacyUrl(x.legacy, pageBySlug(slug)), label, out: true })
  for (const r of x.requests ?? []) {
    if (r.status !== 'error') continue
    out.push({
      key: 'req:' + r.id,
      kind: 'failed',
      icon: 'alert',
      title: (r.title || 'A content request') + ' did not finish',
      text: r.error || 'Open it to see why and try again.',
      tags: [{ text: 'Failed', tone: 'bad' }, { text: 'Content Transformation' }, { day: r.created_at }],
      approve: false,
      review: at('content-transformation'),
      when: r.created_at,
    })
  }
  const briefs = at('briefs')
  const ib = x.intel
  if (ib && ib.run_id && undecided(x.decisions[ib.run_id] ?? [])) {
    const items = (snapItems(x.snaps[ib.run_id]) ?? orgFallback(ib.content_md)).filter((s) => s.text).slice(0, 5)
    out.push({
      key: 'brief:intel_tracker:' + ib.run_id,
      kind: 'brief',
      icon: 'file',
      title: 'Organic brief',
      titleDay: ib.created_at,
      text: items[0] ? itemLine(items[0]) : 'What the people and topics you follow are talking about.',
      tags: [{ text: 'Brief' }, { text: 'From Intel Tracker' }, ...(ib.n_items ? [{ text: ib.n_items + (ib.n_items === 1 ? ' post' : ' posts') }] : [])],
      approve: true,
      review: briefs,
      when: ib.created_at,
    })
  }
  const ab = x.ads
  if (ab && ab.run_id && undecided(x.decisions[ab.run_id] ?? [])) {
    const days = daysAgo(ab.created_at, x.now)
    const it = (snapItems(x.snaps[ab.run_id]) ?? adFallback(ab))[0]
    out.push({
      key: 'brief:ad_strategist:' + ab.run_id,
      kind: 'brief',
      icon: 'file',
      title: 'Ads brief',
      titleDay: ab.created_at,
      text: it ? itemLine(it) : 'The competitor ads that keep running, and why.',
      tags: [{ text: 'Brief' }, { text: 'From Ad Strategist' }, ...(days !== null && days >= 14 ? [{ text: days + ' days old', tone: 'warn' as const }] : [])],
      approve: true,
      review: briefs,
      when: ab.created_at,
    })
  }
  // the ad images of the three newest campaigns that nobody has approved or turned down
  for (const c of (x.campaigns ?? []).slice(0, 3)) {
    const imgs = adImages(c)
    const dec = x.adDecisions ?? {}
    const ok = imgs.filter((i) => dec[i.file] === 'approved').length
    const hooks = x.hooks?.[c.run_id] ?? []
    imgs.forEach((im, i) => {
      if (dec[im.file] === 'approved' || dec[im.file] === 'rejected') return
      out.push({
        key: 'ad:' + c.run_id + ':' + im.file,
        kind: 'ad',
        icon: 'megaphone',
        img: safeUrl(im.url) || undefined,
        title: 'Ad ' + (i + 1) + ' · ' + (str(c.data.offer_name) || 'Campaign'),
        text: hooks[i] || im.label,
        tags: [{ text: 'Ad' }, { day: c.created_at, before: 'Campaign of ' }, { text: ok + ' of ' + imgs.length + ' approved' }],
        approve: true,
        review: at('marketing-generation'),
        when: c.created_at,
      })
    })
  }
  // content drafts nobody has marked ready: checked and approved on their own page
  const ready = new Set(x.ready ?? [])
  for (const o of x.drafts ?? []) {
    if (ready.has(o.id)) continue
    const h = list(o.data.hooks)[0] as Record<string, unknown> | undefined
    out.push({
      key: 'draft:' + o.id,
      kind: 'draft',
      icon: 'pen',
      title: draftTitle(o),
      text: clip(str(h?.text) || str(o.data.body), 200),
      tags: [{ text: 'Draft' }, { text: FORMATS[str(o.data.format)] || 'Content' }, { day: o.created_at }],
      approve: false,
      review: at('content-transformation', 'Check and approve'),
      when: o.created_at,
    })
  }
  for (const r of x.replies) {
    const age = daysAgo(r.createdAt, x.now)
    out.push({
      key: 'reply:' + r.id,
      kind: 'reply',
      icon: 'message',
      title: (r.action === 'quote_post' ? 'Quote post on ' : 'Reply to ') + (r.competitor || 'a post'),
      text: r.draft,
      tags: [{ text: 'Reply' }, { text: platformLabel(r.platform) }, { day: r.createdAt }],
      approve: true,
      review: { kind: 'reply' },
      when: r.createdAt,
      stale: age !== null && age > 7,
      reply: r,
    })
  }
  return out
}

export const platformLabel = (p: string) => (str(p).toLowerCase() === 'linkedin' ? 'LinkedIn' : p || 'Social')

// ---------- what a tab shows ----------

export type TabKey = Kind | 'all' | 'skipped'
export const PAGE = 20

/** The tab an address word asks for (?tab=replies), All when it is unknown. */
export function tabFromWord(w: string | null): TabKey {
  if (w === 'skipped') return 'skipped'
  return KINDS.find((k) => k[2] === w)?.[0] ?? 'all'
}
export const wordOf = (t: TabKey) => (t === 'all' ? '' : t === 'skipped' ? 'skipped' : (KINDS.find((k) => k[0] === t)?.[2] ?? ''))

export type View = {
  /** the tab shown: a kind with nothing in it, or Skipped with nothing skipped, shows All */
  tab: TabKey
  /** waiting: not skipped and not older than a week */
  waiting: number
  tabs: { key: TabKey; label: string; n: number }[]
  rows: Item[]
  /** how many rows the tab has in all (the "Show 20 more of N" line) */
  total: number
  /** on All: how many replies more than the five shown */
  replyMore: number
  /** on Replies: the ones more than a week old */
  old: Item[]
  skipped: Item[]
}

export function viewOf(all: Item[], skips: Record<string, unknown>, asked: TabKey, more: number): View {
  const isSkipped = (x: Item) => !!skips[x.key]
  const live = all.filter((x) => !isSkipped(x))
  const fresh = live.filter((x) => !x.stale)
  const skipped = all.filter(isSkipped)
  const cnt: Partial<Record<Kind, number>> = {}
  for (const x of fresh) cnt[x.kind] = (cnt[x.kind] ?? 0) + 1
  // v117: a Replies tab shows 0 when only replies older than a week are left; they sit in their own box
  if (cnt.reply === undefined && live.some((x) => x.stale)) cnt.reply = 0
  let tab = asked
  if (tab !== 'all' && tab !== 'skipped' && cnt[tab] === undefined) tab = 'all'
  if (tab === 'skipped' && !skipped.length) tab = 'all'
  let rows = tab === 'all' ? fresh : tab === 'skipped' ? skipped : live.filter((x) => x.kind === tab)
  let replyMore = 0
  if (tab === 'all') {
    const r = rows.filter((x) => x.kind === 'reply')
    if (r.length > 5) {
      replyMore = r.length - 5
      const keep = new Set(r.slice(0, 5).map((x) => x.key))
      rows = rows.filter((x) => x.kind !== 'reply' || keep.has(x.key))
    }
  }
  const old = tab === 'reply' ? rows.filter((x) => x.stale) : []
  if (tab === 'reply') rows = rows.filter((x) => !x.stale)
  const tabs: View['tabs'] = [{ key: 'all', label: 'All', n: fresh.length }]
  for (const [k, label] of KINDS) if (cnt[k] !== undefined) tabs.push({ key: k, label, n: cnt[k]! })
  if (skipped.length) tabs.push({ key: 'skipped', label: 'Skipped', n: skipped.length })
  return { tab, waiting: fresh.length, tabs, rows: rows.slice(0, more), total: rows.length, replyMore, old, skipped }
}

/** The kinds waiting, as Today's chips say them ("2 briefs", "4 replies"). */
export function waitingChips(all: Item[], skips: Record<string, unknown>): { kind: Kind; n: number; label: string }[] {
  const fresh = all.filter((x) => !skips[x.key] && !x.stale)
  return KINDS.map(([k]) => ({ kind: k, n: fresh.filter((x) => x.kind === k).length }))
    .filter((c) => c.n > 0)
    .map((c) => ({ ...c, label: kindLabel(c.kind, c.n) }))
}

// ---------- a rejected reply's reason ----------

export const WHY: readonly (readonly [string, string])[] = [
  ['voice', 'Off-voice'],
  ['salesy', 'Too salesy'],
  ['long', 'Too long'],
  ['generic', 'Too generic'],
  ['topic', 'Off-topic'],
  ['skip', 'Not worth a reply'],
]

/** "Reply: too salesy, too long. Skip posts about a client loss." ('' with nothing picked or written; v127WhyText). */
export function whyText(picked: string[], note: string): string {
  const w = WHY.filter((x) => picked.includes(x[0])).map((x) => x[1].toLowerCase())
  const n = str(note).replace(/\s+/g, ' ').trim()
  if (!w.length && !n) return ''
  return ('Reply: ' + [w.length ? w.join(', ') + '.' : '', n].filter(Boolean).join(' ')).slice(0, 600)
}

// ---------- the keys a write takes ----------

export type Key =
  | { kind: 'brief'; agent: 'intel_tracker' | 'ad_strategist'; runId: string }
  | { kind: 'reply'; id: string }
  | { kind: 'ad'; runId: string; file: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RUN = /^[\w.:-]{1,120}$/
const AD_RUN = /^[\w.-]{1,120}$/
const FILE = /^[^\s<>"'`\\]{1,300}$/

/** A row's key read back from the browser: only the kinds this page writes, with ids that look like ids. */
export function parseKey(k: unknown): Key | null {
  const p = str(k).split(':')
  if (p[0] === 'brief' && (p[1] === 'intel_tracker' || p[1] === 'ad_strategist')) {
    const runId = p.slice(2).join(':')
    return RUN.test(runId) ? { kind: 'brief', agent: p[1], runId } : null
  }
  if (p[0] === 'reply' && p.length === 2 && UUID.test(p[1])) return { kind: 'reply', id: p[1] }
  // an ad image: its campaign's run, then its file (the decision's target_id, as nwApproveOne keeps it)
  if (p[0] === 'ad' && AD_RUN.test(p[1] ?? '')) {
    const file = p.slice(2).join(':')
    return FILE.test(file) ? { kind: 'ad', runId: p[1], file } : null
  }
  return null
}

/** A link a reply answers, only when it is a web address. */
export const safeUrl = (u: unknown) => (/^https?:\/\/[^\s"'<>]+$/i.test(str(u)) ? str(u) : '')
