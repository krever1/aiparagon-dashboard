import { type Page, expect, test } from '@playwright/test'
import { LEGACY, TEAM, serveLogo, signIn, stubFathom, stubReset, stubRows, stubSeed } from './helpers'
import { TASK_METAS, TASK_OUTPUTS } from './tasks-fixtures'

// Tasks: the post-call to-dos by client folder, with the type buttons, each call's type and people, ticks, and the
// Asana panel left in the current dashboard. On the made-up rows in tests/e2e/tasks-fixtures.ts.

test.use({ timezoneId: 'UTC' })

const types = (page: Page) => page.getByRole('toolbar', { name: 'Show calls by type' }).getByRole('button')
const folderNames = (page: Page) => page.getByTestId('task-folder').locator('button[aria-expanded] b')
const card = (page: Page, id: string) => page.locator(`[data-testid="task-card"][data-id="${id}"]`)
const toasts = (page: Page) => page.getByTestId('toasts')
const metaOf = async (id: string) => (await stubRows<Record<string, unknown>>('call_meta')).find((r) => r.call_id === id)

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ call_outputs: TASK_OUTPUTS, call_meta: TASK_METAS })
})

test('the to-dos by client folder, with the type buttons, the people and the open count', async ({ page }) => {
  await signIn(page, '/tasks')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks')
  await expect(page.getByText('Your post-call to-dos and Asana tasks.')).toBeVisible()
  await expect(types(page)).toHaveText(['All 6', 'Client demos 1', 'Sales 1', 'Client work 1', 'Internal development 0', 'Internal meetings 2', 'Other 1'])
  await expect(types(page).first()).toHaveAttribute('aria-pressed', 'true')
  await expect(folderNames(page)).toHaveText(['Sample Peak Partners', 'Acme Wealth', 'Example Ridge Advisors', 'Partners', 'AI Paragon (internal)'])
  await expect(page.getByTestId('task-folder').filter({ hasText: 'AI Paragon (internal)' }).locator('button[aria-expanded] small')).toHaveText('2 calls · 3 open')
  await expect(page.getByTestId('open-count')).toHaveText('6 open')

  const robin = card(page, '9001')
  await expect(robin.getByRole('heading', { level: 3 })).toHaveText('Discovery consultation with Robin 1 of 2 open')
  await expect(robin).toContainText('Nov 4, 2026')
  await expect(robin).toContainText('With Robin Sample, QA Teammate')
  await expect(robin.getByRole('button', { name: 'Edit people and client' })).toBeVisible()
  await expect(robin.getByRole('combobox', { name: 'Call type' })).toHaveValue('')
  await expect(robin.getByRole('combobox', { name: 'Call type' }).locator('option').first()).toHaveText('AI pick: Discovery')
  await expect(robin.getByRole('link', { name: 'Open call' })).toHaveAttribute('href', '/calls?call=9001&seg=post')
  await expect(robin.getByText('QA Teammate · due Nov 12, 2026 · They asked for it')).toBeVisible()
  await expect(robin.getByRole('checkbox', { name: 'Book the assessment' })).toBeChecked()

  await expect(card(page, '7002')).toContainText('Nov 2, 2026 · in Asana · Client onboarding')
  const untitled = card(page, '7003')
  await expect(untitled.getByRole('heading', { level: 3 })).toHaveText('Call 1 of 1 open')
  await expect(untitled).toContainText('No people listed')
  await expect(untitled.getByRole('button', { name: 'Add people' })).toBeVisible()
  // the calls still being written, or with nothing to do, are not here
  await expect(page.getByTestId('task-card')).toHaveCount(6)

  // the picker: the AI's pick until one is set, grouped like the buttons, the team's own types, and a way to add one
  const pick = card(page, '9003').getByRole('combobox', { name: 'Call type' })
  await expect(pick.locator('option').first()).toHaveText('AI pick: Internal meeting')
  expect(await pick.locator('optgroup').evaluateAll((g) => g.map((x) => (x as HTMLOptGroupElement).label))).toEqual([
    'Client demos', 'Sales', 'Client work', 'Internal development', 'Internal meetings', 'Other', 'Your types',
  ])
  await expect(pick.locator('option').last()).toHaveText('+ New type…')

  // Asana stays in the current dashboard
  await expect(page.getByTestId('asana').getByRole('link', { name: 'Open Asana in the current dashboard' })).toHaveAttribute('href', LEGACY + '/tasks')
})

test('a call’s type is saved for the team, and the buttons and the address follow', async ({ page }) => {
  await signIn(page, '/tasks')
  await card(page, '9003').getByRole('combobox', { name: 'Call type' }).selectOption('dev')
  await expect(toasts(page)).toContainText('Call type: Internal development.')
  await expect.poll(async () => (await metaOf('9003'))?.meeting_type).toBe('dev')
  expect((await metaOf('9003'))?.updated_by).toBe(TEAM.email)
  await expect(types(page)).toHaveText(['All 6', 'Client demos 1', 'Sales 1', 'Client work 1', 'Internal development 1', 'Internal meetings 1', 'Other 1'])
  await expect(card(page, '9003').getByRole('combobox', { name: 'Call type' })).toHaveValue('dev')

  await types(page).filter({ hasText: 'Internal development' }).click()
  await expect(page).toHaveURL(/\/tasks\?type=dev$/)
  await expect(page.getByTestId('task-card')).toHaveCount(1)
  await expect(card(page, '9003')).toBeVisible()
  await expect(page.getByTestId('open-count')).toHaveText('2 open')
  await types(page).first().click()
  await expect(page).toHaveURL(/\/tasks$/)
  await expect(page.getByTestId('task-card')).toHaveCount(6)

  // clearing a type the team set
  await card(page, '7001').getByRole('combobox', { name: 'Call type' }).selectOption('')
  await expect(toasts(page)).toContainText('Call type cleared. The AI’s pick shows until one is set.')
  await expect.poll(async () => (await metaOf('7001'))?.meeting_type ?? null).toBeNull()
})

test('a picked kind with nothing in it says so; one that is gone shows everything', async ({ page }) => {
  await signIn(page, '/tasks?type=dev')
  await expect(page.getByTestId('tasks-empty')).toHaveText('Nothing under Internal development yet. Show all')
  await expect(page.getByTestId('open-count')).toHaveText('0 open')
  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(page).toHaveURL(/\/tasks$/)
  await expect(page.getByTestId('task-card')).toHaveCount(6)

  await page.goto('/tasks?type=x%3APodcast')
  await expect(types(page).first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('task-card')).toHaveCount(6)
})

test('ticking a next step saves it, and the counts follow', async ({ page }) => {
  await signIn(page, '/tasks')
  const robin = card(page, '9001')
  await robin.getByRole('checkbox', { name: 'Send the onboarding checklist' }).check()
  await expect(robin.getByRole('heading', { level: 3 })).toHaveText('Discovery consultation with Robin 0 of 2 open')
  await expect(page.getByTestId('open-count')).toHaveText('5 open')
  await expect(page.getByTestId('task-folder').filter({ hasText: 'Sample Peak Partners' }).locator('button[aria-expanded] small')).toHaveText('1 call · 0 open')
  const saved = async () => {
    const row = (await stubRows<{ call_id: string; tasks: { id: string; done: boolean }[] }>('call_outputs')).find((r) => r.call_id === '9001')!
    return row.tasks.map((t) => `${t.id}:${t.done}`).join(',')
  }
  await expect.poll(saved).toBe('t1:true,t2:true')
  await robin.getByRole('checkbox', { name: 'Send the onboarding checklist' }).uncheck()
  await expect.poll(saved).toBe('t1:false,t2:true')
  await expect(page.getByTestId('open-count')).toHaveText('6 open')
})

test('a call type of the team’s own, and closing its window saves nothing', async ({ page }) => {
  await signIn(page, '/tasks')
  await card(page, '9001').getByRole('combobox', { name: 'Call type' }).selectOption('__new')
  const dlg = page.getByRole('dialog', { name: 'New call type' })
  await dlg.getByLabel('Name').fill('Sales call')
  await dlg.getByRole('button', { name: 'Add the type' }).click()
  await expect(dlg.getByTestId('type-msg')).toHaveText('That type is already in the list.')
  await dlg.getByLabel('Name').fill('Podcast')
  await dlg.getByRole('button', { name: 'Add the type' }).click()
  await expect(toasts(page)).toContainText('Call type: Podcast.')
  await expect.poll(async () => (await stubRows<{ key: string; value: unknown }>('ai_settings')).find((r) => r.key === 'call_types')?.value).toEqual(['Partner call', 'Podcast'])
  await expect.poll(async () => (await metaOf('9001'))?.meeting_type).toBe('Podcast')
  await expect(types(page).filter({ hasText: 'Podcast' })).toHaveText('Podcast 1')

  const before = JSON.stringify(await stubRows('ai_settings'))
  await card(page, '7002').getByRole('combobox', { name: 'Call type' }).selectOption('__new')
  await expect(page.getByRole('dialog', { name: 'New call type' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'New call type' })).toHaveCount(0)
  await expect(card(page, '7002').getByRole('combobox', { name: 'Call type' })).toHaveValue('demo')
  expect(JSON.stringify(await stubRows('ai_settings'))).toBe(before)
})

test('Edit people and client: a client company names the folder; a folder folds up', async ({ page }) => {
  await signIn(page, '/tasks')
  await card(page, '9001').getByRole('button', { name: 'Edit people and client' }).click()
  const dlg = page.getByRole('dialog', { name: 'Call details' })
  // the guests are there to edit; who recorded the call is not a guest
  await expect(dlg.getByTestId('person').getByLabel('Name')).toHaveValue('Robin Sample')
  await dlg.getByLabel('Client company').fill('Sample Peak LLC')
  await dlg.getByRole('button', { name: 'Save details' }).click()
  await expect(toasts(page)).toContainText('Call details saved.')
  await expect.poll(async () => (await metaOf('9001'))?.client).toBe('Sample Peak LLC')
  await expect(folderNames(page)).toHaveText(['Sample Peak LLC', 'Acme Wealth', 'Example Ridge Advisors', 'Partners', 'AI Paragon (internal)'])

  const partners = page.getByTestId('task-folder').filter({ has: page.locator('b', { hasText: /^Partners$/ }) }).locator('button[aria-expanded]')
  await partners.click()
  await expect(partners).toHaveAttribute('aria-expanded', 'false')
  await expect(card(page, '7001')).toHaveCount(0)
  await partners.click()
  await expect(card(page, '7001')).toBeVisible()
})

test('without Fathom the to-dos still show, filed by what is known; people saved on a call file it', async ({ page }) => {
  await stubFathom({ connected: false })
  await signIn(page, '/tasks')
  await expect(folderNames(page)).toHaveText(['No client yet', 'Acme Wealth', 'Partners', 'AI Paragon (internal)'])
  const robin = card(page, '9001')
  await expect(robin).toContainText('No people listed')
  await robin.getByRole('button', { name: 'Add people' }).click()
  const dlg = page.getByRole('dialog', { name: 'Call details' })
  await expect(dlg.getByLabel('Title')).toHaveAttribute('placeholder', 'Discovery consultation with Robin')
  await dlg.getByRole('button', { name: '+ Add a person' }).click()
  await dlg.getByTestId('person').last().getByLabel('Name').fill('Pat Example')
  await dlg.getByTestId('person').last().getByLabel('Email').fill('pat@northwind-advisors.example')
  await dlg.getByRole('button', { name: 'Save details' }).click()
  await expect(toasts(page)).toContainText('Call details saved.')
  await expect
    .poll(async () => (await metaOf('9001'))?.guests)
    .toEqual([{ name: 'Pat Example', email: 'pat@northwind-advisors.example', external: true }])
  await expect(folderNames(page)).toContainText(['Northwind Advisors'])
  await expect(card(page, '9001')).toContainText('With Pat Example')
})

test('no to-dos yet, and nothing runs off the side on a phone', async ({ page }) => {
  await stubSeed({ call_outputs: [] })
  await signIn(page, '/tasks')
  await expect(page.getByTestId('tasks-empty')).toHaveText('None yet. They come from your calls.')
  await expect(page.getByTestId('tasks-empty').getByRole('link', { name: 'calls' })).toHaveAttribute('href', '/calls')
  await expect(page.getByRole('toolbar', { name: 'Show calls by type' })).toHaveCount(0)
  await expect(page.getByTestId('open-count')).toHaveText('0 open')

  await stubSeed({ call_outputs: TASK_OUTPUTS })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByTestId('task-card')).toHaveCount(6)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
