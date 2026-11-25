import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { STUB, TEAM, serveLogo, signIn, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { TASK_METAS, TASK_OUTPUTS } from './tasks-fixtures'

// Tasks' Select and Send to Notion (the current dashboard's v143 and v144): pick a call's tasks, then send them to a
// Notion database through Dashboard · Notion Proxy, an entry each named "<task> · <call>" plus a follow-up; the database
// used last and what went where per call are kept for the team. Send to Asana stays in the current dashboard.

test.use({ timezoneId: 'UTC' })

const card = (page: Page, id: string) => page.locator(`[data-testid="task-card"][data-id="${id}"]`)
const dlg = (page: Page) => page.getByRole('dialog', { name: 'Send tasks to Notion' })
const toasts = (page: Page) => page.getByTestId('toasts')
const setting = async (key: string) => (await stubRows<{ key: string; value: Record<string, unknown> }>('ai_settings')).find((r) => r.key === key)?.value
const notion = async (state?: Record<string, unknown>) =>
  (
    await fetch(STUB + '/__notion', state ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) } : undefined)
  ).json() as Promise<{ added: { db: string; title: string }[] }>

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ call_outputs: TASK_OUTPUTS, call_meta: TASK_METAS })
})

async function pick(page: Page) {
  await signIn(page, '/tasks')
  const robin = card(page, '9001')
  await robin.getByRole('button', { name: 'Select' }).click()
  return robin
}

test('Select picks a call’s tasks: All, None, one by one; Done puts the boxes away; there is no Send to Asana here', async ({ page }) => {
  const robin = await pick(page)
  const bar = robin.getByTestId('pick-bar')
  await expect(bar.locator('b')).toHaveText('Pick the tasks to send')
  await expect(bar.getByRole('button')).toHaveText(['All', 'None', 'Send to Notion', 'Done'])
  await expect(page.getByRole('button', { name: 'Send to Asana' })).toHaveCount(0)
  await bar.getByRole('button', { name: 'All' }).click()
  await expect(bar.locator('b')).toHaveText('2 picked')
  await bar.getByRole('button', { name: 'None' }).click()
  await expect(bar.locator('b')).toHaveText('Pick the tasks to send')
  await robin.getByRole('checkbox', { name: 'Pick “Book the assessment”' }).check()
  await expect(bar.locator('b')).toHaveText('1 picked')
  await bar.getByRole('button', { name: 'Done' }).click()
  await expect(robin.getByTestId('pick-bar')).toHaveCount(0)
  await expect(robin.getByRole('checkbox', { name: /^Pick/ })).toHaveCount(0)
  // a folded call opens when it is picked from
  await robin.getByRole('button', { name: 'Hide this call’s tasks' }).click()
  await robin.getByRole('button', { name: 'Select' }).click()
  await expect(robin.getByRole('button', { name: 'Show this call’s tasks' })).toHaveCount(0)
  await expect(robin.getByTestId('pick-bar')).toBeVisible()
})

test('Send to Notion: the picked tasks and a follow-up, each an entry; what went where is kept for the team', async ({ page }) => {
  const robin = await pick(page)
  await robin.getByRole('checkbox', { name: 'Pick “Send the onboarding checklist”' }).check()
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page)).toContainText('Each ticked task becomes an entry in the database you pick, named for the task and the call.')
  // the database with "task" in its name, as nothing was used yet
  await expect(dlg(page).getByRole('combobox')).toHaveValue('db-tasks')
  await expect(dlg(page).getByRole('combobox').locator('option')).toHaveText(['Clients', 'Team tasks'])
  await expect(dlg(page).getByRole('checkbox', { name: 'Send the onboarding checklist · QA Teammate' })).toBeChecked()
  await expect(dlg(page).getByRole('checkbox', { name: 'Book the assessment · Robin Sample' })).not.toBeChecked()
  await expect(dlg(page).getByRole('checkbox', { name: 'Add a follow-up entry: “Follow-up: Discovery consultation with Robin”' })).toBeChecked()
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page)).toHaveCount(0)
  await expect(toasts(page)).toContainText('2 sent to Notion · Team tasks')
  expect((await notion()).added).toEqual([
    { db: 'db-tasks', title: 'Send the onboarding checklist · Discovery consultation with Robin' },
    { db: 'db-tasks', title: 'Follow-up: Discovery consultation with Robin (Nov 4, 2026)' },
  ])
  expect(((await setting('notion_sent')) ?? {})['9001']).toMatchObject({ db: 'db-tasks', name: 'Team tasks', n: 2, by: TEAM.email })
  expect(await setting('notion_tasks_db')).toMatchObject({ id: 'db-tasks', name: 'Team tasks', by: TEAM.email })

  // a second send says so first, and adds to the count
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByTestId('notion-was')).toContainText('Already sent 2 to “Team tasks” on ')
  await expect(dlg(page).getByTestId('notion-was')).toContainText('by ' + TEAM.email + '. Sending again adds new entries.')
  await dlg(page).getByRole('checkbox', { name: /^Add a follow-up entry/ }).uncheck()
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(toasts(page)).toContainText('1 sent to Notion · Team tasks')
  expect(((await setting('notion_sent')) ?? {})['9001']).toMatchObject({ n: 3 })
})

test('the database used last is picked; a stop halfway says how many went, and Send the rest sends only the others', async ({ page }) => {
  await stubSeed({ ai_settings: [...fixtures().ai_settings, { key: 'notion_tasks_db', value: { id: 'db-clients', name: 'Clients' } }] })
  await notion({ stopAfter: 1 })
  const robin = await pick(page)
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByRole('combobox')).toHaveValue('db-clients')
  // nothing picked: the open tasks are ticked
  await expect(dlg(page).getByRole('checkbox', { name: /^Send the onboarding checklist/ })).toBeChecked()
  await dlg(page).getByRole('checkbox', { name: /^Send the onboarding checklist/ }).uncheck()
  await dlg(page).getByRole('checkbox', { name: /^Add a follow-up entry/ }).uncheck()
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByTestId('notion-err')).toHaveText('Tick at least one task, or the follow-up.')
  await dlg(page).getByRole('checkbox', { name: /^Send the onboarding checklist/ }).check()
  await dlg(page).getByRole('checkbox', { name: /^Add a follow-up entry/ }).check()
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByTestId('notion-err')).toHaveText('1 sent, then Notion stopped: Notion is busy right now. Send the rest picks up from there.')
  await expect(dlg(page).getByRole('checkbox', { name: /^Send the onboarding checklist/ })).not.toBeChecked()
  await expect(dlg(page).getByRole('checkbox', { name: /^Add a follow-up entry/ })).toBeChecked()
  expect(((await setting('notion_sent')) ?? {})['9001']).toMatchObject({ db: 'db-clients', n: 1 })
  await dlg(page).getByRole('button', { name: 'Send the rest' }).click()
  await expect(toasts(page)).toContainText('1 sent to Notion · Clients')
  expect((await notion()).added.map((x) => x.title)).toEqual([
    'Send the onboarding checklist · Discovery consultation with Robin',
    'Follow-up: Discovery consultation with Robin (Nov 4, 2026)',
  ])
  expect(((await setting('notion_sent')) ?? {})['9001']).toMatchObject({ n: 2 })
})

test('no database shared yet shows how to share one, and Check again; Notion switched off says so', async ({ page }) => {
  await notion({ dbs: [] })
  const robin = await pick(page)
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page)).toContainText('Notion shares no databases with the dashboard yet.')
  await expect(dlg(page).getByTestId('notion-steps').locator('b')).toHaveText([
    'Open the database in Notion',
    '⋯ → Connections → add the n8n connection',
    'Come back and press Check again',
  ])
  await notion({ dbs: [{ object: 'database', id: 'db-new', title: [{ plain_text: 'Follow-ups' }] }] })
  await dlg(page).getByRole('button', { name: 'Check again' }).click()
  await expect(dlg(page).getByRole('combobox').locator('option')).toHaveText(['Pick a database…', 'Follow-ups'])
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByTestId('notion-err')).toHaveText('Pick a database first.')
  await dlg(page).getByRole('button', { name: 'Cancel' }).click()

  await stubHook('notion-proxy', 404, { message: 'not registered' })
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page)).toContainText('The Notion connection is switched off in n8n.')
  await dlg(page).getByRole('button', { name: 'Close' }).first().click()
  await expect(dlg(page)).toHaveCount(0)
})
