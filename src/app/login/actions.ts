'use server'

import { redirect } from 'next/navigation'
import { NOT_SET_UP, TEAM_EMAIL_DOMAIN, isTeamEmail, supabaseConfigured } from '@/lib/config'
import { safeNext } from '@/lib/nav'
import { createClient } from '@/lib/supabase/server'

export type AuthState = { error?: string; ok?: string; email?: string }

const ONLY_TEAM = `Accounts are limited to @${TEAM_EMAIL_DOMAIN} addresses.`

function readEmail(formData: FormData) {
  return String(formData.get('email') ?? '').trim().toLowerCase()
}

/** The words the current dashboard uses for the same Supabase errors. */
function friendly(message: string): string {
  if (/invalid login|invalid_credentials/i.test(message)) return 'That email or password is not right.'
  if (/not confirmed/i.test(message)) return 'Confirm your email first. Check your inbox for the link.'
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(message)) return 'Could not reach the sign-in service. Try again in a minute.'
  return 'That did not work. Try again in a minute.'
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData)
  const password = String(formData.get('password') ?? '')
  const next = safeNext(String(formData.get('next') ?? ''))
  if (!email || !password) return { error: 'Enter your email and password.', email }
  if (!isTeamEmail(email)) return { error: ONLY_TEAM, email }
  if (!supabaseConfigured()) return { error: NOT_SET_UP, email }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: friendly(error.message), email }
  redirect(next)
}

export async function sendReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData)
  if (!email) return { error: 'Enter your email first, then press this again.' }
  const sent = { ok: 'If that address has an account, a reset link is on its way.', email }
  if (!isTeamEmail(email) || !supabaseConfigured()) return sent
  try {
    const supabase = await createClient()
    // The link opens the current dashboard (the project's Site URL), which sets the new password for both apps.
    await supabase.auth.resetPasswordForEmail(email)
  } catch {
    // Same answer either way, so nobody learns which addresses have accounts.
  }
  return sent
}
