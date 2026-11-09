import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Ends this browser's session only (other devices, and the current dashboard, stay signed in) and opens sign-in. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
