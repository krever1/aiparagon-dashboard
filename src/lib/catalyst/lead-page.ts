import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type Lead, type OutRow, asObj, buildLeads, docOf, leadEmails } from './leads'
import { findLead, readCatalyst, toView } from './load'
import { STAGES, type StageKey, type StageNames } from './stages'
import { driveId, googleDocId } from './doc-format'
import { type LeadView, viewStage } from './view'

// A lead's own page: its documents (with their text), files and HubSpot contact, read as the signed-in teammate.

/** The five documents the older agents write, in the order the page numbers them (E1_STAGES). */
export const E1_DOCS = [
  { key: 'research', n: 1, agent: 'lead_research', urlCol: 'lead_research_url', label: 'Pre-meeting prospect brief', short: 'Prospect brief' },
  { key: 'consultation', n: 2, agent: 'interview_script', urlCol: 'interview_url', label: 'Consultation guide', short: 'Consultation guide' },
  { key: 'assessment', n: 3, agent: 'anonymizer', urlCol: 'assessment_url', label: 'Assessment report', short: 'Assessment' },
  { key: 'followup', n: 4, agent: 'discovery_call', urlCol: 'discovery_url', label: 'Follow-up guide', short: 'Follow-up guide' },
  { key: 'proposal', n: 5, agent: 'growth_plan', urlCol: 'growth_plan_url', label: 'Proposal presentation', short: 'Proposal' },
] as const

export type E1DocKey = (typeof E1_DOCS)[number]['key']

export type E1Doc = {
  key: E1DocKey
  n: number
  label: string
  short: string
  done: boolean
  /** the newest document row (null when only a link is saved on the lead) */
  outId: string | null
  at: string | null
  title: string
  /** the PDF: the lead's link column, else the row's pdfUrl */
  url: string
  /** the Google Doc the agent saved (data.documentId) */
  documentId: string
  /** what Read here reads when there is no saved text: the Google Doc, else the PDF in Drive */
  readDocId: string
  readPdfId: string
  md: string | null
  status: string
  callDate: string
  gammaDocUrl: string
}

export type PrepDoc = {
  key: 'onboarding' | 'review'
  outId: string
  at: string | null
  title: string
  md: string | null
}

export type FileRow = {
  id: string
  stage: string
  name: string
  url: string
  source: 'agent' | 'upload'
  note: string
  by: string
  at: string | null
  indexed: boolean
}

export type HubspotContact = {
  name: string
  company: string
  title: string
  phone: string
  lifecycle: string
  leadStatus: string
  website: string
  hasRecord: boolean
  syncedAt: string | null
}

export type LeadPageData =
  | { found: false; names: StageNames; error: string | null }
  | {
      found: true
      lead: LeadView
      firm: { firmSize: string; leadSource: string; aiReadiness: string }
      names: StageNames
      stage: StageKey
      docs: E1Doc[]
      prep: Record<'onboarding' | 'review', PrepDoc | null>
      files: { rows: FileRow[]; error: boolean }
      hubspot: { ok: boolean; contact: HubspotContact | null }
      error: string | null
    }

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

function newest(lead: Lead, agent: string, outs: OutRow[]): OutRow | null {
  const emails = leadEmails(lead)
  let best: OutRow | null = null
  for (const o of outs) {
    if (o.agent !== agent || !emails.includes(o.run_id)) continue
    if (!best || Date.parse(str(o.created_at)) > Date.parse(str(best.created_at))) best = o
  }
  return best
}

function hsName(c: Record<string, unknown>): string {
  const f = str(c.first_name)
  const l = str(c.last_name)
  if (!l) return f
  if (!f) return l
  const fl = f.toLowerCase()
  const ll = l.toLowerCase()
  return fl === ll || fl.endsWith(' ' + ll) ? f : f + ' ' + l
}

export async function loadLeadPage(id: string): Promise<LeadPageData> {
  const read = await readCatalyst()
  const { leads, outs } = buildLeads(read.rows, read.outs)
  const lead = findLead(leads, id)
  if (!lead) return { found: false, names: read.names, error: read.error }
  const emails = leadEmails(lead)
  const supabase = await createClient()

  const docs0 = E1_DOCS.map((spec) => {
    const out = newest(lead, spec.agent, outs)
    const d = asObj(out?.data)
    const url = str(lead[spec.urlCol]) || str(d.pdfUrl) || str(d.pdf_url)
    const documentId = str(d.documentId)
    return { spec, out, d, url, documentId }
  })
  const prep0 = (['onboarding', 'review'] as const).map((key) => {
    const st = STAGES.find((s) => s.key === key)!
    return { key, doc: docOf(lead, st, outs) }
  })
  const ids = [...docs0.map((x) => x.out?.id), ...prep0.map((x) => x.doc?.out?.id)].filter((x): x is string => !!x)

  const [texts, files, hs] = await Promise.all([
    ids.length
      ? supabase.from('agent_outputs').select('id,content_md').in('id', ids)
      : Promise.resolve({ data: [] as { id: string; content_md: string | null }[], error: null }),
    supabase
      .from('lead_files')
      .select('id,lead_email,file_name,file_url,file_path,stage,source,note,uploaded_by,indexed_at,created_at')
      .in('lead_email', emails)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('hubspot_contacts').select('*').in('email', emails).limit(1),
  ])
  const mdOf = new Map((texts.data ?? []).map((r) => [r.id, r.content_md]))

  const docs: E1Doc[] = docs0.map(({ spec, out, d, url, documentId }) => {
    const md = out ? (mdOf.get(out.id) ?? null) : null
    return {
      key: spec.key,
      n: spec.n,
      label: spec.label,
      short: spec.short,
      done: !!(out || url),
      outId: out?.id ?? null,
      at: out?.created_at ?? null,
      title: str(out?.title) || spec.label,
      url,
      documentId,
      readDocId: documentId || (/docs\.google\.com\/document/.test(url) ? googleDocId(url) || driveId(url) : ''),
      readPdfId: driveId(url),
      md: md && md.trim() ? md : null,
      status: str(d.status),
      callDate: str(d.callDate),
      gammaDocUrl: str(d.gammaDocUrl),
    }
  })

  const prep = Object.fromEntries(
    prep0.map(({ key, doc }) => [
      key,
      doc?.out
        ? {
            key,
            outId: doc.out.id,
            at: doc.out.created_at ?? null,
            title: str(doc.out.title),
            md: (mdOf.get(doc.out.id) ?? '').trim() ? (mdOf.get(doc.out.id) as string) : null,
          }
        : null,
    ]),
  ) as Record<'onboarding' | 'review', PrepDoc | null>

  // Files: the agents' documents first (the newest of each, by stage), then what the team uploaded.
  const agentRows: FileRow[] = []
  for (const x of docs) {
    if (!x.done) continue
    const base = x.title
    const agent = E1_DOCS.find((s) => s.key === x.key)!.agent
    if (x.url) agentRows.push({ id: x.key + ':pdf', stage: agent, name: base + ' (PDF)', url: x.url, source: 'agent', note: '', by: '', at: x.at, indexed: false })
    if (x.documentId)
      agentRows.push({
        id: x.key + ':doc', stage: agent, name: base + ' (Google Doc)', url: `https://docs.google.com/document/d/${x.documentId}/edit`,
        source: 'agent', note: '', by: '', at: x.at, indexed: false,
      })
    if (x.gammaDocUrl)
      agentRows.push({ id: x.key + ':gamma', stage: agent, name: 'Gamma slide notes (Google Doc)', url: x.gammaDocUrl, source: 'agent', note: '', by: '', at: x.at, indexed: false })
  }
  const uploads: FileRow[] = ((files.data ?? []) as Record<string, unknown>[]).map((f) => ({
    id: str(f.id),
    stage: str(f.stage) || 'manual',
    name: str(f.file_name),
    url: str(f.file_url),
    source: 'upload',
    note: str(f.note),
    by: str(f.uploaded_by),
    at: str(f.created_at) || null,
    indexed: !!f.indexed_at,
  }))
  const order = (a: string) => (a === 'manual' ? 99 : E1_DOCS.findIndex((s) => s.agent === a))
  const rows = [...agentRows, ...uploads].sort((a, b) => order(a.stage) - order(b.stage))

  const c = hs.error ? null : ((hs.data ?? [])[0] as Record<string, unknown> | undefined) ?? null
  const contact: HubspotContact | null = c
    ? {
        name: hsName(c),
        company: str(c.company),
        title: str(c.job_title),
        phone: str(c.phone),
        lifecycle: str(c.lifecycle_stage),
        leadStatus: str(c.lead_status),
        website: str(c.website),
        hasRecord: !!str(c.hs_id),
        syncedAt: str(c.synced_at) || null,
      }
    : null

  const view = toView(lead, outs)
  return {
    found: true,
    lead: view,
    firm: { firmSize: str(lead.firm_size), leadSource: str(lead.lead_source), aiReadiness: str(lead.ai_readiness) },
    names: read.names,
    stage: viewStage(view),
    docs,
    prep,
    files: { rows, error: !!files.error },
    hubspot: { ok: !hs.error, contact },
    error: read.error ?? (texts.error ? 'Couldn’t load the documents’ text. ' + texts.error.message : null),
  }
}
