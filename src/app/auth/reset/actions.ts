'use server'

import { TEAM_EMAIL_DOMAIN, isTeamEmail, supabaseConfigured } from '@/lib/config'
import { createClient } from '@/lib/supabase/server'
import { MIN_PASSWORD } from './rules'

export type ResetStart = { email?: string; error?: 'expired' | 'denied' | 'none' }
export type ResetState = { error?: string; done?: boolean }

const ONLY_TEAM = `This workspace is for the AI Paragon team. Reset the password of your @${TEAM_EMAIL_DOMAIN} account.`

/**
 * The reset email's link signs the person in for a short while: its tokens arrive in the address's #fragment, which
 * only the browser sees. The page hands them here, and they become this app's session cookies, so the new password can
 * be set on the server. A session that is not a team account is signed out again.
 */
export async function startReset(accessToken: string, refreshToken: string): Promise<ResetStart> {
  if (!supabaseConfigured() || !accessToken || !refreshToken) return { error: 'expired' }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error || !data.user) return { error: 'expired' }
  if (!isTeamEmail(data.user.email)) {
    await supabase.auth.signOut({ scope: 'local' })
    return { error: 'denied' }
  }
  return { email: data.user.email }
}

/** Who is signed in, when the page is opened without a link (a reload after the link, or a teammate changing theirs). */
export async function resetWho(): Promise<ResetStart> {
  if (!supabaseConfigured()) return { error: 'none' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'none' }
  if (!isTeamEmail(user.email)) return { error: 'denied' }
  return { email: user.email }
}

export async function setPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get('password') ?? '')
  const again = String(formData.get('again') ?? '')
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` }
  if (password !== again) return { error: 'The two passwords are not the same.' }
  if (!supabaseConfigured()) return { error: 'That did not work. Try again in a minute.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your reset link has run out. Ask for a new one on the sign-in page.' }
  if (!isTeamEmail(user.email)) return { error: ONLY_TEAM }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    const code = (error as { code?: string }).code || ''
    if (code === 'same_password' || /different from the old/i.test(error.message)) return { error: 'That is your current password. Choose a new one.' }
    if (code === 'weak_password' || /password should/i.test(error.message)) return { error: error.message.replace(/\.?$/, '.') }
    if (code === 'reauthentication_needed') return { error: 'Supabase asks you to sign in again first. Ask for a new reset link on the sign-in page.' }
    if (/session|jwt|expired/i.test(error.message)) return { error: 'Your reset link has run out. Ask for a new one on the sign-in page.' }
    return { error: 'That did not work. Try again in a minute.' }
  }
  return { done: true }
}
