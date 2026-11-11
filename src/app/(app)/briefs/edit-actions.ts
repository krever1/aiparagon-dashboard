'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { CB_KEYS, type CB, cbOf, noteOf, orgDataOf, reviewNew, snapOf } from '@/lib/pipeline/brief-edit'
import { arr, json } from '@/lib/pipeline/intel'
import { createClient } from '@/lib/supabase/server'

// The brief editor's saves (v111EdSave, v111SaveOrg, v111SaveAds) and Put back the agent's version (v111Restore), as
// the signed-in teammate. An organic brief's edits go into its agent_outputs rows (content_md, data with the review,
// the snapshot); an ads brief's into creative_briefs (the columns the agents read), its review into the run's Ad
// Strategist rows. Each keeps the agent's own version from the first edit, and leaves an `edited` decision, which
// sends the brief back to Needs review.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const SIGNED_OUT = 'You are signed out. Sign in again.'
const RUN = /^[\w.:-]{1,120}$/
const ORG_SECS = ['five', 'short', 'shift', 'dev', 'themes', 'hand']
const ADS_SECS = ['five', 'short', 'offer', 'pain', 'cross', 'test']
type Supa = Awaited<ReturnType<typeof createClient>>
type Row = Record<string, unknown>

export type Saved = { ok: true; toast: string } | { ok: false; error: string }

/** A value written back in the form it was kept: JSON text when the column held text. */
const asStored = (v: unknown, was: unknown) => (typeof was === 'string' ? JSON.stringify(v) : v)

const revIn = (v: unknown, secs: string[]) => {
  const r = json(v)
  return {
    hidden: [...new Set(arr(r.hidden).map(str))].filter((k) => secs.includes(k)),
    removed: [...new Set(arr(r.removed).map(str))].filter(Boolean).slice(0, 500),
  }
}

async function feedback(supabase: Supa, agent: string, run: string, text: string | null, by: string) {
  // errors here do not undo the edit (as before)
  await supabase.from('agent_feedback').insert({ agent, target_type: 'brief_approval', target_id: run, action: 'edited', feedback: text, author: by })
}

/** Save an edited organic brief. */
export async function saveOrgEdit(input: { run: string; md: string; data: unknown; snap: unknown; rev: unknown; changes: string; note: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const run = str(input?.run)
  if (!RUN.test(run)) return { ok: false, error: 'That is not a brief.' }
  const md = str(input?.md).slice(0, 300_000)
  const data = orgDataOf(input?.data)
  const snap = snapOf(input?.snap)
  const rev = revIn(input?.rev, ORG_SECS)
  const changes = str(input?.changes).slice(0, 1000)
  const note = noteOf(input?.note).slice(0, 1000)
  if (!changes) return { ok: false, error: 'There is nothing to save.' }
  const supabase = await createClient()
  const { data: rows0, error } = await supabase
    .from('agent_outputs')
    .select('id,data,snapshot,output_type,created_at,content_md')
    .eq('run_id', run)
    .eq('agent', 'intel_tracker')
    .order('created_at', { ascending: false })
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  const rows = (rows0 ?? []) as Row[]
  const brief = rows.find((r) => r.output_type === 'intel_brief')
  if (!brief) return { ok: false, error: 'Could not save: the brief is no longer on file.' }
  const snapRow = rows.find((r) => r.snapshot !== null && r.snapshot !== undefined)
  const prev = json(json(brief.data).review)
  const at = new Date().toISOString()
  const review = reviewNew({
    by: user.email,
    at,
    changes,
    note,
    rev,
    prev,
    original: { content_md: str(brief.content_md), data: orgDataOf(brief.data), snapshot: snapOf(snapRow?.snapshot) },
  })
  const { data: done, error: e2 } = await supabase
    .from('agent_outputs')
    .update({ content_md: md, data: asStored({ ...data, review }, brief.data), edited_by_human: true })
    .eq('run_id', run)
    .eq('agent', 'intel_tracker')
    .eq('output_type', 'intel_brief')
    .select('id')
  if (e2) return { ok: false, error: 'Could not save: ' + e2.message }
  if (!done?.length) return { ok: false, error: 'Could not save: the brief did not take the change.' }
  if (snap && JSON.stringify(snap) !== JSON.stringify(snapOf(snapRow?.snapshot))) {
    const q = snapRow
      ? supabase.from('agent_outputs').update({ snapshot: asStored(snap, snapRow.snapshot) }).eq('run_id', run).eq('agent', 'intel_tracker').not('snapshot', 'is', null)
      : supabase.from('agent_outputs').update({ snapshot: JSON.stringify(snap) }).eq('id', str(brief.id))
    const { error: e3 } = await q
    if (e3) return { ok: false, error: 'Could not save the five things: ' + e3.message }
  }
  await feedback(supabase, 'intel_tracker', run, [changes, note ? 'Note: ' + note : ''].filter(Boolean).join(' ') || null, user.email)
  refresh()
  return { ok: true, toast: 'Saved. Drafts now read the edited brief. Approve it when it reads right.' }
}

/** Save an edited ads brief. */
export async function saveAdsEdit(input: { run: string; cb: unknown; snap: unknown; rev: unknown; changes: string; note: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const run = str(input?.run)
  if (!RUN.test(run)) return { ok: false, error: 'That is not a brief.' }
  const cb = cbOf(json(input?.cb))
  const snap = snapOf(input?.snap)
  const rev = revIn(input?.rev, ADS_SECS)
  const changes = str(input?.changes).slice(0, 1000)
  const note = noteOf(input?.note).slice(0, 1000)
  if (!changes) return { ok: false, error: 'There is nothing to save.' }
  const supabase = await createClient()
  const { data: cbs, error } = await supabase.from('creative_briefs').select('*').eq('run_id', run).order('created_at', { ascending: false })
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  const stored = (cbs ?? [])[0] as Row | undefined
  if (!stored) return { ok: false, error: 'Could not save: the ads brief is no longer on file.' }
  const was = cbOf(stored)
  const body: Partial<CB> = {}
  for (const k of CB_KEYS) {
    if (JSON.stringify(cb[k]) === JSON.stringify(was[k])) continue
    body[k] = Array.isArray(cb[k]) && k !== 'source_ad_ids' && typeof stored[k] === 'string' ? JSON.stringify(cb[k]) : cb[k]
  }
  if (Object.keys(body).length) {
    const { data: done, error: e2 } = await supabase.from('creative_briefs').update(body).eq('run_id', run).select('id')
    if (e2) return { ok: false, error: 'Could not save: ' + e2.message }
    if (!done?.length) return { ok: false, error: 'Could not save: ads briefs cannot be changed from the dashboard yet.' }
  }
  const { data: ao0, error: e3 } = await supabase
    .from('agent_outputs')
    .select('id,data,snapshot,created_at')
    .eq('run_id', run)
    .eq('agent', 'ad_strategist')
    .order('created_at', { ascending: false })
  if (e3) return { ok: false, error: 'Could not save the review: ' + e3.message }
  const ao = (ao0 ?? []) as Row[]
  const snapRow = ao.find((r) => r.snapshot !== null && r.snapshot !== undefined)
  if (ao.length) {
    const prev = json(json(ao[0].data).review)
    const review = reviewNew({ by: user.email, at: new Date().toISOString(), changes, note, rev, prev, original: { cb: was, snapshot: snapOf(snapRow?.snapshot) } })
    for (const r of ao) {
      const { error: e4 } = await supabase
        .from('agent_outputs')
        .update({ data: asStored({ ...json(r.data), review }, r.data) })
        .eq('id', str(r.id))
      if (e4) return { ok: false, error: 'Could not save the review: ' + e4.message }
    }
    if (snap && JSON.stringify(snap) !== JSON.stringify(snapOf(snapRow?.snapshot))) {
      const q = snapRow
        ? supabase.from('agent_outputs').update({ snapshot: asStored(snap, snapRow.snapshot) }).eq('run_id', run).eq('agent', 'ad_strategist').not('snapshot', 'is', null)
        : supabase.from('agent_outputs').update({ snapshot: snap }).eq('id', str(ao[0].id))
      const { error: e5 } = await q
      if (e5) return { ok: false, error: 'Could not save the five things: ' + e5.message }
    }
  }
  await feedback(supabase, 'ad_strategist', run, [changes, note ? 'Note: ' + note : ''].filter(Boolean).join(' ') || null, user.email)
  refresh()
  return { ok: true, toast: 'Saved. Drafts now read the edited brief. Approve it when it reads right.' }
}

/** Put back the agent's own version of an edited brief: its words, its lists and its five things as they were. */
export async function restoreBrief(input: { kind: string; run: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const run = str(input?.run)
  const kind = input?.kind === 'ads' ? 'ads' : input?.kind === 'org' ? 'org' : null
  if (!kind || !RUN.test(run)) return { ok: false, error: 'That is not a brief.' }
  const agent = kind === 'org' ? 'intel_tracker' : 'ad_strategist'
  const supabase = await createClient()
  const { data: rows0, error } = await supabase
    .from('agent_outputs')
    .select('id,data,snapshot,output_type,created_at')
    .eq('run_id', run)
    .eq('agent', agent)
    .order('created_at', { ascending: false })
  if (error) return { ok: false, error: 'Could not put it back: ' + error.message }
  const rows = (rows0 ?? []) as Row[]
  const holder = kind === 'org' ? rows.find((r) => r.output_type === 'intel_brief') : rows[0]
  const orig = json(json(json(holder?.data).review).original)
  // the old page stopped without a word here
  if (!holder || !Object.keys(orig).length) return { ok: false, error: 'This brief has no agent’s version kept to put back.' }
  const fail = (m: string) => ({ ok: false as const, error: 'Could not put it back: ' + m })
  if (kind === 'org') {
    // the words only when the kept version has them (the old page wrote nothing over them then, never an empty brief)
    const back: Row = { data: asStored(json(orig.data), holder.data), edited_by_human: false }
    if (typeof orig.content_md === 'string') back.content_md = orig.content_md
    const { data: done, error: e2 } = await supabase
      .from('agent_outputs')
      .update(back)
      .eq('run_id', run)
      .eq('agent', agent)
      .eq('output_type', 'intel_brief')
      .select('id')
    if (e2) return fail(e2.message)
    if (!done?.length) return fail('the brief did not take the change')
  } else {
    const { data: cbs, error: e2 } = await supabase.from('creative_briefs').select('*').eq('run_id', run).order('created_at', { ascending: false }).limit(1)
    if (e2) return fail(e2.message)
    const stored = (cbs ?? [])[0] as Row | undefined
    const ocb = json(orig.cb)
    const body: Row = {}
    for (const k of CB_KEYS) {
      if (!(k in ocb)) continue
      body[k] = Array.isArray(ocb[k]) && k !== 'source_ad_ids' && typeof stored?.[k] === 'string' ? JSON.stringify(ocb[k]) : ocb[k]
    }
    if (Object.keys(body).length) {
      const { data: done, error: e3 } = await supabase.from('creative_briefs').update(body).eq('run_id', run).select('id')
      if (e3) return fail(e3.message)
      if (!done?.length) return fail('ads briefs cannot be changed from the dashboard yet')
    }
    for (const r of rows) {
      const d = { ...json(r.data) }
      delete d.review
      const { error: e4 } = await supabase.from('agent_outputs').update({ data: asStored(d, r.data) }).eq('id', str(r.id))
      if (e4) return fail(e4.message)
    }
  }
  // the five things as the agent wrote them (none when it wrote none; the old page left an ads brief's edited ones)
  const snapRow = rows.find((r) => r.snapshot !== null && r.snapshot !== undefined)
  if (snapRow) {
    const s = orig.snapshot === null || orig.snapshot === undefined ? null : asStored(orig.snapshot, snapRow.snapshot)
    const { error: e5 } = await supabase.from('agent_outputs').update({ snapshot: s }).eq('run_id', run).eq('agent', agent).not('snapshot', 'is', null)
    if (e5) return fail(e5.message)
  }
  await feedback(supabase, agent, run, 'Put back the agent’s own version.', user.email)
  refresh()
  return { ok: true, toast: 'The agent’s own version is back.' }
}
