'use server'

import { getCurrentUser } from '@/lib/auth'
import { callN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

// Send to Notion (v144Notion, v144NotionSend, v144NtMark), on the server as the signed-in teammate: picked tasks go to a
// Notion database the team picks, one entry each, through Dashboard · Notion Proxy (its add takes a title only), so only
// databases shared with the n8n Notion connection can be picked. The database last used is kept for the team
// (ai_settings notion_tasks_db), and what went where per call (notion_sent), so a second send says so first.

const SIGNED_OUT = 'You are signed out. Sign in again.'
const CALL_ID = /^[\w-]{1,80}$/
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'no answer'

type Res<T> = ({ ok: true } & T) | { ok: false; error: string }
export type NotionDb = { id: string; name: string }
export type NotionSent = { db: string; name: string; n: number; at: string; by: string }

type NtAnswer = { object?: string; message?: string; code?: string; results?: unknown[] }

/** One call to the Notion proxy; an answer that is an error throws its message (apNt). */
async function nt(action: string, extra: Record<string, unknown> = {}): Promise<unknown[]> {
  const j = await callN8n<NtAnswer>('notion-proxy', { action, ...extra }, { what: 'Notion', workflow: 'Dashboard · Notion Proxy' })
  if (!j || j.object === 'error') throw new Error(str(j?.message) || 'Notion did not answer.')
  return Array.isArray(j.results) ? j.results : []
}

const plain = (rt: unknown) =>
  (Array.isArray(rt) ? rt : [])
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>
      return o.plain_text != null ? str(o.plain_text) : str((o.text as Record<string, unknown> | undefined)?.content)
    })
    .join('')

/** A database's name as Notion keeps it (apNtTitle). */
const dbName = (d: Record<string, unknown>) => plain(d.title) || 'Untitled database'

const json = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  try {
    const x = JSON.parse(str(v))
    return x && typeof x === 'object' && !Array.isArray(x) ? x : {}
  } catch {
    return {}
  }
}

/** The databases Notion shares with the dashboard, sorted by nothing (the dialog sorts them). */
async function sharedDbs(): Promise<NotionDb[]> {
  return (await nt('databases'))
    .map((d) => (d ?? {}) as Record<string, unknown>)
    .filter((d) => (d.object === 'database' || !d.object) && d.id)
    .map((d) => ({ id: str(d.id), name: dbName(d) }))
}

const readErr = (e: unknown) => {
  const m = msgOf(e)
  return /switched off|404/i.test(m) ? 'The Notion connection is switched off in n8n.' : 'Notion could not be read: ' + m + '.'
}

/** The databases Notion shares with the dashboard, the one used last, and what this call sent before. */
export async function notionStart(callId: string): Promise<Res<{ dbs: NotionDb[]; pick: string; sent: NotionSent | null }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  let dbs: NotionDb[]
  let pick = ''
  let sent: NotionSent | null = null
  try {
    const { data } = await supabase.from('ai_settings').select('key,value').in('key', ['notion_tasks_db', 'notion_sent'])
    const by: Record<string, Record<string, unknown>> = {}
    for (const r of (data ?? []) as { key: string; value: unknown }[]) by[r.key] = json(r.value)
    pick = str(by.notion_tasks_db?.id)
    const s = json(by.notion_sent?.[str(callId)])
    if (s.db || s.n) sent = { db: str(s.db), name: str(s.name), n: Number(s.n) || 0, at: str(s.at), by: str(s.by) }
    dbs = await sharedDbs()
  } catch (e) {
    return { ok: false, error: readErr(e) }
  }
  return { ok: true, dbs, pick, sent }
}

/** The databases Notion shares with the dashboard and the one used last, for a send that is not a call's (v151Notion). */
export async function notionDatabases(): Promise<Res<{ dbs: NotionDb[]; pick: string; sent: null }>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  let dbs: NotionDb[]
  let pick = ''
  try {
    const { data } = await supabase.from('ai_settings').select('value').eq('key', 'notion_tasks_db').maybeSingle()
    pick = str(json(data?.value).id)
    dbs = await sharedDbs()
  } catch (e) {
    return { ok: false, error: readErr(e) }
  }
  return { ok: true, dbs, pick, sent: null }
}

/** One entry in the database, named by its title. */
export async function notionAdd(db: string, title: string): Promise<Res<object>> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const id = str(db).trim()
  const t = str(title).trim()
  if (!id || id.length > 100 || !t) return { ok: false, error: 'Pick a database first.' }
  try {
    const r = await nt('add', { id, title: t.length > 300 ? t.slice(0, 299) + '…' : t })
    if (!r.length) throw new Error('Notion did not add it.')
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  return { ok: true }
}

/** What went where for this call (added to what it sent to the same database before), and the database used last. */
export async function notionMark(callId: string, db: string, name: string, n: number): Promise<Res<object>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(callId)
  if (!CALL_ID.test(id) || !str(db)) return { ok: false, error: 'That is not a call.' }
  const supabase = await createClient()
  const at = new Date().toISOString()
  const rec = { db: str(db), name: str(name).slice(0, 200) || 'Untitled database', n: Math.max(0, Math.floor(Number(n) || 0)), at, by: user.email }
  try {
    const { data, error } = await supabase.from('ai_settings').select('value').eq('key', 'notion_sent').maybeSingle()
    if (error) throw new Error(error.message)
    const cur = json(data?.value)
    const prev = json(cur[id])
    const next = { ...cur, [id]: { ...rec, n: (str(prev.db) === rec.db ? Number(prev.n) || 0 : 0) + rec.n } }
    const a = await supabase.from('ai_settings').upsert({ key: 'notion_sent', value: next, updated_by: user.email, updated_at: at }, { onConflict: 'key' })
    if (a.error) throw new Error(a.error.message)
    const b = await supabase
      .from('ai_settings')
      .upsert({ key: 'notion_tasks_db', value: { id: rec.db, name: rec.name, by: rec.by, at }, updated_by: user.email, updated_at: at }, { onConflict: 'key' })
    if (b.error) throw new Error(b.error.message)
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  return { ok: true }
}
