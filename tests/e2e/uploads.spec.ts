import { type Page, expect, test } from '@playwright/test'
import { dateText } from '../../src/components/ui/local-date'
import { libSearch } from '../../src/lib/pipeline/ad-strategist'
import { STUB, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { A, LIB, adsRows, ago } from './ads-fixtures'

// The windows on the Ad Strategist: Add competitor ads (screenshots into Storage, the analyzer, the row, the follow
// question), Read this ad, Build an ad strategy from your uploads (and Send to Marketing Generation), and Write ad copy
// (written, copied, saved and found on Runs & uploads). On the made-up rows in tests/e2e/ads-fixtures.ts.

test.use({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] })

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })
const today = () => new Date().toISOString().slice(0, 10)
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const hooks = async (name: string) => (await stubCalls()).filter((c) => c.path === '/webhook/' + name)
const ads = () => stubRows<Record<string, unknown>>('ad_records')
const known = new Set(adsRows().ad_records.map((r) => r.id))
const added = async () => (await ads()).filter((r) => !known.has(r.id as string))
const kept = async (): Promise<Record<string, { type: string; size: number }>> => (await fetch(STUB + '/__storage?bucket=creatives')).json()
const files = (page: Page) => page.locator('input[type=file][aria-label="Screenshots"]')
const upWin = (page: Page) => page.getByRole('dialog', { name: 'Add competitor ads' })

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(adsRows())
  await page.addInitScript(() => window.sessionStorage.setItem('ap.ads.indAuto', '1'))
})

test('Add competitor ads: screenshots into Storage, read by the analyzer, saved, then follow the advertiser', async ({ page }) => {
  await signIn(page, '/ad-strategist')
  await page.getByTestId('ads-status').getByRole('button', { name: 'Upload ads' }).click()
  const w = upWin(page)
  await expect(w).toContainText('Screenshots are read for the hook, the copy and what the image does. Choose below whether they go into the next ads brief.')
  const log = page.getByTestId('upload-log')
  await w.getByRole('button', { name: 'Upload and analyse' }).click()
  await expect(log).toHaveText('Add at least one screenshot, or paste the ad copy.')

  // pictures only, 8 MB at most
  await files(page).setInputFiles([png('ad-1.png'), png('ad-2.png'), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }, { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(9 * 1024 * 1024) }])
  await expect(toast(page, 'big.png is over 8 MB, skipped')).toBeVisible()
  const picked = w.getByRole('list', { name: 'Screenshots picked' }).getByRole('listitem')
  await expect(picked).toHaveCount(2)
  await w.getByRole('button', { name: 'Remove ad-2.png' }).click()
  await expect(picked).toHaveCount(1)
  await files(page).setInputFiles([png('ad-2.png')])
  await expect(picked).toHaveCount(2)

  await w.getByRole('button', { name: 'Upload and analyse' }).click()
  await expect(log).toHaveText('Say whose ad this is.')
  await w.getByLabel('Advertiser').fill('Brightpath Advisors')
  await w.getByLabel('Platform').selectOption('meta')
  await w.getByLabel('Ad link').fill('not a link')
  await w.getByLabel('Ad copy (optional)').fill('Win back your Fridays\nA second line')
  await w.getByRole('button', { name: 'Upload and analyse' }).click()
  await expect(log).toHaveText('The ad link should be a web address, for example https://www.linkedin.com/ad-library/detail/…')
  await w.getByLabel('Ad link').fill('facebook.com/ads/library/?id=777')
  await w.getByRole('button', { name: 'Upload and analyse' }).click()
  await expect(log.getByRole('listitem')).toHaveText(['uploading 2 screenshots…', 'reading the ad…', 'saved. Hook: “Win back your Fridays”'])
  await expect(toast(page, '1 ad added to Ad Strategist')).toBeVisible()

  // the pictures are in the creatives bucket, under uploads/<day>/
  const inStore = Object.entries(await kept())
  expect(inStore).toHaveLength(2)
  for (const [path, f] of inStore) {
    expect(path).toMatch(new RegExp('^uploads/' + today() + '/[0-9a-f-]{36}\\.png$'))
    expect(f.type).toBe('image/png')
  }
  const sent = await hooks('ad-upload')
  expect(sent).toHaveLength(1)
  const urls = inStore.map(([p]) => STUB + '/storage/v1/object/public/creatives/' + p).sort()
  expect(sent[0].body).toMatchObject({ mode: 'analyze', link: 'https://facebook.com/ads/library/?id=777', copy: 'Win back your Fridays\nA second line', advertiser: 'Brightpath Advisors', platform: 'meta' })
  expect([...(sent[0].body.images as string[])].sort()).toEqual(urls)
  expect(typeof sent[0].body.auth).toBe('string')
  const [row] = await added()
  expect(row).toMatchObject({
    advertiser_name: 'Brightpath Advisors',
    platform: 'meta',
    source: 'swipe_file',
    run_id: 'upload_' + today(),
    ad_library_url: 'https://facebook.com/ads/library/?id=777',
    destination_url: 'https://facebook.com/ads/library/?id=777',
    format: 'carousel',
    hook: 'Win back your Fridays',
    funnel_stage: 'mof',
    uploaded_by: TEAM.email,
    in_brief: true,
    longevity_flag: 'under_6wk',
  })
  expect((row.image_urls as string[]).slice().sort()).toEqual(urls)
  expect(row.upload_analysis).toMatchObject({ status: 'done', takeaways: ['Opens with a result', 'Names the offer'], pasted_copy: 'Win back your Fridays\nA second line' })

  // not followed for ads yet: the window asks
  const ask = page.getByRole('dialog', { name: 'Follow Brightpath Advisors too?' })
  await expect(ask).toContainText('1 ad from Brightpath Advisors saved. Follow Brightpath Advisors and the Ad Strategist pulls their ads from the Meta Ad Library on every run.')
  await expect(ask.getByRole('link', { name: 'Find Brightpath Advisors in the Meta Ad Library' })).toHaveAttribute('href', libSearch('Brightpath Advisors'))
  await expect(ask.getByLabel('Their Facebook page')).toBeFocused()
  await ask.getByRole('button', { name: 'Follow Brightpath Advisors' }).click()
  await expect(ask.getByRole('alert')).toHaveText('That does not look like a Facebook page. Paste the page link, for example facebook.com/their-page.')
  await ask.getByRole('radio', { name: 'Ads and posts' }).click()
  await ask.getByLabel('Their Facebook page').fill('facebook.com/brightpath')
  await ask.getByLabel('Their Facebook page').press('Enter')
  await expect(toast(page, 'Brightpath Advisors is followed. The next run pulls their ads.')).toBeVisible()
  expect((await stubRows<Record<string, unknown>>('competitors')).find((c) => c.name === 'Brightpath Advisors')).toMatchObject({
    meta_page_id: 'brightpath',
    follow_for: 'both',
    status: 'approved',
    added_by: TEAM.email,
  })
  // then the new ad opens on the Uploads tab
  await expect(ask).toBeHidden()
  await expect(page).toHaveURL('/ad-strategist?tab=uploads&ad=' + row.id)
  await expect(page.getByTestId('ad-panel').getByRole('heading', { level: 2 })).toHaveText('Win back your Fridays')
})

test('one ad per screenshot, an analyzer that cannot read them, left out of the next brief, and Not now', async ({ page }) => {
  await signIn(page, '/ad-strategist?tab=uploads')
  await page.getByRole('button', { name: /Upload competitor ads/ }).click()
  const w = upWin(page)
  await files(page).setInputFiles([png('ad-1.png'), png('ad-2.png')])
  await w.getByLabel('Each screenshot is a separate ad').check()
  await w.getByLabel('Advertiser').fill('Unreadable Example Co')
  await w.getByLabel('Ad link').fill('https://example.com/ad/1')
  await w.getByLabel(/Use these in the next ads brief/).uncheck()
  await w.getByRole('button', { name: 'Upload and analyse' }).click()
  const why = 'saved, but not read yet: The analyzer could not read this ad. You can read it again from the ad.'
  await expect(page.getByTestId('upload-log').getByRole('listitem')).toHaveText([
    'Ad 1 of 2: uploading ad-1.png…',
    'Ad 1 of 2: reading the ad…',
    'Ad 1 of 2: ' + why,
    'Ad 2 of 2: uploading ad-2.png…',
    'Ad 2 of 2: reading the ad…',
    'Ad 2 of 2: ' + why,
  ])
  await expect(toast(page, '2 ads added to Ad Strategist')).toBeVisible()
  const rows = (await added()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  expect(rows).toHaveLength(2)
  // the table takes a link once: the first ad keeps it as its Ad Library link, the second goes in as an upload
  expect(rows[0]).toMatchObject({ ad_library_url: 'https://example.com/ad/1', format: 'static_image', in_brief: false, hook: '' })
  expect(rows[1]).toMatchObject({ destination_url: 'https://example.com/ad/1', in_brief: false })
  expect(String(rows[1].ad_library_url)).toMatch(/^swipe:upload:[0-9a-f-]{36}$/)
  for (const r of rows) {
    expect(r.upload_analysis).toEqual({ status: 'pending', error: 'The analyzer could not read this ad.', pasted_copy: '' })
    expect(r.image_urls).toHaveLength(1)
  }

  const ask = page.getByRole('dialog', { name: 'Follow Unreadable Example Co too?' })
  await expect(ask).toContainText('2 ads from Unreadable Example Co saved.')
  await ask.getByRole('button', { name: 'Not now' }).click()
  await expect(ask).toBeHidden()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ap.v111.nofollow') || '{}'))).toEqual({ 'unreadable example co': 1 })
  await expect(page.getByTestId('ad-panel')).toContainText('Not read yet')

  // asked once: the next upload from them goes straight to the ad
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Upload competitor ads/ }).click()
  await upWin(page).getByLabel('Advertiser').fill('unreadable example co')
  await upWin(page).getByLabel('Ad copy (optional)').fill('A text-only ad')
  await upWin(page).getByRole('button', { name: 'Upload and analyse' }).click()
  await expect(upWin(page)).toBeHidden()
  await expect(page.getByRole('dialog', { name: /too\?/ })).toHaveCount(0)
  await expect(page.getByTestId('ad-panel')).toBeVisible()
})

test('a link already saved goes in as an upload; an advertiser followed for ads is not asked about', async ({ page }) => {
  await signIn(page, '/ad-strategist')
  await page.getByTestId('ads-status').getByRole('button', { name: 'Upload ads' }).click()
  const w = upWin(page)
  await w.getByLabel('Advertiser').fill('Northwind Advisors')
  await w.getByLabel('Ad link').fill(LIB(1))
  await w.getByLabel('Ad copy (optional)').fill('Proof, not promises\nBook a review.')
  await w.getByRole('button', { name: 'Upload and analyse' }).click()
  await expect(w.getByTestId('upload-log')).toContainText('saved. Hook: “Proof, not promises”')
  await expect(w).toBeHidden()
  await expect(page.getByRole('dialog', { name: /too\?/ })).toHaveCount(0)
  const [row] = await added()
  expect(row).toMatchObject({ destination_url: LIB(1), format: 'text', platform: 'linkedin', image_url: null })
  expect(String(row.ad_library_url)).toMatch(/^swipe:upload:/)
  await expect(page).toHaveURL('/ad-strategist?tab=uploads&ad=' + row.id)
  // the analyzer got no pictures, only the words
  expect((await hooks('ad-upload'))[0].body).toMatchObject({ images: [], copy: 'Proof, not promises\nBook a review.', platform: 'linkedin' })
})

test('Read this ad in the panel: an upload not read yet is read again', async ({ page }) => {
  await signIn(page, '/ad-strategist?ad=' + A(8))
  const p = page.getByTestId('ad-panel')
  await expect(p).toContainText('Not read yet')
  await p.getByRole('button', { name: 'Read this ad' }).click()
  await expect(toast(page, 'Ad read')).toBeVisible()
  await expect(p.getByRole('heading', { level: 2 })).toHaveText('Advisors: get your week back.')
  await expect(p).not.toContainText('Not read yet')
  await expect(p.getByRole('button', { name: 'Read this ad' })).toHaveCount(0)
  // an upload's own link is named for where it goes (the first port called every link the Meta Ad Library)
  await page.goto('/ad-strategist?ad=' + A(7))
  await expect(p.getByRole('link', { name: 'View the ad' })).toHaveCount(0)
  await stubSeed({ ad_records: adsRows().ad_records.map((r) => (r.id === A(7) ? { ...r, ad_library_url: 'https://www.linkedin.com/ad-library/detail/9' } : r)) })
  await page.reload()
  await expect(p.getByRole('link', { name: 'View on LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/ad-library/detail/9')
})

test('Build an ad strategy from the uploads: the read ones, the intel, the brief, then Send to Marketing Generation', async ({ page }) => {
  const base = adsRows()
  const seven = base.ad_records[6]
  await stubSeed({
    ad_records: [...base.ad_records, { ...seven, id: A(10), hook: 'Left out of briefs', in_brief: false, created_at: ago(6) }],
    intel_items: [
      { id: 'ii-1', summary: 'Fees asked first', signal: 'Clients ask about fees', themes: ['fees'], ad_context_value: 'high', created_at: ago(3) },
      { id: 'ii-2', summary: 'Proof wins', signal: 'Results get replies', themes: ['proof'], ad_context_value: 'high', created_at: ago(1) },
      { id: 'ii-3', summary: 'Too old', signal: 'x', themes: [], ad_context_value: 'high', created_at: ago(40) },
      { id: 'ii-4', summary: 'Not high', signal: 'x', themes: [], ad_context_value: 'medium', created_at: ago(2) },
    ],
  })
  await signIn(page, '/ad-strategist')
  // Run now's second card opens the same window
  await page.getByRole('button', { name: 'Run now' }).click()
  await page.getByRole('dialog', { name: 'Run the Ad Strategist' }).getByRole('button', { name: 'Pick ads' }).click()
  const d = page.getByRole('dialog', { name: 'Build an ad strategy from your uploads' })
  const list = d.getByRole('list', { name: 'Uploaded ads' }).getByRole('listitem')
  // the read uploads only; one switched out of the next ads brief starts unticked
  await expect(list).toHaveText([
    'Old Mill Advisors · Paperwork in an afternoon · ' + dateText(ago(5), 'UTC'),
    'Old Mill Advisors · Left out of briefs · ' + dateText(ago(6), 'UTC') + '(left out of the next ads brief)',
  ])
  await expect(list.nth(0).getByRole('checkbox')).toBeChecked()
  await expect(list.nth(1).getByRole('checkbox')).not.toBeChecked()
  await expect(d.getByLabel('Also use high-value intel from the last 30 days')).toBeChecked()
  await list.nth(0).getByRole('checkbox').uncheck()
  await d.getByRole('button', { name: 'Build the strategy' }).click()
  await expect(d.getByRole('alert')).toHaveText('Pick at least one ad.')
  await list.nth(0).getByRole('checkbox').check()
  await d.getByRole('button', { name: 'Build the strategy' }).click()
  await expect(d.getByRole('status')).toHaveText('Strategy saved as run agent2_custom_stub. It is now the newest brief.')
  const r = d.getByTestId('brief-result')
  await expect(r).toContainText('Angle: Proof you can check in a week.')
  await expect(r.getByRole('listitem')).toHaveText(['Your week back', 'Proof first'])
  // one brief per window: the build button goes once it is written
  await expect(d.getByRole('button', { name: 'Build the strategy' })).toHaveCount(0)

  const sent = await hooks('ad-brief')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    requested_by: TEAM.email,
    ads: [
      {
        id: A(7),
        advertiser: 'Old Mill Advisors',
        hook: 'Paperwork in an afternoon',
        body: 'We sort your client files for you.',
        cta: 'Get started',
        offer: 'Paperwork review',
        patterns: ['Time saving: a concrete number', 'Proof first: a before and after'],
        visual: { visual_hook: 'A stack of paper shrinking', text_on_image: 'One afternoon' },
        takeaways: ['Opens with the time it saves', 'Shows the checklist on the image'],
        link: 'https://oldmill.example.com/review',
      },
    ],
    // the high-value findings of the last 30 days, newest first
    intel: [
      { summary: 'Proof wins', signal: 'Results get replies', themes: ['proof'] },
      { summary: 'Fees asked first', signal: 'Clients ask about fees', themes: ['fees'] },
    ],
  })
  await expect(r.getByRole('link', { name: 'Open the brief' })).toHaveAttribute('href', '/briefs?tab=ads&run=agent2_custom_stub')

  await r.getByRole('button', { name: 'Send to Marketing Generation' }).click()
  await expect(toast(page, 'Marketing Generation started. It takes a few minutes; the ads land in Marketing Generation.')).toBeVisible()
  expect((await hooks('e3-low-ticket-run'))[0].body).toMatchObject({ source_brief_run: 'agent2_custom_stub', requested_by: TEAM.email })
  // Runs & uploads shows the campaign while it is written
  await expect(page).toHaveURL('/runs')
  await expect(page.getByTestId('campaign-banner')).toContainText('Marketing Generation running from agent2_custom_stub')

  // a workflow that answers with no brief says so
  await page.goto('/ad-strategist?tab=uploads')
  await stubHook('ad-brief', 200, { ok: false, error: 'No ads to read.' })
  await page.getByRole('button', { name: 'Build a brief from these' }).click()
  await d.getByRole('button', { name: 'Build the strategy' }).click()
  await expect(d.getByRole('alert')).toHaveText('No ads to read.')
})

test('Write ad copy: the offer and the guidelines it follows, the copy, Copy all, then saved and found on Runs & uploads', async ({ page }) => {
  await stubSeed({
    offers: [
      { id: 'of-1', name: 'Old offer', type: 'x', price: 0, created_at: ago(90), is_default: false, archived: false },
      { id: 'of-2', name: 'Advisor Checkup', type: 'slo', price: 29, whats_included: 'A review', upsell_path: 'Retainer', created_at: ago(30), is_default: true, archived: false },
    ],
    guide_files: [
      { id: 'gf-1', file_name: 'Brand guide.pdf', file_text: 'Write plainly. '.repeat(10), created_at: ago(5) },
      { id: 'gf-2', file_name: 'Empty scan.pdf', file_text: 'short', created_at: ago(4) },
    ],
    company_profile: [{ id: 1, business_name: 'Example Firm', industry: 'Advice', target_market: 'Advisors', website: 'https://firm.example.com', brand_voice: 'Plain and warm' }],
  })
  await signIn(page, '/ad-strategist?tab=uploads')
  await page.getByRole('button', { name: 'Write ad copy' }).click()
  const d = page.getByRole('dialog', { name: 'Write ad copy from these ads' })
  await expect(d).toContainText('Original copy for Advisor Checkup. The ads are pattern evidence only; wording comes from our guidelines and brand voice.')
  await expect(d.getByRole('list', { name: 'Ads to learn from' }).getByRole('listitem')).toHaveText(['Old Mill Advisors · Paperwork in an afternoon'])
  await expect(d.getByTestId('copy-guides')).toHaveText('Guidelines used: Brand guide.pdf · brand voice from the company profile')
  await d.getByLabel('Platform').selectOption('linkedin')
  await d.getByLabel('Variants').selectOption('2')
  await d.getByRole('button', { name: 'Write the copy' }).click()
  await expect(d.getByRole('status')).toHaveText('2 variants written.')
  const res = d.getByTestId('copy-result')
  await expect(res.getByTestId('copy-variant')).toHaveCount(2)
  await expect(res).toContainText('Stub hook 1 for Advisor Checkup')
  await expect(res).toContainText('Image: A clear desk')
  await expect(res).toContainText('How the guidelines shaped it: Kept to plain words · No promises of results')

  const sent = await hooks('ad-upload')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    mode: 'copy',
    platform: 'linkedin',
    count: 2,
    company: { name: 'Example Firm', industry: 'Advice', target_market: 'Advisors', website: 'https://firm.example.com' },
    offer: { name: 'Advisor Checkup', type: 'slo', price: 29, included: 'A review', upsell: 'Retainer' },
    brand_voice: 'Plain and warm',
    guidelines: [{ name: 'Brand guide.pdf', text: 'Write plainly. '.repeat(10).trim() }],
    ads: [{ advertiser: 'Old Mill Advisors', hook: 'Paperwork in an afternoon', cta: 'Get started', takeaways: ['Opens with the time it saves', 'Shows the checklist on the image'] }],
  })

  await res.getByRole('button', { name: 'Copy all' }).click()
  await expect(toast(page, 'Copied every variant')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^VARIANT A, Time back\n\nStub hook 1 for Advisor Checkup\n\nStub primary text 1\.\n\nHeadline: Stub headline 1\n\nCTA: Book a call\n\nImage: A clear desk\n\n----------\n\nVARIANT B, Proof/)

  await res.getByRole('button', { name: 'Save to Pipeline' }).click()
  await expect(toast(page, 'Saved to Pipeline')).toBeVisible()
  const saved = (await stubRows<Record<string, unknown>>('agent_outputs')).filter((o) => o.agent === 'ad_copywriter' && o.id !== 'ao-5')
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ output_type: 'ad_copy', title: 'Ad copy from uploaded ads · ' + today() })
  expect(String(saved[0].run_id)).toMatch(/^adcopy_\d{12}$/)
  expect(saved[0].data).toMatchObject({ platform: 'linkedin', source_ads: [A(7)], guideline_notes: ['Kept to plain words', 'No promises of results'] })
  expect((saved[0].data as { variants: Record<string, unknown>[] }).variants[0]).toMatchObject({ hook: 'Stub hook 1 for Advisor Checkup', image_direction: 'A clear desk', pattern_borrowed: 'Proof first' })
  expect(String(saved[0].content_md)).toContain('# Ad copy from uploaded ads · ' + today())

  await res.getByRole('button', { name: '✓ Saved · view in history' }).click()
  await expect(page).toHaveURL('/runs?tab=copy')
  await expect(page.getByTestId('runs-row').first()).toContainText('Ad copy from uploaded ads')
  await expect(page.getByTestId('runs-row').first()).toContainText('2 variants · linkedin · learned from 1 ad')
})

test('ad copy with no uploads read: ads from the Ad Library to learn from, and an answer with no copy', async ({ page }) => {
  await stubSeed({ ad_records: adsRows().ad_records.filter((r) => r.id !== A(7)) })
  await signIn(page, '/ad-strategist?tab=uploads')
  await page.getByRole('button', { name: 'Write ad copy' }).click()
  const d = page.getByRole('dialog', { name: 'Write ad copy from these ads' })
  await expect(d).toContainText('None of your uploads is read yet, so these are ads from the Ad Library.')
  // ads with a hook, newest first, never a catalog template
  await expect(d.getByRole('list', { name: 'Ads to learn from' }).getByRole('listitem')).toHaveText([
    'Northwind Advisors · Your clients want proof, not promises',
    'Northwind Advisors · Onboard clients in days, not weeks',
    'Example Ridge Advisors · The checklist advisors keep',
    'Harbor Example Group · Your first workflow, automated in a week',
    'Example Ridge Advisors · Stop losing a week to paperwork',
    'Contoso Planning · Plan your next decade',
  ])
  await expect(d).toContainText('Original copy for AI Readiness Scorecard.')
  await expect(d.getByTestId('copy-guides')).toHaveText('Guidelines used: none with readable text. Upload a brand guide in Files and it is read automatically.')
  await stubHook('ad-upload', 200, { ok: true, variants: [] })
  await d.getByRole('button', { name: 'Write the copy' }).click()
  await expect(d.getByRole('alert')).toHaveText('No copy came back.')
  expect((await hooks('ad-upload'))[0].body).toMatchObject({ offer: { name: 'AI Readiness Scorecard', type: 'slo_digital', price: 0 }, brand_voice: '', guidelines: [] })
})
