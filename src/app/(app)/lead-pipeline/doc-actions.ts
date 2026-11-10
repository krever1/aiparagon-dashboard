'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { ASK_AGENTS } from '@/lib/catalyst/lead-page'
import { buildLeads, leadEmails } from '@/lib/catalyst/leads'
import { findLead, readCatalyst } from '@/lib/catalyst/load'
import { composeNote } from '@/lib/catalyst/plan'
import { type DocEdits, type UseRow, applyEdits, asJson, docMd, pendingProposal, proposalDoc, usesSummary } from '@/lib/catalyst/proposal'
import { proposalReads, proposalRuns, recordProposalRun } from '@/lib/catalyst/proposal-run'
import { callN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

// What a teammate does with a lead's documents: ask for changes (v125, v132Change), write the client proposal (v132Ask,
// v132Go), check whether it has landed (v132Poll) and save edits made in place (v132EditSave).

export type DocResult = { ok: true; toast: string } | { ok: false; error: string }

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'something went wrong'
const SIGNED_OUT = 'You are signed out. Sign in again.'
const NO_LEAD = 'Could not find this lead any more. Refresh the page.'

async function leadFor(leadId: string) {
  const read = await readCatalyst()
  const { leads, outs } = buildLeads(read.rows, read.outs)
  return { lead: findLead(leads, String(leadId)), outs, names: read.names }
}

/**
 * What should change? (v125Save): the reason is saved for AI settings' From your feedback, where Make it a rule turns
 * it into a house rule the Catalyst agents follow. No agent reads the reason itself.
 */
export async function askChange(input: { leadId: string; agent: string; text: string }): Promise<DocResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const agent = String(input?.agent ?? '')
  if (!(ASK_AGENTS as readonly string[]).includes(agent)) return { ok: false, error: 'That is not a Catalyst document.' }
  const text = String(input?.text ?? '').replace(/\s+/g, ' ').trim()
  if (text.length < 12) return { ok: false, error: 'Write a sentence or two, so it can become a rule.' }
  const { lead } = await leadFor(input.leadId)
  if (!lead) return { ok: false, error: NO_LEAD }
  const { error } = await (await createClient()).from('agent_feedback').insert({
    agent,
    target_type: 'e1_document',
    target_id: lead.email.toLowerCase() + ':' + agent,
    action: 'changes',
    feedback: text.slice(0, 600),
    author: user.email,
  })
  if (error) return { ok: false, error: 'Could not save it: ' + error.message }
  refresh()
  return { ok: true, toast: 'Saved. Make it a rule on AI settings.' }
}

export type UsesResult = { ok: true; rows: UseRow[]; summary: string } | { ok: false; error: string }

/** The question's list: what Write the client proposal would read for this lead. */
export async function proposalUses(leadId: string): Promise<UsesResult> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const { lead, outs } = await leadFor(leadId)
  if (!lead) return { ok: false, error: NO_LEAD }
  const { rows } = await proposalReads(await createClient(), lead, outs, false)
  return { ok: true, rows, summary: usesSummary(rows) }
}

/**
 * Write the client proposal: what the Proposal stage reads (the call transcripts and emails, the CRM record when it is
 * on) goes as the meetings' notes, with no single call's title, and Catalyst · Client Proposal answers that it started.
 * The run is kept for the team until the proposal lands. The calls it read are not filed (the board's runs file them).
 */
export async function writeProposal(leadId: string): Promise<DocResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const { lead, outs, names } = await leadFor(leadId)
  if (!lead) return { ok: false, error: NO_LEAD }
  const runs = await proposalRuns(supabase).catch(() => ({}))
  const newest = await supabase
    .from('agent_outputs')
    .select('created_at')
    .eq('agent', 'client_proposal')
    .in('run_id', leadEmails(lead))
    .order('created_at', { ascending: false })
    .limit(1)
  const newestAt = ((newest.data ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null
  if (pendingProposal(runs, leadEmails(lead), newestAt, Date.now())) {
    const name = String(lead.prospect_name ?? '').trim() || lead.email
    return { ok: false, error: `Catalyst is still writing the client proposal for ${name}. It shows here when it is ready.` }
  }
  let reads: Awaited<ReturnType<typeof proposalReads>>
  try {
    reads = await proposalReads(supabase, lead, outs, true)
  } catch {
    reads = { g: null, rows: [] }
  }
  const g = reads.g
  const note = g ? composeNote({ typed: '', crm: g.crm, calls: g.calls, emails: g.emails, names }) : ''
  const call = note ? { id: '', title: '', date: '', transcript: note.slice(0, 60_000) } : null
  const t0 = new Date().toISOString()
  try {
    const j = await callN8n<{ ok?: boolean; message?: string }>(
      'catalyst-proposal',
      { leadEmail: lead.email, call },
      { what: 'Client Proposal', workflow: 'Catalyst · Client Proposal', timeoutMs: 30_000 },
    )
    if (!j || j.ok === false) throw new Error((j && j.message) || 'n8n did not start it.')
  } catch (e) {
    return { ok: false, error: 'Could not start it: ' + msgOf(e) }
  }
  try {
    await recordProposalRun(supabase, lead, user.email, t0, reads.rows)
  } catch {
    // the run is under way; only its "Writing" line is missing
  }
  refresh()
  return { ok: true, toast: 'Writing the client proposal. It shows here when it is ready.' }
}

/** Whether a client proposal was saved for these emails since a run started (5 seconds' leeway, as v132Poll). */
export async function proposalLanded(emails: string[], t0: string): Promise<boolean> {
  if (!(await getCurrentUser())) return false
  const list = (Array.isArray(emails) ? emails : []).map(String).filter((e) => e.includes('@') && e.length < 200).slice(0, 10)
  const at = Date.parse(String(t0))
  if (!list.length || !at) return false
  const { data } = await (await createClient())
    .from('agent_outputs')
    .select('id')
    .eq('agent', 'client_proposal')
    .in('run_id', list)
    .gt('created_at', new Date(at - 5000).toISOString())
    .limit(1)
  return !!data?.length
}

/**
 * Save changes made in place (v132EditSave): the document is read again and the edits applied to it here, so only
 * titles, the subtitle and section bodies can change. The agent's version is kept once, in `snapshot`.
 */
export async function saveProposal(input: { id: string; edits: DocEdits }): Promise<DocResult & { same?: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = String(input?.id ?? '')
  if (!/^[\w-]{1,80}$/.test(id)) return { ok: false, error: 'That is not a proposal.' }
  const e = input?.edits
  const sections = Array.isArray(e?.sections) ? e.sections.slice(0, 60) : []
  const edits: DocEdits = {
    title: String(e?.title ?? '').slice(0, 300),
    subtitle: e?.subtitle === null || e?.subtitle === undefined ? null : String(e.subtitle).slice(0, 600),
    sections: sections.map((s) => ({ title: String(s?.title ?? '').slice(0, 300), body: String(s?.body ?? '').slice(0, 30_000) })),
  }
  const supabase = await createClient()
  const { data: row, error: readErr } = await supabase
    .from('agent_outputs')
    .select('id,agent,data,content_md,created_at,snapshot')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return { ok: false, error: 'Could not save it: ' + readErr.message }
  if (!row || row.agent !== 'client_proposal') return { ok: false, error: 'Could not find this proposal any more. Refresh the page.' }
  const before = proposalDoc(row)
  const doc = applyEdits(before, edits)
  if (JSON.stringify(doc) === JSON.stringify(before)) return { ok: true, toast: 'Nothing changed.', same: true }
  const body: Record<string, unknown> = {
    data: { ...asJson(row.data), doc, edited: { at: new Date().toISOString(), by: user.email } },
    content_md: docMd(doc),
    edited_by_human: true,
  }
  if (!row.snapshot) body.snapshot = { doc: before, content_md: row.content_md || null, written_at: row.created_at }
  const { data: saved, error } = await supabase.from('agent_outputs').update(body).eq('id', id).select('id')
  if (error) return { ok: false, error: 'Could not save it: ' + error.message }
  if (!saved?.length) return { ok: false, error: 'Could not save it: the database did not take the change.' }
  refresh()
  return { ok: true, toast: 'Saved. Save as PDF prints this version.' }
}
