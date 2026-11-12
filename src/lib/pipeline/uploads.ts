// Uploading ads and what is built from them (apOpenAdUpload, apAdRowFromAnalysis, apReanalyse, apOpenBuildBrief,
// apOpenAdCopy, apCopyMd, apSendToLowTicket, apHistLoad): the rows an upload is saved as, the requests the windows send,
// the ad copy's markdown, the campaigns started from a brief and the rows of Runs & uploads. Plain functions, so the
// server, the windows and the tests share them.

import { tldr } from '@/lib/touchpoint/approvals'
import { type CopySet, copySetOf } from './ad-strategist'
import { adTitle, isDynamic } from './ads'
import { arr, json, num } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const tidy = (s: unknown) =>
  str(s)
    .replace(/\s+[‒-―]\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
const isWeb = (u: string) => /^https?:\/\//i.test(u)
const cap = (s: unknown, n: number) => str(s).slice(0, n)

// ---------- the upload window (apOpenAdUpload) ----------

export const UP_PLATFORMS: readonly (readonly [string, string])[] = [
  ['linkedin', 'LinkedIn'],
  ['meta', 'Meta'],
  ['x', 'X'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['other', 'Other'],
]
export const UP_MAX_FILES = 10
export const UP_MAX_BYTES = 8 * 1024 * 1024

/** A value the ads table takes (apAdSafe): the platform, the format by how many pictures, the funnel stage. */
export const safePlatform = (v: unknown) => (UP_PLATFORMS.some((p) => p[0] === v) ? str(v) : 'other')
const FORMATS = ['static_image', 'text', 'carousel', 'video']
export const safeFormat = (v: unknown, images: number) => (FORMATS.includes(str(v)) ? str(v) : images > 1 ? 'carousel' : images === 1 ? 'static_image' : 'text')
export const safeStage = (v: unknown) => (['tof', 'mof', 'bof'].includes(str(v)) ? str(v) : 'tof')

/** A file's ending as Storage keeps it: lower case, letters and digits only, png when none. */
export function extOf(name: string): string {
  const m = /\.([^./\\]+)$/.exec(str(name))
  return (m ? m[1] : '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
}
/**
 * The ad link as typed: '' when there is none, a web address as it is (a bare address such as
 * linkedin.com/ad-library/… gets https://), null when it is not a web address (the old page saved any text).
 */
export function linkOf(v: unknown): string | null {
  const t = str(v).trim()
  if (!t) return ''
  if (t.length > 2000 || /\s/.test(t)) return null
  if (/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(t)) return t
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(t)) return 'https://' + t
  return null
}

/** Where an upload is kept in the creatives bucket: uploads/<day>/<id>.<ending>. */
export const uploadPath = (day: string, id: string, name: string) => `uploads/${day}/${id}.${extOf(name)}`
export const UPLOAD_PATH = /^uploads\/\d{4}-\d{2}-\d{2}\/[\w-]{8,64}\.[a-z0-9]{1,10}$/

/** The names the advertiser box suggests: the accounts followed and the advertisers already seen, once each, sorted. */
export function uploadNames(...lists: string[][]): string[] {
  const seen = new Map<string, string>()
  for (const n of lists.flat()) {
    const t = str(n).replace(/\s+/g, ' ').trim()
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** An analyzer's answer (an array answer's first item): its reading of the ad, or why there is none. */
export function analysisOf(answer: unknown): { analysis: Record<string, unknown> } | { error: string } {
  const o = json(Array.isArray(answer) ? answer[0] : answer)
  if (o.ok === true && o.analysis && typeof o.analysis === 'object') return { analysis: json(o.analysis) }
  return { error: str(o.error) || str(o.message) || 'The analyzer could not read this ad.' }
}

export type UploadIn = {
  day: string
  advertiser: string
  platform: string
  link: string
  copy: string
  images: string[]
  analysis: Record<string, unknown> | null
  error: string
  by: string
  inBrief: boolean
  /** the ad link for the first ad of a batch, else swipe:upload:<id> */
  libraryUrl: string
  now: string
}

/** The ad_records row an upload is saved as (apAdRowFromAnalysis with v113's in_brief). */
export function adRowOf(x: UploadIn): Record<string, unknown> {
  const a = x.analysis ?? {}
  const firstLine =
    x.copy
      .split('\n')
      .map((s) => s.trim())
      .find(Boolean)
      ?.slice(0, 300) ?? ''
  return {
    run_id: 'upload_' + x.day,
    run_date: x.day,
    advertiser_name: x.advertiser,
    platform: safePlatform(x.platform),
    source: 'swipe_file',
    ad_library_url: x.libraryUrl,
    destination_url: x.link || null,
    image_url: x.images[0] ?? null,
    image_urls: x.images,
    format: safeFormat(a.format, x.images.length),
    first_seen: x.day,
    last_seen: x.day,
    longevity_flag: 'under_6wk',
    is_active: true,
    stale_days: 0,
    hook: str(a.hook) || firstLine,
    body: str(a.body) || x.copy,
    cta: str(a.cta),
    copy_formula: str(a.copy_formula),
    offer_inferred: str(a.offer_inferred) || null,
    price_point_inferred: num(a.price_point_inferred),
    funnel_stage: safeStage(a.funnel_stage),
    extracted_patterns: arr(a.extracted_patterns),
    upload_analysis: x.analysis
      ? { status: 'done', visual: json(a.visual), takeaways: arr(a.takeaways), confidence: a.confidence ?? null, analysed_at: x.now, pasted_copy: x.copy }
      : { status: 'pending', error: x.error, pasted_copy: x.copy },
    uploaded_by: x.by,
    in_brief: x.inBrief,
  }
}

/** An ad's pictures as the analyzer reads them: its list, else its one picture (web addresses only). */
export function imagesOf(r: Record<string, unknown>): string[] {
  const list = arr(r.image_urls).map(str).filter(isWeb)
  return list.length ? list : isWeb(str(r.image_url)) ? [str(r.image_url)] : []
}

/** What Read this ad changes on an ad (apReanalyse): the new reading, the old values where it says nothing. */
export function rereadPatch(prev: Record<string, unknown>, a: Record<string, unknown>, now: string): Record<string, unknown> {
  const ua = json(prev.upload_analysis)
  const has = (k: string) => a[k] !== undefined && a[k] !== null && a[k] !== ''
  return {
    hook: str(a.hook) || str(prev.hook),
    body: str(a.body) || str(prev.body),
    cta: str(a.cta) || str(prev.cta),
    copy_formula: has('copy_formula') ? str(a.copy_formula) : str(prev.copy_formula),
    offer_inferred: has('offer_inferred') ? str(a.offer_inferred) : (prev.offer_inferred ?? null),
    price_point_inferred: has('price_point_inferred') ? num(a.price_point_inferred) : (prev.price_point_inferred ?? null),
    // the old re-read passed these through unchecked, so an odd value failed the save
    funnel_stage: safeStage(has('funnel_stage') ? a.funnel_stage : prev.funnel_stage),
    format: safeFormat(has('format') ? a.format : prev.format, imagesOf(prev).length),
    extracted_patterns: a.extracted_patterns !== undefined ? arr(a.extracted_patterns) : arr(prev.extracted_patterns),
    upload_analysis: { status: 'done', visual: json(a.visual), takeaways: arr(a.takeaways), confidence: a.confidence ?? null, analysed_at: now, pasted_copy: str(ua.pasted_copy) },
  }
}

/** Why the ads table turned a row away (apDbError). */
export function adDbError(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return 'something went wrong'
  const m = str(e.message)
  if (e.code === '23514') {
    const what = /format/i.test(m)
      ? 'The ad format'
      : /platform/i.test(m)
        ? 'The platform'
        : /funnel/i.test(m)
          ? 'The funnel stage'
          : /source/i.test(m)
            ? 'The source'
            : /longevity/i.test(m)
              ? 'The longevity flag'
              : 'One of the values'
    return what + ' is not a value the ads table accepts.'
  }
  if (e.code === '23505') return 'That ad link is already saved.'
  if (e.code === '42501' || /row-level security/i.test(m)) return 'Your account is not allowed to add ads.'
  return m.slice(0, 160) || 'something went wrong'
}

// ---------- building a brief and writing copy from uploads ----------

/** An upload as Custom Ad Strategy reads it (apRunBuildBrief). */
export function briefAdOf(r: Record<string, unknown>) {
  const ua = json(r.upload_analysis)
  return {
    id: str(r.id),
    advertiser: str(r.advertiser_name),
    platform: str(r.platform),
    hook: str(r.hook),
    body: str(r.body),
    cta: str(r.cta),
    copy_formula: str(r.copy_formula),
    offer: str(r.offer_inferred),
    patterns: arr(r.extracted_patterns),
    visual: ua.visual && typeof ua.visual === 'object' ? json(ua.visual) : null,
    takeaways: arr(ua.takeaways),
    link: str(r.destination_url),
  }
}

/** An ad as the copy writer reads it (apRunAdCopy). */
export function copyAdOf(r: Record<string, unknown>) {
  const b = briefAdOf(r)
  return { advertiser: b.advertiser, hook: b.hook, body: b.body, cta: b.cta, copy_formula: b.copy_formula, patterns: b.patterns, visual: b.visual, takeaways: b.takeaways }
}

/** The offer the copy is written for: the team's default offer, else its newest; the old page's own when there is none. */
export const OFFER_FALLBACK = {
  name: 'AI Readiness Scorecard',
  type: 'slo_digital',
  price: 0,
  included:
    'A diagnostic scorecard mapping AI opportunity across three operational areas: sales pipeline, research and analysis, and client operations. Delivered and walked through on a 20-minute diagnostic call.',
  upsell: 'Qualified 20-minute diagnostic call → AI workflow implementation engagement or advisory retainer',
}
export function offerOf(rows: Record<string, unknown>[]) {
  const live = rows.filter((r) => r.archived !== true).sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))
  const r = live.find((x) => x.is_default === true) ?? live[0]
  if (!r) return OFFER_FALLBACK
  return { name: str(r.name), type: str(r.type), price: num(r.price) ?? 0, included: str(r.whats_included), upsell: str(r.upsell_path) }
}

/** Ad copy as the copy writer sends it back (angle, hook, primary text, headline, call to action, image, pattern). */
export type CopyOut = { angle: string; hook: string; primary_text: string; headline: string; cta: string; image_direction: string; pattern_borrowed: string }
export type CopyResult = { variants: CopyOut[]; takeaways: string[]; notes: string[] }

/** The copy writer's answer, kept to plain text; null when it holds no copy (the old page showed a script error). */
export function copyResultOf(answer: unknown): CopyResult | null {
  const o = json(Array.isArray(answer) ? answer[0] : answer)
  const variants = arr(o.variants)
    .map(json)
    .map((v) => ({
      angle: cap(tidy(v.angle), 120),
      hook: cap(str(v.hook).trim(), 600),
      primary_text: cap(str(v.primary_text || v.body).trim(), 4000),
      headline: cap(str(v.headline).trim(), 300),
      cta: cap(str(v.cta).trim(), 120),
      image_direction: cap(str(v.image_direction || v.image_idea || v.image).trim(), 600),
      pattern_borrowed: cap(tidy(v.pattern_borrowed || v.pattern_used || v.pattern), 300),
    }))
    .filter((v) => v.hook || v.primary_text || v.headline)
    .slice(0, 8)
  if (!variants.length) return null
  const list = (v: unknown) => arr(v).map(tidy).filter(Boolean).slice(0, 12).map((s) => cap(s, 600))
  return { variants, takeaways: list(o.takeaways), notes: list(o.guideline_notes) }
}

/** The letter a variant goes by: A, B, C… */
export const variantLetter = (i: number) => String.fromCharCode(65 + (i % 26))

/** Every variant as one text, for Copy all (apCopyAll). */
export const copyAllText = (r: CopyResult) =>
  r.variants
    .map((v, i) =>
      [
        'VARIANT ' + variantLetter(i) + (v.angle ? ', ' + v.angle : ''),
        v.hook,
        v.primary_text,
        v.headline ? 'Headline: ' + v.headline : '',
        v.cta ? 'CTA: ' + v.cta : '',
        v.image_direction ? 'Image: ' + v.image_direction : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    )
    .join('\n\n----------\n\n')

/** The markdown a saved set of ad copy keeps (apCopyMd). */
export function copyMd(r: CopyResult, platform: string, ads: number, day: string): string {
  const out = ['# Ad copy from uploaded ads · ' + day, '', '**Platform:** ' + platform + ' · **Learned from:** ' + ads + (ads === 1 ? ' ad' : ' ads'), '']
  if (r.takeaways.length) out.push('## Key takeaways', ...r.takeaways.map((t) => '- ' + t), '')
  r.variants.forEach((v, i) => {
    out.push('## Variant ' + variantLetter(i) + (v.angle ? ' · ' + v.angle : ''), '')
    if (v.hook) out.push('**Hook:** ' + v.hook, '')
    if (v.primary_text) out.push(v.primary_text, '')
    for (const [k, x] of [
      ['Headline', v.headline],
      ['CTA', v.cta],
      ['Image', v.image_direction],
      ['Pattern used', v.pattern_borrowed],
    ] as const)
      if (x) out.push('- **' + k + ':** ' + x)
    out.push('')
  })
  if (r.notes.length) out.push('## How the guidelines shaped it', ...r.notes.map((t) => '- ' + t), '')
  return out.join('\n').trim() + '\n'
}

// ---------- campaigns started from a brief (apSendToLowTicket, kept for the team) ----------

export type CampaignRun = { brief: string; t: number; by: string }
export const CAMPAIGN_MS = 15 * 60_000

export function campaignRunsOf(v: unknown): CampaignRun[] {
  return arr(json(v).runs)
    .map(json)
    .map((r) => ({ brief: str(r.brief), t: num(r.t) ?? 0, by: str(r.by) }))
    .filter((r) => r.t > 0)
    .sort((a, b) => b.t - a.t)
}

export type Campaign = { run_id: string; created_at: string; title: string; data: unknown }
export type CampaignState =
  | { status: 'running'; run: CampaignRun }
  | { status: 'done'; run: CampaignRun; runId: string; title: string }
  | { status: 'late'; run: CampaignRun }

/** Where a campaign started from a brief is: written (its row landed), still running, or not seen after 15 minutes. */
export function campaignState(run: CampaignRun, rows: Campaign[], now: number): CampaignState {
  const hit = rows
    .filter((r) => (Date.parse(r.created_at) || 0) > run.t - 5000)
    .filter((r) => !run.brief || str(json(r.data).source_brief_run) === run.brief)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (hit) return { status: 'done', run, runId: hit.run_id, title: tidy(hit.title) || hit.run_id }
  return now - run.t < CAMPAIGN_MS ? { status: 'running', run } : { status: 'late', run }
}

// ---------- Runs & uploads (apHistLoad, apHistBody) ----------

export type HistKind = 'upload' | 'brief' | 'copy' | 'funnel' | 'intel'
export const HIST_TABS: readonly (readonly [HistKind | 'all', string])[] = [
  ['all', 'All'],
  ['intel', 'Intel runs'],
  ['upload', 'Uploaded ads'],
  ['brief', 'Strategies'],
  ['copy', 'Ad copy'],
  ['funnel', 'Content runs'],
]
export const HIST_KIND: Record<HistKind, string> = { upload: 'Uploaded ad', brief: 'Ad strategy', copy: 'Ad copy', funnel: 'Marketing Generation run', intel: 'Intel run' }
export const histTabOf = (v: string | null | undefined): HistKind | 'all' => HIST_TABS.find((t) => t[0] === v)?.[0] ?? 'all'

export type HistRow = {
  kind: HistKind
  id: string
  at: string
  title: string
  sub: string
  /** an upload not read yet, an Intel run still going */
  pending: boolean
  /** words searched besides the title and the line under it */
  hay: string
  upload?: { adId: string; images: string[]; hook: string; takeaways: string[] }
  brief?: { runId: string; hooks: string[] }
  copy?: CopySet
  funnel?: { runId: string; images: string[] }
  intel?: { runId: string; custom: boolean | null; bullets: { title: string; text: string }[]; names: string[] }
}

/** A calendar day ("2026-11-03") as "3 Nov 2026"; it names a day, so no time zone moves it. */
const dayWords = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** A title as the page shows it (V100_TIDY): dashes as dots, dates spelled out, and a date at its end left to the date beside it. */
export function tidyTitle(t: string): string {
  let s = str(t).replace(/\s+[–—]\s+/g, ' · ')
  s = s.replace(/^Competitor Intelligence Brief/i, 'Organic brief').replace(/^Creative Brief/i, 'Advertisement brief')
  s = s.replace(/\s·\s\d{4}-\d{2}-\d{2}\b/g, '').replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_, d: string) => dayWords(d))
  return s.replace(/\s+/g, ' ').trim()
}

const before = (e: string) => e.split('@')[0]
/** The words a row is searched by besides its title: the start of its text (a brief can run to 20,000 characters). */
const hayOf = (v: unknown) => str(v).slice(0, 6000)

/** Who started an Intel run and for whom (apIntelSource): custom, scheduled, or not known (legacy). */
export function intelSource(o: Record<string, unknown>, run: Record<string, unknown> | undefined) {
  const d = json(o.data)
  const src = str(run?.source || d.run_source).toLowerCase() || (/\(custom run\)/i.test(str(o.title)) ? 'custom' : '')
  const custom = src ? src === 'custom' : null
  const by = str(run?.requested_by || d.requested_by)
  const names = (arr(d.custom_names).length ? arr(d.custom_names) : arr(json(run?.input).names)).map(str).filter(Boolean)
  return { custom, by, names }
}

/** The line under an Intel run (apIntelSourceLine). */
export function intelLine(s: { custom: boolean | null; by: string; names: string[] }): string {
  if (s.custom === true) {
    const n = s.names
    return (
      'Custom run' +
      (s.by ? ' by ' + before(s.by) : '') +
      (n.length ? ' · for ' + n.slice(0, 4).join(', ') + (n.length > 4 ? ' +' + (n.length - 4) : '') : '')
    )
  }
  return s.custom === false ? 'Scheduled run' : 'Run by the agent'
}

export type HistInput = {
  ups: Record<string, unknown>[]
  briefs: Record<string, unknown>[]
  copies: Record<string, unknown>[]
  funnels: Record<string, unknown>[]
  intel: Record<string, unknown>[]
  intelRuns: Record<string, unknown>[]
  /** custom Intel runs started and not written yet (ai_settings intel_runs) */
  pending: { runId: string; names: string[]; t: number; by: string }[]
}

/** Every row of Runs & uploads, newest first (apHistLoad's rows). */
export function histRows(x: HistInput): HistRow[] {
  const rows: HistRow[] = []
  for (const a of x.ups) {
    const ua = json(a.upload_analysis)
    const pend = str(ua.status) === 'pending'
    rows.push({
      kind: 'upload',
      id: 'u:' + str(a.id),
      at: str(a.created_at),
      title: tidyTitle(adTitle(a)),
      sub: [str(a.advertiser_name).trim(), str(a.platform)].filter(Boolean).join(' · ') + (a.uploaded_by ? ' · by ' + str(a.uploaded_by) : ''),
      pending: pend,
      hay: hayOf(a.body),
      upload: { adId: str(a.id), images: imagesOf(a), hook: isDynamic(a) ? '' : str(a.hook), takeaways: arr(ua.takeaways).map(tidy).filter(Boolean) },
    })
  }
  for (const o of x.briefs) {
    const d = json(o.data)
    const hooks = arr(d.winning_hooks)
      .map((h) => (typeof h === 'string' ? h : str(json(h).pattern || json(h).hook || json(h).text)))
      .map(tidy)
      .filter(Boolean)
    const from = arr(d.source_ad_ids).length
    rows.push({
      kind: 'brief',
      id: 'b:' + str(o.id),
      at: str(o.created_at),
      title: tidyTitle(str(o.title) || 'Creative brief'),
      sub: hooks.length + ' hook patterns · from ' + from + ' uploaded ' + (from === 1 ? 'ad' : 'ads') + (d.requested_by ? ' · by ' + str(d.requested_by) : ''),
      pending: false,
      hay: hayOf(o.content_md),
      brief: { runId: str(o.run_id), hooks },
    })
  }
  for (const o of x.copies) {
    const d = json(o.data)
    const n = arr(d.variants).length
    const ads = arr(d.source_ads).length
    rows.push({
      kind: 'copy',
      id: 'c:' + str(o.id),
      at: str(o.created_at),
      title: tidyTitle(str(o.title) || 'Ad copy'),
      sub: [n + (n === 1 ? ' variant' : ' variants'), str(d.platform), 'learned from ' + ads + (ads === 1 ? ' ad' : ' ads')].filter(Boolean).join(' · '),
      pending: false,
      hay: hayOf(o.content_md),
      copy: copySetOf(o),
    })
  }
  for (const o of x.funnels) {
    const d = json(o.data)
    const images = arr(d.ad_images)
      .map((i) => str(json(i).url))
      .filter(isWeb)
    rows.push({
      kind: 'funnel',
      id: 'f:' + str(o.id),
      at: str(o.created_at),
      title: tidyTitle(str(o.title) || 'Funnel package'),
      sub: 'Marketing Generation · built from ' + str(d.source_brief_run) + ' · ' + images.length + (images.length === 1 ? ' ad image' : ' ad images'),
      pending: false,
      hay: '',
      funnel: { runId: str(o.run_id), images },
    })
  }
  const runOf = new Map(x.intelRuns.map((r) => [str(r.run_id), r]))
  const written = new Set(x.intel.map((o) => str(o.run_id)))
  for (const o of x.intel) {
    const s = intelSource(o, runOf.get(str(o.run_id)))
    const md = str(o.content_md)
    rows.push({
      kind: 'intel',
      id: 'i:' + str(o.id),
      at: str(o.created_at),
      title: tidyTitle(str(o.title) || 'Competitor Intelligence Brief'),
      sub: intelLine(s),
      pending: false,
      hay: hayOf(md),
      intel: { runId: str(o.run_id), custom: s.custom, bullets: tldr(md).slice(0, 3), names: s.names },
    })
  }
  for (const p of x.pending) {
    if (!p.runId || written.has(p.runId)) continue
    rows.push({
      kind: 'intel',
      id: 'p:' + p.runId,
      at: new Date(p.t).toISOString(),
      title: 'Intel run in progress',
      sub: 'Custom run' + (p.by ? ' by ' + before(p.by) : '') + (p.names.length ? ' · for ' + p.names.join(', ') : ''),
      pending: true,
      hay: '',
      intel: { runId: p.runId, custom: true, bullets: [], names: p.names },
    })
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at))
}

/** Rows that match the search (title, the line under it and their text), case left aside. */
export function histSearch(rows: HistRow[], q: string): HistRow[] {
  const t = q.trim().toLowerCase()
  if (!t) return rows
  return rows.filter((r) => (r.title + ' ' + r.sub + ' ' + r.hay).toLowerCase().includes(t))
}
