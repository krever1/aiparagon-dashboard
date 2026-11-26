import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { STUB, TEAM, serveLogo, signIn, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { TASK_METAS, TASK_OUTPUTS } from './tasks-fixtures'

// Send to Asana (the current dashboard's v143 for Tasks and v151 for the client workspace): the project (the one used
// last), an assignee from the Asana workspace, and each picked row's due date and description, then a task each. With an
// Asana token saved in this browser it goes straight to Asana (answered here by page.route); without one, through the
// team's Integrations · Asana Proxy (the stand-in's asana-proxy). With neither, Connect Asana in 3 steps, then on.

test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 900 } })

const GOOD = '2/1200000000/1234567890:goodqatoken'
const ROBIN_OUT = '41000000-0000-4000-8000-000000000001'
const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const INTAKE = 'f:20000000-0000-4000-8000-000000000001'
const card = (page: Page, id: string) => page.locator(`[data-testid="task-card"][data-id="${id}"]`)
const dlg = (page: Page, name = 'Send tasks to Asana') => page.getByRole('dialog', { name, exact: true })
const toasts = (page: Page) => page.getByTestId('toasts')
const asanaState = async (state?: Record<string, unknown>) =>
  (
    await fetch(STUB + '/__asana', state ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) } : undefined)
  ).json() as Promise<{ created: { gid: string; project: string; name: string; notes: string; due: string; assignee: string }[] }>
const outRow = async (id = ROBIN_OUT) => (await stubRows<{ id: string; asana: Record<string, unknown> | null }>('call_outputs')).find((r) => r.id === id)
const setting = async (key: string) => (await stubRows<{ key: string; value: Record<string, unknown> }>('ai_settings')).find((r) => r.key === key)?.value
const stored = (page: Page, k: string) => page.evaluate((key) => localStorage.getItem(key), k)

type Posted = { auth: string; body: Record<string, unknown> }
/** Asana's own API for the token path: the good token works; `forbid` turns task creation away, `down` drops it. */
async function asanaApi(page: Page, opts: { forbid?: boolean; down?: boolean; refusePost?: boolean } = {}) {
  const posts: Posted[] = []
  const seen: string[] = []
  await page.route('https://app.asana.com/**', async (route) => {
    const req = route.request()
    const p = new URL(req.url()).pathname.replace('/api/1.0', '')
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const auth = req.headers()['authorization'] || ''
    seen.push(req.method() + ' ' + p)
    const j = (s: number, data: unknown) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(data) })
    if (auth !== 'Bearer ' + GOOD) return j(401, { errors: [{ message: 'Not Authorized' }] })
    if (p === '/users/me') return j(200, { data: { gid: 'u1', name: 'QA Tester', email: 'qa@example.com', workspaces: [{ gid: 'w1', name: 'QA Workspace' }] } })
    if (p === '/workspaces') return j(200, { data: [{ gid: 'w1', name: 'QA Workspace' }] })
    if (p === '/projects') return j(200, { data: [{ gid: 'p1', name: 'Client launches' }, { gid: 'p2', name: 'Internal' }] })
    if (p === '/users') return j(200, { data: [{ gid: 'u1', name: 'QA Tester' }, { gid: 'u2', name: 'Erica Example' }] })
    if (p === '/tasks' && req.method() === 'POST') {
      if (opts.down) return route.abort('connectionrefused')
      if (opts.refusePost) return j(401, { errors: [{ message: 'Not Authorized' }] })
      if (opts.forbid) return j(403, { errors: [] })
      const body = (JSON.parse(req.postData() || '{}').data || {}) as Record<string, unknown>
      posts.push({ auth, body })
      return j(201, { data: { gid: 'a' + posts.length, name: body.name, permalink_url: 'https://app.asana.com/0/p/' + posts.length } })
    }
    return j(404, { errors: [{ message: 'not stubbed' }] })
  })
  return { posts, seen }
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ call_outputs: TASK_OUTPUTS, call_meta: TASK_METAS })
})

async function pickRobin(page: Page) {
  await signIn(page, '/tasks')
  const robin = card(page, '9001')
  await robin.getByRole('button', { name: 'Select' }).click()
  return robin
}

test('Tasks: Send to Asana through the team connection, with the project, assignee, due date and description; saved on the call', async ({ page }) => {
  const robin = await pickRobin(page)
  await robin.getByRole('checkbox', { name: 'Pick “Send the onboarding checklist”' }).check()
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  const d = dlg(page)
  await expect(d).toContainText('Each ticked task becomes an Asana task in the project you pick.')
  await expect(d.getByTestId('asana-via')).toHaveText('Sending through the team’s Asana connection in n8n.')
  const project = d.getByRole('combobox', { name: 'Project' })
  await expect(project.locator('option')).toHaveText(['Client onboarding', 'Internal'])
  await expect(project).toHaveValue('p1')
  const who = d.getByRole('combobox', { name: /Assignee/ })
  await expect(who.locator('option')).toHaveText(['Unassigned', 'QA Teammate', 'Erica Example'])
  await expect(d.getByRole('checkbox', { name: 'Send “Send the onboarding checklist”' })).toBeChecked()
  await expect(d.getByRole('checkbox', { name: 'Send “Book the assessment”' })).not.toBeChecked()
  const due = d.getByLabel('Due date for “Send the onboarding checklist”')
  await expect(due).toHaveValue('2026-11-12')
  const notes = d.getByRole('textbox', { name: 'Description for “Send the onboarding checklist”' })
  await expect(notes).toHaveValue(
    'From the call “Discovery consultation with Robin” on Nov 4, 2026\nOwner: QA Teammate\nWhy: They asked for it\nRecording: https://fathom.video/share/robinDiscovery01',
  )
  await project.selectOption('p2')
  await who.selectOption('u2')
  await due.fill('2026-12-01')
  await notes.fill('Draft the checklist first.')
  await d.getByRole('button', { name: 'Send to Asana' }).click()
  await expect(d).toHaveCount(0)
  await expect(toasts(page)).toContainText('1 task sent to Internal.')

  expect((await asanaState()).created).toEqual([
    { gid: 't1', project: 'p2', name: 'Send the onboarding checklist', notes: 'Draft the checklist first.', due: '2026-12-01', assignee: 'u2' },
  ])
  expect((await outRow())?.asana).toEqual({
    at: expect.any(String),
    project: 'p2',
    project_name: 'Internal',
    url: 'https://app.asana.com/0/p2/list',
    tasks: [{ gid: 't1', name: 'Send the onboarding checklist', url: 'https://app.asana.com/0/p2/t1' }],
  })
  await expect(robin).toContainText('Nov 4, 2026 · in Asana · Internal')
  await expect(robin.getByTestId('pick-bar')).toHaveCount(0)
  // the project and the person used last are picked next time; the team's connection never saves a token here
  expect(await stored(page, 'ap.next.asana.project')).toBe('p2')
  expect(await stored(page, 'ap.next.asana.pat')).toBeNull()
  await robin.getByRole('button', { name: 'Select' }).click()
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page).getByRole('combobox', { name: 'Project' })).toHaveValue('p2')
  await expect(dlg(page).getByRole('combobox', { name: /Assignee/ })).toHaveValue('u2')
  // nothing ticked says so
  await dlg(page).getByRole('checkbox', { name: 'Send “Send the onboarding checklist”' }).uncheck()
  await dlg(page).getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page).getByTestId('asana-err')).toHaveText('Tick at least one task.')
})

test('Tasks: a stop halfway says how many went and keeps those; Send the rest sends only the others', async ({ page }) => {
  await asanaState({ stopAfter: 1 })
  const robin = await pickRobin(page)
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'All' }).click()
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  const d = dlg(page)
  await expect(d.getByRole('checkbox', { name: 'Send “Book the assessment”' })).toBeChecked()
  await d.getByRole('button', { name: 'Send to Asana' }).click()
  await expect(d.getByTestId('asana-err')).toHaveText('1 sent, then Asana stopped: Asana is busy right now. Send the rest picks up from there.')
  await expect(d.getByRole('checkbox', { name: 'Send “Send the onboarding checklist”' })).not.toBeChecked()
  await expect(d.getByRole('checkbox', { name: 'Send “Book the assessment”' })).toBeChecked()
  expect(((await outRow())?.asana?.tasks as unknown[]).length).toBe(1)
  await d.getByRole('button', { name: 'Send the rest' }).click()
  await expect(d).toHaveCount(0)
  await expect(toasts(page)).toContainText('2 tasks sent to Client onboarding.')
  expect((await asanaState()).created.map((t) => t.name)).toEqual(['Send the onboarding checklist', 'Book the assessment'])
  const a = (await outRow())?.asana
  expect(a).toMatchObject({ project: 'p1', project_name: 'Client onboarding' })
  expect((a?.tasks as { gid: string }[]).map((t) => t.gid)).toEqual(['t1', 't2'])
})

test('Tasks: with no connection, Connect Asana in 3 steps; a token that is not one or that Asana refuses is not kept; then it sends with the token', async ({ page }) => {
  const api = await asanaApi(page)
  await asanaState({ connected: false })
  const robin = await pickRobin(page)
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  const d = dlg(page)
  await expect(d).toContainText('Connect Asana once to send tasks there.')
  await expect(d.getByTestId('asana-steps').locator('b')).toHaveText(['Create a personal access token', 'Paste the token below', 'Connect'])
  await expect(d.getByRole('link', { name: 'app.asana.com/0/my-apps' })).toHaveAttribute('href', 'https://app.asana.com/0/my-apps')
  await expect(d).not.toContainText(/could not be reached|webhook/i)
  const tok = d.getByRole('textbox', { name: 'Asana personal access token' })
  await expect(tok).toBeFocused()
  await tok.fill('nope')
  await d.getByRole('button', { name: 'Connect' }).click()
  await expect(d.getByTestId('asana-connect-err')).toHaveText('That does not look like an Asana token. Copy it again from app.asana.com/0/my-apps.')
  await tok.fill('2/1200000000/9999:badqatoken')
  await d.getByRole('button', { name: 'Connect' }).click()
  await expect(d.getByTestId('asana-connect-err')).toHaveText('Asana didn’t accept that token. Copy it again from app.asana.com/0/my-apps.')
  expect(await stored(page, 'ap.next.asana.pat')).toBeNull()

  await tok.fill(GOOD)
  await tok.press('Enter')
  await expect(toasts(page)).toContainText('Asana connected as QA Tester.')
  expect(await stored(page, 'ap.next.asana.pat')).toBe(GOOD)
  expect(await stored(page, 'ap.next.asana.ws')).toBe('w1')
  // back to the form, now on this browser's token, with the token's workspace and people
  await expect(d.getByTestId('asana-via')).toContainText('Sending with the Asana token saved in this browser.')
  await expect(d.getByRole('combobox', { name: 'Project' }).locator('option')).toHaveText(['Client launches', 'Internal'])
  await expect(d.getByRole('combobox', { name: /Assignee/ }).locator('option')).toHaveText(['Unassigned', 'QA Tester', 'Erica Example'])
  await d.getByRole('combobox', { name: 'Project' }).selectOption('p2')
  await d.getByRole('combobox', { name: /Assignee/ }).selectOption('u2')
  await d.getByRole('button', { name: 'Send to Asana' }).click()
  await expect(d).toHaveCount(0)
  await expect(toasts(page)).toContainText('1 task sent to Internal.')
  expect(api.posts).toEqual([
    {
      auth: 'Bearer ' + GOOD,
      body: {
        name: 'Send the onboarding checklist',
        notes: expect.stringContaining('From the call “Discovery consultation with Robin” on Nov 4, 2026'),
        projects: ['p2'],
        due_on: '2026-11-12',
        assignee: 'u2',
      },
    },
  ])
  expect((await outRow())?.asana).toMatchObject({ project: 'p2', project_name: 'Internal', tasks: [{ gid: 'a1', name: 'Send the onboarding checklist' }] })
  // the team's proxy made nothing, and the token never went to the dashboard's server or n8n
  expect((await asanaState()).created).toEqual([])
  const calls = (await (await fetch(STUB + '/__calls')).json()) as { body: unknown }[]
  expect(JSON.stringify(calls)).not.toContain('goodqatoken')
})

test('Tasks: the team workflow switched off shows the 3 steps; a saved token Asana refuses is dropped and the steps show; no access and Asana down say so', async ({ page }) => {
  await stubHook('asana-proxy', 404, { message: 'The requested webhook is not registered.' })
  const robin = await pickRobin(page)
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page).getByTestId('asana-steps')).toBeVisible()
  await expect(dlg(page)).not.toContainText(/could not be reached|webhook|switched off/i)
  await dlg(page).getByRole('button', { name: 'Close' }).first().click()

  // a token saved before that Asana now refuses: dropped, and the steps ask again
  await page.evaluate(() => localStorage.setItem('ap.next.asana.pat', '2/1200000000/old:expiredtoken'))
  const api = await asanaApi(page)
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page)).toContainText('Asana didn’t accept the saved token. Connect again:')
  expect(await stored(page, 'ap.next.asana.pat')).toBeNull()
  await dlg(page).getByRole('textbox', { name: 'Asana personal access token' }).fill(GOOD)
  await dlg(page).getByRole('button', { name: 'Connect' }).click()
  await expect(dlg(page).getByTestId('asana-via')).toBeVisible()
  await dlg(page).getByRole('button', { name: 'Cancel' }).click()
  expect(api.seen).toContain('GET /users/me')

  // a project the token cannot add to
  await page.unroute('https://app.asana.com/**')
  await asanaApi(page, { forbid: true })
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await dlg(page).getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page).getByTestId('asana-err')).toHaveText('You don’t have access to that project in Asana.')
  await dlg(page).getByRole('button', { name: 'Cancel' }).click()

  // Asana down
  await page.unroute('https://app.asana.com/**')
  await asanaApi(page, { down: true })
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await dlg(page).getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page).getByTestId('asana-err')).toHaveText('Couldn’t reach Asana. Try again in a minute.')
  expect((await outRow())?.asana ?? null).toBeNull()

  // a token refused in the middle of a send: dropped, said, and the steps ask again
  await dlg(page).getByRole('button', { name: 'Cancel' }).click()
  await page.unroute('https://app.asana.com/**')
  await asanaApi(page, { refusePost: true })
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await dlg(page).getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page)).toContainText('Asana didn’t accept the saved token. Connect again:')
  await expect(dlg(page).getByTestId('asana-err')).toHaveText('Asana didn’t accept the saved token.')
  expect(await stored(page, 'ap.next.asana.pat')).toBeNull()
})

test('Disconnect: the Tasks card connects and disconnects this browser; Disconnect in the window falls back to the team connection', async ({ page }) => {
  await asanaApi(page)
  await signIn(page, '/tasks')
  const c = page.getByTestId('asana')
  await expect(c.getByTestId('asana-state')).toContainText('uses the team’s Asana connection in n8n')
  await c.getByRole('button', { name: 'Connect Asana' }).click()
  const cd = page.getByRole('dialog', { name: 'Connect Asana in 3 steps' })
  await expect(cd.getByTestId('asana-steps').locator('li')).toHaveCount(3)
  await cd.getByRole('textbox', { name: 'Asana personal access token' }).fill(GOOD)
  await cd.getByRole('button', { name: 'Connect' }).click()
  await expect(cd).toHaveCount(0)
  await expect(c.getByTestId('asana-state')).toContainText('Connected in this browser with your personal token.')

  // the window uses the token; Disconnect there asks, forgets it and carries on with the team connection
  const robin = card(page, '9001')
  await robin.getByRole('button', { name: 'Select' }).click()
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page).getByTestId('asana-via')).toContainText('Sending with the Asana token saved in this browser.')
  page.once('dialog', (x) => {
    expect(x.message()).toBe('Disconnect Asana in this browser? Tasks already sent stay in Asana.')
    void x.accept()
  })
  await dlg(page).getByTestId('asana-via').getByRole('button', { name: 'Disconnect' }).click()
  await expect(toasts(page)).toContainText('Asana disconnected in this browser.')
  await expect(dlg(page).getByTestId('asana-via')).toHaveText('Sending through the team’s Asana connection in n8n.')
  await expect(dlg(page).getByRole('combobox', { name: 'Project' }).locator('option')).toHaveText(['Client onboarding', 'Internal'])
  expect(await stored(page, 'ap.next.asana.pat')).toBeNull()
  await expect(c.getByRole('button', { name: 'Connect Asana' })).toBeAttached()
  await dlg(page).getByRole('button', { name: 'Cancel' }).click()

  // the card's own Disconnect, after connecting again
  await page.evaluate((t) => localStorage.setItem('ap.next.asana.pat', t), GOOD)
  await page.reload()
  await expect(c.getByRole('button', { name: 'Disconnect' })).toBeVisible()
  page.once('dialog', (x) => void x.dismiss())
  await c.getByRole('button', { name: 'Disconnect' }).click()
  expect(await stored(page, 'ap.next.asana.pat')).toBe(GOOD)
  page.once('dialog', (x) => void x.accept())
  await c.getByRole('button', { name: 'Disconnect' }).click()
  await expect(c.getByRole('button', { name: 'Connect Asana' })).toBeVisible()
  expect(await stored(page, 'ap.next.asana.pat')).toBeNull()
})

// ---------- the client workspace ----------

type Ws = Record<string, { folders: { id: string; name: string }[]; items: Record<string, Record<string, unknown>> }>
const NOTION_REC = { at: '2026-11-21T09:00:00Z', by: 'erica@aiparagonconsulting.com', db: 'db-tasks', name: 'Team tasks' }
const SEEDED: Ws = {
  'pat.example@example.com': {
    folders: [{ id: 'wf-deals01', name: 'Deals' }],
    items: { [INTAKE]: { star: true, desc: 'From the first call', folder: 'wf-deals01' }, 'a:lead_research': { notion: NOTION_REC } },
  },
  'someone.else@example.com': { folders: [], items: { 'a:interview_script': { star: true } } },
}
const ws = async () => ((await setting('catalyst_ws')) ?? {}) as Ws
const F = () => fixtures() as unknown as { ai_settings: Record<string, unknown>[] }

async function openWs(page: Page, signedIn = false) {
  await stubSeed({ ai_settings: [...F().ai_settings, { key: 'catalyst_ws', value: SEEDED }] })
  if (signedIn) await page.goto(`/lead-pipeline/${PAT}?tab=files`)
  else await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  await expect(page.getByTestId('ws-item').first()).toBeVisible()
  await page.getByRole('button', { name: 'Select' }).click()
}

test('Workspace: a task per item named for it and the client, its link in the description; kept on each item, the rest of the setting kept', async ({ page }) => {
  await openWs(page)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab', { name: /^Calls/ }).click()
  await page.getByRole('checkbox', { name: 'Pick Catch-up with Pat' }).check()
  await page.getByTestId('ws-pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  const d = dlg(page, 'Send to Asana')
  await expect(d).toContainText('Each picked item becomes an Asana task in the project you pick, with its link in the description.')
  const intake = d.getByRole('textbox', { name: 'Task name for Intake notes.docx · Example Ridge Advisors' })
  await expect(intake).toHaveValue('Intake notes.docx · Example Ridge Advisors')
  await expect(d.getByRole('textbox', { name: 'Description for “Intake notes.docx · Example Ridge Advisors”' })).toHaveValue(
    'File from Example Ridge Advisors’s workspace · Deals · Oct 6, 2026\nAbout it: From the first call\nOpen it: https://example.com/files/intake-notes.docx',
  )
  await expect(d.getByRole('textbox', { name: 'Description for “Catch-up with Pat · Example Ridge Advisors”' })).toHaveValue(
    /^Call from Example Ridge Advisors’s workspace · Oct 30, 2026\n(Summary: .*\n)?Open it: https:\/\/fathom\.video\/share\/patTeamOnly0001$/,
  )
  await intake.fill('Read the intake notes · Example Ridge Advisors')
  await d.getByLabel('Due date for “Intake notes.docx · Example Ridge Advisors”').fill('2026-12-05')
  await d.getByRole('combobox', { name: 'Project' }).selectOption('p2')
  await d.getByRole('combobox', { name: /Assignee/ }).selectOption('u2')
  // an emptied name is left out
  const cname = d.getByRole('textbox', { name: 'Task name for Catch-up with Pat · Example Ridge Advisors' })
  await cname.fill('')
  await d.getByRole('checkbox', { name: 'Send “Intake notes.docx · Example Ridge Advisors”' }).uncheck()
  await d.getByRole('button', { name: 'Send to Asana' }).click()
  await expect(d.getByTestId('asana-err')).toHaveText('Tick at least one item, with a name.')
  await d.getByRole('checkbox', { name: 'Send “Intake notes.docx · Example Ridge Advisors”' }).check()
  await cname.fill('Catch-up with Pat · Example Ridge Advisors')
  await d.getByRole('button', { name: 'Send to Asana' }).click()
  await expect(d).toHaveCount(0)
  await expect(toasts(page)).toContainText('2 items sent to Internal.')

  const made = (await asanaState()).created
  expect(made.map((t) => [t.project, t.name, t.due, t.assignee])).toEqual([
    ['p2', 'Read the intake notes · Example Ridge Advisors', '2026-12-05', 'u2'],
    ['p2', 'Catch-up with Pat · Example Ridge Advisors', '', 'u2'],
  ])
  expect(made[1]!.notes).toContain('Open it: https://fathom.video/share/patTeamOnly0001')

  const all = await ws()
  const pat = all['pat.example@example.com']!
  const rec = { at: expect.any(String), by: TEAM.email, project: 'p2', project_name: 'Internal', url: 'https://app.asana.com/0/p2/list' }
  expect(pat.items[INTAKE]).toEqual({ star: true, desc: 'From the first call', folder: 'wf-deals01', asana: rec })
  expect(pat.items['c:9004']).toEqual({ asana: rec })
  expect(pat.items['a:lead_research']).toEqual({ notion: NOTION_REC })
  expect(pat.folders).toEqual([{ id: 'wf-deals01', name: 'Deals' }])
  expect(all['someone.else@example.com']).toEqual(SEEDED['someone.else@example.com'])

  await expect(page.getByTestId('ws-item').filter({ hasText: 'Catch-up with Pat' }).getByTestId('ws-sent')).toHaveText('In Asana · Internal')
  await expect(page.getByTestId('ws-pick-bar')).toHaveCount(0)
})

test('Workspace: a stop halfway keeps the ones that went, and Send the rest sends only the others', async ({ page }) => {
  await asanaState({ stopAfter: 1 })
  await openWs(page)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await page.getByRole('checkbox', { name: 'Pick Follow-up guide' }).check()
  await page.getByTestId('ws-pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  const d = dlg(page, 'Send to Asana')
  await d.getByRole('button', { name: 'Send to Asana' }).click()
  await expect(d.getByTestId('asana-err')).toHaveText('1 sent, then Asana stopped: Asana is busy right now. Send the rest picks up from there.')
  // the list's order: Follow-up guide first
  await expect(d.getByRole('checkbox', { name: 'Send “Follow-up guide · Example Ridge Advisors”' })).not.toBeChecked()
  await expect(d.getByRole('checkbox', { name: 'Send “Intake notes.docx · Example Ridge Advisors”' })).toBeChecked()
  let pat = (await ws())['pat.example@example.com']!
  expect(pat.items['a:discovery_call']).toMatchObject({ asana: { project: 'p1', project_name: 'Client onboarding' } })
  expect(pat.items[INTAKE]!.asana).toBeUndefined()
  await expect(page.getByTestId('ws-item').filter({ hasText: 'Follow-up guide' }).getByTestId('ws-sent')).toHaveText('In Asana · Client onboarding')
  await d.getByRole('button', { name: 'Send the rest' }).click()
  await expect(d).toHaveCount(0)
  await expect(toasts(page)).toContainText('2 items sent to Client onboarding.')
  expect((await asanaState()).created.map((t) => t.name)).toEqual(['Follow-up guide · Example Ridge Advisors', 'Intake notes.docx · Example Ridge Advisors'])
  pat = (await ws())['pat.example@example.com']!
  expect(pat.items[INTAKE]).toMatchObject({ star: true, asana: { project: 'p1', by: TEAM.email } })
})

test('Workspace: not connected shows the 3 steps, then it sends with this browser’s token', async ({ page }) => {
  const api = await asanaApi(page)
  await asanaState({ connected: false })
  await openWs(page)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await page.getByTestId('ws-pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  const d = dlg(page, 'Send to Asana')
  await expect(d.getByTestId('asana-steps')).toBeVisible()
  await d.getByRole('textbox', { name: 'Asana personal access token' }).fill(GOOD)
  await d.getByRole('button', { name: 'Connect' }).click()
  await d.getByRole('combobox', { name: 'Project' }).selectOption('p1')
  await d.getByRole('button', { name: 'Send to Asana' }).click()
  await expect(d).toHaveCount(0)
  await expect(toasts(page)).toContainText('1 item sent to Client launches.')
  expect(api.posts.map((x) => [x.body.name, x.body.projects])).toEqual([['Intake notes.docx · Example Ridge Advisors', ['p1']]])
  expect(String(api.posts[0]!.body.notes)).toContain('Open it: https://example.com/files/intake-notes.docx')
  expect((await ws())['pat.example@example.com']!.items[INTAKE]).toMatchObject({ asana: { project: 'p1', project_name: 'Client launches' } })
})

test('on a phone: the Tasks and workspace windows fit, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const robin = await pickRobin(page)
  await robin.getByTestId('pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page).getByRole('combobox', { name: 'Project' })).toHaveValue('p1')
  expect(await wide()).toBeLessThanOrEqual(1)
  let box = await dlg(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(391)
  for (const el of await dlg(page).locator('input, textarea, select').all()) {
    const b = await el.boundingBox()
    if (b) expect(b.x + b.width).toBeLessThanOrEqual(391)
  }
  await dlg(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('asana')).toBeVisible()
  expect(await wide()).toBeLessThanOrEqual(1)

  await openWs(page, true)
  await page.getByRole('checkbox', { name: 'Pick Intake notes.docx' }).check()
  await page.getByTestId('ws-pick-bar').getByRole('button', { name: 'Send to Asana' }).click()
  await expect(dlg(page, 'Send to Asana').getByRole('combobox', { name: 'Project' })).toHaveValue('p1')
  expect(await wide()).toBeLessThanOrEqual(1)
  box = await dlg(page, 'Send to Asana').boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(391)
})
