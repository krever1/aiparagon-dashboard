import { expect, test } from '@playwright/test'
import {
  OFFER_FALLBACK, adDbError, adRowOf, analysisOf, briefAdOf, campaignRunsOf, campaignState, copyAllText, copyMd, copyResultOf, extOf, histRows,
  histSearch, histTabOf, imagesOf, intelLine, linkOf, offerOf, rereadPatch, safeFormat, safePlatform, safeStage, tidyTitle, uploadNames, uploadPath,
  UPLOAD_PATH,
} from '../../src/lib/pipeline/uploads'

// The rules behind the upload window, Read this ad, the build-a-brief and ad copy windows, Send to Marketing Generation
// and Runs & uploads, without a browser.

test('the values the ads table takes, and where an upload is kept', () => {
  expect(safePlatform('meta')).toBe('meta')
  expect(safePlatform('facebook')).toBe('other')
  expect(safeFormat('video', 0)).toBe('video')
  expect(safeFormat('image', 1)).toBe('static_image')
  expect(safeFormat(undefined, 3)).toBe('carousel')
  expect(safeFormat('', 0)).toBe('text')
  expect(safeStage('bof')).toBe('bof')
  expect(safeStage('awareness')).toBe('tof')
  expect(extOf('Ad Shot.PNG')).toBe('png')
  expect(extOf('photo.jp-g')).toBe('jpg')
  expect(extOf('no-ending')).toBe('png')
  const path = uploadPath('2026-11-11', '0f8c5d3e-1111-4a2b-8c3d-123456789abc', 'Shot 1.JPEG')
  expect(path).toBe('uploads/2026-11-11/0f8c5d3e-1111-4a2b-8c3d-123456789abc.jpeg')
  expect(UPLOAD_PATH.test(path)).toBe(true)
  // an upload somewhere else, or reaching up a folder, is not one of the team's
  expect(UPLOAD_PATH.test('lead-files/x.png')).toBe(false)
  expect(UPLOAD_PATH.test('uploads/2026-11-11/../../secret.png')).toBe(false)
})

test('the ad link: a web address as it is, a bare one gets https, anything else is refused', () => {
  expect(linkOf('')).toBe('')
  expect(linkOf('  ')).toBe('')
  expect(linkOf('https://www.linkedin.com/ad-library/detail/123')).toBe('https://www.linkedin.com/ad-library/detail/123')
  expect(linkOf('linkedin.com/ad-library/detail/123')).toBe('https://linkedin.com/ad-library/detail/123')
  expect(linkOf('javascript:alert(1)')).toBeNull()
  expect(linkOf('not a link')).toBeNull()
  expect(linkOf('http://localhost')).toBeNull()
})

test("the analyzer's answer: its reading, or why there is none", () => {
  expect(analysisOf({ ok: true, analysis: { hook: 'Hi' } })).toEqual({ analysis: { hook: 'Hi' } })
  expect(analysisOf([{ ok: true, analysis: { hook: 'First item' } }])).toEqual({ analysis: { hook: 'First item' } })
  expect(analysisOf({ ok: false, error: 'Too blurry' })).toEqual({ error: 'Too blurry' })
  expect(analysisOf({ ok: true })).toEqual({ error: 'The analyzer could not read this ad.' })
  expect(analysisOf(null)).toEqual({ error: 'The analyzer could not read this ad.' })
})

test('an upload as the ads table keeps it, read or not', () => {
  const base = {
    day: '2026-11-11',
    advertiser: 'Brightpath Advisors',
    platform: 'tiktok',
    link: 'https://example.com/ad',
    copy: 'First line of the ad\nMore text',
    images: ['https://stub/a.png', 'https://stub/b.png'],
    by: 'qa.teammate@aiparagonconsulting.com',
    inBrief: false,
    libraryUrl: 'https://example.com/ad',
    now: '2026-11-11T10:00:00.000Z',
  }
  const read = adRowOf({
    ...base,
    analysis: { hook: 'Read hook', format: 'gif', funnel_stage: 'bottom', extracted_patterns: ['Proof first'], takeaways: ['One'], visual: { visual_hook: 'A desk' }, confidence: 0.7 },
    error: '',
  })
  expect(read).toMatchObject({
    run_id: 'upload_2026-11-11',
    run_date: '2026-11-11',
    platform: 'tiktok',
    source: 'swipe_file',
    ad_library_url: 'https://example.com/ad',
    destination_url: 'https://example.com/ad',
    image_url: 'https://stub/a.png',
    image_urls: ['https://stub/a.png', 'https://stub/b.png'],
    // a format or stage the table does not take falls back, as before
    format: 'carousel',
    funnel_stage: 'tof',
    longevity_flag: 'under_6wk',
    is_active: true,
    stale_days: 0,
    hook: 'Read hook',
    body: 'First line of the ad\nMore text',
    extracted_patterns: ['Proof first'],
    uploaded_by: 'qa.teammate@aiparagonconsulting.com',
    in_brief: false,
  })
  expect(read.upload_analysis).toEqual({ status: 'done', visual: { visual_hook: 'A desk' }, takeaways: ['One'], confidence: 0.7, analysed_at: base.now, pasted_copy: base.copy })
  const pending = adRowOf({ ...base, images: [], link: '', libraryUrl: 'swipe:upload:x', analysis: null, error: 'No answer' })
  expect(pending).toMatchObject({ hook: 'First line of the ad', format: 'text', image_url: null, destination_url: null, funnel_stage: 'tof' })
  expect(pending.upload_analysis).toEqual({ status: 'pending', error: 'No answer', pasted_copy: base.copy })
})

test('Read this ad: the new reading, the old values where it says nothing, values the table takes', () => {
  const prev = {
    hook: 'Old hook',
    body: 'Old body',
    cta: 'Old cta',
    copy_formula: 'Old formula',
    offer_inferred: 'Old offer',
    price_point_inferred: 49,
    funnel_stage: 'mof',
    format: 'static_image',
    extracted_patterns: '["Old pattern"]',
    upload_analysis: '{"status":"pending","pasted_copy":"Pasted"}',
    image_url: 'https://stub/a.png',
  }
  const p = rereadPatch(prev, { hook: 'New hook', format: 'reel', funnel_stage: 'decision' }, '2026-11-11T10:00:00.000Z')
  expect(p).toMatchObject({
    hook: 'New hook',
    body: 'Old body',
    cta: 'Old cta',
    copy_formula: 'Old formula',
    offer_inferred: 'Old offer',
    price_point_inferred: 49,
    format: 'static_image',
    funnel_stage: 'tof',
    extracted_patterns: ['Old pattern'],
  })
  expect(p.upload_analysis).toEqual({ status: 'done', visual: {}, takeaways: [], confidence: null, analysed_at: '2026-11-11T10:00:00.000Z', pasted_copy: 'Pasted' })
  expect(imagesOf({ image_urls: '["https://a/1.png","swipe:x"]' })).toEqual(['https://a/1.png'])
  expect(imagesOf({ image_url: 'https://a/2.png' })).toEqual(['https://a/2.png'])
})

test("why the ads table turned a row away, in words", () => {
  expect(adDbError({ code: '23514', message: 'new row violates check constraint "ad_records_format_check"' })).toBe('The ad format is not a value the ads table accepts.')
  expect(adDbError({ code: '23514', message: 'ad_records_funnel_stage_check' })).toBe('The funnel stage is not a value the ads table accepts.')
  expect(adDbError({ code: '23505', message: 'dup' })).toBe('That ad link is already saved.')
  expect(adDbError({ code: '42501', message: 'x' })).toBe('Your account is not allowed to add ads.')
  expect(adDbError({ message: 'new row violates row-level security policy' })).toBe('Your account is not allowed to add ads.')
})

test('what the strategy and copy workflows read from an upload', () => {
  const r = {
    id: 'a1',
    advertiser_name: 'Northwind',
    platform: 'meta',
    hook: 'H',
    body: 'B',
    cta: 'C',
    copy_formula: 'F',
    offer_inferred: 'O',
    extracted_patterns: '["P"]',
    upload_analysis: '{"status":"done","visual":{"layout":"grid"},"takeaways":["T"]}',
    destination_url: 'https://x',
  }
  expect(briefAdOf(r)).toEqual({
    id: 'a1',
    advertiser: 'Northwind',
    platform: 'meta',
    hook: 'H',
    body: 'B',
    cta: 'C',
    copy_formula: 'F',
    offer: 'O',
    patterns: ['P'],
    visual: { layout: 'grid' },
    takeaways: ['T'],
    link: 'https://x',
  })
  expect(briefAdOf({ ...r, upload_analysis: null }).visual).toBeNull()
})

test("the offer the copy is written for: the team's default, else its newest, else the old page's own", () => {
  const rows = [
    { name: 'Old', created_at: '2026-01-01', is_default: false, archived: false },
    { name: 'Gone', created_at: '2026-10-01', is_default: true, archived: true },
    { name: 'Checkup', type: 'slo', price: '29.00', whats_included: 'A review', upsell_path: 'Retainer', created_at: '2026-09-01', is_default: true, archived: false },
  ]
  expect(offerOf(rows)).toEqual({ name: 'Checkup', type: 'slo', price: 29, included: 'A review', upsell: 'Retainer' })
  expect(offerOf([rows[0]]).name).toBe('Old')
  expect(offerOf([])).toEqual(OFFER_FALLBACK)
})

test('the copy writer’s answer: plain text, a picture and a pattern under either name, nothing empty', () => {
  const r = copyResultOf({
    ok: true,
    variants: [
      { angle: 'Time — back', hook: 'Hook 1', primary_text: 'Text 1', headline: 'Head 1', cta: 'Go', image_direction: 'A desk', pattern_borrowed: 'Proof' },
      { hook: 'Hook 2', body: 'Body as text', image_idea: 'A chart', pattern_used: 'Speed' },
      { angle: 'Empty' },
    ],
    takeaways: ['Lead with time', ''],
    guideline_notes: ['Plain words'],
  })!
  expect(r.variants).toHaveLength(2)
  expect(r.variants[0]).toEqual({ angle: 'Time, back', hook: 'Hook 1', primary_text: 'Text 1', headline: 'Head 1', cta: 'Go', image_direction: 'A desk', pattern_borrowed: 'Proof' })
  expect(r.variants[1]).toMatchObject({ primary_text: 'Body as text', image_direction: 'A chart', pattern_borrowed: 'Speed' })
  expect(r.takeaways).toEqual(['Lead with time'])
  expect(r.notes).toEqual(['Plain words'])
  expect(copyResultOf({ ok: true, variants: [] })).toBeNull()
  expect(copyResultOf({ ok: true })).toBeNull()

  expect(copyAllText(r)).toBe(
    'VARIANT A, Time, back\n\nHook 1\n\nText 1\n\nHeadline: Head 1\n\nCTA: Go\n\nImage: A desk\n\n----------\n\nVARIANT B\n\nHook 2\n\nBody as text\n\nImage: A chart',
  )
  const md = copyMd(r, 'meta', 2, '2026-11-11')
  expect(md.startsWith('# Ad copy from uploaded ads · 2026-11-11\n\n**Platform:** meta · **Learned from:** 2 ads\n\n## Key takeaways\n- Lead with time\n')).toBe(true)
  expect(md).toContain('## Variant A · Time, back\n\n**Hook:** Hook 1\n\nText 1\n\n- **Headline:** Head 1\n- **CTA:** Go\n- **Image:** A desk\n- **Pattern used:** Proof')
  expect(md).toContain('## How the guidelines shaped it\n- Plain words')
  expect(md).not.toMatch(/[—–]/)
})

test('a campaign started from a brief: running, written (its own row), or not seen after 15 minutes', () => {
  const t = Date.parse('2026-11-11T10:00:00Z')
  const runs = campaignRunsOf({ runs: [{ brief: 'agent2_custom_a', t: t - 1000, by: 'x' }, { brief: 'agent2_custom_b', t, by: 'y' }, { t: 0 }] })
  expect(runs.map((r) => r.brief)).toEqual(['agent2_custom_b', 'agent2_custom_a'])
  const run = runs[0]
  const row = (at: string, brief: string) => ({ run_id: 'lt_' + at, created_at: at, title: 'Funnel — ' + brief, data: JSON.stringify({ source_brief_run: brief }) })
  // a row from before the start, or from another brief, is not this campaign
  expect(campaignState(run, [row('2026-11-11T09:00:00Z', 'agent2_custom_b'), row('2026-11-11T10:05:00Z', 'agent2_custom_z')], t + 60_000)).toEqual({ status: 'running', run })
  expect(campaignState(run, [row('2026-11-11T10:05:00Z', 'agent2_custom_b')], t + 6 * 60_000)).toEqual({
    status: 'done',
    run,
    runId: 'lt_2026-11-11T10:05:00Z',
    title: 'Funnel, agent2_custom_b',
  })
  expect(campaignState(run, [], t + 16 * 60_000)).toEqual({ status: 'late', run })
})

test('titles as the page shows them, and the names the advertiser box offers', () => {
  expect(tidyTitle('Creative Brief — 2026-10-02')).toBe('Advertisement brief')
  expect(tidyTitle('Competitor Intelligence Brief — 2026-10-02 (custom run)')).toBe('Organic brief (custom run)')
  expect(tidyTitle('Ads from 2026-11-03')).toBe('Ads from 3 Nov 2026')
  expect(tidyTitle('Funnel package – Paperwork review')).toBe('Funnel package · Paperwork review')
  expect(uploadNames(['Northwind', ' northwind '], ['Acme  Co', '', 'Beta'])).toEqual(['Acme Co', 'Beta', 'Northwind'])
  expect(intelLine({ custom: true, by: 'qa.teammate@aiparagonconsulting.com', names: ['A', 'B', 'C', 'D', 'E', 'F'] })).toBe('Custom run by qa.teammate · for A, B, C, D +2')
  expect(intelLine({ custom: false, by: '', names: [] })).toBe('Scheduled run')
  expect(intelLine({ custom: null, by: '', names: [] })).toBe('Run by the agent')
  expect(histTabOf('copy')).toBe('copy')
  expect(histTabOf('nope')).toBe('all')
})

test('Runs & uploads: one list of every kind, newest first, with the custom Intel runs still reading', () => {
  const md = ['# Competitor Intelligence Brief', '', '**TL;DR**', '- **Proof wins:** Results get replies.', '- Fees come first.', '', '## 1. Detail'].join('\n')
  const rows = histRows({
    ups: [
      { id: 'u1', created_at: '2026-11-10T10:00:00Z', advertiser_name: ' Old Mill ', platform: 'meta', uploaded_by: 'qa@x', hook: 'Paperwork — done', image_urls: '["https://a/1.png"]', upload_analysis: '{"status":"done","takeaways":["Opens with time"]}' },
      { id: 'u2', created_at: '2026-11-09T10:00:00Z', advertiser_name: 'Retail', platform: 'other', hook: '{{product.name}}', upload_analysis: '{"status":"pending"}' },
    ],
    briefs: [{ id: 'b1', run_id: 'agent2_custom_1', title: 'Creative Brief — 2026-11-08', created_at: '2026-11-08T10:00:00Z', data: '{"winning_hooks":["Your week back",{"pattern":"Proof first"}],"source_ad_ids":["u1"],"requested_by":"qa@x"}', content_md: '# Brief' }],
    copies: [{ id: 'c1', title: 'Ad copy from uploaded ads · 2026-11-07', created_at: '2026-11-07T10:00:00Z', data: { variants: [{ hook: 'H' }], source_ads: ['u1', 'u2'], platform: 'meta' } }],
    funnels: [{ id: 'f1', run_id: 'lt_1', title: 'Funnel package', created_at: '2026-11-06T10:00:00Z', data: { source_brief_run: 'agent2_custom_1', ad_images: [{ url: 'https://a/ad.png' }, { url: 'nope' }] } }],
    intel: [{ id: 'i1', run_id: 'agent1_x', title: 'Competitor Intelligence Brief — 2026-11-05', created_at: '2026-11-05T10:00:00Z', content_md: md, data: '{"run_source":"custom","custom_names":["Acme"]}' }],
    intelRuns: [{ run_id: 'agent1_x', source: 'custom', requested_by: 'kser@x', input: null }],
    pending: [
      { runId: 'agent1_new', names: ['Fabrikam'], t: Date.parse('2026-11-11T09:00:00Z'), by: 'qa@x' },
      // a run whose brief has landed is not in progress any more
      { runId: 'agent1_x', names: ['Acme'], t: Date.parse('2026-11-05T09:00:00Z'), by: 'qa@x' },
    ],
  })
  expect(rows.map((r) => r.id)).toEqual(['p:agent1_new', 'u:u1', 'u:u2', 'b:b1', 'c:c1', 'f:f1', 'i:i1'])
  expect(rows[0]).toMatchObject({ kind: 'intel', title: 'Intel run in progress', sub: 'Custom run by qa · for Fabrikam', pending: true })
  expect(rows[1]).toMatchObject({ title: 'Paperwork · done', sub: 'Old Mill · meta · by qa@x', pending: false })
  expect(rows[1].upload).toEqual({ adId: 'u1', images: ['https://a/1.png'], hook: 'Paperwork — done', takeaways: ['Opens with time'] })
  // a catalog ad has no hook to show; one not read yet says so
  expect(rows[2]).toMatchObject({ title: 'Dynamic catalog ad · Retail', pending: true })
  expect(rows[2].upload?.hook).toBe('')
  expect(rows[3]).toMatchObject({ title: 'Advertisement brief', sub: '2 hook patterns · from 1 uploaded ad · by qa@x' })
  expect(rows[3].brief).toEqual({ runId: 'agent2_custom_1', hooks: ['Your week back', 'Proof first'] })
  expect(rows[4]).toMatchObject({ title: 'Ad copy from uploaded ads', sub: '1 variant · meta · learned from 2 ads' })
  expect(rows[4].copy?.variants).toHaveLength(1)
  expect(rows[5]).toMatchObject({ sub: 'Marketing Generation · built from agent2_custom_1 · 1 ad image' })
  expect(rows[5].funnel).toEqual({ runId: 'lt_1', images: ['https://a/ad.png'] })
  expect(rows[6]).toMatchObject({ title: 'Organic brief', sub: 'Custom run by kser · for Acme' })
  expect(rows[6].intel?.bullets).toEqual([
    { title: 'Proof wins', text: 'Results get replies.' },
    { title: '', text: 'Fees come first.' },
  ])
  expect(histSearch(rows, 'RESULTS GET').map((r) => r.id)).toEqual(['i:i1'])
  expect(histSearch(rows, 'old mill').map((r) => r.id)).toEqual(['u:u1'])
  expect(histSearch(rows, '  ')).toHaveLength(7)
})
