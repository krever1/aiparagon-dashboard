import { type Page, expect, test } from '@playwright/test'
import { dateText } from '../../src/components/ui/local-date'
import { LEGACY, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { A, adsRows, ago } from './ads-fixtures'
import { CUSTOM2, INTEL1, INTELC, runsRows } from './runs-fixtures'

// Runs & uploads: the newest strategy built from uploads and Send to Marketing Generation (kept for the team, with the
// banner while the campaign is written), the numbers, one list of everything built outside the schedule with each row's
// body, the tabs in the address, search, paging, the windows it opens, and a phone. On the made-up rows in
// tests/e2e/runs-fixtures.ts.

test.use({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] })

const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const rows = (page: Page) => page.getByTestId('runs-row')
const titles = (page: Page) => rows(page).locator('button[aria-expanded] b')
const rowOf = (page: Page, title: string) => rows(page).filter({ has: page.locator('b', { hasText: new RegExp('^' + title.replace(/[()]/g, '\\$&') + '$') }) })
const open = async (page: Page, title: string, n = 0) => {
  const r = rowOf(page, title).nth(n)
  await r.locator('button[aria-expanded]').click()
  return r.getByTestId('runs-body')
}
const hooks = async (name: string) => (await stubCalls()).filter((c) => c.path === '/webhook/' + name)
const setting = async (key: string) => (await stubRows<{ key: string; value: Record<string, unknown> }>('ai_settings')).find((r) => r.key === key)?.value

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(runsRows())
})

test('the header, the newest strategy, the numbers and one list of everything, newest first', async ({ page }) => {
  await signIn(page, '/runs')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Runs & uploads')
  await expect(page.getByText('Your custom runs and uploaded ads, and what was built from them.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Build ad strategy' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Intel run' })).toBeVisible()
  const newest = page.getByTestId('runs-newest')
  await expect(newest).toContainText('Newest advertisement brief: ' + dateText(ago(3), 'UTC'))
  await expect(newest.getByRole('button', { name: 'Send to Marketing Generation', exact: true })).toBeVisible()
  await newest.getByRole('button', { name: 'Send to Marketing Generation: how it works' }).click()
  const how = page.getByRole('dialog', { name: 'Send to Marketing Generation' })
  await expect(how).toContainText('Marketing Generation always builds from the newest advertisement brief.')
  await how.getByRole('button', { name: 'Got it' }).click()
  await expect(how).toBeHidden()

  await expect(page.getByTestId('runs-strip').getByRole('button')).toHaveText(['2 ads uploaded', '2 strategies built', '1 content run', '3 Intel runs'])
  await expect(page.getByTestId('runs-strip').getByRole('button').nth(3)).toHaveAttribute('title', '2 custom, 1 by the agent')
  await expect(page.getByRole('tablist', { name: 'Runs & uploads' }).getByRole('tab')).toHaveText([
    'All 9',
    'Intel runs 3',
    'Uploaded ads 2',
    'Strategies 2',
    'Ad copy 1',
    'Content runs 1',
  ])
  // every kind, newest first; the campaign from the scheduled brief lives on Marketing Generation, not here
  await expect(titles(page)).toHaveText([
    'Intel run in progress',
    'Untitled ad',
    'Organic brief',
    'Funnel package · Paperwork review',
    'Advertisement brief',
    'Ad copy from Old Mill',
    'Paperwork in an afternoon',
    'Organic brief (custom run)',
    // a strategy saved with no title reads as the old page shows it
    'Advertisement brief',
  ])
  await expect(rows(page).first()).toContainText('In progress')
  await expect(rows(page).nth(1)).toContainText('Uploaded ad')
  await expect(rows(page).nth(1)).toContainText('Old Mill Advisors · facebook · by someone@aiparagonconsulting.com · not read yet')
  await expect(rows(page).nth(1)).toContainText(dateText(ago(1), 'UTC'))
  await expect(rowOf(page, 'Organic brief (custom run)')).toContainText('Custom run by qa.teammate · for Northwind Advisors, Example Ridge Advisors')
  await expect(rowOf(page, 'Organic brief')).toContainText('Scheduled run')
  await expect(rowOf(page, 'Advertisement brief').first()).toContainText('2 hook patterns · from 2 uploaded ads · by ' + TEAM.email)
  await expect(rowOf(page, 'Advertisement brief').nth(1)).toContainText('0 hook patterns · from 1 uploaded ad')
  await expect(page.getByTestId('runs-count')).toHaveText('9 of 9')
  await expect(page.getByText('A campaign from the scheduled brief')).toHaveCount(0)
})

test('each row opens to what it holds', async ({ page }) => {
  await signIn(page, '/runs')
  let b = await open(page, 'Paperwork in an afternoon')
  await expect(b).toContainText('Hook: Paperwork in an afternoon')
  await expect(b).toContainText('Takeaways: Opens with the time it saves · Shows the checklist on the image')
  await expect(b.getByRole('link', { name: 'Open the ad' })).toHaveAttribute('href', '/ad-strategist?ad=' + A(7))
  await expect(b.getByRole('button', { name: 'Read this ad' })).toHaveCount(0)
  await expect(rowOf(page, 'Paperwork in an afternoon').locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', 'true')

  b = await open(page, 'Advertisement brief')
  await expect(b.getByRole('listitem')).toHaveText(['Your week back', 'Proof first'])
  await expect(b.getByRole('link', { name: 'Open the brief' })).toHaveAttribute('href', '/briefs?tab=ads&run=' + CUSTOM2)
  await expect(b.getByRole('button', { name: 'Send to Marketing Generation' })).toBeVisible()

  b = await open(page, 'Ad copy from Old Mill')
  await expect(b.getByTestId('copy-variant')).toHaveCount(2)
  await expect(b).toContainText('Variant ATime back')
  await expect(b).toContainText('Image: A clear desk')
  await expect(b).toContainText('How the guidelines shaped it: Kept to plain words · No promises of results')

  b = await open(page, 'Funnel package · Paperwork review')
  await expect(b.getByRole('link', { name: /Ad image/ })).toHaveCount(2)
  await expect(b.getByRole('link', { name: 'Ad image 1' })).toHaveAttribute('href', 'https://cdn.example.com/ad-1.png')
  await expect(b.getByRole('link', { name: 'Open in Marketing Generation' })).toHaveAttribute('href', LEGACY + '/marketing-generation')

  b = await open(page, 'Organic brief')
  await expect(b).toContainText('Agent run')
  // the first three points of its TL;DR
  await expect(b.getByRole('listitem')).toHaveText(['Proof wins: Advisors who show results get the replies.', 'Fees: Clients ask about fees first.', 'Onboarding is the new battleground.'])
  await expect(b.getByRole('link', { name: 'Open in Intel Tracker' })).toHaveAttribute('href', '/intel-tracker?run=' + INTEL1)

  b = await open(page, 'Organic brief (custom run)')
  await expect(b).toContainText('Custom run')
  await expect(b.getByRole('link', { name: 'Open in Intel Tracker' })).toHaveAttribute('href', '/intel-tracker?run=' + INTELC)

  b = await open(page, 'Intel run in progress')
  await expect(b).toHaveText('The tracker is reading Fabrikam Insights now. This row turns into the brief when it finishes, usually 5 to 15 minutes.')

  // a row closes again
  await rowOf(page, 'Organic brief').locator('button[aria-expanded]').click()
  await expect(rowOf(page, 'Organic brief').getByTestId('runs-body')).toHaveCount(0)
})

test('Read this ad on an upload not read yet: the analyzer reads it and the row says so', async ({ page }) => {
  await signIn(page, '/runs')
  const b = await open(page, 'Untitled ad')
  await expect(b.getByRole('link', { name: 'Screenshot 1' })).toHaveAttribute('href', 'https://cdn.example.com/upload-8.png')
  await b.getByRole('button', { name: 'Read this ad' }).click()
  await expect(toast(page, 'Ad read')).toBeVisible()
  const sent = await hooks('ad-upload')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    mode: 'analyze',
    images: ['https://cdn.example.com/upload-8.png'],
    link: '',
    copy: 'Advisors: get your week back.',
    advertiser: 'Old Mill Advisors',
    platform: 'facebook',
  })
  expect(typeof sent[0].body.auth).toBe('string')
  const row = (await stubRows<Record<string, unknown>>('ad_records')).find((r) => r.id === A(8))!
  expect(row).toMatchObject({ hook: 'Advisors: get your week back.', format: 'static_image', funnel_stage: 'mof', cta: 'Learn more' })
  expect(row.upload_analysis).toMatchObject({ status: 'done', takeaways: ['Opens with a result', 'Names the offer'], pasted_copy: 'Advisors: get your week back.' })
  // the page reads again: the row has its hook as a title and is read
  await expect(rowOf(page, 'Advisors: get your week back.')).not.toContainText('not read yet')

  // an analyzer that cannot read it says why, and nothing changes
  await stubSeed(runsRows())
  await stubHook('ad-upload', 200, { ok: false, error: 'The screenshot is too small to read.' })
  await page.reload()
  await (await open(page, 'Untitled ad')).getByRole('button', { name: 'Read this ad' }).click()
  await expect(toast(page, 'The screenshot is too small to read.')).toBeVisible()
  expect((await stubRows<Record<string, unknown>>('ad_records')).find((r) => r.id === A(8))!.hook).toBe('')
})

test('tabs, numbers and search; the address keeps the tab', async ({ page }) => {
  await signIn(page, '/runs')
  await page.getByTestId('runs-strip').getByRole('button', { name: /ads uploaded/ }).click()
  await expect(page).toHaveURL('/runs?tab=upload')
  await expect(titles(page)).toHaveText(['Untitled ad', 'Paperwork in an afternoon'])
  await page.getByRole('tab', { name: /Intel runs/ }).click()
  await expect(page).toHaveURL('/runs?tab=intel')
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('tab', { name: /^All/ }).click()
  await expect(page).toHaveURL('/runs')

  // search reads the titles, the lines under them and the briefs' text
  await page.getByLabel('Search the history').fill('FEES first')
  await expect(titles(page)).toHaveText(['Organic brief'])
  await expect(page.getByTestId('runs-count')).toHaveText('1 of 9')
  await page.getByLabel('Search the history').fill('nothing like this')
  await expect(page.getByTestId('runs-empty')).toHaveText('Nothing matches “nothing like this”.')

  await page.goto('/runs?tab=copy')
  await expect(titles(page)).toHaveText(['Ad copy from Old Mill'])
  await page.goto('/runs?tab=nonsense')
  await expect(page.getByRole('tab', { selected: true })).toHaveText('All 9')
  await expect(page).toHaveURL('/runs')
})

test('twelve rows a page', async ({ page }) => {
  const ups = Array.from({ length: 30 }, (_, i) => ({
    ...adsRows().ad_records[6],
    id: `95000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    hook: 'Upload number ' + (i + 1),
    created_at: ago(i + 1),
  }))
  await stubSeed({ ad_records: ups, agent_outputs: [], ai_settings: [] })
  await signIn(page, '/runs')
  const pages = page.getByRole('navigation', { name: 'Pages' })
  await expect(pages).toContainText('1–12 of 30')
  await expect(rows(page)).toHaveCount(12)
  await expect(pages.getByRole('button', { name: '‹ Back' })).toBeDisabled()
  await pages.getByRole('button', { name: '2', exact: true }).click()
  await expect(pages).toContainText('13–24 of 30')
  await expect(titles(page).first()).toHaveText('Upload number 13')
  await pages.getByRole('button', { name: 'Next ›' }).click()
  await expect(pages).toContainText('25–30 of 30')
  await expect(rows(page)).toHaveCount(6)
  await expect(pages.getByRole('button', { name: 'Next ›' })).toBeDisabled()
  // a search starts at the first page again
  await page.getByLabel('Search the history').fill('Upload number 1')
  await expect(rows(page)).toHaveCount(11)
  await expect(page.getByTestId('runs-count')).toHaveText('11 of 30')
  await expect(pages).toHaveCount(0)
  // nothing at all
  await stubSeed({ ad_records: [] })
  await page.reload()
  await expect(page.getByTestId('runs-empty')).toHaveText('Nothing here yet. Upload a competitor ad to start.')
  await expect(page.getByTestId('runs-newest')).toHaveText('No strategy built yet')
})

test('Send to Marketing Generation: started for the team, the banner while it is written, then written, then dismissed', async ({ page }) => {
  await signIn(page, '/runs')
  await page.getByTestId('runs-newest').getByRole('button', { name: 'Send to Marketing Generation', exact: true }).click()
  await expect(toast(page, 'Marketing Generation started. It takes a few minutes; the ads land in Marketing Generation.')).toBeVisible()
  const sent = await hooks('e3-low-ticket-run')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ source_brief_run: CUSTOM2, requested_by: TEAM.email })
  expect(((await setting('campaign_runs')) as { runs: Record<string, unknown>[] }).runs).toEqual([expect.objectContaining({ brief: CUSTOM2, by: TEAM.email })])
  const banner = page.getByTestId('campaign-banner')
  await expect(banner).toHaveText('Marketing Generation running from ' + CUSTOM2 + ' · started just now. The funnel package appears here when it finishes.')

  // one at a time for the team
  await (await open(page, 'Advertisement brief', 1)).getByRole('button', { name: 'Send to Marketing Generation' }).click()
  await expect(toast(page, 'Marketing Generation is already running from ' + CUSTOM2 + '.')).toBeVisible()
  expect(await hooks('e3-low-ticket-run')).toHaveLength(1)

  // the agent saves its campaign: the banner says it is written, and the list has it
  await stubSeed({
    agent_outputs: [
      ...runsRows().agent_outputs,
      { id: 'ro-9', agent: 'low_ticket_content', output_type: 'funnel_package', run_id: 'lt_new', title: 'Funnel package — Week back', created_at: new Date().toISOString(), data: JSON.stringify({ source_brief_run: CUSTOM2, ad_images: [] }) },
    ],
  })
  await page.reload()
  await expect(banner).toContainText('✓ Marketing Generation finished · Funnel package, Week back')
  await expect(banner.getByRole('link', { name: 'Open in Marketing Generation' })).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await expect(page.getByRole('tab', { name: /Content runs/ })).toHaveText('Content runs 2')
  await banner.getByRole('button', { name: 'Dismiss' }).click()
  await expect(banner).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('runs-row').first()).toBeVisible()
  await expect(banner).toHaveCount(0)
})

test('a campaign not written after 15 minutes says so; a workflow that is off says so', async ({ page }) => {
  await stubSeed({
    ai_settings: [...runsRows().ai_settings, { key: 'campaign_runs', value: { runs: [{ brief: CUSTOM2, t: Date.now() - 16 * 60_000, by: TEAM.email }] }, updated_by: 'x', updated_at: ago(0) }],
  })
  await signIn(page, '/runs')
  await expect(page.getByTestId('campaign-banner')).toHaveText('No funnel package after 15 minutes from ' + CUSTOM2 + '. Check the run in n8n.Dismiss')

  await stubHook('e3-low-ticket-run', 404, { code: 404, message: 'not registered' })
  await page.getByTestId('runs-newest').getByRole('button', { name: 'Send to Marketing Generation', exact: true }).click()
  await expect(toast(page, 'Marketing Generation is switched off in n8n. Turn on “Low-Ticket Ads Content Agent” in n8n, then try again.')).toBeVisible()
  expect(((await setting('campaign_runs')) as { runs: unknown[] }).runs).toHaveLength(1)
})

test('the windows it opens: a new Intel run, a strategy from uploads, and an upload that stays on this page', async ({ page }) => {
  await signIn(page, '/runs')
  await page.getByRole('button', { name: 'New Intel run' }).click()
  const intel = page.getByRole('dialog', { name: 'Run now with new names' })
  await expect(intel).toBeVisible()
  await intel.getByRole('button', { name: 'Close' }).click()
  await expect(intel).toBeHidden()

  await page.getByRole('button', { name: 'Build ad strategy' }).click()
  const brief = page.getByRole('dialog', { name: 'Build an ad strategy from your uploads' })
  await expect(brief.getByRole('list', { name: 'Uploaded ads' }).getByRole('listitem')).toHaveText(['Old Mill Advisors · Paperwork in an afternoon · ' + dateText(ago(5), 'UTC')])
  await brief.getByRole('button', { name: 'Close' }).first().click()
  await expect(brief).toBeHidden()

  // a text-only ad from an advertiser already followed for ads: no follow question, and the new row opens here
  await page.getByRole('button', { name: 'Add competitor ads' }).click()
  const up = page.getByRole('dialog', { name: 'Add competitor ads' })
  await up.getByLabel('Advertiser').fill('Northwind Advisors')
  await up.getByLabel('Ad copy (optional)').fill('Your clients want proof\nSee it in a week.')
  await up.getByRole('button', { name: 'Upload and analyse' }).click()
  await expect(up.getByTestId('upload-log')).toContainText('saved. Hook: “Your clients want proof”')
  await expect(toast(page, '1 ad added to Ad Strategist')).toBeVisible()
  await expect(up).toBeHidden()
  await expect(page).toHaveURL('/runs?tab=upload')
  await expect(titles(page).first()).toHaveText('Your clients want proof')
  await expect(rows(page).first().getByTestId('runs-body')).toContainText('Hook: Your clients want proof')
})

test('a phone: the list and an open row fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/runs')
  await open(page, 'Funnel package · Paperwork review')
  await open(page, 'Ad copy from Old Mill')
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(wide).toBeLessThanOrEqual(0)
})
