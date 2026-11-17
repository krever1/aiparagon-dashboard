'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { NOT_SET_UP, SUPABASE_ANON_KEY, SUPABASE_URL, TEAM_EMAIL_DOMAIN, isTeamEmail, supabaseConfigured } from '@/lib/config'
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

/** Where the reset email's link comes back to: this app's Set a new password page, on the address the request came
 * from (production, a preview or a local copy). Supabase sends the link there only when the address is in the
 * project's Redirect URLs; otherwise it falls back to the Site URL. */
async function resetUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  const proto = (h.get('x-forwarded-proto') || 'https').split(',')[0].trim()
  let origin = h.get('origin') || (host ? proto + '://' + host : '')
  try {
    const u = new URL(origin)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    origin = u.protocol === 'https:' || local ? u.origin : ''
  } catch {
    origin = ''
  }
  return (origin || 'https://aiparagon-dashboard.vercel.app') + '/auth/reset'
}

/**
 * Asks Supabase for the reset email. Sent straight to Supabase Auth rather than through the client library, which
 * would ask for a link that only works in the browser that asked for it (PKCE). This link works on any device, the
 * same kind of link the current dashboard asks for, and /auth/reset reads it.
 */
async function sendRecoveryEmail(email: string, redirectTo: string) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('recover ' + res.status)
}

export async function sendReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData)
  if (!email) return { error: 'Enter your email first, then press this again.' }
  const sent = { ok: 'If that address has an account, a reset link is on its way.', email }
  if (!isTeamEmail(email) || !supabaseConfigured()) return sent
  try {
    await sendRecoveryEmail(email, await resetUrl())
  } catch {
    // Same answer either way, so nobody learns which addresses have accounts.
  }
  return sent
}
