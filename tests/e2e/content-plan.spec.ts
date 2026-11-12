import { type Page, expect, test } from '@playwright/test'
import { contentRows, formRows } from './content-fixtures'
import { serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'

// New draft's plan (v121's plan pane): the parts a piece is built in, at the top of the side. A part opens to rename it,
// say what goes in it, move or remove it; parts are added; Reset, Save as our default and Use the usual steps; and what
// is sent. On the made-up rows in tests/e2e/content-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const form = (page: Page) => page.getByTestId('content-new')
const plan = (page: Page) => page.getByTestId('new-side').getByTestId('plan')
const steps = (page: Page) => plan(page).getByTestId('plan-step')
const names = (page: Page) => steps(page).locator('b')
const TEXT =
  'Most firms lose a week to onboarding. The intake call, the forms and the checklist each wait on someone.\n\n' +
  'We cut that week by running one call, one form and one checklist, owned by one person. Five days saved, from our own records.\n\n' +
  'If your onboarding takes longer than a week, start with the owner: one name next to every step.'

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ ...contentRows(), ...formRows() })
})

test('the plan: open a part, rename it, say what goes in it, move, add and remove parts; Reset; what is sent', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await expect(page.getByRole('complementary', { name: 'The plan' })).toBeVisible()
  await expect(plan(page)).toContainText('1 post, in these parts:')
  await expect(names(page)).toHaveText(['The common belief', 'What we see', 'Why it matters'])
  await expect(steps(page).nth(0)).toContainText('What most of the market assumes.')
  await expect(plan(page).getByText('Changed')).toHaveCount(0)

  // open the second part, rename it and say what goes in it
  await steps(page).nth(1).getByRole('button', { expanded: false }).click()
  await expect(steps(page).nth(1).getByRole('button', { expanded: true })).toBeVisible()
  await steps(page).nth(1).getByRole('textbox', { name: 'Name' }).fill('Our view')
  await steps(page).nth(1).getByRole('textbox', { name: /What goes in it/ }).fill('One example from the material.')
  await expect(names(page).nth(1)).toHaveText('Our view')
  await expect(plan(page).getByText('Changed', { exact: true })).toBeVisible()
  // move it up, then remove the first part
  await steps(page).nth(1).getByRole('button', { name: 'Move up' }).click()
  await expect(names(page)).toHaveText(['Our view', 'The common belief', 'Why it matters'])
  await expect(steps(page).nth(0).getByRole('button', { name: 'Move up' })).toBeDisabled()
  await steps(page).nth(0).getByRole('button', { name: 'Remove' }).click()
  await expect(names(page)).toHaveText(['The common belief', 'Why it matters'])
  // add a part: it opens with its name picked
  await plan(page).getByRole('button', { name: 'Add a part' }).click()
  await expect(names(page)).toHaveText(['The common belief', 'Why it matters', 'New part'])
  await expect(steps(page).nth(2).getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.keyboard.type('The close')
  await expect(steps(page).nth(2)).toContainText('Nothing set for this part yet')

  // the edits stay with this kind while another is looked at
  await form(page).getByTestId('kind-tile').filter({ hasText: 'Newsletter' }).click()
  await expect(plan(page)).toContainText('1 issue with short sections')
  await form(page).getByTestId('kind-tile').filter({ hasText: 'LinkedIn post' }).click()
  await expect(names(page)).toHaveText(['The common belief', 'Why it matters', 'The close'])

  // what is sent is the plan
  await form(page).getByRole('tablist', { name: 'Your material' }).getByRole('tab', { name: 'Paste' }).click()
  await form(page).getByRole('textbox', { name: /^Source text/ }).fill(TEXT)
  await form(page).getByTestId('more-options').locator('summary').click()
  await form(page).getByTestId('more-options').getByRole('textbox', { name: 'Source title' }).fill('Plan test')
  await page.getByTestId('new-side').getByTestId('generate').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  const req = (await stubRows<Row>('content_requests')).find((r) => r.title === 'Plan test')!
  expect(((req.template as Row).sections as Row[]).map((s) => s.title)).toEqual(['The common belief', 'Why it matters', 'The close'])
  // the plan is kept after a send, as before; Reset puts the usual parts back
  await plan(page).getByRole('button', { name: 'Reset' }).click()
  await expect(names(page)).toHaveText(['The common belief', 'What we see', 'Why it matters'])
  await expect(plan(page).getByText('Changed', { exact: true })).toHaveCount(0)

  // every part taken out: the writer picks a shape
  for (let i = 0; i < 3; i++) {
    await steps(page).nth(0).getByRole('button', { expanded: false }).click()
    await steps(page).nth(0).getByRole('button', { name: 'Remove' }).click()
  }
  await expect(plan(page)).toContainText('No set parts. The writer picks a shape from your answers.')
})

test('Save as our default: the team starts from it, Use the usual steps sets it aside; a structure picked is not saved', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await steps(page).nth(2).getByRole('button', { expanded: false }).click()
  await steps(page).nth(2).getByRole('button', { name: 'Remove' }).click()
  await plan(page).getByRole('button', { name: 'Save as our default' }).click()
  await expect(toast(page, 'Saved. The team starts from this plan from now on.')).toBeVisible()
  const saved = (await stubRows<Row>('ai_settings')).find((r) => r.key === 'build_plans')!
  const v = saved.value as Record<string, Row>
  expect(v['piece:thought_leadership']).toMatchObject({ by: 'qa.teammate@aiparagonconsulting.com' })
  expect((v['piece:thought_leadership'].steps as Row[]).map((s) => [s.key, s.kind, s.name])).toEqual([
    ['part_1', 'part', 'The common belief'],
    ['part_2', 'part', 'What we see'],
  ])
  // the team's default is what the page starts from
  await page.reload()
  await expect(names(page)).toHaveText(['The common belief', 'What we see'])
  await expect(plan(page)).toContainText('Your team’s default')
  await plan(page).getByRole('button', { name: 'Use the usual steps' }).click()
  await expect(names(page)).toHaveText(['The common belief', 'What we see', 'Why it matters'])
  await expect(plan(page).getByText('Changed', { exact: true })).toBeVisible()

  // another kind's default is left alone when one is saved
  await stubSeed({ ai_settings: [{ key: 'build_plans', value: { 'piece:email': { steps: [{ key: 'part_1', kind: 'part', name: 'Subject', note: '' }] } } }] })
  await page.reload()
  await steps(page).nth(0).getByRole('button', { expanded: false }).click()
  await steps(page).nth(0).getByRole('button', { name: 'Remove' }).click()
  await plan(page).getByRole('button', { name: 'Save as our default' }).click()
  await expect(toast(page, 'Saved. The team starts from this plan from now on.')).toBeVisible()
  const both = (await stubRows<Row>('ai_settings')).find((r) => r.key === 'build_plans')!.value as Row
  expect(Object.keys(both).sort()).toEqual(['piece:email', 'piece:thought_leadership'])

  // a structure picked has its own plan, which is never the team's default
  await form(page).getByTestId('more-options').locator('summary').click()
  await form(page).getByTestId('more-options').getByRole('combobox', { name: 'Structure' }).selectOption('builtin:steps')
  await expect(names(page)).toHaveText(['Why it matters', 'The steps', 'Where to start'])
  await steps(page).nth(0).getByRole('button', { expanded: false }).click()
  await steps(page).nth(0).getByRole('button', { name: 'Remove' }).click()
  await expect(plan(page).getByRole('button', { name: 'Reset' })).toBeVisible()
  await expect(plan(page).getByRole('button', { name: 'Save as our default' })).toHaveCount(0)
  // a saved template names itself
  await form(page).getByTestId('more-options').getByRole('combobox', { name: 'Structure' }).selectOption({ label: 'Client story' })
  await expect(plan(page)).toContainText('From the Client story template.')
})
