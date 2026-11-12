'use server'

import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { N8nError, callN8n } from '@/lib/n8n'
import {
  AD_TYPES, COUNTRIES, IND_MAX, KW_MAX, adScheduleOf, advertisers, chipClean, fbPage, indMapsOf, industryAsk, industryOf, poolOf,
} from '@/lib/pipeline/ad-strategist'
import { PENDING_MS, arr, competitorOf, followFor, json } from '@/lib/pipeline/intel'
import { createClient } from '@/lib/supabase/server'

// What the Ad Strategist saves, as the signed-in teammate: an ad in or out of the next ads brief (v113InBrief), a score
// set by hand (editScore), Run now through n8n kept for the team while it works (ai_settings ad_runs), the advertisers'
// industries (v96, v111), the Following tab's searches and filters (ads_follow) and the accounts followed for ads
// (competitors, v111).

const SIGNED_OUT = 'You are signed out. Sign in again.'
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'
const ID = /^[0-9a-f-]{36}$/i
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

// ---------- one ad ----------

/** In or out of the next ads brief (ad_records.in_brief). */
export async function setInBrief(input: { id: string; on: boolean }): Promise<Saved> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  if (!ID.test(str(input?.id))) return { ok: false, error: 'That is not an ad.' }
  const on = input.on === true
  const { data, error } = await (await createClient()).from('ad_records').update({ in_brief: on }).eq('id', input.id).select('id')
  if (error) return { ok: false, error: 'Could not save that: ' + error.message }
  if (!data?.length) return { ok: false, error: 'Could not save that: the ad did not take the change.' }
  refresh()
  return { ok: true, toast: on ? 'It goes into the next ads brief' : 'Left out of the next ads brief' }
}

/** A score set by hand, 0 to 100, kept in place of the agent's (editScore), with a note for AI settings. */
export async function setScore(input: { id: string; score: number }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  if (!ID.test(str(input?.id))) return { ok: false, error: 'That is not an ad.' }
  const n = Math.round(Number(input.score))
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Give a score from 0 to 100.' }
  const supabase = await createClient()
  const { data: before } = await supabase.from('ad_records').select('performance_score').eq('id', input.id).maybeSingle()
  const { data, error } = await supabase.from('ad_records').update({ performance_score: n / 100, score_overridden: true }).eq('id', input.id).select('id')
  if (error) return { ok: false, error: 'Could not save the score: ' + error.message }
  if (!data?.length) return { ok: false, error: 'Could not save the score: the ad did not take the change.' }
  const was = before?.performance_score === null || before?.performance_score === undefined ? 'n/a' : String(Math.round(Number(before.performance_score) * 100))
  // the note AI settings and the strategy read count (errors here do not undo the score)
  await supabase.from('agent_feedback').insert({
    author: user.email,
    agent: 'ad_strategist',
    target_type: 'performance_score_override',
    target_id: input.id,
    action: 'score_override',
    feedback: 'Score manually set to ' + n + ' (was ' + was + ')',
  })
  refresh()
  return { ok: true, toast: 'Score saved: ' + n + ' out of 100.' }
}

// ---------- Run now ----------

/** A run of the Ad Strategist now (/webhook/ad-strategist-run), with the team's limits, kept for the team while it works. */
export async function startAdRun(): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  let S
  try {
    S = adScheduleOf(await readSetting(supabase, 'agent_runs'))
  } catch (e) {
    return { ok: false, error: 'Could not read the run limits: ' + msgOf(e) }
  }
  let j: Record<string, unknown>
  try {
    j = await callN8n('ad-strategist-run', { requested_by: user.email, top: S.top, behind: S.behind, per_advertiser: S.per }, { what: 'Ad Strategist', workflow: 'Engine 3 · Ad Strategist' })
  } catch (e) {
    if (e instanceof N8nError && e.code === 'off')
      return { ok: false, error: 'Starting a full run from here is not switched on in n8n yet. It still runs on its schedule, and you can build a brief from your uploads now.' }
    return { ok: false, error: msgOf(e) }
  }
  if (!j || j.ok === false) return { ok: false, error: str(j?.message) || 'The Ad Strategist did not start.' }
  try {
    const now = Date.now()
    const cur = arr(json(await readSetting(supabase, 'ad_runs')).runs)
      .map(json)
      .filter((p) => now - (Number(p.t) || 0) < PENDING_MS)
    await setSetting(supabase, 'ad_runs', { runs: [{ run_id: str(j.run_id), names: [], t: now, by: user.email, cascade: false }, ...cur].slice(0, 10) }, user.email)
  } catch {
    // the run is under way; only the header's line about it is missing
  }
  refresh()
  return { ok: true, toast: 'Ad Strategist started. The new ads brief lands in about 10 minutes.' }
}

// ---------- industries ----------

/** Asks the industry agent for the advertisers that have none (v111IndSuggest) and keeps its answers (ad_industries_ai). */
export async function suggestIndustries(): Promise<{ ok: true; n: number; message: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  const [wc, st] = await Promise.all([
    supabase.from('winner_creatives').select('id,advertiser_name,hook,body,offer_inferred,destination_url,created_at').order('created_at', { ascending: false }).limit(1000),
    supabase.from('ai_settings').select('key,value').in('key', ['ad_industries', 'ad_industries_ai']),
  ])
  if (wc.error) return { ok: false, error: 'Could not read the ads: ' + wc.error.message }
  if (st.error) return { ok: false, error: 'Could not read the industries: ' + st.error.message }
  const set: Record<string, unknown> = {}
  for (const r of st.data ?? []) set[str(r.key)] = r.value
  const M = indMapsOf(set.ad_industries, set.ad_industries_ai)
  const pool = poolOf((wc.data ?? []) as Record<string, unknown>[], Date.now())
  const missing = advertisers(pool).filter((n) => !industryOf(M, n))
  if (!missing.length) return { ok: true, n: 0, message: 'Every advertiser has an industry.' }
  let j: Record<string, unknown>
  try {
    j = await callN8n('e3-ad-industries', { advertisers: industryAsk(pool, missing) }, { what: 'industry agent', workflow: 'Engine 3 · Advertiser Industries', timeoutMs: 120_000 })
  } catch (e) {
    if (e instanceof N8nError && e.code === 'off') return { ok: false, error: 'The industry agent is not switched on in n8n yet.' }
    return { ok: false, error: msgOf(e) }
  }
  if (!j || j.ok === false) return { ok: false, error: str(j?.message) || 'The industry agent did not answer.' }
  const got: Record<string, string> = {}
  for (const [name, v] of Object.entries(json(j.industries))) {
    const t = str(v)
      .replace(/\s*[‒-―]\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
    if (t && name.trim()) got[name.trim().toLowerCase()] = t
  }
  const n = Object.keys(got).length
  if (n) {
    try {
      // read again and merge: a teammate may have saved in the meantime; the new answers win for their advertisers
      const ai = json(await readSetting(supabase, 'ad_industries_ai'))
      await setSetting(supabase, 'ad_industries_ai', { ...ai, ...got }, user.email)
    } catch (e) {
      return { ok: false, error: 'Could not save the suggestions: ' + msgOf(e) }
    }
    refresh()
  }
  return {
    ok: true,
    n,
    message: n
      ? 'The agent suggested ' + n + ' industr' + (n === 1 ? 'y' : 'ies') + '. Change any that are off.'
      : 'The agent could not tell the industry of these advertisers. Set them by hand.',
  }
}

/**
 * The industries typed by hand (v96IndSave), only for the advertisers changed in the window: a value is kept as the
 * team's; an empty box takes away both the team's value and the agent's suggestion for that advertiser.
 */
export async function saveIndustries(input: { changes: Record<string, string> }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const changes = Object.entries(json(input?.changes)).slice(0, 300)
  if (!changes.length) return { ok: true, toast: 'Nothing changed.' }
  const supabase = await createClient()
  try {
    const hand = json(await readSetting(supabase, 'ad_industries')) as Record<string, unknown>
    const ai = json(await readSetting(supabase, 'ad_industries_ai')) as Record<string, unknown>
    let aiChanged = false
    for (const [name, v] of changes) {
      const k = name.trim().toLowerCase()
      if (!k) continue
      const t = str(v).replace(/\s+/g, ' ').trim().slice(0, 80)
      if (t) hand[k] = t
      else {
        delete hand[k]
        if (k in ai) {
          delete ai[k]
          aiChanged = true
        }
      }
    }
    await setSetting(supabase, 'ad_industries', hand, user.email)
    if (aiChanged) await setSetting(supabase, 'ad_industries_ai', ai, user.email)
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Saved. Industries show on every advertisement.' }
}

// ---------- Following: searches and filters ----------

/** What else the Ad Strategist looks for (ai_settings ads_follow, v111FolSave). */
export async function saveAdsFollow(input: { keywords: string[]; industries: string[]; types: string[]; active: string; country: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const list = (v: unknown, max: number) => {
    const out: string[] = []
    for (const x of arr(v)) {
      const t = chipClean(str(x))
      if (t.length >= 2 && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t)
    }
    return out.slice(0, max)
  }
  const keywords = list(input?.keywords, KW_MAX)
  const industries = list(input?.industries, IND_MAX)
  const types = AD_TYPES.map((t) => t[0]).filter((t) => arr(input?.types).map(str).includes(t))
  const active = input?.active === 'active' ? 'active' : 'all'
  const country = COUNTRIES.some((c) => c[0] === input?.country) ? input.country : 'US'
  try {
    const supabase = await createClient()
    await setSetting(supabase, 'ads_follow', { keywords, industries, types, active, country, updated_by: user.email, updated_at: new Date().toISOString() }, user.email)
  } catch (e) {
    return { ok: false, error: 'Could not save: ' + msgOf(e) }
  }
  refresh()
  return { ok: true, toast: 'Saved. The next run follows these.' }
}

// ---------- Following: accounts ----------

/**
 * Follows an account for its ads (v111FollowSave): its Facebook page, read from what was pasted. An account of the
 * same name (or the id given) gets the page and is switched on for ads; otherwise a new one is added.
 */
export async function followForAds(input: { id?: string; name: string; page: string; kind: string; forWhat: string }): Promise<Saved> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const name = str(input?.name).replace(/\s+/g, ' ').trim().slice(0, 80)
  if (name.length < 2) return { ok: false, error: 'Give the account a name.' }
  const page = fbPage(str(input?.page))
  if (!page) return { ok: false, error: 'That does not look like a Facebook page. Paste the page link, for example facebook.com/their-page.' }
  const forWhat = input?.forWhat === 'both' ? 'both' : 'ads'
  const supabase = await createClient()
  const { data: rows, error } = await supabase.from('competitors').select('id,name,status,follow_for').order('created_at', { ascending: true }).limit(500)
  if (error) return { ok: false, error: 'Could not read who you follow: ' + error.message }
  const all = (rows ?? []).map((r) => competitorOf(r as Record<string, unknown>))
  const ex = (input?.id && all.find((c) => c.id === input.id)) || all.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
  const now = new Date().toISOString()
  if (ex) {
    const patch: Record<string, unknown> = { meta_page_id: page, updated_at: now }
    if (ex.status === 'denied') {
      patch.status = 'approved'
      patch.follow_for = forWhat
    } else if (followFor(ex) === 'posts' || (followFor(ex) === 'ads' && forWhat === 'both')) patch.follow_for = 'both'
    const { data, error: e2 } = await supabase.from('competitors').update(patch).eq('id', ex.id).select('id')
    if (e2) return { ok: false, error: e2.message }
    if (!data?.length) return { ok: false, error: 'The account did not take the change.' }
    refresh()
    return { ok: true, toast: input?.id ? 'Page added. The next run pulls ' + ex.name + '’s ads.' : name + ' is followed. The next run pulls their ads.' }
  }
  const { data, error: e3 } = await supabase
    .from('competitors')
    .insert({ name, meta_page_id: page, follow_kind: input?.kind === 'person' ? 'person' : 'company', follow_for: forWhat, status: 'approved', source: 'manual', added_by: user.email })
    .select('id')
  if (e3) return { ok: false, error: e3.message }
  if (!data?.length) return { ok: false, error: 'The account was not saved.' }
  refresh()
  return { ok: true, toast: name + ' is followed. The next run pulls their ads.' }
}

/** Ads only, Ads and posts, or Pull their ads too (v111FolFor). */
export async function setFollowFor(input: { id: string; f: string }): Promise<Saved> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const f = input?.f === 'ads' || input?.f === 'both' || input?.f === 'posts' ? input.f : null
  if (!f || !ID.test(str(input?.id))) return { ok: false, error: 'That is not an account.' }
  const supabase = await createClient()
  const { data: row } = await supabase.from('competitors').select('id,name,follow_for').eq('id', input.id).maybeSingle()
  if (!row) return { ok: false, error: 'Could not find that account any more. Refresh the page.' }
  const c = competitorOf(row as Record<string, unknown>)
  const was = followFor(c)
  if (was === f) return { ok: true, toast: '' }
  const { data, error } = await supabase.from('competitors').update({ follow_for: f, updated_at: new Date().toISOString() }).eq('id', c.id).select('id')
  if (error) return { ok: false, error: 'Could not change it: ' + error.message }
  if (!data?.length) return { ok: false, error: 'Could not change it: the account did not take the change.' }
  refresh()
  if (f === 'ads') return { ok: true, toast: c.name + ' is followed for ads only. The Intel Tracker leaves them out from the next run.' }
  if (was === 'posts') return { ok: true, toast: 'The next run pulls ' + c.name + '’s ads too.' }
  return { ok: true, toast: 'The Intel Tracker reads ' + c.name + '’s posts too from the next run.' }
}

/** Stop following (an ads-only account) or stop reading its ads (an account read for its posts too) (v111FolStop). */
export async function stopAds(input: { id: string }): Promise<Saved> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  if (!ID.test(str(input?.id))) return { ok: false, error: 'That is not an account.' }
  const supabase = await createClient()
  const { data: row } = await supabase.from('competitors').select('id,name,follow_for').eq('id', input.id).maybeSingle()
  if (!row) return { ok: false, error: 'Could not find that account any more. Refresh the page.' }
  const c = competitorOf(row as Record<string, unknown>)
  const adsOnly = followFor(c) === 'ads'
  const { data, error } = await supabase
    .from('competitors')
    .update(adsOnly ? { status: 'denied', updated_at: new Date().toISOString() } : { follow_for: 'posts', updated_at: new Date().toISOString() })
    .eq('id', c.id)
    .select('id')
  if (error) return { ok: false, error: 'Could not change it: ' + error.message }
  if (!data?.length) return { ok: false, error: 'Could not change it: the account did not take the change.' }
  refresh()
  return { ok: true, toast: adsOnly ? 'Stopped following ' + c.name + '.' : 'Stopped. ' + c.name + '’s ads are no longer pulled.' }
}
