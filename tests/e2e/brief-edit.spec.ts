import { type Page, expect, test } from '@playwright/test'
import { dayText } from '../../src/components/ui/local-date'
import { TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { ADS1, ORG1, ORG2, ORG_MD, POST, W, briefRows } from './briefs-fixtures'

// The Market Intelligence Briefs' editor and Structure view (v111): editing an organic and an ads brief (rows edited
// and removed, sections taken out, Undo, Preview, the note, Save as the teammate, Put back the agent's version),
// Discard and the note instead, the edit kept across tabs, a save that fails, and the team's layout for each kind. On
// the made-up rows in tests/e2e/briefs-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const bar = (page: Page) => page.getByTestId('brief-bar')
const side = (page: Page) => page.getByTestId('edit-side')
const count = (page: Page) => page.getByTestId('edit-count')
const sec = (page: Page, k: string) => page.locator(`[data-testid="edit-sec"][data-k="${k}"]`)
const rows = (page: Page, k: string) => page.getByTestId('rows-' + k).getByTestId('edit-row')
const sections = (page: Page) => page.locator('[data-testid^="sec-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
const editSecs = (page: Page) => page.getByTestId('edit-sec').evaluateAll((els) => els.map((e) => e.getAttribute('data-k')))
const hooks = (page: Page) => page.getByTestId('brief-hooks').locator(':scope > div')
const parse = (v: unknown) => (typeof v === 'string' ? (JSON.parse(v) as Row) : (v as Row))
const brief = async () => (await stubRows<Row>('agent_outputs')).find((r) => r.run_id === ORG1 && r.output_type === 'intel_brief')!
const snap = async () => parse((await stubRows<Row>('agent_outputs')).find((r) => r.id === '97000000-0000-4000-8000-000000000002')!.snapshot)
const accept = (page: Page, text: string) =>
  page.once('dialog', (d) => {
    expect(d.message()).toBe(text)
    void d.accept()
  })
const dismiss = (page: Page, text: string) =>
  page.once('dialog', (d) => {
    expect(d.message()).toBe(text)
    void d.dismiss()
  })

let R: ReturnType<typeof briefRows>
test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  R = briefRows()
  await stubSeed(R)
})

test('edit the organic brief: remove, edit, take out and undo, preview, save, then put back the agent’s version', async ({ page }) => {
  await signIn(page, '/briefs')
  await bar(page).getByRole('button', { name: 'Edit', exact: true }).click()
  const head = page.getByTestId('edit-head')
  await expect(head.getByRole('heading', { name: 'Editing this brief' })).toBeVisible()
  await expect(head).toContainText('Removing a post flags the findings that quoted it. Drafts read the brief as you save it, and the agent’s own version is kept.')
  // the bar holds the editor's controls only
  await expect(count(page)).toHaveText('No changes yet')
  await expect(side(page).getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(side(page).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await expect(bar(page).getByLabel('Version')).toHaveCount(0)
  await expect(bar(page).getByRole('button', { name: 'Approve brief' })).toHaveCount(0)
  expect(await editSecs(page)).toEqual(['five', 'short', 'shift', 'dev', 'themes', 'hand', 'post'])
  await expect(sec(page, 'post').getByText('Remove single posts')).toHaveAttribute('title', 'The evidence stays. Remove single posts instead.')
  await expect(sec(page, 'themes')).toContainText('Counted from the posts. Removing a post takes it out of the topic watch.')
  await expect(rows(page, 'five')).toHaveCount(3)
  await expect(rows(page, 'post')).toHaveCount(3)

  // a five thing removed, with Undo on the message
  await rows(page, 'five').nth(1).getByRole('button', { name: 'Remove' }).click()
  await expect(toast(page, 'Removed.')).toBeVisible()
  await expect(rows(page, 'five')).toHaveCount(2)
  await expect(count(page)).toHaveText('1 change')
  await page.getByTestId('toasts').getByRole('button', { name: 'Undo' }).click()
  await expect(rows(page, 'five')).toHaveCount(3)
  await expect(count(page)).toHaveText('No changes yet')
  await rows(page, 'five').nth(1).getByRole('button', { name: 'Remove' }).click()
  await expect(rows(page, 'five')).toHaveText([/Proof beats promises/, /Governance checklists spread/])

  // a line of the short version edited; the same words close the form, nothing at all is refused
  await page.getByTestId('rows-short').getByRole('button', { name: 'Edit Proof beats promises' }).click()
  const form = page.getByTestId('edit-form')
  await expect(form.getByLabel('Lead')).toBeFocused()
  await form.getByRole('button', { name: 'Keep this change' }).click()
  await expect(form).toHaveCount(0)
  await expect(count(page)).toHaveText('1 change')
  await page.getByTestId('rows-short').getByRole('button', { name: 'Edit Proof beats promises' }).click()
  await form.getByLabel('Lead').fill('')
  await form.getByLabel('What it says').fill('')
  await form.getByRole('button', { name: 'Keep this change' }).click()
  await expect(head.getByRole('alert')).toHaveText('That would leave it empty. Remove it instead.')
  await form.getByLabel('Lead').fill('Proof beats promises')
  await form.getByLabel('What it says').fill('Advisors want evidence before they book.')
  await form.getByRole('button', { name: 'Keep this change' }).click()
  await expect(head.getByRole('alert')).toHaveCount(0)
  await expect(rows(page, 'short').nth(0)).toContainText('Advisors want evidence before they book.')
  await expect(count(page)).toHaveText('2 changes')

  // a post removed: the shift that quoted it is flagged, and the head counts it
  await rows(page, 'post').nth(0).getByRole('button', { name: 'Remove O1 · Northwind Advisors' }).click()
  await expect(toast(page, 'Post removed. Findings that quoted it are flagged.')).toBeVisible()
  await expect(rows(page, 'post')).toHaveText([/O1 · Example Ridge Advisors/, /O2 · Contoso Planning/])
  await expect(rows(page, 'shift').nth(0)).toContainText('The post behind it was removed. Edit or remove this.')
  await expect(rows(page, 'shift').nth(1)).not.toContainText('The post behind it was removed')
  await expect(head).toContainText('1 post taken out of this brief so far.')

  // a whole section taken out, then put back with Undo
  await sec(page, 'dev').getByRole('button', { name: 'Remove section Notable developments' }).click()
  await expect(toast(page, 'Removed Notable developments.')).toBeVisible()
  await expect(sec(page, 'dev')).toHaveCount(0)
  await expect(count(page)).toHaveText('4 changes')
  await side(page).getByRole('button', { name: 'Undo' }).click()
  await expect(sec(page, 'dev')).toBeVisible()
  await expect(count(page)).toHaveText('3 changes')
  await head.getByLabel('Note for the record').fill('Leave job posts out.')

  // Preview: the brief as it now stands, every list in full; the review waits for the edit
  await side(page).getByRole('button', { name: 'Preview' }).click()
  await expect(side(page).getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('brief-editor')).toHaveCount(0)
  await expect(page.getByTestId('brief-five').getByRole('heading', { level: 2 })).toHaveText('Two things working')
  await expect(page.getByTestId('sec-short')).toContainText('Proof beats promises. Advisors want evidence before they book.')
  await expect(page.getByTestId('brief-evidence').getByTestId('ev-row')).toHaveCount(2)
  await expect(page.getByTestId('brief-evidence')).not.toContainText('Northwind Advisors')
  const review = page.getByTestId('review-editing')
  await expect(review).toHaveText(/You are editing this brief\. Save or discard the changes, then approve it\./)
  await expect(page.getByTestId('sec-review').getByRole('button', { name: 'Approve brief' })).toHaveCount(0)
  await review.getByRole('button', { name: 'Back to editing' }).click()
  await expect(page.getByTestId('brief-editor')).toBeVisible()
  await expect(head.getByLabel('Note for the record')).toHaveValue('Leave job posts out.')

  // Save: the brief, its five things and an edited decision, as the teammate
  await side(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(toast(page, 'Saved. Drafts now read the edited brief. Approve it when it reads right.')).toBeVisible()
  await expect(page.getByTestId('brief-editor')).toHaveCount(0)
  await expect(page.getByTestId('brief-five').getByRole('heading', { level: 2 })).toHaveText('Two things working')
  const changes = 'Removed 1 finding and 1 post. Edited 1 line in the short version.'
  await expect(page.getByTestId('brief-decision')).toHaveText('Edited by qa.teammate just now: ' + changes + ' Note: Leave job posts out. Approve it when it reads right.')
  await expect(bar(page).getByText('Needs review', { exact: true })).toBeVisible()
  const today = dayText(new Date().toISOString(), 'UTC')
  await expect(page.getByTestId('brief-edited')).toHaveText('Edited by qa.teammate ' + today + ' · Put back the agent’s version')
  await expect(bar(page).getByLabel('Version').locator('option').nth(0)).toHaveText(/ · newest · edited$/)

  const saved = await brief()
  expect(saved.edited_by_human).toBe(true)
  expect(String(saved.content_md)).toContain('- **Proof beats promises**: Advisors want evidence before they book.')
  expect(String(saved.content_md)).toContain('## 4. Notable developments')
  expect(typeof saved.data).toBe('string')
  const data = parse(saved.data)
  expect((data.items as Row[]).map((x) => x.url)).toEqual([POST(2), POST(3)])
  expect(data.review).toMatchObject({ by: TEAM.email, changes, note: 'Leave job posts out.', hidden: [], removed: [POST(1)] })
  expect((data.review as Row).original).toMatchObject({ content_md: ORG_MD })
  expect(((data.review as Row).history as Row[]).map((h) => h.changes)).toEqual([changes])
  expect(((await snap()).items as Row[]).map((x) => x.text)).toEqual(['Proof beats promises', 'Governance checklists spread'])
  const fb = await stubRows<Row>('agent_feedback')
  expect(fb).toHaveLength(1)
  expect(fb[0]).toMatchObject({ agent: 'intel_tracker', target_type: 'brief_approval', target_id: ORG1, action: 'edited', feedback: changes + ' Note: Leave job posts out.', author: TEAM.email })

  // Put back the agent's version asks first
  dismiss(page, 'Put back the agent’s own version of this brief? The edits are dropped.')
  await page.getByTestId('brief-edited').getByRole('button', { name: 'Put back the agent’s version' }).click()
  await expect(page.getByTestId('brief-edited')).toBeVisible()
  expect(await stubRows<Row>('agent_feedback')).toHaveLength(1)
  accept(page, 'Put back the agent’s own version of this brief? The edits are dropped.')
  await page.getByTestId('brief-edited').getByRole('button', { name: 'Put back the agent’s version' }).click()
  await expect(toast(page, 'The agent’s own version is back.')).toBeVisible()
  await expect(page.getByTestId('brief-edited')).toHaveCount(0)
  await expect(page.getByTestId('brief-five').getByRole('heading', { level: 2 })).toHaveText('Three things working')
  await expect(page.getByTestId('brief-evidence').getByTestId('ev-row')).toHaveCount(3)
  const back = await brief()
  expect(back.content_md).toBe(ORG_MD)
  expect(back.edited_by_human).toBe(false)
  expect(parse(back.data).review).toBeUndefined()
  expect((parse(back.data).items as Row[]).map((x) => x.url)).toEqual([POST(1), POST(2), POST(3)])
  expect(((await snap()).items as Row[]).map((x) => x.text)).toEqual(['Proof beats promises', 'Onboarding in days', 'Governance checklists spread'])
  const fb2 = await stubRows<Row>('agent_feedback')
  expect(fb2).toHaveLength(2)
  expect(fb2.find((r) => r.feedback === 'Put back the agent’s own version.')).toMatchObject({ action: 'edited', target_id: ORG1, author: TEAM.email })
})

test('edit the ads brief: hooks, an offer, an ad and a section; the last hook stays; save, then put it back', async ({ page }) => {
  await signIn(page, '/briefs?tab=ads')
  await page.getByTestId('sec-review').getByRole('button', { name: 'Request changes' }).click()
  const head = page.getByTestId('edit-head')
  await expect(head).toContainText('Removing an ad takes it out of the evidence.')
  await expect(head.getByLabel('Note for the record')).toHaveAttribute('placeholder', 'e.g. Leave out ads for unrelated products. Lead with proof.')
  expect(await editSecs(page)).toEqual(['five', 'short', 'arch', 'offer', 'pain', 'cross', 'test', 'ad'])
  await expect(sec(page, 'arch').getByText('Needed for drafts')).toBeVisible()
  await expect(sec(page, 'arch').getByRole('button', { name: /^Remove section/ })).toHaveCount(0)
  // the angle and the skeleton are edited, never removed
  await expect(rows(page, 'angle').getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  await expect(rows(page, 'formula')).toHaveText(/Problem → Proof → Offer/)
  await expect(rows(page, 'hook')).toHaveCount(3)
  await expect(rows(page, 'ad')).toHaveCount(3)
  await expect(rows(page, 'ad').nth(0)).toContainText('P1 · Northwind Advisors')
  await expect(rows(page, 'ad').nth(0)).toContainText('60 days running · Still running')

  // two hooks go; the last one stays
  await rows(page, 'hook').nth(0).getByRole('button', { name: /^Remove/ }).click()
  await rows(page, 'hook').nth(0).getByRole('button', { name: /^Remove/ }).click()
  await expect(rows(page, 'hook')).toHaveText([/One workflow, automated first/])
  await rows(page, 'hook').nth(0).getByRole('button', { name: /^Remove/ }).click()
  await expect(head.getByRole('alert')).toHaveText('Keep at least one hook. Every ad opens with one.')
  await expect(rows(page, 'hook')).toHaveCount(1)
  await expect(count(page)).toHaveText('2 changes')

  // an offer's price, an ad out of the evidence, and a section taken out
  await rows(page, 'offer').nth(0).getByRole('button', { name: 'Edit Free readiness review' }).click()
  await page.getByTestId('edit-form').getByLabel('Price shown').fill('$0 for the first call')
  await page.getByTestId('edit-form').getByRole('button', { name: 'Keep this change' }).click()
  await expect(rows(page, 'offer').nth(0)).toContainText('Price shown: $0 for the first call')
  await rows(page, 'ad').nth(2).getByRole('button', { name: /^Remove P3/ }).click()
  await expect(toast(page, 'Ad removed from the brief.')).toBeVisible()
  await expect(rows(page, 'ad')).toHaveCount(2)
  await expect(head).toContainText('1 ad taken out of this brief so far.')
  await sec(page, 'cross').getByRole('button', { name: 'Remove section Borrowed from other markets' }).click()
  await expect(count(page)).toHaveText('5 changes')

  // an ad opens in a new tab, so the edits stay
  const [popup] = await Promise.all([page.waitForEvent('popup'), rows(page, 'ad').nth(0).getByRole('button', { name: /^Open P1/ }).click()])
  await expect(popup).toHaveURL(new RegExp('/ad-strategist\\?(.*&)?ad=' + W(1)))
  await popup.close()
  await expect(count(page)).toHaveText('5 changes')

  // Preview: one hook, two ads, no borrowed patterns
  await side(page).getByRole('button', { name: 'Preview' }).click()
  await expect(hooks(page)).toHaveCount(1)
  await expect(hooks(page).nth(0)).toContainText('Hook AOne workflow, automated first')
  await expect(page.getByTestId('brief-evidence').getByTestId('ev-row')).toHaveCount(2)
  await expect(page.getByTestId('sec-cross')).toHaveCount(0)
  await expect(page.getByTestId('sec-offer')).toContainText('$0 for the first call')

  await side(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(toast(page, 'Saved. Drafts now read the edited brief. Approve it when it reads right.')).toBeVisible()
  const changes = 'Removed 2 hooks and 1 ad. Took out Borrowed from other markets. Edited 1 offer.'
  await expect(page.getByTestId('brief-decision')).toHaveText('Edited by qa.teammate just now: ' + changes + ' Approve it when it reads right.')
  await expect(page.getByTestId('brief-evidence').getByTestId('ev-row')).toHaveCount(2)
  await expect(page.getByTestId('sec-cross')).toHaveCount(0)
  const cb = (await stubRows<Row>('creative_briefs')).find((r) => r.run_id === ADS1)!
  // lists kept as text stay text; the ads by id stay a list
  expect(cb.winning_hooks).toBe(JSON.stringify(['One workflow, automated first']))
  expect(parse(cb.winning_offers)).toEqual([{ type: 'Free readiness review', price_point: '$0 for the first call', notes: 'A 30-minute call with a scorecard.' }, 'Paid audit'])
  expect(cb.cross_niche_sources).toBe('[]')
  expect(cb.source_ad_ids).toEqual([W(1), W(2)])
  const rev = parse((await stubRows<Row>('agent_outputs')).find((r) => r.run_id === ADS1)!.data).review as Row
  expect(rev).toMatchObject({ by: TEAM.email, changes, note: '', hidden: ['cross'], removed: [W(3)] })
  expect((rev.original as Row).cb).toMatchObject({ source_ad_ids: [W(1), W(2), W(3)] })
  expect((await stubRows<Row>('agent_feedback'))[0]).toMatchObject({ agent: 'ad_strategist', target_id: ADS1, action: 'edited', feedback: changes })

  accept(page, 'Put back the agent’s own version of this brief? The edits are dropped.')
  await page.getByTestId('brief-edited').getByRole('button', { name: 'Put back the agent’s version' }).click()
  await expect(toast(page, 'The agent’s own version is back.')).toBeVisible()
  await expect(hooks(page)).toHaveCount(3)
  await expect(page.getByTestId('brief-evidence').getByTestId('ev-row')).toHaveCount(3)
  await expect(page.getByTestId('sec-cross')).toBeVisible()
  const cb2 = (await stubRows<Row>('creative_briefs')).find((r) => r.run_id === ADS1)!
  expect(parse(cb2.winning_hooks)).toHaveLength(3)
  expect(cb2.source_ad_ids).toEqual([W(1), W(2), W(3)])
  expect(parse((await stubRows<Row>('agent_outputs')).find((r) => r.run_id === ADS1)!.data).review).toBeUndefined()
})

test('putting back a version kept without its words leaves the words as they are', async ({ page }) => {
  // the older brief's kept version has no content_md: the brief's text stays, its review goes
  const before = String(R.agent_outputs.find((r) => r.run_id === ORG2)!.content_md)
  await signIn(page, '/briefs?run=' + ORG2)
  await expect(page.getByTestId('sec-dev')).toHaveCount(0)
  accept(page, 'Put back the agent’s own version of this brief? The edits are dropped.')
  await page.getByTestId('brief-edited').getByRole('button', { name: 'Put back the agent’s version' }).click()
  await expect(toast(page, 'The agent’s own version is back.')).toBeVisible()
  await expect(page.getByTestId('brief-edited')).toHaveCount(0)
  await expect(page.getByTestId('sec-dev')).toBeVisible()
  const row = (await stubRows<Row>('agent_outputs')).find((r) => r.run_id === ORG2)!
  expect(row.content_md).toBe(before)
  expect(parse(row.data).review).toBeUndefined()
})

test('Discard and a note instead ask before dropping changes; the edit is kept on another tab; another brief asks first', async ({ page }) => {
  await signIn(page, '/briefs')
  await bar(page).getByRole('button', { name: 'Edit', exact: true }).click()
  // nothing changed: Discard just closes
  await side(page).getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByTestId('brief-editor')).toHaveCount(0)
  await bar(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await rows(page, 'five').nth(0).getByRole('button', { name: 'Remove' }).click()
  dismiss(page, 'Drop your changes to this brief?')
  await side(page).getByRole('button', { name: 'Discard' }).click()
  await expect(count(page)).toHaveText('1 change')

  // the Ads tab is its own; back on Organic the edit is still open
  await page.getByRole('tablist', { name: 'Briefs' }).getByRole('tab', { name: /Ads/ }).click()
  await expect(page.getByTestId('brief-bar')).toContainText('Ads brief')
  await expect(page.getByTestId('brief-editor')).toHaveCount(0)
  dismiss(page, 'You have changes on another brief that are not saved. Drop them?')
  await bar(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByTestId('brief-editor')).toHaveCount(0)
  await page.getByRole('tablist', { name: 'Briefs' }).getByRole('tab', { name: /Organic/ }).click()
  await expect(count(page)).toHaveText('1 change')
  await expect(rows(page, 'five')).toHaveCount(2)

  // a note instead drops the changes once asked, then asks what should change
  dismiss(page, 'Drop your changes and only leave a note?')
  await page.getByTestId('edit-head').getByRole('button', { name: 'Leave a note instead' }).click()
  await expect(count(page)).toHaveText('1 change')
  accept(page, 'Drop your changes and only leave a note?')
  await page.getByTestId('edit-head').getByRole('button', { name: 'Leave a note instead' }).click()
  await expect(page.getByRole('dialog', { name: 'What needs to change in this brief?' })).toBeVisible()
  await expect(page.getByTestId('brief-editor')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('brief-five').getByRole('heading', { level: 2 })).toHaveText('Three things working')
  expect(await stubRows<Row>('agent_feedback')).toHaveLength(0)
  expect((await brief()).content_md).toBe(ORG_MD)

  // Discard with changes, once agreed, leaves the brief as it was
  await bar(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await rows(page, 'five').nth(0).getByRole('button', { name: 'Remove' }).click()
  accept(page, 'Drop your changes to this brief?')
  await side(page).getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByTestId('brief-editor')).toHaveCount(0)
  await expect(page.getByTestId('brief-five').getByRole('heading', { level: 2 })).toHaveText('Three things working')
})

test('a save that fails says why and keeps the edit open', async ({ page }) => {
  await signIn(page, '/briefs')
  await bar(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await rows(page, 'five').nth(0).getByRole('button', { name: 'Remove' }).click()
  await side(page).getByRole('button', { name: 'Preview' }).click()
  // the brief is gone from the database meanwhile
  await stubSeed({ agent_outputs: R.agent_outputs.filter((r) => !(r.run_id === ORG1 && r.output_type === 'intel_brief')) })
  await side(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByTestId('edit-head').getByRole('alert')).toHaveText('Could not save: the brief is no longer on file.')
  await expect(side(page).getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true')
  await expect(count(page)).toHaveText('1 change')
  await expect(side(page).getByRole('button', { name: 'Save changes' })).toBeEnabled()
  expect(await stubRows<Row>('agent_feedback')).toHaveLength(0)
})

test('Structure: the organic layout, switched, moved, added to and saved for the team; the brief follows it', async ({ page }) => {
  await signIn(page, '/briefs')
  const view = bar(page).getByRole('group', { name: 'View' })
  await view.getByRole('button', { name: 'Structure' }).click()
  await expect(view.getByRole('button', { name: 'Structure' })).toHaveAttribute('aria-pressed', 'true')
  await expect(bar(page).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  const st = page.getByTestId('structure')
  const keys = () => st.getByTestId('structure-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-k')))
  const row = (k: string) => st.locator(`[data-testid="structure-row"][data-k="${k}"]`)
  const msg = page.getByTestId('structure-msg')
  expect(await keys()).toEqual(['rec', 'five', 'short', 'shift', 'dev', 'themes', 'hand', 'ev', 'review'])
  await expect(msg).toHaveText('This is the standard layout.')
  await expect(st.getByRole('button', { name: 'Save layout' })).toBeDisabled()
  // the record, the evidence and the review stay; the record, the five things and the review do not move
  for (const k of ['rec', 'ev', 'review']) await expect(row(k)).toContainText('Always in the brief')
  for (const k of ['rec', 'five', 'review']) await expect(row(k).getByRole('button', { name: /^Move/ })).toHaveCount(0)
  await expect(row('short').getByRole('button', { name: 'Move The short version up' })).toBeDisabled()
  await expect(row('ev').getByRole('button', { name: 'Move Post evidence down' })).toBeDisabled()

  await row('short').getByRole('switch', { name: 'Show The short version' }).click()
  await expect(row('short').getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await expect(msg).toHaveText('Not saved yet.')
  await row('dev').getByRole('button', { name: 'Move Notable developments up' }).click()
  await row('five').getByLabel('Detail').selectOption('short')
  const add = page.getByTestId('structure-add')
  await add.getByLabel('Section to add').selectOption('x_reg')
  await expect(add).toContainText('Posts about rules, regulators and compliance deadlines.')
  await add.getByRole('button', { name: 'Add' }).click()
  await expect(msg).toHaveText('Regulation watch added. Save the layout to use it.')
  expect(await keys()).toEqual(['rec', 'five', 'short', 'dev', 'shift', 'themes', 'hand', 'ev', 'x_reg', 'review'])
  await expect(row('x_reg')).toContainText('Added')
  await expect(add.getByLabel('Section to add').locator('option')).toHaveCount(4)

  await st.getByRole('button', { name: 'Save layout' }).click()
  await expect(toast(page, 'Layout saved. Every brief follows it.')).toBeVisible()
  await expect(msg).toHaveText(/^Saved for the team\./)
  const saved = (await stubRows<Row>('ai_settings')).find((r) => r.key === 'brief_structure')!
  expect(saved.value).toMatchObject({
    org: { order: ['rec', 'five', 'short', 'dev', 'shift', 'themes', 'hand', 'ev', 'x_reg', 'review'], off: ['short'], opt: { five: { why: 'short' } } },
    updated_by: TEAM.email,
  })
  expect(saved.updated_by).toBe(TEAM.email)

  // the brief follows it
  await view.getByRole('button', { name: 'Brief' }).click()
  await expect.poll(() => sections(page)).toEqual(['sec-dev', 'sec-shift', 'sec-themes', 'sec-hand', 'sec-ev', 'sec-x_reg', 'sec-review'])
  await expect(page.getByTestId('brief-five').getByRole('button').nth(0)).not.toContainText('Northwind shows client results')

  // the usual layout is one click away, and Cancel goes back to the saved one
  await view.getByRole('button', { name: 'Structure' }).click()
  await expect(msg).toHaveText('Saved for the team.')
  await st.getByRole('button', { name: 'Standard layout' }).click()
  await expect(msg).toHaveText('The standard layout. Save it to use it.')
  expect(await keys()).toEqual(['rec', 'five', 'short', 'shift', 'dev', 'themes', 'hand', 'ev', 'review'])
  await st.getByRole('button', { name: 'Cancel' }).click()
  expect(await keys()).toEqual(['rec', 'five', 'short', 'dev', 'shift', 'themes', 'hand', 'ev', 'x_reg', 'review'])
  // an added section can be taken out again
  await row('x_reg').getByRole('button', { name: 'Take Regulation watch out' }).click()
  expect(await keys()).not.toContain('x_reg')
})

test('Structure: the ads layout keeps what drafts need and leaves the organic one alone', async ({ page }) => {
  await stubSeed({ ai_settings: [...R.ai_settings, { key: 'brief_structure', value: { org: { off: ['hand'] } } }] })
  await signIn(page, '/briefs?tab=ads')
  await bar(page).getByRole('group', { name: 'View' }).getByRole('button', { name: 'Structure' }).click()
  const st = page.getByTestId('structure')
  const row = (k: string) => st.locator(`[data-testid="structure-row"][data-k="${k}"]`)
  await expect(page.getByTestId('structure-msg')).toHaveText('This is the standard layout.')
  await expect(row('arch')).toContainText('Needed for drafts')
  await expect(row('arch').getByRole('switch')).toHaveCount(0)
  await expect(row('arch').getByLabel('Hooks')).toHaveValue('8')
  await row('test').getByRole('switch', { name: 'Show Test plan' }).click()
  await row('arch').getByLabel('Hooks').selectOption('3')
  await st.getByRole('button', { name: 'Save layout' }).click()
  await expect(toast(page, 'Layout saved. Every brief follows it.')).toBeVisible()
  const value = (await stubRows<Row>('ai_settings')).find((r) => r.key === 'brief_structure')!.value as Row
  expect(value.org).toEqual({ off: ['hand'] })
  expect(value.ads).toMatchObject({ off: ['test'], opt: { arch: { n: '3' } } })
  await bar(page).getByRole('group', { name: 'View' }).getByRole('button', { name: 'Brief' }).click()
  await expect(page.getByTestId('sec-test')).toHaveCount(0)
  await expect(hooks(page)).toHaveCount(3)
  // another tab opens on its brief again
  await page.getByRole('tablist', { name: 'Briefs' }).getByRole('tab', { name: /Organic/ }).click()
  await bar(page).getByRole('group', { name: 'View' }).getByRole('button', { name: 'Structure' }).click()
  await page.getByRole('tablist', { name: 'Briefs' }).getByRole('tab', { name: /Ads/ }).click()
  await expect(page.getByTestId('structure')).toHaveCount(0)
  await expect(page.getByTestId('brief-hooks')).toBeVisible()
})

test('the editor fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/briefs')
  for (const path of ['/briefs', '/briefs?tab=ads']) {
    await page.goto(path)
    await bar(page).getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByTestId('brief-editor')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0)
    await side(page).getByRole('button', { name: 'Discard' }).click()
    await bar(page).getByRole('group', { name: 'View' }).getByRole('button', { name: 'Structure' }).click()
    await expect(page.getByTestId('structure')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path + ' structure').toBeLessThanOrEqual(0)
  }
})
