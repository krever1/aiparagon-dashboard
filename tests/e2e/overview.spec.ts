import { type Page, expect, test } from '@playwright/test'
import { dayText } from '../../src/components/ui/local-date'
import { todayText, whenText } from '../../src/lib/touchpoint/today'
import { IMG } from './approvals-fixtures'
import { LEGACY, serveLogo, signIn, stubReset, stubSeed } from './helpers'
import { overviewRows } from './overview-fixtures'

// The Pipeline Overview: the hello line, what needs you, the six agents with their numbers, this week's lead, the newest
// campaign, what the agents know about the team, the newest draft and runs, How it fits together, and Customize (cards
// moved and hidden in this browser), on the made-up rows in tests/e2e/overview-fixtures.ts.

test.use({ timezoneId: 'UTC' })

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const order = (page: Page) => page.locator('[data-testid="overview"] > div.grid > section').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
const DEFAULT = ['needs-you', 'quick-start', 'agents', 'lead', 'camp', 'voice', 'tl', 'runs']

let rows: ReturnType<typeof overviewRows>

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await page.route(IMG + '**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  rows = overviewRows()
  await stubSeed(rows)
})

const at = (agent: string) => rows.runs.find((r) => r.agent === agent)!.finished_at!

test('the hello line, what needs you, and the six agents with their numbers', async ({ page }) => {
  await signIn(page, '/engine-3')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), QA\.$/)
  await expect(page.getByTestId('overview-date')).toHaveText('Pipeline · Overview · ' + todayText(new Date(), 'UTC'))
  await expect(page.getByTestId('overview-need')).toHaveText('16 things need you. The Intel Tracker last ran ' + whenText(at('intel_tracker'), 'UTC') + '.')
  await expect(page.getByTestId('needs-n')).toHaveText('16')
  await expect(page.getByRole('button', { name: 'Take the tour' })).toBeVisible()

  const tiles = page.getByTestId('agent-tile')
  await expect(tiles).toHaveCount(6)
  const organic = rows.agent_outputs.find((o) => o.run_id === 'intel_run_new' && o.output_type === 'intel_brief')!.created_at
  const ads = rows.creative_briefs[0].created_at
  const newestDraft = rows.agent_outputs.find((o) => o.output_type === 'content_draft')!.created_at
  const newestCamp = rows.agent_outputs.filter((o) => o.agent === 'low_ticket_content').map((o) => o.created_at).sort().reverse()[0]
  const read = rows.agent_outputs.find((o) => o.output_type === 'strategy_insights')!.created_at
  await expect(tiles.nth(0)).toHaveText('Intel Tracker12posts6 replies to approveLast run ' + whenText(at('intel_tracker'), 'UTC'))
  await expect(tiles.nth(0)).toHaveAttribute('href', '/intel-tracker')
  await expect(tiles.nth(0).locator('[data-dot]')).toHaveAttribute('data-dot', 'good')
  await expect(tiles.nth(1)).toHaveText('Ad Strategist5adsAds brief of ' + dayText(ads, 'UTC') + 'Last run ' + dayText(at('ad_strategist'), 'UTC') + ', 12 days ago')
  await expect(tiles.nth(1)).toHaveAttribute('title', 'Last ran 12 days ago')
  await expect(tiles.nth(1).locator('[data-dot]')).toHaveAttribute('data-dot', 'warn')
  await expect(tiles.nth(2)).toHaveText(
    'Market Intelligence Briefs2to reviewApprove before they shape draftsOrganic ' + dayText(organic, 'UTC') + ' · Ads ' + dayText(ads, 'UTC'),
  )
  await expect(tiles.nth(2)).toHaveAttribute('href', '/briefs')
  await expect(tiles.nth(3)).toHaveText('Content Transformation3drafts2 to checkLatest ' + dayText(newestDraft, 'UTC'))
  await expect(tiles.nth(4)).toHaveText('Marketing Generation4campaignsAds and thought leadershipLatest campaign ' + dayText(newestCamp, 'UTC'))
  await expect(tiles.nth(5)).toHaveText('Ad Testing3resultsLogged by your teamStrategy read ' + dayText(read, 'UTC'))
  await tiles.nth(2).click()
  await expect(page).toHaveURL(/\/briefs$/)
})

test('this week’s lead, the newest campaign, what the agents know, the newest draft and the runs', async ({ page }) => {
  await signIn(page, '/engine-3')
  const lead = page.getByTestId('lead')
  await expect(lead.getByRole('heading', { level: 3 })).toHaveText('Onboarding is the theme')
  await expect(lead).toContainText('Client experience')
  await expect(lead).toContainText('Three firms you follow posted about slow onboarding')
  const notes = lead.getByRole('group', { name: 'The five notes' }).getByRole('button')
  await expect(notes).toHaveText(['1', '2', '3'])
  await notes.nth(1).click()
  await expect(notes.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(lead.getByRole('heading', { level: 3 })).toHaveText('Fee talk is up')
  await expect(lead).toContainText('Pricing')
  const organic = rows.agent_outputs.find((o) => o.run_id === 'intel_run_new' && o.output_type === 'intel_brief')!.created_at
  await expect(lead).toContainText('From the brief of ' + dayText(organic, 'UTC'))
  await expect(lead.getByRole('link', { name: 'Write a post' })).toHaveAttribute('href', LEGACY + '/content-transformation')
  await expect(lead.getByRole('link', { name: 'Open the brief' })).toHaveAttribute('href', '/briefs?run=intel_run_new')

  const camp = page.getByTestId('camp')
  await expect(camp.getByRole('img')).toHaveCount(3)
  await expect(camp.getByRole('img').first()).toHaveAttribute('alt', 'Checklist')
  await expect(camp).toContainText('Onboarding Audit')
  const newestCamp = rows.agent_outputs.filter((o) => o.agent === 'low_ticket_content').map((o) => o.created_at).sort().reverse()[0]
  await expect(camp).toContainText(dayText(newestCamp, 'UTC') + ' · Book a call')
  await expect(camp).toContainText('1 of 3 approved')
  await expect(camp.getByRole('link', { name: 'Open' })).toHaveAttribute('href', LEGACY + '/marketing-generation')

  const voice = page.getByTestId('voice')
  await expect(voice).toContainText('6of 8 set')
  await expect(voice).toContainText('Missing: ideal client, what makes you different. Drafts sound more like you once these are in.')
  await expect(voice.getByRole('link', { name: 'Finish setup' })).toHaveAttribute('href', LEGACY + '/company-profile')

  const tl = page.getByTestId('tl')
  const draft = rows.agent_outputs.find((o) => o.output_type === 'content_draft')!.created_at
  await expect(tl).toContainText('Why onboarding stalls')
  await expect(tl).toContainText('Thought leadership · ' + dayText(draft, 'UTC'))
  await expect(tl).toContainText('Most firms lose a week to onboarding.')
  await expect(tl).toContainText('To check')

  const runs = page.getByTestId('run')
  await expect(runs).toHaveCount(4)
  await expect(runs.nth(0)).toContainText('Marketing Generation')
  await expect(runs.nth(0)).toContainText('Running')
  await expect(runs.nth(1)).toContainText('Content Transformation')
  await expect(runs.nth(1)).toContainText('Failed')
  await expect(runs.nth(2)).toContainText('Intel Tracker')
  await expect(runs.nth(2)).toContainText('Done')
})

test('nothing yet: every card says so, and the hello line has nothing waiting', async ({ page }) => {
  await stubSeed({
    agent_outputs: [], creative_briefs: [], engagement_drafts: [], agent_feedback: [], content_requests: [], funnel_packages: [], runs: [], content_results: [],
    ad_records: [], intel_items: [], brand_voice: [], company_profile: [], competitors: [], ai_settings: [],
  })
  await signIn(page, '/engine-3')
  await expect(page.getByTestId('overview-need')).toHaveText('Nothing needs you right now.')
  await expect(page.getByTestId('needs-you')).toContainText('You are all caught up')
  const tiles = page.getByTestId('agent-tile')
  await expect(tiles.nth(0)).toHaveText('Intel Tracker0postsReads the people and topics you followNot run yet')
  await expect(tiles.nth(1)).toHaveText('Ad Strategist0adsNo ads brief yetNot run yet')
  await expect(tiles.nth(2)).toHaveText('Market Intelligence Briefs0to reviewApprove before they shape draftsNo briefs yet')
  await expect(tiles.nth(3)).toHaveText('Content Transformation0draftsFrom your own materialNo drafts yet')
  await expect(tiles.nth(5)).toHaveText('Ad Testing0resultsLog your first resultNo strategy read yet')
  await expect(tiles.nth(0).locator('[data-dot]')).toHaveCount(0)
  await expect(page.getByTestId('lead')).toContainText('No organic brief yet')
  await expect(page.getByTestId('lead').getByRole('link', { name: 'Open the Intel Tracker' })).toHaveAttribute('href', '/intel-tracker')
  await expect(page.getByTestId('camp')).toContainText('No campaign yet')
  await expect(page.getByTestId('voice')).toContainText('0of 8 set')
  await expect(page.getByTestId('tl')).toContainText('No drafts yet')
  await expect(page.getByTestId('runs')).toContainText('No runs yet')
})

test('How it fits together: the six steps, each opening its page', async ({ page }) => {
  await signIn(page, '/engine-3')
  await page.getByRole('button', { name: 'How it fits together' }).click()
  const d = page.getByRole('dialog', { name: 'How it fits together' })
  const steps = d.getByTestId('how-steps').getByRole('listitem')
  await expect(steps).toHaveCount(6)
  await expect(steps.nth(2)).toContainText('Both agents write a brief. 2 briefs waiting for your review.')
  await expect(d.getByRole('link')).toHaveText(['Company profile', 'Intel Tracker', 'Briefs', 'Content Transformation', 'Approvals', 'Ad Testing'])
  await d.getByRole('link', { name: 'Intel Tracker' }).click()
  await expect(page).toHaveURL(/\/intel-tracker$/)
})

test('Customize: cards move and hide in this browser, stay that way after a reload, and Reset puts them back', async ({ page }) => {
  await signIn(page, '/engine-3')
  await expect.poll(() => order(page)).toEqual(DEFAULT)
  await expect(page.getByTestId('card-controls')).toHaveCount(0)
  await page.getByRole('button', { name: 'Customize' }).click()
  await expect(page.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('customize-hint')).toContainText('Move cards earlier or later, or hide the ones you do not use.')
  await expect(page.getByTestId('card-controls')).toHaveCount(8)
  await expect(page.getByRole('button', { name: 'Move Needs you earlier' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Move Recent runs later' })).toBeDisabled()
  await page.getByRole('button', { name: 'Move Quick start earlier' }).click()
  await expect.poll(() => order(page)).toEqual(['quick-start', 'needs-you', 'agents', 'lead', 'camp', 'voice', 'tl', 'runs'])
  await page.getByRole('button', { name: 'Hide Recent runs' }).click()
  await expect(page.getByTestId('runs')).toHaveCount(0)
  await expect(page.getByTestId('customize-hint').getByRole('button', { name: 'Recent runs' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('card-controls')).toHaveCount(0)

  await page.reload()
  await expect.poll(() => order(page)).toEqual(['quick-start', 'needs-you', 'agents', 'lead', 'camp', 'voice', 'tl'])
  await page.getByRole('button', { name: 'Customize' }).click()
  await page.getByTestId('customize-hint').getByRole('button', { name: 'Recent runs' }).click()
  await expect(page.getByTestId('runs')).toBeVisible()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => order(page)).toEqual(DEFAULT)
})

test('a phone: one column, nothing runs off the side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/engine-3')
  await expect(page.getByTestId('agent-tile')).toHaveCount(6)
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && e.getClientRects().length)
      .slice(0, 8)
      .map((e) => e.tagName + '.' + String(e.className).slice(0, 80) + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.textContent ?? '').slice(0, 40)),
  )
  expect(wide).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
