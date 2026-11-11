// The Pipeline Overview's rules (NW_PAGES['e3.overview'] as v107 to v115 left it): which cards show and in what order,
// the six agent tiles, what the agents know about the team (v98KbItems) and a campaign's approval line. Plain functions,
// so the server, the page and the tests share them; dates come in already worded by the caller.

import { plural } from '@/lib/touchpoint/today'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

// ---------- the cards and their order (NW_W, nwWOrder, nwWHidden) ----------

export type WKey = 'needs' | 'quick' | 'agents' | 'lead' | 'camp' | 'voice' | 'tl' | 'runs'

/** Each card's width on a wide screen, in the order the Overview shows them when nobody has moved one. */
export const W: Readonly<Record<WKey, 1 | 2 | 3>> = { needs: 2, quick: 1, agents: 3, lead: 1, camp: 1, voice: 1, tl: 1, runs: 2 }
export const W_KEYS = Object.keys(W) as WKey[]
export const W_NAME: Readonly<Record<WKey, string>> = {
  needs: 'Needs you',
  quick: 'Quick start',
  agents: 'Agents',
  lead: 'This week’s lead',
  camp: 'Latest campaign',
  voice: 'Voice and context',
  tl: 'Latest thought leadership',
  runs: 'Recent runs',
}
const isKey = (k: unknown): k is WKey => typeof k === 'string' && k in W

/** The order saved in this browser, with unknown cards left out and new ones at the end. */
export function orderOf(saved: unknown): WKey[] {
  const o = Array.isArray(saved) ? [...new Set(saved.filter(isKey))] : W_KEYS.slice()
  for (const k of W_KEYS) if (!o.includes(k)) o.push(k)
  return o
}

/** The cards hidden in this browser. */
export function hiddenOf(saved: unknown): WKey[] {
  return Array.isArray(saved) ? [...new Set(saved.filter(isKey))] : []
}

/** The order with one card moved a place earlier (-1) or later (1); null when it cannot move. */
export function moved(order: WKey[], k: WKey, d: -1 | 1): WKey[] | null {
  const i = order.indexOf(k)
  const j = i + d
  if (i < 0 || j < 0 || j >= order.length) return null
  const o = order.slice()
  o.splice(i, 1)
  o.splice(j, 0, k)
  return o
}

// ---------- the agent tiles (nwAgentTiles) ----------

export type Dot = '' | 'good' | 'warn' | 'bad'
export type RunInfo = { status: string; at: string }

/** A run's status as the current dashboard reads it (nwRunOk). */
export const runOk = (r: RunInfo | null) => !!r && /^(success|done|ok|completed)$/i.test(r.status)

/** Whole days since a time, as nwDaysAgo counts them; null without a time. */
export function daysAgo(iso: string | null | undefined, now: number): number | null {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null
}

/** "today", "yesterday", "4 days ago" (nwAgo). */
export function agoDays(iso: string | null | undefined, now: number): string {
  const d = daysAgo(iso, now)
  if (d === null) return ''
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'
}

/** good when it ran within so many days, warn when longer ago, bad when it did not finish. */
function dotOf(r: RunInfo | null, days: number, now: number): Dot {
  if (!r) return ''
  if (!runOk(r)) return 'bad'
  const a = daysAgo(r.at, now)
  return a !== null && a > days ? 'warn' : 'good'
}

export type TileInput = {
  /** the newest organic brief: when, and what it counted */
  intelBrief: { createdAt: string; nItems: number | null; nHigh: number | null } | null
  /** posts the tracker has read (when the brief does not say) */
  intelPosts: number
  adsBrief: { createdAt: string } | null
  /** ads the Ad Strategist keeps */
  ads: number
  intelRun: RunInfo | null
  adsRun: RunInfo | null
  /** the tracker's drafted replies waiting, from the last week */
  replies: number
  /** briefs waiting for a decision */
  briefsWaiting: number
  drafts: { n: number; toCheck: number; latest: string | null }
  campaigns: { n: number; latest: string | null }
  results: { n: number; read: string | null }
}

export type Tile = { slug: string; name: string; n: number; u: string; l: string; s: string; dot: Dot; why: string }

export type Words = { day: (iso: string) => string; when: (iso: string) => string }

const unit = (n: number, one: string) => plural(n, one).replace(/^\d+ /, '')

export function agentTiles(x: TileInput, w: Words, now: number): Tile[] {
  const ri = x.intelRun
  const ra = x.adsRun
  const ib = x.intelBrief
  const ab = x.adsBrief
  return [
    {
      slug: 'intel-tracker',
      name: 'Intel Tracker',
      n: ib?.nItems || x.intelPosts,
      u: 'posts',
      l: x.replies
        ? plural(x.replies, 'reply', 'replies') + ' to approve'
        : ib?.nHigh
          ? ib.nHigh + ' high value in the last brief'
          : 'Reads the people and topics you follow',
      s: ri ? (runOk(ri) ? 'Last run ' : 'Last run failed · ') + w.when(ri.at) : 'Not run yet',
      dot: dotOf(ri, 9, now),
      why: ri && !runOk(ri) ? 'The last run did not finish' : '',
    },
    {
      slug: 'ad-strategist',
      name: 'Ad Strategist',
      n: x.ads,
      u: 'ads',
      l: ab ? 'Ads brief of ' + w.day(ab.createdAt) : 'No ads brief yet',
      s: ra ? 'Last run ' + w.day(ra.at) + ', ' + agoDays(ra.at, now) : 'Not run yet',
      dot: dotOf(ra, 9, now),
      why: ra && (daysAgo(ra.at, now) ?? 0) > 9 ? 'Last ran ' + agoDays(ra.at, now) : '',
    },
    {
      slug: 'briefs',
      name: 'Market Intelligence Briefs',
      n: x.briefsWaiting,
      u: 'to review',
      l: 'Approve before they shape drafts',
      s: [ib ? 'Organic ' + w.day(ib.createdAt) : '', ab ? 'Ads ' + w.day(ab.createdAt) : ''].filter(Boolean).join(' · ') || 'No briefs yet',
      dot: x.briefsWaiting ? 'warn' : ib || ab ? 'good' : '',
      why: '',
    },
    {
      slug: 'content-transformation',
      name: 'Content Transformation',
      n: x.drafts.n,
      u: unit(x.drafts.n, 'draft'),
      l: x.drafts.toCheck ? x.drafts.toCheck + ' to check' : 'From your own material',
      s: x.drafts.latest ? 'Latest ' + w.day(x.drafts.latest) : 'No drafts yet',
      dot: x.drafts.toCheck ? 'warn' : 'good',
      why: '',
    },
    {
      slug: 'marketing-generation',
      name: 'Marketing Generation',
      n: x.campaigns.n,
      u: unit(x.campaigns.n, 'campaign'),
      l: 'Ads and thought leadership',
      s: x.campaigns.latest ? 'Latest campaign ' + w.day(x.campaigns.latest) : 'No campaigns yet',
      dot: 'good',
      why: '',
    },
    {
      slug: 'ad-testing',
      name: 'Ad Testing',
      n: x.results.n,
      u: unit(x.results.n, 'result'),
      l: x.results.n ? 'Logged by your team' : 'Log your first result',
      s: x.results.read ? 'Strategy read ' + w.day(x.results.read) : 'No strategy read yet',
      dot: x.results.n ? 'good' : 'warn',
      why: '',
    },
  ]
}

// ---------- what the agents know about the team (v98KbItems) ----------

export type VoiceInput = {
  voice: { tone: unknown; summary: unknown; about: unknown; mission: unknown; values_text: unknown } | null
  industry: string
  targetMarket: string
  /** ai_settings brand_context: the offer and what makes the team different */
  context: { offer: string; differentiator: string }
  topics: string[]
  following: string[]
}

export type VoiceItem = { k: string; l: string; v: string }

const listOf = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(str).filter(Boolean)
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const p = JSON.parse(v)
      if (Array.isArray(p)) return p.map(str).filter(Boolean)
    } catch {
      // a plain line
    }
  }
  return str(v).trim() ? [str(v).trim()] : []
}

/** "a, b, c +2 more" (the first few, then how many more). */
const more = (a: string[], n: number) => (a.length ? a.slice(0, n).join(', ') + (a.length > n ? ' +' + (a.length - n) + ' more' : '') : '')

export function voiceItems(x: VoiceInput): VoiceItem[] {
  const c = x.voice
  const vline = c ? [listOf(c.tone).join(', '), str(c.summary || c.about).split(/\n+/)[0]].filter(Boolean).join(' · ') : ''
  return [
    { k: 'voice', l: 'Your voice', v: vline },
    { k: 'mission', l: 'Mission and values', v: c ? [str(c.mission), str(c.values_text)].filter(Boolean).join(' · ') : '' },
    { k: 'industry', l: 'Industry', v: x.industry },
    { k: 'icp', l: 'Ideal client', v: x.targetMarket },
    { k: 'offer', l: 'Primary offer', v: x.context.offer },
    { k: 'diff', l: 'What makes you different', v: x.context.differentiator },
    { k: 'topics', l: 'Priority topics', v: more(x.topics, 3) },
    { k: 'follow', l: 'Competitors followed', v: more(x.following, 3) },
  ]
}

/** The line under the count: what is still missing, or that it is all set. */
export function voiceLine(items: VoiceItem[]): string {
  const miss = items.filter((i) => !i.v.trim()).map((i) => i.l.toLowerCase())
  if (!miss.length) return 'Everything the agents read about you is set.'
  return 'Missing: ' + miss.slice(0, 4).join(', ') + (miss.length > 4 ? ' and ' + (miss.length - 4) + ' more' : '') + '. Drafts sound more like you once these are in.'
}

/** The team's offer and difference from ai_settings brand_context (v98Ctx), kept as an object or as JSON text. */
export function contextOf(v: unknown): { offer: string; differentiator: string } {
  let o: Record<string, unknown> = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) o = v as Record<string, unknown>
  else if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      if (p && typeof p === 'object' && !Array.isArray(p)) o = p
    } catch {
      // nothing set
    }
  }
  return { offer: str(o.offer).trim(), differentiator: str(o.differentiator).trim() }
}

// ---------- the latest campaign (nwOvCamp) ----------

export type CampImage = { url: string; label: string; file: string }

/** "All 3 approved", "1 of 3 approved" or "Waiting for approval", with its tone. */
export function campStatus(images: CampImage[], fb: Record<string, string>): { tone: 'good' | 'warn' | 'info'; text: string } {
  const all = images.filter((i) => i.file)
  if (!all.length) return { tone: 'info', text: 'Waiting for approval' }
  const ok = all.filter((i) => fb[i.file] === 'approved').length
  if (ok === all.length) return { tone: 'good', text: 'All ' + all.length + ' approved' }
  return { tone: ok ? 'warn' : 'info', text: ok + ' of ' + all.length + ' approved' }
}

/** A campaign's kind, as Marketing Generation names it (V97_PK). */
export const FUNNEL_MODE: Readonly<Record<string, string>> = { direct_to_call: 'Book a call', low_ticket: 'Low-ticket offer' }

/** A content draft's format, as Content Transformation names it (AP_CF_FMT). */
export const DRAFT_FORMAT: Readonly<Record<string, string>> = {
  ad: 'Paid ad',
  thought_leadership: 'Thought leadership',
  newsletter: 'Newsletter',
  email: 'Email',
}

/** A draft's title (apCfDraftTitle): its own, else the brief's when the agent left the placeholder. */
export function draftTitle(title: unknown, d: Record<string, unknown>): string {
  let t = str(d.title || title)
  const brief = d.brief && typeof d.brief === 'object' ? (d.brief as Record<string, unknown>) : {}
  if (/^draft title$/i.test(t)) t = str(brief.title)
  return t || 'Content draft'
}

/** Text cut at a word to so many characters, with an ellipsis (nwClip). */
export function clip(t: unknown, n: number): string {
  const s = str(t).replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s
}
