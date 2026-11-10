// What the Catalyst pages draw for each lead, worked out on the server from the rows (see load.ts) and handed to the
// browser. Plain data, no secrets beyond what a teammate already sees.

import { CLIENT_STAGES, STAGES, type StageKey, type StageNames, fitTone, isStageKey } from './stages'

export type LeadView = {
  /** the lead's address word: /lead-pipeline/<id> */
  id: string
  /** prospect_name, or the email when there is no name */
  name: string
  email: string
  emails: string[]
  company: string
  /** e1_leads.firm_type as saved (ria, bd, ...) */
  firmType: string
  title: string
  fit: string
  updatedAt: string | null
  /** e1_leads.stage, when the team moved the lead */
  stored: StageKey | null
  /** the furthest stage with a document */
  derived: StageKey
  /** each stage's document: its created_at in ms (0 for a link saved on the lead) */
  docs: Partial<Record<StageKey, number>>
  /** documents the lead has (the follow-up guide included) */
  docCount: number
  /** whether the agents saved a Google Doc of the prospect brief, the consultation guide and the assessment (what the
   * later stages work from) */
  ids: { research: boolean; interview: boolean; anonymized: boolean }
  /** a run in progress: the stage it writes and when it started */
  run: { s: StageKey; t0: string } | null
  anonEmail: string
  anonCompany: string
  /** lowercase name, company and email, for the search box */
  search: string
}

export type PipelineData = {
  leads: LeadView[]
  names: StageNames
  /** a read that failed, in words */
  error: string | null
}

/** Where a lead sits on the board: the stage of a run in progress, else where the team moved it, else the furthest
 * stage with a document. */
export function viewStage(l: Pick<LeadView, 'stored' | 'derived' | 'run'>): StageKey {
  return l.run?.s ?? l.stored ?? l.derived
}

export function hasDoc(l: Pick<LeadView, 'docs'>, s: StageKey): boolean {
  return l.docs[s] !== undefined
}

export function countByStage(leads: LeadView[]): Record<StageKey, number> {
  const out = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<StageKey, number>
  for (const l of leads) out[viewStage(l)]++
  return out
}

/** The strip's numbers: leads, the sales stages (research to proposal), clients (onboarding and review), strong fit. */
export function stripCounts(leads: LeadView[]) {
  const by = countByStage(leads)
  const clients = CLIENT_STAGES.reduce((n, k) => n + by[k], 0)
  return {
    leads: leads.length,
    sales: leads.length - clients,
    clients,
    strong: leads.filter((l) => fitTone(l.fit) === 'good').length,
    by,
  }
}

export function matchesSearch(l: Pick<LeadView, 'search'>, q: string): boolean {
  const t = q.trim().toLowerCase()
  return !t || l.search.includes(t)
}

export function leadHref(id: string, tab?: string): string {
  return '/lead-pipeline/' + encodeURIComponent(id) + (tab ? '?tab=' + encodeURIComponent(tab) : '')
}

/** The Lead pipeline's views: the board, the whole list, or one stage's list (?tab= in the address). */
export type PipelineTab = 'board' | 'all' | StageKey

export function pipelineTab(v: unknown): PipelineTab {
  return v === 'all' || isStageKey(v) ? v : 'board'
}

/** The Catalyst Overview's views (?tab= in the address): the six stages, the newest leads, the documents. */
export type OverviewTab = 'stages' | 'leads' | 'documents'

export function overviewTab(v: unknown): OverviewTab {
  return v === 'leads' || v === 'documents' ? v : 'stages'
}

/** A lead page's tabs (?tab= in the address): its documents, the meeting prep, Files and HubSpot. */
export const LEAD_TABS = ['research', 'consultation', 'assessment', 'followup', 'proposal', 'onboarding', 'review', 'files', 'hubspot', 'calls'] as const
export type LeadTab = (typeof LEAD_TABS)[number]

export function leadTab(v: unknown): LeadTab | null {
  return (LEAD_TABS as readonly string[]).includes(String(v)) ? (v as LeadTab) : null
}

/** Only web addresses are linked (a saved link that is anything else is left out). */
export function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim()
  return /^https?:\/\//i.test(s) ? s : ''
}
