import { type Page, expect, test } from '@playwright/test'
import { fathomCalls, fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { TEAM, serveLogo, signIn, stubCalls, stubFathom, stubHook, stubReset, stubRows, stubSeed } from './helpers'

// Calls: the team's Fathom recordings read live through n8n (the stand-in answers as Dashboard · Fathom Proxy), what
// the team saves about each call, post-call actions, Slack and HubSpot, and a lead's Calls tab with the new-transcript
// question. Made-up calls and people from tests/stub/fixtures.mjs.

test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

const ROBIN = leadId({ prospect_name: 'Robin Sample', email: 'robin.sample@example.com' })
const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const CUSTOM = '/webhook/e1-custom-run-erica'

const rows = (page: Page) => page.getByTestId('call-rows').locator('button[data-id]')
const row = (page: Page, id: string) => page.getByTestId('call-rows').locator(`button[data-id="${id}"]`)
const detail = (page: Page) => page.getByTestId('call-detail')
const toasts = (page: Page) => page.getByTestId('toasts')
async function posts(path: string) {
  return (await stubCalls()).filter((c) => c.method === 'POST' && c.path === path)
}
async function meta(id: string) {
  return (await stubRows<Record<string, unknown>>('call_meta')).find((r) => r.call_id === id)
}

test('the calls, newest first: the strip, the tabs, the type buttons, search and folders', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-06T12:00:00Z') })
  await signIn(page, '/calls')
  await expect(page.getByRole('heading', { level: 1, name: 'Calls' })).toBeVisible()
  await expect(page.getByText('Catalyst · Clients and meetings', { exact: true })).toBeVisible()
  await expect(page.getByText('Your Fathom recordings, ready to watch or turn into a draft.')).toBeVisible()
  await expect(page.getByText('Still in the current dashboard')).toHaveCount(0)
  await expect(page.getByText('Read live from Fathom')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Key ending ab12' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Calls loaded/ })).toHaveText('4 Calls loaded')
  await expect(page.getByRole('button', { name: /With clients/ })).toHaveText('3 With clients')
  await expect(page.getByRole('button', { name: /This month/ })).toHaveText('1 This month')
  await expect(page.getByRole('button', { name: /Hours recorded/ })).toHaveText('2.1 Hours recorded')
  await expect(page.getByRole('tablist', { name: 'Calls' }).getByRole('tab')).toHaveText(['All 4', 'Clients 3', 'Internal 1'])
  await expect(page.getByTestId('calls-stamp')).toHaveText('Checked Fathom just now · new calls show up within a minute')

  await expect(rows(page)).toHaveCount(4)
  await expect(rows(page).locator('b')).toHaveText(['Discovery consultation with RobinClient', 'Catch-up with PatClient', 'Team sync', 'Intro call with RobinClient'])
  const robin = row(page, '9001')
  await expect(robin).toContainText('Wed, Nov 4 · 5:00 PM · 45 min')
  await expect(robin).toContainText('Robin Sample')
  await expect(robin.getByText('Discovery', { exact: true })).toHaveAttribute('title', 'Picked by the AI from the call. Pick a call type to set it.')
  await expect(robin.getByText('Actions ready')).toBeVisible()
  await expect(row(page, '9002').getByText('Sales call', { exact: true })).toHaveAttribute('title', 'Call type')

  const types = page.getByRole('toolbar', { name: 'Show calls by type' }).getByRole('button')
  await expect(types).toHaveText(['All 4', 'Client demos 0', 'Sales 2', 'Internal development 0', 'No type yet 2'])
  await types.filter({ hasText: 'Sales' }).click()
  await expect(page).toHaveURL(/type=sales/)
  await expect(rows(page)).toHaveCount(2)
  await types.filter({ hasText: 'Client demos' }).click()
  await expect(page.getByText('Nothing under Client demos here yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(rows(page)).toHaveCount(4)

  await page.getByRole('tab', { name: /Internal/ }).click()
  await expect(page).toHaveURL(/tab=int/)
  await expect(rows(page)).toHaveCount(1)
  await page.getByRole('tab', { name: /All/ }).click()

  await page.getByLabel('Search calls').fill('pat')
  await expect(rows(page)).toHaveCount(1)
  await page.getByLabel('Search calls').fill('nobody at all')
  await expect(page.getByText('No calls match that search.')).toBeVisible()
  await page.getByLabel('Search calls').fill('')

  const folders = page.getByLabel('All folders')
  await expect(folders.locator('option')).toHaveText(['All folders', 'AI Paragon (internal)', 'Example Ridge Advisors', 'Sample Peak Partners'])
  await folders.selectOption('Sample Peak Partners')
  await expect(rows(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(rows(page)).toHaveCount(4)
})

test('a call: its details, the player, the summary, the transcript, Fathom’s actions and the people', async ({ page }) => {
  await signIn(page, '/calls')
  const d = detail(page)
  await expect(d.getByRole('heading', { level: 2 })).toHaveText('Discovery consultation with RobinClient')
  await expect(d).toContainText('Wed, Nov 4 · 5:00 PM · 45 min · recorded by QA Teammate · 1 guest')
  await expect(d.getByLabel('Call type', { exact: true })).toHaveValue('')
  await expect(d.getByLabel('Call type', { exact: true }).locator('option:checked')).toHaveText('AI pick: Discovery')
  await expect(d.getByText('With Robin Sample, QA Teammate')).toBeVisible()
  await expect(d.getByText('Filed under Sample Peak Partners')).toBeVisible()
  await expect(d.getByTestId('call-lead')).toContainText('Catalyst lead: Robin Sample · Sample Peak Partners · done up to Prospect brief')
  await expect(d.getByRole('link', { name: 'Open lead' })).toHaveAttribute('href', `/lead-pipeline/${ROBIN}`)
  await expect(d.getByRole('link', { name: 'Open in Fathom ↗' })).toHaveAttribute('href', 'https://fathom.video/share/robinDiscovery01')

  await d.getByRole('button', { name: /Play the recording here/ }).click()
  await expect(d.locator('iframe[title="Fathom recording"]')).toHaveAttribute('src', 'https://fathom.video/embed/robinDiscovery01?autoplay=1')

  // Summary: Fathom's notes, headings without the colon, a moment in the call as a chip
  await expect(d.getByRole('tabpanel').getByRole('heading', { level: 4 })).toHaveText(['Key takeaways', 'Next steps'])
  await expect(d.getByRole('link', { name: '2:05' })).toHaveAttribute('href', 'https://fathom.video/share/robinDiscovery01?timestamp=125.5')

  await d.getByRole('tab', { name: 'Transcript' }).click()
  await expect(page).toHaveURL(/seg=transcript/)
  await expect(d.getByTestId('transcript-count')).toHaveText('2 lines')
  await d.getByLabel('Search the transcript').fill('paperwork')
  await expect(d.getByTestId('transcript-count')).toHaveText('1 of 2 lines')
  await expect(d.locator('mark')).toHaveText('paperwork')
  await d.getByLabel('Search the transcript').fill('zebra')
  await expect(d.getByText('Nothing in the transcript matches that.')).toBeVisible()

  await d.getByRole('tab', { name: 'Fathom actions (2)' }).click()
  await expect(d.getByRole('tabpanel')).toContainText('Send Robin the onboarding checklist')
  await expect(d.getByRole('tabpanel')).toContainText('QA Teammate · 12:05 · Jump to this moment ↗')
  await d.getByRole('tab', { name: 'People (1)' }).click()
  await expect(d.getByRole('tabpanel').locator('li')).toHaveText([
    /QA Teammate.*Recorded the call · qa\.teammate@aiparagonconsulting\.com/,
    /Robin Sample.*Guest from outside · robin\.sample@example\.com/,
  ])

  // a team-only recording, and one with no share link
  await row(page, '9004').click()
  await expect(page).toHaveURL(/call=9004/)
  await expect(detail(page).getByText('This call is team-only in Fathom')).toBeVisible()
  await expect(detail(page).getByText(/Anyone with the link can view/)).toBeVisible()
  await row(page, '9003').click()
  await expect(detail(page).getByText('This call has no share link yet, so it can only be watched in Fathom.')).toBeVisible()
  await expect(detail(page).getByText('Filed under AI Paragon (internal)')).toBeVisible()
  await expect(detail(page).getByTestId('call-lead')).toHaveCount(0)
})

test('a call type, a type of the team’s own, and the call’s details: saved for the whole team', async ({ page }) => {
  await signIn(page, '/calls?call=9003')
  const d = detail(page)
  await d.getByLabel('Call type', { exact: true }).selectOption('internal')
  await expect(toasts(page)).toContainText('Call type: Internal meeting.')
  await expect.poll(async () => (await meta('9003'))?.meeting_type).toBe('internal')
  expect(await meta('9003')).toMatchObject({ updated_by: TEAM.email })

  await d.getByLabel('Call type', { exact: true }).selectOption('__new')
  const nt = page.getByRole('dialog', { name: 'New call type' })
  await nt.getByLabel('Name').fill('x')
  await nt.getByRole('button', { name: 'Add the type' }).click()
  await expect(nt.getByTestId('type-msg')).toHaveText('Give it a name, two letters or more.')
  await nt.getByLabel('Name').fill('sales call')
  await nt.getByRole('button', { name: 'Add the type' }).click()
  await expect(nt.getByTestId('type-msg')).toHaveText('That type is already in the list.')
  await nt.getByLabel('Name').fill('Podcast')
  await nt.getByRole('button', { name: 'Add the type' }).click()
  await expect(nt).toBeHidden()
  await expect(toasts(page)).toContainText('Call type: Podcast.')
  await expect.poll(async () => (await meta('9003'))?.meeting_type).toBe('Podcast')
  expect((await stubRows<{ key: string; value: unknown }>('ai_settings')).find((r) => r.key === 'call_types')?.value).toEqual(['Partner call', 'Podcast'])
  await expect(page.getByRole('toolbar', { name: 'Show calls by type' }).getByRole('button', { name: /Podcast/ })).toHaveText('Podcast 1')

  await d.getByRole('button', { name: /Edit details|Add details/ }).click()
  const ed = page.getByRole('dialog', { name: 'Call details' })
  await expect(ed.getByLabel('Call type')).toHaveValue('Podcast')
  await ed.getByLabel('Title').fill('Weekly team sync')
  await ed.getByLabel('Client folder').fill('Ops')
  await ed.getByRole('button', { name: '+ Add a person' }).click()
  const person = ed.getByTestId('person').last()
  await person.getByLabel('Name').fill('Ann Other')
  await person.getByLabel('Email').fill('not-an-email')
  await ed.getByRole('button', { name: 'Save details' }).click()
  await expect(ed.getByTestId('details-msg')).toHaveText('“not-an-email” does not look like an email address.')
  await person.getByLabel('Email').fill('Ann@Other-Firm.com')
  await ed.getByLabel('Tags').fill('ops, Weekly Review')
  await ed.getByLabel('Description').fill('The weekly internal sync')
  await ed.getByRole('button', { name: 'Save details' }).click()
  await expect(ed).toBeHidden()
  await expect(toasts(page)).toContainText('Call details saved.')
  expect(await meta('9003')).toMatchObject({
    title: 'Weekly team sync', folder: 'Ops', client: null, meeting_type: 'Podcast', tags: ['ops', 'weekly-review'],
    description: 'The weekly internal sync', guests: [{ name: 'Ann Other', email: 'ann@other-firm.com', external: true }],
  })
  await expect(row(page, '9003').locator('b')).toHaveText('Weekly team syncClient')
  await expect(detail(page).getByText('Filed under Ops')).toBeVisible()
  await expect(detail(page).getByText('The weekly internal sync')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Clients/ })).toHaveText('Clients 4')
})

test('post-call actions: the written set, ticks, Slack, Auto, and a new set written and found', async ({ page }) => {
  await signIn(page, '/calls?call=9001&seg=post')
  const pc = page.getByTestId('post-call')
  await expect(detail(page).getByRole('tab', { name: 'Post-call ✓' })).toHaveAttribute('aria-selected', 'true')
  await expect(pc).toContainText('A summary, next steps, the discovery recap and a follow-up email, written from this call. They stay here, and can go to Slack or HubSpot.')
  await expect(pc.getByText(/Written .* automatically/)).toBeVisible()
  await expect(pc.getByRole('region', { name: 'Summary' }).locator('li')).toHaveText(['Onboarding paperwork takes most of their week', 'They want one workflow automated first'])
  const steps = pc.getByRole('region', { name: 'Next steps' })
  await expect(steps).toContainText('1 of 2 open')
  await expect(steps).toContainText('QA Teammate · due Nov 12, 2026 · They asked for it')
  await steps.getByRole('checkbox').first().check()
  await expect(steps).toContainText('0 of 2 open')
  await expect
    .poll(async () => ((await stubRows<{ id: string; tasks: { id: string; done: boolean }[] }>('call_outputs'))[0].tasks.find((t) => t.id === 't1') ?? {}).done)
    .toBe(true)
  await expect(pc.getByRole('region', { name: 'Discovery recap: Sample Peak Partners' })).toContainText('Paperwork is the bottleneck')
  const mail = pc.getByRole('region', { name: 'Follow-up email' })
  await expect(mail).toContainText('Subject: Thanks for the call, Robin')
  await expect(mail.getByRole('link', { name: 'Open in email' })).toHaveAttribute('href', /^mailto:robin\.sample%40example\.com\?subject=Thanks%20for%20the%20call%2C%20Robin/)
  await expect(pc.getByRole('region', { name: 'Next: the Assessment' })).toBeVisible()

  await pc.getByRole('button', { name: 'Share to Slack' }).click()
  const sl = page.getByRole('dialog', { name: 'Share to Slack' })
  await expect(sl.getByLabel('Channel')).toHaveValue('C1')
  await expect(sl.getByLabel('Channel').locator('option')).toHaveText(['#new-leads', '#random (invite the n8n app first)'])
  await expect(sl.getByLabel('Message')).toHaveValue(/^\*Discovery consultation with Robin\* · Nov 4, 2026 · Discovery\n\n\*Summary\*\n• Onboarding paperwork/)
  await sl.getByRole('button', { name: 'Post to Slack' }).click()
  await expect(sl).toBeHidden()
  await expect(toasts(page)).toContainText('Posted to Slack.')
  const slack = (await posts('/webhook/slack-proxy')).find((c) => c.body.action === 'post')
  expect(slack?.body).toMatchObject({ channel: 'C1' })
  await expect(pc.getByText('Shared to Slack just now.')).toBeVisible()

  await pc.getByLabel('Auto for new calls').uncheck()
  await expect(toasts(page)).toContainText('Saved. The next run follows it.')
  expect((await stubRows<{ key: string; value: unknown }>('ai_settings')).find((r) => r.key === 'call_auto_actions')?.value).toBe(false)

  // a call with none yet: written on request, and found when the workflow saves them
  await row(page, '9003').click()
  await detail(page).getByRole('tab', { name: 'Post-call' }).click()
  await expect(page.getByTestId('post-call')).toContainText('No post-call actions for this call yet')
  await page.getByLabel('Call type for the post-call actions').selectOption('internal')
  await page.getByLabel('Anything the AI should know').fill('Weekly sync')
  await page.getByRole('button', { name: 'Write post-call actions' }).click()
  await expect(page.getByTestId('post-call')).toContainText('Writing the post-call actions…')
  await expect(detail(page).getByRole('tab', { name: 'Post-call …' })).toBeVisible()
  const sent = await posts('/webhook/call-actions')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ meeting_type: 'internal', notes: 'Weekly sync', call: { id: '9003', title: 'Team sync' } })
  expect(await meta('9003')).toMatchObject({ meeting_type: 'internal' })
  const f = fixtures() as unknown as { call_outputs: Record<string, unknown>[] }
  await stubSeed({
    call_outputs: [
      ...f.call_outputs,
      {
        id: '40000000-0000-4000-8000-000000000002', call_id: '9003', meeting_type: 'internal', status: 'done', source: 'manual', created_by: TEAM.email,
        created_at: new Date().toISOString(), summary: ['The team agreed the plan'], tasks: [], deliverable: { title: 'Meeting notes', markdown: '- Plan agreed' },
      },
    ],
  })
  await expect(toasts(page)).toContainText('Post-call actions are ready for “Team sync”.', { timeout: 15_000 })
  await expect(page.getByTestId('post-call')).toContainText('The call had no clear next steps.')
})

test('Sync to HubSpot logs the call on the client’s contacts; a call with no client email asks for one', async ({ page }) => {
  await signIn(page, '/calls')
  await detail(page).getByRole('button', { name: 'Sync to HubSpot' }).click()
  await expect(toasts(page)).toContainText('Logged in HubSpot on Robin Sample.')
  const sent = await posts('/webhook/call-to-crm')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ call_id: '9001', title: 'Discovery consultation with Robin', emails: ['robin.sample@example.com'] })
  const body = String(sent[0].body.body)
  expect(body).toContain('Call type: Discovery')
  expect(body).toContain('Summary:\n- Onboarding paperwork takes most of their week')
  expect(body).toContain('Next steps:\n- [ ] Send the onboarding checklist (QA Teammate, due 2026-11-12)')
  expect(body).toContain('Recording: https://fathom.video/share/robinDiscovery01')
  expect(body.endsWith('Logged from the AI Paragon dashboard.')).toBe(true)
  expect(await meta('9001')).toMatchObject({ crm_result: { ok: true, engagement_id: 'E-1' } })
  await expect(detail(page).getByRole('button', { name: 'Sync to HubSpot again' })).toBeVisible()
  await expect(detail(page).getByText(/Logged in HubSpot .* on Robin Sample/)).toBeVisible()

  await row(page, '9003').click()
  await detail(page).getByRole('button', { name: 'Sync to HubSpot' }).click()
  await expect(toasts(page)).toContainText('Add the client’s email under the call’s guests first.')
  await expect(page.getByRole('dialog', { name: 'Call details' })).toBeVisible()
  expect(await posts('/webhook/call-to-crm')).toHaveLength(1)
})

test('Run the assessment from this call opens New run, filled in from the call', async ({ page }) => {
  await signIn(page, '/calls?seg=post')
  await page.getByRole('button', { name: 'Run the assessment from this call' }).click()
  const dlg = page.getByRole('dialog', { name: 'New Catalyst run' })
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Filled in from the call. Check the details, then start.')
  await expect(dlg.getByRole('radio', { name: /Assessment/ })).toBeChecked()
  await expect(dlg.getByLabel('First name')).toHaveValue('Robin')
  await expect(dlg.getByLabel('Last name')).toHaveValue('Sample')
  await expect(dlg.getByLabel('Email')).toHaveValue('robin.sample@example.com')
  await expect(dlg.getByLabel('Call transcript or notes')).toHaveValue('Robin Sample: We spend hours on onboarding paperwork.\nQA Teammate: What would you stop doing first?')
  await dlg.getByRole('button', { name: 'Start run ▶' }).click()
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Started ✓: the document lands on the lead when it is done.')
  const sent = await posts(CUSTOM)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ entry: 'anonymizer', stage: 'assessment', only: true, email: 'robin.sample@example.com' })
})

test('older calls load on request, and a new call shows up on the next check', async ({ page }) => {
  await page.clock.install()
  await signIn(page, '/calls')
  await page.getByRole('button', { name: 'Load older calls' }).click()
  await expect(row(page, '8001')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load older calls' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Calls loaded/ })).toHaveText('5 Calls loaded')
  await row(page, '8001').click()
  await expect(detail(page).getByText('Filed under Northwind Advisors')).toBeVisible()

  const calls = fathomCalls()
  await stubHook('fathom-proxy', 200, {
    ok: true, connected: true, hint: 'ab12', next_cursor: null,
    items: [{ id: 9100, title: 'New prospect call', start: new Date().toISOString(), end: new Date().toISOString(), invitees: [] }, ...calls],
  })
  await page.clock.fastForward(61_000)
  await expect(toasts(page)).toContainText('New call from Fathom: New prospect call')
  await expect(row(page, '9100')).toBeVisible()
})

test('Fathom not connected: the setup, a key that fails, a key that works, and disconnecting', async ({ page }) => {
  await stubFathom({ connected: false })
  await signIn(page, '/calls')
  await expect(page.getByText('Connect Fathom once for the whole team')).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Calls' }).getByRole('tab')).toHaveText(['Set up'])
  await expect(page.getByRole('heading', { name: 'Connect Fathom' })).toBeVisible()
  const key = page.getByLabel('Fathom API key')
  await key.fill('short')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Paste' })).toHaveText('Paste the whole API key from Fathom.')
  await key.fill('bad-key-123456789')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Fathom' })).toHaveText('Fathom did not accept that key.')
  await key.fill('good-key-123456789')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(toasts(page)).toContainText('Fathom connected')
  await expect(page.getByRole('button', { name: 'Key ending 6789' })).toBeVisible()
  await expect(rows(page)).toHaveCount(4)

  await page.getByRole('button', { name: 'Key ending 6789' }).click()
  const dlg = page.getByRole('dialog', { name: 'Fathom' })
  await expect(dlg).toContainText('Connected. Using the key ending 6789, added by qa.teammate')
  page.once('dialog', (d) => d.accept())
  await dlg.getByRole('button', { name: 'Disconnect' }).click()
  await expect(toasts(page)).toContainText('Fathom disconnected')
  await expect(page.getByRole('heading', { name: 'Connect Fathom' })).toBeVisible()
})

test('Fathom switched off in n8n: the page says so and offers Retry', async ({ page }) => {
  await stubHook('fathom-proxy', 404, { code: 404, message: 'not registered' })
  await signIn(page, '/calls')
  await expect(page.getByText('Fathom could not be reached')).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Calls' }).getByRole('tab')).toHaveText(['Connection'])
  await expect(page.getByRole('heading', { name: 'Try again, or check the key' })).toBeVisible()
  await expect(page.getByText('The Fathom workflow in n8n is switched off. Turn on “Dashboard · Fathom Proxy” in n8n.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('a lead’s Calls tab: each call and where it is filed; File it, set aside, or move and run', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${ROBIN}?tab=calls`)
  await expect(page.getByRole('tab', { name: /Calls/ })).toHaveText('Calls 2')
  const list = page.getByTestId('lead-calls').locator('li')
  await expect(list).toHaveCount(2)
  await expect(list.nth(0)).toContainText('Discovery consultation with Robin')
  await expect(list.nth(0)).toContainText('Nov 4 · 45 min')
  await expect(list.nth(0)).toContainText('Not filed yet')
  await expect(list.nth(0).getByRole('link', { name: 'Open on Calls' })).toHaveAttribute('href', '/calls?call=9001&seg=post')
  await expect(list.nth(1)).toContainText('Filed under Prospect research')
  await expect(list.nth(1).getByRole('button', { name: 'File it' })).toHaveCount(0)

  await list.nth(0).getByRole('button', { name: 'File it' }).click()
  const q = page.getByRole('dialog', { name: 'Run the assessment stage for Robin Sample?' })
  await expect(q.getByText('Catalyst · New transcript')).toBeVisible()
  await expect(q.getByTestId('call-card')).toContainText('Your call with Robin Sample')
  await expect(q.getByTestId('call-card')).toContainText('Nov 4 · 45 min · Discovery consultation with Robin')
  await expect(q.getByTestId('call-card')).toContainText('Onboarding paperwork takes most of their week')
  await expect(q.getByText('From the post-call summary')).toBeVisible()
  await expect(
    q.getByText(
      'Its transcript is filed under Kickoff call, where Robin Sample is now. In Assessment, Catalyst writes the assessment report from everything so far and this call. Only that runs, and nothing goes to the client.',
    ),
  ).toBeVisible()
  await q.getByRole('button', { name: 'Just file it' }).click()
  await expect(q).toBeHidden()
  await expect(toasts(page)).toContainText('Filed under Kickoff call.')
  expect(await meta('9001')).toMatchObject({ lead_email: 'robin.sample@example.com', lead_stage: 'consultation', meeting_type: 'discovery' })
  await expect(list.nth(0)).toContainText('Filed under Kickoff call')

  // a call set aside stays listed on the lead, with no File it
  await page.goto(`/lead-pipeline/${PAT}?tab=calls`)
  const pat = page.getByTestId('lead-calls').locator('li')
  await expect(pat).toHaveCount(1)
  await expect(pat.first()).toContainText('Set aside')
  await expect(pat.first().getByRole('button', { name: 'File it' })).toHaveCount(0)
})

test('the new-transcript question: Move and run it files the call, moves the lead and runs the next stage with it', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${ROBIN}?tab=calls`)
  await page.getByTestId('lead-calls').locator('li').first().getByRole('button', { name: 'File it' }).click()
  const q = page.getByRole('dialog', { name: 'Run the assessment stage for Robin Sample?' })
  await q.getByRole('textbox').fill('They also want a pilot.')
  await q.getByRole('button', { name: 'Move and run it' }).click()
  await expect(q).toBeHidden()
  await expect(toasts(page)).toContainText('Started. Assessment report shows on the Lead pipeline when it is done.')
  const sent = await posts(CUSTOM)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ entry: 'anonymizer', stage: 'assessment', only: true })
  expect(String(sent[0].body.transcript)).toContain('They also want a pilot.')
  expect(String(sent[0].body.transcript)).toContain('We spend hours on onboarding paperwork.')
  expect(await meta('9001')).toMatchObject({ lead_stage: 'consultation' })
  const lead = (await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === 'robin.sample@example.com')
  expect(lead).toMatchObject({ stage: 'assessment' })

  // Not about this client: set aside
  await stubReset()
  await page.goto(`/lead-pipeline/${ROBIN}?tab=calls`)
  await page.getByTestId('lead-calls').locator('li').first().getByRole('button', { name: 'File it' }).click()
  await page.getByRole('button', { name: 'Not about this client' }).click()
  await expect(toasts(page)).toContainText('Set aside. The call stays on Calls.')
  expect(await meta('9001')).toMatchObject({ lead_stage: 'none' })
})

test('on a phone the list and the call stack, and nothing scrolls sideways; signed out goes to sign-in first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/calls')
  await expect(rows(page)).toHaveCount(4)
  await expect(detail(page)).toBeVisible()
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide).toBeLessThanOrEqual(0)
  await page.context().clearCookies()
  await page.goto('/calls')
  await expect(page).toHaveURL(/\/login\?next=%2Fcalls/)
})
