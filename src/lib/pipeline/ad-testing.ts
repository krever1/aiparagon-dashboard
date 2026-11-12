// The Ad Testing rules (v98 with v106, v113, v115 and v116 in the current dashboard): the results the team logged,
// imported or synced, their numbers as the page writes them, the tables, the leaderboard, what is working and what is
// not, the landing pages' sign-ups with the spend matched by each ad's code, the log form's checks, and the line about
// the Meta and LinkedIn sync. Pure: the server, the page and the tests all use it.

import { arr, json } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

// ---------- a result ----------

export type Kind = 'ad' | 'post'
export type Source = 'manual' | 'csv' | 'crm' | 'api'
export const NUMS = ['impressions', 'reactions', 'comments', 'shares', 'clicks', 'spend', 'leads', 'qualified', 'bookings', 'won', 'revenue'] as const
export type NumKey = (typeof NUMS)[number]

export type Result = {
  id: string
  kind: Kind
  title: string
  platform: string
  url: string
  postedOn: string
  periodStart: string
  periodEnd: string
  notes: string
  attribution: string
  source: string
  contentPieceId: string
  sourceOutputId: string
  sourceRunId: string
  variantFile: string
  createdAt: string
} & Record<NumKey, number | null>

/** A number as the page reads one (v98N): "$1,250" is 1250; nothing, or not a number, is null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isNaN(n) ? null : n
}

/** A content_results row as the page uses it. */
export function resultOf(r: Record<string, unknown>): Result {
  const nums = Object.fromEntries(NUMS.map((k) => [k, num(r[k])])) as Record<NumKey, number | null>
  return {
    id: str(r.id),
    kind: r.kind === 'ad' ? 'ad' : 'post',
    title: str(r.title),
    platform: str(r.platform),
    url: str(r.url),
    postedOn: str(r.posted_on).slice(0, 10),
    periodStart: str(r.period_start).slice(0, 10),
    periodEnd: str(r.period_end).slice(0, 10),
    notes: str(r.notes),
    attribution: str(r.attribution),
    source: str(r.source),
    contentPieceId: str(r.content_piece_id),
    sourceOutputId: str(r.source_output_id),
    sourceRunId: str(r.source_run_id),
    variantFile: str(r.variant_file),
    createdAt: str(r.created_at),
    ...nums,
  }
}

/** Where a result came from (v106Src, with v113's synced rows). */
export const srcOf = (r: Pick<Result, 'attribution'>): Source =>
  r.attribution === 'api' ? 'api' : r.attribution === 'crm' ? 'crm' : r.attribution === 'csv' ? 'csv' : 'manual'

export const split = (all: Result[]) => ({ all, ads: all.filter((r) => r.kind === 'ad'), posts: all.filter((r) => r.kind !== 'ad') })

// ---------- numbers as the page writes them ----------

export const int = (v: unknown) => {
  const n = num(v)
  return n === null ? '–' : Math.round(n).toLocaleString('en-US')
}
export function money(v: unknown): string {
  const n = num(v)
  if (n === null) return '–'
  const x = Math.round(n * 100) / 100
  return '$' + x.toLocaleString('en-US', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })
}
export function pct(a: unknown, b: unknown): string {
  const x = num(a)
  const y = num(b)
  return x !== null && y ? Math.round((1000 * x) / y) / 10 + '%' : '–'
}
export function per(a: unknown, b: unknown): string {
  const x = num(a)
  const y = num(b)
  return x !== null && y ? money(x / y) : '–'
}
/** A return as "2.5x" (nwX). */
export const times = (x: number | null) => (x === null ? '–' : (Math.round(x * 10) / 10).toLocaleString('en-US') + 'x')

/** Reactions, comments and shares together (v98Eng); none of them logged is null. */
export function eng(r: Pick<Result, 'reactions' | 'comments' | 'shares'>): number | null {
  if (r.reactions === null && r.comments === null && r.shares === null) return null
  return (r.reactions ?? 0) + (r.comments ?? 0) + (r.shares ?? 0)
}
/** Revenue over spend (nwRoas). */
export const roas = (r: Pick<Result, 'spend' | 'revenue'>) => (r.spend && r.revenue !== null ? r.revenue / r.spend : null)
/** A column added up (nwSum): what is logged, 0 when nothing is. */
export const sum = (rows: Result[], k: NumKey) => rows.reduce((s, r) => s + (r[k] ?? 0), 0)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "12 Nov", or "12 Nov 2026" with the year (v98D); a date with no time is that day wherever the viewer is. */
export function dayText(v: string, year = false, timeZone?: string): string {
  if (!v) return ''
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(v)
  const t = new Date(plain ? v + 'T12:00:00Z' : v)
  if (Number.isNaN(t.getTime())) return ''
  if (plain) return t.getUTCDate() + ' ' + MON[t.getUTCMonth()] + (year ? ' ' + t.getUTCFullYear() : '')
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone }).formatToParts(t).map((x) => [x.type, x.value]))
  return Number(p.day) + ' ' + MON[Number(p.month) - 1] + (year ? ' ' + p.year : '')
}

/** A dash between words reads as a dot (v98NoDash), and a long text is cut with an ellipsis (v98Clip). */
export const noDash = (s: string) => String(s || '').replace(/\s*[–—]\s*/g, ' · ')
export function clip(s: string, n: number): string {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? t.slice(0, n - 1).trim() + '…' : t
}

// ---------- the results tab ----------

/** How the results came in (v106SrcLine, with v113's count of synced ones). */
export function srcLine(all: Result[]): string {
  const c = { manual: 0, csv: 0, crm: 0, api: 0 }
  for (const r of all) c[srcOf(r)]++
  return [
    c.manual ? c.manual + ' entered by hand' : '',
    c.csv ? c.csv + ' imported from a file' : '',
    c.crm ? c.crm + ' from a CRM export' : '',
    c.api ? c.api + ' synced from the ad platforms' : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const SYNCED: Record<string, string> = { meta: 'Meta', facebook: 'Meta', instagram: 'Meta', linkedin: 'LinkedIn' }

/** The line under a result's title (nwTsWhat): its day, where, and how it came in. */
export function whatLine(r: Result, timeZone?: string): string {
  const day = dayText(r.postedOn || r.periodStart || r.createdAt, true, timeZone)
  const s = srcOf(r)
  return (
    [day, r.platform].filter(Boolean).join(' · ') +
    (s === 'csv'
      ? ' · imported'
      : s === 'crm'
        ? ' · from a CRM export'
        : s === 'api'
          ? ' · synced from ' + (SYNCED[(r.source || r.platform).toLowerCase()] ?? 'the ad platform')
          : '')
  )
}

/** A link to the post or ad, only a web address. */
export const linkOf = (r: Pick<Result, 'url'>) => (/^https?:\/\//i.test(r.url) ? r.url : '')

export type WorkItem = { r: Result; spend: number; leads: number; cpl: number | null; roas: number | null }

/**
 * What is working and what is not yet (v113Working): ads with spend, by cost per lead against the middle of them, or
 * by return once revenue is logged. Needs two ads with spend; null when there is nothing to say.
 */
export function working(ads: Result[]): { good: WorkItem[]; bad: WorkItem[] } | null {
  const L: WorkItem[] = ads
    .map((r) => {
      const s = r.spend ?? 0
      const l = r.leads ?? 0
      const rv = r.revenue ?? 0
      return { r, spend: s, leads: l, cpl: l ? s / l : null, roas: s && rv ? rv / s : null }
    })
    .filter((x) => x.spend > 0)
  if (L.length < 2) return null
  const med = L.map((x) => x.cpl)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  const m = med.length ? med[Math.floor(med.length / 2)] : null
  const good = L.filter((x) => (x.roas !== null ? x.roas >= 1 : x.cpl !== null && (m === null || x.cpl <= m)))
    .sort((a, b) => (b.roas || 0) - (a.roas || 0) || (a.cpl || 1e9) - (b.cpl || 1e9))
    .slice(0, 3)
  const bad = L.filter((x) => !good.includes(x) && (x.leads === 0 || (m !== null && x.cpl !== null && x.cpl > m * 1.5)))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 3)
  return good.length || bad.length ? { good, bad } : null
}

/** An ad in the Working panel: where, what it spent, its leads and what each cost. */
export const workLine = (x: WorkItem) =>
  [x.r.platform, money(x.spend) + ' spent', x.leads ? x.leads + (x.leads === 1 ? ' lead' : ' leads') + ' at ' + money(x.cpl) + ' each' : 'no leads yet']
    .filter(Boolean)
    .join(' · ')

// ---------- the leaderboard ----------

export type Ranked = Result & { roas: number | null; cpw: number | null; cpb: number | null; cpq: number | null; cpl: number | null }

const costPer = (s: number | null, n: number | null) => (s !== null && n ? s / n : null)

/**
 * The ads in order (nwTsRank): return on spend once revenue is logged, then what a client won, a booked call, a
 * qualified lead and a lead cost, then the most spent.
 */
export function rank(ads: Result[]): Ranked[] {
  const out: Ranked[] = ads.map((r) => ({
    ...r,
    roas: roas(r),
    cpw: costPer(r.spend, r.won),
    cpb: costPer(r.spend, r.bookings),
    cpq: costPer(r.spend, r.qualified),
    cpl: costPer(r.spend, r.leads),
  }))
  type K = 'roas' | 'cpw' | 'cpb' | 'cpq' | 'cpl'
  const lo = (k: K, a: Ranked, b: Ranked) => (a[k] === null && b[k] === null ? 0 : a[k] === null ? 1 : b[k] === null ? -1 : a[k]! - b[k]!)
  const hi = (k: K, a: Ranked, b: Ranked) => (a[k] === null && b[k] === null ? 0 : a[k] === null ? 1 : b[k] === null ? -1 : b[k]! - a[k]!)
  return out.sort((a, b) => hi('roas', a, b) || lo('cpw', a, b) || lo('cpb', a, b) || lo('cpq', a, b) || lo('cpl', a, b) || (b.spend ?? 0) - (a.spend ?? 0))
}

/** Whether an ad has anything to rank it by. */
export const isRanked = (r: Ranked) => r.roas !== null || r.cpw !== null || r.cpb !== null || r.cpq !== null || r.cpl !== null

/** What the leading ad did (nwTsSay). */
export const say = (r: Ranked) =>
  r.roas !== null
    ? times(r.roas) + ' return on ' + money(r.spend)
    : r.cpw !== null
      ? money(r.cpw) + ' per client won'
      : r.cpb !== null
        ? money(r.cpb) + ' per booked call'
        : r.cpq !== null
          ? money(r.cpq) + ' per qualified lead'
          : r.cpl !== null
            ? money(r.cpl) + ' per lead'
            : ''

/** The posts by engagement over impressions, best first; a post with neither is left out. */
export function postsByEngagement(posts: Result[]): (Result & { er: number })[] {
  return posts
    .map((r) => {
      const e = eng(r)
      const i = r.impressions
      return { ...r, er: e !== null && i ? e / i : NaN }
    })
    .filter((r) => !Number.isNaN(r.er))
    .sort((a, b) => b.er - a.er)
}

// ---------- the header ----------

export type Stat = { n: string; label: string; tab: 'results' | 'board' }

/** The six numbers under the heading (nwTsHead): posts and ads logged, then the ads' spend, leads, clients and revenue. */
export function stats(all: Result[]): Stat[] {
  const { ads, posts } = split(all)
  const leads = sum(ads, 'leads')
  const won = sum(ads, 'won')
  return [
    { n: String(posts.length), label: posts.length === 1 ? 'post logged' : 'posts logged', tab: 'results' },
    { n: String(ads.length), label: ads.length === 1 ? 'ad logged' : 'ads logged', tab: 'results' },
    { n: money(sum(ads, 'spend')), label: 'ad spend', tab: 'board' },
    { n: int(leads), label: leads === 1 ? 'lead' : 'leads', tab: 'board' },
    { n: int(won), label: won === 1 ? 'client won' : 'clients won', tab: 'board' },
    { n: money(sum(ads, 'revenue')), label: 'revenue', tab: 'board' },
  ]
}

// ---------- the landing pages' sign-ups ----------

export type LpPage = { id: string; slug: string; title: string; ads: { code: string; hook: string }[] }
export type LpSignup = { pageId: string; code: string; createdAt: string }
export type LpView = { pageId: string; code: string; views: number }
export type LpRow = { page: string; code: string; hook: string; visits: number; signups: number; spend: number }

/**
 * What an ad with this code spent in the last 30 days (v115, as v116 left it): the ad results whose title holds the
 * code as a word, their synced numbers when there are any, else what the team logged; never both.
 */
export function spendOf(code: string, ads: Result[], since: number): number {
  const re = new RegExp('(^|[^A-Z0-9])' + code.replace(/[^A-Z0-9-]/gi, '') + '(?![A-Z0-9])', 'i')
  const inRange = (r: Result) => {
    const d = Date.parse(r.periodEnd || r.postedOn || r.createdAt || '')
    return Number.isNaN(d) || d >= since
  }
  const hits = ads.filter((r) => inRange(r) && re.test(r.title))
  const api = hits.filter((r) => r.attribution === 'api')
  return (api.length ? api : hits).reduce((s, r) => s + (r.spend ?? 0), 0)
}

/** A row per ad of every page that has been live, and one for visits that came with no ad code (v115AdTestHtml). */
export function lpRows(pages: LpPage[], su: LpSignup[], views: LpView[], ads: Result[], now: number): LpRow[] {
  const since = now - 30 * 864e5
  const rows: LpRow[] = []
  for (const p of pages) {
    const mine = su.filter((s) => s.pageId === p.id && Date.parse(s.createdAt) >= since)
    const vw = views.filter((v) => v.pageId === p.id)
    for (const a of p.ads) {
      rows.push({
        page: p.title || p.slug,
        code: a.code,
        hook: a.hook,
        visits: vw.filter((x) => x.code === a.code).reduce((s, x) => s + (x.views || 0), 0),
        signups: mine.filter((s) => s.code === a.code).length,
        spend: spendOf(a.code, ads, since),
      })
    }
    const other = mine.filter((s) => !s.code).length
    const ov = vw.filter((x) => !x.code).reduce((s, x) => s + (x.views || 0), 0)
    if (other || ov) rows.push({ page: p.title || p.slug, code: '', hook: 'Visits without an ad code', visits: ov, signups: other, spend: 0 })
  }
  return rows
}

/** A page from landing_pages for the sign-ups card: its ads' codes and hooks. */
export function lpPageOf(r: Record<string, unknown>): LpPage {
  return {
    id: str(r.id),
    slug: str(r.slug),
    title: str(r.title),
    ads: arr(r.ads)
      .map(json)
      .map((a) => ({ code: str(a.code), hook: str(a.hook || a.headline) }))
      .filter((a) => a.code),
  }
}

// ---------- the log form ----------

/** Where a post or an ad ran, as the form offers it (V98_PLAT). */
export const PLATFORMS: Record<Kind, string[]> = {
  post: ['LinkedIn', 'Instagram', 'Facebook', 'X', 'YouTube', 'TikTok', 'Newsletter', 'Email', 'Website', 'Other'],
  ad: ['Meta ads', 'LinkedIn ads', 'Google ads', 'YouTube ads', 'X ads', 'Other'],
}

/** The form's number boxes: which kind shows each, its label, and the word an error uses. */
export const NUM_BOXES: { k: NumKey; label: string; word: string; for: 'ad' | 'post' | 'both'; ph?: string }[] = [
  { k: 'spend', label: 'Spend ($)', word: 'spend', for: 'ad', ph: 'e.g. 250' },
  { k: 'impressions', label: 'Impressions', word: 'impressions', for: 'both', ph: 'e.g. 4200' },
  { k: 'reactions', label: 'Reactions', word: 'reactions', for: 'post' },
  { k: 'comments', label: 'Comments', word: 'comments', for: 'post' },
  { k: 'shares', label: 'Shares', word: 'shares', for: 'post' },
  { k: 'clicks', label: 'Clicks', word: 'clicks', for: 'both' },
  { k: 'leads', label: 'Leads', word: 'leads', for: 'ad' },
  { k: 'qualified', label: 'Qualified leads', word: 'qualified leads', for: 'ad', ph: 'e.g. 4' },
  { k: 'bookings', label: 'Booked calls', word: 'booked calls', for: 'ad' },
  { k: 'won', label: 'Clients won', word: 'clients won', for: 'ad', ph: 'e.g. 1' },
  { k: 'revenue', label: 'Revenue ($)', word: 'revenue', for: 'ad', ph: 'e.g. 4500' },
]
export const boxesFor = (kind: Kind) => NUM_BOXES.filter((b) => b.for === 'both' || b.for === kind)

export type LogInput = {
  kind: Kind
  title: string
  platform: string
  url: string
  postedOn: string
  notes: string
  nums: Partial<Record<NumKey, string>>
  contentPieceId?: string
  sourceOutputId?: string
  sourceRunId?: string
  variantFile?: string
}

const ID = /^[\w-]{1,64}$/
const idOrNull = (v: unknown) => (ID.test(str(v)) ? str(v) : null)

/**
 * The row a logged result saves (v98ResSave as the Ad Testing page left it), or what to fix first: a title, a link
 * that is a web address, numbers of zero or more (whole ones but spend and revenue), at least one number, no more
 * qualified leads or clients than leads, and no date in the future. What the form does not show for the kind is empty.
 */
export function resultFrom(x: LogInput, today: string): { row: Record<string, unknown> } | { error: string } {
  const kind: Kind = x?.kind === 'ad' ? 'ad' : 'post'
  const title = str(x?.title).slice(0, 200)
  if (!title) return { error: 'Add a title: the hook, the headline or a short name.' }
  const url = str(x?.url)
  if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) return { error: 'That link does not look right. Use the full address, like https://www.linkedin.com/posts/…' }
  const postedOn = str(x?.postedOn)
  if (postedOn && !/^\d{4}-\d{2}-\d{2}$/.test(postedOn)) return { error: 'Pick the posted date from the calendar.' }
  const row: Record<string, unknown> = {
    kind,
    title,
    platform: str(x?.platform).slice(0, 60) || null,
    url: url || null,
    posted_on: postedOn || null,
    notes: str(x?.notes).slice(0, 600) || null,
    content_piece_id: idOrNull(x?.contentPieceId),
    source_output_id: idOrNull(x?.sourceOutputId),
    source_run_id: str(x?.sourceRunId).slice(0, 120) || null,
    variant_file: kind === 'ad' ? str(x?.variantFile).slice(0, 300) || null : null,
  }
  for (const k of NUMS) row[k] = null
  let any = false
  for (const b of boxesFor(kind)) {
    const raw = str(x?.nums?.[b.k])
    if (!raw) continue
    const n = num(raw)
    if (n === null || n < 0) return { error: 'Use a number of zero or more for ' + b.word + '.' }
    const cash = b.k === 'spend' || b.k === 'revenue'
    if (!cash && Math.round(n) !== n) return { error: 'Use a whole number for ' + b.word + '.' }
    row[b.k] = cash ? Math.round(n * 100) / 100 : n
    any = true
  }
  if (!any) return { error: 'Add at least one number from the platform, such as impressions or clicks.' }
  const leads = row.leads as number | null
  if (row.qualified !== null && leads !== null && (row.qualified as number) > leads) return { error: 'Qualified leads cannot be more than leads.' }
  if (row.won !== null && leads !== null && (row.won as number) > leads) return { error: 'Clients won cannot be more than leads.' }
  if (postedOn && postedOn > today) return { error: 'The posted date is in the future.' }
  return { row }
}

/** Which piece a result was (the form's picker): a library piece, a campaign or a draft. */
export const pickOf = (r: Pick<Result, 'contentPieceId' | 'sourceRunId' | 'sourceOutputId'>) =>
  r.contentPieceId ? 'l:' + r.contentPieceId : r.sourceRunId ? 'c:' + r.sourceRunId : r.sourceOutputId ? 'd:' + r.sourceOutputId : ''

/** The results file the team fills in (v106Template). */
export const TEMPLATE_CSV =
  'Ad or post,Kind,Where,Date,Spend,Impressions,Clicks,Leads,Qualified leads,Booked calls,Clients won,Revenue,Reactions,Comments,Shares,Link,Notes\n'

// ---------- the Meta and LinkedIn sync ----------

export type Platform = { connected?: boolean; account_name?: string; account_id?: string; last_sync?: string; last_rows?: number; error?: string }
export type SyncState = { st: 'ok' | 'missing' | 'err'; meta: Platform; linkedin: Platform; msg: string }

/** Minutes, hours or days since a time (v113Ago). */
export function ago(iso: string, now: number): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const m = Math.round((now - t) / 60000)
  const n = (k: number, w: string) => k + ' ' + w + (k === 1 ? '' : 's')
  return m < 1 ? 'just now' : m < 60 ? n(m, 'minute') + ' ago' : m < 1440 ? n(Math.round(m / 60), 'hour') + ' ago' : m < 2880 ? 'yesterday' : Math.round(m / 1440) + ' days ago'
}

/** The line about the daily numbers (v113AdsLine): switched off, not connected, or where they come from and when. */
export function syncLine(S: SyncState, now: number): { text: string; connected: boolean } {
  if (S.st === 'missing') return { text: 'Daily numbers from Meta and LinkedIn: the sync workflow is not switched on in n8n yet.', connected: false }
  if (S.st === 'err') return { text: 'Could not check the daily numbers from Meta and LinkedIn' + (S.msg ? ': ' + S.msg.replace(/\.$/, '') : '') + '.', connected: false }
  const on = [S.meta.connected ? 'Meta (Facebook and Instagram)' : '', S.linkedin.connected ? 'LinkedIn' : ''].filter(Boolean)
  if (!on.length) return { text: 'Connect Meta and LinkedIn on Integrations and the numbers come in every morning.', connected: false }
  const last = [S.meta.last_sync, S.linkedin.last_sync].filter((x): x is string => !!x).sort().pop()
  return { text: 'Synced every morning from ' + on.join(' and ') + (last ? '. Last sync ' + ago(last, now) : '. First sync tomorrow morning') + '.', connected: true }
}
