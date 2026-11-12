'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { N8nError, callN8n } from '@/lib/n8n'
import {
  FOCUS_CATS, FOCUS_THEMES, PENDING_MS, TERMS_MAX, type RunRow, type Terms, arr, competitorOf, focusClean, followFor, json, kindOf, linkedinHandle,
  runRows, termsFlat, termsOf, xHandle,
} from '@/lib/pipeline/intel'
import { createClient } from '@/lib/supabase/server'

// What the Intel Tracker saves, as the signed-in teammate: a custom run started through n8n (apIrSubmit) and kept for
// the team while it works (ai_settings intel_runs), what it tracks (intel_focus, nwFocusSave), the people, companies
// and searches it follows (competitors, intel_follow and intel_keywords; v96 and v111), and the industry it reads for
// (company_profile, e9IndSave).

const SIGNED_OUT = 'You are signed out. Sign in again.'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'
type Supa = Awaited<ReturnType<typeof createClient>>

export type Saved = { ok: true; toast: string } | { ok: false; error: string }

async function readSetting(supabase: Supa, key: string): Promise<unknown> {
  const { data, error } = await supabase.from('ai_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.value ?? null
}

async function setSetting(supabase: Supa, key: string, value: unknown, by: string) {
  const { error } = await supabase.from('ai_settings').upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

// ---------- Run now ----------

/** Starts a custom run with the names given (the Intel Tracker workflow's /webhook/intel-run). */
export async function startRun(input: { rows: RunRow[]; only: boolean; cascade: boolean }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const v = runRows(Array.isArray(input?.rows) ? input.rows.slice(0, 60) : [])
  if (!v.ok) return v
  let j: Record<string, unknown>
  try {
    // a run that builds an ad strategy hands the token on, so it goes out with time to spare
    j = await callN8n('intel-run', { competitors: v.rows, only_new: input.only !== false, cascade: input.cascade === true }, {
      what: 'Intel Tracker',
      workflow: 'Engine 3 · Intel Tracker (scheduled + custom)',
      minLeftSec: 20 * 60,
    })
  } catch (e) {
    if (e instanceof N8nError && e.code === 'off') {
      return {
        ok: false,
        error:
          'The Intel Tracker workflow is not switched on yet. In n8n, open “Engine 3 · Intel Tracker (scheduled + custom)”, pick the Apify, X and Tavily logins on their nodes, then press Publish.',
      }
    }
    return { ok: false, error: msgOf(e) }
  }
  if (!j || j.ok === false) return { ok: false, error: str(j?.message) || 'The tracker did not start.' }
  // kept for the team while it works, so every teammate's header says a run started (apIrPending, 45 minutes)
  try {
    const supabase = await createClient()
    const now = Date.now()
    const cur = arr(json(await readSetting(supabase, 'intel_runs')).runs)
      .map(json)
      .filter((p) => now - (Number(p.t) || 0) < PENDING_MS)
    const names = arr(j.tracking).map(str).filter(Boolean)
    const entry = { run_id: str(j.run_id), names: names.length ? names : v.rows.map((r) => str(r.name)), t: now, by: user.email, cascade: input.cascade === true }
    await setSetting(supabase, 'intel_runs', { runs: [entry, ...cur].slice(0, 10) }, user.email)
  } catch {
    // the run is under way; only the header's line about it is missing
  }
  refresh()
  return { ok: true, toast: 'Intel run started. The brief lands in 5 to 15 minutes, marked as a custom run.' }
}

// ---------- what it tracks ----------

export async function saveFocus(input: { themes: string[]; custom: string[]; categories: string[] }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const themes = FOCUS_THEMES.filter((t) => (input?.themes ?? []).includes(t))
  const custom = [...new Set((Array.isArray(input?.custom) ? input.custom : []).map((c) => focusClean(str(c))).filter((c) => c.length >= 2))].slice(0, 10)
  const categories = FOCUS_CATS.map((c) => c[0]).filter((c) => (input?.categories ?? []).includes(c))
  if (!themes.length && !custom.length) return { ok: false, error: 'Keep at least one theme.' }
  if (!categories.length) return { ok: false, error: 'Keep at least one category.' }
  try {
    const supabase = await createClient()
    await setSetting(supabase, 'intel_focus', { themes, custom, categories, updated_by: user.email, updated_at: new Date().toISOString() }, user.email)
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Saved. The next run tracks these.' }
}

// ---------- the industry it reads for ----------

export async function saveIndustry(input: { industry: string; targetMarket: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const industry = str(input?.industry).trim().slice(0, 200)
  const aud = str(input?.targetMarket).trim().slice(0, 600)
  if (!industry) return { ok: false, error: 'Add the industry.' }
  const supabase = await createClient()
  const cur = await supabase.from('company_profile').select('id').limit(1)
  const id = (cur.data ?? [])[0]?.id
  if (cur.error || id === undefined || id === null) return { ok: false, error: 'Could not save: ' + (cur.error?.message || 'there is no company profile yet') }
  const { error } = await supabase
    .from('company_profile')
    .update({ industry, target_market: aud || null, updated_by: user.email, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  refresh()
  return { ok: true, toast: 'Saved. The next Intel Tracker and Ad Strategist runs use it.' }
}

// ---------- who it follows ----------

export async function followAdd(input: { kind: string; name: string; linkedin: string; x: string; website: string; notes: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const kind = input?.kind === 'person' ? 'person' : 'company'
  const name = str(input?.name).trim().slice(0, 120)
  const liRaw = str(input?.linkedin).trim().slice(0, 200)
  if (!name) return { ok: false, error: 'Add a name.' }
  const li = linkedinHandle(liRaw, kind)
  if (liRaw && !li) return { ok: false, error: 'That does not look like a LinkedIn link. Paste the profile or company page link.' }
  const x = xHandle(str(input?.x).slice(0, 80))
  const website = kind === 'company' ? str(input?.website).trim().slice(0, 200) : ''
  const notes = str(input?.notes).trim().slice(0, 300)
  const supabase = await createClient()
  const { data, error } = await supabase.from('competitors').select('id,name,status,follow_for').limit(500)
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  const all = (data ?? []).map((r) => competitorOf(r as Record<string, unknown>))
  const now = new Date().toISOString()
  try {
    // one followed for ads only reads their posts too, with no second row (v111)
    const ads = all.find((c) => c.name.trim().toLowerCase() === name.toLowerCase() && c.status !== 'denied' && followFor(c) === 'ads')
    if (ads) {
      const body: Record<string, unknown> = { follow_for: 'both', follow_kind: kind, updated_at: now }
      if (li) body.handle_linkedin = li
      if (x) body.handle_x = x
      if (website) body.website = website
      if (notes) body.notes = notes
      const up = await supabase.from('competitors').update(body).eq('id', ads.id)
      if (up.error) throw new Error(up.error.message)
      refresh()
      return { ok: true, toast: ads.name + ' was followed for ads only. From the next run the Intel Tracker reads their posts too.' }
    }
    const same = all.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    if (same && same.status !== 'denied') return { ok: false, error: name + ' is already on the list.' }
    if (same) {
      const up = await supabase
        .from('competitors')
        .update({ status: 'approved', follow_kind: kind, updated_at: now, ...(li ? { handle_linkedin: li } : {}) })
        .eq('id', same.id)
      if (up.error) throw new Error(up.error.message)
    } else {
      const ins = await supabase.from('competitors').insert({
        name,
        handle_linkedin: li,
        handle_x: x,
        website: website || null,
        notes: notes || null,
        follow_kind: kind,
        status: 'approved',
        source: 'manual',
        priority: 'medium',
        added_by: user.email,
      })
      if (ins.error) throw new Error(ins.error.message)
    }
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Following ' + name + '. The next run reads their posts.' }
}

/** Stop following, follow again, move between people and companies, or read the posts of one followed for ads only. */
export async function followSet(input: { id: string; change: 'stop' | 'again' | 'kind' | 'posts' }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const id = str(input?.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'That is not on the follow list.' }
  const supabase = await createClient()
  const got = await supabase.from('competitors').select('id,name,handle_linkedin,handle_x,meta_page_id,website,follow_kind').eq('id', id).maybeSingle()
  if (got.error || !got.data) return { ok: false, error: 'Could not save: ' + (got.error?.message || 'it is not on the follow list any more') }
  const c = competitorOf(got.data as Record<string, unknown>)
  const name = c.name
  const now = new Date().toISOString()
  let body: Record<string, unknown>
  let toast: string
  if (input?.change === 'stop') {
    body = { status: 'denied', updated_at: now }
    toast = 'Stopped following ' + name + '.'
  } else if (input?.change === 'again') {
    body = { status: 'approved', updated_at: now }
    toast = 'Following ' + name + ' again.'
  } else if (input?.change === 'posts') {
    body = { follow_for: 'both', updated_at: now }
    toast = 'From the next run the Intel Tracker reads ' + (name || 'this account') + '’s posts too.'
  } else {
    const k = kindOf(c) === 'person' ? 'company' : 'person'
    body = { follow_kind: k, updated_at: now }
    toast = 'Moved ' + name + ' to ' + (k === 'person' ? 'people' : 'companies') + '.'
  }
  const { error } = await supabase.from('competitors').update(body).eq('id', id)
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  refresh()
  return { ok: true, toast }
}

// ---------- the searches it runs ----------

const TERM_KINDS = ['topics', 'tech', 'industries'] as const

async function saveTerms(supabase: Supa, T: Terms, by: string) {
  await setSetting(supabase, 'intel_follow', { topics: T.topics, tech: T.tech, industries: T.industries }, by)
  await setSetting(supabase, 'intel_keywords', termsFlat(T).slice(0, TERMS_MAX), by)
}

async function readTerms(supabase: Supa): Promise<Terms> {
  const [f, k] = await Promise.all([readSetting(supabase, 'intel_follow'), readSetting(supabase, 'intel_keywords')])
  return termsOf(f, k)
}

export async function termAdd(input: { kind: string; value: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const kind = TERM_KINDS.find((k) => k === input?.kind)
  const v = str(input?.value).replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!kind || !v) return { ok: false, error: 'Type something to search for.' }
  const supabase = await createClient()
  try {
    const T = await readTerms(supabase)
    if (termsFlat(T).some((x) => x.toLowerCase() === v.toLowerCase())) return { ok: false, error: '“' + v + '” is already on the list.' }
    if (termsFlat(T).length >= TERMS_MAX) return { ok: false, error: 'That is ' + TERMS_MAX + ' already, the most one run can search. Remove one first.' }
    T[kind].push(v)
    await saveTerms(supabase, T, user.email)
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Added. The next run searches for it.' }
}

export async function termRemove(input: { kind: string; value: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const kind = TERM_KINDS.find((k) => k === input?.kind)
  const v = str(input?.value)
  if (!kind) return { ok: false, error: 'Could not save: that is not a search.' }
  const supabase = await createClient()
  try {
    const T = await readTerms(supabase)
    const i = T[kind].findIndex((x) => x === v)
    if (i < 0) return { ok: false, error: 'Could not save: “' + v + '” is not on the list any more.' }
    T[kind].splice(i, 1)
    await saveTerms(supabase, T, user.email)
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Removed “' + v + '”.' }
}
