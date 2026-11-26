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
  const g = await gather(supabase, asLead(c), stageOfKey('research'), false)
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
      await recordRun(supabase, lead, outs, st, user.email)
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

// ---------- a new contact on a call (v144AskClient, v144ClientGo) ----------

const BAD_NAME = /[<>{}[\]\\]/
const tidy = (v: unknown, max: number) => str(v).replace(/\s+/g, ' ').trim().slice(0, max)

/** The call's details as the team keeps them (call_meta): changed, or made when the call has none. */
async function saveCallMeta(supabase: Supa, id: string, patch: Record<string, unknown>, by: string) {
  const now = new Date().toISOString()
  const body = { ...patch, updated_at: now, updated_by: by }
  const { data, error } = await supabase.from('call_meta').update(body).eq('call_id', id).select('call_id')
  if (error) throw new Error(error.message)
  if (!data?.length) {
    const ins = await supabase.from('call_meta').insert({ call_id: id, created_at: now, ...body })
    if (ins.error) throw new Error(ins.error.message)
  }
}

export type ClientInput = {
  callId: string
  action: 'skip' | 'file' | 'add'
  name: string
  email: string
  company: string
  folder: string
  /** write the pre-meeting prospect brief now */
  run: boolean
}

/**
 * The answer to a new contact on a call, as the signed-in teammate: Not a client sets the call aside for the team
 * (ai_settings catalyst_inbox.calls), Just file the call sets its folder, Create client record adds the lead in
 * Prospect research (lead_source Call) and files the call under it, and runs the prospect brief if asked. A folder the
 * team does not have yet goes in call_folders.
 */
export async function answerClient(input: ClientInput): Promise<GoResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.callId)
  if (!/^[\w-]{1,80}$/.test(id)) return { ok: false, error: 'That is not a Fathom call.' }
  const action = input?.action === 'skip' || input?.action === 'file' ? input.action : 'add'
  const supabase = await createClient()

  if (action === 'skip') {
    try {
      const cur = await readSetting(supabase, 'catalyst_inbox')
      const obj = cur && typeof cur === 'object' && !Array.isArray(cur) ? (cur as Record<string, unknown>) : {}
      const calls = { ...((obj.calls && typeof obj.calls === 'object' ? obj.calls : {}) as Record<string, unknown>), [id]: { by: user.email, at: new Date().toISOString() } }
      const { error } = await supabase
        .from('ai_settings')
        .upsert({ key: 'catalyst_inbox', value: { ...obj, calls }, updated_by: user.email, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    } catch (e) {
      return { ok: false, error: 'Could not save it: ' + msgOf(e) }
    }
    refresh()
    return { ok: true, toast: 'Set aside. The call stays on Calls.' }
  }

  const name = tidy(input?.name, 200)
  const email = tidy(input?.email, 200).toLowerCase()
  const company = tidy(input?.company, 200)
  const folder = tidy(input?.folder, 80)
  if (folder.length < 2 || BAD_NAME.test(folder)) return { ok: false, error: 'Give the client folder a name, two letters or more, in letters, numbers and spaces.' }
  if (action === 'add') {
    if (!name) return { ok: false, error: 'Add the client’s name.' }
    if (!EMAIL.test(email)) return { ok: false, error: 'Add the client’s email address. It is how the dashboard knows their calls.' }
  }
  try {
    if (action === 'add') {
      const now = new Date().toISOString()
      const got = await supabase.from('e1_leads').select('email,stage').eq('email', email)
      if (got.error) throw new Error(got.error.message)
      const row = (got.data ?? [])[0] as { stage?: string | null } | undefined
      if (row) {
        if (!row.stage) {
          const up = await supabase.from('e1_leads').update({ stage: 'research', updated_at: now }).eq('email', email)
          if (up.error) throw new Error(up.error.message)
        }
      } else {
        const ins = await supabase
          .from('e1_leads')
          .insert({ email, prospect_name: name, company_name: company || null, lead_source: 'Call', stage: 'research', updated_at: now })
        if (ins.error) throw new Error(ins.error.message)
      }
      await saveCallMeta(supabase, id, { folder, lead_email: email, lead_stage: 'research' }, user.email)
    } else await saveCallMeta(supabase, id, { folder }, user.email)
    const cur = await readSetting(supabase, 'call_folders')
    const L = (Array.isArray(cur) ? cur : []).map(str)
    if (!L.includes(folder)) {
      const { error } = await supabase
        .from('ai_settings')
        .upsert({ key: 'call_folders', value: [...L, folder], updated_by: user.email, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    }
  } catch (e) {
    return { ok: false, error: 'Could not save it: ' + msgOf(e) + '. Try again in a minute.' }
  }

  if (action === 'add' && input?.run) {
    const read = await readCatalyst()
    const { leads, outs } = buildLeads(read.rows, read.outs)
    const lead = leads.find((l) => l.emails.map(lower).includes(email))
    try {
      if (!lead) throw new Error('the lead is not on the board yet')
      const c = await contactOf(supabase, email, email)
      const l = { ...lead, prospect_title: lead.prospect_title || c?.job_title || '', company_name: lead.company_name || c?.company || '', website: c?.website || '' }
      await startN8n(RUN_HOOKS.full, researchBody(l, 'HubSpot'))
    } catch (e) {
      refresh()
      return { ok: false, error: 'Created, but the prospect brief could not start: ' + msgOf(e) + '. Run it from the Lead pipeline.' }
    }
    try {
      await recordRun(supabase, lead, outs, stageOfKey('research'), user.email)
    } catch {
      // the run is under way; only its "Writing" line on the board is missing
    }
    refresh()
    return { ok: true, toast: 'Created. The prospect brief shows on the Lead pipeline when it is done.' }
  }
  refresh()
  return { ok: true, toast: action === 'add' ? `Created. ${name} is on the Lead pipeline, and the call is filed under ${folder}.` : 'Filed under ' + folder + '.' }
}
