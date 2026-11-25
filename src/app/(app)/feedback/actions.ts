'use server'

import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { type FbAnchor, type FbRow, normRow } from '@/lib/touchpoint/feedback'

// Feedback pins (v144FbSave, v144FbResolve), as the signed-in teammate: a new note on a spot of a page, and a note
// resolved (who resolved it by name, as Approvals does). The notes are read through GET /api/feedback (feedback-load.ts):
// a server action on every page load would hold up the page's own navigations until it answered.

const SIGNED_OUT = 'You are signed out. Sign in again.'
const KEY = /^fb:[a-z0-9]{2,30}(:[^\s:@]+@[^\s:@]+\.[^\s:@]+)?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'

type Res<T> = ({ ok: true } & T) | { ok: false; error: string }

/** A note on a spot of a page, for the team. */
export async function saveFeedback(input: { key: string; body: string; anchor: FbAnchor }): Promise<Res<{ row: FbRow }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const key = str(input?.key)
  if (!KEY.test(key)) return { ok: false, error: 'That is not a page.' }
  const body = str(input?.body).trim().slice(0, 1500)
  if (body.length < 3) return { ok: false, error: 'Say what should change.' }
  const a = input?.anchor ?? {}
  const unit = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0))
  const anchor = { sel: str(a.sel).slice(0, 2000), label: str(a.label).slice(0, 90), x: unit(a.x), y: unit(a.y) }
  const { data, error } = await (await createClient())
    .from('dashboard_comments')
    .insert({ target_key: key, author: user.email, body, anchor_text: JSON.stringify(anchor) })
    .select('id,target_key,author,body,created_at,resolved,resolved_by,anchor_text')
  if (error) return { ok: false, error: msgOf(error.message) }
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  return { ok: true, row: normRow(row ?? { target_key: key, author: user.email, body, anchor_text: JSON.stringify(anchor), created_at: new Date().toISOString() }) }
}

/** A note resolved; who resolved it by name. */
export async function resolveFeedback(id: string): Promise<Res<object>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That note is gone.' }
  const { data, error } = await (await createClient())
    .from('dashboard_comments')
    .update({ resolved: true, resolved_by: user.name || user.email })
    .eq('id', str(id))
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'that note is gone' }
  return { ok: true }
}
