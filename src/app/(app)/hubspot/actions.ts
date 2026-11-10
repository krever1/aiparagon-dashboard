'use server'

import { getCurrentUser } from '@/lib/auth'
import { type FollowInput, followFields, followedText } from '@/lib/catalyst/follow'
import { createClient } from '@/lib/supabase/server'

export type FollowResult = { ok: true; message: string } | { ok: false; error: string }

/**
 * Follow this company: it goes on the watchlist (competitors) as the signed-in teammate, unless a company of that
 * name is on it already. The Intel Tracker reads its posts on its next run, and the Ad Strategist its Meta ads.
 */
export async function followCompany(input: FollowInput): Promise<FollowResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again to follow a company.' }
  const f = followFields(input)
  if ('error' in f) return { ok: false, error: f.error }
  const supabase = await createClient()
  const have = await supabase.from('competitors').select('name').limit(500)
  if (have.error) return { ok: false, error: 'Could not add: ' + have.error.message }
  if ((have.data ?? []).some((c) => String(c.name ?? '').trim().toLowerCase() === f.name.toLowerCase())) {
    return { ok: false, error: f.name + ' is already on the watchlist.' }
  }
  const { error } = await supabase.from('competitors').insert({
    name: f.name,
    website: f.website || null,
    handle_x: f.x || null,
    handle_linkedin: f.li || null,
    meta_page_id: f.meta || null,
    category: 'ads_strategist',
    priority: f.priority,
    notes: f.notes || null,
    added_by: user.email,
  })
  if (error) return { ok: false, error: 'Could not add: ' + error.message }
  return { ok: true, message: followedText(f) }
}
