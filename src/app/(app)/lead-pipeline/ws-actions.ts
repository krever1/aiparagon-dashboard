'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { type Lead, buildLeads, leadEmails } from '@/lib/catalyst/leads'
import { findLead, readCatalyst } from '@/lib/catalyst/load'
import { WS_KEY, fileCall, readSetting } from '@/lib/catalyst/run'
import { patchSetting } from '@/lib/catalyst/settings'
import { newKey, objOf } from '@/lib/catalyst/setup'
import type { Stage } from '@/lib/catalyst/stages'
import { type WsItemMeta, type WsMeta, wsFolders, wsMetaOf } from '@/lib/catalyst/workspace'
import { createClient } from '@/lib/supabase/server'

// The client workspace's changes (v145WsStar, v145WsMove, v145WsNewFolder, v145WsEditGo, v145WsDel, with v146's
// fixes), kept for the team in ai_settings `catalyst_ws` under the lead's email in lower case.

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

/** Change this lead's workspace (v145WsPut): read fresh, change, save under its email in lower case. */
async function put(supabase: Supa, lead: Lead, by: string, fn: (m: WsMeta) => void): Promise<WsMeta> {
  const em = lead.email.toLowerCase()
  const out = await patchSetting(supabase, WS_KEY, by, (cur) => {
    const m = wsMetaOf(cur, em)
    const raw = objOf(cur[em])
    const next = { ...raw, folders: m.folders, items: { ...m.items } }
    fn(next)
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
async function fileForMove(c: Exclude<Awaited<ReturnType<typeof ctx>>, { error: string }>, key: string, folder: string): Promise<{ stage?: string }> {
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
    const ws = await put(c.supabase, c.lead, c.user.email, (m) => {
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
    const ws = await put(c.supabase, c.lead, c.user.email, (m) => {
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
    const ws = await put(c.supabase, c.lead, c.user.email, (m) => {
      m.folders = [...m.folders, { id, name: n }]
    })
    return { ok: true, toast: 'Folder added.', ws, id }
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
}

export async function wsEdit(leadId: string, key: string, input: { name: string; folder: string; desc: string; source?: boolean }): Promise<WsResult> {
  const c = await ctx(leadId)
  if ('error' in c) return { ok: false, error: c.error as string }
  if (!KEY.test(String(key))) return { ok: false, error: 'That is not in the workspace.' }
  const name = String(input?.name ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 120)
  if (!name) return { ok: false, error: 'Give it a name.' }
  const f = String(input.folder ?? '')
  if (!folderOk(c.stages, c.meta, f)) return { ok: false, error: 'That folder is gone. Refresh the page.' }
  const desc = String(input.desc ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 600)
  try {
    const extra = await fileForMove(c, key, f)
    const item: WsItemMeta = { name, folder: f, desc, ...(key.startsWith('f:') && typeof input.source === 'boolean' ? { source: input.source } : {}), ...extra }
    const ws = await put(c.supabase, c.lead, c.user.email, (m) => {
      m.items[key] = { ...m.items[key], ...item }
    })
    if (key.startsWith('c:')) refresh()
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
    ws = await put(c.supabase, c.lead, c.user.email, (m) => {
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
      ws = await put(c.supabase, c.lead, c.user.email, (m) => {
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
