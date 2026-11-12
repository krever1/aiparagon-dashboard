'use server'

import { refresh } from 'next/cache'
import { type CurrentUser, getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { type Key, parseKey } from '@/lib/touchpoint/approvals'

// What Approvals saves, as the signed-in teammate (nwApproveOne, nwUndo, nwReplyAct, apSetDraft, apResolveComment): a
// brief's decision in agent_feedback (brief_approval), an ad image's decision (ad_image_variant, by its file, which
// Marketing Generation and Landing pages count), a reply's status in engagement_drafts with its row in agent_feedback
// (engagement_draft), which AI settings lists and the Intel Tracker learns from once a reason is a rule, and a
// comment resolved (dashboard_comments, with who resolved it).

const SIGNED_OUT = 'You are signed out. Sign in again.'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Supa = Awaited<ReturnType<typeof createClient>>

export type Approved = { ok: true; done: string[] } | { ok: false; done: string[]; error: string }
export type Done = { ok: true } | { ok: false; error: string }

async function feedback(supabase: Supa, row: Record<string, unknown>) {
  const { error } = await supabase.from('agent_feedback').insert(row)
  if (error) throw new Error(error.message)
}

async function setReply(supabase: Supa, id: string, status: 'approved' | 'rejected' | 'pending') {
  const { data, error } = await supabase.from('engagement_drafts').update({ status }).eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('that reply is gone')
}

/** A comment resolved, or open again; who resolved it by name, as the document's comments say it. */
async function setComment(supabase: Supa, id: string, resolved: boolean, by: string) {
  const { data, error } = await supabase
    .from('dashboard_comments')
    .update({ resolved, resolved_by: resolved ? by : null })
    .eq('id', id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('that comment is gone')
}

async function approveOne(supabase: Supa, k: Key, user: CurrentUser) {
  const by = user.email
  if (k.kind === 'comment') return setComment(supabase, k.id, true, user.name || by)
  if (k.kind === 'brief') {
    await feedback(supabase, { agent: k.agent, target_type: 'brief_approval', target_id: k.runId, action: 'approved', feedback: 'Approved in Approvals', author: by })
    return
  }
  if (k.kind === 'ad') {
    await feedback(supabase, { agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: k.file, action: 'approved', feedback: 'Approved in Approvals', author: by })
    return
  }
  await setReply(supabase, k.id, 'approved')
  await feedback(supabase, { agent: 'intel_tracker', target_type: 'engagement_draft', target_id: k.id, action: 'approved', feedback: 'Reviewed on the dashboard', author: by })
}

/** Approve, one at a time; the first that fails stops the rest, as in the current dashboard. */
export async function approveItems(keys: string[]): Promise<Approved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, done: [], error: SIGNED_OUT }
  const list = (Array.isArray(keys) ? keys : []).slice(0, 200).map(str)
  const supabase = await createClient()
  const done: string[] = []
  for (const key of list) {
    const k = parseKey(key)
    if (!k) return finish({ ok: false, done, error: 'that is not something to approve' })
    try {
      await approveOne(supabase, k, user)
      done.push(key)
    } catch (e) {
      return finish({ ok: false, done, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return finish({ ok: true, done })
}

function finish<T>(r: T): T {
  refresh()
  return r
}

/** Undo: each comes back to waiting, with a row saying so ("Undone in Approvals"). */
export async function undoItems(keys: string[]): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const failed: string[] = []
  for (const key of (Array.isArray(keys) ? keys : []).slice(0, 200).map(str)) {
    const k = parseKey(key)
    if (!k) continue
    try {
      if (k.kind === 'brief') {
        await feedback(supabase, { agent: k.agent, target_type: 'brief_approval', target_id: k.runId, action: 'reopened', feedback: 'Undone in Approvals', author: user.email })
      } else if (k.kind === 'ad') {
        await feedback(supabase, { agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: k.file, action: 'reopened', feedback: 'Undone in Approvals', author: user.email })
      } else if (k.kind === 'comment') {
        await setComment(supabase, k.id, false, '')
      } else {
        await setReply(supabase, k.id, 'pending')
        await feedback(supabase, { agent: 'intel_tracker', target_type: 'engagement_draft', target_id: k.id, action: 'reopened', feedback: 'Undone in Approvals', author: user.email })
      }
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e))
    }
  }
  return finish(failed.length ? { ok: false, error: failed[0] } : { ok: true })
}

/** Approve from the reply's window: the text as edited there is saved first, when it changed and is not empty. */
export async function approveReply(id: string, text: string): Promise<Approved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, done: [], error: SIGNED_OUT }
  const k = parseKey('reply:' + str(id))
  if (!k || k.kind !== 'reply') return { ok: false, done: [], error: 'that is not a reply' }
  const supabase = await createClient()
  const t = str(text).trim().slice(0, 5000)
  if (t) {
    const cur = await supabase.from('engagement_drafts').select('draft').eq('id', k.id).maybeSingle()
    if (cur.error || !cur.data) return { ok: false, done: [], error: 'Could not save your edit: ' + (cur.error?.message || 'that reply is gone') }
    if (str(cur.data.draft).trim() !== t) {
      const up = await supabase.from('engagement_drafts').update({ draft: t }).eq('id', k.id)
      if (up.error) return { ok: false, done: [], error: 'Could not save your edit: ' + up.error.message }
    }
  }
  try {
    await approveOne(supabase, k, user)
  } catch (e) {
    return finish({ ok: false, done: [], error: 'Could not approve that: ' + (e instanceof Error ? e.message : String(e)) })
  }
  return finish({ ok: true, done: ['reply:' + k.id] })
}

/** Reject a reply, with the reason the team gave (or none). */
export async function rejectReply(id: string, reason: string): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const k = parseKey('reply:' + str(id))
  if (!k || k.kind !== 'reply') return { ok: false, error: 'that is not a reply' }
  const supabase = await createClient()
  try {
    await setReply(supabase, k.id, 'rejected')
    await feedback(supabase, {
      agent: 'intel_tracker',
      target_type: 'engagement_draft',
      target_id: k.id,
      action: 'rejected',
      feedback: str(reason).trim().slice(0, 600) || 'Reviewed on the dashboard',
      author: user.email,
    })
  } catch (e) {
    return finish({ ok: false, error: 'Could not save that: ' + (e instanceof Error ? e.message : String(e)) })
  }
  return finish({ ok: true })
}
