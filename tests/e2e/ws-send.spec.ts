import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { STUB, TEAM, serveLogo, signIn, stubHook, stubReset, stubRows, stubSeed } from './helpers'

// The client workspace sends to Notion (the current dashboard's v151): Select in the workspace's header picks items, and
// the bar sends them to a Notion database through Dashboard · Notion Proxy, an entry each named "<item> · <client>", plus
// a follow-up if ticked. What went where is kept on the item in ai_settings catalyst_ws (items[key].notion) and shows on
// its row, with In Asana for what was sent there (Send to Asana is in asana.spec.ts). On the stand-in's made-up Pat Example (Example Ridge Advisors).

test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 900 } })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const INTAKE = 'f:20000000-0000-4000-8000-000000000001'
const items = (page: Page) => page.getByTestId('ws-item')
const item = (page: Page, name: string) => items(page).filter({ hasText: name })
const bar = (page: Page) => page.getByTestId('ws-pick-bar')
const dlg = (page: Page) => page.getByRole('dialog', { name: 'Send to Notion' })
const toasts = (page: Page) => page.getByTestId('toasts')
const F = () => fixtures() as unknown as { ai_settings: Record<string, unknown>[] }
const setting = async (key: string) => (await stubRows<{ key: string; value: Record<string, unknown> }>('ai_settings')).find((r) => r.key === key)?.value
type Ws = Record<string, { folders: { id: string; name: string }[]; items: Record<string, Record<string, unknown>> }>
const ws = async () => ((await setting('catalyst_ws')) ?? {}) as Ws
const notion = async (state?: Record<string, unknown>) =>
  (
    await fetch(STUB + '/__notion', state ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) } : undefined)
  ).json() as Promise<{ added: { db: string; title: string }[] }>

// what the current dashboard writes: an Asana send on one item, and another lead's workspace, both to be kept
const ASANA = { at: '2026-11-20T15:00:00Z', by: 'erica@aiparagonconsulting.com', project: 'p2', project_name: 'Internal', url: 'https://app.asana.com/0/p2/list' }
const SEEDED: Ws = {
  'pat.example@example.com': {
    folders: [{ id: 'wf-deals01', name: 'Deals' }],
    items: { [INTAKE]: { star: true, desc: 'From the first call' }, 'a:lead_research': { asana: ASANA } },
  },
  'someone.else@example.com': { folders: [], items: { 'a:interview_script': { star: true, notion: { at: '2026-11-01T10:00:00Z', by: 'x', db: 'db-x', name: 'Other' } } } },
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ ai_settings: [...F().ai_settings, { key: 'catalyst_ws', value: SEEDED }] })
})

async function open(page: Page) {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  await expect(items(page).first()).toBeVisible()
  await page.getByRole('button', { name: 'Select' }).click()
}

test('Select puts a box on each row and the bar: All shown, None, one by one; Done puts them away', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  await expect(items(page)).toHaveCount(6)
  await expect(page.getByRole('checkbox', { name: /^Pick / })).toHaveCount(0)
  await expect(bar(page)).toHaveCount(0)
  const select = page.getByRole('button', { name: 'Select' })
  await select.click()
  await expect(select).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('checkbox', { name: /^Pick / })).toHaveCount(6)
  await expect(bar(page).locator('b')).toHaveText('Pick items to send')
  await expect(bar(page).getByRole('button')).toHaveText(['All shown', 'None', 'Send to Asana', 'Send to Notion', 'Done'])
  await expect(bar(page).getByRole('button', { name: 'Send to Notion' })).toBeDisabled()
  await expect(bar(page).getByRole('button', { name: 'Send to Asana' })).toBeDisabled()

  await bar(page).getByRole('button', { name: 'All shown' }).click()
  await expect(bar(page).locator('b')).toHaveText('6 items picked')
  await bar(page).getByRole('button', { name: 'None' }).click()
  await expect(bar(page).locator('b')).toHaveText('Pick items to send')
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await expect(bar(page).locator('b')).toHaveText('1 item picked')
  await expect(bar(page).getByRole('button', { name: 'Send to Notion' })).toBeEnabled()
  await expect(bar(page).getByRole('button', { name: 'Send to Asana' })).toBeEnabled()

  // a call picked in the Calls view counts too, and the file stays picked
  await page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab', { name: /^Calls/ }).click()
  await page.getByRole('checkbox', { name: 'Pick Catch-up with Pat' }).check()
  await expect(bar(page).locator('b')).toHaveText('2 items picked')
  // All shown adds what this view shows
  await bar(page).getByRole('button', { name: 'All shown' }).click()
  await expect(bar(page).locator('b')).toHaveText('2 items picked')

  await bar(page).getByRole('button', { name: 'Done' }).click()
  await expect(bar(page)).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /^Pick / })).toHaveCount(0)
  await expect(select).toHaveAttribute('aria-pressed', 'false')
  // picking again starts with nothing picked
  await select.click()
  await expect(bar(page).locator('b')).toHaveText('Pick items to send')
  // the header's Select turns it off too
  await select.click()
  await expect(bar(page)).toHaveCount(0)
})

test('Send to Notion: an entry per item named for it and the client, and the follow-up; kept on each item, the rest of the setting kept', async ({ page }) => {
  await open(page)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await page.getByRole('checkbox', { name: 'Pick Follow-up guide' }).check()
  await bar(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page)).toContainText('Each picked item becomes an entry in the database you pick, named for it and Example Ridge Advisors.')
  await expect(dlg(page)).toContainText('Notion gets the names only, as Tasks sends them. The links stay on the dashboard.')
  // nothing used yet: the database with "task" in its name
  await expect(dlg(page).getByRole('combobox')).toHaveValue('db-tasks')
  const rows = dlg(page).getByTestId('notion-items').getByRole('checkbox')
  await expect(rows).toHaveCount(2)
  await expect(dlg(page).getByRole('checkbox', { name: 'Intake notes.docx · Example Ridge Advisors · File' })).toBeChecked()
  await expect(dlg(page).getByRole('checkbox', { name: 'Follow-up guide · Example Ridge Advisors · Document' })).toBeChecked()
  const fu = dlg(page).getByRole('checkbox', { name: 'Add a follow-up entry: “Follow-up: Example Ridge Advisors”' })
  await expect(fu).not.toBeChecked()
  await fu.check()
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page)).toHaveCount(0)
  await expect(toasts(page)).toContainText('3 entries sent to Notion · Team tasks')
  // in the order the items are listed (the documents, then the uploads), then the follow-up
  expect((await notion()).added).toEqual([
    { db: 'db-tasks', title: 'Follow-up guide · Example Ridge Advisors' },
    { db: 'db-tasks', title: 'Intake notes.docx · Example Ridge Advisors' },
    { db: 'db-tasks', title: 'Follow-up: Example Ridge Advisors' },
  ])

  const all = await ws()
  const pat = all['pat.example@example.com']
  const rec = { at: expect.any(String), by: TEAM.email, db: 'db-tasks', name: 'Team tasks' }
  expect(pat.items[INTAKE]).toEqual({ star: true, desc: 'From the first call', notion: rec })
  expect(pat.items['a:discovery_call']).toEqual({ notion: rec })
  // the current dashboard's Asana entry, the team's folder and another lead's workspace are kept
  expect(pat.items['a:lead_research']).toEqual({ asana: ASANA })
  expect(pat.folders).toEqual([{ id: 'wf-deals01', name: 'Deals' }])
  expect(all['someone.else@example.com']).toEqual(SEEDED['someone.else@example.com'])
  expect(await setting('notion_tasks_db')).toMatchObject({ id: 'db-tasks', name: 'Team tasks', by: TEAM.email })
  // Tasks' per-call record is not touched
  expect(await setting('notion_sent')).toBeUndefined()

  // the rows say where they went, and picking is done
  await expect(item(page, 'Intake notes.docx').getByTestId('ws-sent')).toHaveText('In Notion · Team tasks')
  await expect(item(page, 'Follow-up guide').getByTestId('ws-sent')).toHaveText('In Notion · Team tasks')
  await expect(bar(page)).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /^Pick / })).toHaveCount(0)
})

test('the database used last is picked; a stop halfway says how many went, keeps those, and Send the rest sends only the others', async ({ page }) => {
  await stubSeed({ ai_settings: [...F().ai_settings, { key: 'catalyst_ws', value: SEEDED }, { key: 'notion_tasks_db', value: { id: 'db-clients', name: 'Clients' } }] })
  await notion({ stopAfter: 1 })
  await open(page)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await page.getByRole('checkbox', { name: 'Pick Follow-up guide' }).check()
  await bar(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByRole('combobox')).toHaveValue('db-clients')
  for (const c of await dlg(page).getByTestId('notion-items').getByRole('checkbox').all()) await c.uncheck()
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByTestId('notion-err')).toHaveText('Tick at least one item, or the follow-up.')
  for (const c of await dlg(page).getByTestId('notion-items').getByRole('checkbox').all()) await c.check()
  await dlg(page).getByRole('checkbox', { name: /^Add a follow-up entry/ }).check()
  await dlg(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByTestId('notion-err')).toHaveText('1 sent, then Notion stopped: Notion is busy right now. Send the rest picks up from there.')
  await expect(dlg(page).getByRole('button', { name: 'Send the rest' })).toBeVisible()
  // the first one (the list's order: Follow-up guide) went: unticked, kept on its item, shown on its row
  await expect(dlg(page).getByRole('checkbox', { name: /^Follow-up guide/ })).not.toBeChecked()
  await expect(dlg(page).getByRole('checkbox', { name: /^Intake notes/ })).toBeChecked()
  await expect(dlg(page).getByRole('checkbox', { name: /^Add a follow-up entry/ })).toBeChecked()
  let pat = (await ws())['pat.example@example.com']
  expect(pat.items['a:discovery_call']).toMatchObject({ notion: { db: 'db-clients', name: 'Clients' } })
  expect(pat.items[INTAKE].notion).toBeUndefined()
  // not everything went: the database used last is left as it was
  expect(await setting('notion_tasks_db')).toEqual({ id: 'db-clients', name: 'Clients' })
  await expect(item(page, 'Follow-up guide').getByTestId('ws-sent')).toHaveText('In Notion · Clients')

  await dlg(page).getByRole('button', { name: 'Send the rest' }).click()
  await expect(dlg(page)).toHaveCount(0)
  await expect(toasts(page)).toContainText('2 entries sent to Notion · Clients')
  expect((await notion()).added.map((x) => x.title)).toEqual([
    'Follow-up guide · Example Ridge Advisors',
    'Intake notes.docx · Example Ridge Advisors',
    'Follow-up: Example Ridge Advisors',
  ])
  pat = (await ws())['pat.example@example.com']
  expect(pat.items[INTAKE]).toMatchObject({ star: true, notion: { db: 'db-clients', name: 'Clients', by: TEAM.email } })
  expect(await setting('notion_tasks_db')).toMatchObject({ id: 'db-clients', name: 'Clients', by: TEAM.email })
})

test('no database shared yet shows how to share one, and Check again; Notion switched off says so', async ({ page }) => {
  await notion({ dbs: [] })
  await open(page)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await bar(page).getByRole('button', { name: 'Send to Notion' }).click()
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
  await expect(dlg(page)).toHaveCount(0)
  // Cancel keeps what is picked
  await expect(bar(page).locator('b')).toHaveText('1 item picked')

  await stubHook('notion-proxy', 404, { message: 'not registered' })
  await bar(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page)).toContainText('The Notion connection is switched off in n8n.')
  await dlg(page).getByRole('button', { name: 'Close' }).first().click()
  await expect(dlg(page)).toHaveCount(0)
  expect((await notion()).added).toEqual([])
})

test('the rows say where they went: In Asana as the current dashboard wrote it, In Notion, on files and calls', async ({ page }) => {
  await stubSeed({
    ai_settings: [
      ...F().ai_settings,
      {
        key: 'catalyst_ws',
        value: {
          'pat.example@example.com': {
            folders: [],
            items: {
              'a:lead_research': { asana: ASANA, notion: { at: '2026-11-21T09:00:00Z', by: TEAM.email, db: 'db-tasks', name: 'Team tasks' } },
              'c:9004': { asana: { ...ASANA, project_name: 'Client work' } },
            },
          },
        },
      },
    ],
  })
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  const brief = item(page, 'Pre-meeting prospect brief').getByTestId('ws-sent')
  await expect(brief).toHaveText(['In Asana · Internal', 'In Notion · Team tasks'])
  await expect(brief.first()).toHaveAttribute('title', 'Sent to Asana on Nov 20, 2026')
  await expect(brief.last()).toHaveAttribute('title', 'Sent to Notion on Nov 21, 2026')
  await expect(item(page, 'Intake notes.docx').getByTestId('ws-sent')).toHaveCount(0)
  await page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab', { name: /^Calls/ }).click()
  await expect(item(page, 'Catch-up with Pat').getByTestId('ws-sent')).toHaveText('In Asana · Client work')
})

test('on a phone: the boxes, the bar and the window fit, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await expect(bar(page).locator('b')).toHaveText('1 item picked')
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(await wide()).toBeLessThanOrEqual(1)
  await bar(page).getByRole('button', { name: 'Send to Notion' }).click()
  await expect(dlg(page).getByRole('combobox')).toHaveValue('db-tasks')
  expect(await wide()).toBeLessThanOrEqual(1)
  const box = await dlg(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(391)
})
