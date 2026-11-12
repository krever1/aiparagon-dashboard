import { type Page, expect, test } from '@playwright/test'
import { dayShort } from '../../src/lib/pipeline/strategy'
import { LEGACY, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { testingRows } from './testing-fixtures'

// Ad Testing's Strategy read: the newest read (its codes as chips, where each source opens, Make next, More from this
// read), the earlier reads, what the next read reads, New read (kept for the team, checked until it lands or says why
// not), and Remember. On the made-up rows in tests/e2e/testing-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const card = (page: Page) => page.getByTestId('read-card')
const day = (iso: unknown) => dayShort(String(iso), Date.now(), 'UTC')

let seeded = testingRows()
const created = (id: string) => seeded.agent_outputs.find((r) => r.id === id)!.created_at
test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  seeded = testingRows()
  await stubSeed(seeded)
})

test('the newest read: what it says, its sources as chips, where each opens, and the earlier reads', async ({ page }) => {
  await signIn(page, '/ad-testing')
  await expect(page.getByRole('tab', { name: 'Strategy read' })).toHaveAttribute('aria-selected', 'true')
  const c = card(page)
  // the daily read says so, not "asked by Daily read"
  await expect(c.getByTestId('read-line')).toHaveText('Strategy read · ' + day(created('sr-1')) + ' · Daily read')
  await expect(c.getByRole('heading', { level: 2 })).toHaveText('Lead with the onboarding audit')
  await expect(c).toContainText('Posts about onboarding got the most saves Post result, and the audit campaign is still running Campaign 6 Nov.')
  await expect(c.getByTestId('ref-chip').filter({ hasText: 'Campaign 6 Nov' }).first()).toHaveAttribute('title', 'Campaign · 6 Nov 2026 · Onboarding Audit')
  await expect(c).toContainText('It fits the offer Ad brief.')
  // a code the read does not name is left out
  await expect(c).toContainText('No proof from a client yet.')
  await expect(c).not.toContainText('[ZZ]')

  const recs = c.getByTestId('read-rec')
  await expect(recs).toHaveCount(2)
  await expect(recs.nth(0)).toContainText('Post the audit checklistNowThought leadership')
  await expect(recs.nth(1)).toContainText('Run a second audit adNextPaid ad')
  await expect(recs.nth(0).getByRole('link', { name: 'Create' })).toHaveAttribute('href', LEGACY + '/content-transformation')
  await expect(recs.nth(0).getByRole('link', { name: 'Create' })).toHaveAttribute('title', 'Opens Content Transformation in the current dashboard')
  await expect(recs.nth(1).getByRole('link', { name: 'Create' })).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await recs.nth(0).getByText('Why', { exact: true }).click()
  await expect(recs.nth(0)).toContainText('It got the most saves Post result.')
  await expect(recs.nth(0)).toContainText('The angle: Show the three steps.')
  await expect(recs.nth(0).getByRole('link', { name: 'Organic brief · 9 Nov 2026' })).toHaveAttribute('href', '/briefs?run=agent1_run_9')
  await recs.nth(1).getByText('Why', { exact: true }).click()
  await expect(recs.nth(1).getByRole('link', { name: 'Campaign · 6 Nov 2026 · Onboarding Audit' })).toHaveAttribute('href', LEGACY + '/marketing-generation')

  await c.getByText('More from this read').click()
  const more = c.getByTestId('read-more')
  await expect(more).toContainText('Keep the audit hook Campaign 6 Nov.')
  await expect(more).toContainText('Stop the long intro.')
  await expect(more).toContainText('Two posts a week and one ad.')
  await expect(more).toContainText('To sharpen the next read')
  await expect(more).toContainText('Log the results of the audit ads.')

  // what the next read reads
  await expect(page.getByTestId('read-chips').getByRole('listitem')).toHaveText([
    'Voice set',
    'Offer and context not set',
    'Campaigns 1',
    'Drafts 1',
    'Library 1',
    'Open ideas 1',
    'Post results 3',
    'Ad results 4',
    'Briefs organic ' + day(created('ob-1')) + ', ads ' + day(seeded.creative_briefs[0].created_at),
  ])
  await expect(page.getByTestId('read-chips').getByRole('link', { name: 'Voice set' })).toHaveAttribute('href', LEGACY + '/company-profile')
  await expect(page.getByTestId('read-chips').getByRole('link', { name: /^Briefs/ })).toHaveAttribute('href', '/briefs')
  await page.getByRole('button', { name: 'What the strategy read looks at' }).click()
  await expect(page.getByRole('dialog', { name: 'What the strategy read looks at' })).toContainText('Nothing is published.')
  await page.getByRole('button', { name: 'Got it' }).click()

  // the earlier reads
  const hist = page.getByTestId('read-history')
  await hist.getByText('Earlier reads').click()
  const rows = hist.getByRole('listitem')
  await expect(rows).toHaveText([
    'Lead with the onboarding audit' + day(created('sr-1')) + ' · Daily readOn screen',
    'Book more diagnostic calls' + day(created('sr-2')) + ' · asked by pat',
  ])
  await rows.nth(1).getByRole('button').click()
  await expect(c.getByRole('heading', { level: 2 })).toHaveText('Book more diagnostic calls')
  await expect(c.getByTestId('read-line')).toHaveText('Strategy read · ' + day(created('sr-2')) + ' · asked by pat')
  await expect(c).toContainText('You asked: What should we post next month?')
  await expect(c.getByRole('note')).toHaveText('Two results were logged without dates.')
  // nothing given: it says so; what is missing stands in for the gaps
  await expect(c).toContainText('WhyNot given.')
  await expect(c).toContainText('GapsLog your first results.')
  await expect(c.getByTestId('read-rec')).toHaveCount(0)
  await expect(c.getByTestId('read-more')).toHaveCount(0)

  // a source that is a result opens Results here
  await rows.nth(0).getByRole('button').click()
  await recs.nth(0).getByText('Why', { exact: true }).click()
  await recs.nth(0).getByRole('button', { name: 'Post · Why onboarding stalls' }).click()
  await expect(page).toHaveURL(/\/ad-testing\?tab=results$/)
  await expect(page.getByRole('tab', { name: /^Results/ })).toHaveAttribute('aria-selected', 'true')
})

test('New read: kept for the team while it works, checked until it lands, then on screen', async ({ page }) => {
  await page.clock.install()
  await signIn(page, '/ad-testing')
  await page.getByRole('textbox', { name: 'Anything to focus on?' }).fill('More booked calls')
  await page.getByRole('button', { name: 'New read' }).click()
  await expect(page.getByTestId('read-running')).toContainText('Reading your content and results. Started just now. About a minute.')
  await expect(page.getByRole('button', { name: 'Reading…' })).toBeDisabled()
  await expect(page.getByTestId('read-eta')).toHaveText('Started just now. You can leave this page.')
  await expect(page.getByTestId('testing-status').getByRole('listitem').first()).toHaveText('A strategy read is running')
  await expect(page.getByRole('textbox', { name: 'Anything to focus on?' })).toHaveValue('')
  const call = (await stubCalls()).find((x) => x.path === '/webhook/e3-strategy-insights')!
  expect(call.body).toMatchObject({ focus: 'More booked calls', requested_by: TEAM.email })
  expect(typeof call.body.auth).toBe('string')
  const kept = (await stubRows<Row>('ai_settings')).find((r) => r.key === 'strategy_runs')!
  expect(kept.value).toMatchObject({ runs: [{ run_id: 'insights_stub', by: TEAM.email, focus: 'More booked calls' }] })

  // looking at Results meanwhile: the page still checks, and says when the read is ready
  await page.getByRole('tab', { name: /^Results/ }).click()
  // n8n saves the read under the run
  await stubSeed({
    agent_outputs: [
      ...seeded.agent_outputs,
      {
        id: 'sr-new', agent: 'strategy_insights', output_type: 'strategy_insights', run_id: 'insights_stub', title: 'Strategy read', created_at: new Date().toISOString(),
        data: { requested_by: TEAM.email, focus: 'More booked calls', insights: { headline: 'Double the audit posts', recommendations: [] } },
      },
    ],
  })
  await page.clock.fastForward(5_500)
  await expect(toast(page, 'The strategy read is ready.')).toBeVisible()
  await page.getByRole('tab', { name: 'Strategy read' }).click()
  await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('Double the audit posts')
  await expect(card(page)).toContainText('You asked: More booked calls')
  await expect(card(page).getByTestId('read-line')).toContainText('asked by ' + TEAM.email.split('@')[0])
  await expect(page.getByTestId('read-running')).toBeHidden()
  await expect(page.getByRole('button', { name: 'New read' })).toBeEnabled()
  await expect(page.getByTestId('testing-status').getByRole('listitem').first()).not.toHaveText('A strategy read is running')
})

test('what became of a read: why it could not be made, or that it is taking longer', async ({ page }) => {
  await page.clock.install()
  await signIn(page, '/ad-testing')
  await page.getByRole('button', { name: 'New read' }).click()
  await expect(page.getByTestId('read-running')).toBeVisible()
  await stubSeed({
    agent_outputs: [
      ...seeded.agent_outputs,
      {
        id: 'se-1', agent: 'strategy_insights', output_type: 'strategy_insights_error', run_id: 'insights_stub', title: 'Strategy read did not finish', created_at: new Date().toISOString(),
        data: { error: 'Could not put the strategy read together this time. Try again.' },
      },
    ],
  })
  await page.clock.fastForward(5_500)
  await expect(page.getByRole('alert').filter({ hasText: 'Could not put the strategy read together this time. Try again.' })).toBeVisible()
  await expect(page.getByTestId('read-running')).toBeHidden()
  await expect(page.getByRole('button', { name: 'New read' })).toBeEnabled()

  // a teammate's read started ten minutes ago that has not landed
  await stubSeed({ ai_settings: [...seeded.ai_settings, { key: 'strategy_runs', value: { runs: [{ run_id: 'insights_slow', t: Date.now() - 10 * 60e3, by: 'pat@aiparagonconsulting.com', focus: '' }] } }] })
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'This is taking longer than usual. It may still finish, so check back in a few minutes.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New read' })).toBeEnabled()

  // and one started a minute ago: it shows as running for everyone
  await stubSeed({ ai_settings: [...seeded.ai_settings, { key: 'strategy_runs', value: { runs: [{ run_id: 'insights_team', t: Date.now() - 60e3, by: 'pat@aiparagonconsulting.com', focus: '' }] } }] })
  await page.reload()
  // the page's clock is to the minute, so a minute ago can still read as just now
  await expect(page.getByTestId('read-running')).toContainText(/Started (just now|a minute ago)\./)
  await expect(page.getByRole('button', { name: 'Reading…' })).toBeDisabled()
})

test('a read that does not start: not enough to read, or the workflow is off', async ({ page }) => {
  await stubHook('e3-strategy-insights', 200, {
    ok: false,
    code: 'not_enough',
    message: 'Not enough to read yet. Set your voice and context, save a draft or an idea, or log a result first.',
  })
  await signIn(page, '/ad-testing')
  await page.getByRole('button', { name: 'New read' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Not enough to read yet. Set your voice and context, save a draft or an idea, or log a result first.' })).toBeVisible()
  expect((await stubRows<Row>('ai_settings')).find((r) => r.key === 'strategy_runs')).toBeUndefined()
  await expect(page.getByTestId('read-running')).toHaveCount(0)

  await stubHook('e3-strategy-insights', 404, { message: 'not found' })
  await page.getByRole('button', { name: 'New read' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'The Strategy Insights workflow in n8n is switched off. Turn on “Engine 3 · Strategy Insights” in n8n.' })).toBeVisible()
})

test('Remember a line: first in the remembered list, the house rules made again, and it says Remembered', async ({ page }) => {
  await signIn(page, '/ad-testing')
  await card(page).getByText('More from this read').click()
  const line = (t: string) => card(page).getByTestId('read-more').getByRole('listitem').filter({ hasText: t })
  // remembered before
  await expect(line('Post on Tuesdays.').getByTestId('remember')).toHaveText('Remembered')
  await expect(line('Post on Tuesdays.').getByTestId('remember')).toBeDisabled()
  await line('Keep the audit hook').getByTestId('remember').click()
  await expect(toast(page, 'Remembered. New drafts and campaigns use it. It is listed in the client profile.')).toBeVisible()
  await expect(line('Keep the audit hook').getByTestId('remember')).toHaveText('Remembered')
  await expect(line('Keep the audit hook').getByTestId('remember')).toBeDisabled()

  const prefs = (await stubRows<Row>('ai_settings')).find((r) => r.key === 'e3_prefs')!
  expect(prefs).toMatchObject({ updated_by: TEAM.email })
  expect(prefs.value).toMatchObject({
    read_id: 'sr-1',
    updated_by: TEAM.email,
    memory: [
      { id: 'read:sr-1:dd:0', text: 'Double down: Keep the audit hook.', by: TEAM.email },
      { id: 'read:sr-1:dd:1', text: 'Double down: Post on Tuesdays.' },
    ],
  })
  const rules = await stubRows<Row>('ai_rules')
  expect(rules.find((r) => r.id === 'rule-mem-1')).toBeUndefined()
  const mem = rules.filter((r) => r.source === 'profile:memory')
  expect(mem.map((r) => r.rule)).toEqual(['The team asked to remember: Double down: Keep the audit hook; Double down: Post on Tuesdays.'])
  expect(mem[0]).toMatchObject({ category: 'Other', applies_to: ['content_generation'], active: true, created_by: TEAM.email })
  // the other house rules are left alone
  expect(rules.find((r) => r.id === 'rule-man-1')).toBeTruthy()

  // a change or stop line is remembered with its own words
  await line('Stop the long intro.').getByTestId('remember').click()
  await expect(line('Stop the long intro.').getByTestId('remember')).toHaveText('Remembered')
  const after = (await stubRows<Row>('ai_settings')).find((r) => r.key === 'e3_prefs')!.value as { memory: { id: string; text: string }[] }
  expect(after.memory.map((m) => m.text)).toEqual(['Change or stop: Stop the long intro.', 'Double down: Keep the audit hook.', 'Double down: Post on Tuesdays.'])
})

test('nothing yet: no read, what the next one would read, and New read', async ({ page }) => {
  await stubSeed({ agent_outputs: [], ai_settings: [], brand_voice: [], idea_notes: [], content_pieces: [], creative_briefs: [], content_results: [] })
  await signIn(page, '/ad-testing')
  await expect(page.getByTestId('testing-status').getByRole('listitem').first()).toHaveText('No strategy read yet')
  await expect(page.getByTestId('read-tab').getByText('No strategy read yet', { exact: true })).toBeVisible()
  await expect(page.getByTestId('read-tab')).toContainText('Press New read below.')
  await expect(page.getByTestId('read-chips').getByRole('listitem')).toHaveText([
    'Voice not set',
    'Offer and context not set',
    'Campaigns 0',
    'Drafts 0',
    'Library 0',
    'Open ideas 0',
    'Post results 0',
    'Ad results 0',
    'Briefs none yet',
  ])
  await expect(page.getByTestId('read-history')).toHaveCount(0)
  await expect(page.getByTestId('read-eta')).toHaveText('About a minute. It reads your briefs, voice, campaigns, drafts and results.')
  // Post results opens Results here
  await page.getByTestId('read-chips').getByRole('button', { name: 'Post results 0' }).click()
  await expect(page).toHaveURL(/\/ad-testing\?tab=results$/)
})

test('on a phone: the read and its sources fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/ad-testing')
  await expect(card(page)).toBeVisible()
  await card(page).getByText('More from this read').click()
  await card(page).getByTestId('read-rec').nth(0).getByText('Why', { exact: true }).click()
  await page.getByTestId('read-history').getByText('Earlier reads').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})
