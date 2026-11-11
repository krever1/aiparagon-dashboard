// The Market Intelligence Briefs page's rules (NW_PAGES['e3.briefs'] and the nwBr functions, as v109 to v127 left
// them): who decided what on a brief, the organic brief's sections read from its markdown, the ads brief's parts, the
// ads behind it, the Combined cards, the team's layout and the page's fixed words. Plain functions over rows already
// read, so the server, the page and the tests share them.

import { type SnapItem, adFallback, clip, orgFallback, snapItems, tidy, words } from '@/lib/touchpoint/approvals'
import { type Ad, type Cand, type Source, candOf, hookUrlsFor, metaText, rankAds } from './ads'
import { type IntelItem, arr, json, num } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

// ---------- the page's tabs ----------

export type Tab = 'organic' | 'ads' | 'combined'
export const TABS: readonly (readonly [Tab, string])[] = [
  ['organic', 'Organic'],
  ['ads', 'Ads'],
  ['combined', 'Combined'],
]
/** The tab an address word names (the current dashboard's words too: paid, creative); organic when none. */
export const tabOf = (v: string | null | undefined): Tab => (v === 'ads' || v === 'paid' ? 'ads' : v === 'combined' || v === 'creative' ? 'combined' : 'organic')

// ---------- who decided what (apCfDecision, nwBrState, apCfDecLine) ----------

export type DecRow = { target_id: string; action: string; feedback: string; author: string; created_at: string }
export type BState = 'ok' | 'changes' | 'pending'

/** The newest decision row for a brief (the rows come newest first). */
export const newestFor = (rows: DecRow[], id: string): DecRow | null => rows.find((r) => r.target_id === id) ?? null

/** Approved, changes requested or needs review: only the newest row counts, and undone or edited is no decision. */
export function stateOf(row: DecRow | null): BState {
  if (row?.action === 'approved') return 'ok'
  if (row?.action === 'changes') return 'changes'
  return 'pending'
}

export const PILL: Readonly<Record<BState, readonly ['good' | 'bad' | 'warn', string]>> = {
  ok: ['good', 'Approved'],
  changes: ['bad', 'Changes requested'],
  pending: ['warn', 'Needs review'],
}

const nameOf = (author: string) => str(author).split('@')[0] || 'someone'

/** The line under a brief's review: who decided and when, else the brief's own helper text. */
export function decLine(row: DecRow | null, helper: string, ago: (iso: string) => string): string {
  if (!row) return helper
  if (row.action === 'edited') {
    const fb = str(row.feedback).trim().slice(0, 200).replace(/[.\s]+$/, '')
    return 'Edited by ' + nameOf(row.author) + ' ' + ago(row.created_at) + (fb ? ': ' + fb : '') + '. Approve it when it reads right.'
  }
  if (row.action !== 'approved' && row.action !== 'changes') return helper
  const fb = str(row.feedback).trim()
  return (
    (row.action === 'approved' ? 'Approved by ' : 'Changes requested by ') +
    nameOf(row.author) +
    ' ' +
    ago(row.created_at) +
    (fb ? ': “' + fb.slice(0, 140) + '”' : '')
  )
}

/** The header's line: how many of the newest briefs wait for a review. */
export function waitingLine(n: number, any: boolean): { tone: 'warn' | 'good'; text: string } {
  if (n) return { tone: 'warn', text: n + (n === 1 ? ' brief waiting for your review' : ' briefs waiting for your review') }
  return { tone: 'good', text: any ? 'Every brief reviewed' : 'No briefs yet' }
}

// ---------- the briefs ----------

export type Review = { by: string; at: string; hidden: string[]; removed: string[]; original: boolean }

/** A saved review (the brief editor's), or null. */
export function reviewOf(d: Record<string, unknown>): Review | null {
  const r = json(d.review)
  if (!Object.keys(r).length) return null
  return {
    by: str(r.by),
    at: str(r.at),
    hidden: arr(r.hidden).map(str),
    removed: arr(r.removed).map(str),
    original: r.original !== undefined && r.original !== null,
  }
}

/** A run of the Intel Tracker started by hand (custom), as the brief says. */
export const isCustom = (d: Record<string, unknown>) => /custom/i.test(str(d.run_source || d.run_type))

/** One brief per run, the newest row, newest first. */
export function newestPerRun<T extends { run_id: unknown; created_at: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows
    .slice()
    .sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))
    .filter((r) => {
      const k = str(r.run_id)
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
}

// ---------- the organic brief's sections, from its markdown ----------

/** The text of "## <n>." up to the next "## " heading or a "---" line (nwMdSec). */
export function mdSec(md: string, n: number): string {
  const s = str(md)
  const m = new RegExp('^##\\s*' + n + '\\\\?\\.[^\\n]*\\n', 'm').exec(s)
  if (!m) return ''
  const rest = s.slice(m.index + m[0].length)
  const e = rest.search(/^##\s|^---\s*$/m)
  return e >= 0 ? rest.slice(0, e) : rest
}

const mdLink = (t: string) => {
  const m = /\[([^\]]+)\]\((https?:[^)\s]+)\)/.exec(t)
  return m ? { who: m[1], url: m[2] } : null
}

/** Markdown's emphasis, links and a trailing hand-off taken out (nwMdPlain). */
export function mdPlain(t: unknown): string {
  const s = str(t)
    .replace(/\\([_*#])/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
    .replace(/\*+/g, '')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, '$1$2')
    .replace(/\s*→\s*hand to Agent \d\.?\s*$/i, '')
  return tidy(s)
    .replace(/^[,;:.\s]+/, '')
    .replace(/[,;\s]+$/, '')
}

export type Shift = { title: string; interp: string; obs: string; who: string; url: string; use: string }

/** "What changed": the shifts in "## 3." (nwBrShifts), else the brief's own list of them. */
export function shiftsOf(md: string, d: Record<string, unknown>): Shift[] {
  const out: Shift[] = []
  const sec = mdSec(md, 3)
    .replace(/\r/g, '')
    .replace(/\s·\s(?=\*\*(?:Evidence|Implication|For our))/g, '\n')
    .replace(/^\s*[-*]\s+(?=\*\*(?:Evidence|Implication|For our))/gm, '')
  for (const b0 of sec.split(/\n(?=\s*(?:\*\*)?Shift)/)) {
    const bl = b0.trim()
    const m0 = /^(?:\*\*)?Shift:?(?:\*\*)?:?\s*/.exec(bl)
    if (!m0) continue
    const lines = bl
      .slice(m0[0].length)
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
    const first = lines.shift() ?? ''
    let title = ''
    let interp = ''
    let obs = ''
    let who = ''
    let url = ''
    let use = ''
    if (/\*\*\s*$/.test(first)) title = first.replace(/\*\*\s*$/, '')
    else {
      const parts = first.split(/\s[‒-―]\s/)
      title = parts[0]
      interp = parts.slice(1).join(' ')
    }
    for (const l0 of lines) {
      const ln = l0.replace(/^[-*]\s+/, '')
      let m = /^(?:\*\*)?Evidence:?(?:\*\*)?:?\s*([\s\S]*)$/i.exec(ln)
      if (m) {
        const L = mdLink(m[1])
        who = L?.who ?? ''
        url = L?.url ?? ''
        obs = m[1].replace(/^\s*\[[^\]]+\]\([^)]+\)\s*(?:[:‒-―-]\s*)?/, '')
        continue
      }
      m = /^(?:\*\*)?(?:Implication for our (?:ads|content)|For our (?:ads|content)):?(?:\*\*)?:?\s*([\s\S]*)$/i.exec(ln)
      if (m) {
        use = m[1]
        continue
      }
      if (!interp) interp = ln
    }
    let t = mdPlain(title)
    if (!t) continue
    if (t.length > 130 && !interp) {
      interp = t
      t = clip(t, 110)
    }
    out.push({ title: t, interp: mdPlain(interp), obs: mdPlain(obs), who: mdPlain(who), url, use: mdPlain(use) })
  }
  if (out.length) return out
  // from the brief's own list: the note is the title (whole as the reading when it had to be cut), the summary what was
  // seen (the old page repeated the note as the reading, and the summary when there was no note)
  return arr(d.sophistication_shifts)
    .map(json)
    .filter((x) => x.note || x.summary)
    .map((x) => {
      const note = tidy(x.note)
      const sum = tidy(x.summary)
      return { title: clip(note || sum, 110), interp: note.length > 110 ? note : '', obs: note ? sum : '', who: tidy(x.competitor), url: str(x.url), use: '' }
    })
}

export type Dev = { cat: string; title: string; who: string; url: string; text: string; why: string }

/** "Notable developments": the items in "## 4.", by group (nwBrDevs). */
export function devsOf(md: string): Dev[] {
  const out: Dev[] = []
  let cat = ''
  for (const ln of mdSec(md, 4).split('\n')) {
    const t = ln.trim()
    if (!t) continue
    const h = /^###\s+(.*)$/.exec(t) || /^\*\*([^*[\]]+)\*\*\s*$/.exec(t)
    if (h) {
      cat = mdPlain(h[1])
      continue
    }
    if (!/^(\*\*|\[)/.test(t)) continue
    let title = ''
    let who = ''
    let url = ''
    let body = ''
    let m = /^(?:\*\*)?\[([^\]]+)\]\((https?:[^)\s]+)\)(?:\*\*)?\s*(?:[:‒-―-]\s*)?([\s\S]*)$/.exec(t)
    if (m) {
      who = m[1]
      url = m[2]
      body = m[3]
    } else {
      m = /^\*\*(.+?)\*\*\s*(?:[·•]\s*)?([\s\S]*)$/.exec(t)
      if (!m) continue
      title = m[1]
      const L = mdLink(m[2])
      if (L) {
        who = L.who
        url = L.url
      }
      body = m[2].replace(/^\s*\[[^\]]+\]\([^)]+\)\s*(?:[:‒-―-]\s*)?/, '')
    }
    const w = body.split(/[*_]Why it matters:?[*_]:?/i)
    out.push({ cat, title: mdPlain(title), who: mdPlain(who), url, text: mdPlain(w[0]), why: w[1] ? mdPlain(w[1]) : '' })
  }
  return out
}

/** The developments shown: at most `per` of each group, in group order. */
export function devsShown(devs: Dev[], per: number | 'all'): Dev[] {
  if (per === 'all') return devs
  const n: Record<string, number> = {}
  return devs.filter((d) => {
    n[d.cat] = (n[d.cat] ?? 0) + 1
    return n[d.cat] <= per
  })
}

export type EvRow = { rec: string; url: string; who: string; type: string; topic: string; eng: number | null; why: string; platform: string; postId: string }

const eng = (v: unknown) => (v === null || v === undefined || v === '' ? null : num(v))

/**
 * The evidence register (nwBrOrgEvidence): a brief built from the top posts by score lists all of them, best first;
 * older briefs list their high-value posts, else their 10 most engaged. The run's stored posts fill in what the brief
 * left out.
 */
export function orgEvidence(d: Record<string, unknown>, posts: IntelItem[]): EvRow[] {
  let L = (num(d.keep) ? arr(d.items) : arr(d.high_value_items)).map(json)
  if (!L.length)
    L = arr(d.items)
      .map(json)
      .sort((a, b) => (num(b.engagement_total) ?? 0) - (num(a.engagement_total) ?? 0))
      .slice(0, 10)
  const by: Record<string, IntelItem> = {}
  for (const p of posts) if (p.url) by[p.url] = p
  return L.filter((x) => Object.keys(x).length).map((x, i) => {
    const it = by[str(x.url)]
    return {
      rec: 'O' + (i + 1),
      url: str(x.url),
      who: tidy(x.competitor || x.author_name || it?.who || ''),
      type: tidy(x.format || it?.contentFormat || str(x.type).replace(/_/g, ' ')),
      topic: tidy(x.headline || it?.headline || words(x.summary, 14) || ''),
      eng: eng(x.engagement_total) ?? it?.eng ?? null,
      why: tidy(x.working || it?.working || x.signal || ''),
      platform: str(x.platform || it?.platform),
      postId: it?.id ?? '',
    }
  })
}

/** Topic watch: the brief's watched topics with posts, up to five each. */
export function topicWatch(d: Record<string, unknown>): { key: string; items: { who: string; url: string; text: string }[]; n: number }[] {
  const tw = json(d.topic_watch)
  return Object.keys(tw)
    .map((k) => {
      const list = arr(tw[k]).map(json)
      return {
        key: k.replace(/_/g, '-'),
        n: list.length,
        items: list.slice(0, 5).map((x) => ({ who: tidy(x.competitor) || 'Source', url: /^https?:\/\//i.test(str(x.url)) ? str(x.url) : '', text: clip(tidy(x.summary), 180) })),
      }
    })
    .filter((x) => x.n)
}

export type GlanceRow = { value: string; label: string; note: string }

/** Evidence at a glance (the organic brief's numbers). */
export function orgGlance(d: Record<string, unknown>): GlanceRow[] {
  const keep = num(d.keep)
  const read = num(d.read)
  const rows: (GlanceRow | null)[] = [
    num(d.n_items) !== null
      ? {
          value: String(num(d.n_items)),
          label: 'posts read',
          note: keep && read ? 'Up to ' + read + ' a run, the most engaged first' : 'Every new post from the accounts and topics you follow',
        }
      : null,
    keep ? { value: String(num(d.n_kept) ?? arr(d.items).length), label: 'in the brief', note: 'The top ' + keep + ' on-topic posts by score' } : null,
    num(d.n_high_value) !== null
      ? { value: String(num(d.n_high_value)), label: 'high value', note: keep ? 'Scored 70 or more' : 'Rated worth acting on, by the agent' }
      : null,
  ]
  const filtered = (num(d.n_irrelevant_filtered) ?? 0) + (num(d.n_low_engagement_filtered) ?? 0) + (num(d.n_out_of_focus) ?? 0)
  if (filtered)
    rows.push({
      value: String(filtered),
      label: 'filtered',
      note: num(d.n_out_of_focus) ? 'Off-topic, too little engagement or outside what you track' : 'Off-topic or too little engagement',
    })
  if (num(d.n_engagement_drafts) !== null) rows.push({ value: String(num(d.n_engagement_drafts)), label: 'replies drafted', note: 'Waiting in Replies until you approve' })
  return rows.filter((r): r is GlanceRow => !!r)
}

/** The five things of a brief: its snapshot, else its TL;DR (or hooks and a pain for ads), with a hidden "five" none. */
export function fiveItems(snapshot: unknown, fallback: SnapItem[], hidden: boolean): SnapItem[] {
  if (hidden) return []
  return (snapItems(snapshot) ?? fallback).filter((x) => x && x.text).slice(0, 5)
}

export const orgFive = (snapshot: unknown, md: string, hidden: boolean) => fiveItems(snapshot, orgFallback(md), hidden)

// ---------- the ads brief ----------

export type AdsBriefRow = {
  id: string
  run_id: string
  created_at: string
  winning_hooks: unknown
  winning_offers: unknown
  core_pain_points: unknown
  objection_themes: unknown
  cross_niche_sources: unknown
  copy_formula: unknown
  differentiation_angle: unknown
  sophistication_level: unknown
  confidence: unknown
  source_ad_ids: unknown
  source_intel_run: unknown
}

export type Offer = { type: string; price: string; notes: string }

/** What an ads brief holds, tidied (every list may be kept as JSON text). */
export function adsParts(b: AdsBriefRow) {
  const hooks = arr(b.winning_hooks)
    .map((h) => (typeof h === 'string' ? h : str(json(h).pattern || json(h).hook || json(h).text)))
    .map(tidy)
    .filter(Boolean)
  const offers: Offer[] = arr(b.winning_offers)
    .map((o): Record<string, unknown> => (typeof o === 'string' ? { type: o } : json(o)))
    .map((o) => ({ type: str(o.type), price: str(o.price_point), notes: str(o.notes) }))
    .filter((o) => o.type || o.notes)
  const list = (v: unknown) =>
    arr(v)
      .map((x) => tidy(typeof x === 'string' ? x : str(x)))
      .filter(Boolean)
  const cross = arr(b.cross_niche_sources)
    .map((x) => {
      if (typeof x === 'string') return tidy(x)
      // an object reads as its words, not as raw JSON
      const o = json(x)
      return tidy(Object.values(o).map(str).filter(Boolean).join(' · '))
    })
    .filter(Boolean)
  return {
    hooks,
    offers,
    pains: list(b.core_pain_points),
    objections: list(b.objection_themes),
    cross,
    formula: tidy(b.copy_formula).replace(/\s*->\s*/g, ' → '),
    angle: tidy(b.differentiation_angle),
  }
}

/** "**Evidence:** 9 proven + 4 emerging" in the ads brief's markdown. */
export function provenOf(md: string): { proven: number; emerging: number } | null {
  const m = /Evidence:\*\*\s*(\d+)\s*proven\s*\+\s*(\d+)\s*emerging/.exec(str(md))
  return m ? { proven: Number(m[1]), emerging: Number(m[2]) } : null
}

export type AdEvRow = { rec: string; adv: string; hook: string; cta: string; offer: string; status: string; days: number | null; score: number | null; ad: Ad | null; url: string }

/**
 * The ads behind an ads brief (nwBrAdEvidence): the ads it names by id, in its order; else the list in its markdown
 * (or the run's best 12), matched to the kept ads by link. Ads a saved review removed are left out.
 */
export function adEvidence(picked: Ad[], sources: Source[], pool: Ad[], removed: string[]): AdEvRow[] {
  const gone = new Set(removed)
  const rows: Omit<AdEvRow, 'rec'>[] = picked.length
    ? picked.map((a) => ({
        adv: a.adv,
        hook: tidy(a.title),
        cta: a.cta,
        offer: a.offer,
        status: a.up || a.sw ? 'Hand-picked by your team' : a.act ? 'Still running' : 'Stopped',
        days: a.lib ? a.days : null,
        score: a.lib ? a.score : null,
        ad: a,
        url: a.url,
      }))
    : sources.map((s) => {
        const a = (s.url && pool.find((x) => x.url === s.url)) || (s.recordId ? (pool.find((x) => x.id === s.recordId) ?? null) : null) || null
        return {
          adv: tidy(s.advertiser),
          hook: tidy(s.hook),
          cta: a?.cta ?? '',
          offer: a?.offer ?? '',
          status: s.meta ? metaText(s.meta, true) : s.active ? 'Still running' : '',
          days: s.days !== null ? s.days : (a?.days ?? null),
          score: a && a.lib ? a.score : null,
          ad: a,
          url: s.url,
        }
      })
  return rows.filter((r) => !(r.ad && (gone.has(r.ad.id) || gone.has(r.ad.url))) && !(r.url && gone.has(r.url))).map((r, i) => ({ ...r, rec: 'P' + (i + 1) }))
}

export type AdFive = { text: string; why: string; tag: string; ads: Ad[] | null; all: boolean }

/**
 * The ads brief's five things (nwAdFive): its snapshot's points (else four hooks and a pain), each with the ads closest
 * to it among the ads the brief names, else the run's candidates. A brief built from a few hand-picked ads came from all
 * of them.
 */
export function adFive(b: AdsBriefRow, snapshot: unknown, hidden: boolean, picked: Ad[], cands: Cand[] | null, pool: Ad[]): AdFive[] {
  const rows = picked.length ? picked.map(candOf) : cands
  return fiveItems(snapshot, adFallback(b), hidden).map((it) => {
    let ads: Ad[] | null = null
    if (rows) {
      const hits = rankAds(it, rows, hookUrlsFor(snapshot, it.text + ' ' + (it.why || '')))
      const seen = new Set<string>()
      ads = hits
        .map((h) => (h.id ? pool.find((a) => a.id === h.id) : (h.url && pool.find((a) => a.url === h.url)) || pool.find((a) => h.hook && a.adv.toLowerCase() === h.who.toLowerCase() && a.hook.trim() === h.hook.trim())) ?? null)
        .filter((a): a is Ad => !!a)
        .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    }
    const all = !!(ads && !ads.length && picked.length && picked.length <= 6)
    return { text: tidy(it.text), why: tidy(it.why), tag: it.tag, ads: all ? picked : ads, all }
  })
}

// ---------- Combined (nwBrComboHtml) ----------

/** The brief Combined uses: the newest approved one, else the newest. */
export function combinedPick<T extends { run_id: string }>(rows: T[], dec: DecRow[]): { row: T; ok: boolean } | null {
  const ok = rows.find((r) => stateOf(newestFor(dec, r.run_id)) === 'ok')
  if (ok) return { row: ok, ok: true }
  return rows[0] ? { row: rows[0], ok: false } : null
}

/** The angle in a few words: a quoted phrase in it, else its first sentence (nwBrQuote; apostrophes are not quotes). */
export function angleOf(t: unknown): string {
  const s0 = str(t)
  const m = /[“"]([^“”"]{12,90})[”"]/.exec(s0)
  if (m) return tidy(m[1])
  const s = tidy(s0)
  const i = s.search(/[.!?]\s/)
  return clip(i > 0 ? s.slice(0, i + 1) : s, 110)
}

/** What a call to action is called in the company profile (V104_ACTION); none is a call there too. */
export const ACTION: Readonly<Record<string, string>> = {
  call: 'Book a call',
  download: 'Download a resource',
  inquiry: 'Request a proposal',
  purchase: 'Buy a small offer',
}
export const actionLabel = (a: unknown) => ACTION[str(a) || 'call'] ?? tidy(a)

export type Persona = { name: string; role: string; firm: string }
export type OfferRow = { name: string; price: string; free: boolean; action: string }
export type Proof = { name: string; claim: string }

export type ComboCard = { k: string; label: string; value: string; source: string; add: '' | 'audiences' | 'proof' }

export function comboCards(x: {
  org: { createdAt: string; five: SnapItem[] } | null
  ads: { createdAt: string; angle: string; five: SnapItem[]; hooks: unknown } | null
  persona: Persona | null
  targetMarket: string
  offer: OfferRow | null
  proof: Proof | null
  day: (iso: string) => string
}): ComboCard[] {
  const angle = x.ads?.angle ? angleOf(x.ads.angle) : tidy(x.org?.five[0]?.text ?? '')
  const angleSrc = x.ads?.angle ? 'From the ads brief of ' + x.day(x.ads.createdAt) : x.org && angle ? 'From the organic brief of ' + x.day(x.org.createdAt) : ''
  const p = x.persona
  const audience = p
    ? p.role && p.firm
      ? p.role + ' at ' + p.firm
      : p.role || p.firm || p.name
    : clip(str(x.targetMarket).split(/[,;]/)[0].trim(), 110)
  const firstHook = arr(x.ads?.hooks)[0]
  const hook = x.ads?.five[0]?.text ? tidy(x.ads.five[0].text) : clip(typeof firstHook === 'string' ? firstHook : str(json(firstHook).pattern || json(firstHook).hook || json(firstHook).text), 110)
  const o = x.offer
  return [
    { k: 'angle', label: 'Angle', value: angle, source: angleSrc, add: '' },
    { k: 'audience', label: 'Audience', value: audience, source: p ? 'Your default buyer, from the company profile' : 'From the company profile', add: 'audiences' },
    { k: 'hook', label: 'Hook to test', value: tidy(hook), source: x.ads ? 'From the ads brief of ' + x.day(x.ads.createdAt) : '', add: '' },
    { k: 'offer', label: 'Offer', value: o ? o.name + (o.price ? ' · ' + o.price : o.free ? ' · free' : '') : '', source: 'Your default offer', add: 'audiences' },
    { k: 'proof', label: 'Proof', value: x.proof ? clip(x.proof.name + ': ' + x.proof.claim, 120) : '', source: 'Approved proof you may quote', add: 'proof' },
    { k: 'cta', label: 'Call to action', value: o ? actionLabel(o.action) : '', source: 'From your default offer', add: 'audiences' },
  ]
}

// ---------- the team's layout (ai_settings.brief_structure, v111St) ----------

export type Kind = 'org' | 'ads'

type SecDef = { k: string; lock?: 'always' | 'drafts'; opt?: readonly (readonly [string, readonly string[], string])[] }

/** Each kind's sections in their usual order, what cannot be switched off, and their options with the usual value. */
export const SECS: Readonly<Record<Kind, readonly SecDef[]>> = {
  org: [
    { k: 'rec', lock: 'always' },
    { k: 'five', opt: [['n', ['3', '4', '5'], '5'], ['why', ['full', 'short'], 'full']] },
    { k: 'short' },
    { k: 'shift', opt: [['n', ['3', '6', 'all'], '6']] },
    { k: 'dev', opt: [['n', ['1', '2', 'all'], '2']] },
    { k: 'themes', opt: [['tw', ['on', 'off'], 'on']] },
    { k: 'hand' },
    { k: 'ev', lock: 'always', opt: [['n', ['10', 'all'], '10']] },
    { k: 'review', lock: 'always' },
  ],
  ads: [
    { k: 'rec', lock: 'always' },
    { k: 'five', opt: [['n', ['3', '4', '5'], '5'], ['why', ['full', 'short'], 'full']] },
    { k: 'short' },
    { k: 'arch', lock: 'drafts', opt: [['n', ['3', '5', '8'], '8']] },
    { k: 'offer', opt: [['n', ['3', '6'], '6']] },
    { k: 'pain' },
    { k: 'cross' },
    { k: 'test' },
    { k: 'ev', lock: 'always' },
    { k: 'review', lock: 'always' },
  ],
}

/** Sections a team can add to its layout; their names are shown where they would go. */
export const ADDED: Readonly<Record<Kind, Readonly<Record<string, string>>>> = {
  org: { x_formats: 'Formats that work', x_accounts: 'Who is driving it', x_rising: 'Rising themes', x_reg: 'Regulation watch', x_questions: 'Questions buyers ask' },
  ads: { x_cta: 'Calls to action', x_formats: 'Ad formats', x_prices: 'Price points', x_landing: 'Where the ads send people', x_longest: 'Longest running' },
}

export type Layout = { order: string[]; off: string[]; opt: Record<string, Record<string, string>> }

/** The layout in force for a kind: the team's, else the usual one; the record and five things lead, the review closes. */
export function layoutOf(saved: unknown, kind: Kind): Layout {
  const S = json(json(saved)[kind])
  const known = SECS[kind].map((x) => x.k)
  const extra = Object.keys(ADDED[kind])
  let order = Array.isArray(S.order) ? S.order.map(str).filter((k, i, a) => (known.includes(k) || extra.includes(k)) && a.indexOf(k) === i) : known.slice()
  for (const k of known) if (!order.includes(k)) order.push(k)
  order = ['rec', 'five', ...order.filter((k) => k !== 'rec' && k !== 'five' && k !== 'review'), 'review']
  const off = (Array.isArray(S.off) ? S.off.map(str) : []).filter((k, i, a) => {
    const d = SECS[kind].find((x) => x.k === k)
    return (d ? !d.lock : extra.includes(k)) && order.includes(k) && a.indexOf(k) === i
  })
  const opt: Record<string, Record<string, string>> = {}
  const so = json(S.opt)
  for (const k of Object.keys(so)) if (so[k] && typeof so[k] === 'object') opt[k] = Object.fromEntries(Object.entries(json(so[k])).map(([a, b]) => [a, str(b)]))
  return { order, off, opt }
}

/** A section's option in force: the saved one when it is one of the choices, else the usual one (v111StOpt). */
export function optOf(st: Layout, kind: Kind, k: string, o: string): string {
  const d = SECS[kind].find((x) => x.k === k)?.opt?.find((x) => x[0] === o)
  if (!d) return ''
  const v = st.opt[k]?.[o]
  return v !== undefined && d[1].includes(v) ? v : d[2]
}

/** What each section is, as the Structure tab lists it (V111_SECS, V111_ADD): its title and what it shows. */
export const SEC_TEXT: Readonly<Record<Kind, Readonly<Record<string, readonly [string, string]>>>> = {
  org: {
    rec: ['Record and scope', 'When it was published, the period the run covers, the agent, who it is for and whether it is approved.'],
    five: ['Five things working', 'The strongest points, each with what the agent saw and the posts behind it.'],
    short: ['The short version', 'What changed in the conversation, in a few lines.'],
    shift: ['What changed', 'Shifts in how the market talks, each with its evidence and how you could use it.'],
    dev: ['Notable developments', 'Thought leadership, product news and offers worth a closer look.'],
    themes: ['Themes and topic watch', 'Posts per theme, and the topics you watch, such as security and governance.'],
    hand: ['Content handoff', 'How the signals feed posts, newsletters and emails, and what stays yours.'],
    ev: ['Post evidence', 'The posts behind the brief, with engagement and why each one matters.'],
    review: ['Review', 'Three checks, then approve. Approved briefs shape every draft.'],
    x_formats: ['Formats that work', 'Which kinds of post drew the most engagement, counted from the posts in the brief.'],
    x_accounts: ['Who is driving it', 'The accounts behind the most posts and engagement in the brief.'],
    x_rising: ['Rising themes', 'Themes with more posts than in the brief before, and themes that went quiet.'],
    x_reg: ['Regulation watch', 'Posts about rules, regulators and compliance deadlines.'],
    x_questions: ['Questions buyers ask', 'Questions that come up in the posts, word for word.'],
  },
  ads: {
    rec: ['Record and scope', 'When it was published, the ads it read, the agent and whether it is approved.'],
    five: ['Five things working', 'The strongest hooks and offers, each with the ads behind it.'],
    short: ['One-minute read', 'The angle that sets you apart from what everyone else is running.'],
    arch: ['Creative structure', 'One body with several openings to test, built on the copy formula the winners share.'],
    offer: ['Offer ideas', 'Offer shapes that keep running, with price points as observed.'],
    pain: ['Buyer pains and objections', 'What the ads and the organic brief say buyers worry about.'],
    cross: ['Borrowed from other markets', 'Patterns from outside your market that travel.'],
    test: ['Test plan', 'What stays fixed, what changes and how each version is judged.'],
    ev: ['Ad evidence', 'Every ad behind the patterns, with how long it ran.'],
    review: ['Review', 'Three checks, then approve. Approved briefs shape every ad.'],
    x_cta: ['Calls to action', 'The buttons the ads behind the brief use most.'],
    x_formats: ['Ad formats', 'Image, text, carousel or video, counted from the ads behind the brief.'],
    x_prices: ['Price points', 'Prices the ads show, and which offers look self-liquidating.'],
    x_landing: ['Where the ads send people', 'The pages behind the ads: booking, webinar, download, quiz or checkout.'],
    x_longest: ['Longest running', 'The ads that have run the longest, a sign the advertiser keeps paying for them.'],
  },
}

/** An option's label on a section, and a choice's words (V111_SECS). */
export function optLabel(k: string, o: string): string {
  if (o === 'why') return 'Detail'
  if (o === 'tw') return 'Topic watch'
  return k === 'dev' ? 'Per group' : k === 'ev' ? 'Show' : k === 'arch' ? 'Hooks' : 'How many'
}
export const choiceLabel = (v: string) =>
  ({ all: 'All', full: 'With what it saw', short: 'Points only', on: 'Shown', off: 'Hidden' })[v] ?? v

/** The usual layout of a kind: every section in its usual order, none off, no options. */
export const standardLayout = (kind: Kind): Layout => ({ order: SECS[kind].map((x) => x.k), off: [], opt: {} })

/** Whether a section can be switched off, and why not when it cannot. */
export function lockOf(kind: Kind, k: string): { short: string; long: string } | null {
  const d = SECS[kind].find((x) => x.k === k)
  if (d?.lock === 'always') return { short: 'Always in the brief', long: 'Every brief has it.' }
  if (d?.lock === 'drafts') return { short: 'Needed for drafts', long: 'Every ad is built on it, so it stays.' }
  return null
}

/** Why a section has no move buttons: the record opens, the five things lead and the review closes every brief. */
export const FIXED: Readonly<Record<string, string>> = {
  rec: 'The record opens every brief.',
  five: 'The five things lead every brief.',
  review: 'Review closes every brief.',
}

/**
 * A layout as it is saved (v111StSave): only known sections, rec and five first and review last, locked sections
 * never off, and only the options a section has, with one of their choices.
 */
export function cleanLayout(kind: Kind, input: unknown): Layout {
  const L = layoutOf({ [kind]: input }, kind)
  const raw = json(json(input).opt)
  const opt: Record<string, Record<string, string>> = {}
  for (const d of SECS[kind]) {
    for (const [o, choices] of d.opt ?? []) {
      const v = str(json(raw[d.k])[o])
      if (choices.includes(v)) (opt[d.k] ??= {})[o] = v
    }
  }
  return { order: L.order, off: L.off, opt }
}

/** "Five things working" as the layout counts them (V111_NUM). */
export const fiveHeading = (n: number) => ['No things', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things'][Math.max(0, Math.min(5, n))] + ' working'

// ---------- the page's fixed words ----------

export const RAIL: Readonly<Record<Kind, Readonly<Record<string, string>>>> = {
  org: { five: 'Five things', short: 'The short version', shift: 'What changed', dev: 'Notable developments', themes: 'Themes', hand: 'Content handoff', ev: 'Post evidence', review: 'Review' },
  ads: { five: 'Five things', short: 'The short version', arch: 'Creative structure', offer: 'Offer ideas', pain: 'Buyer objections', cross: 'Other markets', test: 'Test plan', ev: 'Ad evidence', review: 'Review' },
}

export const CHECKS: Readonly<Record<Kind, readonly (readonly [string, string])[]>> = {
  org: [
    ['Trace sources', 'Open the original posts and check any number before you quote it.'],
    ['Approve the reading', 'Check the themes match your market and that inferences are marked as such.'],
    ['Review the output', 'Confirm voice, offer and claims in the finished draft.'],
  ],
  ads: [
    ['Refresh the evidence', 'Run a new ad scan if this brief is old, or the market or offer changed.'],
    ['Approve every hook', 'Mark which openings fit you, check proof and claims, and review regulated wording.'],
    ['Review the ads and results', 'Approve the final copy, then feed measured results back into the next brief.'],
  ],
}

export const HELPER: Readonly<Record<Kind, string>> = {
  org: 'A person reviews this before its signals shape content. Approved briefs are picked first.',
  ads: 'Run times and inferred scores keep their labels in every draft.',
}

export const TEST_PLAN: readonly (readonly [string, string])[] = [
  ['Keep the same', 'One audience, one body, one real offer and one landing page.'],
  ['Change', 'Rotate the approved openings. Record each version on its own.'],
  ['Measure', 'Use your own clicks, leads and booked calls. Never judge success by a competitor’s run time.'],
  ['Decide', 'Keep, rework or stop each version after a set window, with a reviewer’s sign-off.'],
]

/** The ads brief's age in whole days. */
export const ageDays = (iso: string, now: number) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : 0
}
