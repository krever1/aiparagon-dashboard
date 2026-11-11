import { type Page, expect, test } from '@playwright/test'
import { LEGACY, serveLogo, signIn, stubReset, stubSeed } from './helpers'
import { RID, approvalRows } from './approvals-fixtures'

// Today: the hello line, what needs you (Approvals' list less this browser's skips), the quick starts, the five
// products, the newest runs and sign-ups, and a fresh read every 10 minutes. On made-up rows; the page's clock is set to
// a Wednesday morning where the times on screen matter.

test.use({ timezoneId: 'UTC' })

const T = Date.parse('2026-11-11T09:30:00Z')
const H = 36e5
const D = 864e5
const at = (ms: number) => new Date(T - ms).toISOString()
const card = (page: Page, id: string) => page.getByTestId(id)
const lineOf = (page: Page, product: string) => page.locator(`[data-testid="product"][data-product="${product}"] [data-testid="product-line"]`)
const OUT = 'Opens in the current dashboard'

function rows() {
  return {
    ...approvalRows(),
    e1_leads: [
      { email: 'sam.weak@example.com', prospect_name: 'Sam Weak', company_name: 'Weak Example Co', fit_rating: 'Weak', updated_at: at(D) },
      { email: 'ria.review@example.com', prospect_name: 'Ria Review', company_name: 'Review Example LLC', fit_rating: 'Strong', stage: 'review', updated_at: at(2 * D) },
      { email: 'nia.new@example.com', prospect_name: 'Nia New', company_name: 'New Example Partners', fit_rating: 'Moderate', updated_at: at(3 * D) },
    ],
    landing_pages: [
      { id: '80000000-0000-4000-8000-000000000001', title: 'Onboarding audit', status: 'live', updated_at: at(D) },
      { id: '80000000-0000-4000-8000-000000000002', title: 'Draft page', status: 'draft', updated_at: at(D) },
    ],
    runs: [
      { id: 'run-1', agent: 'intel_tracker', status: 'success', started_at: at(H), finished_at: at(50 * 60e3) },
      { id: 'run-2', agent: 'ad_strategist', status: 'running', started_at: at(20 * 60e3), finished_at: null },
      { id: 'run-3', agent: 'funnel_builder', status: 'error', started_at: at(2 * H), finished_at: at(2 * H - 60e3) },
      { id: 'run-4', agent: 'low_ticket_content', status: 'success', started_at: at(D), finished_at: at(D - 5 * 60e3) },
      { id: 'run-5', agent: 'content_generation', status: 'success', started_at: at(3 * D), finished_at: at(3 * D) },
      // no start time: it goes last, not first
      { id: 'run-6', agent: 'intel_tracker', status: 'success', started_at: null, finished_at: null, run_date: '2026-11-01' },
    ],
    lp_signups: [
      { id: 'su-1', page_id: '80000000-0000-4000-8000-000000000001', name: 'Pat Example', email: 'pat@example.org', created_at: at(5 * 60e3) },
      { id: 'su-2', page_id: '80000000-0000-4000-8000-000000000001', name: '', email: 'casey@example.org', created_at: at(3 * H) },
      { id: 'su-3', page_id: '80000000-0000-4000-8000-000000000002', name: 'Jordan Sample', email: 'jordan@example.org', created_at: at(30 * H) },
      { id: 'su-4', page_id: null, name: 'Robin Test', email: 'robin@example.org', created_at: at(4 * D) },
      { id: 'su-5', page_id: null, name: 'Too Old', email: 'old@example.org', created_at: at(10 * D) },
    ],
  }
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(rows())
})

test('the hello line, what needs you, and where each thing opens', async ({ page }) => {
  await page.clock.install({ time: new Date(T) })
  await signIn(page, '/today')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Good morning, QA.')
  await expect(page.getByTestId('today-date')).toHaveText('Touchpoint · Wednesday 11 November')
  await expect(page.getByTestId('today-need')).toHaveText('10 things need you.')

  const needs = card(page, 'needs-you')
  await expect(needs.getByTestId('needs-n')).toHaveText('10')
  await expect(needs).toContainText('waiting for you')
  await expect(needs.getByRole('link', { name: '2 briefs' })).toHaveAttribute('href', '/approvals?tab=briefs')
  await expect(needs.getByRole('link', { name: '6 replies' })).toHaveAttribute('href', '/approvals?tab=replies')
  // Ria (in Client review, no review brief) and Nia (nothing yet); Sam is a weak fit
  await expect(needs.getByRole('link', { name: '2 leads' })).toHaveAttribute('href', '/approvals?tab=leads')
  const next = needs.getByRole('list', { name: 'Next up' }).getByRole('link')
  await expect(next).toHaveText(['Organic briefBrief', 'Ads briefBrief', 'Reply to Northwind AdvisorsReply'])
  await expect(next.first()).toHaveAttribute('href', '/briefs?run=intel_run_new')
  await expect(next.first()).not.toHaveAttribute('title', OUT)
  await expect(next.nth(2)).toHaveAttribute('href', '/approvals?tab=replies&review=' + encodeURIComponent('reply:' + RID(1)))
  await expect(needs).toContainText('Nothing posts until you approve it.')

  // a reply opens in its window on Approvals, once
  await next.nth(2).click()
  const dlg = page.getByRole('dialog', { name: 'Reply to Northwind Advisors' })
  await expect(dlg).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)
  await expect(page).toHaveURL(/\/approvals\?tab=replies$/)

  await page.goto('/today')
  await card(page, 'needs-you').getByRole('link', { name: 'Start reviewing' }).click()
  await expect(page).toHaveURL(/\/approvals$/)
})

test('what is skipped on Approvals is left out of Today, in this browser', async ({ page }) => {
  await signIn(page, '/approvals')
  await page.locator(`[data-testid="approval"][data-key="reply:${RID(1)}"]`).getByRole('button', { name: 'Skip' }).click()
  await page.locator('[data-testid="approval"][data-key="brief:intel_tracker:intel_run_new"]').getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click()
  await expect(page.getByTestId('today-need')).toHaveText('8 things need you.')
  await expect(card(page, 'needs-you').getByTestId('needs-n')).toHaveText('8')
  await expect(card(page, 'needs-you').getByRole('link', { name: '1 brief' })).toBeVisible()
  await expect(card(page, 'needs-you').getByRole('link', { name: '5 replies' })).toBeVisible()
  await expect(lineOf(page, 'touchpoint')).toHaveText('8 things waiting for you')
  // the briefs waiting are counted for Pipeline whether skipped or not, as before
  await expect(lineOf(page, 'pipeline')).toHaveText('2 briefs to review · 1 live landing page')
})

test('quick starts, the five products, the newest runs and sign-ups', async ({ page }) => {
  await page.clock.install({ time: new Date(T) })
  await signIn(page, '/today')

  const quick = card(page, 'quick-start').getByRole('link')
  await expect(quick).toHaveText([
    'Run Catalyst for a leadCatalyst · Lead pipeline',
    'Make an ad campaignPipeline · Marketing Generation',
    'Turn content into a postPipeline · Content Transformation',
    'Put a landing page livePipeline · Landing pages',
  ])
  await expect(quick.first()).toHaveAttribute('href', '/lead-pipeline?run=new')
  await expect(quick.nth(1)).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await expect(quick.nth(2)).toHaveAttribute('href', LEGACY + '/content-transformation')
  await expect(quick.nth(3)).toHaveAttribute('href', LEGACY + '/landing-pages')
  await expect(quick.nth(3)).toHaveAttribute('title', OUT)

  await expect(lineOf(page, 'touchpoint')).toHaveText('10 things waiting for you')
  // the leads Approvals lists: not a weak fit, their next document not written
  await expect(lineOf(page, 'catalyst')).toHaveText('3 leads · 2 waiting on a next stage')
  await expect(lineOf(page, 'canvas')).toHaveText('Lead documents and call write-ups')
  await expect(lineOf(page, 'pipeline')).toHaveText('2 briefs to review · 1 live landing page')
  await expect(lineOf(page, 'atlas')).toHaveText('Knowledge base, files, company profile and templates')
  const touch = page.locator('[data-testid="product"][data-product="touchpoint"]').getByRole('link')
  await expect(touch).toHaveText(['Today', 'Approvals', 'Tasks'])
  await expect(touch.nth(2)).toHaveAttribute('href', '/tasks')
  await expect(page.locator('[data-testid="product"][data-product="pipeline"]').getByRole('link')).toHaveCount(9)

  const runs = card(page, 'runs').getByTestId('run')
  await expect(runs).toHaveText([
    'Ad StrategistWed 11 Nov, 9:10 AMRunning',
    'Intel TrackerWed 11 Nov, 8:40 AMDone',
    'funnel builderWed 11 Nov, 7:31 AMFailed',
    'Marketing GenerationTue 10 Nov, 9:35 AMDone',
  ])
  await expect(card(page, 'runs').getByRole('link', { name: 'All runs' })).toHaveAttribute('href', '/runs')

  const signups = card(page, 'signups').getByTestId('signup')
  await expect(signups).toHaveText(['Pat Example5 minutes ago', 'casey@example.org3 hours ago', 'Jordan Sampleyesterday', 'Robin Test4 days ago'])
  await expect(signups.first()).toHaveAttribute('title', 'Onboarding audit')
  await expect(card(page, 'signups').getByRole('link', { name: 'All sign-ups' })).toHaveAttribute('href', '/landing-pages')

  // the quick start opens New run on the Lead pipeline
  await quick.first().click()
  const dlg = page.getByRole('dialog', { name: 'New Catalyst run' })
  await expect(dlg).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)
  await expect(page).toHaveURL(/\/lead-pipeline$/)
})

test('Next.js keeps a page alive between visits: a link that asks again opens again', async ({ page }) => {
  await signIn(page, '/today')
  const nav = page.getByRole('navigation', { name: 'Main' })
  // a reply from Next up, twice
  for (let i = 0; i < 2; i++) {
    await card(page, 'needs-you').getByRole('list', { name: 'Next up' }).getByRole('link').nth(2).click()
    const dlg = page.getByRole('dialog', { name: 'Reply to Northwind Advisors' })
    await expect(dlg, 'visit ' + (i + 1)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dlg).toHaveCount(0)
    await nav.getByRole('link', { name: 'Today' }).click()
    await expect(page).toHaveURL('/today')
  }
  // New run from Quick start, twice
  for (let i = 0; i < 2; i++) {
    await card(page, 'quick-start').getByRole('link', { name: /Run Catalyst for a lead/ }).click()
    const form = page.getByRole('dialog', { name: 'New Catalyst run' })
    await expect(form, 'visit ' + (i + 1)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(form).toHaveCount(0)
    await expect(page).toHaveURL('/lead-pipeline')
    // the sidebar shows Catalyst's pages here: back to Today with the browser
    await page.goBack()
    await expect(page).toHaveURL('/today')
  }
})

test('nothing yet: every card says so', async ({ page }) => {
  await stubSeed({ agent_outputs: [], creative_briefs: [], engagement_drafts: [], e1_leads: [], landing_pages: [], runs: [], lp_signups: [] })
  await signIn(page, '/today')
  await expect(page.getByTestId('today-need')).toHaveText('Nothing needs you right now.')
  const needs = card(page, 'needs-you')
  await expect(needs).toContainText('You are all caught up')
  await expect(needs).toContainText('New briefs, ads and replies show up here when the agents finish.')
  await expect(needs.getByRole('link', { name: 'Open Approvals' })).toHaveAttribute('href', '/approvals')
  await expect(card(page, 'runs')).toContainText('No runs yetAgent runs show up here as they finish.')
  await expect(card(page, 'signups')).toContainText('No sign-ups yetThey show up here from your live landing pages.')
  await expect(card(page, 'signups').getByRole('link', { name: 'Landing pages' })).toHaveAttribute('href', '/landing-pages')
  await expect(lineOf(page, 'touchpoint')).toHaveText('Nothing waiting for you')
  await expect(lineOf(page, 'catalyst')).toHaveText('0 leads')
  await expect(lineOf(page, 'pipeline')).toHaveText('No briefs waiting · 0 live landing pages')
})

test('it reads again every 10 minutes; nothing runs off the side on a phone', async ({ page }) => {
  await page.clock.install()
  await signIn(page, '/today')
  await expect(card(page, 'runs').getByTestId('run')).toHaveCount(4)
  // the page is drawn on the server, so wait until it has set its timer before moving the clock on
  await expect(page.locator('html[data-today-refresh="on"]')).toHaveCount(1)
  await stubSeed({ runs: [{ id: 'run-9', agent: 'ad_strategist', status: 'error', started_at: new Date().toISOString() }] })
  await page.clock.fastForward(10 * 60_000 + 1_000)
  await expect(card(page, 'runs').getByTestId('run')).toHaveCount(1)
  await expect(card(page, 'runs').getByTestId('run')).toContainText('Failed')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(card(page, 'workspace')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Take the tour: four steps, Back and Next, the main button has the keyboard, and Skip, Done or Esc close it', async ({ page }) => {
  await signIn(page, '/today')
  const tour = page.getByRole('button', { name: 'Take the tour' })
  await tour.click()
  const first = page.getByRole('dialog', { name: 'Five products, one sidebar' })
  await expect(first).toBeVisible()
  await expect(first).toContainText('1 of 4')
  await expect(first.getByTestId('tour-step')).toContainText('TouchpointCatalystCanvasPipelineAtlas')
  await expect(first.getByRole('button', { name: 'Next' })).toBeFocused()

  await first.getByRole('button', { name: 'Next' }).click()
  const second = page.getByRole('dialog', { name: 'One place for every approval' })
  await expect(second).toContainText('2 of 4')
  await expect(second.getByRole('button', { name: 'Next' })).toBeFocused()
  await second.getByRole('button', { name: 'Back' }).click()
  await expect(first).toBeVisible()

  for (let i = 0; i < 3; i++) await page.getByRole('dialog').getByRole('button', { name: 'Next' }).click()
  const last = page.getByRole('dialog', { name: 'Some pages are still moving over' })
  await expect(last).toContainText('4 of 4')
  await expect(last).toContainText('opens a card that links to it in the current dashboard')
  await expect(last.getByRole('button', { name: 'Next' })).toHaveCount(0)
  await expect(last.getByRole('button', { name: 'Done' })).toBeFocused()
  await last.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // it starts again at the first step
  await tour.click()
  await expect(first).toBeVisible()
  await first.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await tour.click()
  await expect(first).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
