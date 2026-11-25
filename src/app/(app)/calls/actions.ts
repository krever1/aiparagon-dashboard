'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import {
  type CallOutput, type FtCall, type FtLine, type Guest, type TypeNames, cleanNames, cleanTags, customTypes, newTypeProblem, normOutput, typeLabel,
} from '@/lib/catalyst/calls'
import { ftAccess, ftConnect, ftDisconnect, ftList, ftStatus, ftTranscript } from '@/lib/catalyst/fathom'
import { callN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

// What the Calls page does, on the server as the signed-in teammate: Fathom through n8n, the team's details on a
// call (call_meta), call types (ai_settings call_types), post-call actions (Meetings · Post-call Actions, call_outputs),
// Slack (Integrations · Slack Proxy) and HubSpot (Meetings · Call to HubSpot).

export type Done = { ok: true } | { ok: false; error: string }
type Res<T> = ({ ok: true } & T) | { ok: false; error: string }

const SIGNED_OUT = 'You are signed out. Sign in again.'
const CALL_ID = /^[\w-]{1,80}$/
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'something went wrong'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const cut = (v: unknown, n: number) => str(v).trim().slice(0, n)

type Supa = Awaited<ReturnType<typeof createClient>>

/** The team's details on a call: the row is changed, or made when the call has none. */
async function saveMeta(supabase: Supa, id: string, patch: Record<string, unknown>, by: string) {
  const now = new Date().toISOString()
  const body = { ...patch, updated_at: now, updated_by: by }
  const { data, error } = await supabase.from('call_meta').update(body).eq('call_id', id).select('call_id')
  if (error) throw new Error(error.message)
  if (!data?.length) {
    const ins = await supabase.from('call_meta').insert({ call_id: id, created_at: now, ...body })
    if (ins.error) throw new Error(ins.error.message)
  }
}

/** The team's names for the built-in types and buttons (ai_settings call_type_names, v144). */
async function readNames(supabase: Supa): Promise<TypeNames> {
  const { data } = await supabase.from('ai_settings').select('value').eq('key', 'call_type_names').maybeSingle()
  return cleanNames(data?.value)
}

// ---------- Fathom ----------

export async function moreCalls(cursor: string): Promise<Res<{ items: FtCall[]; next: string | null }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  try {
    const r = await ftList(cut(cursor, 2000))
    return { ok: true, items: r.items, next: r.next }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}

export async function callTranscript(id: string): Promise<Res<{ lines: FtLine[] }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  if (!CALL_ID.test(str(id))) return { ok: false, error: 'That is not a Fathom call.' }
  try {
    return { ok: true, lines: await ftTranscript(str(id)) }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}

/** Whether Fathom plays these share links for anyone, or only for people signed in to its team. */
export async function callAccess(tokens: string[]): Promise<Res<{ access: Record<string, string> }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const list = (Array.isArray(tokens) ? tokens : []).map(str).filter((t) => /^[A-Za-z0-9_-]{8,64}$/.test(t)).slice(0, 25)
  if (!list.length) return { ok: true, access: {} }
  try {
    return { ok: true, access: await ftAccess(list) }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}

export async function fathomKey(): Promise<Res<{ connected: boolean; hint: string; updatedBy: string; updatedAt: string; error: string }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  try {
    return { ok: true, ...(await ftStatus()), error: '' }
  } catch (e) {
    return { ok: true, connected: false, hint: '', updatedBy: '', updatedAt: '', error: msgOf(e) }
  }
}

export async function connectFathom(key: string): Promise<Done> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const k = str(key).trim()
  if (k.length < 10) return { ok: false, error: 'Paste the whole API key from Fathom.' }
  try {
    await ftConnect(k.slice(0, 500))
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  refresh()
  return { ok: true }
}

export async function disconnectFathom(): Promise<Done> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  try {
    await ftDisconnect()
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  refresh()
  return { ok: true }
}

// ---------- details, call types ----------

export type DetailsInput = {
  title: string
  type: string
  client: string
  folder: string
  /** the people on the call; empty when they are Fathom's own list */
  guests: Guest[]
  tags: string
  description: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Edit details: saved for the whole team; Fathom is not changed. */
export async function saveCallDetails(id: string, input: DetailsInput): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!CALL_ID.test(str(id))) return { ok: false, error: 'That is not a Fathom call.' }
  const guests: Guest[] = []
  for (const g of Array.isArray(input?.guests) ? input.guests : []) {
    const name = cut(g?.name, 80)
    const email = cut(g?.email, 120).toLowerCase()
    if (!name && !email) continue
    if (email && !EMAIL.test(email)) return { ok: false, error: `“${email}” does not look like an email address.` }
    guests.push({ name, email, external: g?.external === true })
  }
  const type = cut(input?.type, 30)
  try {
    await saveMeta(
      await createClient(),
      str(id),
      {
        title: cut(input?.title, 200) || null,
        folder: cut(input?.folder, 120) || null,
        client: cut(input?.client, 120) || null,
        meeting_type: type || null,
        tags: cleanTags(str(input?.tags)),
        description: cut(input?.description, 2000) || null,
        guests,
      },
      user.email,
    )
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true }
}

export async function setCallType(id: string, type: string): Promise<Res<{ toast: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!CALL_ID.test(str(id))) return { ok: false, error: 'That is not a Fathom call.' }
  const t = cut(type, 30)
  if (/[<>{}[\]\\]/.test(t)) return { ok: false, error: 'Could not save the call type: that is not a call type.' }
  const supabase = await createClient()
  try {
    await saveMeta(supabase, str(id), { meeting_type: t || null }, user.email)
  } catch (e) {
    return { ok: false, error: 'Could not save the call type: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: t ? `Call type: ${typeLabel(t, await readNames(supabase).catch(() => ({})))}.` : 'Call type cleared. The AI’s pick shows until one is set.' }
}

/** A call type of the team's own; a name the list has already (in any case) is that one. */
export async function addCallType(name: string): Promise<Res<{ name: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const v = str(name).replace(/\s+/g, ' ').trim().slice(0, 30)
  const supabase = await createClient()
  const bad = newTypeProblem(v, await readNames(supabase).catch(() => ({})))
  if (bad) return { ok: false, error: bad }
  const cur = await supabase.from('ai_settings').select('value').eq('key', 'call_types').maybeSingle()
  if (cur.error) return { ok: false, error: 'Could not add it: ' + cur.error.message }
  const list = customTypes(cur.data?.value)
  const have = list.find((x) => x.toLowerCase() === v.toLowerCase())
  if (have) return { ok: true, name: have }
  const at = new Date().toISOString()
  const { error } = await supabase
    .from('ai_settings')
    .upsert({ key: 'call_types', value: [...list, v], updated_by: user.email, updated_at: at }, { onConflict: 'key' })
  if (error) return { ok: false, error: 'Could not add it: ' + error.message }
  refresh()
  return { ok: true, name: v }
}

// ---------- post-call actions ----------

export async function setAutoActions(on: boolean): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const { error } = await (await createClient())
    .from('ai_settings')
    .upsert({ key: 'call_auto_actions', value: !!on, updated_by: user.email, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return { ok: false, error: 'Could not save that: ' + error.message }
  refresh()
  return { ok: true }
}

export type WriteInput = {
  call: { id: string; title: string; start: string; invitees: Guest[]; summary: string; actions: { text: string }[] }
  /** the type picked for the run ('' lets the AI work it out, unless the team set one) */
  type: string
  /** the type the team has set on the call */
  savedType: string
  notes: string
}

/** Write post-call actions: Meetings · Post-call Actions writes them from the call; the page then checks back. */
export async function writePostCall(input: WriteInput): Promise<Res<{ since: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const c = input?.call
  if (!c || !CALL_ID.test(str(c.id))) return { ok: false, error: 'That is not a Fathom call.' }
  const picked = cut(input.type, 30)
  const saved = cut(input.savedType, 30)
  if (picked && picked !== saved) {
    try {
      await saveMeta(await createClient(), str(c.id), { meeting_type: picked }, user.email)
    } catch (e) {
      return { ok: false, error: 'Could not save the call type: ' + msgOf(e) }
    }
  }
  const type = picked || saved
  const t0 = Date.now()
  try {
    const j = await callN8n<{ ok?: boolean; message?: string }>(
      'call-actions',
      {
        call: {
          id: str(c.id),
          title: cut(c.title, 300),
          start: str(c.start) || null,
          invitees: (Array.isArray(c.invitees) ? c.invitees : []).slice(0, 60).map((g) => ({ name: cut(g?.name, 80), email: cut(g?.email, 120), external: g?.external === true })),
          summary: cut(c.summary, 20_000),
          actions: (Array.isArray(c.actions) ? c.actions : []).slice(0, 60).map((a) => ({ text: cut(a?.text, 500) })),
        },
        meeting_type: type || '',
        notes: cut(input.notes, 1500),
      },
      { what: 'post-call actions', workflow: 'Meetings · Post-call Actions' },
    )
    if (j && j.ok === false) return { ok: false, error: j.message || 'It did not start.' }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  return { ok: true, since: new Date(t0 - 10_000).toISOString() }
}

/** The post-call actions written for a call since a run started, if they are there yet. */
export async function postCallSince(id: string, since: string): Promise<Res<{ output: CallOutput | null }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  if (!CALL_ID.test(str(id)) || !Date.parse(str(since))) return { ok: false, error: 'That is not a Fathom call.' }
  const { data, error } = await (await createClient())
    .from('call_outputs')
    .select('*')
    .eq('call_id', str(id))
    .gte('created_at', new Date(Date.parse(str(since))).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return { ok: false, error: error.message }
  const row = (data ?? [])[0] as Record<string, unknown> | undefined
  if (row) refresh()
  return { ok: true, output: row ? normOutput(row) : null }
}

/** A next step ticked or unticked. */
export async function tickTask(outputId: string, taskId: string, done: boolean): Promise<Done> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const { data, error } = await supabase.from('call_outputs').select('tasks').eq('id', str(outputId)).maybeSingle()
  if (error || !data) return { ok: false, error: 'Could not save that tick: ' + (error?.message || 'the actions are gone') }
  const tasks = Array.isArray(data.tasks) ? (data.tasks as Record<string, unknown>[]) : []
  const next = tasks.map((t, i) => ((str(t?.id) || String(i)) === str(taskId) ? { ...t, done: !!done } : t))
  const up = await supabase.from('call_outputs').update({ tasks: next, updated_at: new Date().toISOString() }).eq('id', str(outputId))
  if (up.error) return { ok: false, error: 'Could not save that tick: ' + up.error.message }
  return { ok: true }
}

export type Removed = { ok: true; task: Record<string, unknown>; at: number } | { ok: false; error: string }

/** A task taken off a call's list for the whole team (v143TkDel): read fresh, so a teammate's tick is never lost. It
 * comes back with where it was, for Undo. */
export async function removeTask(outputId: string, taskId: string): Promise<Removed> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const { data, error } = await supabase.from('call_outputs').select('tasks').eq('id', str(outputId)).maybeSingle()
  if (error || !data) return { ok: false, error: 'Could not remove that task: ' + (error?.message || 'the actions are gone') }
  const tasks = Array.isArray(data.tasks) ? (data.tasks as Record<string, unknown>[]) : []
  const at = tasks.findIndex((t, i) => (str(t?.id) || String(i)) === str(taskId))
  if (at < 0) return { ok: false, error: 'Could not remove that task: it is not on the list any more.' }
  const next = tasks.filter((_, i) => i !== at)
  const up = await supabase.from('call_outputs').update({ tasks: next, updated_at: new Date().toISOString() }).eq('id', str(outputId))
  if (up.error) return { ok: false, error: 'Could not remove that task: ' + up.error.message }
  refresh()
  return { ok: true, task: tasks[at], at }
}

/** Undo: the task goes back where it was (or at the end when the list is shorter now); nothing when it is back already. */
export async function restoreTask(outputId: string, task: Record<string, unknown>, at: number): Promise<Done> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const t = task && typeof task === 'object' && !Array.isArray(task) ? task : null
  if (!t || JSON.stringify(t).length > 20_000) return { ok: false, error: 'Could not put it back: that is not a task.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('call_outputs').select('tasks').eq('id', str(outputId)).maybeSingle()
  if (error || !data) return { ok: false, error: 'Could not put it back: ' + (error?.message || 'the actions are gone') }
  const tasks = Array.isArray(data.tasks) ? (data.tasks as Record<string, unknown>[]) : []
  if (str(t.id) && tasks.some((x) => str(x?.id) === str(t.id))) return { ok: true }
  const next = tasks.slice()
  next.splice(Math.max(0, Math.min(Number(at) || 0, next.length)), 0, t)
  const up = await supabase.from('call_outputs').update({ tasks: next, updated_at: new Date().toISOString() }).eq('id', str(outputId))
  if (up.error) return { ok: false, error: 'Could not put it back: ' + up.error.message }
  refresh()
  return { ok: true }
}

// ---------- Slack ----------

export type SlackChannel = { id: string; name: string; member: boolean }

export async function slackChannels(): Promise<Res<{ channels: SlackChannel[] }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  try {
    const j = await callN8n<{ ok?: boolean; message?: string; channels?: unknown[] }>(
      'slack-proxy',
      { action: 'channels' },
      { what: 'Slack', workflow: 'Integrations · Slack Proxy', timeoutMs: 20_000 },
    )
    if (!j || j.ok === false) return { ok: false, error: (j && j.message) || 'Slack did not answer.' }
    const channels = (Array.isArray(j.channels) ? j.channels : []).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>
      return { id: str(o.id), name: str(o.name), member: !!o.member }
    })
    return { ok: true, channels: channels.filter((c) => c.id) }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}

export async function slackPost(outputId: string, channel: string, text: string): Promise<Done> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const ch = cut(channel, 40)
  const t = str(text).slice(0, 3500)
  if (!ch) return { ok: false, error: 'Pick a channel.' }
  if (!t.trim()) return { ok: false, error: 'Write the message first.' }
  try {
    const j = await callN8n<{ ok?: boolean; message?: string }>('slack-proxy', { action: 'post', channel: ch, text: t }, { what: 'Slack', workflow: 'Integrations · Slack Proxy' })
    if (!j || !j.ok) return { ok: false, error: (j && j.message) || 'Slack did not take it.' }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  if (outputId) {
    // the post went out; a failure to note it only leaves "Shared to Slack" off
    await (await createClient()).from('call_outputs').update({ slack_posted_at: new Date().toISOString() }).eq('id', str(outputId))
  }
  refresh()
  return { ok: true }
}

// ---------- HubSpot ----------

export type CrmInput = { title: string; start: string; end: string; emails: string[]; body: string }

/** Sync to HubSpot: the call is logged on the client's contacts (Meetings · Call to HubSpot). */
export async function syncCallToHubspot(id: string, input: CrmInput): Promise<Res<{ toast: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!CALL_ID.test(str(id))) return { ok: false, error: 'That is not a Fathom call.' }
  const emails = (Array.isArray(input?.emails) ? input.emails : []).map((e) => cut(e, 120)).filter((e) => EMAIL.test(e)).slice(0, 20)
  if (!emails.length) return { ok: false, error: 'Add the client’s email under the call’s guests first.' }
  const supabase = await createClient()
  let j: { ok?: boolean; code?: string; message?: string; synced_at?: string; engagement_id?: unknown; contacts?: unknown[] }
  try {
    j = await callN8n(
      'call-to-crm',
      { call_id: str(id), title: cut(input.title, 300), start: str(input.start) || null, end: str(input.end) || null, emails, body: str(input.body).slice(0, 20_000) },
      { what: 'HubSpot', workflow: 'Meetings · Call to HubSpot' },
    )
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  if (j && j.ok) {
    const contacts = (Array.isArray(j.contacts) ? j.contacts : []).map((c) => {
      const o = (c ?? {}) as Record<string, unknown>
      return { name: str(o.name), email: str(o.email) }
    })
    try {
      await saveMeta(supabase, str(id), { crm_synced_at: j.synced_at || new Date().toISOString(), crm_result: { ok: true, engagement_id: j.engagement_id ?? null, contacts } }, user.email)
    } catch {
      // logged in HubSpot; only the line saying so is missing
    }
    refresh()
    return { ok: true, toast: 'Logged in HubSpot on ' + contacts.map((c) => c.name || c.email).join(', ') + '.' }
  }
  const message = (j && j.message) || 'HubSpot did not take it.'
  try {
    await saveMeta(supabase, str(id), { crm_result: { ok: false, code: (j && j.code) || '', message } }, user.email)
  } catch {
    // the message still shows
  }
  refresh()
  return { ok: false, error: message }
}


// ---------- folders and call types (v144Save) ----------

export type FoldersTypesInput = {
  /** a folder renamed, with every call filed in it (they all take the new name) */
  fRen: { from: string; to: string; ids: string[] }[]
  fDel: string[]
  fNew: string[]
  /** the team's own types renamed ([from, to]) or deleted, and added */
  tRen: [string, string][]
  tDel: string[]
  tNew: string[]
  /** the built-in types' and buttons' names ({key or cat:<button>: name}; '' is the usual name), or null when unchanged */
  names: Record<string, string> | null
}

const BAD_NAME = /[<>{}[\]\\]/
const clean = (t: unknown, max: number) => str(t).replace(/\s+/g, ' ').trim().slice(0, max)

/** An ai_settings value, saved as the current dashboard saves one (v96Set). */
async function putSetting(supabase: Supa, key: string, value: unknown, by: string) {
  const { error } = await supabase.from('ai_settings').upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

async function readList(supabase: Supa, key: string): Promise<string[]> {
  const { data, error } = await supabase.from('ai_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return (Array.isArray(data?.value) ? (data.value as unknown[]) : []).map((x) => str(x))
}

/**
 * Folders and types for the whole team (v144Save): the calls in a renamed folder take its new name, a deleted folder
 * comes off the calls it was set on, the team's own folders (call_folders) follow; the team's own types are renamed or
 * cleared on every call that has one (call_meta, and the AI's pick on call_outputs for a rename), then call_types; the
 * built-in types' and buttons' names go in call_type_names.
 */
export async function saveFoldersTypes(input: FoldersTypesInput): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const by = user.email
  const fRen = (Array.isArray(input?.fRen) ? input.fRen : []).slice(0, 200).map((r) => ({
    from: clean(r?.from, 120),
    to: clean(r?.to, 80),
    ids: (Array.isArray(r?.ids) ? r.ids : []).map(str).filter((x) => CALL_ID.test(x)).slice(0, 2000),
  }))
  const fDel = (Array.isArray(input?.fDel) ? input.fDel : []).map((x) => clean(x, 120)).filter(Boolean).slice(0, 200)
  const fNew = (Array.isArray(input?.fNew) ? input.fNew : []).map((x) => clean(x, 80)).filter(Boolean).slice(0, 200)
  const tRen = (Array.isArray(input?.tRen) ? input.tRen : []).map((p) => [clean(p?.[0], 30), clean(p?.[1], 30)] as [string, string]).slice(0, 100)
  const tDel = (Array.isArray(input?.tDel) ? input.tDel : []).map((x) => clean(x, 30)).filter(Boolean).slice(0, 100)
  const tNew = (Array.isArray(input?.tNew) ? input.tNew : []).map((x) => clean(x, 30)).filter(Boolean).slice(0, 100)
  if (fRen.some((r) => r.to.length < 2 || BAD_NAME.test(r.to)) || fNew.some((v) => v.length < 2 || BAD_NAME.test(v))) {
    return { ok: false, error: 'Each folder needs a name of two letters or more, in letters, numbers and spaces.' }
  }
  if (tRen.some((p) => !p[0] || p[1].length < 2 || BAD_NAME.test(p[1])) || tNew.some((v) => v.length < 2 || BAD_NAME.test(v))) {
    return { ok: false, error: 'Each of your types needs a name of two letters or more.' }
  }
  let names: Record<string, string> | null = null
  if (input?.names && typeof input.names === 'object') {
    names = {}
    for (const [k, v] of Object.entries(input.names).slice(0, 40)) {
      if (!/^(cat:)?[a-z]{2,20}$/.test(k)) continue
      const n = clean(v, 30)
      if (n && BAD_NAME.test(n)) return { ok: false, error: 'Use letters, numbers and spaces in a type name.' }
      names[k] = n
    }
  }
  const supabase = await createClient()
  try {
    // folders: the calls in a renamed folder take its new name, a deleted folder comes off its calls
    for (const r of fRen) for (const id of r.ids) await saveMeta(supabase, id, { folder: r.to }, by)
    for (const f of fDel) {
      const { error } = await supabase.from('call_meta').update({ folder: null, updated_at: new Date().toISOString(), updated_by: by }).eq('folder', f)
      if (error) throw new Error(error.message)
    }
    if (fRen.length || fDel.length || fNew.length) {
      let L = await readList(supabase, 'call_folders')
      for (const r of fRen) {
        L = L.map((x) => (x === r.from ? r.to : x))
        if (!L.includes(r.to) && !r.ids.length) L.push(r.to)
      }
      L = L.filter((x) => !fDel.includes(x))
      for (const v of fNew) if (!L.includes(v)) L.push(v)
      await putSetting(supabase, 'call_folders', [...new Set(L)], by)
    }
    // the team's own types: renamed or cleared on every call, then the list
    if (tRen.length || tDel.length || tNew.length) {
      for (const [from, to] of tRen) {
        const { error } = await supabase.from('call_meta').update({ meeting_type: to, updated_at: new Date().toISOString(), updated_by: by }).eq('meeting_type', from)
        if (error) throw new Error(error.message)
        await supabase.from('call_outputs').update({ meeting_type: to }).eq('meeting_type', from)
      }
      for (const k of tDel) {
        const { error } = await supabase.from('call_meta').update({ meeting_type: null, updated_at: new Date().toISOString(), updated_by: by }).eq('meeting_type', k)
        if (error) throw new Error(error.message)
      }
      let L = await readList(supabase, 'call_types')
      for (const [from, to] of tRen) L = L.map((x) => (x === from ? to : x))
      L = L.filter((x) => !tDel.includes(x))
      for (const v of tNew) if (!L.some((x) => x.toLowerCase() === v.toLowerCase())) L.push(v)
      await putSetting(supabase, 'call_types', L, by)
    }
    // the built-in names: read fresh and merged (v104SetPatch)
    if (names) {
      const { data, error } = await supabase.from('ai_settings').select('value').eq('key', 'call_type_names').maybeSingle()
      if (error) throw new Error(error.message)
      const cur = data?.value && typeof data.value === 'object' && !Array.isArray(data.value) ? (data.value as Record<string, unknown>) : {}
      await putSetting(supabase, 'call_type_names', { ...cur, ...names }, by)
    }
  } catch (e) {
    refresh()
    return { ok: false, error: 'Could not save everything: ' + msgOf(e) + '. What saved before it stays. Try again in a minute.' }
  }
  refresh()
  return { ok: true }
}
