// What the Catalyst pages draw for each lead, worked out on the server from the rows (see load.ts) and handed to the
// browser. Plain data, no secrets beyond what a teammate already sees.

import type { MeetingType, StageRec } from './setup'
import { CLIENT_STAGES, type Stage, type StageNames, fitTone } from './stages'

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
  /** e1_leads.stage, when the team moved the lead (and the stage is on the board) */
  stored: string | null
  /** the furthest stage on the board with a document */
  derived: string
  /** each board stage's document: its created_at in ms (0 for a link saved on the lead) */
  docs: Partial<Record<string, number>>
  /** documents the lead has (the follow-up guide included) */
  docCount: number
  /** whether the agents saved a Google Doc of the prospect brief, the consultation guide and the assessment (what the
   * later stages work from) */
  ids: { research: boolean; interview: boolean; anonymized: boolean }
  /** a run in progress: the stage it writes and when it started */
  run: { s: string; t0: string } | null
  anonEmail: string
  anonCompany: string
  /** lowercase name, company and email, for the search box */
  search: string
}

export type PipelineData = {
  leads: LeadView[]
  names: StageNames
  /** the board's columns: the team's client stages (v145) */
  stages: Stage[]
  /** the meeting types, hidden ones too */
  types: MeetingType[]
  /** each client stage's setup, removed ones too (Edit stages) */
  recs: StageRec[]
  /** a read that failed, in words */
  error: string | null
}

/** Where a lead sits on the board: the stage of a run in progress, else where the team moved it, else the furthest
 * stage with a document. */
export function viewStage(l: Pick<LeadView, 'stored' | 'derived' | 'run'>): string {
  return l.run?.s ?? l.stored ?? l.derived
}

export function hasDoc(l: Pick<LeadView, 'docs'>, s: string): boolean {
  return l.docs[s] !== undefined
}

/** A lead Approvals lists (v143LdItems): not a weak fit, nothing being written for it, not the anonymizer's placeholder.
 * It waits on its own stage's document ("Next: …") until that is written, then for a read ("Ready for review: …"). */
export function inApprovals(l: Pick<LeadView, 'fit' | 'run' | 'email'>): boolean {
  return !!l.email && !/deltaadvisory\.com$/i.test(l.email) && fitTone(l.fit) !== 'bad' && !l.run
}

/** Waiting on its own stage's document (Approvals' "Next: …", Today's Catalyst line). */
export function waitsOnStage(l: Pick<LeadView, 'fit' | 'run' | 'email' | 'stored' | 'derived' | 'docs'>): boolean {
  return inApprovals(l) && !hasDoc(l, viewStage(l))
}

export function countByStage(leads: LeadView[], stages: readonly Pick<Stage, 'key'>[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(stages.map((s) => [s.key, 0]))
  for (const l of leads) out[viewStage(l)] = (out[viewStage(l)] ?? 0) + 1
  return out
}

/** The strip's numbers: leads, the sales stages (research to proposal), clients (onboarding and review), strong fit. */
export function stripCounts(leads: LeadView[], stages: readonly Pick<Stage, 'key'>[]) {
  const by = countByStage(leads, stages)
  const clients = CLIENT_STAGES.reduce((n, k) => n + (by[k] ?? 0), 0)
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
export type PipelineTab = 'board' | 'all' | string

export function pipelineTab(v: unknown, stages: readonly Pick<Stage, 'key'>[]): PipelineTab {
  return v === 'all' || stages.some((s) => s.key === v) ? (v as string) : 'board'
}

/** The Catalyst Overview's views (?tab= in the address): the six stages, the newest leads, the documents. */
export type OverviewTab = 'stages' | 'leads' | 'documents'

export function overviewTab(v: unknown): OverviewTab {
  return v === 'leads' || v === 'documents' ? v : 'stages'
}

/** A lead page's tabs (?tab= in the address): its documents, the meeting prep (a stage of the team's own's too), Files
 * and HubSpot. */
export const LEAD_TABS = ['research', 'consultation', 'assessment', 'followup', 'proposal', 'onboarding', 'review', 'files', 'hubspot', 'calls'] as const
export type LeadTab = (typeof LEAD_TABS)[number] | `cs-${string}`

export function leadTab(v: unknown): LeadTab | null {
  const t = String(v)
  return (LEAD_TABS as readonly string[]).includes(t) || /^cs-[a-z0-9]{1,16}$/.test(t) ? (t as LeadTab) : null
}

/** Only web addresses are linked (a saved link that is anything else is left out). */
export function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim()
  return /^https?:\/\//i.test(s) ? s : ''
}
