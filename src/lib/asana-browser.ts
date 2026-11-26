// Asana from the browser (the current dashboard's `asana()` and its `asana_*` keys): a personal access token saved in
// this browser only, sent straight to Asana's API. It never goes to the dashboard's server or the database. This app is on
// another address than the current dashboard, so it keeps its own keys and the two never share a token.
// Without a token, Send to Asana goes through the team's n8n connection instead (src/app/(app)/tasks/asana-actions.ts).

export const ASANA_API = 'https://app.asana.com/api/1.0'
export const ASANA_KEYS = {
  token: 'ap.next.asana.pat',
  workspace: 'ap.next.asana.ws',
  project: 'ap.next.asana.project',
  user: 'ap.next.asana.user',
} as const

type Key = keyof typeof ASANA_KEYS
const listeners = new Set<() => void>()
const mem: Partial<Record<Key, string>> = {}

export function asanaRead(k: Key): string {
  try {
    return localStorage.getItem(ASANA_KEYS[k]) || ''
  } catch {
    return mem[k] || ''
  }
}

export function asanaStore(k: Key, v: string) {
  mem[k] = v
  try {
    if (v) localStorage.setItem(ASANA_KEYS[k], v)
    else localStorage.removeItem(ASANA_KEYS[k])
  } catch {
    // kept for this page only
  }
  if (k === 'token') for (const l of listeners) l()
}

/** Forgets this browser's Asana connection (v143AsDisconnect): the token, the workspace and the project used last. */
export function asanaDisconnect() {
  asanaStore('workspace', '')
  asanaStore('project', '')
  asanaStore('token', '')
}

/** For useSyncExternalStore: whether this browser has a token, kept in step across tabs. */
export function subscribeAsana(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === ASANA_KEYS.token) l()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}
export const hasAsanaToken = () => !!asanaRead('token')

/** Asana turned the token away (401). */
export class AsanaAuthError extends Error {}

/** One call to Asana with this browser's token (or the one given, to check it before it is kept). */
export async function asanaApi<T = unknown>(path: string, { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const tok = token ?? asanaRead('token')
  let res: Response
  try {
    res = await fetch(ASANA_API + path, {
      method,
      headers: { Authorization: 'Bearer ' + tok, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify({ data: body }) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new Error('Couldn’t reach Asana. Try again in a minute.')
  }
  if (res.status === 401) throw new AsanaAuthError('Asana didn’t accept the saved token.')
  if (!res.ok) {
    let msg = ''
    try {
      msg = String(((await res.json()) as { errors?: { message?: string }[] }).errors?.[0]?.message || '')
    } catch {
      // no reason given
    }
    if (res.status >= 500) throw new Error('Asana is having trouble right now (' + res.status + '). Try again in a minute.')
    if (!msg && (res.status === 403 || res.status === 404)) msg = 'You don’t have access to that project in Asana.'
    throw new Error(msg || 'Asana error ' + res.status)
  }
  return ((await res.json()) as { data: T }).data
}

/** What a token looks like (v143AsWire). */
export const looksLikeToken = (t: string) => /^\d\/[\w:/-]{10,}$/.test(t) || /^[\w:/-]{20,}$/.test(t)

export type AsanaPerson = { gid: string; name: string }
export type AsanaProject = { gid: string; name: string }
export type AsanaMade = { gid: string; name: string; url: string }
export type AsanaTask = { text: string; notes: string; due: string; assignee: string }

/** The token's workspace (the one saved, else the first), its projects and its people (apAs projects, v143AsUsers). */
export async function tokenSetup(): Promise<{ workspace: string; projects: AsanaProject[]; users: AsanaPerson[] }> {
  const ws = await asanaApi<{ gid: string; name: string }[]>('/workspaces?limit=100')
  const w = ws.find((x) => x.gid === asanaRead('workspace')) ?? ws[0]
  if (!w) return { workspace: '', projects: [], users: [] }
  const ps = await asanaApi<{ gid: string; name: string }[]>('/projects?workspace=' + encodeURIComponent(w.gid) + '&archived=false&limit=100&opt_fields=name')
  let users: AsanaPerson[] = []
  try {
    const u = await asanaApi<{ gid: string; name?: string; email?: string }[]>('/users?workspace=' + encodeURIComponent(w.gid) + '&opt_fields=name,email&limit=100')
    users = (u ?? []).map((x) => ({ gid: x.gid, name: x.name || x.email || 'Someone' }))
  } catch (e) {
    if (e instanceof AsanaAuthError) throw e
    // nobody to pick: the task goes unassigned
  }
  return { workspace: w.name, projects: ps.map((p) => ({ gid: p.gid, name: p.name })), users }
}

/** One task in the project, with its due date and assignee when given. */
export async function tokenCreate(project: string, t: AsanaTask): Promise<AsanaMade> {
  const r = await asanaApi<{ gid: string; name?: string; permalink_url?: string }>('/tasks?opt_fields=name,permalink_url', {
    method: 'POST',
    body: { name: t.text, notes: t.notes, projects: [project], ...(t.due ? { due_on: t.due } : {}), ...(t.assignee ? { assignee: t.assignee } : {}) },
  })
  return { gid: r.gid, name: r.name || t.text, url: r.permalink_url || '' }
}
