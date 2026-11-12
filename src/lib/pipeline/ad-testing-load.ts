import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type LpPage, type LpSignup, type LpView, type Result, lpPageOf, resultOf } from './ad-testing'

// The Ad Testing page's data, read as the signed-in teammate on every visit (v98ResLoad, v115LpLoad): the 500 newest
// results, the day of the newest strategy read, and the landing pages that have been live with their sign-ups and
// visits of the last 30 days.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type TestingData = {
  results: Result[]
  error: string | null
  /** when the newest strategy read was made; null when there is none or it could not be read */
  readAt: string | null
  lp: { pages: LpPage[]; su: LpSignup[]; views: LpView[]; error: string | null }
  now: number
}

export async function loadTesting(now = Date.now()): Promise<TestingData> {
  const supabase = await createClient()
  const since = new Date(now - 30 * 864e5).toISOString()
  const [res, read, pg, su, vw] = await Promise.all([
    supabase
      .from('content_results')
      .select('*')
      .order('posted_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('agent_outputs').select('created_at').eq('output_type', 'strategy_insights').order('created_at', { ascending: false }).limit(1),
    supabase.from('landing_pages').select('id,slug,title,ads,published_at').not('published_at', 'is', null).order('updated_at', { ascending: false }).limit(200),
    supabase.from('lp_signups').select('page_id,ad_code,created_at').gte('created_at', since).limit(5000),
    supabase.from('lp_views').select('page_id,ad_code,views').gte('day', since.slice(0, 10)).limit(5000),
  ])
  const lpErr = [pg.error, su.error, vw.error].filter(Boolean).map((e) => e!.message)
  return {
    results: rowsOf(res).map(resultOf),
    error: res.error ? res.error.message : null,
    readAt: str(rowsOf(read)[0]?.created_at) || null,
    lp: {
      pages: rowsOf(pg).map(lpPageOf),
      su: rowsOf(su).map((s) => ({ pageId: str(s.page_id), code: str(s.ad_code), createdAt: str(s.created_at) })),
      views: rowsOf(vw).map((v) => ({ pageId: str(v.page_id), code: str(v.ad_code), views: Number(v.views) || 0 })),
      error: lpErr.length ? lpErr.join('; ') : null,
    },
    now,
  }
}
