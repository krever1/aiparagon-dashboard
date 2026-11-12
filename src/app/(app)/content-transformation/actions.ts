'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { callN8n } from '@/lib/n8n'
import { CHECKS, type PieceForm, askProblem, askText, draftOf, kindOf, noteTags, pieceRow } from '@/lib/pipeline/content'
import { createClient } from '@/lib/supabase/server'

// Content Transformation's actions, as the signed-in teammate (apCfRetry, apCfMarkReady, v126Save, apCpSave,
// apCpArchive, nwIdeaSave and nwIdeaDel in the current dashboard): a request started again, a draft marked ready or
// sent back with what should change, a draft kept in the library and a library piece changed or archived, and an idea
// added or deleted.

const SIGNED_OUT = 'You are signed out. Sign in again.'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Done = { ok: true } | { ok: false; error: string }

/** A draft as saved (agent_outputs content_generation content_draft), or null when it is not on file. */
async function readDraft(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from('agent_outputs')
    .select('id,run_id,title,created_at,data')
    .eq('id', id)
    .eq('agent', 'content_generation')
    .eq('output_type', 'content_draft')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? draftOf(data as Record<string, unknown>) : null
}

/**
 * Try again on a request that did not finish or was not picked up (apCfRetry): back in the queue, then Content from
 * Source is asked to write it. A workflow that does not start leaves the request queued and says why.
 */
export async function retryRequest(id: string): Promise<{ ok: true; started: boolean; error?: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That request is not on file.' }
  const supabase = await createClient()
  const got = await supabase.from('content_requests').select('id,status').eq('id', id).maybeSingle()
  if (got.error) return { ok: false, error: 'Could not read the request: ' + got.error.message }
  if (!got.data) return { ok: false, error: 'That request is not on file any more.' }
  if (got.data.status === 'done') {
    refresh()
    return { ok: false, error: 'That draft is written already.' }
  }
  const up = await supabase.from('content_requests').update({ status: 'queued', error: null, updated_at: new Date().toISOString() }).eq('id', id)
  if (up.error) return { ok: false, error: 'Could not start it again: ' + up.error.message }
  try {
    await callN8n(
      'e3-content-run',
      { request_id: id, requested_by: user.email },
      { what: 'Content from Source', workflow: 'Engine 3 · Content from Source', timeoutMs: 30_000 },
    )
  } catch (e) {
    refresh()
    return { ok: true, started: false, error: msgOf(e) }
  }
  refresh()
  return { ok: true, started: true }
}

/** Mark ready (apCfMarkReady): the sign-off, with the four checks; once per draft. Nothing is published. */
export async function markReady(id: string): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That draft is not on file.' }
  const supabase = await createClient()
  try {
    if (!(await readDraft(supabase, id))) return { ok: false, error: 'That draft is not on file any more.' }
  } catch (e) {
    return { ok: false, error: 'Could not read the draft: ' + msgOf(e) }
  }
  const had = await supabase.from('agent_feedback').select('id').eq('target_type', 'draft_review').eq('target_id', id).eq('action', 'ready').limit(1)
  if (!had.error && (had.data ?? []).length) {
    refresh()
    return { ok: true }
  }
  const { error } = await supabase.from('agent_feedback').insert({
    agent: 'content_generation',
    target_type: 'draft_review',
    target_id: id,
    action: 'ready',
    feedback: JSON.stringify({ checked: CHECKS }),
    author: user.email,
  })
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  refresh()
  return { ok: true }
}

/** What should change? on a draft (v126Save): one sentence that starts with the kind, which the next drafts read. */
export async function askDraftChange(input: { id: string; picked: string[]; note: string }): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.id)
  const picked = (Array.isArray(input?.picked) ? input.picked : []).map(str)
  const note = str(input?.note).slice(0, 500)
  const bad = askProblem(picked, note)
  if (bad) return { ok: false, error: bad }
  if (!UUID.test(id)) return { ok: false, error: 'That draft is not on file.' }
  const supabase = await createClient()
  let draft: Awaited<ReturnType<typeof readDraft>>
  try {
    draft = await readDraft(supabase, id)
  } catch (e) {
    return { ok: false, error: 'Could not save it: ' + msgOf(e) }
  }
  if (!draft) return { ok: false, error: 'That draft is not on file any more.' }
  const { error } = await supabase.from('agent_feedback').insert({
    agent: 'content_generation',
    target_type: 'draft_review',
    target_id: id,
    action: 'changes',
    feedback: askText(kindOf(draft), picked, note),
    author: user.email,
  })
  if (error) return { ok: false, error: 'Could not save it: ' + error.message }
  refresh()
  return { ok: true }
}

/**
 * Saves a library piece (apCpSave): a new one, made from a draft or from nothing, or the changes to one on file. A
 * draft is kept once: saving one already in the library changes that piece.
 */
export async function savePiece(input: { id?: string; draftId?: string; form: PieceForm }): Promise<{ ok: true; id: string; created: boolean } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const r = pieceRow(input?.form ?? ({} as PieceForm))
  if (!r.ok) return r
  const supabase = await createClient()
  const now = new Date().toISOString()
  let id = str(input?.id)
  const draftId = str(input?.draftId)
  if (id && !UUID.test(id)) return { ok: false, error: 'That piece is not on file.' }
  if (!id && draftId) {
    if (!UUID.test(draftId)) return { ok: false, error: 'That draft is not on file.' }
    const had = await supabase.from('content_pieces').select('id').eq('source_draft_id', draftId).neq('status', 'archived').limit(1)
    if (had.error) return { ok: false, error: 'Could not save: ' + had.error.message }
    id = str((had.data ?? [])[0]?.id)
  }
  if (id) {
    const up = await supabase
      .from('content_pieces')
      .update({ ...r.row, updated_at: now, updated_by: user.email })
      .eq('id', id)
      .select('id')
    if (up.error) return { ok: false, error: 'Could not save: ' + up.error.message }
    if (!(up.data ?? []).length) return { ok: false, error: 'That piece is not on file any more.' }
    refresh()
    return { ok: true, id, created: false }
  }
  let requestId: string | null = null
  if (draftId) {
    let d: Awaited<ReturnType<typeof readDraft>>
    try {
      d = await readDraft(supabase, draftId)
    } catch (e) {
      return { ok: false, error: 'Could not save: ' + msgOf(e) }
    }
    if (!d) return { ok: false, error: 'That draft is not on file any more.' }
    requestId = UUID.test(d.requestId) ? d.requestId : null
  }
  const ins = await supabase
    .from('content_pieces')
    .insert({
      ...r.row,
      source_draft_id: draftId || null,
      source_request_id: requestId,
      created_by: user.email,
      updated_by: user.email,
      created_at: now,
      updated_at: now,
    })
    .select('id')
  if (ins.error) return { ok: false, error: 'Could not save: ' + ins.error.message }
  refresh()
  return { ok: true, id: str((ins.data ?? [])[0]?.id), created: true }
}

/** Archive on a library piece (apCpArchive): it leaves the library and the Ideas tab. */
export async function archivePiece(id: string): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That piece is not on file.' }
  const supabase = await createClient()
  const up = await supabase
    .from('content_pieces')
    .update({ status: 'archived', updated_at: new Date().toISOString(), updated_by: user.email })
    .eq('id', id)
    .select('id')
  if (up.error) return { ok: false, error: 'Could not archive: ' + up.error.message }
  if (!(up.data ?? []).length) return { ok: false, error: 'That piece is not on file any more.' }
  refresh()
  return { ok: true }
}

/** Add an idea (nwIdeaSave): a thought to draft from later, with up to 8 tags. */
export async function addIdea(input: { note: string; tags: string }): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const note = str(input?.note).trim().slice(0, 1500)
  if (!note) return { ok: false, error: 'Write the idea first.' }
  const supabase = await createClient()
  const { error } = await supabase.from('idea_notes').insert({ note, tags: noteTags(str(input?.tags)), status: 'open', created_by: user.email })
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  refresh()
  return { ok: true }
}

/** Delete an idea (nwIdeaDel). */
export async function deleteIdea(id: string): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That idea is not on file.' }
  const supabase = await createClient()
  const del = await supabase.from('idea_notes').delete().eq('id', id).select('id')
  if (del.error) return { ok: false, error: 'Could not delete: ' + del.error.message }
  if (!(del.data ?? []).length) {
    refresh()
    return { ok: false, error: 'That idea is not on file any more.' }
  }
  refresh()
  return { ok: true }
}
