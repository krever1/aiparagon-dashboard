'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { DOC_ID } from '@/lib/catalyst/doc-format'
import { buildLeads } from '@/lib/catalyst/leads'
import { findLead, readCatalyst, toView } from '@/lib/catalyst/load'
import { ENTRY, RUN_HOOKS, type ReadRow, composeNote, planFor } from '@/lib/catalyst/plan'
import {
  type Gathered, callsOfLead, fathomList, fathomTranscript, fileCall, fileUsed, gather, readRows, readSetting, recordRun, setStage, startStage,
} from '@/lib/catalyst/run'
import { STAGES, type StageNames, cleanName, isStageKey, namesFromSetting, nextStageKey, stageOfKey } from '@/lib/catalyst/stages'
import { viewStage } from '@/lib/catalyst/view'
import { callN8n, startN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

export type SaveNamesResult = { ok: true; names: StageNames } | { ok: false; error: string }

const asObject = (v: unknown): Record<string, unknown> => {
  let x = v
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x)
    } catch {
      x = null
    }
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

/**
 * Rename stages: the team's names for the six meetings, for everyone (ai_settings `catalyst_stages`). The row is read
 * fresh and merged, so another teammate's save in between is not lost; each stage keeps who named it and when. A name
 * that is the usual one is stored empty, as the current dashboard does.
 */
export async function saveStageNames(input: Record<string, string>): Promise<SaveNamesResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'you are signed out, so sign in again' }
  const supabase = await createClient()
  const cur = await supabase.from('ai_settings').select('value').eq('key', 'catalyst_stages').maybeSingle()
  if (cur.error) return { ok: false, error: cur.error.message }
  const base = asObject(cur.data?.value)
  const at = new Date().toISOString()
  const value: Record<string, unknown> = { ...base }
  for (const s of STAGES) {
    const name = cleanName(input?.[s.key]) || s.defaultName
    value[s.key] = { ...asObject(base[s.key]), name: name === s.defaultName ? '' : name, by: user.email, at }
  }
  const { error } = await supabase
    .from('ai_settings')
    .upsert({ key: 'catalyst_stages', value, updated_by: user.email, updated_at: at }, { onConflict: 'key' })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, names: namesFromSetting(value) }
}

export type ReadDocResult = { ok: true; kind: 'pdf' | 'doc'; text: string } | { ok: false; error: string }

/**
 * Read here, for a document with no saved text: the Google Doc (or the PDF in Drive) read through the Dashboard · Doc
 * Reader workflow, as the signed-in teammate.
 */
export async function readDocument(id: string): Promise<ReadDocResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again to read documents.' }
  if (!DOC_ID.test(String(id))) return { ok: false, error: 'That is not a Google Doc or a Drive file.' }
  try {
    const j = await callN8n<{ ok?: boolean; kind?: string; text?: unknown; message?: string }>(
      'doc-reader',
      { id },
      { what: 'Document', workflow: 'Dashboard · Doc Reader' },
    )
    if (!j || j.ok === false) return { ok: false, error: (j && j.message) || 'Could not read that document.' }
    return { ok: true, kind: j.kind === 'pdf' ? 'pdf' : 'doc', text: String(j.text ?? '') }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read that document.' }
  }
}

// ---------- running a stage ----------

export type ReadsResult =
  | { ok: true; rows: ReadRow[]; found: { calls: number; emails: number } }
  | { ok: false; error: string }

/** The question's Reads list: the template, the calls, the emails and the CRM record a stage's run would read. */
export async function stageReads(leadId: string, stage: string): Promise<ReadsResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  if (!isStageKey(stage)) return { ok: false, error: 'That is not a stage.' }
  const read = await readCatalyst()
  const { leads } = buildLeads(read.rows, read.outs)
  const lead = findLead(leads, leadId)
  if (!lead) return { ok: false, error: 'Could not find this lead any more. Refresh the page.' }
  const g = await gather(await createClient(), lead, stage, false)
  return { ok: true, rows: readRows(g), found: { calls: g.calls.length, emails: g.emails.length } }
}

export type GoResult = { ok: true; toast: string } | { ok: false; error: string }

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'something went wrong'

/**
 * The question's answer (v136Go): move the lead to the stage, run the stage's document, or both. The lead is read
 * again first; a run reads what the stage reads (the call transcripts, the emails, the CRM record), starts only that
 * stage's workflow, files the calls it read and is kept for the team until its document lands.
 */
export async function goStage(input: { leadId: string; stage: string; move: boolean; run: boolean; notes: string }): Promise<GoResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  if (!isStageKey(input?.stage)) return { ok: false, error: 'That is not a stage.' }
  const stage = input.stage
  const supabase = await createClient()
  const read = await readCatalyst()
  const { leads, outs } = buildLeads(read.rows, read.outs)
  const lead = findLead(leads, String(input.leadId))
  if (!lead) return { ok: false, error: 'Could not find this lead any more. Refresh the page.' }
  const view = toView(lead, outs, read.runs)
  const st = stageOfKey(stage, read.names)
  if (view.run) return { ok: false, error: `Catalyst is still writing for ${view.name}. It shows on the card when it is done.` }
  const was = viewStage(view)
  const moving = !!input.move && stage !== was
  const run = !!input.run
  if (!moving && !run) return { ok: false, error: `${view.name} is in ${st.name} already.` }
  const notes = String(input.notes ?? '').trim().slice(0, 200_000)

  let g: Gathered | null = null
  if (run) {
    const plan = planFor(view, stage)
    if (plan.blocked) return { ok: false, error: plan.blocked }
    try {
      g = await gather(supabase, lead, stage, true)
    } catch {
      g = null
    }
    const has = !!notes || !!g?.calls.some((c) => c.text) || !!g?.emails.length
    if (plan.need && !has) {
      return { ok: false, error: `Paste the meeting transcript or your notes first. This lead has no ${plan.need} to work from yet, and no recorded call with it.` }
    }
  }
  if (moving) {
    try {
      await setStage(supabase, lead, stage)
    } catch (e) {
      return { ok: false, error: `Could not move the lead: ${msgOf(e)}. Try again in a minute.` }
    }
  }
  if (run) {
    const note = stage === 'research' ? '' : composeNote({ typed: notes, crm: g?.crm ?? null, calls: g?.calls ?? [], emails: g?.emails ?? [], names: read.names })
    try {
      await startStage(lead, outs, stage, note, g, read.names)
    } catch (e) {
      if (moving) refresh()
      return { ok: false, error: (moving ? `Moved to ${st.name}, but it could not start: ` : 'Could not start it: ') + msgOf(e) + '. Try again in a minute.' }
    }
    try {
      await recordRun(supabase, lead, outs, stage, user.email)
    } catch {
      // the run is under way; only its "Writing" line on the board is missing
    }
    await fileUsed(supabase, lead, g, moving ? was : stage, user.email)
  }
  refresh()
  return { ok: true, toast: run ? `Started. ${st.doc} shows up on the card when it is done.` : `Moved to ${st.name}.` }
}

// ---------- New run (the older form: a lead that is not on the board yet) ----------

export type NewRunInput = {
  entry: 'research' | 'consultation' | 'assessment'
  firstName: string
  lastName: string
  title: string
  company: string
  link: string
  email: string
  phone: string
  firmType: string
  firmSize: string
  transcript: string
  doc: string
}

/**
 * New run: the lead's details and the stage the client is at; only that stage runs (the prospect brief through the
 * full run, the consultation guide or the assessment through the custom run), then the lead is put in that stage.
 */
export async function newRun(input: NewRunInput): Promise<GoResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  const t = (v: unknown) => String(v ?? '').trim()
  const entry = input?.entry === 'consultation' || input?.entry === 'assessment' ? input.entry : 'research'
  const email = t(input?.email)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Email is required: it is the run ID across the pipeline.' }
  const transcript = entry === 'research' ? '' : t(input.transcript).slice(0, 120_000)
  const doc = entry === 'research' ? '' : t(input.doc).slice(0, 400_000)
  if (entry !== 'research' && !transcript && !doc) return { ok: false, error: 'Add a transcript or document: Catalyst works from it for this stage.' }
  const name = [t(input.firstName), t(input.lastName)].filter(Boolean).join(' ')
  const base = {
    firstName: t(input.firstName), lastName: t(input.lastName), prospectName: name, prospectTitle: t(input.title),
    firmName: t(input.company), companyName: t(input.company), companyUrl: t(input.link), emailAddress: email, email,
    website: t(input.link), phone: t(input.phone), firmType: t(input.firmType), firmSize: t(input.firmSize),
    hearAboutUs: 'Dashboard run', whatBringsYouHere: '', aiInterests: [] as string[], currentAIStage: '', preferredFollowUp: '',
  }
  try {
    if (entry === 'research') await startN8n(RUN_HOOKS.full, { ...base, only: true, stage: 'research' })
    else await startN8n(RUN_HOOKS.custom, { ...base, entry: ENTRY[entry]!, transcript, extraDoc: doc, only: true, stage: entry })
  } catch (e) {
    return { ok: false, error: `Couldn’t start the run: ${msgOf(e)}. Check the workflow is published in n8n.` }
  }
  const supabase = await createClient()
  // the lead goes in the stage it is at (a row is made when it has none); a failure here leaves the run going
  try {
    const now = new Date().toISOString()
    const { data } = await supabase.from('e1_leads').update({ stage: entry, updated_at: now }).eq('email', email).select('email')
    if (!data?.length) {
      await supabase
        .from('e1_leads')
        .upsert({ email, prospect_name: name || null, company_name: t(input.company) || null, stage: entry }, { onConflict: 'email' })
    }
    const read = await readCatalyst()
    const { leads, outs } = buildLeads(read.rows, read.outs)
    const lead = leads.find((l) => l.emails.includes(email))
    if (lead) await recordRun(supabase, lead, outs, entry, user.email)
  } catch {
    // the run is under way
  }
  refresh()
  return { ok: true, toast: 'Started. The document lands on the lead when it is done.' }
}

export type CallPick = { id: string; title: string; start: string; minutes: number; guest: { name: string; email: string } | null }

/** New run's "Use a Fathom call": the newest recorded calls. */
export async function recentCalls(): Promise<{ ok: true; calls: CallPick[] } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  try {
    const list = await fathomList()
    return {
      ok: true,
      calls: list.slice(0, 40).map((c) => {
        const a = Date.parse(c.start)
        const b = Date.parse(c.end)
        const g = c.invitees.find((i) => i.email && i.email.toLowerCase() !== c.recorder) ?? null
        return { id: c.id, title: c.title, start: c.start, minutes: a && b && b > a ? Math.round((b - a) / 60000) : 0, guest: g }
      }),
    }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}

/** A call's transcript for New run's box. */
export async function callText(id: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  if (!/^[\w-]{1,80}$/.test(String(id))) return { ok: false, error: 'That is not a Fathom call.' }
  try {
    return { ok: true, text: (await fathomTranscript(String(id))).slice(0, 120_000) }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}

// ---------- a lead's calls, and filing one (v137LeadCalls, v137AskCall, v137CallGo) ----------

export type LeadCallRow = { id: string; title: string; start: string; minutes: number; stage: string }

/** The lead's Calls tab: every recorded call with it, and the stage each is filed under. */
export async function leadCallsFor(leadId: string): Promise<{ ok: true; calls: LeadCallRow[]; error: string } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: 'You are signed out. Sign in again.' }
  const read = await readCatalyst()
  const lead = findLead(buildLeads(read.rows, read.outs).leads, String(leadId))
  if (!lead) return { ok: false, error: 'Could not find this lead any more. Refresh the page.' }
  const r = await callsOfLead(await createClient(), lead)
  return { ok: true, calls: r.calls.map((c) => ({ id: c.id, title: c.title, start: c.start, minutes: c.minutes, stage: c.stage })), error: r.err }
}

/** Up to three points of a call's post-call summary, for the question. */
export async function callSummary(callId: string): Promise<string[]> {
  if (!(await getCurrentUser()) || !/^[\w-]{1,80}$/.test(String(callId))) return []
  const { data } = await (await createClient())
    .from('call_outputs')
    .select('summary,status')
    .eq('call_id', String(callId))
    .order('created_at', { ascending: false })
    .limit(1)
  const row = (data ?? [])[0] as { summary?: unknown } | undefined
  const list = Array.isArray(row?.summary) ? row.summary : []
  return list
    .map((x) => (typeof x === 'string' ? x : String((x as Record<string, unknown>)?.text || (x as Record<string, unknown>)?.point || '')))
    .filter(Boolean)
    .slice(0, 3)
}

/**
 * The answer to a new transcript: set the call aside, file it under the stage the lead is in, or file it and run the
 * next stage with it (the lead moved there first), as the current dashboard does.
 */
export async function answerCall(input: { leadId: string; callId: string; action: 'skip' | 'file' | 'run'; notes: string }): Promise<GoResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  const callId = String(input?.callId ?? '')
  if (!/^[\w-]{1,80}$/.test(callId)) return { ok: false, error: 'That is not a Fathom call.' }
  const supabase = await createClient()
  let read = await readCatalyst()
  let built = buildLeads(read.rows, read.outs)
  let lead = findLead(built.leads, String(input.leadId))
  if (!lead) return { ok: false, error: 'Could not find this lead any more. Refresh the page.' }
  let view = toView(lead, built.outs, read.runs)
  const cur = viewStage(view)
  const nx = nextStageKey(cur)
  const curSt = stageOfKey(cur, read.names)
  const st = stageOfKey(nx, read.names)
  const meta = await supabase.from('call_meta').select('meeting_type').eq('call_id', callId).maybeSingle()
  const call = { id: callId, type: String(meta.data?.meeting_type ?? '') }
  const saved = await readSetting(supabase, 'catalyst_stage_setup')

  if (input.action === 'skip' || input.action === 'file') {
    try {
      await fileCall(supabase, call, lead.email, input.action === 'skip' ? 'none' : cur, user.email, saved)
    } catch (e) {
      return { ok: false, error: 'Could not save it: ' + msgOf(e) }
    }
    refresh()
    return { ok: true, toast: input.action === 'skip' ? 'Set aside. The call stays on Calls.' : `Filed under ${curSt.name}.` }
  }

  if (view.run) return { ok: false, error: `Catalyst is still writing for ${view.name}. File the transcript now, and run the next stage once that is done.` }
  try {
    await fileCall(supabase, call, lead.email, cur, user.email, saved)
  } catch (e) {
    return { ok: false, error: 'Could not file it: ' + msgOf(e) }
  }
  read = await readCatalyst()
  built = buildLeads(read.rows, read.outs)
  lead = findLead(built.leads, String(input.leadId))
  if (!lead) return { ok: false, error: 'Could not find this lead any more. Refresh the page.' }
  view = toView(lead, built.outs, read.runs)
  const plan = planFor(view, nx)
  if (plan.blocked) return { ok: false, error: plan.blocked }
  const notes = String(input.notes ?? '').trim().slice(0, 200_000)
  let g: Gathered | null = null
  try {
    g = await gather(supabase, lead, nx, true)
  } catch {
    g = null
  }
  if (plan.need && !notes && !(g && (g.calls.some((x) => x.text) || g.emails.length))) {
    return { ok: false, error: `The transcript could not be read from Fathom, and this lead has no ${plan.need} to work from. Add your notes from the meeting.` }
  }
  const moving = nx !== cur
  if (moving) {
    try {
      await setStage(supabase, lead, nx)
    } catch (e) {
      return { ok: false, error: 'Filed, but the lead could not be moved: ' + msgOf(e) }
    }
  }
  const note = composeNote({ typed: notes, crm: g?.crm ?? null, calls: g?.calls ?? [], emails: g?.emails ?? [], names: read.names })
  try {
    await startStage(lead, built.outs, nx, note, g, read.names)
  } catch (e) {
    refresh()
    return { ok: false, error: (moving ? `Moved to ${st.name}, but it could not start: ` : 'Could not start it: ') + msgOf(e) + '. Try again in a minute.' }
  }
  try {
    await recordRun(supabase, lead, built.outs, nx, user.email)
  } catch {
    // the run is under way; only its "Writing" line on the board is missing
  }
  await fileUsed(supabase, lead, g, cur, user.email)
  refresh()
  return { ok: true, toast: `Started. ${st.doc} shows on the Lead pipeline when it is done.` }
}
