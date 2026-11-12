import 'server-only'
import { cache } from 'react'
import { leadId } from '@/lib/catalyst/lead-id'
import { createClient } from '@/lib/supabase/server'
import { json } from './intel'
import { type Page, type Signup, type View, pageOf } from './landing'

// The Landing pages page's data, read as the signed-in teammate on every visit (v115LpLoad): the pages, the newest
// sign-ups and the visits of the last 30 days. A sign-up's own answers, referrer and address hash are never read.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
type Row = Record<string, unknown>
const rowsOf = (r: { data: unknown }): Row[] => (Array.isArray(r.data) ? (r.data as Row[]) : [])

export type LandingData = {
  pages: Page[]
  su: Signup[]
  views: View[]
  error: string | null
  now: number
}

const SU_COLS = 'id,page_id,slug,name,email,company,job_title,phone,ad_code,utm,hubspot_id,hubspot_error,lead_added,created_at'

/** A sign-up as the page shows it; one added to the pipeline links to its lead's page here. */
export function signupOf(r: Row): Signup {
  const u = json(r.utm)
  const email = str(r.email)
  const name = str(r.name)
  const leadAdded = r.lead_added === true
  return {
    id: str(r.id),
    pageId: str(r.page_id),
    slug: str(r.slug),
    name,
    email,
    company: str(r.company),
    jobTitle: str(r.job_title),
    phone: str(r.phone),
    code: str(r.ad_code),
    utm: { source: str(u.source), medium: str(u.medium), campaign: str(u.campaign) },
    hubspotId: str(r.hubspot_id),
    hubspotError: str(r.hubspot_error),
    leadAdded,
    createdAt: str(r.created_at),
    leadHref: leadAdded && email ? '/lead-pipeline/' + leadId({ prospect_name: name, email }) : '',
  }
}

export async function loadLanding(now = Date.now()): Promise<LandingData> {
  const supabase = await createClient()
  const since = new Date(now - 30 * 864e5).toISOString().slice(0, 10)
  const [pg, su, vw] = await Promise.all([
    supabase.from('landing_pages').select('*').order('updated_at', { ascending: false }).limit(200),
    supabase.from('lp_signups').select(SU_COLS).order('created_at', { ascending: false }).limit(1000),
    supabase.from('lp_views').select('page_id,day,ad_code,views').gte('day', since).limit(5000),
  ])
  const errors = [pg.error, su.error, vw.error].filter(Boolean).map((e) => e!.message)
  return {
    pages: rowsOf(pg).map(pageOf),
    su: rowsOf(su).map(signupOf),
    views: rowsOf(vw).map((v) => ({ pageId: str(v.page_id), day: str(v.day), code: str(v.ad_code), views: Number(v.views) || 0 })),
    error: errors.length ? errors.join('; ') : null,
    now,
  }
}

export type PreviewData = { page: Page | null; brand: string; error: string | null }

/**
 * A page drawn here for its preview (any status), read as the teammate, with the brand the public page shows: the
 * newest company profile's name (lp_public), else AI Paragon's. Read once per request (the page and its title).
 */
export const loadPreview = cache(async (id: string): Promise<PreviewData> => {
  const supabase = await createClient()
  const ok = /^[\w-]{1,64}$/.test(id)
  const [pg, cp] = await Promise.all([
    ok ? supabase.from('landing_pages').select('*').eq('id', id).limit(1) : Promise.resolve({ data: [], error: null }),
    supabase.from('company_profile').select('business_name').order('updated_at', { ascending: false, nullsFirst: false }).limit(1),
  ])
  const row = rowsOf(pg)[0]
  return {
    page: row ? pageOf(row) : null,
    brand: str(rowsOf(cp)[0]?.business_name).trim() || 'AI Paragon Consulting Group',
    error: pg.error ? pg.error.message : null,
  }
})
