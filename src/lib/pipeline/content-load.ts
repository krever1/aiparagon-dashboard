import 'server-only'
import type { SnapItem } from '@/lib/touchpoint/approvals'
import { createClient } from '@/lib/supabase/server'
import {
  type Draft, type Note, type Piece, type Req, type Review, briefIdeas, draftOf, draftOrigin, noteOf, pieceOf, reqOf, reviewOf,
} from './content'

// The Content Transformation page's data, read as the signed-in teammate on every visit (apCfLoad, e9IdeasLoad,
// nwPiecesLoad and apCpLoad in the current dashboard): the 60 newest requests and drafts (the page lists those made from
// the team's own material; the ones made from the briefs are Marketing Generation's), the drafts' reviews, the library
// (content_pieces not archived), the team's ideas (idea_notes), the newest organic brief's five things, and the days of
// the briefs the drafts were packaged with.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type ContentData = {
  /** the 60 newest requests, newest first */
  reqs: Req[]
  /** the drafts made from the team's own material, newest first */
  drafts: Draft[]
  /** the newest drafts made from the briefs: Marketing Generation's, so a link to one here says where it is */
  briefIds: string[]
  revs: Review[]
  pieces: Piece[]
  notes: Note[]
  brief: { runId: string; createdAt: string; items: SnapItem[] } | null
  /** when each brief a draft was packaged with was written, by its run */
  briefDays: { org: Record<string, string>; ads: Record<string, string> }
  errors: { drafts: string | null; ideas: string | null; pieces: string | null; brief: string | null }
  now: number
}

export async function loadContent(now = Date.now()): Promise<ContentData> {
  const supabase = await createClient()
  const [rq, df, pc, nt, ib] = await Promise.all([
    supabase
      .from('content_requests')
      .select('id,created_at,updated_at,requested_by,start_mode,format,content_type,title,source_type,status,error,output_id')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('agent_outputs')
      .select('id,run_id,title,created_at,data')
      .eq('agent', 'content_generation')
      .eq('output_type', 'content_draft')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('content_pieces').select('*').neq('status', 'archived').order('updated_at', { ascending: false }).limit(200),
    supabase.from('idea_notes').select('*').order('created_at', { ascending: false }).limit(200),
    supabase
      .from('agent_outputs')
      .select('run_id,created_at,content_md')
      .eq('agent', 'intel_tracker')
      .eq('output_type', 'intel_brief')
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  const reqs = rowsOf(rq).map(reqOf)
  const all = rowsOf(df).map(draftOf)
  const drafts = all.filter((d) => draftOrigin(d, reqs) === 'mine')
  const i0 = rowsOf(ib)[0]

  // what the first reads point to: the drafts' reviews, the newest organic brief's snapshot, and the briefs the drafts
  // were packaged with
  const none = Promise.resolve({ data: [] as Row[], error: null })
  const ids = all.map((d) => d.id)
  const orgRuns = [...new Set(drafts.map((d) => d.brief.intelRun).filter(Boolean))]
  const adRuns = [...new Set(drafts.map((d) => d.brief.adRun).filter(Boolean))]
  const [rv, sn, ob, ab] = await Promise.all([
    ids.length
      ? supabase
          .from('agent_feedback')
          .select('id,target_id,action,feedback,author,created_at')
          .eq('target_type', 'draft_review')
          .in('target_id', ids)
          .order('created_at', { ascending: false })
          .limit(500)
      : none,
    i0
      ? supabase.from('agent_outputs').select('snapshot').eq('run_id', str(i0.run_id)).not('snapshot', 'is', null).order('created_at', { ascending: false }).limit(5)
      : none,
    orgRuns.length ? supabase.from('agent_outputs').select('run_id,created_at').eq('agent', 'intel_tracker').eq('output_type', 'intel_brief').in('run_id', orgRuns).limit(100) : none,
    adRuns.length ? supabase.from('creative_briefs').select('run_id,created_at').in('run_id', adRuns).limit(100) : none,
  ])
  const days = (r: { data: unknown }) => {
    const o: Record<string, string> = {}
    for (const x of rowsOf(r)) if (!(str(x.run_id) in o)) o[str(x.run_id)] = str(x.created_at)
    return o
  }
  // the newest snapshot that reads, as e9SnapLoad keeps it
  const snap = rowsOf(sn).map((r) => r.snapshot)
  const items = i0 ? briefIdeas(str(i0.content_md), snap.find((s) => briefIdeas('', s).length) ?? null) : []

  const msg = (...es: ({ message: string } | null)[]) => es.filter(Boolean).map((e) => e!.message)[0] ?? null
  return {
    reqs,
    drafts,
    briefIds: all.filter((d) => !drafts.includes(d)).map((d) => d.id),
    revs: rowsOf(rv).map(reviewOf),
    pieces: rowsOf(pc).map(pieceOf),
    notes: rowsOf(nt).map(noteOf),
    brief: i0 ? { runId: str(i0.run_id), createdAt: str(i0.created_at), items } : null,
    briefDays: { org: days(ob), ads: days(ab) },
    errors: {
      drafts: msg(df.error, rq.error, rv.error),
      ideas: msg(nt.error),
      pieces: msg(pc.error),
      brief: msg(ib.error),
    },
    now,
  }
}
