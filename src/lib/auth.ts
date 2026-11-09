import 'server-only'
import { connection } from 'next/server'
import { isTeamEmail } from '@/lib/config'
import { createClient } from '@/lib/supabase/server'

export type CurrentUser = {
  id: string
  email: string
  name: string
}

/**
 * The signed-in teammate, checked with Supabase Auth, or null. Reads the session cookie, so call it inside a
 * <Suspense> boundary (Cache Components). Use it in every Server Component, Server Action and Route Handler that
 * reads or writes data: the proxy's redirect is the first check, not the only one.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Only on a real request: the check asks Supabase Auth and reads the clock (token expiry), which must not run
  // while Next.js prerenders or prefetches.
  await connection()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isTeamEmail(user.email)) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const email = String(user.email)
  const name = String(meta.display_name || meta.full_name || meta.name || email.split('@')[0])
  return { id: user.id, email, name }
}
