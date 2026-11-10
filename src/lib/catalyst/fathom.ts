import 'server-only'
import { N8nError, callN8n } from '@/lib/n8n'

// Fathom, read through n8n's Dashboard · Fathom Proxy, as the current dashboard's Calls page reads it (apFtStatus,
// apFtLoad, apFtMore, apFtTranscript): whether the team's key is connected, the calls a page at a time, and a call's
// transcript. Nothing is copied into the dashboard.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const WORKFLOW = 'Dashboard · Fathom Proxy'

export type FtPerson = { name: string; email: string; external: boolean }
export type FtAction = { text: string; who: string; t: string; done: boolean; link: string }
export type FtCall = {
  id: string
  title: string
  start: string
  end: string
  shareUrl: string
  url: string
  recordedBy: { name: string; email: string } | null
  invitees: FtPerson[]
  summary: string
  actions: FtAction[]
  sharedWith: string
  /** outside guests on the invite */
  external: boolean
}
export type FtStatus = { connected: boolean; hint: string; updatedBy: string }
export type FtLine = { speaker: string; t: string; text: string }

export class FathomError extends Error {
  code: string
  constructor(message: string, code = '') {
    super(message)
    this.code = code
  }
}

type Answer = { ok?: boolean; code?: string; message?: string } & Record<string, unknown>

async function ask(body: Record<string, unknown>): Promise<Answer> {
  let j: Answer
  try {
    j = await callN8n<Answer>('fathom-proxy', body, { what: 'Fathom', workflow: WORKFLOW })
  } catch (e) {
    throw new FathomError(e instanceof Error ? e.message : 'Fathom did not answer.', e instanceof N8nError ? (e.code ?? '') : '')
  }
  if (!j || j.ok === false) throw new FathomError(str(j?.message) || 'Fathom did not answer.', str(j?.code))
  return j
}

function person(p: unknown): FtPerson {
  const o = (p ?? {}) as Record<string, unknown>
  return { name: str(o.name), email: str(o.email), external: o.external === true }
}

export function normCall(c: unknown): FtCall {
  const o = (c ?? {}) as Record<string, unknown>
  const rb = o.recorded_by && typeof o.recorded_by === 'object' ? (o.recorded_by as Record<string, unknown>) : null
  const invitees = Array.isArray(o.invitees) ? o.invitees.map(person) : []
  const actions = Array.isArray(o.actions)
    ? (o.actions as Record<string, unknown>[]).map((a) => ({
        text: str(a?.text),
        who: str(a?.who),
        t: str(a?.t),
        done: a?.done === true,
        link: str(a?.link),
      }))
    : []
  return {
    id: str(o.id),
    title: str(o.title || o.meeting_title),
    start: str(o.start || o.created_at),
    end: str(o.end),
    shareUrl: str(o.share_url),
    url: str(o.url),
    recordedBy: rb ? { name: str(rb.name), email: str(rb.email) } : null,
    invitees,
    summary: str(o.summary),
    actions,
    sharedWith: str(o.shared_with),
    // with invitees, a client call is one with an outside guest on the invite (apFtNorm)
    external: invitees.length ? invitees.some((i) => i.external) : o.external === true,
  }
}

/** Whether the team's Fathom key is connected, and its last four characters. */
export async function ftStatus(): Promise<FtStatus> {
  const j = await ask({ action: 'status' })
  return { connected: j.connected === true, hint: str(j.hint), updatedBy: str(j.updated_by) }
}

/** A page of calls, newest first, and the cursor for the older ones. */
export async function ftList(cursor?: string): Promise<{ items: FtCall[]; next: string | null }> {
  const j = await ask(cursor ? { action: 'list', cursor } : { action: 'list' })
  const items = (Array.isArray(j.items) ? j.items : []).filter((c) => c && (c as Record<string, unknown>).id != null).map(normCall)
  return { items, next: str(j.next_cursor) || null }
}

/** A call's transcript, line by line. */
export async function ftTranscript(id: string): Promise<FtLine[]> {
  const j = await ask({ action: 'transcript', id: String(id) })
  return (Array.isArray(j.transcript) ? j.transcript : []).map((l) => {
    const o = (l ?? {}) as Record<string, unknown>
    return { speaker: str(o.speaker), t: str(o.t), text: str(o.text) }
  })
}
