import { type Page, expect, test } from '@playwright/test'
import { LEGACY, TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { RID, approvalRows, reply } from './approvals-fixtures'

// Approvals: the briefs and the Intel Tracker's replies waiting for a person, the tabs, approving several at once and
// undoing it, skipping for now, a reply's window (edit, copy, approve, reject with a reason). On the made-up rows in
// tests/e2e/approvals-fixtures.ts.

test.use({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] })

const ORG = 'brief:intel_tracker:intel_run_new'
const ADS = 'brief:ad_strategist:ads_run_new'
const R = (n: number) => 'reply:' + RID(n)

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Filter' }).getByRole('tab')
const list = (page: Page) => page.getByTestId('approval-list').getByTestId('approval')
const row = (page: Page, key: string) => page.locator(`[data-testid="approval"][data-key="${key}"]`)
const status = (page: Page) => page.getByTestId('approvals-status')
const bulk = (page: Page) => page.getByRole('region', { name: 'Selection' })
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const undo = (page: Page) => page.getByTestId('toasts').getByRole('button', { name: 'Undo' })

const draftOf = async (n: number) => (await stubRows<Record<string, unknown>>('engagement_drafts')).find((r) => r.id === RID(n))!
const said = async () =>
  (await stubRows<Record<string, unknown>>('agent_feedback')).map((f) => [f.agent, f.target_type, f.target_id, f.action, f.feedback, f.author].join(' | '))

/** A day as the page draws it in UTC: "5 Nov", with the year when it is not this year. */
function day(iso: string) {
  const d = new Date(iso)
  const year = (x: Date) => x.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'UTC' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', ...(year(d) !== year(new Date()) ? { year: 'numeric' as const } : {}) })
}

let rows: ReturnType<typeof approvalRows>
test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  rows = approvalRows()
  await stubSeed(rows)
})

test('everything waiting: the tabs, the counts and what each row says', async ({ page }) => {
  await signIn(page, '/approvals')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Approvals')
  await expect(status(page)).toContainText('8 waiting')
  await expect(status(page)).toContainText('Nothing posts or goes live until you approve it')
  await expect(status(page).getByRole('listitem')).toHaveText(['Approve in bulk', 'Edit before approving', 'Undo anytime'])
  await expect(tabs(page)).toHaveText(['All 8', 'Briefs 2', 'Replies 6'])
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true')

  // the briefs first, then five of the replies, newest first
  await expect(list(page)).toHaveCount(7)
  expect(await list(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-key')))).toEqual([ORG, ADS, R(1), R(2), R(3), R(4), R(5)])
  const org = row(page, ORG)
  await expect(org.locator('b').first()).toHaveText('Organic brief · ' + day(rows.agent_outputs[0].created_at))
  await expect(org).toContainText('Onboarding is the theme. Three firms you follow posted about slow client onboarding this week.')
  await expect(org).toContainText('From Intel Tracker')
  await expect(org).toContainText('12 posts')
  await expect(org.getByRole('link', { name: 'Review' })).toHaveAttribute('href', LEGACY + '/briefs')
  await expect(row(page, ADS)).toContainText('Onboarding should take days, not weeks')
  await expect(row(page, ADS)).toContainText('20 days old')
  await expect(row(page, R(1)).locator('b').first()).toHaveText('Reply to Northwind Advisors')
  await expect(row(page, R(1))).toContainText('LinkedIn' + day(rows.engagement_drafts[0].created_at))
  await expect(row(page, R(2)).locator('b').first()).toHaveText('Quote post on Sample Peak Partners')
  await expect(row(page, R(1)).getByRole('button', { name: 'Review' })).toBeVisible()

  // the sixth reply is behind the line under them; the old ones are not on All; an approved one is not here at all
  await expect(row(page, R(6))).toHaveCount(0)
  await expect(row(page, R(9))).toHaveCount(0)
  await expect(page.getByTestId('older')).toHaveCount(0)
  await page.getByRole('button', { name: '1 reply more from the Intel Tracker' }).click()
  await expect(page).toHaveURL(/\/approvals\?tab=replies$/)
  await expect(tabs(page).nth(2)).toHaveAttribute('aria-selected', 'true')
  await expect(list(page)).toHaveCount(6)
  const older = page.getByTestId('older')
  await expect(older.locator('summary')).toHaveText('Older than a week 2')
  await older.locator('summary').click()
  await expect(older).toContainText('The posts these reply to are more than a week old, so they are left out of the count.')
  await expect(older.getByTestId('approval')).toHaveCount(2)
  await expect(row(page, R(8))).toContainText('Harbor Example Group')
})

test('the tab is the address’s; one with nothing in it shows All, and the address follows', async ({ page }) => {
  await signIn(page, '/approvals?tab=briefs')
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(list(page)).toHaveCount(2)
  await tabs(page).first().click()
  await expect(page).toHaveURL(/\/approvals$/)
  await expect(list(page)).toHaveCount(7)

  await page.goto('/approvals?tab=ads')
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/\/approvals$/)
})

test('approve several together, then undo them', async ({ page }) => {
  await signIn(page, '/approvals')
  await row(page, ORG).getByRole('checkbox', { name: 'Select Organic brief' }).click()
  await row(page, R(1)).getByRole('checkbox', { name: 'Select Reply to Northwind Advisors' }).click()
  await expect(row(page, R(1)).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await expect(bulk(page)).toContainText('2 selected')
  await bulk(page).getByRole('button', { name: 'Approve 2' }).click()
  await expect(toast(page, 'Approved 2')).toBeVisible()
  await expect(row(page, ORG)).toHaveCount(0)
  await expect(row(page, R(1))).toHaveCount(0)
  await expect(bulk(page)).toHaveCount(0)
  await expect(status(page)).toContainText('6 waiting')
  await expect(tabs(page)).toHaveText(['All 6', 'Briefs 1', 'Replies 5'])
  expect((await draftOf(1)).status).toBe('approved')
  expect(await said()).toEqual([
    `intel_tracker | brief_approval | intel_run_new | approved | Approved in Approvals | ${TEAM.email}`,
    `intel_tracker | engagement_draft | ${RID(1)} | approved | Reviewed on the dashboard | ${TEAM.email}`,
  ])

  await undo(page).click()
  await expect(toast(page, 'Undone. They are waiting again.')).toBeVisible()
  await expect(row(page, ORG)).toBeVisible()
  await expect(row(page, R(1))).toBeVisible()
  await expect(tabs(page)).toHaveText(['All 8', 'Briefs 2', 'Replies 6'])
  expect((await draftOf(1)).status).toBe('pending')
  expect((await said()).slice(2)).toEqual([
    `intel_tracker | brief_approval | intel_run_new | reopened | Undone in Approvals | ${TEAM.email}`,
    `intel_tracker | engagement_draft | ${RID(1)} | reopened | Undone in Approvals | ${TEAM.email}`,
  ])
})

test('Select all, a tab change clears the selection, and one approved from its own button', async ({ page }) => {
  await signIn(page, '/approvals?tab=replies')
  const all = page.getByRole('button', { name: 'Select all' })
  await all.click()
  await expect(bulk(page)).toContainText('6 selected')
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  await all.click()
  await expect(bulk(page)).toHaveCount(0)

  await row(page, R(3)).getByRole('checkbox').click()
  await expect(bulk(page)).toContainText('1 selected')
  await bulk(page).getByRole('button', { name: 'Clear' }).click()
  await expect(bulk(page)).toHaveCount(0)
  await row(page, R(3)).getByRole('checkbox').click()
  await tabs(page).first().click()
  await expect(bulk(page)).toHaveCount(0)

  await row(page, ADS).getByRole('button', { name: 'Approve' }).click()
  await expect(toast(page, 'Approved')).toBeVisible()
  await expect(row(page, ADS)).toHaveCount(0)
  expect(await said()).toEqual([`ad_strategist | brief_approval | ads_run_new | approved | Approved in Approvals | ${TEAM.email}`])
  await undo(page).click()
  await expect(toast(page, 'Undone. It is waiting again.')).toBeVisible()
  await expect(row(page, ADS)).toBeVisible()
})

test('skip for now: kept in this browser, in a tab of its own, and brought back; nothing is saved', async ({ page }) => {
  await signIn(page, '/approvals')
  await row(page, R(1)).getByRole('button', { name: 'Skip' }).click()
  await expect(toast(page, 'Skipped for now')).toBeVisible()
  await expect(row(page, R(1))).toHaveCount(0)
  await expect(tabs(page)).toHaveText(['All 7', 'Briefs 2', 'Replies 5', 'Skipped 1'])
  await expect(status(page)).toContainText('7 waiting')
  // five replies left, so the sixth shows on All
  await expect(row(page, R(6))).toBeVisible()
  await expect(page.getByRole('button', { name: /more from the Intel Tracker/ })).toHaveCount(0)

  await page.reload()
  await expect(tabs(page)).toHaveText(['All 7', 'Briefs 2', 'Replies 5', 'Skipped 1'])
  await tabs(page).last().click()
  await expect(page).toHaveURL(/\/approvals\?tab=skipped$/)
  await page.reload()
  await expect(tabs(page).last()).toHaveAttribute('aria-selected', 'true')
  await expect(list(page)).toHaveCount(1)
  await expect(row(page, R(1)).getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Select all' })).toHaveCount(0)
  await row(page, R(1)).getByRole('button', { name: 'Bring back' }).click()
  await expect(tabs(page)).toHaveText(['All 8', 'Briefs 2', 'Replies 6'])
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/\/approvals$/)

  // several at once, then Undo; a later skip stays on All
  await row(page, R(2)).getByRole('checkbox').click()
  await row(page, R(3)).getByRole('checkbox').click()
  await bulk(page).getByRole('button', { name: 'Skip' }).click()
  await expect(toast(page, 'Skipped 2')).toBeVisible()
  await expect(tabs(page).last()).toHaveText('Skipped 2')
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true')
  await undo(page).click()
  await expect(tabs(page)).toHaveText(['All 8', 'Briefs 2', 'Replies 6'])
  expect(await said()).toEqual([])
  expect((await draftOf(2)).status).toBe('pending')
})

test('a reply in its window: edit it, copy it, approve it', async ({ page }) => {
  await signIn(page, '/approvals')
  await row(page, R(1)).getByRole('button', { name: 'Review' }).click()
  const dlg = page.getByRole('dialog', { name: 'Reply to Northwind Advisors' })
  await expect(dlg.locator('p').first()).toHaveText('Reply · LinkedIn · ' + day(rows.engagement_drafts[0].created_at))
  await expect(dlg.getByRole('link', { name: 'Open the post it answers' })).toHaveAttribute('href', rows.engagement_drafts[0].source_url)
  const box = dlg.getByRole('textbox', { name: /The drafted reply/ })
  await expect(box).toHaveValue('Thanks for sharing this, Northwind Advisors. We see the same with onboarding.')
  await expect(dlg).toContainText('Approving does not post it. You copy it and post it yourself.')
  await box.fill('Good point on onboarding. We cut it to days by automating one workflow first.')
  await dlg.getByRole('button', { name: 'Copy' }).click()
  await expect(toast(page, 'Copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Good point on onboarding. We cut it to days by automating one workflow first.')
  await dlg.getByRole('button', { name: 'Approve' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(toast(page, 'Approved')).toBeVisible()
  await expect(row(page, R(1))).toHaveCount(0)
  const saved = await draftOf(1)
  expect([saved.status, saved.draft]).toEqual(['approved', 'Good point on onboarding. We cut it to days by automating one workflow first.'])
  expect(await said()).toEqual([`intel_tracker | engagement_draft | ${RID(1)} | approved | Reviewed on the dashboard | ${TEAM.email}`])

  // a quote post, whose link is not a web address: no link to open; Esc closes it and saves nothing
  await row(page, R(2)).getByRole('button', { name: 'Review' }).click()
  const quote = page.getByRole('dialog', { name: 'Quote post on Sample Peak Partners' })
  await expect(quote.locator('p').first()).toHaveText('Quote post · X · ' + day(rows.engagement_drafts[1].created_at))
  await expect(quote.getByRole('textbox', { name: /The drafted quote post/ })).toBeVisible()
  await expect(quote.getByRole('link')).toHaveCount(0)
  await quote.getByRole('textbox').fill('changed and closed')
  await page.keyboard.press('Escape')
  await expect(quote).toHaveCount(0)
  expect((await draftOf(2)).draft).toBe(rows.engagement_drafts[1].draft)
})

test('reject a reply with a reason, or without one; Cancel keeps it', async ({ page }) => {
  await signIn(page, '/approvals')
  const reject = async (n: number) => {
    await row(page, R(n)).getByRole('button', { name: 'Review' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click()
    return page.getByRole('dialog', { name: 'Why reject this reply?' })
  }
  let why = await reject(1)
  await expect(why.locator('p').first()).toHaveText('Intel Tracker · reply to Northwind Advisors')
  await expect(why.getByRole('group', { name: 'What was off?' }).getByRole('button')).toHaveText([
    'Off-voice', 'Too salesy', 'Too long', 'Too generic', 'Off-topic', 'Not worth a reply',
  ])
  await expect(why.getByRole('button', { name: 'Off-voice' })).toBeFocused()
  await why.getByRole('button', { name: 'Cancel' }).click()
  await expect(why).toHaveCount(0)
  await expect(row(page, R(1))).toBeVisible()
  expect((await draftOf(1)).status).toBe('pending')

  why = await reject(1)
  await why.getByRole('button', { name: 'Too long' }).click()
  await why.getByRole('button', { name: 'Too salesy' }).click()
  await expect(why.getByRole('button', { name: 'Too salesy' })).toHaveAttribute('aria-pressed', 'true')
  await why.getByLabel('Anything to add?').fill('Skip posts about a client loss.')
  await why.getByRole('button', { name: 'Reject' }).click()
  await expect(toast(page, 'Rejected. The reason is on AI settings, where it can become a rule the tracker follows.')).toBeVisible()
  await expect(why).toHaveCount(0)
  await expect(row(page, R(1))).toHaveCount(0)
  expect((await draftOf(1)).status).toBe('rejected')
  expect(await said()).toEqual([
    `intel_tracker | engagement_draft | ${RID(1)} | rejected | Reply: too salesy, too long. Skip posts about a client loss. | ${TEAM.email}`,
  ])

  why = await reject(3)
  await why.getByRole('button', { name: 'Reject' }).click()
  await expect(toast(page, 'Rejected.')).toBeVisible()
  expect((await draftOf(3)).status).toBe('rejected')
  expect((await said())[1]).toBe(`intel_tracker | engagement_draft | ${RID(3)} | rejected | Reviewed on the dashboard | ${TEAM.email}`)
})

test('a reply that is gone meanwhile says so, and the rest still go through', async ({ page }) => {
  await signIn(page, '/approvals')
  await row(page, R(1)).getByRole('checkbox').click()
  await row(page, R(2)).getByRole('checkbox').click()
  await stubSeed({ engagement_drafts: rows.engagement_drafts.filter((d) => d.id !== RID(2)) })
  await bulk(page).getByRole('button', { name: 'Approve 2' }).click()
  await expect(toast(page, 'Could not approve that: that reply is gone')).toBeVisible()
  await expect(toast(page, 'Approved')).toBeVisible()
  await expect(row(page, R(1))).toHaveCount(0)
  await expect(row(page, R(2))).toHaveCount(0)
  expect((await draftOf(1)).status).toBe('approved')
  expect(await said()).toHaveLength(1)
})

test('a brief decided already is not waiting; one undone is; a snapshot that reads names it', async ({ page }) => {
  const at = (s: number) => new Date(Date.now() - s * 1000).toISOString()
  await stubSeed({
    agent_feedback: [
      { id: 'f1', agent: 'ad_strategist', target_type: 'brief_approval', target_id: 'ads_run_new', action: 'approved', created_at: at(300) },
      { id: 'f2', agent: 'intel_tracker', target_type: 'brief_approval', target_id: 'intel_run_new', action: 'approved', created_at: at(300) },
      { id: 'f3', agent: 'intel_tracker', target_type: 'brief_approval', target_id: 'intel_run_new', action: 'reopened', created_at: at(200) },
    ],
    agent_outputs: [
      ...rows.agent_outputs,
      // the newest snapshot of the run does not read, so the one before it is used
      { id: 'snap-2', agent: 'intel_tracker', run_id: 'intel_run_new', created_at: at(100), snapshot: '{not json' },
      { id: 'snap-1', agent: 'intel_tracker', run_id: 'intel_run_new', created_at: at(400), snapshot: JSON.stringify({ items: [{ text: 'Onboarding — again', why: 'three posts', tag: 'Theme' }] }) },
    ],
  })
  await signIn(page, '/approvals')
  await expect(tabs(page)).toHaveText(['All 7', 'Briefs 1', 'Replies 6'])
  await expect(row(page, ADS)).toHaveCount(0)
  await expect(row(page, ORG)).toContainText('Onboarding, again. three posts')
})

test('20 at a time; nothing waiting; nothing runs off the side on a phone', async ({ page }) => {
  const now = Date.now()
  await stubSeed({ agent_outputs: [], creative_briefs: [], engagement_drafts: Array.from({ length: 25 }, (_, i) => reply(100 + i, 'Firm ' + i, (i + 1) * 60e3, now)) })
  await signIn(page, '/approvals?tab=replies')
  await expect(list(page)).toHaveCount(20)
  await page.getByRole('button', { name: 'Show 5 more of 25' }).click()
  await expect(list(page)).toHaveCount(25)
  await tabs(page).first().click()
  await expect(page.getByRole('button', { name: '20 replies more from the Intel Tracker' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(list(page)).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await row(page, 'reply:' + RID(100)).getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('dialog', { name: 'Reply to Firm 0' }).getByRole('button', { name: 'Approve' })).toBeInViewport()
  await page.keyboard.press('Escape')
  await row(page, 'reply:' + RID(100)).getByRole('checkbox').click()
  await expect(bulk(page).getByRole('button', { name: 'Approve 1' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await stubSeed({ engagement_drafts: [] })
  await page.reload()
  await expect(status(page)).toContainText('Nothing waiting')
  await expect(page.getByTestId('approvals-empty')).toContainText('You are all caught up')
  await expect(page.getByTestId('approvals-empty')).toContainText('New briefs, ads and replies land here when the agents finish.')
  await expect(tabs(page)).toHaveText(['All 0'])
  await expect(page.getByRole('button', { name: 'Select all' })).toHaveCount(0)
})
