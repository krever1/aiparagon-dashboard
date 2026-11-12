'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { cleanLayout } from '@/lib/pipeline/briefs'
import { json } from '@/lib/pipeline/intel'
import { createClient } from '@/lib/supabase/server'

// What the briefs page saves, as the signed-in teammate: a decision on a brief (apCfApprove), Approve or Request
// changes with the reason, in agent_feedback as brief_approval, the same rows Approvals writes and AI settings reads.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const SIGNED_OUT = 'You are signed out. Sign in again.'

export type Decided = { ok: true; toast: string } | { ok: false; error: string }

const AGENT = { organic: 'intel_tracker', ads: 'ad_strategist', creative: 'content_generation' } as const

/** Approve a brief, or ask for changes with what should change. */
export async function decideBrief(input: { kind: string; id: string; action: string; reason?: string }): Promise<Decided> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const kind = input?.kind === 'ads' ? 'ads' : input?.kind === 'creative' ? 'creative' : input?.kind === 'organic' ? 'organic' : null
  const id = str(input?.id)
  const action = input?.action === 'changes' ? 'changes' : input?.action === 'approved' ? 'approved' : null
  const okId = kind === 'creative' ? /^content:[0-9a-f-]{36}$/i.test(id) : /^[\w.:-]{1,120}$/.test(id)
  if (!kind || !action || !okId) return { ok: false, error: 'That is not a brief.' }
  const reason = str(input?.reason).replace(/\s+/g, ' ').trim().slice(0, 1000)
  if (action === 'changes' && !reason) return { ok: false, error: 'Say what should change.' }
  const supabase = await createClient()
  const { error } = await supabase.from('agent_feedback').insert({
    agent: AGENT[kind],
    target_type: 'brief_approval',
    target_id: id,
    action,
    feedback: action === 'changes' ? reason : null,
    author: user.email,
  })
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  refresh()
  return {
    ok: true,
    toast: action === 'approved' ? 'Brief approved. Drafts use approved briefs first.' : 'Saved. It shows on AI settings, where it can become a rule.',
  }
}

/**
 * The team's layout for a kind of brief (v111StSave): read the saved layouts afresh, put this kind's in, keep the
 * other's as it is, and save them for the whole team (ai_settings brief_structure).
 */
export async function saveLayout(input: { kind: string; layout: unknown }): Promise<Decided> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const kind = input?.kind === 'ads' ? 'ads' : input?.kind === 'org' ? 'org' : null
  if (!kind) return { ok: false, error: 'That is not a kind of brief.' }
  const layout = cleanLayout(kind, input?.layout)
  const supabase = await createClient()
  const { data, error } = await supabase.from('ai_settings').select('value').eq('key', 'brief_structure').maybeSingle()
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  const at = new Date().toISOString()
  const value = { ...json(data?.value), [kind]: layout, updated_by: user.email, updated_at: at }
  const { error: e2 } = await supabase.from('ai_settings').upsert({ key: 'brief_structure', value, updated_by: user.email, updated_at: at }, { onConflict: 'key' })
  if (e2) return { ok: false, error: 'Could not save: ' + e2.message }
  refresh()
  return { ok: true, toast: 'Layout saved. Every brief follows it.' }
}
