'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { buildLeads, leadEmails } from '@/lib/catalyst/leads'
import { findLead, readCatalyst } from '@/lib/catalyst/load'
import { WS_KEY, fileCall, readSetting } from '@/lib/catalyst/run'
import { patchSetting } from '@/lib/catalyst/settings'
import { newKey, objOf } from '@/lib/catalyst/setup'
import type { Stage } from '@/lib/catalyst/stages'
import { type WsInfo, type WsItemMeta, type WsMeta, logChanges, wsFolders, wsMetaOf } from '@/lib/catalyst/workspace'
import { createClient } from '@/lib/supabase/server'

// The client workspace's changes (v145WsStar, v145WsMove, v145WsNewFolder, v145WsEditGo, v145WsDel, with v146's
// fixes), kept for the team in ai_settings `catalyst_ws` under the lead's email in lower case. Since v153 every save
// logs what changed on each item (`log`, the same shape the current dashboard writes), and the preview panel and the
// folder suggestions have their own actions (wsInfo, wsSet, wsFileMany).

export type WsResult = { ok: true; toast: string; ws: WsMeta; id?: string } | { ok: false; error: string }

type Supa = Awaited<ReturnType<typeof createClient>>
const SIGNED_OUT = 'You are signed out. Sign in again.'
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'something went wrong'
const KEY = /^(a:[a-z_]{1,40}|p:[\w-]{1,40}|f:[\w-]{1,80}|c:[\w-]{1,80})$/
const BUCKET = 'lead-files'

async function ctx(leadId: string) {
  const user = await getCurrentUser()
  if (!user) return { error: SIGNED_OUT } as const
  const read = await readCatalyst()
  const lead = findLead(buildLeads(read.rows, read.outs).leads, String(leadId))
  if (!lead) return { error: 'Could not find this lead any more. Refresh the page.' } as const
  const supabase = await createClient()
  const meta = wsMetaOf(objOf(await readSetting(supabase, WS_KEY)), lead.email)
  return { user, lead, stages: read.stages, supabase, meta }
}

type Ctx = Exclude<Awaited<ReturnType<typeof ctx>>, { error: string }>

/**
 * Change this lead's workspace (v145WsPut): read fresh, change, save under its email in lower case. What changed on
 * each item is logged on it (v153), by the teammate's name.
 */
async function put(c: Pick<Ctx, 'supabase' | 'lead' | 'user' | 'stages'>, fn: (m: WsMeta) => void): Promise<WsMeta> {
  const em = c.lead.email.toLowerCase()
  const out = await patchSetting(c.supabase, WS_KEY, c.user.email, (cur) => {
    const m = wsMetaOf(cur, em)
    const raw = objOf(cur[em])
    const before = JSON.parse(JSON.stringify(m.items)) as Record<string, WsItemMeta>
    const next = { ...raw, folders: m.folders, items: { ...m.items } }
    fn(next)
    const names = wsFolders(c.stages, next)
    logChanges(before, next.items, (id) => names.find((f) => f.id === id)?.name ?? '', new Date().toISOString(), c.user.name || c.user.email)
    return { [em]: next }
  })
  return wsMetaOf(out, em)
}

const folderOk = (stages: Stage[], meta: WsMeta, f: string) => !f || wsFolders(stages, meta).some((x) => x.id === f)

/** Where a call is filed now (call_meta.lead_stage). */
async function filedNow(supabase: Supa, callId: string): Promise<string> {
  const { data } = await supabase.from('call_meta').select('lead_stage').eq('call_id', callId).maybeSingle()
  return String(data?.lead_stage ?? '')
}

/** A call moved to a stage folder is filed under that stage; a move remembers where the call is filed then (v146). */
async function fileForMove(c: Ctx, key: string, folder: string): Promise<{ stage?: string }> {
  if (!key.startsWith('c:')) return {}
  const id = key.slice(2)
  if (c.stages.some((s) => s.key === folder)) {
    const meta = await c.supabase.from('call_meta').select('meeting_type').eq('call_id', id).maybeSingle()
    await fileCall(c.supabase, { id, type: String(meta.data?.meeting_type ?? '') }, c.lead.email, folder, c.user.email, await readSetting(c.supabase, 'catalyst_stage_setup'))
  }
  return { stage: await filedNow(c.supabase, id) }
}

export async function wsStar(leadId: string, key: string): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  if (!KEY.test(String(key))) return { ok: false, error: 'That is not in the workspace.' }
  try {
    const cur = !!c.meta.items[key]?.star
    const ws = await put(c, (m) => {
      m.items[key] = { ...m.items[key], star: !cur }
    })
    return { ok: true, toast: '', ws }
  } catch (e) {
    return { ok: false, error: 'Could not save the star: ' + msgOf(e) }
  }
}

export async function wsMove(leadId: string, key: string, folder: string): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  if (!KEY.test(String(key))) return { ok: false, error: 'That is not in the workspace.' }
  const f = String(folder ?? '')
  if (!folderOk(c.stages, c.meta, f)) return { ok: false, error: 'That folder is gone. Refresh the page.' }
  try {
    const extra = await fileForMove(c, key, f)
    const ws = await put(c, (m) => {
      m.items[key] = { ...m.items[key], folder: f, ...extra }
    })
    if (key.startsWith('c:')) refresh()
    const name = wsFolders(c.stages, ws).find((x) => x.id === f)?.name
    return { ok: true, toast: f ? 'Moved to ' + (name || 'the folder') + '.' : 'Moved to To organize.', ws }
  } catch (e) {
    return { ok: false, error: 'Could not move it: ' + msgOf(e) }
  }
}

export async function wsNewFolder(leadId: string, name: string): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!n) return { ok: false, error: 'Give the folder a name.' }
  if (wsFolders(c.stages, c.meta).some((f) => f.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'There is already a folder called ' + n + '.' }
  if (c.meta.folders.length >= 40) return { ok: false, error: 'Forty folders is the most a client can have.' }
  const id = newKey('wf')
  try {
    const ws = await put(c, (m) => {
      m.folders = [...m.folders, { id, name: n }]
    })
    return { ok: true, toast: 'Folder added.', ws, id }
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
}

/**
 * Edit an item (v145WsEditGo). Since v153 only what the window changed is sent and saved (a field left out stays as it
 * is), so a save logs only real changes: an item's usual name, folder or description is not taken for a rename, a
 * move or a new description.
 */
export async function wsEdit(leadId: string, key: string, input: { name?: string; folder?: string; desc?: string; source?: boolean }): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  if (!KEY.test(String(key))) return { ok: false, error: 'That is not in the workspace.' }
  const item: WsItemMeta = {}
  if (input?.name !== undefined) {
    const name = String(input.name ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 120)
    if (!name) return { ok: false, error: 'Give it a name.' }
    item.name = name
  }
  if (input?.folder !== undefined) {
    const f = String(input.folder ?? '')
    if (!folderOk(c.stages, c.meta, f)) return { ok: false, error: 'That folder is gone. Refresh the page.' }
    item.folder = f
  }
  if (input?.desc !== undefined) item.desc = String(input.desc ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 600)
  if (key.startsWith('f:') && typeof input?.source === 'boolean') item.source = input.source
  if (!Object.keys(item).length) return { ok: true, toast: 'Nothing changed.', ws: c.meta }
  try {
    const extra = item.folder !== undefined ? await fileForMove(c, key, item.folder) : {}
    const ws = await put(c, (m) => {
      m.items[key] = { ...m.items[key], ...item, ...extra }
    })
    if (key.startsWith('c:') && item.folder !== undefined) refresh()
    return { ok: true, toast: 'Saved.', ws }
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
}

/** Delete an upload (v146): the file first, and its workspace entry only once the file is gone. */
export async function wsDelete(leadId: string, key: string): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  if (!/^f:[\w-]{1,80}$/.test(String(key))) return { ok: false, error: 'Only an upload can be deleted.' }
  const id = key.slice(2)
  const emails = [...new Set(leadEmails(c.lead).flatMap((e) => [e, e.toLowerCase()]))]
  const { data: row } = await c.supabase.from('lead_files').select('id,file_name,file_path,lead_email').eq('id', id).maybeSingle()
  if (!row || !emails.includes(String(row.lead_email))) return { ok: false, error: 'Could not find this file any more. Refresh the page.' }
  const name = String(c.meta.items[key]?.name || row.file_name || 'The file')
  const { data, error } = await c.supabase.from('lead_files').delete().eq('id', id).select('id')
  if (error) return { ok: false, error: 'Could not delete ' + name + ': Supabase turned the delete away (' + error.message + ').' }
  if (!data?.length) return { ok: false, error: 'Could not delete ' + name + ': Supabase kept the file (no delete rule for this account).' }
  if (row.file_path) {
    try {
      await c.supabase.storage.from(BUCKET).remove([String(row.file_path)])
    } catch {
      // the row is gone; the stored file stays
    }
  }
  let ws = c.meta
  try {
    ws = await put(c, (m) => {
      delete m.items[key]
    })
  } catch {
    // the file is gone; its entry is left and shows nowhere
  }
  refresh()
  return { ok: true, toast: name + ' deleted.', ws }
}

/**
 * What went to Notion (v151Put, v151NotionSend): each item sent gets `notion` {at, by, db, name} on its workspace entry,
 * read fresh and merged (the item's other fields, other items and other leads kept). Once everything picked went, the
 * database is also kept for the team as the one used last (`notion_tasks_db`, as Tasks keeps it).
 */
/**
 * What went where after Send to Asana (v151AsanaSend): each item sent gets `asana` {at, by, project, project_name, url}
 * on its entry, read fresh and merged (its other fields, other items and other leads kept).
 */
export async function wsAsanaMark(leadId: string, keys: string[], project: string, projectName: string): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  const ks = [...new Set((Array.isArray(keys) ? keys : []).map(String))].filter((k) => KEY.test(k)).slice(0, 200)
  const p = String(project ?? '').trim()
  if (!/^[\w-]{1,64}$/.test(p)) return { ok: false, error: 'Pick a project first.' }
  const rec = {
    at: new Date().toISOString(),
    by: c.user.email,
    project: p,
    project_name: String(projectName ?? '').slice(0, 200) || 'Asana',
    url: 'https://app.asana.com/0/' + p + '/list',
  }
  try {
    const ws = ks.length
      ? await put(c, (m) => {
          for (const k of ks) m.items[k] = { ...m.items[k], asana: rec }
        })
      : c.meta
    return { ok: true, toast: '', ws }
  } catch (e) {
    return { ok: false, error: 'Could not save where they went: ' + msgOf(e) }
  }
}

export async function wsNotionMark(leadId: string, keys: string[], db: string, name: string, all: boolean): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  const ks = [...new Set((Array.isArray(keys) ? keys : []).map(String))].filter((k) => KEY.test(k)).slice(0, 200)
  const id = String(db ?? '').trim()
  if (!id || id.length > 100) return { ok: false, error: 'Pick a database first.' }
  const at = new Date().toISOString()
  const rec = { at, by: c.user.email, db: id, name: String(name ?? '').slice(0, 200) || 'Untitled database' }
  try {
    let ws = c.meta
    if (ks.length)
      ws = await put(c, (m) => {
        for (const k of ks) m.items[k] = { ...m.items[k], notion: rec }
      })
    if (all) {
      const { error } = await c.supabase
        .from('ai_settings')
        .upsert({ key: 'notion_tasks_db', value: { id, name: rec.name, by: rec.by, at }, updated_by: c.user.email, updated_at: at }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    }
    return { ok: true, toast: '', ws }
  } catch (e) {
    return { ok: false, error: 'Could not save where they went: ' + msgOf(e) }
  }
}

// ---------- v153: the preview panel and the folder suggestions ----------

/**
 * What the preview panel shows of an item, read when it opens (v153Fetch and what v153's Activity reads): an upload's or
 * a transcript's text as read and when; a call's post-call summary and next steps, and where it is filed.
 */
export async function wsInfo(leadId: string, key: string): Promise<{ ok: true; info: WsInfo } | { ok: false; error: string }> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  const k = String(key)
  if (!KEY.test(k)) return { ok: false, error: 'That is not in the workspace.' }
  if (k.startsWith('f:')) {
    const emails = [...new Set(leadEmails(c.lead).flatMap((e) => [e, e.toLowerCase()]))]
    const { data, error } = await c.supabase.from('lead_files').select('file_text,indexed_at,lead_email').eq('id', k.slice(2)).maybeSingle()
    if (error) return { ok: false, error: 'The text could not be read just now.' }
    if (!data || !emails.includes(String(data.lead_email))) return { ok: false, error: 'Could not find this file any more. Refresh the page.' }
    return { ok: true, info: { text: String(data.file_text ?? ''), indexedAt: String(data.indexed_at ?? '') } }
  }
  if (k.startsWith('c:')) {
    const id = k.slice(2)
    const [out, meta] = await Promise.all([
      c.supabase.from('call_outputs').select('summary,tasks,status,created_at,updated_at').eq('call_id', id).order('created_at', { ascending: false }).limit(1),
      c.supabase.from('call_meta').select('lead_stage,updated_at,updated_by').eq('call_id', id).maybeSingle(),
    ])
    const o = ((out.data ?? [])[0] ?? null) as Record<string, unknown> | null
    const text = (x: unknown) => (typeof x === 'string' ? x : x && typeof x === 'object' ? String((x as Record<string, unknown>).text ?? (x as Record<string, unknown>).point ?? '') : '')
    const summary = (Array.isArray(o?.summary) ? (o!.summary as unknown[]) : o?.summary ? [o.summary] : []).map(text).filter(Boolean).slice(0, 8)
    const tasks = (Array.isArray(o?.tasks) ? (o!.tasks as Record<string, unknown>[]) : [])
      .map((t) => ({ text: String(t?.task ?? t?.text ?? t?.title ?? ''), owner: String(t?.owner ?? '') }))
      .filter((t) => t.text)
      .slice(0, 8)
    const m = meta.data as Record<string, unknown> | null
    return {
      ok: true,
      info: {
        summary,
        tasks,
        post: o ? { at: String(o.updated_at || o.created_at || ''), done: o.status === 'done' } : null,
        filed: m ? { stage: String(m.lead_stage ?? ''), at: String(m.updated_at ?? ''), by: String(m.updated_by ?? '') } : null,
      },
    }
  }
  return { ok: true, info: {} }
}

/**
 * The panel's Rename and Save details (v153RenameGo, v153DetailsGo): only what is given changes (a name, a description,
 * and for an upload whether the stage runs read it), and each change is logged on the item.
 */
export async function wsSet(leadId: string, key: string, patch: { name?: string; desc?: string; source?: boolean }): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  const k = String(key)
  if (!KEY.test(k)) return { ok: false, error: 'That is not in the workspace.' }
  const ch: WsItemMeta = {}
  if (typeof patch?.name === 'string') {
    const n = patch.name.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!n) return { ok: false, error: 'Give it a name.' }
    ch.name = n
  }
  if (typeof patch?.desc === 'string') ch.desc = patch.desc.replace(/\r\n?/g, '\n').trim().slice(0, 600)
  if (typeof patch?.source === 'boolean' && k.startsWith('f:')) ch.source = patch.source
  if (!Object.keys(ch).length) return { ok: true, toast: 'Nothing changed.', ws: c.meta }
  try {
    const ws = await put(c, (m) => {
      m.items[k] = { ...m.items[k], ...ch }
    })
    return { ok: true, toast: ch.name && Object.keys(ch).length === 1 ? 'Renamed.' : 'Saved.', ws }
  } catch (e) {
    return { ok: false, error: (ch.name && Object.keys(ch).length === 1 ? 'Could not rename it: ' : 'Could not save: ') + msgOf(e) }
  }
}

export type FileManyResult = { ok: true; ws: WsMeta; n: number } | { ok: false; error: string; ws: WsMeta | null; n: number }

/**
 * File the suggested folders in one go (v153SgGo): each call put in a stage folder is filed under that stage first (as
 * a move does), then one save puts every item in its folder, with where each call is filed then. A stop halfway still
 * saves the folders of the ones filed, and says how many went.
 */
export async function wsFileMany(leadId: string, picks: { key: string; folder: string }[]): Promise<FileManyResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string, ws: null, n: 0 }
  const list = (Array.isArray(picks) ? picks : [])
    .map((p) => ({ key: String(p?.key ?? ''), folder: String(p?.folder ?? '') }))
    .filter((p) => KEY.test(p.key) && /^(c|f):/.test(p.key) && p.folder)
    .slice(0, 200)
  if (!list.length) return { ok: false, error: 'Pick a folder for at least one call.', ws: null, n: 0 }
  if (list.some((p) => !folderOk(c.stages, c.meta, p.folder))) return { ok: false, error: 'That folder is gone. Refresh the page.', ws: null, n: 0 }
  const done: { key: string; folder: string; stage?: string }[] = []
  let err = ''
  for (const p of list) {
    try {
      done.push({ ...p, ...(await fileForMove(c, p.key, p.folder)) })
    } catch (e) {
      err = msgOf(e)
      break
    }
  }
  let ws: WsMeta | null = null
  if (done.length) {
    try {
      ws = await put(c, (m) => {
        for (const d of done) m.items[d.key] = { ...m.items[d.key], folder: d.folder, ...(d.stage !== undefined ? { stage: d.stage } : {}) }
      })
    } catch (e) {
      if (done.some((d) => d.key.startsWith('c:'))) refresh()
      return { ok: false, error: 'Could not save the folders: ' + msgOf(e), ws: null, n: 0 }
    }
  }
  if (done.some((d) => d.key.startsWith('c:'))) refresh()
  if (err) return { ok: false, error: 'Filed ' + done.length + ' of ' + list.length + ', then it stopped: ' + err, ws, n: done.length }
  return { ok: true, ws: ws ?? c.meta, n: done.length }
}
