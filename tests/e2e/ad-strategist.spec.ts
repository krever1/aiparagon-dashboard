import { type Page, expect, test } from '@playwright/test'
import { dateText, dayText } from '../../src/components/ui/local-date'
import { libSearch } from '../../src/lib/pipeline/ad-strategist'
import { whenText } from '../../src/lib/touchpoint/today'
import { LEGACY, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { A, CO, CUSTOM, LIB, RUN0, RUN1, RUN1_AT, adsRows, ago } from './ads-fixtures'

// The Ad Strategist: the header and the top ads, every ad with which brief it went into and why others were not, an ad
// in full with its score, fit and the next brief, a score set by hand, the uploads and the copy written from them, the
// five things of a brief and another brief, the runs, who and what it follows, the industries, Run now through n8n, and
// a phone. On the made-up rows in tests/e2e/ads-fixtures.ts.

test.use({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] })

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Ad Strategist' }).getByRole('tab')
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const rows = (page: Page) => page.getByTestId('ad-row')
const rowOf = (page: Page, title: string) => rows(page).filter({ has: page.getByRole('button', { name: title, exact: true }) })
const panel = (page: Page) => page.getByTestId('ad-panel')
const setting = async (key: string) => (await stubRows<{ key: string; value: Record<string, unknown> }>('ai_settings')).find((r) => r.key === key)?.value
const record = async (n: number) => (await stubRows<Record<string, unknown>>('ad_records')).find((r) => r.id === A(n))!
const competitor = async (id: string) => (await stubRows<Record<string, unknown>>('competitors')).find((r) => r.id === id)!
const hooks = async (name: string) => (await stubCalls()).filter((c) => c.path === '/webhook/' + name)
const day = (iso: string) => dayText(iso, 'UTC')
const brief1 = () => adsRows().agent_outputs[0].created_at as string

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(adsRows())
  // the industry agent is asked once per browser tab; most tests leave it out
  await page.addInitScript(() => window.sessionStorage.setItem('ap.ads.indAuto', '1'))
})

test('the header, the numbers, the industries banner and the top ads, best first', async ({ page }) => {
  await signIn(page, '/ad-strategist')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ad Strategist')
  const status = page.getByTestId('ads-status')
  await expect(status).toContainText('Last run ' + day(RUN1_AT) + ', 2 days ago')
  await expect(status).toContainText('Runs after each Intel Tracker run')
  await expect(status.getByRole('link', { name: 'Upload ads' })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  await expect(page.getByRole('list', { name: 'What it does' }).getByRole('listitem')).toHaveText([
    'Finds long-running competitor ads',
    'Reads ads you upload',
    'Feeds the ads brief',
  ])
  await expect(page.getByTestId('ads-stats').getByRole('button')).toHaveText(['9ads tracked', '5in a brief', '4still running', '3uploaded by your team', '6advertisers'])
  await expect(tabs(page)).toHaveText(['Top 6', 'All ads 9', 'Uploads 3', 'Takeaways', 'Run library 4', 'Following 2'])
  await expect(page.getByTestId('ind-banner')).toHaveText('3 of 6 advertisers have no industry yet. The agent can work them out from the ads.Suggest themSet by hand')

  // the team's own number from Settings is offered with the usual three
  const pick = page.getByRole('group', { name: 'How many to show' }).getByRole('button')
  await expect(pick).toHaveText(['Top 5', 'Top 6', 'Top 8', 'Top 10'])
  await expect(pick.nth(1)).toHaveAttribute('aria-pressed', 'true')
  // scored Ad Library ads only, at most two per advertiser; the catalog ad comes in as real ones run out
  const cards = page.getByTestId('ad-card')
  await expect(cards).toHaveCount(5)
  expect(await cards.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([
    'Open this ad: Your clients want proof, not promises',
    'Open this ad: The checklist advisors keep',
    'Open this ad: Onboard clients in days, not weeks',
    'Open this ad: Dynamic catalog ad · Example Retail',
    'Open this ad: Stop losing a week to paperwork',
  ])
  await expect(cards.nth(0)).toContainText('84 days running')
  await expect(cards.nth(0)).toContainText('Live')
  await expect(cards.nth(0)).toContainText('Score82')
  await expect(cards.nth(0)).toContainText('Financial advice')
  await expect(cards.nth(4)).toContainText('Stopped')
  await pick.nth(0).click()
  await expect(tabs(page).nth(0)).toHaveText('Top 5')
  await expect(cards).toHaveCount(5)

  await page.getByRole('button', { name: 'How the score works' }).click()
  const how = page.getByRole('dialog', { name: 'How the ad score works' })
  await expect(how.getByTestId('score-how')).toContainText('How long it ran45%Full marks at 12 weeks or more')
  await expect(how.getByTestId('score-how')).toContainText('Reach shown10%Impressions or engagement shown in the Ad Library')
  await how.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(how).toBeHidden()

  // a card opens the ad, and the address names it
  await cards.nth(0).getByRole('button').click()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText('Your clients want proof, not promises')
  await expect(page).toHaveURL('/ad-strategist?ad=' + A(1))
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/ad-strategist')
})

test('All ads: why each ad is in a brief or not, the filters, the sorts and the address', async ({ page }) => {
  await signIn(page, '/ad-strategist?tab=all')
  await expect(rows(page)).toHaveCount(9)
  const first = rows(page).nth(0)
  await expect(first.locator('td')).toHaveText([
    'Your clients want proof, not promisesNorthwind Advisors · Financial adviceIn the brief · proven, still running · 1st of 3 picked',
    'Ad Library',
    '84',
    'Live',
    '82',
    day(RUN1_AT),
    dateText(brief1(), 'UTC'),
    'Ad Library',
  ])
  await expect(first.getByRole('link', { name: 'Ad Library' })).toHaveAttribute('href', LIB(1))
  await expect(rowOf(page, 'Untitled ad').locator('td')).toHaveText([
    'Untitled adOld Mill Advisors · Paperwork servicesUploaded by your team · not in a brief yet',
    'Uploaded',
    'None yet',
    'Uploaded',
    'Not read',
    'Uploads · ' + day(ago(1)),
    'Not used',
    '–',
  ])
  // a library ad switched out of the next brief says so (the old table said so only for uploads)
  await expect(rowOf(page, 'Your first workflow, automated in a week').locator('td').nth(3)).toHaveText('Last seen ' + day(ago(15)) + 'Left out of briefs')
  await expect(rowOf(page, 'Dynamic catalog ad · Example Retail').locator('td').nth(0)).toContainText('Not picked for the short list in the brief of ' + day(brief1()))
  await expect(rowOf(page, 'Paperwork in an afternoon').locator('td').nth(0)).toContainText('In the brief · hand-picked by your team')
  await expect(page.getByText('Select a column to sort by it.')).toBeVisible()

  // the filters combine and stay in the address
  await page.getByRole('button', { name: /^Still running/ }).click()
  await expect(rows(page)).toHaveCount(4)
  await page.getByLabel('Advertiser').selectOption('Northwind Advisors')
  await expect(rows(page)).toHaveCount(2)
  await expect(page).toHaveURL('/ad-strategist?tab=all&st=live&adv=Northwind+Advisors')
  await page.getByLabel('Search ads').fill('proof')
  await expect(rows(page)).toHaveCount(1)
  await expect(page.getByText('Showing 1 of 9 ads.')).toBeVisible()
  await page.getByLabel('Search ads').fill('nothing like this')
  await expect(page.getByText('Nothing matches')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(rows(page)).toHaveCount(9)
  await expect(page).toHaveURL('/ad-strategist?tab=all')

  await expect(page.getByLabel('Industry').locator('option')).toHaveText(['All industries', 'Financial advice', 'Paperwork services', 'Wealth management'])
  await page.getByLabel('Industry').selectOption('Wealth management')
  await expect(rows(page)).toHaveCount(2)
  await page.getByLabel('Industry').selectOption('')
  // the runs, newest first; uploads say so
  await expect(page.getByLabel('Found in').locator('option')).toHaveText([
    'Found in: every run',
    'Uploads · ' + day(ago(1)),
    day(RUN1_AT),
    'Uploads · ' + day(ago(5)),
    day(ago(40)),
  ])
  await page.getByLabel('Found in').selectOption(RUN0)
  await expect(rows(page)).toHaveCount(2)
  await page.getByLabel('Found in').selectOption('')
  await page.getByLabel('Captured in', { exact: true }).selectOption('out')
  await expect(rows(page)).toHaveCount(4)
  await page.getByLabel('Captured in', { exact: true }).selectOption('')

  // sorts: a column sorts by it, again the other way
  const days = page.getByRole('columnheader', { name: /Days running/ })
  await days.getByRole('button').click()
  await expect(days).toHaveAttribute('aria-sort', 'descending')
  await expect(rows(page).nth(0).locator('td').nth(0)).toContainText('Plan your next decade')
  await days.getByRole('button').click()
  await expect(days).toHaveAttribute('aria-sort', 'ascending')
  await expect(page).toHaveURL('/ad-strategist?tab=all&sort=days')
  await page.getByRole('columnheader', { name: /^Ad$/ }).getByRole('button').click()
  await expect(rows(page).nth(0).locator('td').nth(0)).toContainText('Dynamic catalog ad · Example Retail')

  // a number above the tabs opens the list it counts, and a reload keeps the filters
  await page.getByTestId('ads-stats').getByRole('button', { name: /in a brief/ }).click()
  await expect(rows(page)).toHaveCount(5)
  await expect(page).toHaveURL('/ad-strategist?tab=all&cap=in&sort=ad')
  await page.reload()
  await expect(rows(page)).toHaveCount(5)
  await expect(page.getByLabel('Captured in', { exact: true })).toHaveValue('in')
})

test('an ad in full: what to take from it, its score and fit, the briefs it went into, its copy and details', async ({ page }) => {
  await signIn(page, '/ad-strategist?ad=' + A(1))
  const p = panel(page)
  await expect(p.getByRole('heading', { level: 2 })).toHaveText('Your clients want proof, not promises')
  await expect(p).toContainText('Northwind Advisors · Financial advice')
  await expect(p.getByTestId('ad-key').getByRole('listitem')).toHaveText([
    'Opens with “Your clients want proof, not promises”',
    'Offers Free readiness review (free)',
    'Built as Problem -> Proof -> Offer',
    'Proof first: opens with a client result',
    'Scarcity: limited spots',
    'Proof-first openings keep running · ' + day(brief1()),
  ])
  await expect(p.getByTestId('ad-key')).toContainText('It backs this finding in the ads brief:')
  await expect(p).toContainText('OfferFree readiness review · free')
  const score = p.getByTestId('ad-score')
  await expect(score).toContainText('82 out of 100')
  await expect(score.getByRole('listitem')).toHaveText([
    'How long it ran 45% of score45.0 pts84 days running',
    'Still running 35% of score35.0 ptsSeen running in the last 7 days',
    'Repeats 10% of score10.0 ptsSame copy in 2 ads',
    'Reach shown 10% of score10.0 ptsShown',
  ])
  await expect(score).toContainText('The parts add up to 100. The agent stored 82, worked out on the day it pulled the ad.')
  await expect(score).toContainText('This is today’s score.')
  await expect(p.getByTestId('ad-fit')).toHaveText(
    '30Fit with what you follow: 30 out of 100Matches an account you follow. Scored from the Following tab and your company profile.',
  )
  const cap = p.getByTestId('ad-cap')
  await expect(cap).toContainText('Captured in brief')
  await expect(cap.getByRole('listitem')).toHaveText(
    'Advertisement brief of ' +
      dateText(brief1(), 'UTC') +
      ': proven, still running, 84 days, scored 82 for that brief · 1st of 3 picked (3 curated · 2 advertisers · best of each advertiser first, running before stopped). Open the brief →',
  )
  await expect(cap.getByRole('link', { name: 'Open the brief →' })).toHaveAttribute('href', '/briefs?tab=ads&run=' + RUN1)
  await expect(p.getByText('Call to action: Book now')).toBeVisible()
  await p.getByText('Read the rest').click()
  await expect(p.getByText('See the results in a week.')).toBeVisible()
  await p.getByRole('button', { name: 'Copy the copy' }).click()
  await expect(toast(page, 'Copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Your clients want proof, not promises\n\nSee the results in a week.\nBook a free review.\n\nBook now',
  )
  await expect(p.getByTestId('ad-details').locator('dd')).toHaveText([
    'Northwind Advisors',
    'Financial advice',
    'Bottom of funnel',
    day(ago(85)) + ' to ' + day(ago(1)),
    day(RUN1_AT),
    'Meta Ad Library',
  ])
  await expect(p.getByRole('link', { name: 'View in Meta Ad Library' })).toHaveAttribute('href', LIB(1))
  await expect(p.getByRole('link', { name: 'Utilize this ad copy' })).toHaveAttribute('href', LEGACY + '/marketing-generation')

  // in or out of the next ads brief
  const next = p.getByTestId('ad-next')
  await expect(next).toContainText('Used in the ads brief of ' + dateText(brief1(), 'UTC') + '. The Ad Strategist decides if it makes the short list.')
  await next.getByRole('checkbox', { name: 'Use this ad in the next ads brief' }).uncheck()
  await expect(toast(page, 'Left out of the next ads brief')).toBeVisible()
  await expect.poll(async () => (await record(1)).in_brief).toBe(false)
  await expect(next).toContainText('Left out of the next ones until you switch this back on.')
  await expect(p.getByText('Left out of briefs')).toBeVisible()
  await next.getByRole('checkbox').check()
  await expect(toast(page, 'It goes into the next ads brief')).toBeVisible()
  await expect.poll(async () => (await record(1)).in_brief).toBe(true)

  // a score set by hand: 0 to 100, kept on the ad, with a note for AI settings
  await score.getByRole('button', { name: 'Change the score' }).click()
  const d = page.getByRole('dialog', { name: 'Set the score' })
  await d.getByRole('spinbutton', { name: 'Score' }).fill('150')
  await d.getByRole('button', { name: 'Save score' }).click()
  await expect(d.getByRole('alert')).toHaveText('Give a score from 0 to 100.')
  await d.getByRole('spinbutton', { name: 'Score' }).fill('90')
  await d.getByRole('button', { name: 'Save score' }).click()
  await expect(toast(page, 'Score saved: 90 out of 100.')).toBeVisible()
  await expect(d).toBeHidden()
  expect(await record(1)).toMatchObject({ performance_score: 0.9, score_overridden: true })
  expect(await stubRows('agent_feedback')).toEqual([
    expect.objectContaining({
      author: TEAM.email,
      agent: 'ad_strategist',
      target_type: 'performance_score_override',
      target_id: A(1),
      action: 'score_override',
      feedback: 'Score manually set to 90 (was 82)',
    }),
  ])
  await expect(score).toContainText('90 out of 100')
  await expect(score).toContainText('The score was set by hand, so it can differ from the parts above.')

  await p.getByRole('button', { name: 'Close' }).click()
  await expect(p).toBeHidden()
  await expect(page).toHaveURL('/ad-strategist')
})

test('an upload in full, one not read yet, a catalog ad, an ad that is gone and a fit with nothing followed', async ({ page }) => {
  await signIn(page, '/ad-strategist?tab=uploads&ad=' + A(7))
  const p = panel(page)
  await expect(p.getByRole('heading', { level: 2 })).toHaveText('Paperwork in an afternoon')
  await expect(p).toContainText('Uploaded ' + day(ago(5)))
  await expect(p.getByTestId('ad-key').locator('ul').first().getByRole('listitem')).toHaveText(['Opens with the time it saves', 'Shows the checklist on the image'])
  await expect(p.getByTestId('ad-key')).toContainText('The image: A stack of paper shrinking · Text on it: “One afternoon”')
  await expect(p.getByTestId('ad-key')).toContainText('Paperwork in an afternoon · ' + day(ago(10)))
  // an upload has no score, only its fit
  await expect(p.getByTestId('ad-score')).toHaveText('Score0Fit with what you follow: 0 out of 100No match with your Following tab or your market yet. Scored from the Following tab and your company profile.')
  await expect(p.getByTestId('ad-cap').getByRole('listitem')).toContainText(
    'Advertisement brief of ' + dateText(ago(10), 'UTC') + ': hand-picked by your team when the brief was built from uploads.',
  )
  await expect(p.getByTestId('ad-next')).toContainText('Use this upload in the next ads brief')
  await expect(p.getByTestId('ad-next')).toContainText('It goes into the next ones, however old it is.')
  await expect(p.getByTestId('ad-details').locator('dd').last()).toHaveText('Uploaded by qa.teammate')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Open this ad: Untitled ad' }).click()
  await expect(p).toContainText('Not read yet')
  await expect(p.getByTestId('ad-key')).toContainText('Not read yet. Use “Read this ad” below.')
  await expect(p.getByRole('link', { name: 'Read this ad' })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  await page.keyboard.press('Escape')

  await page.goto('/ad-strategist?ad=' + A(5))
  await expect(p.getByText('A dynamic catalog ad. Meta fills in the product for each viewer')).toBeVisible()
  // an offer with no price stored says nothing about one (the old panel called it free)
  await page.goto('/ad-strategist?ad=' + A(4))
  await expect(p).toContainText('OfferAdvisor checklistScore')

  await page.goto('/ad-strategist?ad=93000000-0000-4000-8000-000000000099')
  await expect(toast(page, 'Could not find that ad. It may have been removed.')).toBeVisible()
  await expect(p).toBeHidden()

  // nothing followed: no fit, and the link goes to the Following tab
  await stubSeed({ competitors: [], company_profile: [], ai_settings: adsRows().ai_settings.filter((r) => r.key !== 'ads_follow') })
  await page.goto('/ad-strategist?ad=' + A(1))
  await expect(p.getByTestId('ad-fit')).toHaveText('No fit score yet. Add topics, industries or accounts on the Following tab, or your market in the company profile.')
  await p.getByRole('button', { name: 'Following tab' }).click()
  await expect(p).toBeHidden()
  await expect(page).toHaveURL('/ad-strategist?tab=following')
  await expect(page.getByTestId('fol-accounts')).toContainText('No account has a Facebook page yet')
})

test('Uploads: what they show, the cards, and the ad copy written from them', async ({ page }) => {
  await signIn(page, '/ad-strategist?tab=uploads')
  const o = page.getByTestId('uploads-overview')
  await expect(o).toContainText('3 uploads · 3 in the next ads brief · average fit 0')
  await expect(o).toContainText('Patterns they shareTime savingProof first')
  await expect(o).toContainText('Offers they makePaperwork reviewPlanning session')
  await o.getByRole('button', { name: 'Opens with the time it saves' }).click()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText('Paperwork in an afternoon')
  await page.keyboard.press('Escape')

  await expect(page.getByRole('link', { name: 'Build a brief from these' })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  await expect(page.getByRole('link', { name: 'Write ad copy' })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  await expect(page.getByRole('link', { name: /Upload competitor ads/ })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  const cards = page.getByTestId('ad-card')
  await expect(cards).toHaveCount(3)
  // newest first: the one not read yet, the upload, the swipe file's
  await expect(cards.nth(0)).toContainText('Not read yetUploaded')
  await expect(cards.nth(1)).toContainText('UploadedFit0')
  await expect(cards.nth(2)).toContainText('From Notion')

  const sets = page.getByTestId('copy-sets')
  await expect(sets).toContainText('1 of 1')
  const set = sets.getByTestId('copy-set')
  await expect(set).toContainText('Ad copy from Old Mill2 variants · Facebook · learned from 1 ad' + dateText(ago(4), 'UTC'))
  await set.locator('summary').click()
  await expect(set).toContainText('Key takeawaysLead with the time saved')
  await expect(set).toContainText('Variant ATime back')
  await expect(set).toContainText('How the guidelines shaped it: Kept to plain words, no promises of results.')
  await set.getByRole('button', { name: 'Copy' }).first().click()
  await expect(toast(page, 'Copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Get your Fridays back\n\nWe sort the paperwork so you can see clients.\n\nHeadline: Paperwork, sorted\n\nCTA: Book a call',
  )
  await sets.getByLabel('Search copy').fill('nothing like this')
  await expect(sets).toContainText('0 of 1')
})

test('Takeaways: the five things with the ads behind them, another brief, and the run library', async ({ page }) => {
  await signIn(page, '/ad-strategist?tab=takeaways')
  const t = page.getByTestId('takeaways')
  await expect(t.getByRole('heading', { level: 2 })).toHaveText('Two things working')
  await expect(t).toContainText('From the ads brief of ' + day(brief1()) + ' · select one for its sources')
  const five = page.getByTestId('five').getByRole('button')
  await expect(five).toHaveText([
    '1HookProof-first openings keep runningNorthwind’s proof ad ran 84 days and is still live.1 source →',
    '2OfferChecklists pull downloadsExample Ridge’s checklist ad ran 50 days.1 source →',
  ])
  await expect(page.getByTestId('short-version')).toContainText('Show proof the client can check in a week.')
  await expect(page.getByRole('link', { name: 'Make ads from this' })).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await expect(page.getByRole('link', { name: 'Open the ads brief' })).toHaveAttribute('href', '/briefs?tab=ads&run=' + RUN1)

  await five.nth(0).click()
  const d = page.getByTestId('five-drawer')
  await expect(d.getByRole('heading', { level: 2 })).toHaveText('Proof-first openings keep running')
  await expect(d).toContainText('Ad Strategist · ' + day(brief1()) + ' brief')
  await expect(d).toContainText('What the agent sawNorthwind’s proof ad ran 84 days and is still live.')
  const src = d.getByRole('button', { name: /Your clients want proof/ })
  await expect(src).toContainText('Northwind Advisors · 84 days running · still running')
  await expect(d.getByRole('link', { name: 'Make ads with this' })).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await src.click()
  await expect(d).toBeHidden()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText('Your clients want proof, not promises')
  await page.keyboard.press('Escape')

  // another brief, read on the server: an old one with no snapshot
  const pick = page.getByLabel('Pick an ads brief')
  await expect(pick.locator('option')).toHaveText([day(RUN1_AT) + ' · newest', 'From uploads · ' + day(ago(10)), day(ago(40))])
  await pick.selectOption(RUN0)
  await expect(page).toHaveURL('/ad-strategist?tab=takeaways&brief=' + RUN0)
  await expect(t.getByRole('heading', { level: 2 })).toHaveText('One thing working')
  await expect(page.getByTestId('take-stale')).toContainText('This brief is 40 days old. Refresh it before the next paid draft leans on it.')
  await expect(page.getByTestId('five').getByRole('button')).toHaveText(['1HookStop losing a week to paperwork1 source →'])
  await page.getByTestId('five').getByRole('button').click()
  await expect(page.getByTestId('five-drawer').getByRole('button', { name: /Stop losing a week to paperwork/ })).toContainText('Example Ridge Advisors · 12 days running')
  await page.keyboard.press('Escape')

  // the run library: the brief on screen is marked; a run that did not finish says so
  await tabs(page).nth(4).click()
  const cards = page.getByTestId('run-card')
  await expect(cards).toHaveCount(4)
  await expect(cards.nth(0)).toContainText('Ad Library run' + whenText(RUN1_AT, 'UTC'))
  await expect(cards.nth(0)).toContainText('3 curated · 2 advertisers · best of each advertiser first, running before stopped')
  await expect(cards.nth(0)).toContainText('Latest5new ads3behind the brief2advertisers0.64confidenceLead finding: Proof-first openings keep running')
  await expect(cards.nth(1)).toContainText('Built from uploads')
  await expect(cards.nth(1)).toContainText('0.50confidenceLead finding: Paperwork in an afternoon')
  await expect(cards.nth(2)).toContainText('Did not finish')
  await expect(cards.nth(3)).toContainText('On screen')
  await expect(cards.nth(3)).toContainText('1 curated · 1 advertiser')
  await expect(cards.nth(0).getByRole('link', { name: 'Brief' })).toHaveAttribute('href', '/briefs?tab=ads&run=' + RUN1)
  await cards.nth(3).getByRole('button', { name: 'Its ads' }).click()
  await expect(page).toHaveURL('/ad-strategist?tab=all&brief=' + RUN0 + '&run=' + RUN0)
  await expect(rows(page)).toHaveCount(2)
  await tabs(page).nth(4).click()
  await page.getByTestId('run-card').nth(1).getByRole('button', { name: 'Open takeaways' }).click()
  await expect(page).toHaveURL('/ad-strategist?tab=takeaways&brief=' + CUSTOM)
  await expect(t.getByRole('heading', { level: 2 })).toHaveText('One thing working')
})

test('Following: the accounts, adding one, ads only or ads and posts, stopping, and a page for a posts-only account', async ({ page }) => {
  page.on('dialog', (d) => void (d.message().includes('Example Ridge') || d.message().includes('Stop following Northwind') ? d.accept() : d.dismiss()))
  await signIn(page, '/ad-strategist?tab=following')
  const acc = page.getByTestId('fol-accounts')
  await expect(acc.getByRole('heading', { level: 3 })).toHaveText('Followed for ads 2')
  const list = acc.getByTestId('fol-acc')
  await expect(list.nth(0)).toContainText('Northwind AdvisorsCompanyFinancial adviceFacebook page')
  await expect(list.nth(0).getByRole('link', { name: 'Facebook page' })).toHaveAttribute('href', 'https://www.facebook.com/northwind.advisors')
  await expect(list.nth(1)).toContainText('Example Ridge AdvisorsCompanyWealth management')
  await expect(list.nth(1).getByText('Wealth management')).toHaveAttribute('title', 'Suggested by the agent')
  await expect(list.nth(0).getByRole('radio', { name: 'Ads only' })).toHaveAttribute('aria-checked', 'true')
  await expect(list.nth(1).getByRole('radio', { name: 'Ads and posts' })).toHaveAttribute('aria-checked', 'true')

  // a page that is not one is refused, and what was typed stays
  await acc.getByRole('button', { name: 'Add an account' }).click()
  const add = page.getByTestId('add-account')
  await expect(add.getByLabel('Name')).toBeFocused()
  await add.getByLabel('Name').fill('Example Coach')
  await add.getByLabel(/Facebook page/).fill('not a page!')
  await add.getByRole('button', { name: 'Follow' }).click()
  await expect(add.getByRole('alert')).toHaveText('That does not look like a Facebook page. Paste the page link, for example facebook.com/their-page.')
  await expect(add.getByLabel('Name')).toHaveValue('Example Coach')
  await expect(add.getByRole('link', { name: 'Find them in the Meta Ad Library' })).toHaveAttribute('href', libSearch('Example Coach'))
  await add.getByLabel(/Facebook page/).fill('https://www.facebook.com/example.coach')
  await add.getByRole('radio', { name: 'Person or influencer' }).click()
  await add.getByRole('radiogroup', { name: 'Follow for' }).getByRole('radio', { name: 'Ads and posts' }).click()
  await add.getByRole('button', { name: 'Follow' }).click()
  await expect(toast(page, 'Example Coach is followed. The next run pulls their ads.')).toBeVisible()
  await expect(add).toBeHidden()
  expect((await stubRows<Record<string, unknown>>('competitors')).find((r) => r.name === 'Example Coach')).toMatchObject({
    meta_page_id: 'example.coach',
    follow_kind: 'person',
    follow_for: 'both',
    status: 'approved',
    source: 'manual',
    added_by: TEAM.email,
  })
  await expect(acc.getByRole('heading', { level: 3 })).toHaveText('Followed for ads 3')

  await list.nth(0).getByRole('radio', { name: 'Ads and posts' }).click()
  await expect(toast(page, 'The Intel Tracker reads Northwind Advisors’s posts too from the next run.')).toBeVisible()
  expect((await competitor(CO(1))).follow_for).toBe('both')
  await list.nth(0).getByRole('radio', { name: 'Ads only' }).click()
  await expect(toast(page, 'Northwind Advisors is followed for ads only. The Intel Tracker leaves them out from the next run.')).toBeVisible()
  expect((await competitor(CO(1))).follow_for).toBe('ads')

  // stopping asks first: ads and posts stop their ads only, ads only stops following
  await list.nth(1).getByRole('button', { name: 'Stop reading ads' }).click()
  await expect(toast(page, 'Stopped. Example Ridge Advisors’s ads are no longer pulled.')).toBeVisible()
  expect(await competitor(CO(2))).toMatchObject({ follow_for: 'posts', meta_page_id: '123456789', status: 'approved' })
  await list.nth(0).getByRole('button', { name: 'Stop following' }).click()
  await expect(toast(page, 'Stopped following Northwind Advisors.')).toBeVisible()
  expect((await competitor(CO(1))).status).toBe('denied')
  await expect(acc.getByRole('heading', { level: 3 })).toHaveText('Followed for ads 1')

  // posts only: pull their ads too, or add the page they lack
  const off = page.getByTestId('fol-posts-only')
  await off.locator('summary').click()
  await expect(off.getByTestId('fol-off')).toHaveCount(3)
  const contoso = off.locator('[data-id="' + CO(4) + '"]')
  await contoso.getByRole('button', { name: 'Pull their ads too' }).click()
  await expect(toast(page, 'The next run pulls Contoso Planning’s ads too.')).toBeVisible()
  expect((await competitor(CO(4))).follow_for).toBe('both')
  const fab = off.locator('[data-id="' + CO(3) + '"]')
  await expect(fab.getByRole('link', { name: 'Find in the Ad Library' })).toHaveAttribute('href', libSearch('Fabrikam Insights'))
  await fab.getByLabel('Facebook page for Fabrikam Insights').fill('facebook.com/fabrikam')
  await fab.getByRole('button', { name: 'Add page' }).click()
  await expect(toast(page, 'Page added. The next run pulls Fabrikam Insights’s ads.')).toBeVisible()
  expect((await competitor(CO(3))).meta_page_id).toBe('fabrikam')
  await expect(acc.getByRole('heading', { level: 3 })).toHaveText('Followed for ads 3')
})

test('Following: the searches and filters, saved for the next run', async ({ page }) => {
  await signIn(page, '/ad-strategist?tab=following')
  const f = page.getByTestId('fol-filters')
  const status = f.getByTestId('fol-status')
  await expect(status).toHaveText('The next run follows these.')
  await expect(f.getByRole('button', { name: 'Save' })).toBeDisabled()
  const kw = f.getByRole('textbox', { name: 'e.g. AI automation' })
  await kw.fill('ai automation')
  await kw.press('Enter')
  await expect(status).toHaveText('“ai automation” is on the list already.')
  await kw.fill('Wealth advisors')
  await kw.press('Enter')
  await expect(status).toHaveText('Not saved yet.')
  await f.getByRole('button', { name: 'Remove client onboarding' }).click()
  await f.getByRole('button', { name: 'Video' }).click()
  await expect(f.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-pressed', 'true')
  await f.getByRole('radio', { name: 'Running or stopped' }).click()
  await f.getByRole('combobox').selectOption('CA')
  await f.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved.')).toBeVisible()
  await expect(status).toHaveText('Saved. The next run follows these.')
  expect(await setting('ads_follow')).toMatchObject({
    keywords: ['AI automation', 'Wealth advisors'],
    industries: ['Wealth management'],
    types: ['image', 'video'],
    active: 'all',
    country: 'CA',
    updated_by: TEAM.email,
  })
  // a list at its limit takes no more
  const ind = f.getByRole('textbox', { name: 'e.g. Wealth management' })
  for (let i = 2; i <= 8; i++) {
    await ind.fill('Industry ' + i)
    await ind.press('Enter')
  }
  await expect(f.getByRole('button', { name: 'Add' }).nth(1)).toBeDisabled()
})

test('industries: the banner asks the agent, its answers are kept, and the window saves only what changed', async ({ page }) => {
  await stubHook('e3-ad-industries', 200, { ok: true, industries: { 'Example Retail': 'Online retail', 'Harbor Example Group': 'Workflow ‒ automation' } })
  await signIn(page, '/ad-strategist')
  const banner = page.getByTestId('ind-banner')
  await banner.getByRole('button', { name: 'Suggest them' }).click()
  await expect(banner).toContainText('1 of 6 advertisers has no industry yet. The agent suggested 2 industries. Change any that are off.')
  const sent = await hooks('e3-ad-industries')
  expect(sent).toHaveLength(1)
  expect(sent[0].body.advertisers).toEqual([
    { name: 'Example Retail', site: '', ads: [] },
    { name: 'Harbor Example Group', site: '', ads: ['Your first workflow, automated in a week · Workflow sprint'] },
    { name: 'Contoso Planning', site: '', ads: ['Plan your next decade · Planning session'] },
  ])
  expect(await setting('ad_industries_ai')).toEqual({
    'example ridge advisors': 'Wealth management',
    'old mill advisors': 'Paperwork services',
    'example retail': 'Online retail',
    'harbor example group': 'Workflow, automation',
  })

  // the window: a suggestion left alone stays the agent's; an emptied box takes the agent's away too
  await banner.getByRole('button', { name: 'Set by hand' }).click()
  const d = page.getByRole('dialog', { name: 'What industry is each advertiser in?' })
  await expect(d.getByRole('textbox')).toHaveCount(6)
  await expect(d.getByLabel('Example Retail')).toHaveValue('Online retail')
  await expect(d.getByText('Suggested by the agent')).toHaveCount(4)
  await d.getByLabel('Contoso Planning').fill('Financial planning')
  await d.getByLabel('Old Mill Advisors').fill('')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved. Industries show on every advertisement.')).toBeVisible()
  expect(await setting('ad_industries')).toEqual({ 'northwind advisors': 'Financial advice', 'contoso planning': 'Financial planning' })
  expect(await setting('ad_industries_ai')).toEqual({
    'example ridge advisors': 'Wealth management',
    'example retail': 'Online retail',
    'harbor example group': 'Workflow, automation',
  })
  await expect(banner).toContainText('1 of 6 advertisers has no industry yet.')
  await tabs(page).nth(5).click()
  await expect(page.getByTestId('ind-list').getByRole('listitem')).toHaveText([
    'Contoso PlanningFinancial planningSet by you',
    'Example RetailOnline retailSuggested by the agent',
    'Example Ridge AdvisorsWealth managementSuggested by the agent',
    'Harbor Example GroupWorkflow, automationSuggested by the agent',
    'Northwind AdvisorsFinancial adviceSet by you',
    'Old Mill AdvisorsNot worked out yet',
  ])

  // the workflow switched off
  await stubHook('e3-ad-industries', 404, { code: 404, message: 'not registered' })
  await page.getByTestId('fol-industries').getByRole('button', { name: 'Suggest the missing ones' }).click()
  await expect(page.getByTestId('fol-industries')).toContainText('The industry agent is not switched on in n8n yet.')
})

test('the industry agent is asked once per browser tab when an advertiser has none', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, timezoneId: 'UTC' })
  await serveLogo(page)
  await signIn(page, '/ad-strategist')
  await expect(page.getByTestId('ind-banner')).toContainText('The agent could not tell the industry of these advertisers. Set them by hand.')
  expect(await hooks('e3-ad-industries')).toHaveLength(1)
  await page.reload()
  await expect(page.getByTestId('ind-banner')).toContainText('3 of 6 advertisers have no industry yet. The agent can work them out from the ads.')
  expect(await hooks('e3-ad-industries')).toHaveLength(1)
  await page.close()
})

test('Run now: a run starts and the header says so; a workflow that is off says so', async ({ page }) => {
  await signIn(page, '/ad-strategist')
  await page.getByRole('button', { name: 'Run now' }).click()
  const d = page.getByRole('dialog', { name: 'Run the Ad Strategist' })
  await expect(d.getByTestId('run-msg')).toHaveText('It also runs after each Intel Tracker run.')
  await expect(d.getByRole('link', { name: 'Pick ads' })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  await d.getByRole('button', { name: 'Start a run' }).click()
  await expect(toast(page, 'Ad Strategist started. The new ads brief lands in about 10 minutes.')).toBeVisible()
  await expect(d).toBeHidden()
  const sent = await hooks('ad-strategist-run')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ requested_by: TEAM.email, top: 6, behind: 24, per_advertiser: 4 })
  expect(((await setting('ad_runs')) as { runs: Record<string, unknown>[] }).runs).toEqual([
    expect.objectContaining({ run_id: 'agent2_stub', by: TEAM.email, cascade: false }),
  ])
  await expect(page.getByTestId('ads-status')).toContainText('A run started just now')

  await stubHook('ad-strategist-run', 404, { code: 404, message: 'not registered' })
  await page.getByRole('button', { name: 'Run now' }).click()
  await d.getByRole('button', { name: 'Start a run' }).click()
  await expect(d.getByRole('alert')).toHaveText(
    'Starting a full run from here is not switched on in n8n yet. It still runs on its schedule, and you can build a brief from your uploads now.',
  )
})

test('the briefs page opens an ad in its panel here, and every ad from a run', async ({ page }) => {
  await signIn(page, '/briefs?tab=ads')
  const ev = page.getByTestId('brief-evidence').getByTestId('ev-row')
  await expect(ev.nth(0).getByRole('link', { name: 'P1' })).toHaveAttribute('href', '/ad-strategist?ad=' + A(1))
  await ev.nth(0).getByRole('link', { name: 'P1' }).click()
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText('Your clients want proof, not promises')
  await page.goBack()
  await page.getByRole('link', { name: 'See every ad from this run, and why each one was picked or not' }).click()
  await expect(page).toHaveURL('/ad-strategist?tab=all&run=' + RUN1 + '&sort=cap')
  await expect(rows(page)).toHaveCount(5)
  await expect(rows(page).nth(0).locator('td').nth(0)).toContainText('Your clients want proof, not promises')
  // a run whose ads are not among those read shows the ads in a brief
  await page.goto('/ad-strategist?tab=all&run=agent2_none&sort=cap')
  await expect(page).toHaveURL('/ad-strategist?tab=all&cap=in&sort=cap')
  await expect(rows(page)).toHaveCount(5)
})

test('a page left and come back to keeps its tab and filters; a link that asks for something else wins', async ({ page }) => {
  await signIn(page, '/ad-strategist?tab=all&st=live')
  await expect(rows(page)).toHaveCount(4)
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Intel Tracker' }).click()
  await expect(page).toHaveURL('/intel-tracker')
  await nav.getByRole('link', { name: 'Ad Strategist' }).click()
  await expect(page).toHaveURL('/ad-strategist?tab=all&st=live')
  await expect(rows(page).filter({ visible: true })).toHaveCount(4)
  // a link that names a run (the briefs page's) shows that run's ads, whatever the page showed before
  await nav.getByRole('link', { name: 'Market Intelligence Briefs' }).click()
  await page.getByRole('tab', { name: /^Ads/ }).click()
  await page.getByRole('link', { name: 'See every ad from this run, and why each one was picked or not' }).click()
  await expect(page).toHaveURL('/ad-strategist?tab=all&run=' + RUN1 + '&sort=cap')
  await expect(rows(page).filter({ visible: true })).toHaveCount(5)
  await expect(page.getByRole('button', { name: /^Still running/ })).toHaveAttribute('aria-pressed', 'false')
})

test('no ads yet: each tab says what to do', async ({ page }) => {
  await stubSeed({ ad_records: [], creative_briefs: [], agent_outputs: [], runs: [] })
  await signIn(page, '/ad-strategist')
  await expect(page.getByTestId('ads-status')).toContainText('No runs yet')
  await expect(page.getByTestId('ads-stats').getByRole('button')).toHaveText(['0ads tracked', '0in a brief', '0still running', '0uploaded by your team', '0advertisers'])
  await expect(page.getByTestId('ind-banner')).toHaveCount(0)
  await expect(page.getByText('No scored ads yet')).toBeVisible()
  await tabs(page).nth(1).click()
  await expect(page.getByText('No ads yet', { exact: true })).toBeVisible()
  await tabs(page).nth(2).click()
  await expect(page.getByTestId('uploads-overview')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Upload competitor ads/ })).toBeVisible()
  await tabs(page).nth(3).click()
  await expect(page.getByText('No ads brief yet')).toBeVisible()
  await tabs(page).nth(4).click()
  await expect(page.getByTestId('ads-panel').getByText('No runs yet', { exact: true })).toBeVisible()
  await tabs(page).nth(5).click()
  await expect(page.getByTestId('fol-industries')).toContainText('No ads yet, so no advertisers.')
})

test('a phone: every tab and the panel fit the width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/ad-strategist')
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  for (let i = 0; i < 6; i++) {
    await tabs(page).nth(i).click()
    await expect(page.getByTestId('ads-panel')).toBeVisible()
    expect(await wide(), 'tab ' + i).toBeLessThanOrEqual(0)
  }
  await page.goto('/ad-strategist?ad=' + A(1))
  await expect(panel(page)).toBeVisible()
  expect(await panel(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
})
