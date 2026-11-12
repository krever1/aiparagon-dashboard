import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type LpPage, type LpSignup, type LpView, type Result, lpPageOf, resultOf } from './ad-testing'
import { json } from './intel'
import { type Outcome, type Read, type Reads, type Run, RUN_KEY, ctxSet, errorOf, memOf, readOf, runsOf } from './strategy'

// The Ad Testing page's data, read as the signed-in teammate on every visit (v98ResLoad, v98InsLoad, v98ReadsLoad,
// v115LpLoad): the 500 newest results; the 12 newest strategy reads, what the next read would read, the reads started
// from the dashboard and what became of them, and what is remembered; and the landing pages that have been live with
// their sign-ups and visits of the last 30 days.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type TestingData = {
  results: Result[]
  error: string | null
  /** the newest strategy reads, newest first */
  reads: Read[]
  readsError: string | null
  /** what the next read would read (the chips over New read); null when it could not be checked */
  info: Reads | null
  /** reads started from the dashboard, and the ones that finished or failed */
  runs: Run[]
  outcomes: Outcome[]
  /** the ids of the lines remembered for every run (e3_prefs.memory) */
  remembered: string[]
  lp: { pages: LpPage[]; su: LpSignup[]; views: LpView[]; error: string | null }
  now: number
}

export async function loadTesting(now = Date.now()): Promise<TestingData> {
  const supabase = await createClient()
  const since = new Date(now - 30 * 864e5).toISOString()
  const head = { count: 'exact' as const, head: true }
  const [res, reads, pg, su, vw, voice, set, lib, ideas, drafts, camps, ob, ab] = await Promise.all([
    supabase
      .from('content_results')
      .select('*')
      .order('posted_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('agent_outputs').select('id,run_id,title,data,created_at').eq('output_type', 'strategy_insights').order('created_at', { ascending: false }).limit(12),
    supabase.from('landing_pages').select('id,slug,title,ads,published_at').not('published_at', 'is', null).order('updated_at', { ascending: false }).limit(200),
    supabase.from('lp_signups').select('page_id,ad_code,created_at').gte('created_at', since).limit(5000),
    supabase.from('lp_views').select('page_id,ad_code,views').gte('day', since.slice(0, 10)).limit(5000),
    supabase.from('brand_voice').select('id').limit(1),
    supabase.from('ai_settings').select('key,value').in('key', ['brand_context', RUN_KEY, 'e3_prefs']),
    supabase.from('content_pieces').select('id', head),
    supabase.from('idea_notes').select('id', head).or('status.is.null,status.eq.open'),
    supabase.from('agent_outputs').select('id', head).eq('output_type', 'content_draft'),
    supabase.from('agent_outputs').select('run_id').eq('output_type', 'funnel_package').limit(500),
    supabase.from('agent_outputs').select('created_at').eq('agent', 'intel_tracker').eq('output_type', 'intel_brief').order('created_at', { ascending: false }).limit(1),
    supabase.from('creative_briefs').select('created_at').order('created_at', { ascending: false }).limit(1),
  ])
  const lpErr = [pg.error, su.error, vw.error].filter(Boolean).map((e) => e!.message)
  const results = rowsOf(res).map(resultOf)
  const S: Record<string, unknown> = {}
  for (const r of rowsOf(set)) S[str(r.key)] = r.value

  // the chips over New read count what it reads; a count that could not be read means none are shown
  const infoErr = [voice.error, set.error, lib.error, ideas.error, drafts.error, camps.error, ob.error, ab.error].some(Boolean)
  const info: Reads | null = infoErr
    ? null
    : {
        voice: rowsOf(voice).length > 0,
        ctx: ctxSet(S.brand_context),
        camps: new Set(rowsOf(camps).map((r) => str(r.run_id)).filter(Boolean)).size,
        drafts: drafts.count ?? 0,
        lib: lib.count ?? 0,
        ideas: ideas.count ?? 0,
        posts: results.filter((r) => r.kind !== 'ad').length,
        ads: results.filter((r) => r.kind === 'ad').length,
        ob: str(rowsOf(ob)[0]?.created_at),
        ab: str(rowsOf(ab)[0]?.created_at),
      }

  // what became of the reads started from the dashboard
  const runs = set.error ? [] : runsOf(S[RUN_KEY])
  let outcomes: Outcome[] = []
  if (runs.length) {
    const got = await supabase
      .from('agent_outputs')
      .select('run_id,output_type,title,data')
      .in(
        'run_id',
        runs.map((r) => r.runId),
      )
      .in('output_type', ['strategy_insights', 'strategy_insights_error'])
    outcomes = rowsOf(got).map((r) => ({ runId: str(r.run_id), ok: r.output_type === 'strategy_insights', error: r.output_type === 'strategy_insights' ? '' : errorOf(r) }))
    // a read and an error under one run: the read wins
    outcomes = outcomes.filter((o) => o.ok || !outcomes.some((x) => x.ok && x.runId === o.runId))
  }

  return {
    results,
    error: res.error ? res.error.message : null,
    reads: rowsOf(reads).map(readOf),
    readsError: reads.error ? reads.error.message : null,
    info,
    runs,
    outcomes,
    remembered: memOf(json(S.e3_prefs)).map((m) => m.id),
    lp: {
      pages: rowsOf(pg).map(lpPageOf),
      su: rowsOf(su).map((s) => ({ pageId: str(s.page_id), code: str(s.ad_code), createdAt: str(s.created_at) })),
      views: rowsOf(vw).map((v) => ({ pageId: str(v.page_id), code: str(v.ad_code), views: Number(v.views) || 0 })),
      error: lpErr.length ? lpErr.join('; ') : null,
    },
    now,
  }
}
