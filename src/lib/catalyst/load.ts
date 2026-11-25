import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { leadId } from './lead-id'
import { type Lead, type LeadRow, type OutRow, buildLeads, docCount, docIds, docOf, derivedStage, leadEmails } from './leads'
import { type RunEntry, runOf, runsFromSetting } from './plan'
import { type CatalystConfig, EMPTY_CONFIG, configFrom, meetingTypes, stageRecs, teamStages } from './setup'
import { STAGES, type Stage, type StageNames, namesFromSetting } from './stages'
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
  /** the team's meeting types and client stages (v145) */
  config: CatalystConfig
  /** the board's columns */
  stages: Stage[]
  /** runs started from the dashboard (ai_settings `catalyst_runs`) */
  runs: Record<string, RunEntry>
  error: string | null
}

export async function readCatalyst(): Promise<CatalystRows> {
  const supabase = await createClient()
  const [leads, outs, prep, settings] = await Promise.all([
    supabase.from('e1_leads').select('*').order('updated_at', { ascending: false }).limit(300),
    supabase.from('agent_outputs').select(OUT_COLS).in('agent', DOC_AGENTS).order('created_at', { ascending: false }).limit(1000),
    // Onboarding plans and client review briefs (Catalyst · Meeting Prep). A failed read only hides them, as before.
    supabase.from('agent_outputs').select(OUT_COLS).eq('agent', 'meeting_prep').order('created_at', { ascending: false }).limit(300),
    supabase
      .from('ai_settings')
      .select('key,value')
      .in('key', ['catalyst_stages', 'catalyst_runs', 'catalyst_meeting_types', 'catalyst_client_stages']),
  ])
  const setting = (key: string) => (settings.data ?? []).find((r: { key: string }) => r.key === key)?.value
  let error: string | null = null
  if (leads.error) error = 'Couldn’t load e1_leads. ' + leads.error.message
  else if (outs.error) error = 'Couldn’t load the documents (agent_outputs). ' + outs.error.message
  const names = settings.error ? {} : namesFromSetting(setting('catalyst_stages'))
  const config = settings.error ? { ...EMPTY_CONFIG, names } : configFrom(names, setting('catalyst_meeting_types'), setting('catalyst_client_stages'))
  return {
    rows: (leads.data ?? []) as LeadRow[],
    outs: [...((outs.data ?? []) as OutRow[]), ...((prep.data ?? []) as OutRow[])],
    names,
    config,
    stages: teamStages(config),
    runs: settings.error ? {} : runsFromSetting(setting('catalyst_runs')),
    error,
  }
}

export function toView(
  lead: Lead,
  outs: OutRow[],
  runs: Record<string, RunEntry> = {},
  now = Date.now(),
  stages: readonly Stage[] = STAGES,
): LeadView {
  const docs: Partial<Record<string, number>> = {}
  for (const s of stages) {
    if (!s.agent) continue
    const d = docOf(lead, s, outs)
    if (d) docs[s.key] = d.at
  }
  const name = String(lead.prospect_name ?? '').trim()
  const company = String(lead.company_name ?? '').trim()
  const ids = docIds(lead, outs)
  const emails = leadEmails(lead)
  return {
    id: leadId(lead),
    name: name || lead.email,
    email: lead.email,
    emails,
    company,
    firmType: String(lead.firm_type ?? '').trim(),
    title: String(lead.prospect_title ?? '').trim(),
    fit: String(lead.fit_rating ?? '').trim(),
    updatedAt: lead.updated_at || lead.created_at || null,
    stored: stages.some((s) => s.key === lead.stage) ? String(lead.stage) : null,
    derived: derivedStage(lead, outs, stages),
    docs,
    docCount: docCount(lead, outs),
    ids: { research: !!ids.researchDocId, interview: !!ids.interviewDocId, anonymized: !!ids.anonymizedDocId },
    run: runOf({ emails, docs }, runs, now, stages),
    anonEmail: lead.anonEmail ?? '',
    anonCompany: lead.anonCompany ?? '',
    search: [name, company, lead.email].join(' ').toLowerCase(),
  }
}

/** Every lead, as the board, the list and the Overview draw them. */
export async function loadPipeline(): Promise<PipelineData> {
  const read = await readCatalyst()
  const { leads, outs } = buildLeads(read.rows, read.outs)
  const now = Date.now()
  return {
    leads: leads.map((l) => toView(l, outs, read.runs, now, read.stages)),
    names: read.names,
    stages: read.stages,
    types: meetingTypes(read.config, true),
    recs: stageRecs(read.config, true),
    error: read.error,
  }
}
