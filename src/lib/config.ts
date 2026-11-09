// Settings read from the environment. NEXT_PUBLIC_ values are built into the page; nothing secret goes in them.
// Set them in Vercel (Project, Settings, Environment Variables) and in .env.local for local work (see .env.example).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/** The current dashboard, where pages that are not ported yet still live. */
export const LEGACY_DASHBOARD_URL = (process.env.NEXT_PUBLIC_LEGACY_DASHBOARD_URL || 'https://aiparagon.vercel.app/dashboard').replace(/\/+$/, '')

/** Only accounts at this domain may use the dashboard (the same rule as the current dashboard and the n8n webhooks). */
export const TEAM_EMAIL_DOMAIN = (process.env.NEXT_PUBLIC_TEAM_EMAIL_DOMAIN || 'aiparagonconsulting.com').toLowerCase()

/** The AI Paragon logo stays on the company site (every app links it as its icon). */
export const LOGO_URL = 'https://www.aiparagonconsulting.com/logo.png'

export function isTeamEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim().toLowerCase()
  return e.endsWith('@' + TEAM_EMAIL_DOMAIN) && e.length > TEAM_EMAIL_DOMAIN.length + 1
}

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}
