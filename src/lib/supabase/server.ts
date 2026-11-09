import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/config'

/**
 * A Supabase client for Server Components, Server Actions and Route Handlers, signed in as the person making the
 * request (their session is in cookies). Reads go through the database's row rules as that person, never as an
 * admin. Create one per request.
 */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, which cannot set cookies. The proxy refreshes the session on every
          // request, so this can be ignored.
        }
      },
    },
  })
}
