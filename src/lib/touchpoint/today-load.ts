import 'server-only'
import { type InboxData, loadInbox } from '@/lib/catalyst/inbox-load'
import { loadPipeline } from '@/lib/catalyst/load'
import { STAGES, type StageNames } from '@/lib/catalyst/stages'
import { viewStage } from '@/lib/catalyst/view'
import { createClient } from '@/lib/supabase/server'
import { type ApprovalsData, loadApprovals } from './approvals-load'
import type { RunRow } from './today'

// Today's data, read as the signed-in teammate on every visit (home.today: what Approvals lists, the leads, the live
// landing pages, the newest runs and sign-ups). A read that fails leaves its card saying so; the rest still shows.

export type Signup = { id: string; who: string; page: string; at: string }

export type TodayData = {
  approvals: ApprovalsData
  /** leads, and those not a weak fit that are short of the last meeting stage; null when they could not be read */
  leads: { count: number; next: number } | null
  /** live landing pages; null when they could not be read */
  live: number | null
  runs: RunRow[]
  runsError: string | null
  signups: Signup[]
  signupsError: string | null
  /** Catalyst's new clients from HubSpot and new transcripts, and the stages' names for their questions */
  inbox: InboxData
  names: StageNames
  /** when the server read it: the greeting and the date until the page is in the browser */
  now: number
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const LAST = STAGES[STAGES.length - 1].key

export async function loadToday(): Promise<TodayData> {
  const supabase = await createClient()
  const [approvals, pipeline, live, runs, su] = await Promise.all([
    loadApprovals(),
    loadPipeline().catch(() => null),
    supabase.from('landing_pages').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    supabase.from('runs').select('agent,status,started_at,finished_at,run_date').order('started_at', { ascending: false, nullsFirst: false }).limit(4),
    supabase.from('lp_signups').select('id,name,email,page_id,created_at').order('created_at', { ascending: false }).limit(4),
  ])

  // new clients and transcripts are checked against the leads, so they wait for a good read of them
  const now = Date.now()
  const inbox: InboxData = pipeline && !pipeline.error ? await loadInbox(pipeline.leads, now).catch(() => ({ items: [], leads: [] })) : { items: [], leads: [] }

  const leads =
    pipeline && !(pipeline.error && !pipeline.leads.length)
      ? { count: pipeline.leads.length, next: pipeline.leads.filter((l) => l.fit !== 'Weak' && viewStage(l) !== LAST).length }
      : null

  // the sign-ups' pages, for the name shown when a row is pointed at
  const rows = (su.data ?? []) as Record<string, unknown>[]
  const ids = [...new Set(rows.map((r) => str(r.page_id)).filter(Boolean))]
  const titles: Record<string, string> = {}
  if (ids.length) {
    const pg = await supabase.from('landing_pages').select('id,title').in('id', ids)
    for (const p of (pg.data ?? []) as Record<string, unknown>[]) titles[str(p.id)] = str(p.title)
  }

  return {
    approvals,
    leads,
    live: live.error ? null : (live.count ?? 0),
    runs: ((runs.data ?? []) as Record<string, unknown>[]).map((r) => ({
      agent: str(r.agent),
      status: str(r.status),
      at: str(r.finished_at || r.started_at || r.run_date),
    })),
    runsError: runs.error?.message ?? null,
    signups: rows.map((r) => ({ id: str(r.id), who: str(r.name).trim() || str(r.email), page: titles[str(r.page_id)] ?? '', at: str(r.created_at) })),
    signupsError: su.error?.message ?? null,
    inbox,
    names: pipeline?.names ?? {},
    now,
  }
}
