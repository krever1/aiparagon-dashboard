'use server'

import { randomUUID } from 'node:crypto'
import { refresh } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { N8nError, callN8n } from '@/lib/n8n'
import { adTitle, isDynamic } from '@/lib/pipeline/ads'
import { arr, json } from '@/lib/pipeline/intel'
import {
  type CopyResult, CAMPAIGN_MS, UPLOAD_PATH, UP_MAX_BYTES, UP_MAX_FILES, adDbError, adRowOf, analysisOf, briefAdOf, campaignRunsOf, campaignState,
  copyAdOf, copyMd, copyResultOf, imagesOf, linkOf, offerOf, rereadPatch, safePlatform, uploadPath,
} from '@/lib/pipeline/uploads'
import { createClient } from '@/lib/supabase/server'

// What the windows on the Ad Strategist and Runs & uploads save, as the signed-in teammate: competitor ads uploaded and
// read by the analyzer (apSubmitAdUpload, Engine 3 · Ad Upload Analyzer), an upload read again (apReanalyse), an ads
// brief built from the uploads (apRunBuildBrief, Engine 3 · Custom Ad Strategy), ad copy written and saved
// (apRunAdCopy, apSaveAdCopy) and a campaign started from a brief (apSendToLowTicket, the Low-Ticket Ads Content
// Agent), kept for the team while it works (ai_settings campaign_runs).

const SIGNED_OUT = 'You are signed out. Sign in again.'
const BUCKET = 'creatives'
const ID = /^[0-9a-f-]{36}$/i
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : str(e)) || 'something went wrong'
const today = () => new Date().toISOString().slice(0, 10)
type Supa = Awaited<ReturnType<typeof createClient>>

export type Done = { ok: true; toast: string } | { ok: false; error: string }

async function readSetting(supabase: Supa, key: string): Promise<unknown> {
  const { data, error } = await supabase.from('ai_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.value ?? null
}

/** The analyzer's reading of one ad, or why there is none. */
async function analyze(body: Record<string, unknown>): Promise<{ analysis: Record<string, unknown> } | { error: string }> {
  try {
    const j = await callN8n<unknown>('ad-upload', { mode: 'analyze', ...body }, { what: 'Ad Upload Analyzer', workflow: 'Engine 3 · Ad Upload Analyzer', timeoutMs: 150_000 })
    return analysisOf(j)
  } catch (e) {
    return { error: msgOf(e) }
  }
}

// ---------- uploading ----------

/** Upload addresses for the screenshots, signed as the teammate (the creatives bucket takes the team's uploads/). */
export async function startAdUploads(input: {
  files: { name: string; size: number; type: string }[]
}): Promise<{ ok: true; files: { path: string; url: string }[] } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const files = Array.isArray(input?.files) ? input.files : []
  if (!files.length) return { ok: false, error: 'Add at least one screenshot, or paste the ad copy.' }
  if (files.length > UP_MAX_FILES) return { ok: false, error: UP_MAX_FILES + ' screenshots at most.' }
  for (const f of files) {
    if (!/^image\//i.test(str(f?.type))) return { ok: false, error: str(f?.name) + ' is not a picture.' }
    if (!(Number(f.size) > 0)) return { ok: false, error: str(f.name) + ' is empty.' }
    if (Number(f.size) > UP_MAX_BYTES) return { ok: false, error: str(f.name) + ' is over 8 MB.' }
  }
  const supabase = await createClient()
  const day = today()
  const out: { path: string; url: string }[] = []
  for (const f of files) {
    const path = uploadPath(day, randomUUID(), str(f.name))
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) return { ok: false, error: 'Storage turned the upload away: ' + (error?.message || 'no upload address') + '.' }
    out.push({ path, url: data.signedUrl })
  }
  return { ok: true, files: out }
}

export type SavedAd = { ok: true; id: string; hook: string; analysed: boolean; why: string } | { ok: false; error: string }

/**
 * One ad, its screenshots already in Storage: the analyzer reads it (a failure still saves it, as not read yet), then
 * its row goes into the ads table (apAdRowFromAnalysis). Only the first ad of a batch keeps the link as its Ad Library
 * link (the table takes each link once), as before.
 */
export async function saveUploadedAd(input: {
  paths: string[]
  advertiser: string
  platform: string
  link: string
  copy: string
  inBrief: boolean
  first: boolean
}): Promise<SavedAd> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const advertiser = str(input?.advertiser).replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!advertiser) return { ok: false, error: 'Say whose ad this is.' }
  const paths = (Array.isArray(input?.paths) ? input.paths : []).map(str)
  if (paths.length > UP_MAX_FILES || paths.some((p) => !UPLOAD_PATH.test(p))) return { ok: false, error: 'That is not an upload of yours.' }
  const copy = str(input?.copy).trim().slice(0, 10_000)
  if (!paths.length && !copy) return { ok: false, error: 'Add at least one screenshot, or paste the ad copy.' }
  const link = linkOf(input?.link)
  if (link === null) return { ok: false, error: 'The ad link should be a web address, for example https://www.linkedin.com/ad-library/detail/…' }
  const platform = safePlatform(input?.platform)
  const supabase = await createClient()
  const images = paths.map((p) => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl)
  const read = await analyze({ images, link, copy, advertiser, platform })
  const analysis = 'analysis' in read ? read.analysis : null
  const why = 'error' in read ? read.error : ''
  const base = {
    day: today(),
    advertiser,
    platform,
    link,
    copy,
    images,
    analysis,
    error: why,
    by: user.email,
    inBrief: input?.inBrief !== false,
    now: new Date().toISOString(),
  }
  let row = adRowOf({ ...base, libraryUrl: link && input?.first ? link : 'swipe:upload:' + randomUUID() })
  let res = await supabase.from('ad_records').insert(row).select('id,hook').single()
  // the link is already an ad in the table: saved again under an upload id, with the link kept as where it goes
  if (res.error?.code === '23505' && !str(row.ad_library_url).startsWith('swipe:upload:')) {
    row = adRowOf({ ...base, libraryUrl: 'swipe:upload:' + randomUUID() })
    res = await supabase.from('ad_records').insert(row).select('id,hook').single()
  }
  if (res.error || !res.data) return { ok: false, error: adDbError(res.error) }
  refresh()
  return { ok: true, id: str(res.data.id), hook: str(res.data.hook), analysed: !!analysis, why }
}

/** Read this ad: the analyzer reads an upload it could not read before (apReanalyse). */
export async function rereadAd(input: { id: string }): Promise<Done> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  if (!ID.test(str(input?.id))) return { ok: false, error: 'That is not an ad.' }
  const supabase = await createClient()
  const { data: row, error } = await supabase.from('ad_records').select('*').eq('id', input.id).maybeSingle()
  if (error) return { ok: false, error: 'Could not read the ad: ' + error.message }
  if (!row) return { ok: false, error: 'Could not find that ad any more. Refresh the page.' }
  const r = row as Record<string, unknown>
  const read = await analyze({
    images: imagesOf(r),
    link: str(r.destination_url),
    copy: str(json(r.upload_analysis).pasted_copy),
    advertiser: str(r.advertiser_name),
    platform: str(r.platform),
  })
  if ('error' in read) return { ok: false, error: read.error }
  const { data, error: e2 } = await supabase.from('ad_records').update(rereadPatch(r, read.analysis, new Date().toISOString())).eq('id', input.id).select('id')
  if (e2) return { ok: false, error: 'Could not save the reading: ' + adDbError(e2) }
  if (!data?.length) return { ok: false, error: 'Could not save the reading: the ad did not take the change.' }
  refresh()
  return { ok: true, toast: 'Ad read' }
}

// ---------- building an ads brief from the uploads ----------

export type AdPick = { id: string; advertiser: string; title: string; at: string; inBrief: boolean }

/** The team's uploads the analyzer has read, newest first, read afresh as the window opens (apLoadUploads). */
async function readUploads(supabase: Supa): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('winner_creatives')
    .select('*')
    .not('uploaded_by', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).filter((r) => str(json(r.upload_analysis).status) === 'done')
}

const pickOf = (r: Record<string, unknown>): AdPick => ({
  id: str(r.id),
  advertiser: str(r.advertiser_name).trim() || 'Unknown',
  title: adTitle(r),
  at: str(r.created_at),
  inBrief: r.in_brief !== false,
})

/** What the build-a-brief window lists. */
export async function briefChoices(): Promise<{ ok: true; ads: AdPick[] } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  try {
    return { ok: true, ads: (await readUploads(await createClient())).map(pickOf) }
  } catch (e) {
    return { ok: false, error: 'Could not read your uploads: ' + msgOf(e) }
  }
}

export type BuiltBrief = { ok: true; runId: string; angle: string; hooks: string[] } | { ok: false; error: string }

/** An ads brief from the picked uploads, and the high-value Intel Tracker findings of the last 30 days if asked. */
export async function buildBrief(input: { ids: string[]; intel: boolean }): Promise<BuiltBrief> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const ids = [...new Set((Array.isArray(input?.ids) ? input.ids : []).map(str).filter((x) => ID.test(x)))].slice(0, 300)
  if (!ids.length) return { ok: false, error: 'Pick at least one ad.' }
  const supabase = await createClient()
  let ads: Record<string, unknown>[]
  try {
    ads = (await readUploads(supabase)).filter((r) => ids.includes(str(r.id)))
  } catch (e) {
    return { ok: false, error: 'Could not read your uploads: ' + msgOf(e) }
  }
  if (!ads.length) return { ok: false, error: 'Those ads are not read yet. Refresh the page and pick again.' }
  let intel: unknown[] = []
  if (input?.intel) {
    // the newest 25 (the old page read 25 in no order); a read that fails sends none
    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    const { data } = await supabase
      .from('intel_items')
      .select('summary,signal,themes')
      .eq('ad_context_value', 'high')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(25)
    intel = (data ?? []).map((r) => ({ summary: str(r.summary), signal: str(r.signal), themes: arr(r.themes) }))
  }
  let j: unknown
  try {
    j = await callN8n<unknown>('ad-brief', { requested_by: user.email, intel, ads: ads.map(briefAdOf) }, {
      what: 'Custom Ad Strategy',
      workflow: 'Engine 3 · Custom Ad Strategy',
      timeoutMs: 240_000,
      minLeftSec: 20 * 60,
    })
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  const o = json(Array.isArray(j) ? j[0] : j)
  if (o.ok !== true || !str(o.run_id)) return { ok: false, error: str(o.error) || str(o.message) || 'No brief came back.' }
  const b = json(o.brief)
  refresh()
  return {
    ok: true,
    runId: str(o.run_id),
    angle: str(b.differentiation_angle).trim(),
    hooks: arr(b.winning_hooks)
      .map((h) => (typeof h === 'string' ? h : str(json(h).pattern || json(h).hook || json(h).text)))
      .map((h) => h.trim())
      .filter(Boolean),
  }
}

// ---------- ad copy ----------

type Guide = { name: string; text: string }

async function readGuides(supabase: Supa): Promise<Guide[]> {
  const { data } = await supabase.from('guide_files').select('file_name,file_text').order('created_at', { ascending: false }).limit(40)
  return (data ?? [])
    .map((r) => ({ name: str(r.file_name), text: str(r.file_text).trim().slice(0, 60_000) }))
    .filter((g) => g.text.length > 40)
}

/** The ads to learn from: the team's read uploads, else up to 12 Ad Library ads with a hook (apOpenAdCopy). */
async function copyPool(supabase: Supa): Promise<{ ads: Record<string, unknown>[]; library: boolean }> {
  const ups = await readUploads(supabase)
  if (ups.length) return { ads: ups, library: false }
  const { data, error } = await supabase.from('winner_creatives').select('*').not('hook', 'is', null).order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  const lib = ((data ?? []) as Record<string, unknown>[]).filter((r) => str(r.hook).trim() && !isDynamic(r)).slice(0, 12)
  return { ads: lib, library: true }
}

export type CopyChoices = { ok: true; ads: AdPick[]; library: boolean; guides: string[]; voice: boolean; offer: string } | { ok: false; error: string }

/** What the Write ad copy window shows: the ads, the guidelines it reads, the brand voice and the offer. */
export async function copyChoices(): Promise<CopyChoices> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const supabase = await createClient()
  try {
    const [pool, guides, prof, offers] = await Promise.all([
      copyPool(supabase),
      readGuides(supabase),
      supabase.from('company_profile').select('brand_voice').limit(1).maybeSingle(),
      supabase.from('offers').select('name,type,price,whats_included,upsell_path,is_default,archived,created_at').limit(50),
    ])
    return {
      ok: true,
      ads: pool.ads.map(pickOf),
      library: pool.library,
      guides: guides.map((g) => g.name),
      voice: !!str(prof.data?.brand_voice).trim(),
      offer: offerOf((offers.data ?? []) as Record<string, unknown>[]).name,
    }
  } catch (e) {
    return { ok: false, error: 'Could not read the ads: ' + msgOf(e) }
  }
}

/** Ad copy from the picked ads (the analyzer's copy mode): the ads are patterns only; the words follow the guidelines. */
export async function writeAdCopy(input: { ids: string[]; platform: string; count: number }): Promise<{ ok: true; result: CopyResult } | { ok: false; error: string }> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const ids = [...new Set((Array.isArray(input?.ids) ? input.ids : []).map(str).filter((x) => ID.test(x)))].slice(0, 300)
  if (!ids.length) return { ok: false, error: 'Pick at least one ad.' }
  const platform = input?.platform === 'linkedin' ? 'linkedin' : 'meta'
  const count = Math.min(5, Math.max(2, Math.round(Number(input?.count) || 3)))
  const supabase = await createClient()
  let body: Record<string, unknown>
  try {
    const [pool, guides, prof, offers] = await Promise.all([
      copyPool(supabase),
      readGuides(supabase),
      supabase.from('company_profile').select('business_name,industry,target_market,website,brand_voice').limit(1).maybeSingle(),
      supabase.from('offers').select('name,type,price,whats_included,upsell_path,is_default,archived,created_at').limit(50),
    ])
    const ads = pool.ads.filter((r) => ids.includes(str(r.id)))
    if (!ads.length) return { ok: false, error: 'Those ads are not there any more. Refresh the page and pick again.' }
    const p = (prof.data ?? {}) as Record<string, unknown>
    body = {
      mode: 'copy',
      platform,
      count,
      company: { name: str(p.business_name), industry: str(p.industry), target_market: str(p.target_market), website: str(p.website) },
      offer: offerOf((offers.data ?? []) as Record<string, unknown>[]),
      brand_voice: str(p.brand_voice),
      guidelines: guides,
      ads: ads.map(copyAdOf),
    }
  } catch (e) {
    return { ok: false, error: 'Could not read the ads: ' + msgOf(e) }
  }
  let j: unknown
  try {
    j = await callN8n<unknown>('ad-upload', body, { what: 'Ad Upload Analyzer', workflow: 'Engine 3 · Ad Upload Analyzer', timeoutMs: 240_000 })
  } catch (e) {
    return { ok: false, error: msgOf(e) }
  }
  const o = json(Array.isArray(j) ? j[0] : j)
  const result = o.ok === false ? null : copyResultOf(o)
  if (!result) return { ok: false, error: str(o.error) || str(o.message) || 'No copy came back.' }
  return { ok: true, result }
}

/** Save to Pipeline: the set of ad copy as an agent_outputs row, listed on Runs & uploads and the Uploads tab. */
export async function saveAdCopy(input: { result: CopyResult; platform: string; ids: string[] }): Promise<Done> {
  if (!(await getCurrentUser())) return { ok: false, error: SIGNED_OUT }
  const r = input?.result
  const result = copyResultOf({ ok: true, variants: r?.variants, takeaways: r?.takeaways, guideline_notes: r?.notes })
  if (!result) return { ok: false, error: 'There is no copy to save.' }
  const platform = input?.platform === 'linkedin' ? 'linkedin' : 'meta'
  const ids = (Array.isArray(input?.ids) ? input.ids : []).map(str).filter((x) => ID.test(x)).slice(0, 300)
  const at = new Date().toISOString()
  const day = at.slice(0, 10)
  const { data, error } = await (await createClient())
    .from('agent_outputs')
    .insert({
      run_id: 'adcopy_' + at.slice(0, 16).replace(/\D/g, ''),
      agent: 'ad_copywriter',
      output_type: 'ad_copy',
      title: 'Ad copy from uploaded ads · ' + day,
      content_md: copyMd(result, platform, ids.length, day),
      data: { variants: result.variants, takeaways: result.takeaways, guideline_notes: result.notes, source_ads: ids, platform },
    })
    .select('id')
  if (error) return { ok: false, error: 'Could not save: ' + error.message }
  if (!data?.length) return { ok: false, error: 'Could not save: the copy was not kept.' }
  refresh()
  return { ok: true, toast: 'Saved to Pipeline' }
}

// ---------- Send to Marketing Generation ----------

/**
 * Marketing Generation (the Low-Ticket Ads Content Agent) writes a campaign from an ads brief built from the uploads:
 * the one named, else the newest. One at a time for the team: a campaign started in the last 15 minutes that has not
 * landed yet holds the next one back.
 */
export async function startCampaign(input: { brief?: string }): Promise<Done> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: SIGNED_OUT }
  const asked = str(input?.brief)
  if (asked && !/^agent2_custom_[\w.:-]{1,100}$/.test(asked)) return { ok: false, error: 'That is not an ads brief built from your uploads.' }
  const supabase = await createClient()
  let runs
  try {
    runs = campaignRunsOf(await readSetting(supabase, 'campaign_runs'))
  } catch (e) {
    return { ok: false, error: 'Could not read the campaigns under way: ' + msgOf(e) }
  }
  const now = Date.now()
  const last = runs[0]
  if (last && now - last.t < CAMPAIGN_MS) {
    const { data } = await supabase
      .from('agent_outputs')
      .select('run_id,created_at,title,data')
      .eq('agent', 'low_ticket_content')
      .gt('created_at', new Date(last.t - 5000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    const st = campaignState(last, (data ?? []).map((r) => ({ run_id: str(r.run_id), created_at: str(r.created_at), title: str(r.title), data: r.data })), now)
    if (st.status === 'running') return { ok: false, error: 'Marketing Generation is already running from ' + (last.brief || 'the newest brief') + '.' }
  }
  let brief = asked
  if (!brief) {
    const { data } = await supabase
      .from('agent_outputs')
      .select('run_id')
      .eq('agent', 'ad_strategist')
      .like('run_id', 'agent2_custom_%')
      .order('created_at', { ascending: false })
      .limit(1)
    brief = str(data?.[0]?.run_id)
  }
  let j: Record<string, unknown>
  try {
    // the agent saves with its own logins, but a run it chains hands the token on, so it goes out with time to spare
    j = await callN8n('e3-low-ticket-run', { source_brief_run: brief, requested_by: user.email }, {
      what: 'Marketing Generation',
      workflow: 'Low-Ticket Ads Content Agent',
      timeoutMs: 30_000,
      minLeftSec: 20 * 60,
    })
  } catch (e) {
    if (e instanceof N8nError && e.code === 'off') return { ok: false, error: 'Marketing Generation is switched off in n8n. Turn on “Low-Ticket Ads Content Agent” in n8n, then try again.' }
    return { ok: false, error: msgOf(e) }
  }
  const o = json(Array.isArray(j) ? (j as unknown[])[0] : j)
  if (o.ok === false) return { ok: false, error: str(o.message) || str(o.error) || 'Marketing Generation did not start.' }
  try {
    const cur = campaignRunsOf(await readSetting(supabase, 'campaign_runs')).filter((r) => now - r.t < 7 * 864e5)
    const value = { runs: [{ brief, t: now, by: user.email }, ...cur].slice(0, 10) }
    const { error } = await supabase.from('ai_settings').upsert({ key: 'campaign_runs', value, updated_by: user.email, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw new Error(error.message)
  } catch {
    // the campaign is under way; only the banner about it is missing
  }
  refresh()
  return { ok: true, toast: 'Marketing Generation started. It takes a few minutes; the ads land in Marketing Generation.' }
}
