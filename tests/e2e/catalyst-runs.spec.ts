import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'

// Catalyst, acting: the question before a run, moving a lead (a drop on the board or the lead page's Stage picker),
// the stage runs through n8n (the stand-in records each request), the calls a run reads and files, "Writing …" until
// the document lands, and New run. Made-up leads from tests/stub/fixtures.mjs.

// 1440 wide: the board's six columns sit in one row, so a drag never has to scroll
test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

const FULL = '/webhook/870a1ffa-cbc6-4085-894a-6f3bc90a40f2'
const CUSTOM = '/webhook/e1-custom-run-erica'
const PREP = '/webhook/catalyst-meeting-prep'
const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/
const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const JORDAN = leadId({ prospect_name: 'Jordan Merge', email: 'jordan@example.com' })

const card = (page: Page, stage: string, name: string) => page.locator(`[data-s="${stage}"] [data-lead^="${name}-"]`)
const column = (page: Page, stage: string) => page.locator(`[role="group"][data-s="${stage}"]`)
const toasts = (page: Page) => page.getByTestId('toasts')

async function posts(path: string) {
  return (await stubCalls()).filter((c) => c.method === 'POST' && c.path === path)
}
async function runs() {
  const row = (await stubRows<{ key: string; value: Record<string, { s: string; t0: string; seen: number; by: string }> }>('ai_settings')).find(
    (r) => r.key === 'catalyst_runs',
  )
  return row?.value ?? {}
}
async function lead(email: string) {
  return (await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === email)
}
const F = () => fixtures() as unknown as { e1_leads: Record<string, unknown>[]; agent_outputs: Record<string, unknown>[]; ai_settings: Record<string, unknown>[] }

test('Run on a card asks first, then starts only the prospect brief, and the card says it is writing', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await card(page, 'research', 'jordan-merge').getByRole('button', { name: 'Run prospect brief' }).click()
  const dlg = page.getByRole('dialog', { name: 'Run the pre-meeting prospect brief for Jordan Merge?' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByText('Catalyst · Lead pipeline')).toBeVisible()
  await expect(dlg.getByText('Catalyst writes the pre-meeting prospect brief. Only that runs, and nothing goes to the client.')).toBeVisible()
  await expect(dlg.getByText('It works from the lead’s details and what is public about the firm.')).toBeVisible()
  await expect(dlg.getByTestId('reads').locator('li')).toHaveText([
    '– No template for this stage yet, so the usual sections. Add one on Templates.',
    '– No HubSpot contact with this lead’s email.',
    '✓ What is public about the firm, and your house rules',
  ])
  await expect(dlg.getByRole('textbox')).toHaveCount(0) // the prospect brief takes no notes
  await expect(dlg.getByRole('button', { name: 'Just move it' })).toHaveCount(0)
  expect(await posts(FULL)).toHaveLength(0) // nothing before an answer

  await dlg.getByRole('button', { name: 'Run it' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Started. Pre-meeting prospect brief shows up on the card when it is done.')
  const sent = await posts(FULL)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    firstName: 'Jordan', lastName: 'Merge', prospectName: 'Jordan Merge', companyName: 'Merge Works', firmName: 'Merge Works',
    email: 'jordan@example.com', emailAddress: 'jordan@example.com', firmType: 'advisory', hearAboutUs: 'Dashboard run', only: true, stage: 'research',
  })
  expect(sent[0].body).not.toHaveProperty('entry')
  expect(String(sent[0].body.auth)).toMatch(JWT)
  expect(await posts(CUSTOM)).toHaveLength(0)
  expect((await runs())['jordan@example.com']).toMatchObject({ s: 'research', seen: 0, by: TEAM.email })

  const jordan = card(page, 'research', 'jordan-merge')
  await expect(jordan.getByRole('status')).toHaveText('Writing the pre-meeting prospect brief')
  await expect(jordan).toHaveAttribute('draggable', 'false')
  await expect(jordan.getByRole('button')).toHaveCount(0)
  await expect(jordan).toHaveAttribute('aria-label', 'Jordan Merge, Prospect research, writing the pre-meeting prospect brief. Open the lead')

  // on its page: the brief's tab says it is being written, and the Stage picker waits for it
  await page.goto(`/lead-pipeline/${JORDAN}`)
  await expect(page.getByRole('status').filter({ hasText: 'Catalyst is writing' })).toHaveText(
    'Catalyst is writing the pre-meeting prospect brief. It shows here when it is done.',
  )
  await page.getByLabel('Move this lead to another stage').selectOption('assessment')
  await expect(toasts(page)).toContainText('Catalyst is still writing for Jordan Merge. It shows on the card when it is done.')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a drop on another column asks to move; Just move it saves the stage and starts nothing', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await card(page, 'consultation', 'robin-sample').dragTo(column(page, 'assessment'), { sourcePosition: { x: 14, y: 14 } })
  const dlg = page.getByRole('dialog', { name: 'Move Robin Sample to Assessment?' })
  await expect(dlg).toBeVisible()
  const chips = dlg.getByRole('list', { name: 'Meeting stages' }).locator('li')
  await expect(chips).toHaveText(['Prospect research', 'Kickoff call', 'Assessment', 'Proposal', 'Onboarding', 'Client review'])
  await expect(chips.nth(2)).toHaveAttribute('aria-current', 'step')
  await expect(chips.nth(1)).toHaveAttribute('title', 'Where the lead is now')
  await expect(dlg.getByText('In Assessment, Catalyst writes the assessment report. Only that runs, and nothing goes to the client.')).toBeVisible()
  await expect(dlg.getByTestId('reads').locator('li')).toHaveText([
    '– No template for this stage yet, so the usual sections. Add one on Templates.',
    /^✓ The call on Nov 4(, 2026)?: Discovery consultation with Robin \(transcript\)$/,
    /^✓ The call on Oct 20(, 2026)?: Intro call with Robin \(transcript\)$/,
    /^✓ The email on Nov 5(, 2026)? from robin\.sample@example\.com: Notes from our call$/,
    /^✓ The email on Nov 3(, 2026)? to robin\.sample@example\.com: Agenda$/,
    '✓ The prospect brief, the consultation guide and your house rules',
  ])
  // Robin has no consultation guide, so notes would be needed, but the calls and emails found count
  await expect(dlg.getByText('Optional: the call transcripts and emails above go with it. Add anything else from the meeting.')).toBeVisible()
  await expect(dlg.getByRole('button', { name: 'Move and run it' })).toBeVisible()

  await dlg.getByRole('button', { name: 'Just move it' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Moved to Assessment.')
  await expect(card(page, 'assessment', 'robin-sample')).toBeVisible()
  await expect(card(page, 'consultation', 'robin-sample')).toHaveCount(0)
  expect((await lead('robin.sample@example.com'))?.stage).toBe('assessment')
  expect(await posts(CUSTOM)).toHaveLength(0)
  expect(await runs()).toEqual({})
  // a column cannot take the card that is already in it: nothing asks
  await card(page, 'assessment', 'robin-sample').dragTo(column(page, 'assessment'), { sourcePosition: { x: 14, y: 14 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Move and run it: the stage moves, the run reads the calls and emails, files the calls it read and starts only that stage', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await card(page, 'consultation', 'robin-sample').dragTo(column(page, 'assessment'), { sourcePosition: { x: 14, y: 14 } })
  const dlg = page.getByRole('dialog', { name: 'Move Robin Sample to Assessment?' })
  await dlg.getByLabel('Transcript or notes from the last meeting').fill('  We met on Tuesday.  ')
  await dlg.getByRole('button', { name: 'Move and run it' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Started. Assessment report shows up on the card when it is done.')

  const sent = await posts(CUSTOM)
  expect(sent).toHaveLength(1)
  const b = sent[0].body as Record<string, string>
  expect(b).toMatchObject({
    entry: 'anonymizer', stage: 'assessment', only: true, from: 'board', extraDoc: '', email: 'robin.sample@example.com',
    researchDocId: '', interviewDocId: '', anonymizedDocId: '', firstName: 'Robin', lastName: 'Sample',
  })
  expect(b.transcript).toBe(
    'NOTES FROM THE TEAM\nWe met on Tuesday.\n\n' +
      'EMAILS WITH THE CLIENT (HubSpot, newest first)\n\n' +
      'Email on Nov 5, 2026 from robin.sample@example.com to qa.teammate@aiparagonconsulting.com: Notes from our call\nThanks for the call. The paperwork is the worst part.\n\n' +
      'Email on Nov 3, 2026 from qa.teammate@aiparagonconsulting.com to robin.sample@example.com: Agenda\nHere is the agenda for Tuesday.\n\n' +
      'WHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\n' +
      'Call on Nov 4, 2026: Discovery consultation with Robin\nRobin Sample: We spend hours on onboarding paperwork.\nQA Teammate: What would you stop doing first?\n\n' +
      'Call on Oct 20, 2026: Intro call with Robin (filed under Prospect research)\nRobin Sample: We heard about you from a friend.',
  )
  expect(String(b.auth)).toMatch(JWT)
  // Fathom and HubSpot were asked through n8n, as the teammate
  for (const c of [...(await posts('/webhook/fathom-proxy')), ...(await posts('/webhook/catalyst-emails'))]) expect(String(c.body.auth)).toMatch(JWT)
  expect((await posts('/webhook/fathom-proxy')).filter((c) => c.body.action === 'transcript').map((c) => c.body.id).sort()).toEqual(['9001', '9002'])

  expect((await lead('robin.sample@example.com'))?.stage).toBe('assessment')
  // the call it read that was not filed goes under the stage Robin was in, with that stage's meeting type
  const meta = await stubRows<Record<string, unknown>>('call_meta')
  expect(meta.find((m) => m.call_id === '9001')).toMatchObject({
    lead_email: 'robin.sample@example.com', lead_stage: 'consultation', meeting_type: 'discovery', updated_by: TEAM.email,
  })
  expect(meta.find((m) => m.call_id === '9002')).toMatchObject({ lead_stage: 'research', meeting_type: 'sales' })
  expect((await runs())['robin.sample@example.com']).toMatchObject({ s: 'assessment', seen: 0 })
  await expect(card(page, 'assessment', 'robin-sample').getByRole('status')).toHaveText('Writing the assessment report')
})

test('the proposal waits for an assessment: it says so, offers only Just move it', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await card(page, 'research', 'jordan-merge').dragTo(column(page, 'proposal'), { sourcePosition: { x: 14, y: 14 } })
  const dlg = page.getByRole('dialog', { name: 'Move Jordan Merge to Proposal?' })
  await expect(dlg.getByRole('alert')).toHaveText('The proposal works from the assessment report, and this lead has none yet. Run the assessment first.')
  await expect(dlg.getByRole('button', { name: /run it/i })).toHaveCount(0)
  await expect(dlg.getByRole('textbox')).toHaveCount(0)
  await expect(dlg.getByRole('button', { name: 'Just move it' })).toBeVisible()
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(dlg).toBeHidden()
  expect((await lead('jordan@example.com'))?.stage ?? null).toBeNull()
})

test('a stage with nothing to work from needs notes; the review brief goes to Meeting Prep with them', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await card(page, 'review', 'casey-review').getByRole('button', { name: 'Run review brief' }).click()
  const dlg = page.getByRole('dialog', { name: 'Run the client review brief for Casey Review?' })
  await expect(dlg.getByTestId('reads').locator('li')).toHaveText([
    '– No template for this stage yet, so the usual sections. Add one on Templates.',
    '– No recorded calls with this lead yet.',
    '– No emails with this lead logged in HubSpot.',
    '– No HubSpot contact with this lead’s email.',
    '✓ Every document so far and your house rules',
  ])
  await expect(
    dlg.getByText('Needed: this lead has no documents yet, so paste what Catalyst should work from, like the meeting transcript or your notes.'),
  ).toBeVisible()
  await dlg.getByRole('button', { name: 'Run it' }).click()
  await expect(dlg.getByTestId('question-msg')).toHaveText(
    'Paste the meeting transcript or your notes first. This lead has no documents to work from yet, and no recorded call with it.',
  )
  expect(await posts(PREP)).toHaveLength(0)
  await dlg.getByLabel('Transcript or notes from the last meeting').fill('We reviewed the quarter.')
  await dlg.getByRole('button', { name: 'Run it' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Started. Client review brief shows up on the card when it is done.')
  const sent = await posts(PREP)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    leadEmail: 'casey.review@example.com', email: 'casey.review@example.com', emails: ['casey.review@example.com'], prospectName: 'Casey Review',
    companyName: 'Review Lane LLC', stage: 'review', stageName: 'Client review', docName: 'Client review brief', transcript: 'We reviewed the quarter.', from: 'board',
  })
})

test('a run that cannot start after a move: the lead stays moved, the question says why and stays open', async ({ page }) => {
  await stubHook('e1-custom-run-erica', 500, { message: 'down' })
  await signIn(page, '/lead-pipeline')
  await card(page, 'consultation', 'robin-sample').dragTo(column(page, 'assessment'), { sourcePosition: { x: 14, y: 14 } })
  const dlg = page.getByRole('dialog', { name: 'Move Robin Sample to Assessment?' })
  await dlg.getByLabel('Transcript or notes from the last meeting').fill('Notes.')
  await dlg.getByRole('button', { name: 'Move and run it' }).click()
  await expect(dlg.getByTestId('question-msg')).toHaveText('Moved to Assessment, but it could not start: Webhook returned 500. Try again in a minute.')
  await expect(dlg).toBeVisible()
  expect((await lead('robin.sample@example.com'))?.stage).toBe('assessment')
  expect(await runs()).toEqual({})
  expect((await stubRows<Record<string, unknown>>('call_meta')).find((m) => m.call_id === '9001')).toBeUndefined()
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(card(page, 'assessment', 'robin-sample')).toBeVisible()
  await expect(card(page, 'assessment', 'robin-sample').getByRole('status')).toHaveCount(0)
})

test('on a lead’s page: the Stage picker moves it, and its onboarding plan runs with the CRM record and the emails', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}`)
  const picker = page.getByLabel('Move this lead to another stage')
  await expect(picker).toHaveValue('proposal')
  await picker.selectOption('onboarding')
  const dlg = page.getByRole('dialog', { name: 'Move Pat Example to Onboarding?' })
  await expect(dlg).toBeVisible()
  await expect(picker).toHaveValue('proposal') // nothing moves before an answer
  await dlg.getByRole('button', { name: 'Just move it' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Moved to Onboarding.')
  await expect(page.getByText('Stage: Onboarding · Onboarding plan not written yet')).toBeVisible()
  await expect(picker).toHaveValue('onboarding')
  expect((await lead('pat.example@example.com'))?.stage).toBe('onboarding')

  await page.goto(`/lead-pipeline/${PAT}`)
  await expect(page.getByRole('tab', { name: 'Onboarding plan' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Run onboarding plan' }).click()
  const run = page.getByRole('dialog', { name: 'Run the onboarding plan for Pat Example?' })
  await expect(run.getByTestId('reads').locator('li')).toHaveText([
    '– No template for this stage yet, so the usual sections. Add one on Templates.',
    '– No recorded calls with this lead yet.', // the one call with Pat was set aside
    /^✓ The email on Nov 4(, 2026)? from Pat Example: Follow-up 4$/,
    /^✓ The email on Nov 3(, 2026)? to Pat Example: Follow-up 3$/,
    /^✓ The email on Nov 2(, 2026)? from Pat Example: Follow-up 2$/,
    '✓ and 1 more email',
    '✓ The CRM record: Pat Example · Managing Partner · Example Ridge Advisors · lifecycle stage: lead · lead status: NEW · website: example.com',
    '✓ Every document so far and your house rules',
  ])
  await expect(run.getByText('Optional: the emails above go with it. Add anything else from the meeting.')).toBeVisible()
  await run.getByRole('button', { name: 'Run it' }).click()
  await expect(run).toBeHidden()
  const sent = await posts(PREP)
  expect(sent).toHaveLength(1)
  const t = String(sent[0].body.transcript)
  expect(sent[0].body).toMatchObject({ stage: 'onboarding', stageName: 'Onboarding', docName: 'Onboarding plan', leadEmail: 'pat.example@example.com' })
  expect(t.startsWith('THE CRM RECORD (HubSpot)\nPat Example · Managing Partner · Example Ridge Advisors')).toBe(true)
  expect(t).toContain('EMAILS WITH THE CLIENT (HubSpot, newest first)')
  expect(t).toContain('Email on Nov 1, 2026 from qa.teammate@aiparagonconsulting.com to pat.example@example.com: Follow-up 1')
  expect(t).not.toContain('WHAT WAS SAID IN THE MEETINGS')
  await expect(page.getByRole('status').filter({ hasText: 'Catalyst is writing' })).toHaveText('Catalyst is writing the onboarding plan. It shows here when it is done.')
})

test('a run shows until its document lands, or for 45 minutes; the board checks back on its own', async ({ page }) => {
  const now = Date.now()
  const f = F()
  const settings = (t0: number) => [...f.ai_settings, { key: 'catalyst_runs', value: { 'jordan@example.com': { s: 'research', t0: new Date(t0).toISOString(), seen: 0 } } }]
  await stubSeed({ ai_settings: settings(now - 46 * 60_000) })
  await signIn(page, '/lead-pipeline')
  await expect(card(page, 'research', 'jordan-merge').getByRole('button', { name: 'Run prospect brief' })).toBeVisible() // stale: not running

  await stubSeed({ ai_settings: settings(now - 5 * 60_000) })
  await page.clock.install()
  await page.reload()
  await expect(card(page, 'research', 'jordan-merge').getByRole('status')).toHaveText('Writing the pre-meeting prospect brief')
  // the brief lands; the board finds it on its next check, 30 seconds on
  await stubSeed({
    agent_outputs: [
      ...f.agent_outputs,
      { id: '10000000-0000-4000-8000-0000000000aa', run_id: 'jordan@example.com', agent: 'lead_research', title: 'Brief', created_at: new Date().toISOString(), content_md: '# Brief', data: {} },
    ],
  })
  await page.clock.fastForward(31_000)
  await expect(card(page, 'research', 'jordan-merge').getByRole('link', { name: 'Prospect brief ready' })).toBeVisible()
  await expect(card(page, 'research', 'jordan-merge').getByRole('status')).toHaveCount(0)
})

test('New run: the prospect brief from the lead’s details; a later stage needs material, and a Fathom call can be it', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await page.getByRole('button', { name: 'New run' }).click()
  const dlg = page.getByRole('dialog', { name: 'New Catalyst run' })
  await expect(dlg.getByRole('radio', { name: /Prospect research/ })).toBeChecked()
  await expect(dlg.getByRole('region', { name: 'Source material' })).toHaveCount(0)
  await dlg.getByRole('button', { name: 'Start run ▶' }).click()
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Email is required: it is the run ID across the pipeline.')
  await dlg.getByLabel('First name').fill('Nia')
  await dlg.getByLabel('Last name').fill('New')
  await dlg.getByLabel('Company', { exact: true }).fill('Fresh Fields')
  await dlg.getByLabel('Email').fill('nia.new@example.com')
  await dlg.getByLabel('Firm type').fill('RIA')
  await dlg.getByRole('button', { name: 'Start run ▶' }).click()
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Started ✓: the document lands on the lead when it is done.')
  await expect(dlg.getByRole('button', { name: 'Run started ✓' })).toBeDisabled()
  const sent = await posts(FULL)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    firstName: 'Nia', lastName: 'New', prospectName: 'Nia New', companyName: 'Fresh Fields', email: 'nia.new@example.com', firmType: 'RIA',
    hearAboutUs: 'Dashboard run', only: true, stage: 'research',
  })
  expect(await lead('nia.new@example.com')).toMatchObject({ prospect_name: 'Nia New', company_name: 'Fresh Fields', stage: 'research' })
  await dlg.getByRole('button', { name: 'Close' }).click()
  await expect(card(page, 'research', 'nia-new').getByRole('status')).toHaveText('Writing the pre-meeting prospect brief')

  // a later stage: material first, and a recorded call can be it
  await page.getByRole('button', { name: 'New run' }).click()
  await dlg.getByRole('radio', { name: /Discovery consultation/ }).check()
  await dlg.getByLabel('Email').fill('someone@example.com')
  await dlg.getByRole('button', { name: 'Start run ▶' }).click()
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Add a transcript or document: Catalyst works from it for this stage.')
  await dlg.getByLabel('Email').fill('')
  await dlg.getByRole('button', { name: 'Use a Fathom call' }).click()
  const pickerBox = dlg.getByTestId('call-picker')
  await expect(pickerBox.getByRole('button')).toHaveCount(4)
  await pickerBox.getByLabel('Search calls or people').fill('robin')
  await expect(pickerBox.getByRole('button')).toHaveCount(2)
  await pickerBox.getByRole('button', { name: /Discovery consultation with Robin/ }).click()
  await expect(dlg.getByLabel('Call transcript or notes')).toHaveValue('Robin Sample: We spend hours on onboarding paperwork.\nQA Teammate: What would you stop doing first?')
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Loaded “Discovery consultation with Robin” (2 lines).')
  await expect(dlg.getByLabel('Email')).toHaveValue('robin.sample@example.com')
  await expect(dlg.getByLabel('First name')).toHaveValue('Robin')
  await dlg.getByRole('button', { name: 'Start run ▶' }).click()
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Started ✓: the document lands on the lead when it is done.')
  const custom = await posts(CUSTOM)
  expect(custom).toHaveLength(1)
  expect(custom[0].body).toMatchObject({
    entry: 'interview_script', stage: 'consultation', only: true, email: 'robin.sample@example.com', extraDoc: '',
    transcript: 'Robin Sample: We spend hours on onboarding paperwork.\nQA Teammate: What would you stop doing first?',
  })
})

test('Esc and Cancel close the question and write nothing', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await card(page, 'consultation', 'robin-sample').dragTo(column(page, 'onboarding'), { sourcePosition: { x: 14, y: 14 } })
  const dlg = page.getByRole('dialog', { name: 'Move Robin Sample to Onboarding?' })
  await expect(dlg).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await card(page, 'consultation', 'robin-sample').getByRole('button', { name: 'Run consultation guide' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const writes = (await stubCalls()).filter((c) => (c.path.startsWith('/rest/v1/') && c.method !== 'GET') || (c.path.startsWith('/webhook/') && !['fathom-proxy', 'catalyst-emails'].some((x) => c.path.endsWith(x))))
  expect(writes).toEqual([])
})
