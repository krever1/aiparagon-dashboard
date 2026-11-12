// New draft's step 2, "What the briefs found" (v111OrgPool, v111AdPool, v111InsAll, v111InsBody, v111InSave,
// v111WriteFrom and v111Dress in the current dashboard): what the newest organic briefs found, each with the category of
// the posts behind it, and for a paid ad what the newest ads briefs found and the best ads of the type the Ad Strategist
// read. The team uses what fits, drops what does not, or keeps one for later; what it uses rides in the request. Pure:
// the server builds the pools, the form picks from them, the server checks the picks again.

import { adFallback, clip, tidy } from '@/lib/touchpoint/approvals'
import { adClean, isDynamic } from './ads'
import { type AdsBriefRow, adsParts, devsOf, fiveItems, orgFive, reviewOf, shiftsOf } from './briefs'
import { CAT_OF, arr, json, num, tokens } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)

export type FSrc = 'Five things' | 'What changed' | 'Development' | 'Post' | 'Hook pattern' | 'Offer' | 'Pain' | 'Objection' | 'Angle' | 'Ad'
export const SRC_NAMES: readonly FSrc[] = ['Five things', 'What changed', 'Development', 'Post', 'Hook pattern', 'Offer', 'Pain', 'Objection', 'Angle', 'Ad']

/** The brief a finding comes from: its kind, run, day and whether it is approved. */
export type FBrief = { kind: 'org' | 'ads'; run: string; date: string; ok: boolean }

/** A finding (v111's insight): what it says, why, where it came from, its category and how much it weighs. */
export type Finding = {
  id: string
  src: FSrc
  text: string
  why: string
  url: string
  who: string
  /** the organic category of the posts behind it ('' when none) */
  c: string
  /** five things 3, shifts, hooks, offers and the angle 2, developments, pains and objections 1, posts and ads 0 */
  w: number
  eng: number
  brief: FBrief | null
  adId: string
  fmt: string
  score: number
  days: number
  ord: number
}

/** djb2, as v111Hash: the same finding keeps its id from visit to visit (and in the current dashboard). */
export function hashId(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return 'i' + (h >>> 0).toString(36)
}

/** Two texts sharing 60% of their words (v111Near). */
export function near(a: string, b: string): boolean {
  const A = new Set(tokens(a))
  const B = tokens(b)
  if (!A.size || !B.length) return false
  const n = B.filter((w) => A.has(w)).length
  return n / Math.max(A.size, B.length) >= 0.6
}

/** The organic category of a post's format, its free-text formats included (v111Cat with V99_CAT_OF). */
export function catOfFormat(f: unknown): string {
  const s = str(f).toLowerCase().trim()
  if (!s) return ''
  if (CAT_OF[str(f)]) return CAT_OF[str(f)]
  if (/job|hiring|vacanc|personal update/.test(s)) return ''
  if (/podcast|video|replay|audio|episode|youtube|livestream/.test(s)) return 'audio_video'
  if (/event|webinar|conference|summit|live training|meetup|panel|recap|workshop/.test(s)) return 'events'
  if (/case stud|client result|testimonial|success|recognition|award/.test(s)) return 'case_studies'
  if (/research|report|white ?paper|survey|study|data|benchmark/.test(s)) return 'research'
  if (/newsletter|digest|roundup|magazine issue/.test(s)) return 'newsletters'
  if (/article|blog|feature|publication|magazine|op-?ed/.test(s)) return 'articles'
  if (/news|announce|launch|funding|release|product|partnership|acquisition/.test(s)) return 'news'
  if (/offer|promo|discount|sale/.test(s)) return ''
  if (/how.?to|guide|tutorial|explainer|tips|checklist|resource|list|training|educat|playbook/.test(s)) return 'educational'
  if (/opinion|framework|perspective|thought|commentary|analysis|insight|post|view/.test(s)) return 'opinion'
  return ''
}

type Draft = Omit<Finding, 'id' | 'ord' | 'text' | 'why' | 'url' | 'who' | 'c' | 'eng' | 'adId' | 'fmt' | 'score' | 'days'> &
  Partial<Pick<Finding, 'url' | 'who' | 'c' | 'eng' | 'adId' | 'fmt' | 'score' | 'days'>> & { text: unknown; why?: unknown }

/** Adds a finding: tidied, none empty, no near copy of one of the same kind. */
function pusher(out: Finding[], prefix: string) {
  return (x: Draft, run: string) => {
    const text = tidy(x.text)
    if (!text) return
    if (out.some((y) => y.src === x.src && near(y.text, text))) return
    out.push({
      url: '',
      who: '',
      c: '',
      eng: 0,
      adId: '',
      fmt: '',
      score: 0,
      days: 0,
      ...x,
      text,
      why: tidy(x.why),
      id: hashId(prefix + '|' + run + '|' + x.src + '|' + text),
      ord: out.length,
    })
  }
}

// ---------- the organic briefs ----------

/** An organic brief as the pool reads it: its run, day, whether it is approved, markdown, data and snapshot. */
export type OrgIn = { run: string; date: string; ok: boolean; md: string; data: Row; snapshot: unknown }

/**
 * What the newest organic briefs found (v111OrgPool, the six newest): the five things, what changed, the notable
 * developments and what works in each post, skipping what the brief's review hid or the team's layout switched off and
 * the posts the review removed. Each gets the category of the closest post.
 */
export function orgPool(briefs: OrgIn[], off: string[]): Finding[] {
  const out: Finding[] = []
  const push = pusher(out, 'org')
  for (const o of briefs.slice(0, 6)) {
    const run = o.run
    const rev = reviewOf(o.data)
    const hid = rev?.hidden ?? []
    const rm = rev?.removed ?? []
    const skip = (k: string) => hid.includes(k) || off.includes(k)
    const by: Record<string, Row> = {}
    for (const raw of [...arr(o.data.items), ...arr(o.data.high_value_items)]) {
      const i = json(raw)
      const u = str(i.url)
      if (u && !by[u] && !rm.includes(u)) by[u] = i
    }
    const toks: Record<string, string[]> = {}
    for (const u of Object.keys(by)) toks[u] = tokens([by[u].headline, by[u].summary, by[u].working, by[u].signal].map(str).join(' '))
    // the post closest to a line: two or more shared words
    const nearest = (t: string): Row | null => {
      const q = new Set(tokens(t))
      let best: Row | null = null
      let bs = 0
      for (const u of Object.keys(toks)) {
        const s = toks[u].filter((w) => q.has(w)).length
        if (s > bs) {
          bs = s
          best = by[u]
        }
      }
      return bs >= 2 ? best : null
    }
    const catOf = (i: Row | null) => (i ? catOfFormat(i.format || i.content_format) : '')
    const brief: FBrief = { kind: 'org', run, date: o.date, ok: o.ok }
    if (!skip('five'))
      for (const x of orgFive(o.snapshot, o.md, false)) {
        const i = nearest(x.text + ' ' + (x.why || ''))
        push({ src: 'Five things', text: x.text, why: x.why, url: i ? str(i.url) : '', who: i ? str(i.competitor) : '', c: catOf(i), w: 3, brief }, run)
      }
    if (!skip('shift'))
      for (const s of shiftsOf(o.md, o.data)) {
        const i = (s.url && by[s.url]) || nearest(s.title + ' ' + s.obs)
        push({ src: 'What changed', text: s.title, why: s.use || s.interp || s.obs, url: s.url, who: s.who, c: catOf(i), w: 2, brief }, run)
      }
    if (!skip('dev'))
      for (const d of devsOf(o.md)) {
        const i = d.url ? by[d.url] : undefined
        const c = catOf(i ?? null) || (/news|product|\bai\b/i.test(d.cat) ? 'news' : /thought/i.test(d.cat) ? 'opinion' : '')
        push({ src: 'Development', text: d.title || clip(d.text, 100), why: d.why || d.text, url: d.url, who: d.who, c, w: 1, brief }, run)
      }
    for (const u of Object.keys(by)) {
      const i = by[u]
      const working = str(i.working)
      if (!working || /off-topic/i.test(working)) continue
      push({ src: 'Post', text: working, why: str(i.headline) || clip(str(i.summary), 140), url: u, who: str(i.competitor), eng: num(i.engagement_total) ?? 0, c: catOf(i), w: 0, brief }, run)
    }
  }
  return out
}

// ---------- the ads briefs and the ads ----------

/** An ads brief as the pool reads it: its row, whether it is approved, its snapshot and the sections its review hid. */
export type AdsIn = { row: Pick<AdsBriefRow, 'run_id' | 'created_at' | 'winning_hooks' | 'winning_offers' | 'core_pain_points' | 'objection_themes' | 'differentiation_angle'>; ok: boolean; snapshot: unknown; hidden: string[] }
/** An ad the Ad Strategist read, as the pool reads it. */
export type AdIn = { id: string; run: string; adv: string; hook: string; title: string; cta: string; fmt: string; score: number; days: number | null }

/** An ad row (winner_creatives) as the pool reads it; a catalog ad made only of template words is left out. */
export function adInOf(a: Row): AdIn | null {
  if (isDynamic(a)) return null
  const ps = num(a.performance_score)
  const d = num(a.days_running)
  return {
    id: str(a.id),
    run: str(a.run_id),
    adv: str(a.advertiser_name).trim() || 'Unknown advertiser',
    hook: str(a.hook).trim(),
    title: (str(a.hook) || str(a.body) || 'Untitled ad').trim(),
    cta: str(a.cta),
    fmt: str(a.format),
    score: ps !== null ? Math.round(ps * 100) : 0,
    days: d,
  }
}

/**
 * What the newest ads briefs found and the ads the Ad Strategist read (v111AdPool, the three newest briefs): the five
 * things, the hook patterns, offers, pains, objections and the angle, and each ad by its hook.
 */
export function adPool(briefs: AdsIn[], ads: AdIn[], off: string[]): Finding[] {
  const out: Finding[] = []
  const push = pusher(out, 'ads')
  for (const b of briefs.slice(0, 3)) {
    const run = b.row.run_id
    const skip = (k: string) => b.hidden.includes(k) || off.includes(k)
    const brief: FBrief = { kind: 'ads', run, date: b.row.created_at, ok: b.ok }
    const P = adsParts(b.row as AdsBriefRow)
    if (!skip('five')) for (const x of fiveItems(b.snapshot, adFallback({ winning_hooks: P.hooks, core_pain_points: P.pains }), false)) push({ src: 'Five things', text: x.text, why: x.why, w: 3, brief }, run)
    for (const h of P.hooks) push({ src: 'Hook pattern', text: h, why: 'A pattern from the ads brief, to put in your own words', w: 2, brief }, run)
    if (!skip('offer'))
      for (const o of P.offers) {
        const pr = Number(o.price)
        push({ src: 'Offer', text: (o.type || 'Offer') + (o.price !== '' && Number.isFinite(pr) && pr ? ' at $' + pr : ''), why: o.notes, w: 2, brief }, run)
      }
    if (!skip('pain')) {
      for (const p of P.pains) push({ src: 'Pain', text: p, w: 1, brief }, run)
      for (const p of P.objections) push({ src: 'Objection', text: p, why: 'Answer it before the buyer raises it', w: 1, brief }, run)
    }
    if (!skip('short') && P.angle) push({ src: 'Angle', text: clip(P.angle, 180), why: 'The angle the ads brief sets', w: 2, brief }, run)
  }
  for (const a of ads) {
    push(
      {
        src: 'Ad',
        text: a.hook || a.title,
        why: [a.adv, a.days !== null ? plural(a.days, 'day') + ' running' : '', tidy(adClean(a.cta))].filter(Boolean).join(' · '),
        adId: a.id,
        who: a.adv,
        fmt: a.fmt,
        score: a.score,
        days: a.days ?? 0,
        w: 0,
        brief: null,
      },
      a.run,
    )
  }
  return out
}

/** The ad formats of each ad type (V111_AFMT). */
export const AD_FMT: Readonly<Record<string, readonly string[]>> = { ad_image: ['static_image', 'image'], ad_text: ['text'], ad_carousel: ['carousel'], ad_video: ['video'] }
export const AD_FMT_NAME: Readonly<Record<string, string>> = { ad_image: 'image ads', ad_text: 'text ads', ad_carousel: 'carousel ads', ad_video: 'video ads' }

/**
 * The findings for the form as it is set (v111InsAll): for a paid ad, the eight best ads of its type then the brief's
 * findings by weight and day; otherwise the organic findings of the category (none: the findings, not the posts),
 * findings first in brief order, then posts by engagement.
 */
export function findingsFor(adcopy: boolean, cat: string, org: Finding[], ads: Finding[]): Finding[] {
  if (adcopy) {
    const f = AD_FMT[cat] ?? []
    const A = ads
      .filter((x) => x.src === 'Ad' && f.includes(x.fmt))
      .sort((a, b) => b.score - a.score || b.days - a.days)
      .slice(0, 8)
    const B = ads
      .filter((x) => x.src !== 'Ad')
      .sort((a, b) => b.w - a.w || (Date.parse(b.brief?.date ?? '') || 0) - (Date.parse(a.brief?.date ?? '') || 0))
    return [...A, ...B]
  }
  const L = !cat ? org.filter((x) => x.w > 0) : org.filter((x) => x.c === cat)
  return L.slice().sort((a, b) => Number(b.w > 0) - Number(a.w > 0) || (a.w > 0 ? a.ord - b.ord : b.eng - a.eng))
}

/** How many organic findings each category has, the dropped left out (the chips' counts). */
export const catCount = (org: Finding[], cat: string, drop: Record<string, unknown>) => org.filter((x) => x.c === cat && !drop[x.id]).length

/** The lead line over the cards. */
export function leadLine(adcopy: boolean, nOrg: number, noun: string): string {
  return adcopy
    ? 'From your ads briefs and the ads the Ad Strategist read. Use what fits, drop what does not, or keep one for later.'
    : 'From your last ' + Math.min(6, nOrg) + ' organic briefs. Use what fits, drop what does not, or keep one for later. The ' + noun + ' is built on what you use.'
}

/** The briefs behind the findings that are not approved yet, by day. */
export function waitNote(list: Finding[], day: (iso: string) => string): string {
  const seen = new Set<string>()
  const L: string[] = []
  for (const x of list)
    if (x.brief && !x.brief.ok && !seen.has(x.brief.run)) {
      seen.add(x.brief.run)
      L.push(day(x.brief.date))
    }
  if (!L.length) return ''
  return (L.length === 1 ? 'The brief of ' + L[0] + ' is' : 'The briefs of ' + L.slice(0, -1).join(', ') + ' and ' + L[L.length - 1] + ' are') + ' not approved yet. Its findings can still be used.'
}

/** Where a card says it is from. */
export const fromLine = (x: Finding, day: (iso: string) => string) =>
  x.src === 'Ad' || !x.brief ? 'From the Ad Strategist' : (x.brief.kind === 'org' ? 'Organic brief' : 'Ads brief') + ' · ' + day(x.brief.date)
/** A card's tag. */
export const tagOf = (x: Finding) => (x.src === 'Post' ? 'What works in a post' : x.src)

// ---------- kept for later ----------

/** The idea note Save for later writes (v111InSave): the finding, why, and where it came from; tagged with its id. */
export function laterNote(x: Finding, catName: string, day: (iso: string) => string): { note: string; tags: string[] } {
  const from = x.src === 'Ad' || !x.brief ? 'the Ad Strategist' : (x.brief.kind === 'org' ? 'the organic brief' : 'the ads brief') + ' of ' + day(x.brief.date)
  return { note: x.text + (x.why ? '\n' + x.why : '') + '\nFrom ' + from + '.', tags: ['From the briefs', catName || x.src, 'insight:' + x.id] }
}
/** The findings already kept for later, from the ideas' tags. */
export function savedIds(notes: { tags: string[] }[]): Record<string, true> {
  const o: Record<string, true> = {}
  for (const n of notes) for (const t of n.tags) {
    const m = /^insight:(\w+)$/.exec(t)
    if (m) o[m[1]] = true
  }
  return o
}

// ---------- what rides in the request ----------

/** A pick as it goes with the request. */
export type Chosen = { id: string; text: string; why: string; src: FSrc; brief: string | null; url: string | null; adId: string | null }
export const PICK_MAX = 12
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const pickOf = (x: Finding): Chosen => ({ id: x.id, text: x.text, why: x.why, src: x.src, brief: x.brief?.run ?? null, url: x.url || null, adId: x.adId || null })

/** The picks sent from the browser, checked: twelve at most, known kinds, texts cut, links only to the web. */
export function picksFrom(input: unknown): Chosen[] {
  if (!Array.isArray(input)) return []
  const out: Chosen[] = []
  for (const raw of input.slice(0, PICK_MAX)) {
    const o = raw && typeof raw === 'object' ? (raw as Row) : {}
    const text = tidy(o.text).slice(0, 300)
    const src = SRC_NAMES.find((s) => s === o.src)
    if (!text || !src) continue
    const url = str(o.url).trim()
    out.push({
      id: /^i[0-9a-z]{1,12}$/.test(str(o.id)) ? str(o.id) : hashId(text),
      text,
      why: tidy(o.why).slice(0, 400),
      src,
      brief: str(o.brief).trim().slice(0, 120) || null,
      url: /^https?:\/\//i.test(url) ? url.slice(0, 2000) : null,
      adId: UUID.test(str(o.adId)) ? str(o.adId) : null,
    })
  }
  return out
}

/** setup.insights, as v111Dress writes it. */
export const insightsOf = (P: Chosen[]) => P.map((x) => ({ text: x.text, why: x.why, from: x.src, brief: x.brief, url: x.url, ad_id: x.adId }))

/** The rule that frames a piece made from material on the picks (v111Dress). */
export const picksRule = (P: Chosen[]) =>
  'Build it on these findings the team picked from the market briefs (they frame it; the facts come from our material): ' + P.map((x) => clip(x.text, 120)).join('; ') + '.'

/** The block an idea gets when the picks were not what it was written from (v111Dress). */
export const picksBlock = (P: Chosen[]) =>
  'What the team picked from the briefs to build on:\n' + P.map((x, i) => i + 1 + '. ' + x.text + (x.why ? ' (' + clip(x.why, 140) + ')' : '')).join('\n')

/** Write it from these, with no material: the picks become the idea (v111WriteFrom). */
export const PICKED_LEAD = 'The point I want to make, from what the market briefs found:'
export function ideaFromPicks(P: Chosen[]): string {
  const th = PICKED_LEAD + '\n' + P.map((x) => '- ' + x.text + (x.why ? '. ' + clip(x.why, 160) : '')).join('\n')
  return th.length < 60 ? th + '\nWrite it from our own point of view.' : th
}

/** Topics from what the briefs found (v113CtTopicsFill): the picks, else the first three findings, each cut to 80. */
export const topicsFrom = (picks: Chosen[], list: Finding[]) =>
  (picks.length ? picks : list)
    .slice(0, 3)
    .map((x) => clip(tidy(x.text), 80))
    .join('; ')

/** The side's row (v111InsSide): how many picks, and what they say. */
export const picksSide = (P: Chosen[]) => ({ title: 'From the briefs · ' + plural(P.length, 'pick'), sub: clip(P.map((x) => x.text).join('; '), 90) })

