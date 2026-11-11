import 'server-only'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { createClient } from '@/lib/supabase/server'
import { type AdsBrief, type IntelBrief, type Item, type ReplyRow, approvalItems, snapItems } from './approvals'

// Approvals' data, read as the signed-in teammate (apCfLoad, e9SnapLoad and apLoad, the parts Approvals uses): the
// newest organic and ads briefs with their decisions and snapshots, and the replies waiting. Read fresh on every visit.

export type ApprovalsData = {
  items: Item[]
  /** a read that failed, said on the page (the current dashboard showed nothing waiting instead) */
  error: string | null
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

function json(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
    } catch {
      return {}
    }
  }
  return {}
}

export async function loadApprovals(): Promise<ApprovalsData> {
  const supabase = await createClient()
  const [ib, ab, dr] = await Promise.all([
    supabase
      .from('agent_outputs')
      .select('run_id,created_at,content_md,data')
      .eq('agent', 'intel_tracker')
      .eq('output_type', 'intel_brief')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('creative_briefs').select('run_id,created_at,winning_hooks,core_pain_points').order('created_at', { ascending: false }).limit(1),
    supabase
      .from('engagement_drafts')
      .select('id,competitor_name,platform,action,draft,source_url,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(500),
  ])
  const errors = [ib.error, ab.error, dr.error].filter(Boolean).map((e) => e!.message)

  const i0 = (ib.data ?? [])[0] as Record<string, unknown> | undefined
  const a0 = (ab.data ?? [])[0] as Record<string, unknown> | undefined
  const intel: IntelBrief | null = i0
    ? { run_id: str(i0.run_id), created_at: str(i0.created_at), content_md: str(i0.content_md), n_items: Number(json(i0.data).n_items) || 0 }
    : null
  const ads: AdsBrief | null = a0
    ? { run_id: str(a0.run_id), created_at: str(a0.created_at), winning_hooks: a0.winning_hooks, core_pain_points: a0.core_pain_points }
    : null

  // the briefs' decisions and snapshots, by run id
  const runs = [intel?.run_id, ads?.run_id].filter((r): r is string => !!r)
  const decisions: Record<string, { action: string }[]> = {}
  const snaps: Record<string, unknown> = {}
  if (runs.length) {
    const [fb, sn] = await Promise.all([
      supabase.from('agent_feedback').select('target_id,action,created_at').eq('target_type', 'brief_approval').in('target_id', runs).order('created_at', { ascending: false }).limit(100),
      supabase.from('agent_outputs').select('run_id,snapshot').not('snapshot', 'is', null).in('run_id', runs).order('created_at', { ascending: false }).limit(20),
    ])
    if (fb.error) errors.push(fb.error.message)
    for (const r of (fb.data ?? []) as { target_id: string; action: string }[]) (decisions[str(r.target_id)] ??= []).push({ action: str(r.action) })
    // the newest snapshot that reads, as e9SnapLoad keeps it (one that does not parse gives way to an older one)
    for (const r of (sn.data ?? []) as { run_id: string; snapshot: unknown }[]) if (!(r.run_id in snaps) && snapItems(r.snapshot)) snaps[r.run_id] = r.snapshot
  }

  const replies: ReplyRow[] = ((dr.data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: str(d.id),
    competitor: str(d.competitor_name),
    platform: str(d.platform),
    action: str(d.action),
    draft: str(d.draft),
    sourceUrl: str(d.source_url),
    createdAt: str(d.created_at),
  }))

  return {
    items: approvalItems({ intel, ads, decisions, snaps, replies, legacy: LEGACY_DASHBOARD_URL, now: Date.now() }),
    error: errors.length ? errors[0] : null,
  }
}
