import { type Page, expect, test } from '@playwright/test'
import { dayText, whatLine, resultOf } from '../../src/lib/pipeline/ad-testing'
import { dayShort } from '../../src/lib/pipeline/strategy'
import { LEGACY, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { R, ago, testingRows } from './testing-fixtures'

// Ad Testing: the status, the six numbers and the tabs in the address, the line about the daily numbers (Sync now),
// Results (the landing pages' sign-ups by ad code, how the results came in, what is working, the ads and the posts),
// the Leaderboard, and Log a result (new, from a campaign's ad, edit, delete). On the made-up rows in
// tests/e2e/testing-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const dlg = (page: Page) => page.getByRole('dialog', { name: /Log a result|Edit this result/ })
const box = (page: Page, name: string) => dlg(page).getByRole('textbox', { name, exact: true })
const table = (page: Page, name: string) => page.getByRole('table', { name, exact: true })
const saved = async (id: string) => (await stubRows<Row>('content_results')).find((r) => r.id === id)

let seeded = testingRows()
test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  seeded = testingRows()
  await stubSeed(seeded)
})

test('the status, the six numbers, what it does and the tabs', async ({ page }) => {
  await signIn(page, '/ad-testing')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ad Testing')
  await expect(page.getByTestId('testing-status').getByRole('listitem')).toHaveText(['Strategy read ' + dayShort(ago(2 * 864e5), Date.now(), 'UTC'), '7 results logged'])
  await expect(page.getByRole('list', { name: 'What Ad Testing does' }).getByRole('listitem')).toHaveText([
    'Log post and ad results',
    'Ranks what works',
    'Suggests what to make next',
  ])
  await expect(page.getByTestId('testing-strip').getByRole('button')).toHaveText([
    '3 posts logged',
    '4 ads logged',
    '$1,619 ad spend',
    '16 leads',
    '1 client won',
    '$4,500 revenue',
  ])
  await expect(page.getByRole('button', { name: 'Import a CSV' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['Strategy read', 'Results 7', 'Leaderboard'])
  await expect(page.getByRole('tab', { name: 'Strategy read' })).toHaveAttribute('aria-selected', 'true')
  // nothing is connected: the line says where to connect
  await expect(page.getByTestId('sync-line')).toHaveText('Connect Meta and LinkedIn on Integrations and the numbers come in every morning.Connect on Integrations')
  await expect(page.getByTestId('sync-line').getByRole('link')).toHaveAttribute('href', LEGACY + '/integrations')
  // a number opens the tab it counts, which the address keeps
  await page.getByTestId('testing-strip').getByRole('button', { name: '$1,619 ad spend' }).click()
  await expect(page).toHaveURL(/\/ad-testing\?tab=board$/)
  await expect(page.getByRole('tab', { name: 'Leaderboard' })).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('testing-strip').getByRole('button', { name: '3 posts logged' }).click()
  await expect(page).toHaveURL(/\/ad-testing\?tab=results$/)
  await page.getByRole('tab', { name: 'Strategy read' }).click()
  await expect(page).toHaveURL(/\/ad-testing$/)
})

test('Results: the landing pages’ sign-ups, how the results came in, what is working, the ads and the posts', async ({ page }) => {
  await signIn(page, '/ad-testing?tab=results')
  const lp = page.getByTestId('lp-card')
  await expect(lp).toContainText('Last 30 days · spend matched by the code in the ad’s name')
  // the synced Meta numbers for PK7Q2-A1, not the ad logged by hand with the same code
  await expect(lp.getByTestId('lp-row').nth(0).getByRole('cell')).toHaveText(['PK7Q2-A1 Stop losing a week to paperwork', 'Onboarding audit', '30', '2', '6.7%', '$120', '$60'])
  await expect(lp.getByTestId('lp-row').nth(1).getByRole('cell')).toHaveText(['PK7Q2-A2 Your first workflow, automated', 'Onboarding audit', '0', '0', '', '', ''])
  await expect(lp.getByTestId('lp-row').nth(2).getByRole('cell')).toHaveText(['Visits without an ad code', 'Onboarding audit', '10', '1', '10%', '', ''])
  await expect(lp.getByRole('link', { name: 'Landing pages' })).toHaveAttribute('href', '/landing-pages')

  await expect(page.getByTestId('results-src')).toHaveText('5 entered by hand · 1 imported from a file · 1 synced from the ad platforms')
  await expect(page.getByTestId('working-good').getByRole('listitem')).toHaveText([
    'Stop losing a week to paperwork Meta ads · $300 spent · 10 leads at $30 each',
    'Your first workflow, automated LinkedIn ads · $200 spent · 4 leads at $50 each',
  ])
  await expect(page.getByTestId('working-bad').getByRole('listitem')).toHaveText(['PK7Q2-A1 retarget, logged by hand Meta ads · $999 spent · no leads yet'])

  const ads = table(page, 'Ads').getByTestId('result-row')
  await expect(ads).toHaveCount(4)
  const r1 = resultOf(seeded.content_results[0] as Row)
  await expect(ads.nth(1).getByRole('cell')).toHaveText([
    'Stop losing a week to paperwork' + whatLine(r1, 'UTC') + 'Most leads were COOsEditDelete',
    '$300',
    '2%',
    '10',
    '4',
    '3',
    '1',
    '$4,500',
    '$30',
    '15x',
  ])
  // a synced row says so, and has no Edit or Delete: the next sync would undo them
  const synced = ads.filter({ hasText: 'synced from Meta' })
  await expect(synced).toHaveCount(1)
  await expect(synced.getByRole('button')).toHaveCount(0)
  await expect(ads.filter({ hasText: 'imported' })).toContainText('Your first workflow, automated')

  const posts = table(page, 'Organic posts').getByTestId('result-row')
  await expect(posts).toHaveCount(3)
  await expect(posts.nth(0).getByRole('cell').nth(6)).toHaveText('4%')
  await expect(posts.nth(0).getByRole('link', { name: 'Open it' })).toHaveAttribute('href', 'https://www.linkedin.com/posts/example-1')
  // a link that is not a web address is not a link
  await expect(posts.nth(1).getByRole('link')).toHaveCount(0)
  await expect(posts.nth(1).getByRole('cell').nth(6)).toHaveText('0.5%')
  await expect(posts.nth(2).getByRole('cell').nth(6)).toHaveText('–')

  await page.getByRole('button', { name: 'How these numbers are worked out' }).click()
  await expect(page.getByRole('dialog', { name: 'How these numbers are worked out' })).toContainText('Return is revenue divided by spend.')
})

test('the Leaderboard: the leading ad, cost per lead, every ad ranked and the posts by engagement', async ({ page }) => {
  await signIn(page, '/ad-testing?tab=board')
  await expect(page.getByTestId('leading')).toHaveText('Leading nowStop losing a week to paperwork15x return on $300 · Meta ads')
  const bars = page.getByTestId('cpl-bars').getByRole('listitem')
  await expect(bars).toHaveText(['Stop losing a week to paperwork$30', 'Your first workflow, automated$50', 'PK7Q2-A1 Onboarding audit · Meta$60'])
  await expect(bars.nth(1).getByRole('img')).toHaveAttribute('aria-label', '$50 per lead')
  const ranked = table(page, 'Ads, ranked').getByTestId('result-row')
  await expect(ranked.locator('b')).toHaveText(['Stop losing a week to paperwork', '15x', 'Your first workflow, automated', '–', 'PK7Q2-A1 Onboarding audit · Meta', '–', 'PK7Q2-A1 retarget, logged by hand', '–'])
  await expect(ranked.nth(0).getByRole('cell').nth(6)).toHaveText('$100')
  // the leaderboard has no Edit or Delete
  await expect(ranked.getByRole('button')).toHaveCount(0)
  await expect(table(page, 'Posts, by engagement').getByTestId('result-row').locator('b')).toHaveText(['Why onboarding stalls · a field note', '4%', 'The 3-step intake', '0.5%'])
  await page.getByRole('button', { name: 'How the leaderboard ranks ads' }).click()
  await expect(page.getByRole('dialog', { name: 'How the leaderboard ranks ads' })).toContainText('A cheap lead that never books')
})

test('Log a result: a post, checked as the old form checked it, then saved', async ({ page }) => {
  await signIn(page, '/ad-testing?tab=results')
  await page.getByRole('button', { name: 'Log a result' }).click()
  await expect(dlg(page)).toContainText('Use the numbers from the platform, as they are. Nothing is estimated or filled in for you.')
  await expect(dlg(page).getByRole('radio', { name: 'Organic post' })).toHaveAttribute('aria-checked', 'true')
  const err = dlg(page).getByTestId('log-err')
  const save = dlg(page).getByRole('button', { name: 'Save result' })
  await save.click()
  await expect(err).toHaveText('Add a title: the hook, the headline or a short name.')
  await box(page, 'Title').fill('Our intake post')
  await dlg(page).getByRole('textbox', { name: /^Link/ }).fill('linkedin.com/x')
  await save.click()
  await expect(err).toHaveText('That link does not look right. Use the full address, like https://www.linkedin.com/posts/…')
  await dlg(page).getByRole('textbox', { name: /^Link/ }).fill('https://www.linkedin.com/posts/intake')
  await save.click()
  await expect(err).toHaveText('Add at least one number from the platform, such as impressions or clicks.')
  // a post's numbers: no spend or leads
  await expect(dlg(page).getByTestId('log-nums').locator('label')).toHaveText(['Impressions', 'Reactions', 'Comments', 'Shares', 'Clicks'])
  await box(page, 'Impressions').fill('1,200')
  await box(page, 'Reactions').fill('2.5')
  await save.click()
  await expect(err).toHaveText('Use a whole number for reactions.')
  await box(page, 'Reactions').fill('25')
  await dlg(page).getByRole('combobox', { name: 'Where' }).selectOption('LinkedIn')
  await save.click()
  await expect(dlg(page)).toBeHidden()
  await expect(toast(page, 'Result saved. The leaderboard and the next strategy read use it.')).toBeVisible()
  const row = (await stubRows<Row>('content_results')).find((r) => r.title === 'Our intake post')!
  expect(row).toMatchObject({
    kind: 'post', platform: 'LinkedIn', url: 'https://www.linkedin.com/posts/intake', impressions: 1200, reactions: 25, spend: null, attribution: 'manual',
    created_by: TEAM.email, updated_by: TEAM.email, variant_file: null,
  })
  await expect(table(page, 'Organic posts').getByTestId('result-row')).toHaveCount(4)
})

test('Log a result: an ad from a campaign, which of its ads, and the checks on its numbers', async ({ page }) => {
  await signIn(page, '/ad-testing')
  await page.getByRole('button', { name: 'Log a result' }).click()
  const piece = dlg(page).getByRole('combobox', { name: 'Which piece was it?' })
  await expect(piece.locator('optgroup')).toHaveCount(3)
  await piece.selectOption({ label: 'Campaign · ' + dayText(ago(6 * 864e5), true, 'UTC') + ' · Onboarding Audit' })
  // a campaign is an ad
  await expect(dlg(page).getByRole('radio', { name: 'Ad' })).toHaveAttribute('aria-checked', 'true')
  await dlg(page).getByRole('combobox', { name: 'Which ad from the campaign?' }).selectOption({ label: 'Ad 2 · Your first workflow, automated' })
  await expect(box(page, 'Title')).toHaveValue('Your first workflow, automated')
  await expect(dlg(page).getByTestId('log-nums').locator('label')).toHaveText([
    'Spend ($)', 'Impressions', 'Clicks', 'Leads', 'Qualified leads', 'Booked calls', 'Clients won', 'Revenue ($)',
  ])
  const err = dlg(page).getByTestId('log-err')
  const save = dlg(page).getByRole('button', { name: 'Save result' })
  await box(page, 'Spend ($)').fill('$1,250.50')
  await box(page, 'Leads').fill('3')
  await box(page, 'Qualified leads').fill('4')
  await save.click()
  await expect(err).toHaveText('Qualified leads cannot be more than leads.')
  await box(page, 'Qualified leads').fill('2')
  await box(page, 'Clients won').fill('5')
  await save.click()
  await expect(err).toHaveText('Clients won cannot be more than leads.')
  await box(page, 'Clients won').fill('1')
  await box(page, 'Revenue ($)').fill('4500')
  await dlg(page).locator('input[type="date"]').fill(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10))
  await save.click()
  await expect(err).toHaveText('The posted date is in the future.')
  await dlg(page).locator('input[type="date"]').fill(new Date(Date.now() - 864e5).toISOString().slice(0, 10))
  await save.click()
  await expect(dlg(page)).toBeHidden()
  const row = (await stubRows<Row>('content_results')).find((r) => r.title === 'Your first workflow, automated' && r.attribution === 'manual')!
  expect(row).toMatchObject({ kind: 'ad', spend: 1250.5, leads: 3, qualified: 2, won: 1, revenue: 4500, source_run_id: 'lt-run-1', variant_file: 'lt1-b.png', source_output_id: null })
})

test('Edit and Delete a result logged here; a synced one has neither', async ({ page }) => {
  await signIn(page, '/ad-testing?tab=results')
  const ads = table(page, 'Ads').getByTestId('result-row')
  const r1 = ads.filter({ hasText: 'Most leads were COOs' })
  await r1.getByRole('button', { name: 'Edit' }).click()
  await expect(dlg(page).getByRole('heading', { name: 'Edit this result' })).toBeVisible()
  await expect(box(page, 'Title')).toHaveValue('Stop losing a week to paperwork')
  await expect(box(page, 'Leads')).toHaveValue('10')
  await expect(box(page, 'Impressions')).toBeFocused()
  await box(page, 'Leads').fill('12')
  await dlg(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(toast(page, 'Result updated.')).toBeVisible()
  expect(await saved(R.r1)).toMatchObject({ leads: 12, updated_by: TEAM.email, revenue: 4500, attribution: 'manual', source_run_id: 'lt-run-1', variant_file: 'lt1-a.png' })

  page.once('dialog', (d) => {
    expect(d.message()).toBe('Delete the result for “Your first workflow, automated”? This cannot be undone.')
    void d.dismiss()
  })
  await ads.filter({ hasText: 'imported' }).getByRole('button', { name: 'Delete the result for Your first workflow, automated' }).click()
  expect(await saved(R.r4)).toBeTruthy()
  page.once('dialog', (d) => void d.accept())
  await ads.filter({ hasText: 'imported' }).getByRole('button', { name: /^Delete/ }).click()
  await expect(toast(page, 'Result deleted.')).toBeVisible()
  expect(await saved(R.r4)).toBeUndefined()
  await expect(ads).toHaveCount(3)
})

test('the daily numbers: connected, Sync now, and a workflow that is off', async ({ page }) => {
  await stubHook('e3-ad-results', 200, {
    ok: true,
    meta: { connected: true, account_name: 'Example Ads', last_sync: ago(3 * 36e5) },
    linkedin: { connected: false },
    rows: 3,
  })
  await signIn(page, '/ad-testing')
  const line = page.getByTestId('sync-line')
  await expect(line).toContainText('Synced every morning from Meta (Facebook and Instagram). Last sync 3 hours ago.')
  await line.getByRole('button', { name: 'Sync now' }).click()
  await expect(toast(page, '3 ads updated')).toBeVisible()
  const calls = (await stubCalls()).filter((c) => c.path === '/webhook/e3-ad-results')
  expect(calls.map((c) => c.body.action)).toEqual(['status', 'sync', 'status'])
  expect(calls.every((c) => typeof c.body.auth === 'string' && c.body.auth.length > 0)).toBe(true)

  await stubHook('e3-ad-results', 404, { message: 'not found' })
  await page.reload()
  await expect(line).toContainText('Daily numbers from Meta and LinkedIn: the sync workflow is not switched on in n8n yet.')
})

test('nothing yet: no results, nothing to rank, no landing page live, and the template', async ({ page }) => {
  await stubSeed({ content_results: [], landing_pages: [], agent_outputs: [] })
  await signIn(page, '/ad-testing?tab=results')
  await expect(page.getByTestId('testing-status').getByRole('listitem')).toHaveText(['No strategy read yet', 'No results logged yet'])
  await expect(page.getByText('No results logged yet', { exact: true }).last()).toBeVisible()
  await expect(page.getByTestId('lp-card')).toContainText('Put a landing page live and each ad gets a link and a code.')
  await expect(page.getByTestId('lp-card').getByRole('link', { name: 'Put a page live' })).toHaveAttribute('href', '/landing-pages?new=1')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the template' }).click()])
  expect(dl.suggestedFilename()).toBe('results-template.csv')
  expect((await (await dl.createReadStream()).toArray()).join('')).toBe(
    'Ad or post,Kind,Where,Date,Spend,Impressions,Clicks,Leads,Qualified leads,Booked calls,Clients won,Revenue,Reactions,Comments,Shares,Link,Notes\n',
  )
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  await expect(page.getByText('Nothing to rank yet')).toBeVisible()
})

test('the Pipeline Overview’s Log a result opens the form here, once', async ({ page }) => {
  await signIn(page, '/engine-3')
  const quick = page.getByTestId('quick-start').getByRole('link', { name: /Log a result/ })
  await expect(quick).toHaveAttribute('href', '/ad-testing?tab=results&log=1')
  await quick.click()
  await expect(dlg(page)).toBeVisible()
  await expect(page).toHaveURL(/\/ad-testing\?tab=results$/)
  await expect(page.getByRole('tab', { name: /^Results/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByTestId('testing-page')).toBeVisible()
  await expect(dlg(page)).toBeHidden()
})

test('on a phone: nothing runs off the side; the tables scroll in their box', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/ad-testing?tab=results')
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  await expect(table(page, 'Ads')).toBeVisible()
  expect(await wide()).toBeLessThanOrEqual(0)
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  await expect(page.getByTestId('cpl-bars')).toBeVisible()
  expect(await wide()).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: 'Log a result' }).click()
  await expect(dlg(page)).toBeVisible()
  expect(await wide()).toBeLessThanOrEqual(0)
})
