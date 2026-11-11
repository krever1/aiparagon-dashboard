import { type Page, expect, test } from '@playwright/test'
import { spanText } from '../../src/components/pipeline/dates'
import { dayText } from '../../src/components/ui/local-date'
import { nextRun, scheduleOf } from '../../src/lib/pipeline/intel'
import { whenText } from '../../src/lib/touchpoint/today'
import { LEGACY, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { C, P, R, RUN_A, RUN_B, RUN_C, U, intelRows } from './intel-fixtures'

// The Intel Tracker: the run on screen with its posts, filters and the address, a post in full and why it is in the
// brief, the replies, the five things and themes, the run library and another run, who and what it follows, and Run
// now through n8n. On the made-up rows in tests/e2e/intel-fixtures.ts.

test.use({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] })

const cards = (page: Page) => page.getByTestId('post')
const card = (page: Page, n: number) => page.locator(`[data-testid="post"][data-id="${P(n)}"]`)
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Intel Tracker' }).getByRole('tab')
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const order = async (page: Page) => cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))
const setting = async (key: string) => (await stubRows<{ key: string; value: unknown }>('ai_settings')).find((r) => r.key === key)?.value

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(intelRows())
})

test('the run on screen: its status, numbers and tabs, and its posts as cards, best first', async ({ page }) => {
  await signIn(page, '/intel-tracker')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Intel Tracker')
  const status = page.getByTestId('intel-status')
  await expect(status).toContainText('Weekly · last ran ' + whenText('2026-11-09T14:08:00Z', 'UTC'))
  const next = nextRun(scheduleOf({ intel: { cadence: 'weekly', day: 'mon', time: '06:00', tz: 'America/Los_Angeles' } }), Date.now())!
  await expect(status).toContainText('Next run ' + whenText(new Date(next).toISOString(), 'UTC'))
  await expect(status).toContainText('This run covers ' + spanText('2026-11-02T14:00:00.000Z', '2026-11-09T14:00:00.000Z', 'UTC'))
  await expect(status.getByLabel('Pick a run').locator('option')).toHaveText([
    dayText('2026-11-09T14:08:00Z', 'UTC') + ' · latest',
    dayText('2026-11-02T14:09:00Z', 'UTC'),
    dayText('2026-10-26T13:00:00Z', 'UTC'),
  ])
  await expect(page.getByRole('list', { name: 'What it does' }).getByRole('listitem')).toHaveText([
    'Reads 3 accounts and 1 topics weekly',
    'Rates every post',
    'Drafts replies for you',
    'Feeds the organic brief',
  ])
  await expect(page.getByTestId('intel-stats').getByRole('button')).toHaveText(['6posts read', '3in the brief', '2high value', '2replies drafted', '0themes'])
  await expect(tabs(page)).toHaveText(['Posts 6', 'Replies 2', 'Takeaways & themes', 'Run library 3', 'Following 3'])

  // by score, then value, then engagement
  expect(await order(page)).toEqual([P(1), P(2), P(5), P(3), P(6), P(4)])
  const c1 = card(page, 1)
  await expect(c1.getByRole('img', { name: 'Score 82 of 100' })).toBeVisible()
  await expect(c1).toContainText('Show the proof, not the promise')
  await expect(c1).toContainText('High value340 engagementIn the brief')
  await expect(c1).toContainText('Northwind Advisors · Wealth partners')
  await expect(c1).toContainText('Following · Opinion post · ' + dayText('2026-11-03T10:00:00Z', 'UTC'))
  await expect(c1).toContainText('300 reactions30 comments10 reposts')
  await expect(c1.getByRole('link', { name: 'View on LinkedIn' })).toHaveAttribute('href', U(1))
  await expect(c1).toContainText('Why this score. On topic for advisors and backed by numbers.')
  await expect(c1.getByRole('button', { name: 'AI adoption' })).toBeVisible()
  // left out of the brief, and why on hover
  await expect(card(page, 4).getByText('Not used')).toHaveAttribute('title', 'Left out: off-topic for your buyers')
  await expect(card(page, 4)).toContainText('Why it is low value.')
  // a web article has no counts
  await expect(card(page, 5)).toContainText('Found by topic search · How-to guide')
  await expect(card(page, 5)).toContainText('Engagement 0')
  await expect(page.getByTestId('posts-foot')).toHaveText('6 posts read in this run.')
})

test('filters: value, theme, the brief it went into, words and sort; a list; the address keeps them', async ({ page }) => {
  await signIn(page, '/intel-tracker')
  const value = page.getByRole('group', { name: 'Value' })
  await expect(value.getByRole('button')).toHaveText(['All6', 'High value2', 'Medium3', 'Low value1'])
  await value.getByRole('button', { name: /High value/ }).click()
  expect(await order(page)).toEqual([P(1), P(2)])
  // the newest run needs no name in the address
  await expect(page).toHaveURL(/\/intel-tracker\?val=high$/)
  await expect(page.getByTestId('posts-foot')).toHaveText('Showing 2 of 6 posts read in this run.')

  await value.getByRole('button', { name: /^All/ }).click()
  await page.getByLabel('Theme').selectOption({ label: 'Client experience (2)' })
  expect(await order(page)).toEqual([P(1), P(2)])
  await page.getByLabel('Theme').selectOption('')
  await expect(page.getByLabel('Captured in').locator('option')).toHaveText(['Captured in: all', '9 Nov 2026', 'Not used'])
  await page.getByLabel('Captured in').selectOption('out')
  expect(await order(page)).toEqual([P(5), P(6), P(4)])
  await expect(page).toHaveURL(/cap=out/)
  await page.getByLabel('Captured in').selectOption('in')
  expect(await order(page)).toEqual([P(1), P(2), P(3)])
  await page.getByLabel('Captured in').selectOption('')
  await page.getByLabel('Search posts').fill('governance')
  expect(await order(page)).toEqual([P(3)])
  await page.getByLabel('Search posts').fill('no such words')
  await expect(page.getByText('Nothing matches')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(cards(page)).toHaveCount(6)
  await page.getByLabel('Sort').selectOption('eng')
  expect(await order(page)).toEqual([P(4), P(1), P(2), P(3), P(6), P(5)])
  await page.getByLabel('Sort').selectOption('new')
  expect((await order(page))[0]).toBe(P(6))

  // the list
  await page.getByTestId('posts-toolbar').getByRole('button', { name: 'List', exact: true }).click()
  const rows = page.getByTestId('post-row')
  await expect(rows).toHaveCount(6)
  await expect(page.getByRole('columnheader')).toHaveText(['Post', 'Found by', 'Value', 'Engagement', 'Themes', 'Captured ini', 'Date'])
  await page.getByLabel('Sort').selectOption('value')
  await expect(rows.first()).toContainText('Show the proof, not the promise')
  await expect(rows.first()).toContainText('9 Nov 2026')
  await expect(rows.last()).toContainText('Not used')
  // the info behind Captured in
  await page.getByRole('button', { name: 'Captured in brief version' }).click()
  const info = page.getByRole('dialog', { name: 'Captured in brief version' })
  await expect(info).toContainText('top 3 on-topic posts it read')
  await info.getByRole('button', { name: 'Got it' }).click()

  // a link with filters opens with them
  await page.goto(`/intel-tracker?run=${RUN_A}&val=medium&theme=governance`)
  expect(await order(page)).toEqual([P(3)])
  await expect(page).toHaveURL(/\/intel-tracker\?val=medium&theme=governance$/)
  // how posts are rated
  await page.getByRole('button', { name: 'How ratings work' }).click()
  const how = page.getByRole('dialog', { name: 'How posts are rated' })
  await expect(how).toContainText('Buyer relevance35%')
  await expect(how).toContainText('High value · 70 and up')
  await expect(how).toContainText('up to 50 posts a run')
  await page.keyboard.press('Escape')
})

test('a post in full: its score, why it is in the brief, its reply, approved from here', async ({ page }) => {
  await signIn(page, '/intel-tracker')
  await card(page, 1).getByRole('button', { name: 'Full analysis' }).click()
  const d = page.getByTestId('post-drawer')
  await expect(d.getByRole('heading', { level: 2 })).toHaveText('Show the proof, not the promise')
  await expect(d).toContainText('Post · ' + dayText('2026-11-09T14:08:00Z', 'UTC') + ' run')
  await expect(d).toContainText('82 out of 100, weighted from five factors. High value is 70 or more.')
  await expect(d.getByTestId('factors')).toContainText('Buyer relevance35% of score31.5 pts')
  const cap = d.getByTestId('post-cap')
  await expect(cap).toContainText('Why it is in the brief')
  await expect(cap).toContainText('Found: from Northwind Advisors, who you follow.')
  await expect(cap).toContainText('High value: Advisors want proof before they book a call.')
  await expect(cap).toContainText('Captured in the organic brief of 9 Nov 2026.')
  await expect(cap.getByRole('link', { name: 'Open the brief' })).toHaveAttribute('href', '/briefs?run=' + RUN_A)
  await expect(d).toContainText('Feeds these takeaways')
  await expect(d).toContainText('Proof beats promises')
  await expect(d.getByRole('link', { name: 'Write a post on this' })).toHaveAttribute('href', LEGACY + '/content-transformation')
  await d.getByText('Read the full post').click()
  await expect(d).toContainText('Line two of the post.')
  await expect(d).toContainText('Waiting')
  await d.getByRole('button', { name: 'Edit and approve' }).click()
  const w = page.getByRole('dialog', { name: 'Reply to Northwind Advisors' })
  await w.getByRole('button', { name: 'Approve' }).click()
  await expect(toast(page, 'Approved')).toBeVisible()
  expect((await stubRows<Record<string, unknown>>('engagement_drafts')).find((r) => r.id === R(1))?.status).toBe('approved')

  // a post left out says why
  await page.getByTestId('intel-panel').getByRole('button', { name: 'We are hiring' }).click()
  await expect(page.getByTestId('post-cap')).toContainText('Left out: the agent judged it off-topic for your buyers, so it is not in the brief.')
  await expect(page.getByTestId('post-cap')).toContainText('Read for the organic brief of 9 Nov 2026, but not used in it.')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('post-drawer')).toHaveCount(0)
})

test('replies: by status, the post each answers, and one rejected with a reason', async ({ page }) => {
  await signIn(page, '/intel-tracker?tab=replies')
  const r = page.getByTestId('replies')
  await expect(r.getByRole('group', { name: 'Status' }).getByRole('button')).toHaveText(['All2', 'Waiting1', 'Approved1', 'Rejected0'])
  await expect(r.getByTestId('reply')).toHaveCount(2)
  await expect(r.locator(`[data-id="${R(1)}"]`)).toContainText('Comment on Northwind Advisors’ postWaiting')
  await expect(r.locator(`[data-id="${R(2)}"]`)).toContainText('Quote post on Example Ridge Advisors’ postApproved')
  await expect(r.locator(`[data-id="${R(2)}"]`).getByRole('button', { name: 'Review' })).toHaveCount(0)
  await r.getByRole('button', { name: 'Approved' }).click()
  await expect(r.getByTestId('reply')).toHaveCount(1)
  await r.getByRole('button', { name: /^All/ }).click()
  await r.locator(`[data-id="${R(2)}"]`).getByRole('button', { name: /Replying to/ }).click()
  await expect(page.getByTestId('post-drawer').getByRole('heading', { level: 2 })).toHaveText('Onboarding in days, not weeks')
  await page.keyboard.press('Escape')

  await r.locator(`[data-id="${R(1)}"]`).getByRole('button', { name: 'Review' }).click()
  await page.getByRole('dialog', { name: 'Reply to Northwind Advisors' }).getByRole('button', { name: 'Reject' }).click()
  const why = page.getByRole('dialog', { name: 'Why reject this reply?' })
  await why.getByRole('button', { name: 'Too salesy' }).click()
  await why.getByRole('button', { name: 'Reject' }).click()
  await expect(toast(page, 'Rejected. The reason is on AI settings, where it can become a rule the tracker follows.')).toBeVisible()
  const fb = (await stubRows<Record<string, unknown>>('agent_feedback')).find((x) => x.target_id === R(1))
  expect(fb).toMatchObject({ agent: 'intel_tracker', target_type: 'engagement_draft', action: 'rejected', feedback: 'Reply: too salesy.', author: TEAM.email })
})

test('takeaways: the five things and the posts behind each, themes, shifts in language', async ({ page }) => {
  await signIn(page, '/intel-tracker?tab=takeaways')
  const t = page.getByTestId('takeaways')
  await expect(t).toContainText('From the brief of ' + dayText('2026-11-09T14:08:00Z', 'UTC') + ' · select one for its sources')
  const five = t.getByTestId('five').getByRole('button')
  await expect(five).toHaveCount(4)
  await expect(five.first()).toContainText('Proof beats promises')
  await expect(five.first()).toContainText('1 source')
  await five.first().click()
  const d = page.getByTestId('five-drawer')
  await expect(d).toContainText('What the tracker saw')
  await expect(d.getByRole('button', { name: /Show the proof/ })).toBeVisible()
  await d.getByRole('button', { name: 'See them in Posts' }).click()
  await expect(page.getByTestId('posts-src')).toContainText('Showing the 1 post closest to Proof beats promises.')
  await expect(page).toHaveURL(/five=0/)
  expect(await order(page)).toEqual([P(1)])
  await page.getByRole('button', { name: 'Show all posts' }).click()
  await expect(cards(page)).toHaveCount(6)

  await tabs(page).nth(2).click()
  const themes = page.getByTestId('themes')
  await expect(themes).toContainText('posts per theme, of 6 read')
  await themes.getByRole('button', { name: /Governance/ }).click()
  expect(await order(page)).toEqual([P(3)])
  await tabs(page).nth(2).click()
  await expect(page.getByTestId('takeaways')).toContainText('These takeaways built the organic brief of ' + dayText('2026-11-09T14:08:00Z', 'UTC') + '.')
  await expect(page.getByRole('link', { name: 'Open the brief' })).toHaveAttribute('href', '/briefs?run=' + RUN_A)
  await page.getByRole('button', { name: /Firms now promise onboarding in days/ }).click()
  await expect(page.getByTestId('post-drawer')).toContainText('A shift in language')
})

test('the run library, another run whose posts are not stored, and one that did not finish', async ({ page }) => {
  await signIn(page, '/intel-tracker?tab=library')
  const runs = page.getByTestId('run-card')
  await expect(runs).toHaveCount(3)
  await expect(runs.nth(0)).toContainText('Weekly run' + whenText('2026-11-09T14:08:00Z', 'UTC'))
  await expect(runs.nth(0)).toContainText('Latest')
  await expect(runs.nth(0)).toContainText('6read2high value2replies')
  await expect(runs.nth(0)).toContainText('AI adoption · 3')
  await expect(runs.nth(0)).toContainText('Lead finding: Proof beats promises')
  await expect(runs.nth(1)).toContainText('Lead finding: Flat fees are the talk of the week')
  await expect(runs.nth(2)).toContainText('Did not finish')
  await expect(runs.nth(1).getByRole('link', { name: 'Brief' })).toHaveAttribute('href', '/briefs?run=' + RUN_B)
  const across = page.getByTestId('across')
  await expect(across.getByRole('columnheader')).toHaveText(['Theme', dayText('2026-11-09T14:08:00Z', 'UTC'), dayText('2026-11-02T14:09:00Z', 'UTC')])
  await expect(across.getByRole('row').nth(1)).toHaveText('AI adoption50%25%')
  await expect(across).toContainText('Value and results–75%')

  await runs.nth(1).getByRole('button', { name: 'Open this run' }).click()
  await expect(page).toHaveURL(new RegExp(`\\?run=${RUN_B}$`))
  await expect(page.getByText('The posts from this run are not stored')).toBeVisible()
  await expect(page.getByText('Its brief still has what the tracker found.')).toBeVisible()
  await expect(page.getByTestId('intel-stats').getByRole('button')).toHaveText(['4posts read', '0in the brief', '1high value', '0replies drafted', '1theme'])
  await page.getByRole('button', { name: 'See the takeaways' }).click()
  await expect(page.getByTestId('five').getByRole('button')).toHaveText(['1PricingFlat fees are the talk of the weekFour posts compared flat and asset-based feesRead across the run'])
  await expect(page.getByTestId('themes')).toContainText('posts per theme, as the brief counted them')
  await expect(page.getByTestId('themes').getByRole('button')).toHaveCount(0)

  await page.getByLabel('Pick a run').selectOption(RUN_C)
  await expect(page).toHaveURL(new RegExp(`\\?run=${RUN_C}&tab=takeaways$`))
  await expect(page.getByText('No takeaways for this run')).toBeVisible()
  await page.goto(`/intel-tracker?run=${RUN_C}`)
  await expect(page.getByText('No posts in this run')).toBeVisible()
  // back to the newest: the address names no run again
  await page.getByLabel('Pick a run').selectOption(RUN_A)
  await expect(page).toHaveURL(/\/intel-tracker$/)
  await expect(cards(page)).toHaveCount(6)
})

test('following: what it reads for, what it tracks, who it follows and the searches', async ({ page }) => {
  await signIn(page, '/intel-tracker?tab=follow')
  await expect(page.getByTestId('reads-for')).toContainText(
    'Reads for AI consulting for wealth management firms, selling to Growth-stage RIAs and independent advisory firms.',
  )
  await page.getByTestId('reads-for').getByRole('button', { name: 'Change' }).click()
  const ind = page.getByRole('dialog', { name: 'What industry is this run for?' })
  await ind.getByLabel('Industry').fill('')
  await ind.getByRole('button', { name: 'Save' }).click()
  await expect(ind).toContainText('Add the industry.')
  await ind.getByLabel('Industry').fill('AI consulting for advisory firms')
  await ind.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved. The next Intel Tracker and Ad Strategist runs use it.')).toBeVisible()
  expect((await stubRows<Record<string, unknown>>('company_profile'))[0]).toMatchObject({ industry: 'AI consulting for advisory firms', updated_by: TEAM.email })
  await expect(page.getByTestId('reads-for')).toContainText('Reads for AI consulting for advisory firms')

  // what it tracks
  const focus = page.getByTestId('focus')
  await expect(focus.getByTestId('focus-msg')).toHaveText('Tracking every theme and category until you change them.')
  await focus.getByRole('button', { name: 'Hiring' }).click()
  await expect(focus.getByTestId('focus-msg')).toHaveText('Not saved yet.')
  await focus.getByLabel('Add a theme').fill('Estate law')
  await focus.getByRole('button', { name: 'Add' }).click()
  await focus.getByLabel('Add a theme').fill('estate LAW')
  await focus.getByRole('button', { name: 'Add' }).click()
  await expect(focus.getByTestId('focus-msg')).toHaveText('That theme is already on the list.')
  await focus.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved. The next run tracks these.')).toBeVisible()
  const saved = (await setting('intel_focus')) as Record<string, unknown>
  expect(saved.themes).not.toContain('hiring')
  expect(saved).toMatchObject({ custom: ['Estate law'], updated_by: TEAM.email })
  expect((saved.categories as string[]).length).toBe(9)
  await expect(page.getByTestId('focus').getByTestId('focus-msg')).toHaveText('Saved. Changes apply from the next run.')

  // who it follows: people and companies, ads only apart, stopped below
  await expect(page.getByTestId('follow-person')).toContainText('People1')
  await expect(page.getByTestId('follow-company')).toContainText('Companies2')
  const nw = page.locator(`[data-testid="follow-row"][data-id="${C(1)}"]`)
  await expect(nw).toContainText('Northwind AdvisorsWealth management')
  await expect(nw.getByRole('link', { name: 'LinkedIn ↗' })).toHaveAttribute('href', 'https://www.linkedin.com/company/northwind-advisors')
  await expect(nw).toContainText('by qa.teammate')
  await page.getByTestId('ads-only').getByText('Followed for ads only (1)').click()
  await page.getByTestId('ads-only').getByRole('button', { name: 'Read their posts too' }).click()
  await expect(toast(page, 'From the next run the Intel Tracker reads Ads Only Co’s posts too.')).toBeVisible()
  expect((await stubRows<Record<string, unknown>>('competitors')).find((c) => c.id === C(4))?.follow_for).toBe('both')
  await expect(page.getByTestId('follow-company')).toContainText('Companies3')

  // stop following asks first
  page.once('dialog', (d) => void d.accept())
  await page.locator(`[data-testid="follow-row"][data-id="${C(2)}"]`).getByRole('button', { name: 'Stop following' }).click()
  await expect(toast(page, 'Stopped following Acme Wealth.')).toBeVisible()
  expect((await stubRows<Record<string, unknown>>('competitors')).find((c) => c.id === C(2))?.status).toBe('denied')
  await page.getByTestId('stopped').getByText('Stopped following (2)').click()
  await page.getByTestId('stopped').locator(`[data-id="${C(5)}"]`).getByRole('button', { name: 'Follow again' }).click()
  await expect(toast(page, 'Following Stopped Firm again.')).toBeVisible()

  // follow someone new
  await page.getByRole('button', { name: '+ Add a person' }).click()
  const dlg = page.getByRole('dialog', { name: 'Follow a person' })
  await dlg.getByLabel('Name').fill('Northwind Advisors')
  await dlg.getByRole('button', { name: 'Follow' }).click()
  await expect(dlg).toContainText('Northwind Advisors is already on the list.')
  await dlg.getByLabel('Name').fill('Jane Example')
  await dlg.getByLabel('LinkedIn link').fill('https://example.com/jane')
  await dlg.getByRole('button', { name: 'Follow' }).click()
  await expect(dlg).toContainText('That does not look like a LinkedIn link.')
  await dlg.getByLabel('LinkedIn link').fill('https://www.linkedin.com/in/jane-example/')
  await dlg.getByRole('button', { name: 'Follow' }).click()
  await expect(toast(page, 'Following Jane Example. The next run reads their posts.')).toBeVisible()
  expect((await stubRows<Record<string, unknown>>('competitors')).find((c) => c.name === 'Jane Example')).toMatchObject({
    handle_linkedin: 'in/jane-example',
    follow_kind: 'person',
    status: 'approved',
    source: 'manual',
    added_by: TEAM.email,
  })

  // the searches
  const terms = page.getByTestId('terms')
  await expect(terms).toContainText('2 of 12 searches used')
  await terms.getByLabel('Add to topics').fill('ai governance')
  await terms.getByTestId('terms-topics').getByRole('button', { name: 'Add' }).click()
  await expect(terms.getByRole('alert')).toHaveText('“ai governance” is already on the list.')
  await terms.getByLabel('Add to topics').fill('Wealth tech')
  await terms.getByTestId('terms-topics').getByRole('button', { name: 'Add' }).click()
  await expect(toast(page, 'Added. The next run searches for it.')).toBeVisible()
  expect(await setting('intel_follow')).toEqual({ topics: ['AI governance', 'Wealth tech'], tech: ['Microsoft Copilot'], industries: [] })
  expect(await setting('intel_keywords')).toEqual(['AI governance', 'Wealth tech', 'Microsoft Copilot'])
  await terms.getByRole('button', { name: 'Remove Microsoft Copilot' }).click()
  await expect(toast(page, 'Removed “Microsoft Copilot”.')).toBeVisible()
  await expect(page.getByTestId('terms')).toContainText('2 of 12 searches used')
})

test('Run now: the names are checked first, a pasted list, then the run starts and the header says so', async ({ page }) => {
  await signIn(page, '/intel-tracker')
  await page.getByRole('button', { name: 'Run now' }).click()
  const d = page.getByRole('dialog', { name: 'Run now with new names' })
  await expect(d.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused()
  await d.getByRole('button', { name: 'Start the run' }).click()
  await expect(d.getByRole('alert')).toHaveText('Add at least one competitor.')
  await d.getByRole('textbox', { name: 'Name', exact: true }).fill('Acme Advisory')
  await d.getByRole('button', { name: 'Start the run' }).click()
  await expect(d.getByRole('alert')).toHaveText('Acme Advisory: add a website or at least one social profile so the tracker has something to read.')
  await d.getByLabel('Website').fill('acme.example')
  await d.getByRole('button', { name: 'Paste a list' }).click()
  await d.getByLabel('One competitor per line: name, website, LinkedIn, X, Facebook').fill('Northwind AI, northwind.example, linkedin.com/company/northwind-ai\nBeta Partners, @betapartners')
  await d.getByRole('button', { name: 'Add these' }).click()
  await expect(toast(page, '2 competitors added to the form')).toBeVisible()
  await expect(d.getByTestId('run-row')).toHaveCount(3)
  await d.getByLabel('Then build an ad strategy from it').check()
  await d.getByRole('button', { name: 'Start the run' }).click()
  await expect(toast(page, 'Intel run started. The brief lands in 5 to 15 minutes, marked as a custom run.')).toBeVisible()
  const sent = (await stubCalls()).filter((c) => c.method === 'POST' && c.path === '/webhook/intel-run')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    competitors: [
      { name: 'Acme Advisory', website: 'acme.example' },
      { name: 'Northwind AI', website: 'northwind.example', linkedin: 'linkedin.com/company/northwind-ai' },
      { name: 'Beta Partners', x: '@betapartners' },
    ],
    only_new: true,
    cascade: true,
  })
  const kept = (await setting('intel_runs')) as { runs: Record<string, unknown>[] }
  expect(kept.runs[0]).toMatchObject({ run_id: 'agent1_custom_stub', names: ['Acme Advisory', 'Northwind AI', 'Beta Partners'], by: TEAM.email, cascade: true })
  await expect(page.getByTestId('intel-status')).toContainText('A run started')

  // the workflow switched off says which one to switch on
  await stubHook('intel-run', 404, { message: 'not registered' })
  await page.getByRole('button', { name: 'Run now' }).click()
  const d2 = page.getByRole('dialog', { name: 'Run now with new names' })
  await d2.getByRole('textbox', { name: 'Name', exact: true }).fill('Gamma Group')
  await d2.getByLabel('Website').fill('gamma.example')
  await d2.getByRole('button', { name: 'Start the run' }).click()
  await expect(d2.getByRole('alert')).toContainText('The Intel Tracker workflow is not switched on yet.')
})

test('a phone: nothing runs off the side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/intel-tracker')
  await expect(cards(page)).toHaveCount(6)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.goto('/intel-tracker?tab=follow')
  await expect(page.getByTestId('follows')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.goto('/intel-tracker?tab=library')
  await expect(page.getByTestId('run-card')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
