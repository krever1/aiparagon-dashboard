'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { callN8n } from '@/lib/n8n'
import { json } from '@/lib/pipeline/intel'
import {
  MEM_SOURCE, type MemKind, RUN_KEY, type Run, WAIT_MS, errorOf, memItem, memOf, memRules, memWith, readOf, runsOf, runsWith, startedAgo,
} from '@/lib/pipeline/strategy'
import { createClient } from '@/lib/supabase/server'

// The strategy read's actions, as the signed-in teammate (v98InsRun, v98InsPoll and v106Remember in the current
// dashboard): a new read started through Engine 3 · Strategy Insights and kept for the team while it works
// (ai_settings strategy_runs), the check for what became of it, and a line remembered for every run (ai_settings
// e3_prefs.memory, which the house rules follow: ai_rules source profile:memory).

const SIGNED_OUT = 'You are signed out. Sign in again.'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'
const ID = /^[\w-]{1,80}$/
const OUTS = ['strategy_insights', 'strategy_insights_error']
type Supa = Awaited<ReturnType<typeof createClient>>
type Row = Record<string, unknown>

async function readSetting(supabase: Supa, key: string): Promise<unknown> {
  const { data, error } = await supabase.from('ai_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.value ?? null
}
async function setSetting(supabase: Supa, key: string, value: unknown, by: string) {
  const { error } = await supabase.from('ai_settings').upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/**
 * Starts a strategy read with what the team asked it to focus on. One at a time for the team: a read started in the
 * last five minutes that has not finished holds the next one back.
 */
export async function startRead(input: { focus?: string }): Promise<{ ok: true; run: Run } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const focus = str(input?.focus).replace(/\s+/g, ' ').trim().slice(0, 400)
  const supabase = await createClient()
  const now = Date.now()
  let runs: Run[] = []
  try {
    runs = runsOf(await readSetting(supabase, RUN_KEY))
  } catch {
    // no list of runs: the read can still start
  }
  const last = runs.reduce<Run | null>((a, r) => (!a || r.t > a.t ? r : a), null)
  if (last && now - last.t < WAIT_MS) {
    const got = await supabase.from('agent_outputs').select('run_id').eq('run_id', last.runId).in('output_type', OUTS).limit(1)
    if (!got.error && !(got.data ?? []).length) return { ok: false, error: 'A strategy read is already running. It started ' + startedAgo(last.t, now) + '.' }
  }
  let j: Record<string, unknown>
  try {
    j = await callN8n('e3-strategy-insights', { focus, requested_by: user.email }, { what: 'Strategy Insights', workflow: 'Engine 3 · Strategy Insights' })
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  const runId = str(j?.run_id)
  if (!j || j.ok !== true || !runId) return { ok: false, error: str(j?.message) || 'The strategy read did not start.' }
  const run: Run = { runId, t: now, by: user.email, focus }
  try {
    await setSetting(supabase, RUN_KEY, { runs: runsWith(runs, run, now) }, user.email)
  } catch {
    // the read is under way; only teammates will not see it running
  }
  refresh()
  return { ok: true, run }
}

/** What became of a read started from the dashboard: still working, ready, or the note n8n left when it could not make one. */
export async function checkRead(runId: string): Promise<{ state: 'wait' } | { state: 'ok' } | { state: 'err'; error: string }> {
  const user = await getCurrentUser()
  if (!user || !ID.test(str(runId))) return { state: 'wait' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('agent_outputs').select('output_type,title,data').eq('run_id', runId).in('output_type', OUTS).limit(3)
  if (error) return { state: 'wait' }
  const rows = (data ?? []) as Row[]
  if (rows.some((r) => r.output_type === 'strategy_insights')) {
    refresh()
    return { state: 'ok' }
  }
  const bad = rows.find((r) => r.output_type === 'strategy_insights_error')
  if (bad) {
    refresh()
    return { state: 'err', error: errorOf(bad) }
  }
  return { state: 'wait' }
}

/**
 * Remembers a line of a read for every run (v106Remember): it goes first in the remembered list (40 at most), and the
 * house rules the post writer follows are made again from the list. The new rules go in before the old ones come out,
 * so a failed save never leaves the rules empty (v104RulesSync).
 */
export async function rememberLine(input: { readId: string; k: MemKind; i: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const k = input?.k === 'cs' ? 'cs' : input?.k === 'dd' ? 'dd' : null
  const i = Number(input?.i)
  if (!k || !ID.test(str(input?.readId)) || !Number.isInteger(i) || i < 0 || i > 50) return { ok: false, error: 'Not saved: that line is not in the read.' }
  const supabase = await createClient()
  try {
    const got = await supabase.from('agent_outputs').select('id,run_id,title,data,created_at').eq('id', input.readId).eq('output_type', 'strategy_insights').maybeSingle()
    if (got.error) throw new Error(got.error.message)
    if (!got.data) return { ok: false, error: 'Not saved: that strategy read is gone.' }
    const at = new Date().toISOString()
    const item = memItem(readOf(got.data as Row), k, i, user.email, at)
    if (!item) return { ok: false, error: 'Not saved: that line is not in the read.' }
    const cur = json(await readSetting(supabase, 'e3_prefs'))
    const memory = memWith(memOf(cur), item)
    await setSetting(supabase, 'e3_prefs', { ...cur, memory, updated_by: user.email, updated_at: at }, user.email)
    // the house rules follow the list
    const old = await supabase.from('ai_rules').select('id').eq('source', MEM_SOURCE)
    if (old.error) throw new Error(old.error.message)
    const rows = memRules(memory).map((rule) => ({ rule, category: 'Other', applies_to: ['content_generation'], active: true, source: MEM_SOURCE, created_by: user.email }))
    if (rows.length) {
      const ins = await supabase.from('ai_rules').insert(rows)
      if (ins.error) throw new Error(ins.error.message)
    }
    const ids = ((old.data ?? []) as Row[]).map((r) => str(r.id)).filter(Boolean)
    if (ids.length) {
      const del = await supabase.from('ai_rules').delete().in('id', ids)
      if (del.error) throw new Error(del.error.message)
    }
  } catch (e) {
    return { ok: false, error: 'Not saved: ' + msgOf(e) }
  }
  refresh()
  return { ok: true }
}
