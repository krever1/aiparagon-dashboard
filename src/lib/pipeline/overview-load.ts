import 'server-only'
import { loadPipeline } from '@/lib/catalyst/load'
import { createClient } from '@/lib/supabase/server'
import { type ApprovalsData, loadApprovals } from '@/lib/touchpoint/approvals-load'
import type { RunRow } from '@/lib/touchpoint/today'
import { type Five, arr, fiveFor, json, termsOf } from './intel'
import {
  type CampImage, DRAFT_FORMAT, FUNNEL_MODE, type RunInfo, type TileInput, type VoiceItem, clip, contextOf, draftTitle, voiceItems,
} from './overview'

// The Pipeline Overview's data, read as the signed-in teammate on every visit (nwLoad: what Approvals lists, the
// newest briefs, drafts and campaigns, the results, what the agents know about the team, and the runs). Each card says
// when its read failed; the others still show.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type Lead = { runId: string; createdAt: string; items: Five[] }
export type Camp = { runId: string; createdAt: string; offer: string; mode: string; images: CampImage[]; fb: Record<string, string> }
export type Draft = { id: string; title: string; format: string; createdAt: string; text: string; ready: boolean }

export type OverviewData = {
  approvals: ApprovalsData
  tiles: Omit<TileInput, 'replies' | 'briefsWaiting'>
  tilesError: string | null
  /** this week's lead: the newest organic brief's five notes */
  lead: Lead | null
  leadError: string | null
  camp: Camp | null
  campError: string | null
  voice: VoiceItem[] | null
  voiceError: string | null
  draft: Draft | null
  draftError: string | null
  runs: RunRow[]
  runsError: string | null
  /** the tracker's newest run, for the hello line */
  intelRun: RunInfo | null
  now: number
}

const runOf = (r: Row | undefined): RunInfo | null => (r ? { status: str(r.status), at: str(r.finished_at || r.started_at || r.run_date) } : null)
const count = (r: { count: number | null; error: unknown }) => (r.error ? 0 : (r.count ?? 0))

export async function loadOverview(): Promise<OverviewData> {
  const supabase = await createClient()
  const now = Date.now()
  const newestRun = (agent: string) =>
    supabase.from('runs').select('status,started_at,finished_at,run_date').eq('agent', agent).order('started_at', { ascending: false, nullsFirst: false }).limit(1)
  const [approvals, recent, ri, ra, ib, ab, drafts, lt, res, read, ads, posts, voice, prof, st, comp] = await Promise.all([
    loadApprovals({ pipeline: loadPipeline().catch(() => null) }),
    supabase.from('runs').select('agent,status,started_at,finished_at,run_date').order('started_at', { ascending: false, nullsFirst: false }).limit(4),
    newestRun('intel_tracker'),
    newestRun('ad_strategist'),
    supabase
      .from('agent_outputs')
      .select('run_id,created_at,data,content_md')
      .eq('agent', 'intel_tracker')
      .eq('output_type', 'intel_brief')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('creative_briefs').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase
      .from('agent_outputs')
      .select('id,title,created_at,data')
      .eq('agent', 'content_generation')
      .eq('output_type', 'content_draft')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('agent_outputs').select('run_id,created_at,data').eq('agent', 'low_ticket_content').order('created_at', { ascending: false }).limit(40),
    supabase.from('content_results').select('id', { count: 'exact', head: true }),
    supabase.from('agent_outputs').select('created_at').eq('output_type', 'strategy_insights').order('created_at', { ascending: false }).limit(1),
    supabase.from('ad_records').select('id', { count: 'exact', head: true }),
    supabase.from('intel_items').select('id', { count: 'exact', head: true }),
    supabase.from('brand_voice').select('tone,summary,about,mission,values_text').order('created_at', { ascending: false }).limit(1),
    supabase.from('company_profile').select('industry,target_market').limit(1),
    supabase.from('ai_settings').select('key,value').in('key', ['brand_context', 'intel_follow', 'intel_keywords']),
    supabase.from('competitors').select('name,status').neq('status', 'denied').order('created_at', { ascending: true }).limit(500),
  ])

  // the newest organic brief: its counts for the tile, its five notes for this week's lead
  const brief = rowsOf(ib)[0]
  let lead: Lead | null = null
  let leadError: string | null = ib.error?.message ?? null
  if (brief) {
    const sn = await supabase
      .from('agent_outputs')
      .select('snapshot')
      .eq('run_id', str(brief.run_id))
      .not('snapshot', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5)
    const snap = rowsOf(sn).find((r) => arr(json(r.snapshot).items).length)?.snapshot ?? null
    if (sn.error) leadError = sn.error.message
    lead = { runId: str(brief.run_id), createdAt: str(brief.created_at), items: fiveFor(snap, str(brief.content_md), []) }
  }
  const bd = json(brief?.data)
  const n = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

  // the drafts: how many, how many still to check, and the newest for the thought leadership card
  const dRows = rowsOf(drafts)
  const ids = dRows.map((d) => str(d.id)).filter(Boolean)
  const ready = new Set<string>()
  let draftError = drafts.error?.message ?? null
  if (ids.length) {
    const rv = await supabase.from('agent_feedback').select('target_id').eq('target_type', 'draft_review').eq('action', 'ready').in('target_id', ids).limit(300)
    if (rv.error) draftError = rv.error.message
    for (const r of rowsOf(rv)) ready.add(str(r.target_id))
  }
  const d0 = dRows[0]
  let draft: Draft | null = null
  if (d0) {
    const d = json(d0.data)
    const hook = json(arr(d.hooks)[0])
    draft = {
      id: str(d0.id),
      title: draftTitle(d0.title, d),
      format: DRAFT_FORMAT[str(d.format)] || 'Draft',
      createdAt: str(d0.created_at),
      text: clip(str(hook.text) || str(d.body), 220),
      ready: ready.has(str(d0.id)),
    }
  }

  // the campaigns: one per run, the newest first; the newest one's images and what was decided on each
  const seen = new Set<string>()
  const outs = rowsOf(lt).filter((o) => {
    const r = str(o.run_id)
    if (!r || seen.has(r)) return false
    seen.add(r)
    return true
  })
  let camp: Camp | null = null
  let campError = lt.error?.message ?? null
  if (outs[0]) {
    const d = json(outs[0].data)
    const images: CampImage[] = arr(d.ad_images)
      .map(json)
      .map((i) => ({ url: str(i.url), label: str(i.label), file: str(i.file) }))
    const files = images.map((i) => i.file).filter(Boolean)
    const fb: Record<string, string> = {}
    if (files.length) {
      const f = await supabase
        .from('agent_feedback')
        .select('target_id,action,created_at')
        .eq('target_type', 'ad_image_variant')
        .in('target_id', files)
        .order('created_at', { ascending: false })
        .limit(200)
      if (f.error) campError = f.error.message
      for (const r of rowsOf(f)) if (!(str(r.target_id) in fb)) fb[str(r.target_id)] = str(r.action)
    }
    camp = { runId: str(outs[0].run_id), createdAt: str(outs[0].created_at), offer: str(d.offer_name) || 'Campaign', mode: FUNNEL_MODE[str(d.funnel_mode || 'direct_to_call')] ?? '', images, fb }
  }

  // what the agents know about the team
  const setting = (k: string) => rowsOf(st).find((r) => r.key === k)?.value
  const voiceError = voice.error?.message || prof.error?.message || st.error?.message || comp.error?.message || null
  const p = rowsOf(prof)[0] ?? {}
  const v = rowsOf(voice)[0]
  const vItems = voiceItems({
    voice: v ? { tone: v.tone, summary: v.summary, about: v.about, mission: v.mission, values_text: v.values_text } : null,
    industry: str(p.industry).trim(),
    targetMarket: str(p.target_market).trim(),
    context: contextOf(setting('brand_context')),
    topics: termsOf(setting('intel_follow'), setting('intel_keywords')).topics,
    following: rowsOf(comp).map((c) => str(c.name)).filter(Boolean),
  })

  const tilesError = [ri.error, ra.error, ab.error, res.error, ads.error, posts.error, read.error].find(Boolean)?.message ?? null

  return {
    approvals,
    tiles: {
      intelBrief: brief ? { createdAt: str(brief.created_at), nItems: n(bd.n_items), nHigh: n(bd.n_high_value) } : null,
      intelPosts: count(posts),
      adsBrief: rowsOf(ab)[0] ? { createdAt: str(rowsOf(ab)[0].created_at) } : null,
      ads: count(ads),
      intelRun: runOf(rowsOf(ri)[0]),
      adsRun: runOf(rowsOf(ra)[0]),
      drafts: { n: dRows.length, toCheck: dRows.filter((d) => !ready.has(str(d.id))).length, latest: d0 ? str(d0.created_at) : null },
      campaigns: { n: outs.length, latest: outs[0] ? str(outs[0].created_at) : null },
      results: { n: count(res), read: rowsOf(read)[0] ? str(rowsOf(read)[0].created_at) : null },
    },
    tilesError,
    lead,
    leadError,
    camp,
    campError,
    voice: voiceError && !v && !rowsOf(prof).length ? null : vItems,
    voiceError,
    draft,
    draftError,
    runs: rowsOf(recent).map((r) => ({ agent: str(r.agent), status: str(r.status), at: str(r.finished_at || r.started_at || r.run_date) })),
    runsError: recent.error?.message ?? null,
    intelRun: runOf(rowsOf(ri)[0]),
    now,
  }
}
