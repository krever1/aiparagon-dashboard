'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import {
  type CallOutput, type FtCall, type FtLine, type Guest, cleanTags, customTypes, newTypeProblem, normOutput, typeLabel,
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
  try {
    await saveMeta(await createClient(), str(id), { meeting_type: t || null }, user.email)
  } catch (e) {
    return { ok: false, error: 'Could not save the call type: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: t ? `Call type: ${typeLabel(t)}.` : 'Call type cleared. The AI’s pick shows until one is set.' }
}

/** A call type of the team's own; a name the list has already (in any case) is that one. */
export async function addCallType(name: string): Promise<Res<{ name: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const v = str(name).replace(/\s+/g, ' ').trim().slice(0, 30)
  const bad = newTypeProblem(v)
  if (bad) return { ok: false, error: bad }
  const supabase = await createClient()
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

