import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { TASK_METAS, TASK_OUTPUTS } from './tasks-fixtures'

// Folders and call types (the current dashboard's v144): for the whole team, from Tasks' header and Calls' filters.
// Renaming a folder moves every call in it, deleting one takes it off its calls, the team's own folders are kept in
// call_folders; the built-in types and the buttons take the team's names (call_type_names); the team's own types are
// renamed or deleted on every call. On the made-up rows in tests/e2e/tasks-fixtures.ts.

test.use({ timezoneId: 'UTC' })

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Folders and call types' })
const types = (page: Page) => page.getByRole('toolbar', { name: 'Show calls by type' }).getByRole('button')
const folderNames = (page: Page) => page.getByTestId('task-folder').locator('button[aria-expanded] b')
const toasts = (page: Page) => page.getByTestId('toasts')
const setting = async (key: string) => (await stubRows<{ key: string; value: unknown; updated_by?: string }>('ai_settings')).find((r) => r.key === key)
const metaOf = async (id: string) => (await stubRows<Record<string, unknown>>('call_meta')).find((r) => r.call_id === id)

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({
    call_outputs: TASK_OUTPUTS,
    call_meta: [...TASK_METAS.filter((m) => m.call_id !== '7001'), { call_id: '7001', folder: 'Partners', meeting_type: 'Partner call', created_at: '2026-10-28T17:00:00Z' }],
    ai_settings: [...fixtures().ai_settings, { key: 'call_folders', value: ['Northwind Advisors'] }],
  })
})

async function open(page: Page, at = '/tasks') {
  await signIn(page, at)
  await page.getByRole('button', { name: 'Folders and types' }).click()
  await expect(dialog(page)).toBeVisible()
}

test('the window lists the folders with their calls, the types under their buttons and the team’s own', async ({ page }) => {
  await open(page)
  const d = dialog(page)
  await expect(d.getByText('For the whole team, on Tasks and Calls. Renaming a folder or one of your types renames it on every call in it.')).toBeVisible()
  const folders = d.getByTestId('ft-folder')
  await expect(folders.filter({ hasText: 'AI Paragon (internal)' })).toContainText('Set on its own')
  await expect(folders.filter({ has: page.getByRole('textbox', { name: 'Folder name: Partners' }) })).toContainText('1 call')
  await expect(d.getByRole('textbox', { name: 'Folder name: Northwind Advisors' })).toHaveValue('Northwind Advisors')
  await expect(folders.filter({ has: page.getByRole('textbox', { name: 'Folder name: Northwind Advisors' }) })).toContainText('0 calls')
  await expect(d.getByRole('textbox', { name: 'Button name: Sales' })).toHaveValue('Sales')
  await expect(d.getByRole('textbox', { name: 'Call type name: Interview / prequal' })).toHaveValue('Interview / prequal')
  await expect(d.getByTestId('ft-own').getByRole('textbox', { name: 'Call type name: Partner call' })).toHaveValue('Partner call')
  await expect(d.getByRole('button', { name: 'Delete the type Partner call' })).toBeVisible()
  // Cancel saves nothing
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
})

test('a folder renamed moves every call in it; a folder added is kept for the team; a deleted one comes off its calls', async ({ page }) => {
  await open(page)
  const d = dialog(page)
  await d.getByRole('textbox', { name: 'Folder name: Partners' }).fill('Partner firms')
  // a name already there is refused
  await d.getByRole('textbox', { name: 'New folder name' }).fill('partner firms')
  await d.getByRole('button', { name: 'Add folder' }).click()
  await expect(d.getByTestId('ft-msg')).toHaveText('There is a folder with that name already.')
  await d.getByRole('textbox', { name: 'New folder name' }).fill('Harbor Wealth')
  await d.getByRole('textbox', { name: 'New folder name' }).press('Enter')
  await expect(d.getByTestId('ft-msg')).toHaveText('Added. It is saved with the rest.')
  // a folder of a lead's company: deleting it leaves its call filed there by its people
  await d.getByRole('button', { name: 'Delete the folder Example Ridge Advisors' }).click()
  await expect(d.getByTestId('ft-msg')).toHaveText('The folder goes when you save. Its calls are filed by the people on them again.')
  await d.getByRole('button', { name: 'Delete the folder Northwind Advisors' }).click()
  await d.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(toasts(page)).toContainText(
    'Saved for the whole team. 1 call is still filed under a deleted folder by the people on it; set a folder on it to move it.',
  )
  await expect.poll(async () => (await metaOf('7001'))?.folder).toBe('Partner firms')
  expect((await metaOf('7001'))?.updated_by).toBe(TEAM.email)
  const kept = await setting('call_folders')
  expect(kept?.value).toEqual(['Harbor Wealth'])
  expect(kept?.updated_by).toBe(TEAM.email)
  await expect(folderNames(page)).toContainText(['Partner firms'])
})

test('two folders cannot share a name, and a name needs two letters', async ({ page }) => {
  await open(page)
  const d = dialog(page)
  await d.getByRole('textbox', { name: 'Folder name: Northwind Advisors' }).fill('Partners')
  await d.getByRole('button', { name: 'Save changes' }).click()
  await expect(d.getByTestId('ft-msg')).toHaveText('Two folders cannot share a name (Partners).')
  await d.getByRole('textbox', { name: 'Folder name: Northwind Advisors' }).fill('N')
  await d.getByRole('button', { name: 'Save changes' }).click()
  await expect(d.getByTestId('ft-msg')).toHaveText('Each folder needs a name of two letters or more, in letters, numbers and spaces.')
  expect((await setting('call_folders'))?.value).toEqual(['Northwind Advisors'])
})

test('the built-in types and buttons take the team’s names, everywhere; Use the usual names puts them back', async ({ page }) => {
  await open(page)
  const d = dialog(page)
  await d.getByRole('textbox', { name: 'Button name: Sales' }).fill('Pipeline')
  await d.getByRole('textbox', { name: 'Call type name: Client demo' }).fill('Product demo')
  // a type of the team's own cannot take a button's name
  await d.getByRole('textbox', { name: 'New call type name' }).fill('client work')
  await d.getByRole('button', { name: 'Add type' }).click()
  await expect(d.getByTestId('ft-msg')).toHaveText('That type is already in the list.')
  await d.getByRole('button', { name: 'Save changes' }).click()
  await expect(toasts(page)).toContainText('Saved for the whole team.')
  await expect.poll(async () => (await setting('call_type_names'))?.value).toMatchObject({ demo: 'Product demo', 'cat:sales': 'Pipeline', interview: '', 'cat:demo': '' })
  await expect(types(page)).toHaveText(['All 6', 'Client demos 1', 'Pipeline 1', 'Client work 1', 'Internal development 0', 'Internal meetings 2', 'Partner call 1'])
  const pick = page.locator('[data-testid="task-card"][data-id="9003"]').getByRole('combobox', { name: 'Call type' })
  expect(await pick.locator('optgroup').first().evaluate((g) => (g as HTMLOptGroupElement).label)).toBe('Client demos')
  await expect(pick.locator('optgroup[label="Pipeline"]')).toHaveCount(1)
  await expect(pick.locator('option[value="demo"]')).toHaveText('Product demo')

  // and on Calls
  await page.goto('/calls')
  await expect(page.getByRole('toolbar', { name: 'Show calls by type' }).getByRole('button', { name: /^Pipeline/ })).toBeVisible()

  await page.getByRole('button', { name: 'Folders and types' }).click()
  await dialog(page).getByRole('button', { name: 'Use the usual names' }).click()
  await expect(dialog(page).getByTestId('ft-msg')).toHaveText('The built-in types and buttons have their usual names again. Save to keep it.')
  await expect(dialog(page).getByRole('textbox', { name: 'Button name: Pipeline' })).toHaveValue('Sales')
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(async () => (await setting('call_type_names'))?.value).toMatchObject({ demo: '', 'cat:sales': '' })
})

test('a type of the team’s own: renamed on every call that has it, added, or deleted from its calls', async ({ page }) => {
  await open(page)
  const d = dialog(page)
  await d.getByTestId('ft-own').getByRole('textbox', { name: 'Call type name: Partner call' }).fill('Referral call')
  await d.getByRole('textbox', { name: 'New call type name' }).fill('Podcast')
  await d.getByRole('button', { name: 'Add type' }).click()
  await d.getByRole('button', { name: 'Save changes' }).click()
  await expect(toasts(page)).toContainText('Saved for the whole team.')
  await expect.poll(async () => (await metaOf('7001'))?.meeting_type).toBe('Referral call')
  expect((await setting('call_types'))?.value).toEqual(['Referral call', 'Podcast'])
  await expect(types(page).filter({ hasText: 'Referral call' })).toHaveText('Referral call 1')

  await page.getByRole('button', { name: 'Folders and types' }).click()
  await dialog(page).getByRole('button', { name: 'Delete the type Referral call' }).click()
  await expect(dialog(page).getByTestId('ft-msg')).toHaveText('The type goes when you save. Its calls show the AI’s pick again.')
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(async () => (await metaOf('7001'))?.meeting_type ?? null).toBe(null)
  expect((await setting('call_types'))?.value).toEqual(['Podcast'])
})

test('Calls has the same window by its filters, with the calls loaded counted in each folder', async ({ page }) => {
  await open(page, '/calls')
  await expect(dialog(page).getByRole('textbox', { name: 'Folder name: Sample Peak Partners' })).toBeVisible()
  await expect(dialog(page).getByTestId('ft-folder').filter({ has: page.getByRole('textbox', { name: 'Folder name: Sample Peak Partners' }) })).toContainText('2 calls')
})
