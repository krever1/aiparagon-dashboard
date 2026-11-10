// Catalyst's leads, worked out the way the current dashboard does (mergeE1Leads, v120Relink, v136Doc, v136StageOf,
// v120Docs, v136Plan). Pure functions over the rows read from e1_leads and agent_outputs, so the pages and the tests
// share them.

import { FOLLOW_UP, STAGES, type StageKey, isStageKey } from './stages'

/** A row of e1_leads (the columns the dashboard uses). */
export type LeadRow = {
  email: string
  prospect_name?: string | null
  prospect_title?: string | null
  company_name?: string | null
  firm_type?: string | null
  firm_size?: string | null
  lead_source?: string | null
  status?: string | null
  fit_rating?: string | null
  ai_readiness?: string | null
  lead_research_url?: string | null
  interview_url?: string | null
  assessment_url?: string | null
  discovery_url?: string | null
  growth_plan_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  stage?: string | null
  /** only on rows made up from agent_outputs (a lead with documents and no e1_leads row) */
  synthesized?: boolean
}

/** A row of agent_outputs (content_md is read only on a lead's own page). */
export type OutRow = {
  id: string
  run_id: string
  agent: string
  title?: string | null
  created_at?: string | null
  data?: unknown
  content_md?: string | null
  /** the placeholder email the row was saved under, when it was linked back to its lead by name */
  held_as?: string
}

/** One prospect: e1_leads rows of the same person merged, newest real row first. */
export type Lead = LeadRow & {
  emails: string[]
  /** the anonymizer's identity, when an anonymized row was merged in */
  anonEmail?: string
  anonCompany?: string
}

export type Doc = { at: number; out: OutRow | null }

/** A JSON value the database may hand back as an object or as a string. */
export function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      // not JSON
    }
  }
  return {}
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const lower = (v: unknown): string => str(v).trim().toLowerCase()
const time = (iso: string | null | undefined): number => {
  const t = Date.parse(str(iso))
  return Number.isFinite(t) ? t : 0
}

/** "Delta Advisory" → "deltaadvisory" (the anonymizer's email is contact@<slug>.com). */
export function slug(s: unknown): string {
  return lower(s).replace(/[^a-z0-9]/g, '')
}

/** The anonymizer's placeholder email for a company. */
export function isHolder(email: unknown, company: unknown): boolean {
  const s = slug(company)
  return s !== '' && lower(email) === 'contact@' + s + '.com'
}

/** An anonymizer row: the placeholder firm's email, phone or name, never a real lead. */
export function isAnonRow(r: Pick<LeadRow, 'email' | 'company_name'> & { phone?: unknown }): boolean {
  return isHolder(r.email, r.company_name) || str(r.phone) === '555-000-0000' || /^delta advisory$/i.test(str(r.company_name).trim())
}

function nameKey(name: unknown): string {
  return str(name).replace(/\s+/g, ' ').trim().toLowerCase()
}

const field = (o: OutRow, k: string): string => {
  const top = (o as unknown as Record<string, unknown>)[k]
  return str(top) || str(asObj(o.data)[k])
}

/**
 * Discovery and growth plan documents saved before Oct 21 carry the anonymizer's placeholder email as run_id. They
 * belong to the lead with the same prospect name (the anonymizer keeps the name), so they are linked back to it.
 * Returns new rows; the input is left as it is.
 */
export function relink(leads: LeadRow[], outs: OutRow[]): OutRow[] {
  const by = new Map<string, string[]>()
  const add = (name: unknown, email: unknown) => {
    const k = nameKey(name)
    const e = str(email)
    if (!k || !e) return
    const list = by.get(k) ?? []
    if (!list.includes(e)) list.push(e)
    by.set(k, list)
  }
  for (const l of leads) {
    if (isAnonRow(l)) continue
    add(l.prospect_name, l.email)
  }
  for (const o of outs) {
    if (!['lead_research', 'interview_script', 'anonymizer'].includes(o.agent)) continue
    if (isHolder(o.run_id, field(o, 'companyName'))) continue
    add(field(o, 'prospectName'), o.run_id)
  }
  return outs.map((o) => {
    if (o.agent !== 'discovery_call' && o.agent !== 'growth_plan') return o
    if (!isHolder(o.run_id, field(o, 'companyName'))) return o
    const to = by.get(nameKey(field(o, 'prospectName')))
    if (!to || !to.length) return o
    return { ...o, held_as: o.held_as ?? o.run_id, run_id: to[0] }
  })
}

/** Leads with documents and no e1_leads row get one made up from their newest document (once per run_id). */
export function synthesize(leads: LeadRow[], outs: OutRow[]): LeadRow[] {
  const known = new Set(leads.map((l) => l.email))
  const made: LeadRow[] = []
  for (const o of outs) {
    if (!o.run_id || known.has(o.run_id)) continue
    known.add(o.run_id)
    const d = asObj(o.data)
    made.push({
      email: o.run_id,
      prospect_name: str(d.prospectName),
      company_name: str(d.companyName),
      updated_at: o.created_at ?? null,
      synthesized: true,
    })
  }
  return made
}

/**
 * Rows of the same person (same prospect name, else same email) become one lead: the newest real row first, the
 * anonymized rows last, and each field from the first row that has it. Newest lead first.
 */
export function mergeLeads(rows: LeadRow[]): Lead[] {
  const groups = new Map<string, LeadRow[]>()
  for (const r of rows) {
    const k = nameKey(r.prospect_name) || lower(r.email)
    const g = groups.get(k) ?? []
    g.push(r)
    groups.set(k, g)
  }
  const merged: Lead[] = []
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => time(b.updated_at || b.created_at) - time(a.updated_at || a.created_at))
    const anon = sorted.filter(isAnonRow)
    const real = sorted.filter((r) => !isAnonRow(r))
    const ordered = [...real, ...anon]
    const m: Record<string, unknown> = {}
    for (const r of ordered) {
      for (const [k, v] of Object.entries(r)) {
        if (m[k] === undefined || m[k] === null || m[k] === '') {
          if (v !== undefined && v !== null && v !== '') m[k] = v
        }
      }
    }
    const lead = m as Lead
    lead.emails = [...new Set(sorted.map((r) => r.email).filter(Boolean))]
    lead.email = ordered[0].email
    lead.synthesized = ordered.every((r) => r.synthesized)
    if (anon.length) {
      lead.anonEmail = anon[0].email
      lead.anonCompany = str(anon[0].company_name)
    }
    lead.updated_at = sorted[0].updated_at || sorted[0].created_at || null
    merged.push(lead)
  }
  return merged.sort((a, b) => time(b.updated_at || b.created_at) - time(a.updated_at || a.created_at))
}

/** Every lead, from the rows as read: documents linked back, leads made up for documents with no row, merged. */
export function buildLeads(rows: LeadRow[], outsRead: OutRow[]): { leads: Lead[]; outs: OutRow[] } {
  const outs = relink(rows, outsRead)
  const leads = mergeLeads([...rows, ...synthesize(rows, outs)])
  return { leads, outs }
}

export function leadEmails(l: Pick<Lead, 'email' | 'emails'>): string[] {
  return l.emails && l.emails.length ? l.emails : [l.email]
}

/** The stage's document for a lead: its newest row (meeting prep by data.stage), else a link saved on the lead. */
/** What makes a document a stage's: its agent (meeting prep also by data.stage) and the lead's link column. */
export type DocSpec = { key: string; agent: string; urlCol: keyof LeadRow | null }

export function docOf(lead: Lead, stage: DocSpec, outs: OutRow[]): Doc | null {
  const emails = leadEmails(lead)
  let best: Doc | null = null
  for (const o of outs) {
    if (o.agent !== stage.agent || !emails.includes(o.run_id)) continue
    if (stage.agent === 'meeting_prep' && str(asObj(o.data).stage) !== stage.key) continue
    const t = time(o.created_at)
    if (!best || t > best.at) best = { at: t, out: o }
  }
  if (!best && stage.urlCol && str(lead[stage.urlCol]).trim()) best = { at: 0, out: null }
  return best
}

/** The furthest stage the lead has a document for (Prospect research when none). */
export function derivedStage(lead: Lead, outs: OutRow[]): StageKey {
  let k: StageKey = 'research'
  for (const s of STAGES) if (docOf(lead, s, outs)) k = s.key
  return k
}

/** Where a lead sits: the stage the team moved it to (e1_leads.stage), else the furthest stage with a document. */
export function stageOf(lead: Lead, outs: OutRow[]): StageKey {
  return isStageKey(lead.stage) ? lead.stage : derivedStage(lead, outs)
}

/** The Google Doc ids the agents saved (data.documentId): what a run of a later stage hands on. */
export function docIds(lead: Lead, outs: OutRow[]): { researchDocId: string; interviewDocId: string; anonymizedDocId: string } {
  const emails = leadEmails(lead)
  const doc = (agent: string) => {
    for (const o of outs) {
      if (o.agent !== agent || !emails.includes(o.run_id)) continue
      const id = str(asObj(o.data).documentId)
      if (id) return id
    }
    return ''
  }
  const fromUrl = (u: unknown) => {
    const m = /\/document\/d\/([A-Za-z0-9_-]{20,})/.exec(str(u))
    return m ? m[1] : ''
  }
  return {
    researchDocId: doc('lead_research'),
    interviewDocId: doc('interview_script'),
    anonymizedDocId: doc('anonymizer') || fromUrl(lead.assessment_url),
  }
}

/** The follow-up guide (the discovery call framework): no stage's, but shown on a lead that has one. */
export function followUpOf(lead: Lead, outs: OutRow[]): Doc | null {
  return docOf(lead, { key: 'follow_up', agent: FOLLOW_UP.agent, urlCol: FOLLOW_UP.urlCol }, outs)
}

/** How many documents a lead has: the five older ones (follow-up guide included), plus onboarding and review. */
export function docCount(lead: Lead, outs: OutRow[]): number {
  let n = 0
  for (const s of STAGES) if (docOf(lead, s, outs)) n++
  if (followUpOf(lead, outs)) n++
  return n
}
