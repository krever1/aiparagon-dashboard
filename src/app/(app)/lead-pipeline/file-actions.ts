'use server'

import { refresh } from 'next/cache'
import { after } from 'next/server'
import mammoth from 'mammoth'
import { getCurrentUser } from '@/lib/auth'
import { SUPABASE_URL } from '@/lib/config'
import { FILE_STAGES, MAX_UPLOAD } from '@/lib/catalyst/files'
import { buildLeads } from '@/lib/catalyst/leads'
import { findLead, readCatalyst } from '@/lib/catalyst/load'
import { WS_KEY } from '@/lib/catalyst/run'
import { patchSetting } from '@/lib/catalyst/settings'
import { wsFolders, wsMetaOf } from '@/lib/catalyst/workspace'
import { callN8n } from '@/lib/n8n'
import { createClient } from '@/lib/supabase/server'

// A lead's files (e1UploadFile, e1IndexFile, e1DeleteFile): the file goes from the browser straight into Storage
// (lead-files) with an upload address signed here as the teammate, then its row is saved, a copy goes to the lead's
// HubSpot contact, and its text is read for the Ask bot: a Word file here, anything else by Lead File Text Ingest.

const BUCKET = 'lead-files'
const HOLDER = 'contact@deltaadvisory.com'
const STAGES = FILE_STAGES.map((s) => s.key)
const NOTHING_TO_READ =
  'No readable text found in this file. PDFs, Word (.docx), txt, csv, md and html work; scanned images need OCR or a PDF export first.'

export type FileResult = { ok: true; toast: string } | { ok: false; error: string }
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'something went wrong'

async function leadOf(leadId: string) {
  const read = await readCatalyst()
  return findLead(buildLeads(read.rows, read.outs).leads, String(leadId))
}

/** Where a lead's uploads are kept: under its email, the file's name made safe. */
function pathFor(email: string, name: string): string {
  return `${email}/${Date.now()}-${name.replace(/[^\w.\-]+/g, '_')}`
}

/** An upload address for one file, signed as the teammate (the Storage rules decide whether they may upload). */
export async function startUpload(input: {
  leadId: string
  name: string
  size: number
}): Promise<{ ok: true; path: string; url: string } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: 'You are signed out. Sign in again.' }
  const name = String(input?.name ?? '').trim()
  if (!name) return { ok: false, error: 'Choose a file first.' }
  if (!(Number(input?.size) > 0)) return { ok: false, error: 'That file is empty.' }
  if (Number(input.size) > MAX_UPLOAD) return { ok: false, error: 'Keep uploads under 25 MB.' }
  const lead = await leadOf(input.leadId)
  if (!lead) return { ok: false, error: 'Could not find this lead any more. Refresh the page.' }
  if (lead.email.toLowerCase() === HOLDER) return { ok: false, error: 'This lead has only the anonymizer’s placeholder email, so files can’t be kept under it.' }
  const path = pathFor(lead.email, name)
  const { data, error } = await (await createClient()).storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { ok: false, error: 'Storage turned the upload away: ' + (error?.message || 'no upload address') + '.' }
  return { ok: true, path, url: data.signedUrl }
}

/** What the client workspace adds to an upload (v145WsUploadGo): its name, folder, description, whether the stage
 * runs read it, and for a transcript pasted in, its text. */
export type WsUploadInput = { name: string; folder: string; desc: string; source: boolean; transcript?: string }

/**
 * The file is in Storage: its row (the lead, the stage, the note, who added it), then the copy to HubSpot. From the
 * client workspace, the row's stage is the folder's built-in stage, a pasted transcript is saved with its text
 * (category transcript), and its name, folder, description and source go to `catalyst_ws`.
 */
export async function finishUpload(input: {
  leadId: string
  path: string
  name: string
  stage: string
  note: string
  ws?: WsUploadInput
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You are signed out. Sign in again.' }
  const read = await readCatalyst()
  const lead = findLead(buildLeads(read.rows, read.outs).leads, String(input?.leadId))
  if (!lead) return { ok: false, error: 'Could not find this lead any more. Refresh the page.' }
  const path = String(input.path ?? '')
  if (!path.startsWith(lead.email + '/') || path.includes('..') || path.length > 600) return { ok: false, error: 'That is not this lead’s upload.' }
  const name = String(input.name ?? '').trim().slice(0, 300) || path.split('/').pop()!
  const supabase = await createClient()
  const ws = input.ws
  let folder = ''
  if (ws) {
    const metaAll = await supabase.from('ai_settings').select('value').eq('key', WS_KEY).maybeSingle()
    const ids = wsFolders(read.stages, wsMetaOf((metaAll.data?.value ?? {}) as Record<string, unknown>, lead.email)).map((f) => f.id)
    folder = ids.includes(String(ws.folder ?? '')) ? String(ws.folder) : ''
  }
  const folderAgent = read.stages.find((s) => s.key === folder && !s.custom)?.agent ?? ''
  const stage = ws ? (STAGES.includes(folderAgent) ? folderAgent : 'manual') : STAGES.includes(String(input.stage)) ? String(input.stage) : 'manual'
  const note = String(ws ? ws.desc : input.note ?? '').trim().slice(0, ws ? 600 : 500)
  const text = ws && typeof ws.transcript === 'string' ? ws.transcript.replace(/\r\n?/g, '\n').trim().slice(0, 120_000) : ''
  const fileUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { data, error } = await supabase
    .from('lead_files')
    .insert({
      lead_email: lead.email, file_name: name, file_url: fileUrl, file_path: path, stage, note: note || null, source: 'upload', uploaded_by: user.name,
      ...(ws ? { category: text ? 'transcript' : null } : {}),
      ...(text ? { file_text: text, indexed_at: new Date().toISOString() } : {}),
    })
    .select('id')
    .single()
  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path])
    return { ok: false, error: 'Could not save the file: ' + (error?.message || 'the database did not take it') + '.' }
  }
  if (ws) {
    const key = 'f:' + String(data.id)
    const item = { name: String(ws.name ?? '').trim().slice(0, 120) || name, folder, desc: note, source: !!ws.source }
    try {
      await patchSetting(supabase, WS_KEY, user.email, (cur) => {
        const em = lead.email.toLowerCase()
        const m = (cur[em] && typeof cur[em] === 'object' ? cur[em] : {}) as { folders?: unknown[]; items?: Record<string, unknown> }
        return { [em]: { ...m, folders: m.folders ?? [], items: { ...(m.items ?? {}), [key]: item } } }
      })
    } catch {
      // the file is kept; its name and folder can be set again with Edit
    }
  }
  const body = { fileUrl, fileName: name, leadEmail: lead.email, note, uploadedBy: user.name }
  // Lead File → HubSpot Sync: a copy and a note on the lead's contact, when HubSpot has one. Its answer is not read.
  after(async () => {
    try {
      await callN8n('hubspot-file-sync', body, { what: 'HubSpot file sync', workflow: 'Lead File → HubSpot Sync', timeoutMs: 120_000 })
    } catch {
      // the file stays with the lead; HubSpot gets the next one
    }
  })
  refresh()
  return { ok: true, id: String(data.id) }
}

/** Index or Re-index: the file's text, so the Ask bot can read it. */
export async function indexFile(id: string): Promise<FileResult> {
  if (!(await getCurrentUser())) return { ok: false, error: 'You are signed out. Sign in again.' }
  if (!/^[\w-]{1,80}$/.test(String(id))) return { ok: false, error: 'That is not a file.' }
  const supabase = await createClient()
  const { data: row, error } = await supabase.from('lead_files').select('id,file_name,file_url').eq('id', id).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!row) return { ok: false, error: 'Could not find this file any more. Refresh the page.' }
  const url = String(row.file_url ?? '')
  const name = String(row.file_name ?? '')
  if (/\.docx$/i.test(name)) {
    // Word files are read here (Lead File Text Ingest reads PDFs and text files); only files kept in lead-files
    if (!url.startsWith(SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1/object/public/' + BUCKET + '/')) {
      return { ok: false, error: 'This file is not kept in the lead files’ storage, so it can’t be read here.' }
    }
    let text = ''
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
      if (!res.ok) return { ok: false, error: `Couldn’t download the file for reading (${res.status}).` }
      text = (await mammoth.extractRawText({ buffer: Buffer.from(await res.arrayBuffer()) })).value.trim()
    } catch (e) {
      return { ok: false, error: 'Couldn’t read the Word file: ' + msgOf(e) }
    }
    const upd = await supabase
      .from('lead_files')
      .update({ file_text: text || null, indexed_at: text ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id')
    if (upd.error) return { ok: false, error: upd.error.message }
    refresh()
    return text ? { ok: true, toast: 'The Ask bot can read it now.' } : { ok: false, error: NOTHING_TO_READ }
  }
  try {
    const j = await callN8n<{ ok?: boolean; extracted?: boolean; message?: string }>(
      'file-ingest',
      { fileId: id, fileUrl: url, fileName: name, table: 'lead_files' },
      { what: 'File Ingest', workflow: 'Lead File Text Ingest', timeoutMs: 120_000 },
    )
    if (j && j.ok === false) return { ok: false, error: j.message || 'Lead File Text Ingest could not read it.' }
    refresh()
    if (j && j.extracted === false) return { ok: false, error: NOTHING_TO_READ }
    return { ok: true, toast: 'The Ask bot can read it now.' }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}
