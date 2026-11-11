import { type Page, expect, test } from '@playwright/test'
import { spanText } from '../../src/components/pipeline/dates'
import { dateText, dayText } from '../../src/components/ui/local-date'
import { LEGACY, TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { ADS1, ADS2, CR, LIB, ORG1, ORG2, POST, briefRows } from './briefs-fixtures'

// The Market Intelligence Briefs: the Organic tab (the record bar, the five things and their posts, what changed,
// developments, themes, the posts behind the brief, the review), the Ads tab (hooks and where each was seen, offers,
// the ads behind the brief, an old brief), Combined (the six cards and the creative briefs), approving and asking for
// changes, the team's layout, versions and the address. On the made-up rows in tests/e2e/briefs-fixtures.ts.

test.use({ timezoneId: 'UTC' })

const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Briefs' }).getByRole('tab')
const sections = (page: Page) => page.locator('[data-testid^="sec-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
const decisions = () => stubRows<Record<string, unknown>>('agent_feedback')
const at = (rows: Record<string, unknown>[], id: string) => String(rows.find((r) => r.id === id || r.run_id === id)?.created_at)

let R: ReturnType<typeof briefRows>
test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  R = briefRows()
  await stubSeed(R)
})

test('the newest organic brief: its record, the five things, the short version and what changed', async ({ page }) => {
  await signIn(page, '/briefs')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Market Intelligence Briefs')
  await expect(page.getByTestId('briefs-status')).toContainText('3 briefs waiting for your review')
  await expect(tabs(page)).toHaveText(['Organic', 'Ads', 'Combined'])
  await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true')
  for (const t of await tabs(page).all()) await expect(t.getByLabel('Needs review')).toBeVisible()

  const made = at(R.agent_outputs, '97000000-0000-4000-8000-000000000001')
  const bar = page.getByTestId('brief-bar')
  await expect(bar).toContainText('Organic brief · ' + dayText(made, 'UTC'))
  const meta = page.getByTestId('brief-meta')
  await expect(meta).toContainText('Published ' + dateText(made, 'UTC'))
  await expect(meta).toContainText('Period ' + spanText('2026-11-02T14:00:00.000Z', '2026-11-09T14:00:00.000Z', 'UTC'))
  await expect(meta).toContainText('Agent Intel Tracker')
  await expect(meta).not.toContainText('custom run')
  await expect(meta).toContainText('For Thought leadership, newsletters, email')
  await expect(meta).toContainText('Industry AI consulting for wealth management firms')
  await expect(bar.getByText('Needs review', { exact: true })).toBeVisible()
  const version = bar.getByLabel('Version')
  await expect(version.locator('option')).toHaveText([
    dayText(made, 'UTC') + ' · newest',
    dayText(at(R.agent_outputs, '97000000-0000-4000-8000-000000000003'), 'UTC') + ' · custom run · edited',
  ])
  // Structure and Edit are still in the current dashboard
  for (const name of ['Structure', 'Edit']) {
    const a = bar.getByRole('link', { name })
    await expect(a).toHaveAttribute('href', LEGACY + '/briefs')
    await expect(a).toHaveAttribute('title', 'Opens in the current dashboard')
  }

  // the five things from the brief's snapshot
  const five = page.getByTestId('brief-five')
  await expect(five.getByRole('heading', { level: 2 })).toHaveText('Three things working')
  await expect(five.getByRole('button')).toHaveCount(3)
  await expect(five.getByRole('button').nth(0)).toContainText('Client experience')
  await expect(five.getByRole('button').nth(0)).toContainText('Proof beats promises')
  await expect(five.getByRole('button').nth(0)).toContainText('Northwind shows client results with numbers')

  // the short version (the TL;DR) and what changed, the first shift open
  await expect(page.getByTestId('sec-short')).toContainText('Proof beats promises. Advisors ask for evidence of results before they book a call.')
  await expect(page.getByTestId('sec-short')).toContainText('Onboarding in days. Firms now promise client onboarding in days, not weeks.')
  const shifts = page.getByTestId('shift')
  await expect(shifts).toHaveCount(2)
  await expect(shifts.nth(0)).toHaveAttribute('open', '')
  await expect(shifts.nth(1)).not.toHaveAttribute('open', '')
  await expect(shifts.nth(0).locator('summary')).toContainText('From promises to proof')
  await expect(shifts.nth(0).locator('dl')).toHaveText(
    'ObservedA post on client results drew 340 reactions. · Northwind Advisors' +
      'InterpretationAdvisors now lead with client results, not features.' +
      'How to use itLead with one real result per post.' +
      'EvidenceO1',
  )
  await shifts.nth(1).locator('summary').click()
  // the evidence of the second shift is not among the run's posts: it opens on its own page
  await expect(shifts.nth(1).getByRole('button', { name: 'Open the post' })).toBeVisible()

  // the shift's evidence opens the post in the Intel Tracker's post panel
  await shifts.nth(0).getByRole('button', { name: 'O1' }).click()
  const post = page.getByTestId('post-drawer')
  await expect(post.getByRole('heading', { level: 2 })).toHaveText('Show the proof, not the promise')
  await expect(post).not.toContainText('Open the brief')
  await page.keyboard.press('Escape')
  await expect(post).toHaveCount(0)
})

test('a five thing opens what the agent saw and its posts; Change opens the industry', async ({ page }) => {
  await signIn(page, '/briefs')
  await page.getByTestId('brief-five').getByRole('button').nth(0).click()
  const d = page.getByTestId('brief-five-drawer')
  await expect(d.getByRole('heading', { level: 2 })).toHaveText('Proof beats promises')
  await expect(d).toContainText('Intel Tracker · ' + dayText(at(R.agent_outputs, '97000000-0000-4000-8000-000000000001'), 'UTC') + ' brief')
  await expect(d).toContainText('What the agent sawNorthwind shows client results with numbers')
  await expect(d.getByRole('button', { name: /Show the proof, not the promise/ })).toContainText('O1 · Northwind Advisors · Opinion post')
  await expect(d.getByRole('link', { name: 'See them in the Intel Tracker' })).toHaveAttribute('href', '/intel-tracker?run=' + ORG1 + '&five=0')
  const write = d.getByRole('link', { name: 'Write a post with this' })
  await expect(write).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await expect(write).toHaveAttribute('title', 'Opens in the current dashboard')
  // a source opens its post
  await d.getByRole('button', { name: /Show the proof, not the promise/ }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId('post-drawer').getByRole('heading', { level: 2 })).toHaveText('Show the proof, not the promise')
  await page.keyboard.press('Escape')

  await page.getByTestId('brief-meta').getByRole('button', { name: 'Change' }).click()
  const ind = page.getByRole('dialog', { name: 'What industry is this run for?' })
  await expect(ind.getByLabel('Industry')).toHaveValue('AI consulting for wealth management firms')
  await expect(ind.getByRole('link', { name: /Following/ })).toHaveAttribute('href', '/intel-tracker?tab=follow')
  await ind.getByRole('button', { name: 'Cancel' }).click()
  await expect(ind).toHaveCount(0)
})

test('developments, themes and topic watch, the content handoff, the posts behind the brief and the numbers', async ({ page }) => {
  await signIn(page, '/briefs')
  const devs = page.getByTestId('dev')
  await expect(devs).toHaveCount(2)
  await expect(devs.nth(0)).toContainText('Thought leadership')
  await expect(devs.nth(0)).toContainText('A governance checklist')
  await expect(devs.nth(0)).toContainText('Security steps before using AI tools.')
  await expect(devs.nth(0)).toContainText('Why it matters: Buyers ask about governance first.')
  await expect(devs.nth(0).getByRole('link', { name: 'Contoso Planning' })).toHaveAttribute('href', POST(3))
  await expect(devs.nth(1)).toContainText('Product news')
  await expect(devs.nth(1).getByRole('link', { name: 'Fabrikam Insights' })).toHaveAttribute('href', 'https://example.com/notetaker')

  // themes: "other" left out, each opening its posts in the Intel Tracker
  const themes = page.getByTestId('brief-themes').getByRole('link')
  await expect(themes).toHaveText(['Client experience4', 'AI adoption2'])
  await expect(themes.nth(0)).toHaveAttribute('href', '/intel-tracker?run=' + ORG1 + '&theme=client%20experience')
  const watch = page.getByTestId('sec-themes').locator('details')
  await expect(watch).toHaveCount(1)
  await expect(watch.locator('summary')).toHaveText('Security1 post')
  await watch.locator('summary').click()
  await expect(watch.getByRole('listitem')).toHaveText('Contoso Planning: A security checklist for advisors')

  const hand = page.getByTestId('sec-hand')
  await expect(hand.getByRole('link')).toHaveText(['Write a post', 'Write a newsletter', 'Start from your own material'])
  await expect(hand.getByRole('link', { name: 'Start from your own material' })).toHaveAttribute('href', LEGACY + '/content-transformation')

  // the posts behind the brief, in the brief's order, then by engagement
  const ev = page.getByTestId('brief-evidence')
  const rows = ev.getByTestId('ev-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('td')).toHaveText(['O1Northwind Advisors', 'Opinion post', 'Show the proof, not the promise', '340', 'Concrete client results.'])
  await expect(rows.nth(1).locator('td')).toHaveText(['O2Example Ridge Advisors', 'Case study', 'Onboarding in days, not weeks', '120', 'Speed sells.'])
  await expect(rows.nth(2).locator('td')).toHaveText(['O3Contoso Planning', 'How-to guide', 'A governance checklist for advisors', 'n/a', ''])
  const engagement = ev.getByRole('columnheader', { name: /Engagement/ })
  await engagement.getByRole('button', { name: /Engagement/ }).click()
  await expect(engagement).toHaveAttribute('aria-sort', 'descending')
  await expect(rows.locator('td:first-child button')).toHaveText(['O1', 'O2', 'O3'])
  await engagement.getByRole('button', { name: /Engagement/ }).click()
  await expect(engagement).toHaveAttribute('aria-sort', 'ascending')
  await expect(rows.locator('td:first-child button')).toHaveText(['O3', 'O2', 'O1'])
  await expect(page.getByTestId('sec-ev').getByRole('link', { name: /See every post from this run/ })).toHaveAttribute('href', '/intel-tracker?run=' + ORG1)
  await rows.nth(1).click()
  await expect(page.getByTestId('post-drawer').getByRole('heading', { level: 2 })).toHaveText('Onboarding in days, not weeks')
  await page.keyboard.press('Escape')

  await expect(page.getByTestId('brief-glance').getByRole('listitem')).toHaveText([
    '48 posts readUp to 50 a run, the most engaged first',
    '3 in the briefThe top 3 on-topic posts by score',
    '5 high valueScored 70 or more',
    '10 filteredOff-topic or too little engagement',
    '1 replies draftedWaiting in Replies until you approve',
  ])
  await expect(page.getByRole('navigation', { name: 'In this brief' }).getByRole('button')).toHaveText([
    'Five things',
    'The short version',
    'What changed',
    'Notable developments',
    'Themes',
    'Content handoff',
    'Post evidence',
    'Review',
  ])
})

test('approve the organic brief, from the record bar; the count and the tab follow', async ({ page }) => {
  await signIn(page, '/briefs')
  const review = page.getByTestId('sec-review')
  await expect(page.getByTestId('brief-decision')).toHaveText('A person reviews this before its signals shape content. Approved briefs are picked first.')
  // the checks are kept in this browser
  await expect(review).toContainText('0 of 3 checks done')
  await review.getByRole('checkbox', { name: /Trace sources/ }).click()
  await expect(review.getByRole('checkbox', { name: /Trace sources/ })).toHaveAttribute('aria-checked', 'true')
  await expect(review).toContainText('1 of 3 checks done')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ap.nw.brchk') || '{}'))).toEqual({ ['org:' + ORG1]: [true, false, false] })

  await page.getByTestId('brief-bar').getByRole('button', { name: 'Approve brief' }).click()
  await expect(toast(page, 'Brief approved. Drafts use approved briefs first.')).toBeVisible()
  await expect(page.getByTestId('brief-bar').getByText('Approved', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve brief' })).toHaveCount(0)
  await expect(page.getByTestId('brief-decision')).toHaveText('Approved by qa.teammate just now')
  await expect(page.getByTestId('briefs-status')).toContainText('2 briefs waiting for your review')
  await expect(tabs(page).nth(0).getByLabel('Needs review')).toHaveCount(0)
  const rows = await decisions()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ agent: 'intel_tracker', target_type: 'brief_approval', target_id: ORG1, action: 'approved', feedback: null, author: TEAM.email })

  // the checks survive a reload
  await page.reload()
  await expect(page.getByTestId('sec-review')).toContainText('1 of 3 checks done')
  await expect(page.getByTestId('brief-decision')).toHaveText('Approved by qa.teammate just now')
})

test('request changes asks what should change, saves it for AI settings, and the brief says so', async ({ page }) => {
  await signIn(page, '/briefs')
  await page.getByTestId('sec-review').getByRole('button', { name: 'Request changes' }).click()
  const d = page.getByRole('dialog', { name: 'What needs to change in this brief?' })
  await expect(d).toContainText('Organic brief · ' + dayText(at(R.agent_outputs, '97000000-0000-4000-8000-000000000001'), 'UTC'))
  await expect(d.getByLabel('What needs to change')).toBeFocused()
  const save = d.getByRole('button', { name: 'Save' })
  await expect(save).toBeDisabled()
  await d.getByLabel('What needs to change').fill('   ')
  await expect(save).toBeDisabled()
  // Cancel saves nothing
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(d).toHaveCount(0)
  expect(await decisions()).toHaveLength(0)

  await page.getByTestId('sec-review').getByRole('button', { name: 'Request changes' }).click()
  await d.getByLabel('What needs to change').fill('The second shift has no post from this run. Leave it out.')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved. It shows on AI settings, where it can become a rule.')).toBeVisible()
  await expect(d).toHaveCount(0)
  await expect(page.getByTestId('brief-bar').getByText('Changes requested', { exact: true })).toBeVisible()
  // changes asked is a decision too: the count drops, and it can still be approved
  await expect(page.getByTestId('briefs-status')).toContainText('2 briefs waiting for your review')
  await expect(page.getByTestId('brief-bar').getByRole('button', { name: 'Approve brief' })).toBeVisible()
  await expect(page.getByTestId('brief-decision')).toHaveText(
    'Changes requested by qa.teammate just now: “The second shift has no post from this run. Leave it out.”',
  )
  const rows = await decisions()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    agent: 'intel_tracker',
    target_type: 'brief_approval',
    target_id: ORG1,
    action: 'changes',
    feedback: 'The second shift has no post from this run. Leave it out.',
    author: TEAM.email,
  })
})

test('another version, an edited one: the address names it, and its own sections show', async ({ page }) => {
  await signIn(page, '/briefs')
  await page.getByTestId('brief-bar').getByLabel('Version').selectOption(ORG2)
  await expect(page).toHaveURL('/briefs?run=' + ORG2)
  const bar = page.getByTestId('brief-bar')
  await expect(bar).toContainText('Organic brief · ' + dayText(at(R.agent_outputs, '97000000-0000-4000-8000-000000000003'), 'UTC'))
  await expect(page.getByTestId('brief-meta')).toContainText('Agent Intel Tracker, custom run')
  const edited = (JSON.parse(String(R.agent_outputs[2].data)) as { review: { at: string } }).review.at
  await expect(page.getByTestId('brief-meta')).toContainText('Edited by erin ' + dayText(edited, 'UTC') + ' · Put back the agent’s version')
  await expect(page.getByTestId('brief-meta').getByRole('link', { name: 'Put back the agent’s version' })).toHaveAttribute('href', LEGACY + '/briefs')
  // no snapshot: the five things come from its TL;DR; the edit hid its developments
  const five = page.getByTestId('brief-five')
  await expect(five.getByRole('heading', { level: 2 })).toHaveText('One thing working')
  await expect(five.getByRole('button')).toContainText('Fee talk is up')
  await expect(page.getByTestId('sec-dev')).toHaveCount(0)
  await expect(page.getByTestId('sec-short')).toContainText('Fee talk is up. Flat fees came up in four posts.')

  // a reload keeps it; the newest needs no run in the address
  await page.reload()
  await expect(page.getByTestId('brief-bar').getByLabel('Version')).toHaveValue(ORG2)
  await page.getByTestId('brief-bar').getByLabel('Version').selectOption(ORG1)
  await expect(page).toHaveURL('/briefs')
  await expect(page.getByTestId('sec-dev')).toBeVisible()

  // a run nobody has opens the newest
  await page.goto('/briefs?run=agent1_1999-01-01_0000')
  await expect(page.getByTestId('brief-bar').getByLabel('Version')).toHaveValue(ORG1)
  await expect(page).toHaveURL('/briefs')
})

test('a brief older than the newest fourteen is read on its own', async ({ page }) => {
  const newer = Array.from({ length: 14 }, (_, i) => ({
    id: `9b000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    run_id: `agent1_2026-11-10_${String(i).padStart(4, '0')}`,
    agent: 'intel_tracker',
    output_type: 'intel_brief',
    created_at: new Date(Date.now() - (i + 1) * 60e3).toISOString(),
    content_md: '## TL;DR\n- **Newer brief ' + i + ':** Something.',
    data: '{}',
  }))
  await stubSeed({ agent_outputs: [...R.agent_outputs, ...newer] })
  await signIn(page, '/briefs?run=' + ORG2)
  await expect(page.getByTestId('brief-bar').getByLabel('Version')).toHaveValue(ORG2)
  await expect(page.getByTestId('brief-five')).toContainText('Fee talk is up')
  await expect(page.getByTestId('brief-bar').getByLabel('Version').locator('option')).toHaveCount(15)
})

test('the newest ads brief: the ads behind it, its hooks and where each was seen, offers and the test plan', async ({ page }) => {
  await signIn(page, '/briefs?tab=ads')
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/briefs?tab=ads')
  const made = String(R.creative_briefs[0].created_at)
  const bar = page.getByTestId('brief-bar')
  await expect(bar).toContainText('Ads brief · ' + dayText(made, 'UTC'))
  const meta = page.getByTestId('brief-meta')
  await expect(meta).toContainText('Period Ads running when it pulled them')
  await expect(meta).toContainText('Agent Ad Strategist')
  await expect(meta).toContainText('For Paid social ads')
  await expect(meta).toContainText('On file 2')
  await expect(page.getByTestId('brief-stale')).toHaveCount(0)
  await expect(bar.getByLabel('Version').locator('option')).toHaveText([dayText(made, 'UTC') + ' · newest', dayText(String(R.creative_briefs[1].created_at), 'UTC')])

  const five = page.getByTestId('brief-five')
  await expect(five.getByRole('heading', { level: 2 })).toHaveText('Two things working')
  await expect(five.getByRole('button').nth(0)).toContainText('Hook')
  await expect(five.getByRole('button').nth(0)).toContainText('Proof-first openings keep running')
  await expect(five.getByRole('button').nth(0)).toContainText('1 source')

  await expect(page.getByTestId('sec-short')).toContainText('Most firms sell features; the firm’s angle is “proof you can check in a week”. It’s not about tools.')
  await expect(page.getByTestId('sec-short')).toContainText('Built with the organic brief of ' + dayText(at(R.agent_outputs, '97000000-0000-4000-8000-000000000001'), 'UTC') + '.')
  const arch = page.getByTestId('sec-arch')
  await expect(arch).toContainText('Draft skeleton: Problem → Proof → Offer')
  const hooks = page.getByTestId('brief-hooks').locator(':scope > div')
  await expect(hooks).toHaveCount(3)
  await expect(hooks.nth(0)).toContainText('Hook AYour clients want proof, not promises')
  await expect(hooks.nth(1)).toContainText('Hook BOnboarding in days, not weeks')
  await expect(hooks.nth(2)).toContainText('Hook COne workflow, automated first')
  await hooks.nth(0).getByRole('button', { name: 'Seen in Northwind Advisors · 1 ad' }).click()
  const hd = page.getByTestId('hook-drawer')
  await expect(hd.getByRole('heading', { level: 2 })).toHaveText('Your clients want proof, not promises')
  await expect(hd.getByRole('link')).toHaveAttribute('href', LIB(1))
  await expect(hd.getByRole('link')).toContainText('Northwind Advisors · Call to action: Book now · 60 days running')
  await page.keyboard.press('Escape')

  await expect(page.getByTestId('sec-offer').getByRole('listitem')).toHaveText(['Free readiness review$0A 30-minute call with a scorecard.', 'Paid audit'])
  await expect(page.getByTestId('sec-pain')).toContainText('PainsPaperwork eats the advisors’ weekClients wait weeks to be onboarded')
  await expect(page.getByTestId('sec-pain')).toContainText('Likely objectionsWe tried AI and it made mistakes')
  await expect(page.getByTestId('sec-cross').getByRole('listitem')).toHaveText(['Accounting firms lead with a free health check', 'Dental clinics show before and after'])
  const test_ = page.getByTestId('sec-test')
  await expect(test_.getByRole('link', { name: 'Make ads from this' })).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await expect(test_.getByRole('link', { name: 'Open Ad Testing' })).toHaveAttribute('href', '/ad-testing')

  // the ads it names, in its order: run time only for an ad from the Ad Library, a catalog ad by its advertiser
  const rows = page.getByTestId('brief-evidence').getByTestId('ev-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('td')).toHaveText(['P1Northwind Advisors', 'Your clients want proof, not promises', 'Book now', 'Free readiness review', '60 daysStill running'])
  await expect(rows.nth(0).getByRole('link', { name: 'P1' })).toHaveAttribute('href', LIB(1))
  await expect(rows.nth(1).locator('td')).toHaveText(['P2Example Ridge Advisors', 'Onboarding in days, not weeks', 'Learn more', 'Onboarding audit', 'Hand-picked by your team'])
  await expect(rows.nth(1).getByRole('link')).toHaveCount(0)
  await expect(rows.nth(2).locator('td')).toHaveText(['P3Example Retail', 'Dynamic catalog ad · Example Retail', 'Shop now', 'n/a', '12 daysStopped'])
  await expect(page.getByTestId('brief-glance').getByRole('listitem')).toHaveText([
    '3 adsBehind the patterns, from 3 advertisers',
    '9 + 4 proven + emergingRan 6 weeks or more, or still running after 2',
    '0.62 confidenceThe agent’s own estimate, not a result',
    'Medium market sophisticationHow used to these claims buyers are',
  ])

  // the five thing and its ad
  await five.getByRole('button').nth(0).click()
  const d = page.getByTestId('brief-five-drawer')
  await expect(d.getByRole('heading', { level: 2 })).toHaveText('Proof-first openings keep running')
  await expect(d).toContainText('Ad Strategist · ' + dayText(made, 'UTC') + ' brief')
  await expect(d.getByRole('link', { name: /Your clients want proof/ })).toHaveAttribute('href', LIB(1))
  await expect(d.getByRole('link', { name: /Your clients want proof/ })).toContainText('Northwind Advisors · 60 days running · still running')
  await expect(d.getByRole('link', { name: 'Make ads with this' })).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await page.keyboard.press('Escape')

  // approving it says Ad Strategist
  await page.getByTestId('sec-review').getByRole('button', { name: 'Approve brief' }).click()
  await expect(toast(page, 'Brief approved. Drafts use approved briefs first.')).toBeVisible()
  expect((await decisions())[0]).toMatchObject({ agent: 'ad_strategist', target_id: ADS1, action: 'approved' })
  await expect(page.getByTestId('brief-decision')).toHaveText('Approved by qa.teammate just now')
})

test('an old ads brief: refresh it, the ads its markdown lists, and the five from its hooks', async ({ page }) => {
  await signIn(page, '/briefs?tab=ads&run=' + ADS2)
  await expect(page).toHaveURL('/briefs?tab=ads&run=' + ADS2)
  await expect(page.getByTestId('brief-stale')).toContainText('Refresh before the next paid draft. This brief is 32 days old.')
  await expect(page.getByTestId('brief-stale').getByRole('link', { name: 'Run the Ad Strategist' })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  await expect(page.getByTestId('sec-short')).toContainText('This brief has no angle written up.')
  const five = page.getByTestId('brief-five')
  await expect(five.getByRole('heading', { level: 2 })).toHaveText('One thing working')
  await expect(five.getByRole('button')).toContainText('Stop losing a week to paperwork')
  await expect(five.getByRole('button')).toContainText('1 source')

  const rows = page.getByTestId('brief-evidence').getByTestId('ev-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).locator('td')).toHaveText([
    'P1Harbor Example Group',
    'Your first workflow, automated in a week',
    'Book a call',
    'Workflow sprint',
    '64 daysproven, still running',
  ])
  // said once, though two of its tags say it
  await expect(rows.nth(1).locator('td')).toHaveText([
    'P2Old Mill Advisors',
    'Stop losing a week to paperwork',
    'n/a',
    'Paperwork review',
    '20 daysemerging, stopped running, uploaded by your team',
  ])
  await expect(page.getByTestId('brief-glance').getByRole('listitem')).toHaveText([
    '2 adsBehind the patterns, from 2 advertisers',
    '2 + 1 proven + emergingRan 6 weeks or more, or still running after 2',
    '0.55 confidenceThe agent’s own estimate, not a result',
    'High market sophisticationHow used to these claims buyers are',
  ])
  await five.getByRole('button').click()
  const d = page.getByTestId('brief-five-drawer')
  await expect(d.getByRole('link', { name: /Stop losing a week to paperwork/ })).toHaveAttribute('href', LIB(5))
  await expect(d.getByRole('link', { name: /Stop losing a week to paperwork/ })).toContainText('Uploaded')

  // the tabs keep no run: each opens its newest
  await page.keyboard.press('Escape')
  await tabs(page).nth(0).click()
  await expect(page).toHaveURL('/briefs')
  await tabs(page).nth(1).click()
  await expect(page).toHaveURL('/briefs?tab=ads')
  await expect(page.getByTestId('brief-bar').getByLabel('Version')).toHaveValue(ADS1)
})

test('Combined: the six cards from both briefs and the company profile, and a creative brief approved', async ({ page }) => {
  await signIn(page, '/briefs?tab=combined')
  await expect(page).toHaveURL('/briefs?tab=combined')
  const orgDay = dayText(at(R.agent_outputs, '97000000-0000-4000-8000-000000000001'), 'UTC')
  const adsDay = dayText(String(R.creative_briefs[0].created_at), 'UTC')
  await expect(page.getByTestId('combo-card')).toHaveText([
    'Angleproof you can check in a weekFrom the ads brief of ' + adsDay,
    'AudienceHead of Operations at Example Advisory GroupYour default buyer, from the company profile',
    'Hook to testProof-first openings keep runningFrom the ads brief of ' + adsDay,
    'OfferReadiness Review · $500Your default offer',
    'ProofExample Case: Cut onboarding to 5 daysApproved proof you may quote',
    'Call to actionBook a callFrom your default offer',
  ])
  await expect(page.getByTestId('combo-using')).toContainText(
    'Using the organic brief of ' + orgDay + ' (not approved yet) and the ads brief of ' + adsDay + ' (not approved yet).',
  )
  await expect(page.getByRole('link', { name: 'Make ads from this' })).toHaveAttribute('href', LEGACY + '/marketing-generation')

  // the creative briefs: done requests with a brief only
  const cr = page.getByTestId('creative')
  await expect(cr).toHaveCount(1)
  await expect(cr).toContainText('Why onboarding stalls')
  await expect(cr).toContainText('Newsletter · from Newsletter from the webinar · ' + dayText(String(R.content_requests[0].created_at), 'UTC'))
  await expect(cr).toContainText('Needs review')
  await cr.click()
  const d = page.getByTestId('creative-drawer')
  await expect(d.getByRole('heading', { level: 2 })).toHaveText('Why onboarding stalls')
  await expect(d).toContainText('Your substanceOur three-step onboardingA client story')
  await expect(d).toContainText('Market packagingLead with the delay buyers feel')
  await expect(d).toContainText('Claims and where they come from5 days on average, from our own records')
  await expect(d).toContainText('Asked forOne newsletter issue')
  await expect(d.getByTestId('creative-decision')).toHaveText('The draft is written alongside this brief. Review both before anything is published.')
  await expect(d.getByRole('link', { name: 'See the draft' })).toHaveAttribute('href', LEGACY + '/content-transformation')
  await d.getByRole('button', { name: 'Approve' }).click()
  await expect(toast(page, 'Brief approved. Drafts use approved briefs first.')).toBeVisible()
  await expect(d).toHaveCount(0)
  await expect(cr).toContainText('Approved')
  expect((await decisions())[0]).toMatchObject({ agent: 'content_generation', target_type: 'brief_approval', target_id: 'content:' + CR, action: 'approved', author: TEAM.email })
  await expect(tabs(page).nth(2).getByLabel('Needs review')).toHaveCount(0)

  // asking for changes on it goes through the same question
  await cr.click()
  await d.getByRole('button', { name: 'Request changes' }).click()
  const q = page.getByRole('dialog', { name: 'What needs to change in this brief?' })
  await q.getByLabel('What needs to change').fill('Use the client story first.')
  await q.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved. It shows on AI settings, where it can become a rule.')).toBeVisible()
  await expect(cr).toContainText('Changes requested')
})

test('Combined follows the approved brief, and says what the profile is missing', async ({ page }) => {
  // the older organic brief approved: Combined uses it over the newer one
  await stubSeed({
    agent_feedback: [
      { id: 'fb-1', agent: 'intel_tracker', target_type: 'brief_approval', target_id: ORG2, action: 'approved', author: 'erin@example.com', created_at: new Date().toISOString() },
    ],
    creative_briefs: [],
    content_requests: [],
    client_personas: [],
    offers: [],
    client_proof: [],
    company_profile: [{ id: 1, industry: '', target_market: 'Independent RIAs; family offices' }],
  })
  await signIn(page, '/briefs?tab=combined')
  const orgDay = dayText(at(R.agent_outputs, '97000000-0000-4000-8000-000000000003'), 'UTC')
  await expect(page.getByTestId('combo-card')).toHaveText([
    'AngleFee talk is upFrom the organic brief of ' + orgDay,
    'AudienceIndependent RIAsFrom the company profile',
    'Hook to testNot set yet',
    'OfferNot set yetAdd it',
    'ProofNot set yetAdd it',
    'Call to actionNot set yetAdd it',
  ])
  await expect(page.getByTestId('combo-card').nth(3).getByRole('link', { name: 'Add it' })).toHaveAttribute('href', LEGACY + '/company-profile')
  await expect(page.getByTestId('combo-using')).toContainText('Using the organic brief of ' + orgDay + ' (approved).')
  await expect(page.getByRole('button', { name: 'Make ads from this' })).toBeDisabled()
  await expect(page.getByTestId('creatives')).toHaveCount(0)
  await expect(page.getByTestId('briefs-status')).toContainText('1 brief waiting for your review')
})

test('the team layout: sections off, moved and added; locked ones stay', async ({ page }) => {
  await stubSeed({
    ai_settings: [
      ...R.ai_settings,
      {
        key: 'brief_structure',
        value: {
          org: { order: ['ev', 'shift', 'x_reg', 'themes', 'dev', 'short', 'hand'], off: ['hand', 'short', 'ev', 'review'], opt: { five: { n: '3', why: 'short' }, ev: { n: 'all' } } },
          ads: { off: ['cross', 'test'] },
        },
      },
    ],
  })
  await signIn(page, '/briefs')
  // the evidence and the review cannot be switched off; an added section says where it is counted
  await expect.poll(() => sections(page)).toEqual(['sec-ev', 'sec-shift', 'sec-x_reg', 'sec-themes', 'sec-dev', 'sec-review'])
  await expect(page.getByTestId('sec-x_reg')).toContainText('Regulation watch')
  await expect(page.getByTestId('sec-x_reg').getByRole('link', { name: 'Open it there' })).toHaveAttribute('href', LEGACY + '/briefs')
  // short reasons: the five things without what the agent saw
  await expect(page.getByTestId('brief-five').getByRole('button').nth(0)).not.toContainText('Northwind shows client results')
  await expect(page.getByRole('navigation', { name: 'In this brief' }).getByRole('button')).toHaveText([
    'Five things',
    'Post evidence',
    'What changed',
    'Regulation watch',
    'Themes',
    'Notable developments',
    'Review',
  ])

  await tabs(page).nth(1).click()
  await expect(page.getByTestId('sec-arch')).toBeVisible()
  await expect(page.getByTestId('sec-cross')).toHaveCount(0)
  await expect(page.getByTestId('sec-test')).toHaveCount(0)
})

test('with no briefs: what each tab says', async ({ page }) => {
  await stubSeed({ agent_outputs: [], creative_briefs: [], content_requests: [] })
  await signIn(page, '/briefs')
  await expect(page.getByTestId('briefs-status')).toContainText('No briefs yet')
  await expect(page.getByText('No organic brief yet')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the Intel Tracker' })).toHaveAttribute('href', '/intel-tracker')
  for (const t of await tabs(page).all()) await expect(t.getByLabel('Needs review')).toHaveCount(0)
  await tabs(page).nth(1).click()
  await expect(page.getByText('No ads brief yet')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the Ad Strategist' })).toHaveAttribute('href', LEGACY + '/ad-strategist')
  await tabs(page).nth(2).click()
  await expect(page.getByTestId('combo-using')).toHaveText('Built from both briefs and your company profile. It updates when either brief is approved.')
})

test('every brief reviewed says so; the page fits a phone', async ({ page }) => {
  await stubSeed({
    agent_feedback: [ORG1, ADS1, 'content:' + CR].map((id, i) => ({
      id: 'fb-' + i,
      agent: 'x',
      target_type: 'brief_approval',
      target_id: id,
      action: 'approved',
      author: 'erin@example.com',
      created_at: new Date(Date.now() - 3 * 36e5).toISOString(),
    })),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/briefs')
  await expect(page.getByTestId('briefs-status')).toContainText('Every brief reviewed')
  await expect(page.getByTestId('brief-decision')).toHaveText('Approved by erin 3h ago')
  for (const path of ['/briefs', '/briefs?tab=ads', '/briefs?tab=combined']) {
    await page.goto(path)
    await expect(page.getByTestId('briefs-panel')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0)
  }
  // the side panels' lists keep to the panel too
  const fits = async (testid: string) =>
    expect(await page.getByTestId(testid).locator('.overflow-y-auto').evaluate((el) => el.scrollWidth - el.clientWidth), testid).toBeLessThanOrEqual(0)
  await page.getByTestId('creative').click()
  await fits('creative-drawer')
  await page.keyboard.press('Escape')
  await page.goto('/briefs?tab=ads')
  await page.getByTestId('brief-five').getByRole('button').nth(0).click()
  await fits('brief-five-drawer')
})
