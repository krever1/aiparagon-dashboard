'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { N8nError, callN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

// Send to Asana through the team's connection (Integrations · Asana Proxy, `asana-proxy`), on the server as the signed-in
// teammate, for a browser with no Asana token of its own (apAs's second path). The proxy answers {ok:false, code:
// 'not_connected'} while n8n has no Asana login, and n8n 404s while the workflow is off: either way the window shows
// Connect Asana in 3 steps instead of an error. A personal token never comes here: the browser sends it to Asana itself.
// Also what went where: `call_outputs.asana` for a call's tasks (apCxAsanaSend's shape).

const SIGNED_OUT = 'You are signed out. Sign in again.'
const GID = /^[\w-]{1,64}$/
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'no answer'
const OPTS = { what: 'Asana', workflow: 'Integrations · Asana Proxy' }

type Fail = { ok: false; connect: boolean; error: string }
export type AsanaRef = { gid: string; name: string }
export type AsanaMade = { gid: string; name: string; url: string }
type Answer = {
  ok?: boolean
  code?: string
  message?: string
  workspace?: { gid?: string; name?: string }
  projects?: unknown[]
  users?: unknown[]
  created?: unknown[]
  failed?: number
}

const refs = (v: unknown): AsanaRef[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => x.gid)
    .map((x) => ({ gid: str(x.gid), name: str(x.name) || 'Untitled' }))

/** A proxy call; an answer that says not connected, or a workflow that is off, asks for the 3 steps. */
async function ask(action: string, extra: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<Answer | Fail> {
  let j: Answer
  try {
    j = await callN8n<Answer>('asana-proxy', { action, ...extra }, { ...OPTS, timeoutMs })
  } catch (e) {
    const off = e instanceof N8nError && e.code === 'off'
    return { ok: false, connect: off, error: off ? 'Asana is not connected yet.' : msgOf(e) }
  }
  if (!j || j.ok === false) {
    const connect = j?.code === 'not_connected' || j?.code === 'off'
    return { ok: false, connect, error: str(j?.message) || (connect ? 'Asana is not connected in n8n yet.' : 'Asana did not answer.') }
  }
  return j
}

/** The team connection's workspace, projects and people (a failed people read leaves the task unassigned). */
export async function asanaTeamStart(): Promise<{ ok: true; workspace: string; projects: AsanaRef[]; users: AsanaRef[] } | Fail> {
  if (!(await getCurrentUser())) return { ok: false, connect: false, error: SIGNED_OUT }
  const p = await ask('projects')
  if ('connect' in p) return p
  const projects = refs(p.projects)
  // no projects at all from the team's connection: it is as good as not connected (v143's check)
  if (!projects.length) return { ok: false, connect: true, error: 'Asana is not connected yet.' }
  const u = await ask('users')
  return { ok: true, workspace: str(p.workspace?.name), projects, users: 'connect' in u ? [] : refs(u.users) }
}

/** One task through the team connection: its name, description, due date and assignee. */
export async function asanaTeamCreate(
  project: string,
  task: { text: string; notes: string; due: string; assignee: string },
): Promise<{ ok: true; made: AsanaMade } | Fail> {
  if (!(await getCurrentUser())) return { ok: false, connect: false, error: SIGNED_OUT }
  const p = str(project)
  const text = str(task?.text).trim().slice(0, 300)
  if (!GID.test(p)) return { ok: false, connect: false, error: 'Pick a project first.' }
  if (!text) return { ok: false, connect: false, error: 'A task needs a name.' }
  const due = /^\d{4}-\d{2}-\d{2}$/.test(str(task?.due)) ? str(task.due) : ''
  const assignee = GID.test(str(task?.assignee)) ? str(task.assignee) : ''
  const t = { text, notes: str(task?.notes).slice(0, 6000), due, ...(assignee ? { assignee } : {}) }
  const j = await ask('create', { project: p, tasks: [t], ...(assignee ? { assignee } : {}) }, 45_000)
  if ('connect' in j) return j
  const made = (Array.isArray(j.created) ? j.created : []).map((x) => (x ?? {}) as Record<string, unknown>)[0]
  if (!made || !made.gid) return { ok: false, connect: false, error: str(j.message) || 'Asana did not take it.' }
  return { ok: true, made: { gid: str(made.gid), name: str(made.name) || text, url: str(made.url) } }
}

/**
 * What went where for a call's tasks (apCxAsanaSend): `call_outputs.asana` = {at, project, project_name, url, tasks}.
 * `append` adds to what this window already saved for the same project (Send the rest after a stop).
 */
export async function asanaMarkCall(
  outputId: string,
  project: string,
  projectName: string,
  made: AsanaMade[],
  append: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const id = str(outputId)
  const p = str(project)
  if (!id || id.length > 100 || !GID.test(p)) return { ok: false, error: 'That is not a call.' }
  const list = (Array.isArray(made) ? made : []).slice(0, 100).map((m) => ({ gid: str(m?.gid), name: str(m?.name).slice(0, 300), url: str(m?.url).slice(0, 500) }))
  const supabase = await createClient()
  const { data, error } = await supabase.from('call_outputs').select('asana').eq('id', id).maybeSingle()
  if (error || !data) return { ok: false, error: 'Could not save that they went to Asana: ' + (error?.message || 'the actions are gone') }
  let prev: Record<string, unknown> = {}
  try {
    const a = typeof data.asana === 'string' ? JSON.parse(data.asana) : data.asana
    if (a && typeof a === 'object' && !Array.isArray(a)) prev = a
  } catch {
    // an unreadable record is replaced
  }
  const at = new Date().toISOString()
  const before = append && str(prev.project) === p && Array.isArray(prev.tasks) ? (prev.tasks as unknown[]) : []
  const asana = {
    at,
    project: p,
    project_name: str(projectName).slice(0, 200) || 'Asana',
    url: 'https://app.asana.com/0/' + p + '/list',
    tasks: [...before, ...list],
  }
  const up = await supabase.from('call_outputs').update({ asana, updated_at: at }).eq('id', id)
  if (up.error) return { ok: false, error: 'Could not save that they went to Asana: ' + up.error.message }
  refresh()
  return { ok: true }
}
