import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { type CallMeta, type CallOutput, type FileContact, type FilingCtx, type FtCall, type TypeNames, cleanNames, customTypes, knownFolders, normMeta, normOutput } from './calls'
import { FathomError, ftList, ftStatus } from './fathom'
import { buildLeads } from './leads'
import { readCatalyst, toView } from './load'
import { STAGES } from './stages'
import { hasDoc } from './view'

// The Calls page's data, read as the signed-in teammate (apRenderCalls, apCxLoad): whether Fathom is connected, its
// newest calls, what the team saved about each (call_meta), the newest post-call actions per call (call_outputs), the
// team's call settings, and the Catalyst leads (a guest who is a lead gets the lead's box and folder).

export type CallLead = {
  id: string
  name: string
  company: string
  emails: string[]
  /** "no stages run yet", or "done up to Proposal" */
  progress: string
}

export type CallsData = {
  connected: boolean
  hint: string
  updatedBy: string
  updatedAt: string
  error: { message: string; code: string } | null
  calls: FtCall[]
  next: string | null
  meta: Record<string, CallMeta>
  outputs: Record<string, CallOutput>
  /** post-call actions for every new call (ai_settings call_auto_actions; on unless switched off) */
  auto: boolean
  /** the team's own call types (ai_settings call_types) */
  types: string[]
  /** the team's names for the built-in types and buttons (ai_settings call_type_names, v144) */
  names: TypeNames
  /** the folders the team added (ai_settings call_folders, v144) */
  teamFolders: string[]
  leads: CallLead[]
  /** what files a call by its people (v144): the leads, the HubSpot contacts and the folders the team made */
  filing: FilingCtx
}

/** The team's own folders (ai_settings call_folders): names, each once. */
export function teamFoldersOf(v: unknown): string[] {
  const L = Array.isArray(v) ? v : []
  return [...new Set(L.map((x) => String(x ?? '').trim()).filter(Boolean))]
}

const errOf = (e: unknown) => ({ message: e instanceof Error ? e.message : String(e), code: e instanceof FathomError ? e.code : '' })

export async function readCallRows(): Promise<{
  meta: Record<string, CallMeta>
  outputs: Record<string, CallOutput>
  settings: Record<string, unknown>
  /** the post-call actions could not be read */
  error: string | null
}> {
  const supabase = await createClient()
  const [m, o, s] = await Promise.all([
    supabase.from('call_meta').select('*').limit(2000),
    supabase.from('call_outputs').select('*').order('created_at', { ascending: false }).limit(400),
    supabase.from('ai_settings').select('key,value').in('key', ['call_auto_actions', 'call_types', 'call_type_names', 'call_folders']),
  ])
  const meta: Record<string, CallMeta> = {}
  for (const r of (m.data ?? []) as Record<string, unknown>[]) {
    const x = normMeta(r)
    if (x.call_id) meta[x.call_id] = x
  }
  const outputs: Record<string, CallOutput> = {}
  for (const r of (o.data ?? []) as Record<string, unknown>[]) {
    const x = normOutput(r)
    if (x.call_id && !outputs[x.call_id]) outputs[x.call_id] = x
  }
  const settings: Record<string, unknown> = {}
  for (const r of (s.data ?? []) as { key: string; value: unknown }[]) settings[r.key] = r.value
  return { meta, outputs, settings, error: o.error ? o.error.message || 'the post-call actions could not be read' : null }
}

/** The HubSpot contacts' companies, for filing a call by its people (v144). */
export async function filingContacts(): Promise<FileContact[]> {
  const { data } = await (await createClient()).from('hubspot_contacts').select('email,company').not('company', 'is', null).limit(5000)
  return ((data ?? []) as { email: string | null; company: string | null }[])
    .map((r) => ({ email: String(r.email ?? '').trim(), company: String(r.company ?? '').trim() }))
    .filter((r) => r.email && r.company)
}

/** What files a call by its people, from what is read. */
export function filingOf(leads: CallLead[], contacts: FileContact[], meta: Record<string, CallMeta>, team: string[]): FilingCtx {
  return {
    leads: leads.map((l) => ({ emails: l.emails, company: l.company, name: l.name })),
    contacts,
    folders: knownFolders(Object.values(meta), team),
  }
}

/** The Catalyst leads, for the lead box on a call and the folder of a call with a lead on it. */
export async function callLeads(): Promise<CallLead[]> {
  const read = await readCatalyst()
  const { leads, outs } = buildLeads(read.rows, read.outs)
  return leads.map((lead) => {
    const v = toView(lead, outs, {})
    const furthest = [...STAGES].reverse().find((s) => hasDoc(v, s.key))
    return {
      id: v.id,
      name: v.name,
      company: v.company,
      emails: v.emails.map((e) => e.toLowerCase()),
      progress: furthest ? 'done up to ' + furthest.short : 'no stages run yet',
    }
  })
}

export async function loadCalls(): Promise<CallsData> {
  const base: CallsData = {
    connected: false, hint: '', updatedBy: '', updatedAt: '', error: null, calls: [], next: null, meta: {}, outputs: {}, auto: true, types: [], names: {},
    teamFolders: [], leads: [], filing: { leads: [], contacts: [], folders: [] },
  }
  let st
  try {
    st = await ftStatus()
  } catch (e) {
    return { ...base, error: errOf(e) }
  }
  if (!st.connected) return { ...base, hint: st.hint }
  let list
  try {
    list = await ftList()
  } catch (e) {
    // the key no longer works (bad_key), or the list failed: the page offers the key again
    return { ...base, hint: st.hint, error: errOf(e) }
  }
  const [rows, leads, contacts] = await Promise.all([
    readCallRows(),
    callLeads().catch(() => [] as CallLead[]),
    filingContacts().catch(() => [] as FileContact[]),
  ])
  const teamFolders = teamFoldersOf(rows.settings.call_folders)
  return {
    ...base,
    connected: true,
    hint: st.hint,
    updatedBy: st.updatedBy,
    updatedAt: st.updatedAt,
    calls: list.items,
    next: list.next,
    meta: rows.meta,
    outputs: rows.outputs,
    auto: rows.settings.call_auto_actions !== false,
    types: customTypes(rows.settings.call_types),
    names: cleanNames(rows.settings.call_type_names),
    teamFolders,
    leads,
    filing: filingOf(leads, contacts, rows.meta, teamFolders),
  }
}
