'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
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
