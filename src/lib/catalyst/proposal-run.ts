import 'server-only'
import { type Lead, type OutRow, docOf, leadEmails } from './leads'
import { crmLine } from './plan'
import {
  type Brand, type ProposalData, type ProposalRun, type ProposalView, type UseRow, PROPOSAL_STALE_MS, asJson, brandOf, pendingProposal, proposalDoc,
  proposalRunsFrom,
} from './proposal'

export type { ProposalData, ProposalView } from './proposal'
import { type Gathered, type Supa, gather, readSetting } from './run'
import { stageOfKey } from './stages'

// The client proposal on a lead's page, on the server (v132Lead, v132Uses with v138's emails, v132Go): the newest
// proposal and how it is drawn, what Write the client proposal reads, and the run kept for the team.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const lower = (v: unknown) => str(v).trim().toLowerCase()

export const RUNS_KEY = 'catalyst_proposal_runs'

/** A past document on Templates: the newest active file of its kind. */
export type Source = { file: string; sections: number; branding: boolean; brand: Brand }
export type InUse = Partial<Record<'proposal_template' | 'discovery_template' | 'past_assessment', Source>>

export async function sourcesInUse(supabase: Supa): Promise<InUse> {
  const { data } = await supabase
    .from('catalyst_sources')
    .select('kind,file_name,sections,brand,active,created_at')
    .in('kind', ['proposal_template', 'discovery_template', 'past_assessment'])
    .order('created_at', { ascending: false })
    .limit(100)
  const out: InUse = {}
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const kind = str(r.kind) as keyof InUse
    if (r.active === false || out[kind]) continue
    const brand = asJson(r.brand) as Brand
    out[kind] = {
      file: str(r.file_name),
      sections: Array.isArray(r.sections) ? r.sections.length : 0,
      branding: Array.isArray(brand.found) && brand.found.length > 0,
      brand,
    }
  }
  return out
}

/** What Write the client proposal reads, as its question lists it (v132Uses): the past documents, what the Proposal
 * stage reads (the calls, the emails, the CRM record when it is on) and the lead's documents. */
export function usesRows(lead: Lead, outs: OutRow[], inUse: InUse, g: Gathered | null): UseRow[] {
  const u: UseRow[] = []
  const tp = inUse.proposal_template
  if (tp) {
    const bits = [tp.sections ? tp.sections + ' sections' : '', tp.branding ? 'your branding' : ''].filter(Boolean)
    u.push({ ok: true, kind: 'doc', text: 'Proposal template: ' + tp.file + (bits.length ? ' (' + bits.join(', ') + ')' : '') })
  } else u.push({ ok: false, kind: 'plain', text: 'No proposal template yet, so a standard layout. Add one in Templates.' })
  if (inUse.discovery_template) u.push({ ok: true, kind: 'doc', text: 'Discovery call questions: ' + inUse.discovery_template.file })
  if (inUse.past_assessment) u.push({ ok: true, kind: 'doc', text: 'Past assessment: ' + inUse.past_assessment.file })
  if (g?.setup.calls) {
    if (g.ftErr && !g.calls.length) u.push({ ok: false, kind: 'plain', text: 'Call transcripts: Fathom could not be read (' + g.ftErr + ').' })
    else if (!g.calls.length) u.push({ ok: false, kind: 'plain', text: 'No recorded call with this lead, so the documents on file.' })
    else
      for (const x of g.calls.slice(0, 4)) {
        const bad = x.text === ''
        u.push({ ok: !bad, kind: 'call', text: 'The call on ', date: x.start, after: ': ' + (x.title || 'untitled') + (bad ? ' (its transcript could not be read)' : ' (transcript)') })
      }
  }
  if (g?.setup.emails) {
    if (g.emErr && !g.emails.length) u.push({ ok: false, kind: 'plain', text: 'Emails: HubSpot could not be read (' + g.emErr + ').' })
    else if (!g.emails.length) u.push({ ok: false, kind: 'plain', text: 'No emails with this lead logged in HubSpot.' })
    else {
      for (const m of g.emails.slice(0, 3)) {
        const addr = lower(m.incoming ? m.from : m.to[0])
        const who = addr ? g.who[addr] || addr : ''
        u.push({ ok: true, kind: 'mail', text: 'The email on ', date: m.at, after: (who ? (m.incoming ? ' from ' : ' to ') + who : '') + ': ' + (m.subject || 'no subject') })
      }
      const more = g.emails.length - 3
      if (more > 0) u.push({ ok: true, kind: 'mail', text: 'and ' + more + ' more email' + (more === 1 ? '' : 's'), more })
    }
  }
  if (g?.setup.crm) {
    u.push(g.crm ? { ok: true, kind: 'plain', text: 'The CRM record: ' + crmLine(g.crm) } : { ok: false, kind: 'plain', text: 'No HubSpot contact with this lead’s email.' })
  }
  const as = docOf(lead, stageOfKey('assessment'), outs)
  if (as) u.push(as.out?.created_at ? { ok: true, kind: 'plain', text: 'The assessment of ', date: as.out.created_at } : { ok: true, kind: 'plain', text: 'The assessment' })
  if (docOf(lead, stageOfKey('consultation'), outs)) u.push({ ok: true, kind: 'plain', text: 'The consultation guide' })
  if (docOf(lead, stageOfKey('research'), outs)) u.push({ ok: true, kind: 'plain', text: 'The prospect brief' })
  return u
}

/** What the run reads (with the transcripts of the four newest calls when `withText`), and its list. */
export async function proposalReads(supabase: Supa, lead: Lead, outs: OutRow[], withText: boolean): Promise<{ g: Gathered | null; rows: UseRow[] }> {
  const [inUse, g] = await Promise.all([sourcesInUse(supabase), gather(supabase, lead, 'proposal', withText).catch(() => null)])
  return { g, rows: usesRows(lead, outs, inUse, g) }
}

export async function proposalRuns(supabase: Supa): Promise<Record<string, ProposalRun>> {
  return proposalRunsFrom(await readSetting(supabase, RUNS_KEY))
}

/** Keeps the run for the whole team until its proposal lands, or for 15 minutes (older runs are dropped as it saves). */
export async function recordProposalRun(supabase: Supa, lead: Lead, by: string, t0: string, uses: UseRow[]) {
  const now = Date.now()
  const next: Record<string, ProposalRun> = {}
  for (const [e, r] of Object.entries(await proposalRuns(supabase))) if (now - Date.parse(r.t0) <= PROPOSAL_STALE_MS) next[e] = r
  for (const e of leadEmails(lead)) delete next[e.toLowerCase()]
  next[lead.email.toLowerCase()] = { t0, by, uses: uses.slice(0, 20) }
  const at = new Date(now).toISOString()
  const { error } = await supabase.from('ai_settings').upsert({ key: RUNS_KEY, value: next, updated_by: by, updated_at: at }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/** The lead's newest client proposal, the template in use and the run under way, for its page. */
export async function loadProposal(supabase: Supa, lead: Lead): Promise<ProposalData> {
  const emails = leadEmails(lead)
  const [rows, inUse, runs] = await Promise.all([
    supabase
      .from('agent_outputs')
      .select('id,run_id,title,created_at,content_md,data')
      .eq('agent', 'client_proposal')
      .in('run_id', emails)
      .order('created_at', { ascending: false })
      .limit(1),
    sourcesInUse(supabase),
    proposalRuns(supabase).catch(() => ({}) as Record<string, ProposalRun>),
  ])
  const row = ((rows.data ?? []) as Record<string, unknown>[])[0]
  let view: ProposalView | null = null
  if (row) {
    const d = asJson(row.data)
    const call = d.call && typeof d.call === 'object' ? (d.call as Record<string, unknown>) : null
    const edited = d.edited && typeof d.edited === 'object' ? (d.edited as Record<string, unknown>) : null
    view = {
      id: str(row.id),
      title: str(row.title),
      createdAt: str(row.created_at) || null,
      doc: proposalDoc(row),
      brand: brandOf(d, inUse.proposal_template?.brand),
      call: call ? { date: str(call.date), title: str(call.title) } : null,
      from: (Array.isArray(d.sources) ? d.sources : []).map((s) => str((s as Record<string, unknown>)?.label)).filter(Boolean),
      edited: edited && str(edited.at) ? { at: str(edited.at), by: str(edited.by) } : null,
    }
  }
  return {
    view,
    template: inUse.proposal_template?.file ?? null,
    run: pendingProposal(runs, emails, view?.createdAt ?? null, Date.now()),
  }
}
