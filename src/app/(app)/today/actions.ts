'use server'

import { refresh } from 'next/cache'
import type { GoResult, ReadsResult } from '@/app/(app)/lead-pipeline/actions'
import { getCurrentUser } from '@/lib/auth'
import { contactNameOf } from '@/lib/catalyst/inbox'
import { type Lead, buildLeads } from '@/lib/catalyst/leads'
import { readCatalyst } from '@/lib/catalyst/load'
import { RUN_HOOKS, researchBody } from '@/lib/catalyst/plan'
import { gather, readRows, readSetting, recordRun } from '@/lib/catalyst/run'
import { stageOfKey } from '@/lib/catalyst/stages'
import { startN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

// The answer to a new client from HubSpot (v137AskCrm, v137CrmGo), as the signed-in teammate: set the contact aside
// for the team, add them to the Lead pipeline in Prospect research, or add them and run the pre-meeting prospect brief.

const SIGNED_OUT = 'You are signed out. Sign in again.'
const GONE = 'This contact is not in HubSpot contacts any more.'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const lower = (v: unknown) => str(v).trim().toLowerCase()
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'

type Supa = Awaited<ReturnType<typeof createClient>>
type Contact = { email: string; first_name: string | null; last_name: string | null; company: string | null; job_title: string | null; website: string | null }

/** The contact, by its email as the sync kept it or in lower case. */
async function contactOf(supabase: Supa, email: string, raw: string): Promise<Contact | null> {
  const asked = [...new Set([raw, email].filter(Boolean))]
  const { data } = await supabase.from('hubspot_contacts').select('email,first_name,last_name,company,job_title,website').in('email', asked).limit(5)
  return ((data ?? []) as Contact[]).find((c) => lower(c.email) === email) ?? null
}

/** The contact as a lead not on the board yet, for what a prospect brief reads (its email as kept, so it is found). */
const asLead = (c: Contact): Lead => ({
  email: str(c.email).trim(),
  emails: [str(c.email).trim()],
  prospect_name: contactNameOf(c),
  prospect_title: c.job_title,
  company_name: c.company,
})

/** What the prospect brief would read for this contact: the template in use, the CRM record and what it always reads. */
export async function crmReads(email: string, raw = ''): Promise<ReadsResult> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const e = lower(email)
  if (!EMAIL.test(e)) return { ok: false, error: 'That is not an email.' }
  const supabase = await createClient()
  const c = await contactOf(supabase, e, str(raw).trim())
  if (!c) return { ok: false, error: GONE }
  const g = await gather(supabase, asLead(c), 'research', false)
  return { ok: true, rows: readRows(g), found: { calls: 0, emails: 0 } }
}

/** Set aside for the whole team (ai_settings `catalyst_inbox`, {crm: {email: {by, at}}}); the other keys stay. */
async function setAside(supabase: Supa, email: string, by: string) {
  const cur = await readSetting(supabase, 'catalyst_inbox')
  const obj = cur && typeof cur === 'object' && !Array.isArray(cur) ? (cur as Record<string, unknown>) : {}
  const crm = { ...((obj.crm && typeof obj.crm === 'object' ? obj.crm : {}) as Record<string, unknown>), [email]: { by, at: new Date().toISOString() } }
  const { error } = await supabase
    .from('ai_settings')
    .upsert({ key: 'catalyst_inbox', value: { ...obj, crm }, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/** The lead in Prospect research, from the contact; a row that is there already keeps what it has (v137AddLead). */
async function addLead(supabase: Supa, c: Contact, email: string) {
  const now = new Date().toISOString()
  const got = await supabase.from('e1_leads').select('email,stage').eq('email', email)
  if (got.error) throw new Error(got.error.message)
  const row = (got.data ?? [])[0] as { stage?: string | null } | undefined
  if (row) {
    if (!row.stage) {
      const up = await supabase.from('e1_leads').update({ stage: 'research', updated_at: now }).eq('email', email)
      if (up.error) throw new Error(up.error.message)
    }
    return
  }
  const ins = await supabase.from('e1_leads').insert({
    email,
    prospect_name: contactNameOf(c),
    prospect_title: c.job_title || null,
    company_name: c.company || null,
    lead_source: 'HubSpot',
    stage: 'research',
    updated_at: now,
  })
  if (ins.error) throw new Error(ins.error.message)
}

export async function answerCrm(input: { email: string; raw?: string; action: 'skip' | 'add' | 'run' }): Promise<GoResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const email = lower(input?.email)
  if (!EMAIL.test(email)) return { ok: false, error: 'That is not an email.' }
  const action = input?.action === 'skip' || input?.action === 'add' ? input.action : 'run'
  const supabase = await createClient()
  const c = await contactOf(supabase, email, str(input?.raw).trim())
  if (!c) return { ok: false, error: GONE }
  const name = contactNameOf(c)

  if (action === 'skip') {
    try {
      await setAside(supabase, email, user.email)
    } catch (e) {
      return { ok: false, error: 'Could not save it: ' + msgOf(e) }
    }
    refresh()
    return { ok: true, toast: 'Set aside. ' + name + ' stays in HubSpot contacts.' }
  }

  try {
    await addLead(supabase, c, email)
  } catch (e) {
    return { ok: false, error: 'Could not add the lead: ' + msgOf(e) }
  }
  const read = await readCatalyst()
  const st = stageOfKey('research', read.names)
  if (action === 'run') {
    const { leads, outs } = buildLeads(read.rows, read.outs)
    const lead = leads.find((l) => l.emails.map(lower).includes(email))
    try {
      if (!lead) throw new Error('the lead is not on the board yet')
      // the HubSpot title, company and website, and where the lead came from
      const l = { ...lead, prospect_title: lead.prospect_title || c.job_title || '', company_name: lead.company_name || c.company || '', website: c.website || '' }
      await startN8n(RUN_HOOKS.full, researchBody(l, 'HubSpot'))
    } catch (e) {
      refresh()
      return { ok: false, error: `Added to ${st.name}, but it could not start: ${msgOf(e)}. Run it from the Lead pipeline.` }
    }
    try {
      await recordRun(supabase, lead, outs, 'research', user.email)
    } catch {
      // the run is under way; only its "Writing" line on the board is missing
    }
  }
  refresh()
  return {
    ok: true,
    toast: action === 'run' ? 'Started. The prospect brief shows on the Lead pipeline when it is done.' : `Added to ${st.name} on the Lead pipeline.`,
  }
}
