import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Calls to the n8n workflows, from the server only. Every dashboard webhook checks its caller: the request carries
// the signed-in teammate's Supabase access token as `auth` in the JSON body, as the current dashboard sends it.
// N8N_WEBHOOK_URL points the calls elsewhere (the tests' stand-in); it is not secret, and it is read only here.

const BASE = (process.env.N8N_WEBHOOK_URL || 'https://n8n.aiparagonconsulting.com/webhook').replace(/\/+$/, '')

export class N8nError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

async function accessToken(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * POSTs `body` (plus `auth`) to /webhook/<path> and returns the JSON answer. `what` names the connection in errors,
 * `workflow` the n8n workflow to switch on when the webhook is not there. An answer of {code: 'unauthorized'} (the
 * proxies' way of turning a caller away) is an error, as is anything but a 2xx.
 */
export async function callN8n<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  { what, workflow, timeoutMs = 60_000 }: { what: string; workflow: string; timeoutMs?: number },
): Promise<T> {
  const auth = await accessToken()
  if (!auth) throw new N8nError(`Sign in again to use ${what}.`, 'unauthorized')
  let res: Response
  try {
    res = await fetch(BASE + '/' + path.replace(/^\/+/, ''), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, auth }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new N8nError(`The ${what} connection took too long to answer. Try again in a minute.`, 'timeout')
    }
    throw new N8nError(`Could not reach the ${what} connection. Try again in a minute.`, 'network')
  }
  if (res.status === 404) throw new N8nError(`The ${what} workflow in n8n is switched off. Turn on “${workflow}” in n8n.`, 'off')
  if (res.status === 401 || res.status === 403) throw new N8nError(`n8n turned the request away. Sign in again and try once more.`, 'unauthorized')
  if (!res.ok) throw new N8nError(`The ${what} connection answered with an error (${res.status}). Try again in a minute.`, 'status')
  let j: unknown
  try {
    j = await res.json()
  } catch {
    throw new N8nError(`The ${what} connection sent back something unreadable.`, 'unreadable')
  }
  const o = j as Record<string, unknown> | null
  if (o && o.code === 'unauthorized') throw new N8nError(`n8n turned the request away. Sign in again and try once more.`, 'unauthorized')
  return j as T
}
