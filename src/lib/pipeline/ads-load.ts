import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type SnapItem, adFallback, snapItems } from '@/lib/touchpoint/approvals'
import {
  type AdRun, type AdSchedule, type AdView, type CapIndex, type CopySet, type FitCrit, type IndMaps, type AdsFollow, adRuns, adScheduleOf,
  adsFollowOf, capIndex, copySetOf, fitCrit, indMapsOf, industryOf, poolOf,
} from './ad-strategist'
import { type Ad, adOf, idsOf } from './ads'
import { type AdFive, type AdsBriefRow, adFive, fiveItems, newestPerRun } from './briefs'
import { adsFallback } from './briefs-load'
import { type Competitor, type Pending, competitorOf, num, pendingOf } from './intel'

// The Ad Strategist page's data, read as the signed-in teammate on every visit (nwAdsLoad, v99AdLoad, apCfLoad,
// e9SnapLoad, v96FollowLoad, apCopySets and v96AdCands as the page used them): the ads it keeps, which brief each went
// into, the ads briefs and the runs, who and what it follows, the industries, the copy written from uploads, and for the
// Takeaways tab the five things of the brief on screen with the ads behind each.

type Row = Record<string, unknown>
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type LibCard = {
  runId: string
  at: string
  ok: boolean
  running: boolean
  custom: boolean
  rule: string
  newAds: number
  behind: number | null
  advertisers: number | null
  confidence: number | null
  lead: string
  hasBrief: boolean
}

export type TakeBrief = { runId: string; createdAt: string; angle: string; five: AdFive[] }

export type AdsData = {
  pool: AdView[]
  /** the ad the address asked for when it is older than the ads read (opened from another page) */
  extra: AdView | null
  poolError: string | null
  cap: CapIndex
  runs: AdRun[]
  runsError: string | null
  briefs: { runId: string; createdAt: string }[]
  library: LibCard[]
  take: TakeBrief | null
  findings: Record<string, { date: string; text: string }[]>
  schedule: AdSchedule
  pending: Pending | null
  follows: Competitor[]
  followsError: string | null
  adsFollow: AdsFollow
  ind: IndMaps
  fit: FitCrit
  copySets: CopySet[]
  me: string
  now: number
}

const COMP_COLS = 'id,name,handle_linkedin,handle_x,meta_page_id,website,status,follow_kind,follow_for,added_by,created_at,notes'

export async function loadAds(askedBrief: string | null, me: string, askedAd: string | null = null, now = Date.now()): Promise<AdsData> {
  const supabase = await createClient()
  const [wc, md, cb, rn, st, co, pr, cs] = await Promise.all([
    supabase.from('winner_creatives').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase
      .from('agent_outputs')
      .select('id,run_id,created_at,data,content_md')
      .eq('agent', 'ad_strategist')
      .eq('output_type', 'creative_brief')
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.from('creative_briefs').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.from('runs').select('run_id,agent,run_date,started_at,finished_at,status,stats').eq('agent', 'ad_strategist').order('started_at', { ascending: false, nullsFirst: false }).limit(40),
    supabase.from('ai_settings').select('key,value').in('key', ['agent_runs', 'ads_follow', 'ad_industries', 'ad_industries_ai', 'ad_runs']),
    supabase.from('competitors').select(COMP_COLS).order('created_at', { ascending: true }).limit(500),
    supabase.from('company_profile').select('industry,target_market').limit(1),
    supabase.from('agent_outputs').select('id,title,created_at,data').eq('agent', 'ad_copywriter').order('created_at', { ascending: false }).limit(100),
  ])
  const set: Record<string, unknown> = {}
  for (const r of rowsOf(st)) set[str(r.key)] = r.value
  const ind = indMapsOf(set.ad_industries, set.ad_industries_ai)
  const raw = rowsOf(wc)
  const pool = poolOf(raw, now, (adv) => industryOf(ind, adv))
  // an ad another page links to (the briefs, Approvals) that is older than the 1,000 newest
  let extra: AdView | null = null
  if (askedAd && !raw.some((r) => str(r.id) === askedAd)) {
    const one = await supabase.from('winner_creatives').select('*').eq('id', askedAd).limit(1)
    const r = rowsOf(one)[0]
    if (r) extra = poolOf([...raw, r], now, (adv) => industryOf(ind, adv)).find((a) => a.id === askedAd) ?? null
  }
  const cap = capIndex(rowsOf(md), rowsOf(cb))

  // the ads briefs, one per run, newest first; the twelve newest are the page's
  const allBriefs = newestPerRun(rowsOf(cb).map((r) => ({ ...r, run_id: str(r.run_id), created_at: str(r.created_at) }))) as unknown as (AdsBriefRow & Row)[]
  const briefs = allBriefs.slice(0, 12)
  const runs = adRuns(rowsOf(rn), briefs)

  // the five things of the newest briefs need their snapshots
  const snapRuns = briefs.map((b) => b.run_id)
  const sn = snapRuns.length
    ? await supabase.from('agent_outputs').select('run_id,snapshot').not('snapshot', 'is', null).in('run_id', snapRuns).order('created_at', { ascending: false }).limit(60)
    : { data: [] as Row[], error: null }
  const snaps: Record<string, unknown> = {}
  for (const r of rowsOf(sn)) if (!(str(r.run_id) in snaps) && snapItems(r.snapshot)) snaps[str(r.run_id)] = r.snapshot
  const briefAd = (r: Row): Ad => adOf(r, now)
  const rawById = new Map(raw.map((r) => [str(r.id), r]))
  const pickedOf = (b: AdsBriefRow) =>
    idsOf(b.source_ad_ids)
      .map((id) => rawById.get(id))
      .filter((r): r is Row => !!r)
      .map(briefAd)
  const lead = (b: AdsBriefRow): string => {
    const it: SnapItem | undefined = fiveItems(snaps[b.run_id], adFallback(b), false)[0]
    return it ? it.text : ''
  }

  // what each ad backs in the six newest briefs that named it (v113AdFindings)
  const findings: Record<string, { date: string; text: string }[]> = {}
  for (const b of briefs.slice(0, 6)) {
    const picked = pickedOf(b)
    if (!picked.length) continue
    for (const f of adFive(b, snaps[b.run_id], false, picked, null, picked))
      for (const a of f.ads ?? []) {
        const L = (findings[a.id] = findings[a.id] ?? [])
        if (!L.some((x) => x.text === f.text)) L.push({ date: b.created_at, text: f.text })
      }
  }

  // the Takeaways brief: the one asked for, else the newest
  const tb = (askedBrief && briefs.find((b) => b.run_id === askedBrief)) || briefs[0]
  let take: TakeBrief | null = null
  if (tb) {
    const picked = pickedOf(tb)
    let five: AdFive[]
    if (picked.length) five = adFive(tb, snaps[tb.run_id], false, picked, null, picked)
    else {
      const mdText = str(rowsOf(md).find((r) => str(r.run_id) === tb.run_id && /##\s*8\./.test(str(r.content_md)))?.content_md ?? rowsOf(md).find((r) => str(r.run_id) === tb.run_id)?.content_md)
      const fb = await adsFallback(supabase, mdText, tb.run_id, now)
      five = adFive(tb, snaps[tb.run_id], false, [], fb.cands, fb.pool)
    }
    take = { runId: tb.run_id, createdAt: tb.created_at, angle: str(tb.differentiation_angle).trim(), five }
  }

  // the run library: the twelve newest runs with what each found
  const library: LibCard[] = runs.slice(0, 12).map((r) => {
    const b = briefs.find((x) => x.run_id === r.runId)
    const B = cap.runs[r.runId]
    const conf = b ? num(b.confidence) : null
    return {
      runId: r.runId,
      at: r.at,
      ok: r.ok,
      running: r.running,
      custom: /custom/.test(r.runId),
      rule: (B?.rule ?? '').replace(/\b1 advertisers\b/, '1 advertiser'),
      newAds: pool.filter((a) => a.runId === r.runId).length,
      behind: B && B.n > 0 ? B.n : num(r.stats.curated_ads),
      advertisers: num(r.stats.advertisers),
      confidence: conf ?? num(r.stats.confidence),
      lead: b ? lead(b) : '',
      hasBrief: !!b,
    }
  })

  // a run started from this page or the old one's team record, until a newer run or brief lands
  const pending = pendingOf(set.ad_runs, now).find((p) => !runs.some((r) => (Date.parse(r.at) || 0) > p.t)) ?? null

  const follows = rowsOf(co).map(competitorOf)
  const p0 = rowsOf(pr)[0]
  const profile = { targetMarket: str(p0?.target_market).trim(), industry: str(p0?.industry).trim() }
  const adsFollow = adsFollowOf(set.ads_follow)
  return {
    pool,
    extra,
    poolError: wc.error?.message ?? null,
    cap,
    runs,
    runsError: rn.error?.message ?? null,
    briefs: briefs.map((b) => ({ runId: b.run_id, createdAt: b.created_at })),
    library,
    take,
    findings,
    schedule: adScheduleOf(set.agent_runs),
    pending,
    follows,
    followsError: co.error?.message ?? null,
    adsFollow,
    ind,
    fit: fitCrit(set.ads_follow, follows, profile),
    copySets: rowsOf(cs).map(copySetOf),
    me,
    now,
  }
}

