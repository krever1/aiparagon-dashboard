// The Ad Strategist page's rules (NW_PAGES['e3.ads'] as v109, v111 and v113 left it, with v99's "which brief an ad
// went into"): one ad as the page shows it, whether it is still live, the top ads, the fit with what the team follows,
// the briefs that used it and why others were not picked, the filters and sorts of All ads, the runs, the industries
// and the uploads overview. Plain functions over rows already read, so the server, the page and the tests share them.

import { adClean, adTitle, idsOf, isDynamic, metaText } from './ads'
import { type Competitor, arr, followFor, json, num, ordinal, runOk, tokens } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const tidy = (s: unknown) =>
  str(s)
    .replace(/\s*[‒-―]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

// ---------- the tabs ----------

export type AdTab = 'top' | 'all' | 'uploads' | 'takeaways' | 'library' | 'following'
export const AD_TABS: readonly (readonly [AdTab, string])[] = [
  ['top', 'Top'],
  ['all', 'All ads'],
  ['uploads', 'Uploads'],
  ['takeaways', 'Takeaways'],
  ['library', 'Run library'],
  ['following', 'Following'],
]
/** The tab an address word names, the current dashboard's words too (winners, brief, copy, swipe, follow); Top when none. */
export function adTabOf(v: string | null | undefined): AdTab {
  const k = str(v).toLowerCase()
  const old: Record<string, AdTab> = { winners: 'all', ads: 'all', brief: 'takeaways', copy: 'uploads', swipe: 'uploads', follow: 'following', runs: 'library' }
  const t = (old[k] ?? k) as AdTab
  return AD_TABS.some((x) => x[0] === t) ? t : 'top'
}

// ---------- one ad (nwAdItem with v113's changes) ----------

export type AdLive = 'live' | 'stopped' | 'unknown' | 'upload'
export type Parts = { run: number; live: number; rep: number; reach: number }

export type AdView = {
  id: string
  runId: string
  createdAt: string
  /** the Ad Library link */
  url: string
  dest: string
  adv: string
  hook: string
  body: string
  cta: string
  offer: string
  price: number | null
  copyFormula: string
  patterns: string[]
  funnelStage: string
  platform: string
  /** uploaded by the team; from the Notion swipe file; pulled from the Ad Library */
  up: boolean
  sw: boolean
  lib: boolean
  uploadedBy: string
  days: number | null
  stale: number | null
  firstSeen: string
  lastSeen: string
  /** 0 to 100, null when not scored */
  score: number | null
  overridden: boolean
  parts: Parts | null
  reps: number
  img: string
  title: string
  dyn: boolean
  /** an upload not read yet */
  pend: boolean
  inBrief: boolean
  live: AdLive
  act: boolean
  industry: string
  takeaways: string[]
  visualHook: string
  textOnImage: string
  pastedCopy: string
  /** for the fit: the words the ad is made of */
  words: string
}

/** The score's four parts, their weights and what each means (NW_AD_FX). */
export const FX: readonly { k: keyof Parts; label: string; w: number; how: string }[] = [
  { k: 'run', label: 'How long it ran', w: 45, how: 'Full marks at 12 weeks or more' },
  { k: 'live', label: 'Still running', w: 35, how: 'Full marks if it was seen in the last 7 days, falling to zero after 60 days unseen' },
  { k: 'rep', label: 'Repeats', w: 10, how: 'The same copy in two or more ads from the same pull' },
  { k: 'reach', label: 'Reach shown', w: 10, how: 'Impressions or engagement shown in the Ad Library' },
]

const DAY = 864e5
const ymd = (v: unknown) => str(v).slice(0, 10)
/** Whole days between two dates by their UTC day (v113Days). */
export function dayDiff(a: string, b: string): number | null {
  const x = Date.parse(ymd(a) + 'T00:00:00Z')
  const y = Date.parse(ymd(b) + 'T00:00:00Z')
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / DAY) : null
}

/** Days since an ad was last seen, or its own stale count (adStale). */
export function staleOf(a: Record<string, unknown>, now: number): number | null {
  if (a.stale_days !== null && a.stale_days !== undefined && a.stale_days !== '') return Number(a.stale_days)
  if (!a.last_seen) return null
  const d = Math.round((now - Date.parse(str(a.last_seen))) / DAY)
  return Number.isNaN(d) ? null : Math.max(0, d)
}

/** The newest day each advertiser's Ad Library ads were seen, the latest pull of that advertiser (v113Seen). */
export function seenOf(rows: Record<string, unknown>[]): Record<string, string> {
  const S: Record<string, string> = {}
  for (const a of rows) {
    if (a.uploaded_by || str(a.source) === 'swipe_file') continue
    const k = str(a.advertiser_name).trim().toLowerCase()
    const d = ymd(a.last_seen)
    if (d && (!S[k] || d > S[k])) S[k] = d
  }
  return S
}

/**
 * Live (v113Live): seen in the latest pull of its advertiser, and that pull is no more than 8 days old. Stopped: a
 * later pull of its advertiser did not see it. Otherwise nothing has checked it since it was last seen.
 */
export function liveOf(a: Record<string, unknown>, seen: Record<string, string>, now: number): { live: 'live' | 'stopped' | 'unknown'; last: string } {
  const last = ymd(a.last_seen)
  if (!last) return { live: 'unknown', last: '' }
  const ref = seen[str(a.advertiser_name).trim().toLowerCase()] || last
  if ((dayDiff(last, ref) ?? 0) > 1) return { live: 'stopped', last }
  const age = dayDiff(ref, new Date(now).toISOString())
  return { live: age !== null && age <= 8 ? 'live' : 'unknown', last }
}

const isWeb = (u: string) => /^https?:\/\//i.test(u)

/** A pattern as words, whether the agent kept it as text or as an object. */
const patternText = (p: unknown) => (typeof p === 'string' ? p : str(json(p).pattern || json(p).name || json(p).text || json(p).label)).trim()

/** One ad as the page shows it; `reps` is how many ads of its pull share its copy group. */
export function adView(a: Record<string, unknown>, reps: number, seen: Record<string, string>, now: number, industry = ''): AdView {
  const ua = json(a.upload_analysis)
  const vis = json(ua.visual)
  const up = !!a.uploaded_by
  const sw = str(a.source) === 'swipe_file'
  const lib = !up && !sw
  const days = a.days_running === null || a.days_running === undefined || a.days_running === '' ? null : Number(a.days_running)
  const stale = staleOf(a, now)
  const ps = a.performance_score === null || a.performance_score === undefined || a.performance_score === '' ? null : Number(a.performance_score)
  const score = ps !== null && Number.isFinite(ps) ? Math.round(ps * 100) : null
  const parts: Parts | null = lib
    ? {
        run: days !== null ? Math.min(days / 84, 1) : 0,
        live: stale === null ? 0 : stale <= 7 ? 1 : Math.max(0, 1 - (stale - 7) / 53),
        rep: reps > 1 ? 1 : 0,
        reach: a.impressions_range || a.observed_engagement ? 1 : 0,
      }
    : null
  const firstImg = str(a.image_url)
  const img = [firstImg && !/^swipe:/i.test(firstImg) ? firstImg : '', ...arr(a.image_urls).map(str)].find((u) => u && isWeb(u)) ?? ''
  let live: AdLive = 'upload'
  let lastSeen = ''
  if (lib && a.last_seen) {
    const L = liveOf(a, seen, now)
    live = L.live
    lastSeen = L.last
  } else if (lib) {
    live = a.is_active === true || (stale !== null && stale <= 7) ? 'live' : 'stopped'
  }
  const patterns = arr(a.extracted_patterns).map(patternText).filter(Boolean)
  const takeaways = arr(ua.takeaways).map((t) => tidy(t)).filter(Boolean)
  const pr = num(a.price_point_inferred)
  return {
    id: str(a.id),
    runId: str(a.run_id),
    createdAt: str(a.created_at),
    url: str(a.ad_library_url),
    dest: str(a.destination_url),
    adv: str(a.advertiser_name).trim() || 'Unknown advertiser',
    hook: str(a.hook),
    body: str(a.body),
    cta: str(a.cta),
    offer: adClean(a.offer_inferred),
    price: a.price_point_inferred === null || a.price_point_inferred === undefined || a.price_point_inferred === '' ? null : pr,
    copyFormula: str(a.copy_formula),
    patterns,
    funnelStage: str(a.funnel_stage),
    platform: str(a.platform),
    up,
    sw,
    lib,
    uploadedBy: str(a.uploaded_by),
    days: days !== null && Number.isFinite(days) ? days : null,
    stale,
    firstSeen: ymd(a.first_seen),
    lastSeen,
    score,
    overridden: a.score_overridden === true,
    parts,
    reps,
    img,
    title: adTitle(a),
    dyn: isDynamic(a),
    pend: str(ua.status) === 'pending',
    inBrief: a.in_brief !== false,
    live,
    act: live === 'live',
    industry,
    takeaways,
    visualHook: tidy(vis.visual_hook),
    textOnImage: tidy(vis.text_on_image),
    pastedCopy: str(ua.pasted_copy),
    words: [a.hook, a.body, a.offer_inferred, a.copy_formula, patterns.join(' '), takeaways.join(' '), vis.text_on_image, a.destination_url].map(str).join(' '),
  }
}

/** The ads, newest first, each with how many of its pull share its copy group (nwAdPool). */
export function poolOf(rows: Record<string, unknown>[], now: number, industryOf: (adv: string) => string = () => ''): AdView[] {
  const groups: Record<string, number> = {}
  for (const a of rows) if (a.iteration_group) groups[str(a.run_id) + '|' + str(a.iteration_group)] = (groups[str(a.run_id) + '|' + str(a.iteration_group)] ?? 0) + 1
  const seen = seenOf(rows)
  return rows.map((a) => {
    const reps = a.iteration_group ? (groups[str(a.run_id) + '|' + str(a.iteration_group)] ?? 1) : 1
    return adView(a, reps, seen, now, industryOf(str(a.advertiser_name).trim() || 'Unknown advertiser'))
  })
}

/** The value band of a score (nwAdVal). */
export const bandOf = (s: number | null): 'high' | 'medium' | 'low' | '' => (s === null ? '' : s >= 70 ? 'high' : s >= 45 ? 'medium' : 'low')

/** What the parts add up to, on the score's 0 to 100 scale. */
export const partsSum = (p: Parts) => Math.round(FX.reduce((t, f) => t + p[f.k] * f.w, 0))

// ---------- the top ads (nwAdTop) ----------

export const topN = (picked: number | null, saved: unknown) => Math.max(3, Math.min(10, picked || num(saved) || 5))

/** The n best scored Ad Library ads: real copy first when there are enough, at most two per advertiser, no repeats. */
export function topAds(pool: AdView[], n: number): AdView[] {
  const scored = pool.filter((a) => a.lib && a.score !== null)
  const real = scored.filter((a) => !a.dyn)
  const base = (real.length >= n ? real : scored)
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.days ?? 0) - (a.days ?? 0) || Number(b.act) - Number(a.act))
  const key = (a: AdView) => a.adv.toLowerCase() + '|' + a.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)
  const out: AdView[] = []
  const taken = new Set<string>()
  const per: Record<string, number> = {}
  for (const a of base) {
    if (out.length >= n) break
    const k = key(a)
    const adv = a.adv.toLowerCase()
    if (taken.has(k) || (per[adv] ?? 0) >= 2) continue
    taken.add(k)
    per[adv] = (per[adv] ?? 0) + 1
    out.push(a)
  }
  for (const a of base) {
    if (out.length >= n) break
    const k = key(a)
    if (taken.has(k)) continue
    taken.add(k)
    out.push(a)
  }
  return out
}

// ---------- the industries (v96Ind, v111) ----------

export type IndMaps = { hand: Record<string, string>; ai: Record<string, string> }
const mapOf = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries(json(v)).map(([k, x]) => [k, str(x).trim()]).filter(([, x]) => x))
export const indMapsOf = (hand: unknown, ai: unknown): IndMaps => ({ hand: mapOf(hand), ai: mapOf(ai) })
const indKey = (name: string) => name.trim().toLowerCase()
/** An advertiser's industry: the one the team typed, else the agent's. */
export const industryOf = (M: IndMaps, name: string) => M.hand[indKey(name)] || M.ai[indKey(name)] || ''
/** Who set it: the team, the agent, or nobody. */
export const industryFrom = (M: IndMaps, name: string): 'you' | 'agent' | '' => (M.hand[indKey(name)] ? 'you' : M.ai[indKey(name)] ? 'agent' : '')

/** The advertisers of the ads, newest ads first, without the unknown ones (v111Advs). */
export function advertisers(pool: AdView[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const a of pool) {
    const k = a.adv.toLowerCase()
    if (/^unknown/.test(k) || seen.has(k)) continue
    seen.add(k)
    out.push(a.adv)
  }
  return out
}

/**
 * What the industry agent is sent for each advertiser: its site and its first three ads in a line each. A catalog ad
 * gives only its offer, and an ad with no words gives none (the old page sent template words and "Untitled ad").
 */
export function industryAsk(pool: AdView[], names: string[]) {
  return names.slice(0, 30).map((name) => {
    const own = pool.filter((a) => a.adv.toLowerCase() === name.toLowerCase())
    const site = own.find((a) => a.dest)?.dest ?? ''
    let host = ''
    try {
      host = site ? new URL(site).hostname.toLowerCase().replace(/^www\./, '') : ''
    } catch {
      host = ''
    }
    return {
      name,
      site: host,
      ads: own
        .slice(0, 3)
        .map((a) => [a.dyn ? '' : tidy(a.hook || a.body), tidy(a.offer)].filter(Boolean).join(' · '))
        .filter(Boolean),
    }
  })
}

/** The industry banner's words (nwAdsIndBanner; the old page said "None of the N advertisers has no industry yet"). */
export function industryLine(total: number, missing: number): string {
  if (!missing) return ''
  if (missing === total) return total === 1 ? 'The advertiser has no industry yet.' : 'None of the ' + total + ' advertisers has an industry yet.'
  return missing + ' of ' + total + ' advertisers ' + (missing === 1 ? 'has' : 'have') + ' no industry yet.'
}

// ---------- the fit with what the team follows (v113Crit, v113Fit) ----------

export type FitCrit = { kw: string[]; ind: string[]; accts: string[]; mkt: string; none: boolean }

export function fitCrit(adsFollow: unknown, follows: Competitor[], profile: { targetMarket: string; industry: string }): FitCrit {
  const S = json(adsFollow)
  const kw = arr(S.keywords).map(str).filter(Boolean)
  const ind = arr(S.industries).map(str).filter(Boolean)
  const accts = follows
    .filter((c) => c.status !== 'denied' && followFor(c) !== 'posts')
    .map((c) => c.name.trim())
    .filter(Boolean)
  const mkt = [profile.targetMarket, profile.industry].filter(Boolean).join(' ')
  return { kw, ind, accts, mkt, none: !kw.length && !ind.length && !accts.length && !mkt }
}

/** An account the team follows 30, a followed industry 25, each keyword 14 (three at most), the market up to 18. */
export function fitOf(a: AdView, C: FitCrit): { score: number; hits: string[] } | null {
  if (C.none) return null
  const T = new Set(tokens(a.words))
  const hits: string[] = []
  let pts = 0
  const adv = a.adv.trim().toLowerCase()
  if (adv && C.accts.some((n) => n.toLowerCase() === adv)) {
    pts += 30
    hits.push('an account you follow')
  }
  const its = tokens(a.industry)
  const ih = C.ind.find((i) => {
    const w = tokens(i)
    return w.length > 0 && (w.every((x) => its.includes(x)) || w.filter((x) => T.has(x)).length >= Math.min(2, w.length))
  })
  if (ih) {
    pts += 25
    hits.push('the ' + ih + ' industry')
  }
  let n = 0
  for (const q of C.kw) {
    const w = tokens(q)
    if (w.length && w.filter((x) => T.has(x)).length >= Math.max(1, Math.ceil(w.length * 0.6)) && ++n <= 3) {
      pts += 14
      hits.push('“' + q + '”')
    }
  }
  const mh = Array.from(new Set(tokens(C.mkt))).filter((x) => T.has(x))
  if (mh.length) {
    pts += Math.min(18, mh.length * 6)
    hits.push('your market (' + mh.slice(0, 3).join(', ') + ')')
  }
  return { score: Math.max(0, Math.min(100, Math.round(pts))), hits }
}

// ---------- which brief an ad went into (v99) ----------

export type BriefRef = { runId: string; createdAt: string; rule: string; n: number; listed: boolean; advs: Record<string, number>; custom: boolean }
export type CapEntry = { B: BriefRef; rank: number | null; meta: string }
export type CapIndex = { byUrl: Record<string, CapEntry[]>; byId: Record<string, CapEntry[]>; runs: Record<string, BriefRef> }

const DASH_LINE = /^\s*(\d+)\\?\.\s+\*\*(.+?)\*\*\s*(?:[‒-―-]|·)?\s*(.*)$/

/** Section 8 of an ads brief's markdown (v99Sec8): its rule (in brackets at the end of the heading) and its ads. */
export function sec8(md: string): { rule: string; ads: { n: number; adv: string; meta: string; url: string }[] } | null {
  const s = str(md)
  const i = s.search(/##\s*8\\?\.\s/)
  if (i < 0) return null
  const lines = s.slice(i).split('\n')
  const rule = ((/\(([^)]*)\)\s*$/.exec(lines[0]) || [])[1] || '').trim()
  const ads: { n: number; adv: string; meta: string; url: string }[] = []
  let cur: (typeof ads)[number] | null = null
  for (const ln of lines.slice(1)) {
    if (/^##\s|^---/.test(ln)) break
    const m = DASH_LINE.exec(ln)
    if (m) {
      cur = { n: Number(m[1]), adv: m[2].trim(), meta: m[3].trim(), url: '' }
      ads.push(cur)
      continue
    }
    if (!cur || /^\s*"/.test(ln)) continue
    const u = /(https?:\/\/[^\s)>\]]+)/.exec(ln)
    if (u && !cur.url) cur.url = u[1]
  }
  return { rule, ads }
}

/**
 * Which briefs listed which ads (v99AdLoad): the Ad Strategist's brief rows (one per run, the newest) by their section 8
 * links, plus the ids the brief saved (creative_briefs.source_ad_ids, and data.source_ad_ids). Only briefs built from
 * uploads were hand-picked.
 */
export function capIndex(mdRows: Record<string, unknown>[], briefRows: Record<string, unknown>[]): CapIndex {
  const byUrl: Record<string, CapEntry[]> = {}
  const byId: Record<string, CapEntry[]> = {}
  const runs: Record<string, BriefRef> = {}
  const add = (map: Record<string, CapEntry[]>, k: string, e: CapEntry) => {
    if (!k) return
    const L = (map[k] = map[k] ?? [])
    if (!L.some((x) => x.B === e.B)) L.push(e)
  }
  for (const o of mdRows) {
    const run = str(o.run_id)
    if (!run || runs[run]) continue
    const d = json(o.data)
    const S8 = sec8(str(o.content_md))
    const B: BriefRef = {
      runId: run,
      createdAt: str(o.created_at),
      rule: S8?.rule ?? '',
      n: S8?.ads.length ?? 0,
      listed: !!S8?.ads.length,
      advs: {},
      custom: /custom/.test(run) || d.custom === true,
    }
    runs[run] = B
    for (const x of S8?.ads ?? []) {
      add(byUrl, x.url, { B, rank: x.n, meta: x.meta })
      const k = x.adv.toLowerCase()
      B.advs[k] = (B.advs[k] ?? 0) + 1
    }
    for (const id of idsOf(d.source_ad_ids)) add(byId, id, { B, rank: null, meta: 'hand-picked' })
  }
  for (const c of briefRows) {
    const B = runs[str(c.run_id)]
    if (!B) continue
    for (const id of idsOf(c.source_ad_ids)) add(byId, id, { B, rank: null, meta: B.custom ? 'hand-picked' : '' })
  }
  return { byUrl, byId, runs }
}

export type Cap = { st: 'in' | 'out' | 'unlisted' | 'none'; list: CapEntry[]; own: BriefRef | null }

/** The briefs an ad went into, newest first; else why not (v99AdCap). */
export function capOfAd(a: Pick<AdView, 'id' | 'url' | 'runId'>, I: CapIndex): Cap {
  const L = [...(a.url ? (I.byUrl[a.url] ?? []) : []), ...(I.byId[a.id] ?? [])]
  const seen = new Set<string>()
  const list = L.filter((e) => (seen.has(e.B.runId) ? false : (seen.add(e.B.runId), true))).sort((x, y) => y.B.createdAt.localeCompare(x.B.createdAt))
  if (list.length) return { st: 'in', list, own: null }
  const own = I.runs[a.runId] ?? null
  return { st: own ? (own.listed ? 'out' : 'unlisted') : 'none', list: [], own }
}

/** How a brief picked an ad (v99AdPick): hand-picked, or the brief's note on it and its rank. The long form says the score as v113 does. */
export function pickText(e: CapEntry, short: boolean): string {
  if (e.B.custom || e.meta === 'hand-picked') return 'hand-picked by your team'
  let t = metaText(e.meta, short)
  if (!short) t = t.replace(/score ([\d.]+)/, (_m, x) => 'scored ' + Math.round(Number(x) * (Number(x) <= 1 ? 100 : 1)) + ' for that brief')
  return t + (e.rank && e.B.n ? ' · ' + ordinal(e.rank) + ' of ' + e.B.n + ' picked' : '')
}

/** The ad's line under its title on All ads (v99AdWhyShort); `day` words a brief's date. */
export function whyShort(a: AdView, c: Cap, day: (iso: string) => string): string {
  if (c.st === 'in') {
    const pk = pickText(c.list[0], true)
    return 'In the brief' + (pk && pk !== 'listed in the brief' ? ' · ' + pk : '') + (c.list.length > 1 ? ' · in ' + c.list.length + ' briefs' : '')
  }
  if (a.uploadedBy) return 'Uploaded by your team · not in a brief yet'
  if (c.st === 'none') return 'No brief was saved for its run'
  if (c.st === 'unlisted') return 'Its run’s brief did not list its ads'
  const B = c.own!
  const k = B.advs[a.adv.toLowerCase()] ?? 0
  if (k) return 'Not picked · ' + a.adv + ' already has ' + k + ' ad' + (k === 1 ? '' : 's') + ' in the brief of ' + day(B.createdAt)
  if (!a.act && a.stale !== null && a.stale > 45) return 'Not picked · not seen for ' + a.stale + ' days'
  return 'Not picked for the short list in the brief of ' + day(B.createdAt)
}

// ---------- All ads: filters and sorts (nwAdsAllHtml) ----------

export type AdFilters = { st: 'all' | 'live' | 'up'; adv: string; ind: string; run: string; cap: '' | 'in' | 'out'; q: string }
export const NO_FILTERS: AdFilters = { st: 'all', adv: '', ind: '', run: '', cap: '', q: '' }
export type SortKey = 'ad' | 'days' | 'status' | 'score' | 'run' | 'cap'

const capKey = (c: Cap | undefined) => (c && c.st === 'in' ? c.list[0].B.createdAt : '')

export function filterAds(pool: AdView[], f: AdFilters, caps: Record<string, Cap>): AdView[] {
  const q = f.q.trim().toLowerCase()
  return pool.filter((a) => {
    if (f.st === 'live' && !(a.act && !a.up)) return false
    if (f.st === 'up' && !(a.up || a.sw)) return false
    if (f.adv && a.adv !== f.adv) return false
    if (f.ind && a.industry !== f.ind) return false
    if (f.run && a.runId !== f.run) return false
    if (f.cap === 'in' && caps[a.id]?.st !== 'in') return false
    if (f.cap === 'out' && caps[a.id]?.st === 'in') return false
    if (q && ![a.title, a.body, a.adv, a.offer, a.cta, a.industry].join(' ').toLowerCase().includes(q)) return false
    return true
  })
}

export function sortAds(list: AdView[], key: SortKey, dir: 1 | -1, caps: Record<string, Cap>): AdView[] {
  const status = (a: AdView) => (a.up || a.sw ? 0 : a.live === 'live' ? 2 : 1)
  const val = (a: AdView): string | number => {
    switch (key) {
      case 'ad':
        return tidy(a.title).toLowerCase()
      case 'days':
        return a.days ?? -1
      case 'status':
        return status(a)
      case 'score':
        return a.score ?? -1
      case 'run':
        return a.runId
      case 'cap':
        return capKey(caps[a.id])
    }
  }
  return list.slice().sort((x, y) => {
    const a = val(x)
    const b = val(y)
    const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
    if (c) return c * dir
    return (y.score ?? -1) - (x.score ?? -1) || (y.days ?? -1) - (x.days ?? -1)
  })
}

// ---------- the runs (nwAdRuns, nwAdBriefs) ----------

export type AdRun = { runId: string; at: string; status: string; ok: boolean; running: boolean; stats: Record<string, unknown> }

/** The Ad Strategist's runs, and each brief whose run the table does not have, newest first. A run still going says so. */
export function adRuns(rows: Record<string, unknown>[], briefs: { run_id: string; created_at: string }[]): AdRun[] {
  const seen = new Set<string>()
  const out: AdRun[] = []
  for (const r of rows) {
    const id = str(r.run_id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const status = str(r.status)
    out.push({ runId: id, at: str(r.finished_at || r.started_at || r.run_date), status, ok: runOk(status), running: /^(running|started|pending)$/i.test(status), stats: json(r.stats) })
  }
  for (const b of briefs) {
    if (!b.run_id || seen.has(b.run_id)) continue
    seen.add(b.run_id)
    out.push({ runId: b.run_id, at: b.created_at, status: 'success', ok: true, running: false, stats: {} })
  }
  return out.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
}

/** The Ad Strategist's limits and when it runs (ai_settings agent_runs.ads, nwSched). */
export type AdSchedule = { top: number; behind: number; per: number; afterIntel: boolean }
export function adScheduleOf(agentRuns: unknown): AdSchedule {
  const A = json(json(agentRuns).ads)
  return {
    top: Math.max(3, Math.min(10, num(A.top) ?? 5)),
    behind: num(A.behind) ?? 30,
    per: num(A.per_advertiser) ?? 5,
    afterIntel: A.after_intel !== false,
  }
}

/** What a run's label starts with (nwAdRunLabel): uploads, a brief built from uploads, or nothing. */
export const runPrefix = (run: string) => (/^upload/.test(run) ? 'Uploads · ' : /custom/.test(run) ? 'From uploads · ' : '')

// ---------- the uploads overview (v113UpOverview) ----------

export function uploadsOverview(pool: AdView[], fit: (a: AdView) => number | null) {
  const ups = pool.filter((a) => a.up || a.sw)
  const read = ups.filter((a) => !a.pend)
  const counts: Record<string, { label: string; n: number }> = {}
  for (const a of read)
    for (const p of a.patterns) {
      const label = p.split(':')[0].trim()
      if (!label) continue
      const k = label.toLowerCase()
      counts[k] = counts[k] ? { label: counts[k].label, n: counts[k].n + 1 } : { label, n: 1 }
    }
  const patterns = Object.values(counts)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
  const takeaways = read
    .filter((a) => a.takeaways.length)
    .slice(0, 4)
    .map((a) => ({ id: a.id, text: a.takeaways[0] }))
  const offers: string[] = []
  for (const a of read) {
    const o = tidy(a.offer)
    if (o && !offers.some((x) => x.toLowerCase() === o.toLowerCase())) offers.push(o)
  }
  const fits = read.map(fit).filter((x): x is number => x !== null)
  return {
    total: ups.length,
    inNext: ups.filter((a) => a.inBrief).length,
    avgFit: fits.length ? Math.round(fits.reduce((t, x) => t + x, 0) / fits.length) : null,
    patterns,
    takeaways,
    offers: offers.slice(0, 3),
  }
}

// ---------- the ad copy written from uploads (apCopySets) ----------

export type CopyVariant = { angle: string; hook: string; primary: string; headline: string; cta: string; image: string; pattern: string }
export type CopySet = {
  id: string
  title: string
  createdAt: string
  platform: string
  sources: number
  takeaways: string[]
  notes: string
  variants: CopyVariant[]
}

const notesOf = (v: unknown) => {
  const list = arr(v).map(tidy).filter(Boolean)
  return list.length ? list.join(' · ') : typeof v === 'string' ? tidy(v) : ''
}

export function copySetOf(r: Record<string, unknown>): CopySet {
  const d = json(r.data)
  return {
    id: str(r.id),
    title: tidy(r.title) || 'Ad copy',
    createdAt: str(r.created_at),
    platform: tidy(d.platform),
    sources: arr(d.source_ads).length,
    takeaways: arr(d.takeaways).map(tidy).filter(Boolean),
    // a list as the copy writer sends it (apCopyHtml joins it with dots); a line of text in older sets
    notes: notesOf(d.guideline_notes),
    variants: arr(d.variants)
      .map(json)
      .map((v) => ({
        angle: tidy(v.angle),
        hook: str(v.hook).trim(),
        primary: str(v.primary_text || v.body).trim(),
        headline: str(v.headline).trim(),
        cta: str(v.cta).trim(),
        image: str(v.image_direction || v.image_idea || v.image).trim(),
        pattern: tidy(v.pattern_borrowed || v.pattern_used || v.pattern),
      }))
      .filter((v) => v.hook || v.primary || v.headline),
  }
}

/** The text a variant's Copy button puts on the clipboard. */
export const variantText = (v: CopyVariant) => [v.hook, v.primary, v.headline ? 'Headline: ' + v.headline : '', v.cta ? 'CTA: ' + v.cta : ''].filter(Boolean).join('\n\n')

// ---------- Following: the searches and filters (v111, ads_follow) ----------

export const AD_TYPES: readonly (readonly [string, string])[] = [
  ['image', 'Image'],
  ['video', 'Video'],
  ['carousel', 'Carousel'],
  ['text', 'Text only'],
]
export const COUNTRIES: readonly (readonly [string, string])[] = [
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['ALL', 'All countries'],
]
export const KW_MAX = 10
export const IND_MAX = 8

export type AdsFollow = { keywords: string[]; industries: string[]; types: string[]; active: 'active' | 'all'; country: string; saved: boolean }

export function adsFollowOf(v: unknown): AdsFollow {
  const S = json(v)
  const country = str(S.country)
  return {
    keywords: arr(S.keywords).map(str).filter(Boolean),
    industries: arr(S.industries).map(str).filter(Boolean),
    types: AD_TYPES.map((t) => t[0]).filter((t) => arr(S.types).map(str).includes(t)),
    active: S.active === 'active' ? 'active' : 'all',
    country: COUNTRIES.some((c) => c[0] === country) ? country : 'US',
    saved: Object.keys(S).length > 0,
  }
}

/** A chip as the box takes it: no quotes or backslashes, spaces folded, 60 characters. */
export const chipClean = (raw: string) => raw.replace(/["\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)

/** Why a chip cannot be added, or '' (v111FolAdd). */
export function chipProblem(list: string[], value: string, max: number): string {
  if (value.length < 2) return 'Type at least two letters.'
  if (list.some((x) => x.toLowerCase() === value.toLowerCase())) return '“' + value + '” is on the list already.'
  if (list.length >= max) return 'That is ' + max + ' already. Remove one first.'
  return ''
}

/** A Facebook page id or name from what was pasted (v111FbPage), or '' when it is not one. */
export function fbPage(raw: string): string {
  const t = str(raw).trim()
  if (!t) return ''
  let m = /view_all_page_id=(\d+)/.exec(t)
  if (m) return m[1]
  m = /facebook\.com\/profile\.php\?id=(\d+)/i.exec(t)
  if (m) return m[1]
  m = /facebook\.com\/(?:pg\/)?([A-Za-z0-9.\-_]+)/i.exec(t)
  if (m) return /^(ads|pages|profile\.php|groups|events|watch|marketplace|business|people|share)$/i.test(m[1]) ? '' : m[1]
  return /^[A-Za-z0-9.\-_]{3,80}$/.test(t) ? t : ''
}

/** The Meta Ad Library search for a name (v111LibSearch). */
export const libSearch = (name: string) =>
  'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=' + encodeURIComponent(name) + '&search_type=keyword_unordered'

/** A page's Facebook address. */
export const pageUrl = (page: string) => 'https://www.facebook.com/' + encodeURIComponent(page.trim()).replace(/%2F/gi, '/')

/** Followed for ads (v111ForAds): has a page and is not followed for posts only. */
export const forAds = (c: Competitor) => !!c.metaPageId.trim() && followFor(c) !== 'posts'
