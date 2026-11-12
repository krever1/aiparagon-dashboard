import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type Competitor, competitorOf, json, pendingOf } from './intel'
import { type CampaignState, type HistRow, campaignRunsOf, campaignState, histRows, uploadNames } from './uploads'

// Runs & uploads (apHistLoad with the Intel runs added by its wrapper), read as the signed-in teammate on every visit:
// the ads the team uploaded, the ads briefs built from them, the ad copy written from them, the campaigns built from
// those briefs, every Intel Tracker brief and the custom Intel runs still under way, plus the newest campaign started
// from here and who the Ad Strategist follows (for the upload window's follow question).

type Row = Record<string, unknown>
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type RunsData = {
  rows: HistRow[]
  /** reads that failed, in words, so a broken read never looks like "nothing here" */
  errors: string[]
  /** the newest ads brief built from uploads, which Send to Marketing Generation uses */
  newest: { runId: string; at: string } | null
  counts: { upload: number; brief: number; copy: number; funnel: number; intel: number; custom: number }
  /** the newest campaign started from a brief, while it is worth showing (a week) */
  campaign: CampaignState | null
  follows: Competitor[]
  names: string[]
  now: number
}

const COMP_COLS = 'id,name,handle_linkedin,handle_x,meta_page_id,website,status,follow_kind,follow_for,added_by,created_at,notes'

export async function loadRuns(now = Date.now()): Promise<RunsData> {
  const supabase = await createClient()
  const out = (q: string) => supabase.from('agent_outputs').select(q).order('created_at', { ascending: false })
  const [ups, briefs, copies, lts, intel, runs, st, co] = await Promise.all([
    supabase
      .from('winner_creatives')
      .select('id,created_at,advertiser_name,platform,uploaded_by,hook,body,image_url,image_urls,upload_analysis')
      .not('uploaded_by', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300),
    out('id,run_id,title,created_at,data,content_md').eq('agent', 'ad_strategist').like('run_id', 'agent2_custom_%').limit(100),
    out('id,run_id,title,created_at,data,content_md').eq('agent', 'ad_copywriter').limit(100),
    out('id,run_id,title,created_at,data').eq('agent', 'low_ticket_content').limit(60),
    out('id,run_id,title,created_at,data,content_md').eq('agent', 'intel_tracker').eq('output_type', 'intel_brief').limit(40),
    supabase.from('runs').select('run_id,source,requested_by,input').eq('agent', 'intel_tracker').order('started_at', { ascending: false, nullsFirst: false }).limit(80),
    supabase.from('ai_settings').select('key,value').in('key', ['intel_runs', 'campaign_runs']),
    supabase.from('competitors').select(COMP_COLS).order('created_at', { ascending: true }).limit(500),
  ])

  const errors: string[] = []
  const fail = (what: string, r: { error: { message: string } | null }) => {
    if (r.error) errors.push('Could not read ' + what + ': ' + r.error.message)
  }
  fail('the uploaded ads', ups)
  fail('the strategies', briefs)
  fail('the ad copy', copies)
  fail('the campaigns', lts)
  fail('the Intel runs', intel)
  fail('who started each Intel run', runs)
  fail('the runs under way', st)

  const set: Record<string, unknown> = {}
  for (const r of rowsOf(st)) set[str(r.key)] = r.value
  const campaignsAll = rowsOf(lts)
  // campaigns built from an ads brief made from the uploads (the scheduled ones live on Marketing Generation)
  const funnels = campaignsAll.filter((r) => str(json(r.data).source_brief_run).startsWith('agent2_custom_'))
  const pend = pendingOf(set.intel_runs, now)
  const rows = histRows({
    ups: rowsOf(ups),
    briefs: rowsOf(briefs),
    copies: rowsOf(copies),
    funnels,
    intel: rowsOf(intel),
    intelRuns: rowsOf(runs),
    pending: pend.map((p) => ({ runId: p.runId, names: p.names, t: p.t, by: p.by })),
  })

  const last = campaignRunsOf(set.campaign_runs)[0]
  const campaign =
    last && now - last.t < 7 * 864e5
      ? campaignState(
          last,
          campaignsAll.map((r) => ({ run_id: str(r.run_id), created_at: str(r.created_at), title: str(r.title), data: r.data })),
          now,
        )
      : null

  const nb = rowsOf(briefs)[0]
  const follows = rowsOf(co).map(competitorOf)
  const intelRows = rows.filter((r) => r.kind === 'intel')
  return {
    rows,
    errors,
    newest: nb ? { runId: str(nb.run_id), at: str(nb.created_at) } : null,
    counts: {
      upload: rows.filter((r) => r.kind === 'upload').length,
      brief: rows.filter((r) => r.kind === 'brief').length,
      copy: rows.filter((r) => r.kind === 'copy').length,
      funnel: rows.filter((r) => r.kind === 'funnel').length,
      intel: intelRows.length,
      custom: intelRows.filter((r) => r.intel?.custom === true).length,
    },
    campaign,
    follows,
    names: uploadNames(
      follows.map((c) => c.name),
      rowsOf(ups).map((r) => str(r.advertiser_name)),
    ),
    now,
  }
}
