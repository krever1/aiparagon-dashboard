'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { N8nError, callN8n } from '@/lib/n8n'
import { type LogInput, type Platform, type SyncState, resultFrom } from '@/lib/pipeline/ad-testing'
import { arr, json } from '@/lib/pipeline/intel'
import { createClient } from '@/lib/supabase/server'
import { hookText } from '@/lib/touchpoint/approvals'

// What the Ad Testing page saves and asks, as the signed-in teammate (v98 and v113 in the current dashboard): a
// result logged by hand, changed or deleted (never a synced one: the next sync would undo it), the pieces a result can
// belong to, and the Meta and LinkedIn sync through Engine 3 · Ad Results Sync.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const SIGNED_OUT = 'You are signed out. Sign in again.'
const ID = /^[\w-]{1,64}$/
type Row = Record<string, unknown>

export type Choices = {
  lib: { id: string; title: string }[]
  drafts: { id: string; title: string; createdAt: string }[]
  camps: { runId: string; createdAt: string; offer: string; hooks: string[]; files: string[] }[]
}

/**
 * What a result can belong to (v106PickLoad): the 60 newest library pieces, the 40 newest drafts, and the book-a-call
 * and low-ticket campaigns (the newest row of each run) with their hooks and ad images.
 */
export async function pickChoices(): Promise<{ ok: true; choices: Choices } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const [lib, drafts, outs, pkgs] = await Promise.all([
    supabase.from('content_pieces').select('id,title').order('updated_at', { ascending: false }).limit(60),
    supabase.from('agent_outputs').select('id,title,created_at').eq('output_type', 'content_draft').order('created_at', { ascending: false }).limit(40),
    supabase.from('agent_outputs').select('run_id,created_at,data').eq('agent', 'low_ticket_content').order('created_at', { ascending: false }).limit(40),
    supabase.from('funnel_packages').select('run_id,ad_variations').order('created_at', { ascending: false }).limit(40),
  ])
  const hooks: Record<string, string[]> = {}
  for (const p of (pkgs.data ?? []) as Row[]) {
    const run = str(p.run_id)
    if (run && !(run in hooks)) hooks[run] = arr(json(p.ad_variations).hook_variations).map(hookText).filter(Boolean)
  }
  const seen = new Set<string>()
  const camps: Choices['camps'] = []
  for (const o of (outs.data ?? []) as Row[]) {
    const run = str(o.run_id)
    if (!run || seen.has(run)) continue
    seen.add(run)
    const d = json(o.data)
    camps.push({
      runId: run,
      createdAt: str(o.created_at),
      offer: str(d.offer_name),
      hooks: hooks[run] ?? [],
      files: arr(d.ad_images).map((i) => str(json(i).file)),
    })
  }
  return {
    ok: true,
    choices: {
      lib: ((lib.data ?? []) as Row[]).map((r) => ({ id: str(r.id), title: str(r.title) })),
      drafts: ((drafts.data ?? []) as Row[]).map((r) => ({ id: str(r.id), title: str(r.title), createdAt: str(r.created_at) })),
      camps,
    },
  }
}

/** Save a result logged by hand (v98ResSave): checked by the same rules the form shows, a new one marked as entered here. */
export async function saveResult(input: { id?: string } & LogInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const checked = resultFrom(input, new Date().toISOString().slice(0, 10))
  if ('error' in checked) return { ok: false, error: checked.error }
  const row = { ...checked.row, updated_by: user.email, updated_at: new Date().toISOString() }
  const supabase = await createClient()
  const id = str(input?.id)
  if (id) {
    if (!ID.test(id)) return { ok: false, error: 'Could not save: that result is gone' }
    const { data: cur, error: e0 } = await supabase.from('content_results').select('id,attribution').eq('id', id).limit(1)
    if (e0) return { ok: false, error: 'Could not save: ' + e0.message }
    const was = ((cur ?? []) as Row[])[0]
    if (!was) return { ok: false, error: 'Could not save: that result is gone' }
    if (str(was.attribution) === 'api') return { ok: false, error: 'This result is synced from the ad platform, so the next sync would undo a change.' }
    const { data, error } = await supabase.from('content_results').update(row).eq('id', id).select('id')
    if (error) return { ok: false, error: 'Could not save: ' + error.message }
    if (!data?.length) return { ok: false, error: 'Could not save: nothing came back' }
  } else {
    const { error } = await supabase.from('content_results').insert({ ...row, created_by: user.email, attribution: 'manual' })
    if (error) return { ok: false, error: 'Could not save: ' + error.message }
  }
  refresh()
  return { ok: true }
}

/** Delete a result (v98ResDel); a synced one stays, as its row says. */
export async function deleteResult(input: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.id)
  if (!ID.test(id)) return { ok: false, error: 'Could not delete: that result is gone' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('content_results').delete().eq('id', id).or('attribution.is.null,attribution.neq.api').select('id')
  if (error) return { ok: false, error: 'Could not delete: ' + error.message }
  if (!data?.length) return { ok: false, error: 'Could not delete: it is gone, or it is synced from the ad platform' }
  refresh()
  return { ok: true }
}

const platform = (v: unknown): Platform => {
  const o = json(v)
  return {
    connected: o.connected === true,
    account_name: str(o.account_name) || undefined,
    account_id: str(o.account_id) || undefined,
    last_sync: str(o.last_sync) || undefined,
    last_rows: typeof o.last_rows === 'number' ? o.last_rows : undefined,
    error: str(o.error) || undefined,
  }
}

/** Where the daily numbers stand (v113AdsLoad): the sync workflow's answer to status. */
export async function syncStatus(): Promise<SyncState> {
  const user = await getCurrentUser()
  if (!user) return { st: 'err', meta: {}, linkedin: {}, msg: SIGNED_OUT }
  try {
    const r = await callN8n<Row>('e3-ad-results', { action: 'status' }, { what: 'Ad Results Sync', workflow: 'Engine 3 · Ad Results Sync', timeoutMs: 30_000 })
    if (r && r.ok === true) return { st: 'ok', meta: platform(r.meta), linkedin: platform(r.linkedin), msg: '' }
    return { st: r && r.code === 'off' ? 'missing' : 'err', meta: {}, linkedin: {}, msg: str(r?.message) }
  } catch (e) {
    if (e instanceof N8nError && e.code === 'off') return { st: 'missing', meta: {}, linkedin: {}, msg: '' }
    return { st: 'err', meta: {}, linkedin: {}, msg: e instanceof Error ? e.message : String(e) }
  }
}

/** Sync now (v113AdsSync): the workflow reads the connected ad accounts and replaces their synced rows. */
export async function syncNow(): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  try {
    const r = await callN8n<Row>('e3-ad-results', { action: 'sync' }, { what: 'Ad Results Sync', workflow: 'Engine 3 · Ad Results Sync', timeoutMs: 120_000 })
    if (!r || r.ok !== true) return { ok: false, error: str(r?.message) || 'Could not sync just now' }
    refresh()
    return { ok: true, rows: Number(r.rows) || 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not sync just now' }
  }
}
