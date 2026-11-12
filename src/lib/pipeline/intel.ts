// The Intel Tracker's rules (v108, v99, v96 and e9 in the current dashboard): a post as the page draws it, its value
// and score, its themes, who wrote it, the five things and the posts closest to each, which brief a post went into and
// why, the runs, and when the next one is. Pure: the server, the page and the tests all use it.

import { type SnapItem, orgFallback, snapItems, tidy, words } from '@/lib/touchpoint/approvals'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** A number, or null for nothing, text that is not one, or infinity. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A JSON column as an object: several are kept as text inside jsonb, some twice over. */
export function json(v: unknown): Record<string, unknown> {
  let x = v
  for (let i = 0; i < 2 && typeof x === 'string'; i++) {
    try {
      x = JSON.parse(x)
    } catch {
      return {}
    }
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

/** A JSON column as a list (kept as text too). */
export function arr(v: unknown): unknown[] {
  let x = v
  for (let i = 0; i < 2 && typeof x === 'string'; i++) {
    try {
      x = JSON.parse(x)
    } catch {
      return []
    }
  }
  return Array.isArray(x) ? x : []
}

// ---------- small words ----------

/** "1,200" as "1.2k", "15,300" as "15k" (nwFmtN). */
export function fmtN(v: unknown): string {
  const n = num(v)
  if (n === null) return ''
  return n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? Math.round(n / 100) / 10 + 'k' : String(n)
}

/** A platform's name (nwPlat): LinkedIn, Facebook, X, Instagram, or Web when there is none. */
export function platLabel(p: unknown): string {
  const s = str(p).toLowerCase()
  if (s === 'linkedin') return 'LinkedIn'
  if (s === 'meta' || s === 'facebook') return 'Facebook'
  if (s === 'x' || s === 'twitter') return 'X'
  if (s === 'instagram') return 'Instagram'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Web'
}

const THEME_NAMES: Record<string, string> = {
  'ai-adoption': 'AI adoption',
  'tooling-update': 'Tooling update',
  'client-experience': 'Client experience',
  'product-dev': 'Product development',
  'thought-leadership': 'Thought leadership',
}

/** A theme as words (nwThemeLabel): "ai-adoption" is "AI adoption", "ria-growth" is "RIA growth". */
export function themeLabel(t: unknown): string {
  const raw = str(t).trim()
  const known = THEME_NAMES[raw.toLowerCase()]
  if (known) return known
  const s = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\bai\b/gi, 'AI').replace(/\bria(s)?\b/gi, (_m, p) => 'RIA' + (p || ''))
}

/** The key two spellings of one theme share. */
export const themeKey = (t: unknown) => themeLabel(t).toLowerCase()

/** Two letters for an avatar (nwInitials). */
export function initialsOf(s: unknown): string {
  const w = str(s).replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  return ((w[0] ?? '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase()
}

/** The avatar's colour, the same for the same name (nwHue). */
export function hueOf(s: unknown): number {
  let h = 0
  for (const c of str(s)) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** "1st", "2nd", "3rd", "11th" (v99Ord). */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "9 Nov 2026" (v98D with the year), in `timeZone` (the viewer's own when none); a plain date is read as that day. */
export function longDay(v: unknown, timeZone?: string): string {
  const s = str(v)
  if (!s) return ''
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const t = new Date(plain ? s + 'T12:00:00Z' : s)
  if (Number.isNaN(t.getTime())) return ''
  if (plain) return t.getUTCDate() + ' ' + MONTHS[t.getUTCMonth()] + ' ' + t.getUTCFullYear()
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(t)
  const g = (k: string) => Number(p.find((x) => x.type === k)?.value)
  return g('day') + ' ' + MONTHS[g('month') - 1] + ' ' + g('year')
}

/** Dashes become " · " (v98NoDash). */
const noDash = (s: unknown) => str(s).replace(/\s*[–—]\s*/g, ' · ')

// ---------- a post's score and value ----------

export type FactorKey = 'relevance' | 'engagement' | 'timeliness' | 'opportunity' | 'credibility'

/** The five parts of a post's score, their weights and what each means (NW_FACTORS). */
export const FACTORS: readonly { key: FactorKey; label: string; weight: number; desc: string }[] = [
  { key: 'relevance', label: 'Buyer relevance', weight: 35, desc: 'How closely the topic matches the buyers you sell to' },
  { key: 'engagement', label: 'Engagement', weight: 20, desc: 'Reactions, comments and reposts compared with the author’s usual reach' },
  { key: 'timeliness', label: 'Timeliness', weight: 15, desc: 'How recent it is, and whether it ties to a deadline or event' },
  { key: 'opportunity', label: 'Content opportunity', weight: 20, desc: 'How easily it becomes a post, newsletter or reply for you' },
  { key: 'credibility', label: 'Source credibility', weight: 10, desc: 'Who is speaking, and whether claims are backed' },
]

/** The score from its five parts, only when all five are there (nwScoreFrom). */
export function scoreFrom(parts: Record<string, unknown> | null): number | null {
  if (!parts) return null
  let t = 0
  let w = 0
  for (const f of FACTORS) {
    const v = num(parts[f.key])
    if (v !== null) {
      t += v * f.weight
      w += f.weight
    }
  }
  return w === 100 ? Math.round(t / 100) : null
}

export type Val = 'high' | 'medium' | 'low' | ''

/** High at 70 and up, medium at 45 to 69, else low; with no score, the tracker's own rating (nwValOf). */
export function valOf(score: number | null, rated: unknown): Val {
  if (score !== null) return score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low'
  const v = str(rated).toLowerCase()
  return v === 'high' || v === 'medium' || v === 'low' ? v : ''
}

/** The value pill (NW_VAL). */
export const VAL: Record<Exclude<Val, ''>, { tone: 'good' | 'warn' | ''; label: string }> = {
  high: { tone: 'good', label: 'High value' },
  medium: { tone: 'warn', label: 'Medium' },
  low: { tone: '', label: 'Low value' },
}

// ---------- a post ----------

export type IntelItem = {
  id: string
  runId: string
  url: string
  platform: string
  /** api_pull (from someone followed), keyword_search, competitor_web … */
  source: string
  publishedAt: string
  contentFormat: string
  headline: string
  summary: string
  working: string
  signal: string
  scoreWhy: string
  shift: boolean
  shiftNote: string
  opportunity: string
  rawText: string
  authorTitle: string
  /** engagement_total as saved: null for web articles, which have no counts */
  eng: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  /** its themes, "other" left out */
  themes: string[]
  /** its themes as saved, "other" included (what the brief's focus is checked against) */
  rawThemes: string[]
  parts: Record<string, number> | null
  score: number | null
  val: Val
  /** its headline, else the summary's first 12 words */
  head: string
  /** who wrote it (whoOf) */
  who: string
}

/** A row of intel_items as the page reads it (nwIntelItem); `who` comes from whoOf. */
export function itemOf(r: Record<string, unknown>, who = ''): IntelItem {
  const oe = json(r.observed_engagement)
  const raw = arr(r.themes).map(str).filter(Boolean)
  const p = json(r.score_parts)
  const parts = Object.keys(p).length ? (Object.fromEntries(Object.entries(p).map(([k, v]) => [k, num(v) ?? NaN]).filter(([, v]) => !Number.isNaN(v))) as Record<string, number>) : null
  const s = num(r.score)
  const score = s !== null ? Math.round(s) : scoreFrom(parts)
  return {
    id: str(r.id),
    runId: str(r.run_id),
    url: str(r.url),
    platform: str(r.platform),
    source: str(r.source),
    publishedAt: str(r.published_at),
    contentFormat: str(r.content_format),
    headline: str(r.headline),
    summary: str(r.summary),
    working: str(r.working),
    signal: str(r.signal),
    scoreWhy: str(r.score_why),
    shift: r.sophistication_shift === true,
    shiftNote: str(r.sophistication_note),
    opportunity: str(r.engagement_opportunity),
    rawText: str(r.raw_text),
    authorTitle: str(r.author_title),
    eng: num(r.engagement_total),
    likes: num(oe.likes),
    comments: num(oe.comments),
    shares: num(oe.shares),
    themes: raw.filter((t) => t.toLowerCase() !== 'other'),
    rawThemes: raw,
    parts: parts && Object.keys(parts).length ? parts : null,
    score,
    val: valOf(score, r.ad_context_value),
    head: tidy(str(r.headline) || words(r.summary, 12) || 'A post'),
    who,
  }
}

/**
 * Who wrote a post (nwWhoOf): the author the tracker read, else the account it follows, else the name the brief gives
 * the same link, else the name in a LinkedIn post link, else Unknown author.
 */
export function whoOf(r: Record<string, unknown>, competitorName: string, briefName: string): string {
  let w = str(r.author_name) || str(r.author_company) || competitorName || briefName
  if (!w && r.url) {
    const m = /linkedin\.com\/posts\/([a-z0-9-]+?)(?:-[0-9a-f]{6,}|-\d+)?_/i.exec(str(r.url))
    if (m) {
      w = m[1]
        .split('-')
        .filter(Boolean)
        .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
        .join(' ')
    }
  }
  return w || 'Unknown author'
}

export type ThemeCount = { k: string; l: string; n: number }

/** Posts per theme, each post counted once per theme, most first (nwThemeCounts). */
export function themeCounts(items: Pick<IntelItem, 'themes'>[]): ThemeCount[] {
  const c: Record<string, number> = {}
  const lab: Record<string, string> = {}
  for (const i of items) {
    const seen = new Set<string>()
    for (const t of i.themes) {
      const k = themeKey(t)
      if (seen.has(k)) continue
      seen.add(k)
      c[k] = (c[k] ?? 0) + 1
      lab[k] = themeLabel(t)
    }
  }
  return Object.keys(c)
    .map((k) => ({ k, l: lab[k], n: c[k] }))
    .sort((a, b) => b.n - a.n || a.l.localeCompare(b.l))
}

/** The themes a brief counted, for a run whose posts are not stored (nwBriefThemes). */
export function briefThemes(topThemes: unknown): ThemeCount[] {
  return arr(topThemes)
    .map((t) => json(t))
    .filter((t) => t.theme && str(t.theme).toLowerCase() !== 'other')
    .map((t) => ({ k: themeKey(t.theme), l: themeLabel(t.theme), n: num(t.count) ?? 0 }))
    .sort((a, b) => b.n - a.n)
}

// ---------- the five things and the posts closest to each (v96Rank) ----------

const STOP = new Set(
  (
    'the a an and or of to in on for with from by at as is are was were be been being this that these those it its into than then their they them our your you we not no ' +
    'but more most less over under about across after before still just only also very much many now how what why who when where which while who whose post posts brief briefs engagement engagements ' +
    'earned earn drove drive driving interaction interactions like likes reach reached highest high higher get gets got make makes made using use used one two three'
  ).split(' '),
)

/** The words that count when matching a point to a post: lower case, no short or common words, no endings (v96Toks). */
export function tokens(s: unknown): string[] {
  return str(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
    .filter((w) => w.length > 2)
}

const numbersIn = (s: unknown) => (str(s).match(/\b\d{2,6}\b/g) ?? []).map(Number)

type Cand = { id: string; url: string; head: string; eng: number | null; val: Val; themes: string[]; text: string }

/** A post as a candidate source of a point: its words, engagement, value and themes. */
const candOf = (i: IntelItem): Cand => ({
  id: i.id,
  url: i.url,
  head: i.head,
  eng: i.eng,
  val: i.val,
  themes: i.themes,
  text: [i.headline, i.summary, i.working, i.signal, i.shiftNote, i.themes.join(' ')].join(' '),
})

/**
 * The posts closest to a point (v96Rank, the organic way): words in common (six at most), six more when a number in
 * the point is the post's engagement, two when the point's tag is one of its themes, three off for a low-value post
 * and one on for a high-value one. At least three, one per link and headline, the best six.
 */
export function rankPosts(it: { text: string; why?: string; tag?: string }, items: IntelItem[]): string[] {
  const q = new Set(tokens(it.text + ' ' + (it.why ?? '')))
  const nums = numbersIn(it.why).concat(numbersIn(it.text))
  const tag = str(it.tag).toLowerCase()
  const seen = new Set<string>()
  return items
    .map(candOf)
    .map((r) => {
      const toks = new Set(tokens(r.text))
      let s = 0
      for (const w of q) if (toks.has(w)) s += 1
      s = Math.min(s, 6)
      if (nums.length && r.eng !== null && nums.includes(r.eng)) s += 6
      if (
        tag &&
        r.themes.some((x) => {
          const t = x.toLowerCase().replace(/[-_]/g, ' ').trim()
          return t.length > 2 && (t.includes(tag) || tag.includes(t))
        })
      )
        s += 2
      if (r.val === 'low') s -= 3
      else if (r.val === 'high') s += 1
      return { r, s }
    })
    .filter((x) => {
      if (x.s < 3) return false
      const k = x.r.url + '|' + x.r.head
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => b.s - a.s || (b.r.eng ?? 0) - (a.r.eng ?? 0))
    .slice(0, 6)
    .map((x) => x.r.id)
}

export type Five = { text: string; why: string; tag: string; ids: string[] }

/**
 * A run's five things (nwIntelFive): its brief's snapshot, else the first five lines of its TL;DR, each with the posts
 * closest to it.
 */
export function fiveFor(snapshot: unknown, md: string, items: IntelItem[]): Five[] {
  const S: SnapItem[] = snapItems(snapshot) ?? orgFallback(md)
  return S.filter((x) => x && x.text)
    .slice(0, 5)
    .map((it) => ({ text: tidy(it.text), why: tidy(it.why), tag: it.tag, ids: rankPosts(it, items) }))
}

// ---------- which brief a post went into, and why (v99) ----------

/** What a run's organic brief says about the posts behind it (v99OrgBrief). */
export type BriefSets = {
  runId: string
  createdAt: string
  items: Set<string>
  hv: Map<string, string>
  shift: Map<string, string>
  drafts: Set<string>
  watch: Map<string, string[]>
  md: string
  has: boolean
  keep: number
  read: number
  focus: { themes: string[] | null; categories: string[] | null } | null
}

export function briefSets(row: { run_id: unknown; created_at: unknown; data: unknown; content_md: unknown }): BriefSets {
  const d = json(row.data)
  const urls = (v: unknown) => arr(v).map(json).filter((x) => x.url)
  const watch = new Map<string, string[]>()
  const tw = json(d.topic_watch)
  for (const k of Object.keys(tw)) for (const x of urls(tw[k])) watch.set(str(x.url), [...(watch.get(str(x.url)) ?? []), k])
  const f = json(d.focus)
  const hasFocus = Array.isArray(f.themes) || Array.isArray(f.categories)
  return {
    runId: str(row.run_id),
    createdAt: str(row.created_at),
    items: new Set(urls(d.items).map((x) => str(x.url))),
    hv: new Map(urls(d.high_value_items).map((x) => [str(x.url), str(x.signal)])),
    shift: new Map(urls(d.sophistication_shifts).map((x) => [str(x.url), str(x.note)])),
    drafts: new Set(urls(d.engagement_drafts).map((x) => str(x.url))),
    watch,
    md: str(row.content_md),
    has: arr(d.items).length > 0,
    keep: num(d.keep) && num(d.keep)! > 0 ? num(d.keep)! : 0,
    read: num(d.read) && num(d.read)! > 0 ? num(d.read)! : 0,
    focus: hasFocus
      ? { themes: Array.isArray(f.themes) ? f.themes.map(str) : null, categories: Array.isArray(f.categories) ? f.categories.map(str) : null }
      : null,
  }
}

/** none: no brief for the run; run: the brief keeps no posts (or the post has no link); in or out of it. */
export type CapState = 'wait' | 'none' | 'run' | 'in' | 'out'

export function capOf(i: Pick<IntelItem, 'url'>, B: BriefSets | null | undefined): CapState {
  if (B === undefined) return 'wait'
  if (B === null) return 'none'
  if (!B.has || !i.url) return 'run'
  return B.items.has(i.url) ? 'in' : 'out'
}

/** Each post's place in its run: by engagement (n of), and by score among the on-topic posts (sn of sof) (v99Ranks). */
export type Rank = { n?: number; of?: number; sn?: number; sof?: number }

const offTopic = (i: Pick<IntelItem, 'working'>) => /off-topic/i.test(i.working)
const isWeb = (i: Pick<IntelItem, 'platform' | 'eng'>) => i.platform === 'web' || i.eng === null

export function ranksOf(items: IntelItem[]): Record<string, Rank> {
  const R: Record<string, Rank> = {}
  const by = items.filter((i) => !isWeb(i)).sort((a, b) => (b.eng ?? 0) - (a.eng ?? 0))
  by.forEach((i, ix) => (R[i.id] = { ...R[i.id], n: ix + 1, of: by.length }))
  const sc = items.filter((i) => i.score !== null && !offTopic(i)).sort((a, b) => (b.score! - a.score!) || (b.eng ?? 0) - (a.eng ?? 0))
  sc.forEach((i, ix) => (R[i.id] = { ...R[i.id], sn: ix + 1, sof: sc.length }))
  return R
}

/** The organic category of each post format, as the tracker files them (V99_CAT_OF). */
export const CAT_OF: Record<string, string> = {
  'Opinion post': 'opinion',
  Framework: 'opinion',
  'How-to guide': 'educational',
  'Case study': 'case_studies',
  'Client result': 'case_studies',
  'Research report': 'research',
  Newsletter: 'newsletters',
  Article: 'articles',
  News: 'news',
  'Product announcement': 'news',
  'Event promo': 'events',
  Webinar: 'events',
  Podcast: 'audio_video',
  Video: 'audio_video',
}

/** Why a post sits outside the themes and categories the brief tracked (v99FocusMiss). */
function focusMiss(i: IntelItem, F: BriefSets['focus']): '' | 'theme' | 'category' | 'both' {
  if (!F) return ''
  const tOk = !F.themes || i.rawThemes.some((t) => t !== 'other' && F.themes!.includes(t))
  const cOk = !F.categories || F.categories.includes(CAT_OF[i.contentFormat] ?? '')
  return !tOk && !cOk ? 'both' : !tOk ? 'theme' : !cOk ? 'category' : ''
}

const MISS = { theme: 'not in a theme you track', category: 'not a category you track', both: 'not in a theme or category you track' }

const watchName = (k: string) =>
  ({ security: 'security', governance: 'governance', ai_adoption: 'AI adoption', adoption: 'AI adoption' })[k] ?? k.replace(/_/g, ' ')

function offWhy(i: IntelItem): string {
  const w = i.working.trim().replace(/\.$/, '')
  return !w || /off-topic/i.test(w) ? 'judged it off-topic for your buyers' : 'judged it off-topic (' + w.charAt(0).toLowerCase() + w.slice(1) + ')'
}

function uses(i: IntelItem, B: BriefSets | null): string[] {
  const u = i.url
  const p: string[] = []
  if (!B || !u) return p
  if (B.hv.has(u)) p.push('high value')
  if (B.watch.has(u)) p.push('topic watch: ' + B.watch.get(u)!.map(watchName).join(', '))
  if (B.shift.has(u)) p.push('flags a shift')
  if (B.md.includes(u)) p.push('quoted in the brief')
  return p
}

const scored = (i: IntelItem) => i.score !== null

/** One line on why a post is in the brief or left out of it (v99PostWhyShort). */
export function whyShort(i: IntelItem, st: CapState, B: BriefSets | null | undefined, r: Rank = {}): string {
  if (st === 'wait') return ''
  if (st === 'none' || !B) return 'No brief was saved for this run'
  const K = B.keep
  const FO = K ? B.focus : null
  if (st === 'out') {
    const fm = K && !offTopic(i) ? focusMiss(i, FO) : ''
    if (fm) return 'Left out: ' + MISS[fm]
    if (K && !offTopic(i)) return 'Left out: below the top ' + K + ' by score' + (!FO && r.sn && r.sn > K ? ' (' + ordinal(r.sn) + ')' : '')
    return 'Left out: ' + offWhy(i).replace(/^judged it /, '')
  }
  const p: string[] = []
  if (K && scored(i)) p.push(!FO && r.sn && r.sn <= K ? ordinal(r.sn) + ' by score (' + i.score + ')' : 'score ' + i.score)
  else if (isWeb(i)) p.push('web article, always read')
  else if (r.n) p.push(ordinal(r.n) + ' most engaged')
  const u = uses(i, B)
  return (st === 'run' ? 'From the run behind this brief · ' : 'In the brief · ') + p.concat(u.length ? u : ['counted in its themes']).join(' · ')
}

const plat99 = (p: string) =>
  ({ linkedin: 'LinkedIn', x: 'X', twitter: 'X', meta: 'Facebook', facebook: 'Facebook', instagram: 'Instagram' })[p.toLowerCase()] || p || 'social'

/** Where the tracker found a post (v99PostFound). */
function found(i: IntelItem): string {
  const w = i.who.trim()
  const who = w && !/^[\W_]*$/.test(w) && !/ search$/i.test(w) ? w : ''
  if (i.source === 'api_pull') return who ? 'from ' + who + ', who you follow' : 'from an account you follow'
  if (i.source === 'competitor_web') return who ? 'on ' + who + '’s website' : 'on a website you follow'
  if (i.platform === 'web') return 'by a web search on your topics'
  return 'by searching your topics on ' + plat99(i.platform)
}

export type WhyFull = {
  head: string
  lines: { label: string; text: string }[]
  foot: string
  /** the brief to open from the foot, when there is one */
  brief: { runId: string; createdAt: string } | null
}

const sentence = (s: string) => noDash(s).replace(/\s·\s/g, ', ').replace(/\.?\s*$/, '.')

/** Why a post is in the brief, or was left out of it, in full (v99PostWhyFull). */
export function whyFull(i: IntelItem, st: CapState, B: BriefSets | null | undefined, r: Rank = {}): WhyFull {
  const lines: WhyFull['lines'] = []
  const K = B ? B.keep : 0
  const off = offTopic(i)
  const web = isWeb(i)
  const FO = K && B ? B.focus : null
  const fm = K && !off ? focusMiss(i, FO) : ''
  lines.push({ label: 'Found', text: found(i) + '.' })
  if (K && B) {
    const R = B.read || 50
    lines.push({
      label: 'Read',
      text: web
        ? 'web articles have no engagement counts, so each run keeps room for some among the ' + R + ' posts it reads.'
        : 'each run reads up to ' + R + ' posts, the most engaged first' + (r.n ? '. This was the ' + ordinal(r.n) + ' most engaged of the ' + r.of + ' social posts read' : '') + '.',
    })
    if (scored(i)) {
      lines.push({ label: 'Scored', text: i.score + ' out of 100' + (r.sn && !off && !FO ? ', ' + ordinal(r.sn) + ' of the ' + r.sof + ' on-topic posts in its run' : '') + '.' })
    }
  } else if (web) lines.push({ label: 'Kept', text: 'web articles have no engagement counts, so every one is read.' })
  else lines.push({ label: 'Kept', text: 'it was in the top half by engagement of the posts read in its run' + (r.n ? ' (' + ordinal(r.n) + ' of the ' + r.of + ' kept)' : '') + '.' })
  if (st === 'out') {
    const fmt = i.contentFormat.toLowerCase() || 'post'
    lines.push({
      label: 'Left out',
      text: fm
        ? 'the brief only takes posts in the themes and organic categories you track, and this one is ' +
          (fm === 'theme' ? 'in none of your themes' : fm === 'category' ? (/^[aeiou]/.test(fmt) ? 'an ' : 'a ') + fmt + ', which is not one of your categories' : 'outside both') +
          '. Change them on the Following tab.'
        : K && !off
          ? 'the brief takes the top ' + K + ' on-topic posts by score' + (FO ? ' in the themes and categories you track' : '') + ', and this one scored below them.'
          : 'the agent ' + offWhy(i) + ', so it is not in the brief.',
    })
  }
  if (st === 'in') {
    lines.push(
      K
        ? { label: 'In the brief', text: 'one of the top ' + K + ' on-topic posts of its run by score' + (FO ? ', in the themes and categories you track' : '') + '.' }
        : { label: 'On topic', text: 'the agent judged it to be about AI or automation for your buyers, so it feeds the brief’s counts and themes.' },
    )
  }
  const u = i.url
  if (B && u && st !== 'out') {
    if (B.hv.has(u)) lines.push({ label: 'High value', text: sentence(i.signal || B.hv.get(u) || 'listed in the brief’s high-value posts') })
    if (B.watch.has(u)) lines.push({ label: 'Topic watch', text: 'listed under ' + B.watch.get(u)!.map(watchName).join(', ') + '.' })
    if (B.shift.has(u)) lines.push({ label: 'Shift', text: sentence(B.shift.get(u) || 'flagged as a change in what the market promises') })
    if (B.md.includes(u)) lines.push({ label: 'Quoted', text: 'the brief links to it in its text.' })
    if (B.drafts.has(u)) lines.push({ label: 'Reply drafted', text: 'it is in the Engagement queue for your approval.' })
  }
  const head = st === 'out' ? 'Why it was left out' : st === 'none' ? 'How it was picked' : 'Why it is in the brief'
  const when = B ? longDay(B.createdAt, 'UTC') : ''
  const foot =
    st === 'none' || !B
      ? 'No brief was saved for this run.'
      : st === 'out'
        ? 'Read for the organic brief of ' + when + ', but not used in it.'
        : 'Captured in the organic brief of ' + when + '.'
  return { head, lines, foot, brief: B ? { runId: B.runId, createdAt: B.createdAt } : null }
}

// ---------- the runs ----------

export type IntelRun = {
  runId: string
  /** when it finished, else started, else its day */
  at: string
  status: string
  ok: boolean
  stats: Record<string, unknown>
}

/** A run that finished well (nwRunOk). */
export const runOk = (status: string) => /^(success|done|ok|completed)$/i.test(status)

/**
 * The tracker's runs, newest first (nwIntelRuns): every run the runs table has, then each brief whose run it has not,
 * as a run that finished well.
 */
export function runsOf(rows: Record<string, unknown>[], briefs: { run_id: string; created_at: string }[]): IntelRun[] {
  const seen = new Set<string>()
  const out: IntelRun[] = []
  for (const r of rows) {
    const id = str(r.run_id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const status = str(r.status)
    out.push({ runId: id, at: str(r.finished_at || r.started_at || r.run_date), status, ok: runOk(status), stats: json(r.stats) })
  }
  for (const b of briefs) {
    if (!b.run_id || seen.has(b.run_id)) continue
    seen.add(b.run_id)
    out.push({ runId: b.run_id, at: b.created_at, status: 'success', ok: true, stats: {} })
  }
  return out.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
}

/** The run to show (nwIntelRun): the one asked for when it is known, else the newest with posts, else the newest brief's, else the newest. */
export function pickRun(runs: IntelRun[], briefs: { run_id: string }[], asked: string | null): string {
  if (asked && runs.some((r) => r.runId === asked)) return asked
  return runs.find((r) => (num(r.stats.items) ?? 0) > 0)?.runId ?? briefs[0]?.run_id ?? runs[0]?.runId ?? ''
}

/** What kind of run a brief came from, as the run library says it. */
export function runKind(d: Record<string, unknown>): string {
  if (/custom/i.test(str(d.run_source || d.run_type))) return 'Custom run'
  if (/daily/i.test(str(d.run_type))) return 'Daily run'
  if (/weekly/i.test(str(d.run_type))) return 'Weekly run'
  return 'Run'
}

/** The brief's window dates, "2026-10-08 13:07 UTC" or a plain date, as an ISO time (nwWinDate). */
export function windowIso(v: unknown): string | null {
  const s = str(v).trim()
  if (!s) return null
  const t = Date.parse(s.replace(/\s*UTC$/, 'Z').replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'))
  if (Number.isFinite(t)) return new Date(t).toISOString()
  const u = Date.parse(s)
  return Number.isFinite(u) ? new Date(u).toISOString() : null
}

// ---------- when the agents run (Settings > AI settings, agent_runs) ----------

export type Schedule = { cadence: 'weekly' | 'daily'; day: string; time: string; tz: string; read: number; keep: number }

export const SCHEDULE_DEFAULT: Schedule = { cadence: 'weekly', day: 'mon', time: '06:00', tz: 'America/Los_Angeles', read: 50, keep: 10 }
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** The Intel Tracker's schedule, as saved or the starting values (nwSched). */
export function scheduleOf(value: unknown): Schedule & { saved: boolean } {
  const s = json(value)
  const i = json(s.intel)
  const merged = { ...SCHEDULE_DEFAULT, ...(i as Partial<Schedule>) }
  return {
    cadence: merged.cadence === 'daily' ? 'daily' : 'weekly',
    day: DAYS.includes(str(merged.day)) ? str(merged.day) : 'mon',
    time: /^\d{1,2}:\d{2}$/.test(str(merged.time)) ? str(merged.time) : '06:00',
    tz: str(merged.tz) || 'America/Los_Angeles',
    read: num(merged.read) ?? 50,
    keep: num(merged.keep) ?? 10,
    saved: Object.keys(i).length > 0,
  }
}

function tzOffset(t: number, tz: string): number {
  const ms = Math.floor(t / 1000) * 1000
  try {
    const p: Record<string, string> = {}
    for (const x of new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(ms)))
      p[x.type] = x.value
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms
  } catch {
    return 0
  }
}

/** The next time the schedule fires (nwNextRun), or null. */
export function nextRun(s: Schedule, now: number): number | null {
  const [hh, mm] = s.time.split(':').map((x) => Number(x) || 0)
  const local = new Date(now + tzOffset(now, s.tz))
  const want = DAYS.indexOf(s.day)
  for (let i = 0; i < 9; i++) {
    const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i, hh, mm)
    const t = guess - tzOffset(guess, s.tz)
    if (t <= now) continue
    const dow = (new Date(guess).getUTCDay() + 6) % 7
    if (s.cadence === 'daily' || dow === want) return t
  }
  return null
}

// ---------- the people, companies and searches it follows (v96, v111) ----------

export type Competitor = {
  id: string
  name: string
  handleLinkedin: string
  handleX: string
  metaPageId: string
  website: string
  status: string
  followKind: string
  followFor: string
  addedBy: string
  createdAt: string
  notes: string
}

export const competitorOf = (r: Record<string, unknown>): Competitor => ({
  id: str(r.id),
  name: str(r.name),
  handleLinkedin: str(r.handle_linkedin),
  handleX: str(r.handle_x),
  metaPageId: str(r.meta_page_id),
  website: str(r.website),
  status: str(r.status),
  followKind: str(r.follow_kind),
  followFor: str(r.follow_for),
  addedBy: str(r.added_by),
  createdAt: str(r.created_at),
  notes: str(r.notes),
})

/** A person or a company (v96Kind): as set, else from the LinkedIn link, else an X handle alone is a person. */
export function kindOf(c: Pick<Competitor, 'followKind' | 'handleLinkedin' | 'handleX' | 'metaPageId' | 'website'>): 'person' | 'company' {
  if (c.followKind === 'person' || c.followKind === 'company') return c.followKind
  if (/^in\//i.test(c.handleLinkedin)) return 'person'
  if (/^(company|school|showcase)\//i.test(c.handleLinkedin)) return 'company'
  return c.handleX && !c.metaPageId && !c.website ? 'person' : 'company'
}

/** Who reads an account (v111For): its ads only, its posts only, or both. */
export const followFor = (c: Pick<Competitor, 'followFor'>) => (c.followFor === 'ads' || c.followFor === 'posts' ? c.followFor : 'both')

/** The links an account has (v96Links): LinkedIn, X, Facebook, website. */
export function linksOf(c: Competitor): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = []
  if (c.handleLinkedin) out.push({ label: 'LinkedIn', href: 'https://www.linkedin.com/' + (/^(in|company|school|showcase)\//i.test(c.handleLinkedin) ? c.handleLinkedin : 'company/' + c.handleLinkedin) })
  if (c.handleX) out.push({ label: 'X', href: 'https://x.com/' + c.handleX.replace(/^@/, '') })
  if (c.metaPageId) out.push({ label: 'Facebook', href: 'https://www.facebook.com/' + c.metaPageId })
  if (c.website) out.push({ label: 'Website', href: /^https?:\/\//i.test(c.website) ? c.website : 'https://' + c.website })
  return out
}

/** A LinkedIn link as the handle the tracker reads (v96Li), or null when it is a web address but not LinkedIn's. */
export function linkedinHandle(s: unknown, kind: 'person' | 'company'): string | null {
  const v = str(s).trim()
  if (!v) return null
  const m = v.match(/linkedin\.com\/(company|in|school|showcase)\/([^/?#\s]+)/i)
  if (m) return m[1].toLowerCase() + '/' + m[2]
  if (/^(company|in|school|showcase)\//i.test(v)) return v.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(v)) return null
  return (kind === 'person' ? 'in/' : 'company/') + v.replace(/^@/, '').replace(/\/+$/, '')
}

/** An X handle without its @ or link (v96Xh). */
export function xHandle(s: unknown): string | null {
  const v = str(s).trim()
  if (!v) return null
  return (
    v
      .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
      .replace(/^@/, '')
      .replace(/[/?#].*$/, '') || null
  )
}

export type Terms = { topics: string[]; tech: string[]; industries: string[] }
export const TERMS_MAX = 12

/** The topics, technologies and industries it searches (v96Terms), with older keywords as topics. */
export function termsOf(follow: unknown, keywords: unknown): Terms {
  const kw = arr(keywords)
    .map((k) => str(k).trim())
    .filter(Boolean)
  const f = json(follow)
  const clean = (v: unknown) =>
    arr(v)
      .map((s) => str(s).trim())
      .filter(Boolean)
  const T: Terms = Object.keys(f).length ? { topics: clean(f.topics), tech: clean(f.tech), industries: clean(f.industries) } : { topics: kw.slice(), tech: [], industries: [] }
  const all = new Set(termsFlat(T).map((s) => s.toLowerCase()))
  for (const k of kw) {
    if (all.has(k.toLowerCase())) continue
    T.topics.push(k)
    all.add(k.toLowerCase())
  }
  return T
}

export function termsFlat(T: Terms): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of [...T.topics, ...T.tech, ...T.industries]) {
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

/** How many people, companies and searches it reads: accounts followed for ads only are left out (v96FollowCounts, v111). */
export function followCounts(rows: Competitor[], T: Terms) {
  const on = rows.filter((c) => c.status !== 'denied' && followFor(c) !== 'ads')
  const people = on.filter((c) => kindOf(c) === 'person').length
  return { people, companies: on.length - people, topics: T.topics.length, tech: T.tech.length, industries: T.industries.length, all: on.length }
}

// ---------- what it tracks (intel_focus) ----------

export const FOCUS_THEMES = [
  'ai-adoption',
  'agentic-ai',
  'governance',
  'security',
  'regulation',
  'tooling-update',
  'workflow-automation',
  'data-infrastructure',
  'financial-services',
  'client-experience',
  'workforce-and-change',
  'value-and-results',
  'growth-and-sales',
  'hiring',
] as const

export const FOCUS_CATS: readonly (readonly [string, string])[] = [
  ['opinion', 'Opinion and frameworks'],
  ['educational', 'Educational and how-to'],
  ['case_studies', 'Case studies and results'],
  ['research', 'Reports and white papers'],
  ['newsletters', 'Newsletters'],
  ['articles', 'Articles'],
  ['news', 'News and announcements'],
  ['events', 'Events and webinars'],
  ['audio_video', 'Podcasts and video'],
]

export type Focus = { themes: string[]; custom: string[]; cats: string[]; saved: boolean }

/** What it tracks, as saved, or everything until the team changes it (nwFocusState). */
export function focusOf(value: unknown): Focus {
  const f = json(value)
  const all = FOCUS_CATS.map((c) => c[0])
  const saved = Object.keys(f).length > 0
  const themes = Array.isArray(f.themes) ? FOCUS_THEMES.filter((t) => (f.themes as unknown[]).map(str).includes(t)) : [...FOCUS_THEMES]
  const custom = Array.isArray(f.custom)
    ? f.custom
        .map((c) => str(c).trim())
        .filter(Boolean)
        .slice(0, 10)
    : []
  const cats = Array.isArray(f.categories) && f.categories.length ? all.filter((c) => (f.categories as unknown[]).map(str).includes(c)) : all
  return { themes, custom, cats, saved }
}

/** What is wrong with a theme of the team's own, or '' (nwFocusAdd). */
export function focusAddProblem(F: Pick<Focus, 'custom'>, raw: string): string {
  const v = raw.replace(/["\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (v.length < 2) return 'Type a theme of two letters or more.'
  if (F.custom.length >= 10) return 'You can add up to 10 themes of your own.'
  const low = v.toLowerCase()
  if (F.custom.some((c) => c.toLowerCase() === low) || FOCUS_THEMES.some((t) => t === low.replace(/[^a-z0-9]+/g, '-') || themeLabel(t).toLowerCase() === low))
    return 'That theme is already on the list.'
  return ''
}

/** A theme of the team's own as it is kept: no quotes or backslashes, single spaces, 40 characters at most. */
export const focusClean = (raw: string) => raw.replace(/["\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)

// ---------- a custom run (Run now) ----------

export type RunRow = { name?: string; website?: string; linkedin?: string; x?: string; facebook?: string; notes?: string }
export const RUN_FIELDS: readonly (readonly [keyof RunRow, string, string, boolean?])[] = [
  ['name', 'Name', 'Acme Advisory', true],
  ['website', 'Website', 'acme.com'],
  ['linkedin', 'LinkedIn', 'linkedin.com/company/acme'],
  ['x', 'X / Twitter', '@acme'],
  ['facebook', 'Facebook page', 'facebook.com/acme'],
  ['notes', 'Why track them', 'Optional note'],
]

/** One pasted line as a row: the name first, then links sorted by where they point (apIrParseLine). */
export function parseRunLine(line: string): RunRow | null {
  const parts = line
    .split(/\t|,(?![^()]*\))/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (!parts.length) return null
  const r: RunRow = { name: parts[0] }
  for (const p of parts.slice(1)) {
    if (/linkedin\.com/i.test(p)) r.linkedin = p
    else if (/(twitter|x)\.com\//i.test(p) || /^@/.test(p)) r.x = p
    else if (/facebook\.com/i.test(p)) r.facebook = p
    else if (!r.website && /\.[a-z]{2,}/i.test(p) && !/\s/.test(p)) r.website = p
    else r.notes = (r.notes ? r.notes + '; ' : '') + p
  }
  return r
}

/** The rows that go to the run, trimmed and empty ones left out, or why they cannot go (apIrSubmit). */
export function runRows(rows: RunRow[]): { ok: true; rows: RunRow[] } | { ok: false; error: string } {
  const comps = rows
    .map((r) => {
      const o: RunRow = {}
      for (const [k] of RUN_FIELDS) {
        const v = str(r[k]).trim()
        if (v) o[k] = v
      }
      return o
    })
    .filter((o) => Object.keys(o).length)
  if (!comps.length) return { ok: false, error: 'Add at least one competitor.' }
  const noName = comps.findIndex((o) => !o.name)
  if (noName >= 0) return { ok: false, error: 'Competitor ' + (noName + 1) + ' needs a name.' }
  const noWhere = comps.filter((o) => !o.website && !o.linkedin && !o.x && !o.facebook)
  if (noWhere.length) return { ok: false, error: noWhere.map((o) => o.name).join(', ') + ': add a website or at least one social profile so the tracker has something to read.' }
  if (comps.length > 25) return { ok: false, error: '25 competitors per run at most' }
  return { ok: true, rows: comps }
}

/** A custom run the team started that has not landed yet, kept 45 minutes (apIrPending). */
export type Pending = { runId: string; names: string[]; t: number; by: string; cascade: boolean }
export const PENDING_MS = 45 * 60_000

export function pendingOf(value: unknown, now: number): Pending[] {
  return arr(json(value).runs)
    .map(json)
    .map((p) => ({
      runId: str(p.run_id),
      names: arr(p.names).map(str).filter(Boolean),
      t: num(p.t) ?? 0,
      by: str(p.by),
      cascade: p.cascade === true,
    }))
    .filter((p) => p.t && now - p.t < PENDING_MS)
}
