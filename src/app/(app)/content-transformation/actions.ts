'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { callRow, fathomLink, leadOf, minutesOf } from '@/lib/catalyst/calls'
import { loadCalls } from '@/lib/catalyst/calls-load'
import { ftTranscript } from '@/lib/catalyst/fathom'
import { N8nError, callN8n } from '@/lib/n8n'
import { CHECKS, type PieceForm, askProblem, askText, draftOf, kindOf, noteTags, pieceRow } from '@/lib/pipeline/content'
import { FILL_MSG, type FillAnswer, fillAnswerOf, fillRequest, ownMaterial } from '@/lib/pipeline/content-fill'
import { loadForm } from '@/lib/pipeline/content-load'
import { isTplKey, planFrom, savedPlan } from '@/lib/pipeline/content-plan'
import { CALL_ID, type Material, TEXT_MAX, TEXT_MIN, buildRequest, dbErr, formFrom, usesNote } from '@/lib/pipeline/content-new'
import { createClient } from '@/lib/supabase/server'

// Content Transformation's actions, as the signed-in teammate (nwCtSend, apCfRetry, apCfMarkReady, v126Save, apCpSave,
// apCpArchive, nwIdeaSave and nwIdeaDel in the current dashboard): a new draft asked for, a request started again, a
// draft marked ready or sent back with what should change, a draft kept in the library and a library piece changed or
// archived, and an idea added or deleted; for New draft's material, a link read, a Fathom call picked and its
// transcript, and Fill it in for me.

const SIGNED_OUT = 'You are signed out. Sign in again.'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Done = { ok: true } | { ok: false; error: string }

/** A draft as saved (agent_outputs content_generation content_draft), or null when it is not on file. */
async function readDraft(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from('agent_outputs')
    .select('id,run_id,title,created_at,data')
    .eq('id', id)
    .eq('agent', 'content_generation')
    .eq('output_type', 'content_draft')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? draftOf(data as Record<string, unknown>) : null
}

/** Ask Content from Source to write a request; what stopped it, when it did not start. */
async function kick(id: string, by: string): Promise<string | null> {
  try {
    await callN8n('e3-content-run', { request_id: id, requested_by: by }, { what: 'Content from Source', workflow: 'Engine 3 · Content from Source', timeoutMs: 30_000 })
    return null
  } catch (e) {
    return msgOf(e)
  }
}

export type Sent = { ok: true; id: string; title: string; started: boolean; error?: string } | { ok: false; error: string }

/**
 * Generate (nwCtSend with its wrappers): the request is built from the form and what the team has on file, read fresh
 * (the personas, offers, templates, voice, the briefs' layout and what was asked to change on earlier drafts), saved
 * for the team, then Content from Source is asked to write it. A saved template counts a use; a team idea drafted from
 * Ideas is marked written up when the idea that goes out still has its words. A workflow that does not start leaves
 * the request queued and says why.
 */
export async function sendRequest(input: unknown): Promise<Sent> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const f = formFrom(input)
  const supabase = await createClient()
  const now = Date.now()
  const fd = await loadForm(supabase, now, { send: true }).catch((e: unknown) => ({ error: msgOf(e) }) as const)
  if (!('personas' in fd)) return { ok: false, error: 'Could not read what the draft uses: ' + fd.error }
  if (fd.error) return { ok: false, error: 'Could not read what the draft uses: ' + fd.error }
  const b = buildRequest(f, { email: user.email, personas: fd.personas, offers: fd.offers, templates: fd.templates, voice: fd.voice, leaveOut: fd.leaveOut, asks: fd.asks, now })
  if (!b.ok) return b
  const ins = await supabase.from('content_requests').insert(b.row).select('id,title').maybeSingle()
  if (ins.error) return { ok: false, error: 'Could not save the request: ' + dbErr(ins.error) }
  if (!ins.data) return { ok: false, error: 'Could not save the request: Supabase did not return the saved request' }
  const id = str(ins.data.id)
  const title = str(ins.data.title) || b.title || 'Your draft'
  // a saved template counts a use each time a request goes out with it (v97TplCount)
  const tpl = b.templateId ? fd.templates.find((t) => t.id === b.templateId) : undefined
  if (tpl) await supabase.from('doc_templates').update({ uses: tpl.uses + 1 }).eq('id', tpl.id)
  // the team's idea drafted from Ideas is written up (status used, with the request it went into)
  if (f.note && f.src === 'idea') {
    const n = await supabase.from('idea_notes').select('id,note,status').eq('id', f.note).maybeSingle()
    if (n.data && str(n.data.status) === 'open' && usesNote(f.thesis, str(n.data.note))) {
      await supabase.from('idea_notes').update({ status: 'used', used_in: id, updated_at: new Date().toISOString() }).eq('id', f.note)
    }
  }
  const why = await kick(id, user.email)
  refresh()
  return why ? { ok: true, id, title, started: false, error: why } : { ok: true, id, title, started: true }
}

/** The link reader's own words for what it cannot read (V101_LINK_MSG), pointing at the Upload tab. */
const LINK_MSG: Readonly<Record<string, string>> = {
  youtube_blocked:
    'YouTube does not let automated readers pull a video’s captions. If you have the video file, add it on the Upload tab and it gets transcribed. Its captions file (.srt) or a pasted transcript work too.',
  podcast_app: 'Podcast apps do not share the episode or its transcript. If you have the episode file, add it on the Upload tab and it gets transcribed, or paste the transcript.',
  media_file: 'That link is an audio or video file. Download it, then add it on the Upload tab and it gets transcribed.',
}
export type LinkRead =
  | { ok: true; text: string; title: string; url: string; host: string; kind: string; words: number; cut: boolean }
  | { ok: false; error: string; title?: string }

/**
 * Read link (v101LinkRead): Engine 3 · Read a Link reads an article or a YouTube video's captions and answers with the
 * text, its title and where it came from; what it cannot read is said in the dashboard's words.
 */
export async function readLink(url: string): Promise<LinkRead> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Sign in again to read links.' }
  const u = str(url).trim().slice(0, 2000)
  if (!u) return { ok: false, error: 'Paste a link first.' }
  let j: Record<string, unknown>
  try {
    j = await callN8n<Record<string, unknown>>('e3-read-link', { url: u }, { what: 'link reader', workflow: 'Engine 3 · Read a Link', timeoutMs: 120_000 })
  } catch (e) {
    const code = e instanceof N8nError ? e.code : ''
    if (code === 'off') return { ok: false, error: 'Reading links is switched off in n8n. Turn on “Engine 3 · Read a Link” and try again.' }
    if (code === 'unauthorized') return { ok: false, error: 'Sign in with an AI Paragon account to read links here.' }
    if (code === 'timeout') return { ok: false, error: 'The link reader took too long to answer. Try again in a minute.' }
    if (code === 'unreadable') return { ok: false, error: 'The link reader sent back something unreadable. Try again.' }
    if (code === 'status') return { ok: false, error: 'The link reader answered with an error (' + (/\((\d{3})\)/.exec(msgOf(e))?.[1] ?? '500') + '). Try again in a minute.' }
    return { ok: false, error: 'Could not reach n8n. Check your connection and try again.' }
  }
  if (j.ok !== true) {
    const code = str(j.code)
    return { ok: false, error: LINK_MSG[code] || str(j.message) || 'Could not read that link. Paste the text instead.', ...(str(j.title) ? { title: str(j.title) } : {}) }
  }
  const text = str(j.text).trim().slice(0, TEXT_MAX)
  if (!text) return { ok: false, error: 'Could not read that link. Paste the text instead.' }
  return {
    ok: true,
    text,
    title: str(j.title).trim(),
    url: str(j.url) || u,
    host: str(j.host),
    kind: str(j.kind),
    words: Number(j.words) || text.split(/\s+/).length,
    cut: j.cut === true,
  }
}

/** Use on a piece or an earlier request's material (nwCtUsePiece): its text, title, kind of material and link. */
export async function materialFor(use: string): Promise<{ ok: true; text: string; title: string; type: string; url: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const NONE = 'There is no text stored for this one. Add it again as a file or paste it.'
  const m = /^(piece|req):(.+)$/i.exec(str(use))
  if (!m || !UUID.test(m[2])) return { ok: false, error: NONE }
  const supabase = await createClient()
  let got: { title: string; type: string; url: string; text: string } | null = null
  if (m[1].toLowerCase() === 'piece') {
    const r = await supabase.from('content_pieces').select('id,title,body').eq('id', m[2]).maybeSingle()
    if (r.error) return { ok: false, error: 'Could not read it: ' + r.error.message }
    got = r.data ? { title: str(r.data.title), type: 'other', url: '', text: str(r.data.body) } : null
  } else {
    const r = await supabase.from('content_requests').select('id,title,source_type,source_url,source_text').eq('id', m[2]).maybeSingle()
    if (r.error) return { ok: false, error: 'Could not read it: ' + r.error.message }
    got = r.data ? { title: str(r.data.title), type: str(r.data.source_type) || 'article', url: str(r.data.source_url), text: str(r.data.source_text) } : null
  }
  if (!got || got.text.trim().length < 40) return { ok: false, error: NONE }
  return { ok: true, text: got.text.slice(0, TEXT_MAX), title: got.title.replace(/^Sample · /, ''), type: got.type, url: got.url }
}

/**
 * Try again on a request that did not finish or was not picked up (apCfRetry): back in the queue, then Content from
 * Source is asked to write it. A workflow that does not start leaves the request queued and says why.
 */
export async function retryRequest(id: string): Promise<{ ok: true; started: boolean; error?: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That request is not on file.' }
  const supabase = await createClient()
  const got = await supabase.from('content_requests').select('id,status').eq('id', id).maybeSingle()
  if (got.error) return { ok: false, error: 'Could not read the request: ' + got.error.message }
  if (!got.data) return { ok: false, error: 'That request is not on file any more.' }
  if (got.data.status === 'done') {
    refresh()
    return { ok: false, error: 'That draft is written already.' }
  }
  const up = await supabase.from('content_requests').update({ status: 'queued', error: null, updated_at: new Date().toISOString() }).eq('id', id)
  if (up.error) return { ok: false, error: 'Could not start it again: ' + up.error.message }
  const why = await kick(id, user.email)
  refresh()
  return why ? { ok: true, started: false, error: why } : { ok: true, started: true }
}

/** Mark ready (apCfMarkReady): the sign-off, with the four checks; once per draft. Nothing is published. */
export async function markReady(id: string): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That draft is not on file.' }
  const supabase = await createClient()
  try {
    if (!(await readDraft(supabase, id))) return { ok: false, error: 'That draft is not on file any more.' }
  } catch (e) {
    return { ok: false, error: 'Could not read the draft: ' + msgOf(e) }
  }
  const had = await supabase.from('agent_feedback').select('id').eq('target_type', 'draft_review').eq('target_id', id).eq('action', 'ready').limit(1)
  if (!had.error && (had.data ?? []).length) {
    refresh()
    return { ok: true }
  }
  const { error } = await supabase.from('agent_feedback').insert({
    agent: 'content_generation',
    target_type: 'draft_review',
    target_id: id,
    action: 'ready',
    feedback: JSON.stringify({ checked: CHECKS }),
    author: user.email,
  })
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  refresh()
  return { ok: true }
}

/** What should change? on a draft (v126Save): one sentence that starts with the kind, which the next drafts read. */
export async function askDraftChange(input: { id: string; picked: string[]; note: string }): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.id)
  const picked = (Array.isArray(input?.picked) ? input.picked : []).map(str)
  const note = str(input?.note).slice(0, 500)
  const bad = askProblem(picked, note)
  if (bad) return { ok: false, error: bad }
  if (!UUID.test(id)) return { ok: false, error: 'That draft is not on file.' }
  const supabase = await createClient()
  let draft: Awaited<ReturnType<typeof readDraft>>
  try {
    draft = await readDraft(supabase, id)
  } catch (e) {
    return { ok: false, error: 'Could not save it: ' + msgOf(e) }
  }
  if (!draft) return { ok: false, error: 'That draft is not on file any more.' }
  const { error } = await supabase.from('agent_feedback').insert({
    agent: 'content_generation',
    target_type: 'draft_review',
    target_id: id,
    action: 'changes',
    feedback: askText(kindOf(draft), picked, note),
    author: user.email,
  })
  if (error) return { ok: false, error: 'Could not save it: ' + error.message }
  refresh()
  return { ok: true }
}

/**
 * Saves a library piece (apCpSave): a new one, made from a draft or from nothing, or the changes to one on file. A
 * draft is kept once: saving one already in the library changes that piece.
 */
export async function savePiece(input: { id?: string; draftId?: string; form: PieceForm }): Promise<{ ok: true; id: string; created: boolean } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const r = pieceRow(input?.form ?? ({} as PieceForm))
  if (!r.ok) return r
  const supabase = await createClient()
  const now = new Date().toISOString()
  let id = str(input?.id)
  const draftId = str(input?.draftId)
  if (id && !UUID.test(id)) return { ok: false, error: 'That piece is not on file.' }
  if (!id && draftId) {
    if (!UUID.test(draftId)) return { ok: false, error: 'That draft is not on file.' }
    const had = await supabase.from('content_pieces').select('id').eq('source_draft_id', draftId).neq('status', 'archived').limit(1)
    if (had.error) return { ok: false, error: 'Could not save: ' + had.error.message }
    id = str((had.data ?? [])[0]?.id)
  }
  if (id) {
    const up = await supabase
      .from('content_pieces')
      .update({ ...r.row, updated_at: now, updated_by: user.email })
      .eq('id', id)
      .select('id')
    if (up.error) return { ok: false, error: 'Could not save: ' + up.error.message }
    if (!(up.data ?? []).length) return { ok: false, error: 'That piece is not on file any more.' }
    refresh()
    return { ok: true, id, created: false }
  }
  let requestId: string | null = null
  if (draftId) {
    let d: Awaited<ReturnType<typeof readDraft>>
    try {
      d = await readDraft(supabase, draftId)
    } catch (e) {
      return { ok: false, error: 'Could not save: ' + msgOf(e) }
    }
    if (!d) return { ok: false, error: 'That draft is not on file any more.' }
    requestId = UUID.test(d.requestId) ? d.requestId : null
  }
  const ins = await supabase
    .from('content_pieces')
    .insert({
      ...r.row,
      source_draft_id: draftId || null,
      source_request_id: requestId,
      created_by: user.email,
      updated_by: user.email,
      created_at: now,
      updated_at: now,
    })
    .select('id')
  if (ins.error) return { ok: false, error: 'Could not save: ' + ins.error.message }
  refresh()
  return { ok: true, id: str((ins.data ?? [])[0]?.id), created: true }
}

/** Archive on a library piece (apCpArchive): it leaves the library and the Ideas tab. */
export async function archivePiece(id: string): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That piece is not on file.' }
  const supabase = await createClient()
  const up = await supabase
    .from('content_pieces')
    .update({ status: 'archived', updated_at: new Date().toISOString(), updated_by: user.email })
    .eq('id', id)
    .select('id')
  if (up.error) return { ok: false, error: 'Could not archive: ' + up.error.message }
  if (!(up.data ?? []).length) return { ok: false, error: 'That piece is not on file any more.' }
  refresh()
  return { ok: true }
}

/** Add an idea (nwIdeaSave): a thought to draft from later, with up to 8 tags. */
export async function addIdea(input: { note: string; tags: string }): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const note = str(input?.note).trim().slice(0, 1500)
  if (!note) return { ok: false, error: 'Write the idea first.' }
  const supabase = await createClient()
  const { error } = await supabase.from('idea_notes').insert({ note, tags: noteTags(str(input?.tags)), status: 'open', created_by: user.email })
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  refresh()
  return { ok: true }
}

/** Delete an idea (nwIdeaDel). */
export async function deleteIdea(id: string): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!UUID.test(str(id))) return { ok: false, error: 'That idea is not on file.' }
  const supabase = await createClient()
  const del = await supabase.from('idea_notes').delete().eq('id', id).select('id')
  if (del.error) return { ok: false, error: 'Could not delete: ' + del.error.message }
  if (!(del.data ?? []).length) {
    refresh()
    return { ok: false, error: 'That idea is not on file any more.' }
  }
  refresh()
  return { ok: true }
}

// ---------- a Fathom call as the material (apCfCallPick, apCfCallRows, apCfUseCall) ----------

export type CallPick = { id: string; title: string; start: string; minutes: number; client: boolean; url: string; hay: string }
export type CallsPick =
  | { ok: true; connected: true; calls: CallPick[] }
  | { ok: true; connected: false }
  | { ok: false; error: string; code: string }

/**
 * The Fathom call tab's list: the newest page of recorded calls, each under the title the team gave it (else
 * Fathom's), whether a client was on it, and what Calls' search reads (the people, the folder, the type, the tags).
 */
export async function contentCalls(): Promise<CallsPick> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT, code: 'unauthorized' }
  const d = await loadCalls()
  if (d.error) return { ok: false, error: d.error.message, code: d.error.code }
  if (!d.connected) return { ok: true, connected: false }
  return {
    ok: true,
    connected: true,
    calls: d.calls.map((c) => {
      const m = d.meta[c.id] ?? null
      const r = callRow(c, m, d.outputs[c.id] ?? null, leadOf(c, m, d.leads)?.company ?? '')
      return { id: c.id, title: r.title || 'Untitled call', start: c.start, minutes: minutesOf(c), client: r.client, url: fathomLink(c), hay: r.hay }
    }),
  }
}

/** A call's transcript as "Speaker: text" lines, cut to 120,000 characters; empty when Fathom has none. */
export async function contentCallText(id: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  if (!CALL_ID.test(str(id))) return { ok: false, error: 'That is not a Fathom call.' }
  try {
    const lines = await ftTranscript(str(id))
    const text = lines.map((l) => (l.speaker ? l.speaker + ': ' : '') + l.text).join('\n').trim()
    return { ok: true, text: text.slice(0, TEXT_MAX) }
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
}

// ---------- Fill it in for me (v99Fill) ----------

export type Filled = { ok: true; answer: FillAnswer; material: Material | null } | { ok: false; error: string }

/** The team's own material Auto-fill picked (v99Material): an earlier request's, a knowledge base file, a library piece. */
async function pickedMaterial(supabase: Awaited<ReturnType<typeof createClient>>, kind: string, id: string): Promise<Material | null> {
  if (kind === 'request') {
    const r = await supabase.from('content_requests').select('id,title,source_type,source_url,source_text').eq('id', id).maybeSingle()
    return r.data
      ? { title: str(r.data.title).replace(/^Sample · /, ''), type: str(r.data.source_type) || 'article', url: str(r.data.source_url), text: str(r.data.source_text) }
      : null
  }
  if (kind === 'file') {
    const r = await supabase.from('guide_files').select('id,file_name,file_text').eq('id', id).maybeSingle()
    return r.data ? { title: str(r.data.file_name), type: 'other', url: '', text: str(r.data.file_text) } : null
  }
  if (kind === 'piece') {
    const r = await supabase.from('content_pieces').select('id,title,body').eq('id', id).maybeSingle()
    return r.data ? { title: str(r.data.title), type: 'other', url: '', text: str(r.data.body) } : null
  }
  return null
}

/**
 * Fill it in for me: Engine 3 · Auto-fill reads the newest briefs, the company profile and the team's own material,
 * and answers with what to put in the form and why. The request is built from the form and what is on file, read
 * fresh; the piece of material it picks, when the form has none, is read here so the page can put it in.
 */
export async function fillItIn(input: unknown): Promise<Filled> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Sign in again to use this.' }
  const f = formFrom(input)
  const supabase = await createClient()
  const fd = await loadForm(supabase, Date.now()).catch((e: unknown) => ({ error: msgOf(e) }) as const)
  if (!('personas' in fd)) return { ok: false, error: 'Could not read what it fills in from: ' + fd.error }
  if (fd.error) return { ok: false, error: 'Could not read what it fills in from: ' + fd.error }
  const req = fillRequest(f, fd)
  if (!req.ok) return req
  let j: unknown
  try {
    j = await callN8n('e3-autofill', { ...req.body, requested_by: user.email }, { what: 'Auto-fill', workflow: 'Engine 3 · Auto-fill', timeoutMs: 100_000 })
  } catch (e) {
    const code = e instanceof N8nError ? e.code : ''
    if (code === 'timeout') return { ok: false, error: FILL_MSG.timeout }
    if (code === 'off') return { ok: false, error: FILL_MSG.off }
    if (code === 'unauthorized') return { ok: false, error: FILL_MSG.unauthorized }
    if (code === 'unreadable') return { ok: false, error: FILL_MSG.failed }
    if (code === 'status') return { ok: false, error: 'The agent answered with an error (' + (/\((\d{3})\)/.exec(msgOf(e))?.[1] ?? '500') + '). Try again in a minute.' }
    return { ok: false, error: FILL_MSG.network }
  }
  const a = fillAnswerOf(j)
  if (!a) return { ok: false, error: str((j as Record<string, unknown> | null)?.message) || FILL_MSG.failed }
  let material: Material | null = null
  if (a.filled.source && f.src !== 'idea' && !ownMaterial(f)) {
    material = await pickedMaterial(supabase, a.filled.source.kind, a.filled.source.id).catch(() => null)
    if (!material || material.text.trim().length < TEXT_MIN) return { ok: false, error: FILL_MSG.material }
    material = { ...material, text: material.text.slice(0, TEXT_MAX) }
  }
  return { ok: true, answer: a, material }
}

// ---------- the plan (v121SaveDef) ----------

/**
 * Save as our default: the plan for this kind of piece becomes the team's (ai_settings build_plans, read fresh and
 * merged, so another kind's default stays), with who saved it and when. A plan for a structure picked is not saved.
 */
export async function savePlanDefault(input: unknown): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const plan = planFrom(input)
  if (!plan || isTplKey(plan.key)) return { ok: false, error: 'This plan cannot be saved as the team’s default.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('ai_settings').select('value').eq('key', 'build_plans').maybeSingle()
  if (error) return { ok: false, error: error.message }
  let cur: unknown = data?.value
  if (typeof cur === 'string') {
    try {
      cur = JSON.parse(cur)
    } catch {
      cur = {}
    }
  }
  const at = new Date().toISOString()
  const value = { ...(cur && typeof cur === 'object' && !Array.isArray(cur) ? (cur as Record<string, unknown>) : {}), [plan.key]: savedPlan(plan.steps, user.email, at) }
  const up = await supabase.from('ai_settings').upsert({ key: 'build_plans', value, updated_by: user.email, updated_at: at }, { onConflict: 'key' })
  if (up.error) return { ok: false, error: up.error.message }
  refresh()
  return { ok: true }
}
