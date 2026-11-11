import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type SnapItem, adFallback, clip, snapItems, tidy, tldr } from '@/lib/touchpoint/approvals'
import { type Ad, type Cand, type Source, adOf, adSources, hookSource, idsOf, runDateOf } from './ads'
import {
  type AdEvRow, type AdFive, type AdsBriefRow, type BState, type DecRow, type Dev, type EvRow, type GlanceRow, type Kind, type Layout, type OfferRow,
  type Persona, type Proof, type Review, type Shift, type Tab, adEvidence, adFive, adsParts, combinedPick, devsOf, fiveItems, layoutOf, newestFor, newestPerRun,
  orgEvidence, orgFive, orgGlance, provenOf, reviewOf, shiftsOf, stateOf, topicWatch,
} from './briefs'
import { type Five, type ThemeCount, briefThemes, competitorOf, json, num, rankPosts, windowIso } from './intel'
import { type PostView, type ReplyView, postsOf, repliesOf } from './intel-load'

// The Market Intelligence Briefs page's data, read as the signed-in teammate on every visit (apCfLoad, e9SnapLoad,
// nwIntelLoad, nwAdsLoad, apAdMdLoad and v104Load as the page used them): the briefs and who decided what, and for the
// tab on screen its brief in full: the organic brief with the run's posts, the ads brief with the ads behind it, or
// Combined from both and the company profile. Personas, offers and proof are read here, never through the old loader,
// which rewrote house rules as it read.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type Version = { runId: string; createdAt: string; custom: boolean; edited: boolean; at: string }

export type Record_ = {
  kind: Kind
  runId: string
  createdAt: string
  state: BState
  decision: DecRow | null
  review: Review | null
  versions: Version[]
}

export type OrgTab = Record_ & {
  d: Record<string, unknown>
  window: { a: string; z: string | null } | null
  industry: string
  custom: boolean
  five: Five[]
  short: { title: string; text: string }[]
  shifts: Shift[]
  devs: Dev[]
  themes: ThemeCount[]
  watch: { key: string; items: { who: string; url: string; text: string }[]; n: number }[]
  evidence: EvRow[]
  glance: GlanceRow[]
  posts: PostView[]
  replies: ReplyView[]
  postsError: string | null
  runAt: string
  /** the run's read and keep counts (else the usual 50 and 10), for How posts are picked */
  limits: { read: number; keep: number }
}

export type AdsTab = Record_ & {
  parts: ReturnType<typeof adsParts>
  five: AdFive[]
  evidence: AdEvRow[]
  /** hook i's sources: the ads the snapshot names for it, who ran them, its note */
  hookSrc: ({ ads: Ad[]; who: string[]; note: string } | null)[]
  proven: { proven: number; emerging: number } | null
  intelRun: { runId: string; createdAt: string } | null
  confidence: number | null
  level: string
  custom: boolean
  /** ads briefs on file */
  onFile: number
  adsError: string | null
}

export type Creative = { id: string; title: string; format: string; from: string; createdAt: string; state: BState; decision: DecRow | null; outputId: string; brief: Row }

export type ComboTab = {
  /** what the six cards are made from (the page words them, with its dates) */
  input: {
    org: { createdAt: string; five: SnapItem[] } | null
    ads: { createdAt: string; angle: string; five: SnapItem[]; hooks: unknown } | null
    persona: Persona | null
    targetMarket: string
    offer: OfferRow | null
    proof: Proof | null
  }
  org: { runId: string; createdAt: string; ok: boolean } | null
  ads: { runId: string; createdAt: string; ok: boolean } | null
  creatives: Creative[]
  profileError: string | null
}

export type BriefsData = {
  tab: Tab
  /** the run on screen ('' for Combined, or no brief) */
  run: string
  /** the run a bare address opens on this tab: the address names a run only when it is another one */
  latest: string
  waiting: number
  anyBrief: boolean
  dots: Record<Tab, boolean>
  org: OrgTab | null
  ads: AdsTab | null
  combo: ComboTab | null
  layout: Record<Kind, Layout>
  profile: { id: number | null; industry: string; targetMarket: string }
  error: string | null
  now: number
}

const DEC_FIELDS = 'target_id,action,feedback,author,created_at'

type OrgRow = { id: string; run_id: string; created_at: string; content_md: string; data: unknown }
const orgRow = (r: Row): OrgRow => ({ id: str(r.id), run_id: str(r.run_id), created_at: str(r.created_at), content_md: str(r.content_md), data: r.data })

export async function loadBriefs(tab: Tab, asked: string | null, now = Date.now()): Promise<BriefsData> {
  const supabase = await createClient()
  const [ib, ab, dc, cr, st, pr] = await Promise.all([
    supabase
      .from('agent_outputs')
      .select('id,run_id,created_at,content_md,data')
      .eq('agent', 'intel_tracker')
      .eq('output_type', 'intel_brief')
      .order('created_at', { ascending: false })
      .limit(14),
    supabase.from('creative_briefs').select('*').order('created_at', { ascending: false }).limit(12),
    supabase.from('agent_feedback').select(DEC_FIELDS).eq('target_type', 'brief_approval').order('created_at', { ascending: false }).limit(300),
    supabase
      .from('content_requests')
      .select('id,created_at,title,format,status,output_id,brief')
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('ai_settings').select('key,value').eq('key', 'brief_structure'),
    supabase.from('company_profile').select('id,industry,target_market').limit(1),
  ])
  const errors = [ib.error, ab.error, dc.error].filter(Boolean).map((e) => e!.message)
  const dec: DecRow[] = rowsOf(dc).map((r) => ({
    target_id: str(r.target_id),
    action: str(r.action),
    feedback: str(r.feedback),
    author: str(r.author),
    created_at: str(r.created_at),
  }))
  let orgs = newestPerRun(rowsOf(ib).map(orgRow))
  let adsList = newestPerRun(rowsOf(ab).map((r) => ({ ...r, run_id: str(r.run_id), created_at: str(r.created_at) }))) as unknown as (AdsBriefRow & Row)[]

  // a run asked for outside the newest briefs is read on its own (the old page fell back to the newest)
  const wanted = asked && /^[\w.:-]{1,120}$/.test(asked) ? asked : null
  if (wanted && tab === 'organic' && !orgs.some((o) => o.run_id === wanted)) {
    const one = await supabase
      .from('agent_outputs')
      .select('id,run_id,created_at,content_md,data')
      .eq('agent', 'intel_tracker')
      .eq('output_type', 'intel_brief')
      .eq('run_id', wanted)
      .order('created_at', { ascending: false })
      .limit(1)
    orgs = newestPerRun([...orgs, ...rowsOf(one).map(orgRow)])
  }
  if (wanted && tab === 'ads' && !adsList.some((b) => b.run_id === wanted)) {
    const one = await supabase.from('creative_briefs').select('*').eq('run_id', wanted).order('created_at', { ascending: false }).limit(1)
    adsList = newestPerRun([...adsList, ...(rowsOf(one) as unknown as (AdsBriefRow & Row)[])]) as (AdsBriefRow & Row)[]
  }

  // the creative briefs from content requests: done, with a brief
  const creatives = rowsOf(cr)
    .filter((r) => Object.keys(json(r.brief)).length)
    .slice(0, 12)
  const creativeOf = (r: Row): Creative => {
    const b = json(r.brief)
    const id = 'content:' + str(r.id)
    const decision = newestFor(dec, id)
    return {
      id,
      title: str(b.title || r.title) || 'Creative brief',
      format: str(r.format),
      from: str(r.title),
      createdAt: str(r.created_at),
      state: stateOf(decision),
      decision,
      outputId: str(r.output_id),
      brief: b,
    }
  }

  const pending = (id: string | undefined) => !!id && stateOf(newestFor(dec, id)) === 'pending'
  const newestCreative = creatives[0] ? 'content:' + str(creatives[0].id) : undefined
  const waiting = [pending(orgs[0]?.run_id), pending(adsList[0]?.run_id), pending(newestCreative)].filter(Boolean).length
  const saved = rowsOf(st)[0]?.value
  const layout = { org: layoutOf(saved, 'org'), ads: layoutOf(saved, 'ads') }
  const p0 = rowsOf(pr)[0]
  const profile = { id: p0 && Number.isFinite(Number(p0.id)) ? Number(p0.id) : null, industry: str(p0?.industry).trim(), targetMarket: str(p0?.target_market).trim() }

  const base: BriefsData = {
    tab,
    run: '',
    latest: '',
    waiting,
    anyBrief: !!(orgs.length || adsList.length),
    dots: { organic: pending(orgs[0]?.run_id), ads: pending(adsList[0]?.run_id), combined: pending(newestCreative) },
    org: null,
    ads: null,
    combo: null,
    layout,
    profile,
    error: errors.length ? errors.join('; ') : null,
    now,
  }

  const snapshotOf = async (runs: string[]): Promise<Record<string, unknown>> => {
    if (!runs.length) return {}
    const sn = await supabase.from('agent_outputs').select('run_id,snapshot').not('snapshot', 'is', null).in('run_id', runs).order('created_at', { ascending: false }).limit(40)
    const out: Record<string, unknown> = {}
    for (const r of rowsOf(sn)) if (!(str(r.run_id) in out) && snapItems(r.snapshot)) out[str(r.run_id)] = r.snapshot
    return out
  }

  if (tab === 'organic') {
    const o = (wanted && orgs.find((x) => x.run_id === wanted)) || orgs[0]
    base.latest = orgs[0]?.run_id ?? ''
    if (!o) return base
    base.run = o.run_id
    const d = json(o.data)
    const review = reviewOf(d)
    const [snaps, it, dr, co, rn] = await Promise.all([
      snapshotOf([o.run_id]),
      supabase.from('intel_items').select('*').eq('run_id', o.run_id).order('engagement_score', { ascending: false, nullsFirst: false }).limit(400),
      supabase.from('engagement_drafts').select('*').eq('run_id', o.run_id).order('created_at', { ascending: false }).limit(300),
      supabase.from('competitors').select('id,name').limit(500),
      supabase.from('runs').select('finished_at,started_at,run_date').eq('agent', 'intel_tracker').eq('run_id', o.run_id).limit(1),
    ])
    const compName: Record<string, string> = {}
    for (const c of rowsOf(co).map(competitorOf)) compName[c.id] = c.name
    const removed = new Set(review?.removed ?? [])
    const posts = postsOf(rowsOf(it), compName, o)
    const kept = posts.filter((p) => !removed.has(p.url))
    const items = orgFive(snaps[o.run_id], str(o.content_md), !!review?.hidden.includes('five'))
    const r0 = rowsOf(rn)[0]
    const decision = newestFor(dec, o.run_id)
    base.org = {
      kind: 'org',
      runId: o.run_id,
      createdAt: o.created_at,
      state: stateOf(decision),
      decision,
      review,
      versions: orgs.map((x) => {
        const xd = json(x.data)
        return { runId: x.run_id, createdAt: x.created_at, custom: /custom/i.test(str(xd.run_source || xd.run_type)), edited: !!reviewOf(xd)?.by, at: x.created_at }
      }),
      d,
      window: windowIso(d.window_start) ? { a: windowIso(d.window_start)!, z: windowIso(d.window_end) } : null,
      industry: str(d.industry).trim() || profile.industry,
      custom: /custom/i.test(str(d.run_source || d.run_type)),
      five: items.map((x) => ({ text: x.text, why: x.why, tag: x.tag, ids: rankPosts(x, kept) })),
      short: tldrOf(str(o.content_md)),
      shifts: shiftsOf(str(o.content_md), d),
      devs: devsOf(str(o.content_md)),
      themes: briefThemes(d.top_themes).slice(0, 8),
      watch: topicWatch(d),
      evidence: orgEvidence(d, posts),
      glance: orgGlance(d),
      posts,
      replies: repliesOf(rowsOf(dr)),
      postsError: it.error?.message ?? null,
      runAt: r0 ? str(r0.finished_at || r0.started_at || r0.run_date) : o.created_at,
      limits: { read: num(d.read) || 50, keep: num(d.keep) || 10 },
    }
    return base
  }

  if (tab === 'ads') {
    const b = (wanted && adsList.find((x) => x.run_id === wanted)) || adsList[0]
    base.latest = adsList[0]?.run_id ?? ''
    if (!b) return base
    base.run = b.run_id
    const ids = idsOf(b.source_ad_ids).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60)
    const [snaps, md, picked, rev, rn] = await Promise.all([
      snapshotOf([b.run_id]),
      supabase
        .from('agent_outputs')
        .select('run_id,content_md,created_at')
        .eq('agent', 'ad_strategist')
        .eq('output_type', 'creative_brief')
        .eq('run_id', b.run_id)
        .order('created_at', { ascending: false })
        .limit(5),
      ids.length ? supabase.from('winner_creatives').select('*').in('id', ids).limit(60) : Promise.resolve({ data: [] as Row[], error: null }),
      supabase.from('agent_outputs').select('run_id,data,created_at').eq('agent', 'ad_strategist').eq('run_id', b.run_id).order('created_at', { ascending: false }).limit(5),
      supabase.from('runs').select('run_id,finished_at,started_at,run_date').eq('agent', 'ad_strategist').order('started_at', { ascending: false, nullsFirst: false }).limit(40),
    ])
    const mdText = str(rowsOf(md).find((r) => /##\s*8\./.test(str(r.content_md)))?.content_md ?? rowsOf(md)[0]?.content_md)
    const review = rowsOf(rev).map((r) => reviewOf(json(r.data))).find(Boolean) ?? null
    const pickedRows = rowsOf(picked)
    const pickedAds = ids.map((id) => pickedRows.find((r) => str(r.id) === id)).filter((r): r is Row => !!r).map((r) => adOf(r, now))

    // without ads named by id: the list in its markdown (or the run's best), matched to the kept ads by link
    let sources: Source[] = []
    let pool: Ad[] = pickedAds
    let cands: Cand[] | null = null
    let adsError: string | null = picked.error?.message ?? null
    if (!pickedAds.length) {
      const listed = adSources(mdText, [], b.run_id).map((s) => s.url).filter(Boolean)
      const [recs, byRun] = await Promise.all([
        listed.length
          ? supabase.from('ad_records').select('id,advertiser_name,hook,cta,offer_inferred,ad_library_url,destination_url,days_running,is_active,run_id,uploaded_by,performance_score').in('ad_library_url', listed).limit(200)
          : Promise.resolve({ data: [] as Row[], error: null }),
        supabase
          .from('ad_records')
          .select('id,advertiser_name,hook,cta,offer_inferred,ad_library_url,destination_url,days_running,is_active,run_id,uploaded_by,performance_score')
          .eq('run_id', b.run_id)
          .order('performance_score', { ascending: false, nullsFirst: false })
          .limit(60),
      ])
      const records = [...rowsOf(recs), ...rowsOf(byRun)]
      sources = adSources(mdText, records, b.run_id)
      const urls = sources.map((s) => s.url).filter((u) => /^https?:/.test(u))
      const wc = urls.length
        ? await supabase.from('winner_creatives').select('*').in('ad_library_url', urls).limit(200)
        : await supabase.from('winner_creatives').select('*').eq('run_id', b.run_id).order('performance_score', { ascending: false, nullsFirst: false }).limit(60)
      adsError = adsError || recs.error?.message || wc.error?.message || null
      pool = rowsOf(wc).map((r) => adOf(r, now))
      const byUrl: Record<string, Row> = {}
      for (const r of records) if (r.ad_library_url) byUrl[str(r.ad_library_url)] = r
      // the ads the five things are matched against (v96AdCands): the listed ads with their records, else the run's own
      cands = sources.length
        ? sources.map((s) => {
            const m = (s.url && byUrl[s.url]) || records.find((r) => str(r.id) === s.recordId) || {}
            const c = { url: s.url || str(m.ad_library_url), who: (s.advertiser || str(m.advertiser_name)).trim(), hook: s.hook || str(m.hook), offer: str(m.offer_inferred), days: s.days ?? num(m.days_running), id: '' }
            return { ...c, text: [c.hook, '', str(m.cta), c.offer, ''].join(' ') }
          })
        : pool.map((a) => ({ url: /^https?:/.test(a.url) ? a.url : '', who: a.adv, hook: a.hook, offer: a.offer, days: a.days, id: '', text: [a.hook, a.body, a.cta, a.offer, a.copyFormula, a.patterns.join(' ')].join(' ') }))
    }

    const parts = adsParts(b)
    const snap = snaps[b.run_id]
    const hookSrc = parts.hooks.slice(0, 8).map((h) => {
      const hs = hookSource(snap, h)
      if (!hs) return null
      const ads = hs.ads.map((u) => pool.find((a) => a.url === u || a.id === u) ?? null).filter((a): a is Ad => !!a)
      const who = (hs.who.length ? hs.who : ads.map((a) => a.adv)).filter((x, i, all) => x && all.indexOf(x) === i)
      return { ads, who, note: hs.note }
    })
    const runAt: Record<string, string> = {}
    for (const r of rowsOf(rn)) if (!runAt[str(r.run_id)]) runAt[str(r.run_id)] = str(r.finished_at || r.started_at || r.run_date)
    const io = orgs.find((x) => x.run_id === str(b.source_intel_run))
    const decision = newestFor(dec, b.run_id)
    base.ads = {
      kind: 'ads',
      runId: b.run_id,
      createdAt: b.created_at,
      state: stateOf(decision),
      decision,
      review,
      versions: adsList.map((x) => ({
        runId: x.run_id,
        createdAt: x.created_at,
        custom: /custom/.test(x.run_id),
        edited: false,
        at: runAt[x.run_id] || x.created_at || runDateOf(x.run_id) || '',
      })),
      parts,
      five: adFive(b, snap, !!review?.hidden.includes('five'), pickedAds, cands, pool),
      evidence: adEvidence(pickedAds, sources, pool, review?.removed ?? []),
      hookSrc,
      proven: provenOf(mdText),
      intelRun: io ? { runId: io.run_id, createdAt: io.created_at } : null,
      confidence: num(b.confidence),
      level: str(b.sophistication_level),
      custom: /custom/.test(b.run_id),
      onFile: adsList.length,
      adsError,
    }
    return base
  }

  // Combined: the newest approved brief of each kind, else the newest, with the company profile
  const op = combinedPick(orgs, dec)
  const ap = combinedPick(adsList, dec)
  const [snaps, pe, of, pf] = await Promise.all([
    snapshotOf([op?.row.run_id, ap?.row.run_id].filter((x): x is string => !!x)),
    supabase.from('client_personas').select('name,role,firm,is_default,archived,created_at').order('created_at', { ascending: true }).limit(100),
    supabase.from('offers').select('name,price,price_label,action,is_default,archived,created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('client_proof').select('name,claim,source,status,expires_on,archived,created_at').order('created_at', { ascending: true }).limit(200),
  ])
  const live = (rows: Row[]) => rows.filter((r) => !r.archived)
  const personas = live(rowsOf(pe))
  const offers = live(rowsOf(of))
  const today = new Date(now).toISOString().slice(0, 10)
  const proofs = live(rowsOf(pf)).filter((p) => p.status === 'approved' && str(p.source).trim() && (!p.expires_on || str(p.expires_on) >= today))
  const pr0 = personas.find((p) => p.is_default) ?? personas[0]
  const of0 = offers.find((o) => o.is_default) ?? offers[0]
  const proof0 = proofs[0]
  const persona: Persona | null = pr0 ? { name: str(pr0.name), role: str(pr0.role).trim(), firm: str(pr0.firm).trim() } : null
  const offer: OfferRow | null = of0
    ? { name: str(of0.name), price: str(of0.price_label).trim(), free: of0.price !== null && of0.price !== '' && Number(of0.price) === 0, action: str(of0.action) }
    : null
  const proof: Proof | null = proof0 ? { name: str(proof0.name), claim: str(proof0.claim) } : null
  const oRow = op?.row
  const aRow = ap?.row as (AdsBriefRow & Row) | undefined
  base.combo = {
    input: {
      org: oRow ? { createdAt: oRow.created_at, five: orgFive(snaps[oRow.run_id], str(oRow.content_md), !!reviewOf(json(oRow.data))?.hidden.includes('five')) } : null,
      ads: aRow
        ? { createdAt: aRow.created_at, angle: str(aRow.differentiation_angle), five: fiveItems(snaps[aRow.run_id], adFallback(aRow), false), hooks: aRow.winning_hooks }
        : null,
      persona,
      targetMarket: profile.targetMarket,
      offer,
      proof,
    },
    org: oRow ? { runId: oRow.run_id, createdAt: oRow.created_at, ok: !!op?.ok } : null,
    ads: aRow ? { runId: aRow.run_id, createdAt: aRow.created_at, ok: !!ap?.ok } : null,
    creatives: creatives.map(creativeOf),
    profileError: pe.error?.message || of.error?.message || pf.error?.message || null,
  }
  return base
}

/** The organic brief's TL;DR: each line's title tidied, its text cut to 380 characters (the short version). */
function tldrOf(md: string): { title: string; text: string }[] {
  return tldr(md).map((x) => ({ title: tidy(x.title), text: clip(x.text, 380) }))
}
