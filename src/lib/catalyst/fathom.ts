import 'server-only'
import { N8nError, callN8n } from '@/lib/n8n'
import { type FtCall, type FtLine, normCall } from './calls'

// Fathom, read through n8n's Dashboard · Fathom Proxy, as the current dashboard's Calls page reads it (apFtStatus,
// apFtLoad, apFtMore, apFtTranscript, the share-access check, connect and disconnect): whether the team's key is
// connected, the calls a page at a time, a call's transcript. Nothing is copied into the dashboard.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const WORKFLOW = 'Dashboard · Fathom Proxy'

export type FtStatus = { connected: boolean; hint: string; updatedBy: string; updatedAt: string }

export class FathomError extends Error {
  code: string
  constructor(message: string, code = '') {
    super(message)
    this.code = code
  }
}

type Answer = { ok?: boolean; code?: string; message?: string } & Record<string, unknown>

async function ask(body: Record<string, unknown>, timeoutMs?: number): Promise<Answer> {
  let j: Answer
  try {
    j = await callN8n<Answer>('fathom-proxy', body, { what: 'Fathom', workflow: WORKFLOW, timeoutMs })
  } catch (e) {
    throw new FathomError(e instanceof Error ? e.message : 'Fathom did not answer.', e instanceof N8nError ? (e.code ?? '') : '')
  }
  if (!j || j.ok === false) throw new FathomError(str(j?.message) || 'Fathom did not answer.', str(j?.code))
  return j
}

/** Whether the team's Fathom key is connected, its last characters, and who added it. */
export async function ftStatus(): Promise<FtStatus> {
  const j = await ask({ action: 'status' })
  return { connected: j.connected === true, hint: str(j.hint), updatedBy: str(j.updated_by), updatedAt: str(j.updated_at) }
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

/** Whether Fathom plays each share link for anyone ('team' when only its team can watch), 25 at a time. */
export async function ftAccess(tokens: string[]): Promise<Record<string, string>> {
  const j = await ask({ action: 'access', tokens: tokens.slice(0, 25) })
  const a = j.access && typeof j.access === 'object' ? (j.access as Record<string, unknown>) : {}
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, str(v)]))
}

export async function ftConnect(key: string): Promise<void> {
  await ask({ action: 'connect', key })
}

export async function ftDisconnect(): Promise<void> {
  await ask({ action: 'disconnect' })
}
