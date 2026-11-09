import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { leadId } from './lead-id'
import { type Lead, type LeadRow, type OutRow, buildLeads, docCount, docOf, derivedStage, leadEmails } from './leads'
import { STAGES, type StageKey, type StageNames, isStageKey, namesFromSetting } from './stages'
import type { LeadView, PipelineData } from './view'

export { findLead, leadId } from './lead-id'

// Catalyst's reads, as the signed-in teammate (the database's row rules apply). Read fresh on every visit: the current
// dashboard kept its first read for the whole session, so a lead moved elsewhere looked unmoved until a reload.

/** The documents' columns the board needs (each document's text is read only on its lead's page). */
const OUT_COLS = 'id,run_id,agent,title,created_at,data'
const DOC_AGENTS = ['lead_research', 'interview_script', 'anonymizer', 'discovery_call', 'growth_plan']

export type CatalystRows = {
  rows: LeadRow[]
  outs: OutRow[]
  names: StageNames
  error: string | null
}

export async function readCatalyst(): Promise<CatalystRows> {
  const supabase = await createClient()
  const [leads, outs, prep, names] = await Promise.all([
    supabase.from('e1_leads').select('*').order('updated_at', { ascending: false }).limit(300),
    supabase.from('agent_outputs').select(OUT_COLS).in('agent', DOC_AGENTS).order('created_at', { ascending: false }).limit(1000),
    // Onboarding plans and client review briefs (Catalyst · Meeting Prep). A failed read only hides them, as before.
    supabase.from('agent_outputs').select(OUT_COLS).eq('agent', 'meeting_prep').order('created_at', { ascending: false }).limit(300),
    supabase.from('ai_settings').select('value').eq('key', 'catalyst_stages').maybeSingle(),
  ])
  let error: string | null = null
  if (leads.error) error = 'Couldn’t load e1_leads. ' + leads.error.message
  else if (outs.error) error = 'Couldn’t load the documents (agent_outputs). ' + outs.error.message
  return {
    rows: (leads.data ?? []) as LeadRow[],
    outs: [...((outs.data ?? []) as OutRow[]), ...((prep.data ?? []) as OutRow[])],
    names: names.error ? {} : namesFromSetting(names.data?.value),
    error,
  }
}

export function toView(lead: Lead, outs: OutRow[]): LeadView {
  const docs: Partial<Record<StageKey, number>> = {}
  for (const s of STAGES) {
    const d = docOf(lead, s, outs)
    if (d) docs[s.key] = d.at
  }
  const name = String(lead.prospect_name ?? '').trim()
  const company = String(lead.company_name ?? '').trim()
  return {
    id: leadId(lead),
    name: name || lead.email,
    email: lead.email,
    emails: leadEmails(lead),
    company,
    firmType: String(lead.firm_type ?? '').trim(),
    title: String(lead.prospect_title ?? '').trim(),
    fit: String(lead.fit_rating ?? '').trim(),
    updatedAt: lead.updated_at || lead.created_at || null,
    stored: isStageKey(lead.stage) ? lead.stage : null,
    derived: derivedStage(lead, outs),
    docs,
    docCount: docCount(lead, outs),
    anonEmail: lead.anonEmail ?? '',
    anonCompany: lead.anonCompany ?? '',
    search: [name, company, lead.email].join(' ').toLowerCase(),
  }
}

/** Every lead, as the board, the list and the Overview draw them. */
export async function loadPipeline(): Promise<PipelineData> {
  const read = await readCatalyst()
  const { leads, outs } = buildLeads(read.rows, read.outs)
  return { leads: leads.map((l) => toView(l, outs)), names: read.names, error: read.error }
}
