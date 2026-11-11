import 'server-only'
import { loadPipeline } from '@/lib/catalyst/load'
import type { PipelineData } from '@/lib/catalyst/view'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { createClient } from '@/lib/supabase/server'
import {
  type AdsBrief, type Campaign, type CommentRow, type ContentDraft, type ContentRequest, type IntelBrief, type Item, type ReplyRow, adImages,
  approvalItems, hookText, leadWaits, snapItems,
} from './approvals'

// Approvals' data, read as the signed-in teammate (apCfLoad, v97LtLoad, e9SnapLoad and apLoad, the parts Approvals
// uses): the newest organic and ads briefs with their decisions and snapshots, failed content requests, content drafts
// not marked ready, the ad images of the three newest campaigns with their decisions, the replies waiting, the leads
// on the board waiting on their next document, and the open comments. Read fresh on every visit.

export type ApprovalsData = {
  items: Item[]
  /** a read that failed, said on the page (the current dashboard showed nothing waiting instead) */
  error: string | null
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** A JSON column as an object: some are kept as text (a campaign's data is a JSON string inside jsonb). */
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
const arr = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }) => (r.data ?? []) as Row[]

/** `pipeline`: the board's leads when the caller reads them already (Today), so they are read once. */
export async function loadApprovals(opts: { pipeline?: Promise<PipelineData | null> } = {}): Promise<ApprovalsData> {
  const supabase = await createClient()
  const pipelineP = opts.pipeline ?? loadPipeline().catch(() => null)
  const [ib, ab, dr, rq, df, lt, cm, pipeline] = await Promise.all([
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
    supabase.from('content_requests').select('id,title,status,error,created_at').order('created_at', { ascending: false }).limit(60),
    supabase
      .from('agent_outputs')
      .select('id,title,created_at,data')
      .eq('agent', 'content_generation')
      .eq('output_type', 'content_draft')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('agent_outputs').select('run_id,created_at,data').eq('agent', 'low_ticket_content').order('created_at', { ascending: false }).limit(40),
    // the newest 40 open comments (the current dashboard read the newest 40 and kept the open ones)
    supabase.from('dashboard_comments').select('id,target_key,author,body,created_at').not('resolved', 'is', true).order('created_at', { ascending: false }).limit(40),
    pipelineP,
  ])
  const errors = [ib.error, ab.error, dr.error, rq.error, df.error, lt.error, cm.error].filter(Boolean).map((e) => e!.message)
  if (!pipeline) errors.push('the leads could not be read')
  else if (pipeline.error) errors.push(pipeline.error)

  const i0 = rowsOf(ib)[0]
  const a0 = rowsOf(ab)[0]
  const intel: IntelBrief | null = i0
    ? { run_id: str(i0.run_id), created_at: str(i0.created_at), content_md: str(i0.content_md), n_items: Number(json(i0.data).n_items) || 0 }
    : null
  const ads: AdsBrief | null = a0
    ? { run_id: str(a0.run_id), created_at: str(a0.created_at), winning_hooks: a0.winning_hooks, core_pain_points: a0.core_pain_points }
    : null
  const requests: ContentRequest[] = rowsOf(rq).map((r) => ({
    id: str(r.id),
    title: str(r.title),
    status: str(r.status),
    error: str(r.error),
    created_at: str(r.created_at),
  }))
  const drafts: ContentDraft[] = rowsOf(df).map((o) => ({ id: str(o.id), title: str(o.title), created_at: str(o.created_at), data: json(o.data) }))
  // the newest row of each campaign, then the three newest campaigns (as nwApprovalAll takes them)
  const campaigns: Campaign[] = []
  for (const o of rowsOf(lt)) {
    const run = str(o.run_id)
    if (!run || campaigns.some((c) => c.run_id === run)) continue
    campaigns.push({ run_id: run, created_at: str(o.created_at), data: json(o.data) })
  }
  const shown = campaigns.slice(0, 3)
  const files = shown.flatMap((c) => adImages(c).map((i) => i.file))

  // what the first reads point to, read together: the briefs' decisions and snapshots, the drafts marked ready, the
  // campaigns' hooks and their images' decisions
  const runs = [intel?.run_id, ads?.run_id].filter((r): r is string => !!r)
  const none = Promise.resolve({ data: [] as Row[], error: null })
  const [fb, sn, rd, pk, ad] = await Promise.all([
    runs.length
      ? supabase.from('agent_feedback').select('target_id,action,created_at').eq('target_type', 'brief_approval').in('target_id', runs).order('created_at', { ascending: false }).limit(100)
      : none,
    runs.length
      ? supabase.from('agent_outputs').select('run_id,snapshot').not('snapshot', 'is', null).in('run_id', runs).order('created_at', { ascending: false }).limit(20)
      : none,
    drafts.length
      ? supabase.from('agent_feedback').select('target_id').eq('target_type', 'draft_review').eq('action', 'ready').in('target_id', drafts.map((d) => d.id)).limit(200)
      : none,
    shown.length
      ? supabase.from('funnel_packages').select('run_id,ad_variations').in('run_id', shown.map((c) => c.run_id)).order('created_at', { ascending: false }).limit(20)
      : none,
    files.length
      ? supabase.from('agent_feedback').select('target_id,action,created_at').eq('target_type', 'ad_image_variant').in('target_id', files).order('created_at', { ascending: false }).limit(300)
      : none,
  ])
  for (const r of [fb, rd, pk, ad]) if (r.error) errors.push(r.error.message)

  const decisions: Record<string, { action: string }[]> = {}
  for (const r of rowsOf(fb)) (decisions[str(r.target_id)] ??= []).push({ action: str(r.action) })
  // the newest snapshot that reads, as e9SnapLoad keeps it (one that does not parse gives way to an older one)
  const snaps: Record<string, unknown> = {}
  for (const r of rowsOf(sn)) if (!(str(r.run_id) in snaps) && snapItems(r.snapshot)) snaps[str(r.run_id)] = r.snapshot
  // a campaign's hooks from its newest package (v97LtLoad), each image's newest decision
  const hooks: Record<string, string[]> = {}
  for (const p of rowsOf(pk)) {
    const run = str(p.run_id)
    if (!(run in hooks)) hooks[run] = arr(json(p.ad_variations).hook_variations).map(hookText).filter(Boolean)
  }
  const adDecisions: Record<string, string> = {}
  for (const r of rowsOf(ad)) if (!(str(r.target_id) in adDecisions)) adDecisions[str(r.target_id)] = str(r.action)

  // the board's leads: the ones waiting on their next document (only from a whole read: without the documents every
  // lead would look as if it had none), and every lead's page by its emails (a comment on a lead's document opens there)
  const leadIds: Record<string, string> = {}
  for (const l of pipeline?.leads ?? []) for (const e of l.emails) leadIds[e.trim().toLowerCase()] ??= l.id
  const waits = pipeline && !pipeline.error ? leadWaits(pipeline.leads) : []
  const comments: CommentRow[] = rowsOf(cm).map((c) => ({
    id: str(c.id),
    target: str(c.target_key),
    author: str(c.author),
    body: str(c.body),
    createdAt: str(c.created_at),
  }))

  const replies: ReplyRow[] = rowsOf(dr).map((d) => ({
    id: str(d.id),
    competitor: str(d.competitor_name),
    platform: str(d.platform),
    action: str(d.action),
    draft: str(d.draft),
    sourceUrl: str(d.source_url),
    createdAt: str(d.created_at),
  }))

  return {
    items: approvalItems({
      intel,
      ads,
      decisions,
      snaps,
      replies,
      requests,
      drafts,
      ready: rowsOf(rd).map((r) => str(r.target_id)),
      campaigns,
      hooks,
      adDecisions,
      leads: waits,
      comments,
      leadIds,
      legacy: LEGACY_DASHBOARD_URL,
      now: Date.now(),
    }),
    error: errors.length ? errors[0] : null,
  }
}
