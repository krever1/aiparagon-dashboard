import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isAnonRow } from './leads'
import { leadId } from './lead-id'
import { hsName } from './names'

// HubSpot contacts, as the current dashboard's page shows them (renderHubspot, hsRowsHtml): the synced contacts, newest
// sync first, and for each one whether it is already a lead.

export type HubspotRow = {
  email: string
  name: string
  firstName: string
  lastName: string
  company: string
  title: string
  phone: string
  website: string
  lifecycle: string
  status: string
  syncedAt: string
  /** the lead's address word when the contact's email is a lead's (an e1_leads row) */
  leadId: string | null
  search: string
}

export type HubspotData = { contacts: HubspotRow[]; lastSync: string | null; error: string }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

const COLS = 'email,first_name,last_name,company,phone,job_title,website,lifecycle_stage,lead_status,synced_at'

export async function loadHubspot(): Promise<HubspotData> {
  const supabase = await createClient()
  const [hs, leads] = await Promise.all([
    supabase.from('hubspot_contacts').select(COLS).order('synced_at', { ascending: false, nullsFirst: false }).limit(500),
    supabase.from('e1_leads').select('email,prospect_name,company_name,phone').limit(2000),
  ])
  if (hs.error) return { contacts: [], lastSync: null, error: hs.error.message }

  const ids = new Map<string, string>()
  for (const l of (leads.data ?? []) as { email: string; prospect_name: unknown; company_name: string; phone: unknown }[]) {
    const email = str(l.email).trim().toLowerCase()
    if (!email || isAnonRow(l) || ids.has(email)) continue
    ids.set(email, leadId({ email, prospect_name: str(l.prospect_name) }))
  }

  const contacts = ((hs.data ?? []) as Record<string, unknown>[]).map((c): HubspotRow => {
    const email = str(c.email).trim()
    const firstName = str(c.first_name).trim()
    const lastName = str(c.last_name).trim()
    const company = str(c.company).trim()
    const title = str(c.job_title).trim()
    return {
      email,
      name: hsName(firstName, lastName) || email,
      firstName,
      lastName,
      company,
      title,
      phone: str(c.phone).trim(),
      website: str(c.website).trim(),
      lifecycle: str(c.lifecycle_stage).trim(),
      status: str(c.lead_status).trim(),
      syncedAt: str(c.synced_at),
      leadId: ids.get(email.toLowerCase()) ?? null,
      search: [firstName, lastName, email, company, title].join(' ').toLowerCase(),
    }
  })
  const lastSync = contacts.reduce<string | null>((a, c) => (c.syncedAt && (!a || c.syncedAt > a) ? c.syncedAt : a), null)
  return { contacts, lastSync, error: '' }
}
