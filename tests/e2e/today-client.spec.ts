import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { TEAM, serveLogo, signIn, stubCalls, stubFathom, stubReset, stubRows, stubSeed } from './helpers'

// A new contact on a call (the current dashboard's v144): a recorded call from the last 14 days with someone from
// outside the team who matches no lead, lead's company, HubSpot contact or folder shows on Today's Catalyst card, and its
// question creates a client record, files the call, or sets it aside. Made-up people, dated from now.

test.use({ timezoneId: 'UTC' })

const NOW = Date.now()
const D = 864e5
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const FULL = '/webhook/870a1ffa-cbc6-4085-894a-6f3bc90a40f2'
const TEAMP = { name: TEAM.name, email: TEAM.email }
const g = (name: string, email: string) => ({ name, email, external: true })
const call = (id: number, title: string, age: number, guests: unknown[] = []) => ({
  id, title, start: ago(age), end: ago(age - 30 * 60e3), recorded_by: TEAMP, invitees: [TEAMP, ...guests],
})

const rows = (page: Page) => page.getByTestId('inbox-item')
const item = (page: Page, key: string) => page.locator(`[data-testid="inbox-item"][data-key="${key}"]`)
const toasts = (page: Page) => page.getByTestId('toasts')
const posts = async (path: string) => (await stubCalls()).filter((c) => c.method === 'POST' && c.path === path)
const setting = async (key: string) => (await stubRows<{ key: string; value: unknown }>('ai_settings')).find((r) => r.key === key)?.value
const lead = async (email: string) => (await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === email)
const metaOf = async (id: string) => (await stubRows<Record<string, unknown>>('call_meta')).find((r) => r.call_id === id)
function usDay(iso: string) {
  const d = new Date(iso)
  const other = d.getUTCFullYear() !== new Date().getUTCFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC', ...(other ? { year: 'numeric' as const } : {}) })
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({
    agent_outputs: [],
    creative_briefs: [],
    engagement_drafts: [],
    e1_leads: [{ email: 'robin@peak.example.net', prospect_name: 'Robin Peak', company_name: 'Peak Partners', fit_rating: 'Strong', updated_at: ago(3 * D) }],
    hubspot_contacts: [{ email: 'cara@harbor.example.org', first_name: 'Cara', last_name: 'Harbor', company: 'Harbor Wealth', first_seen: ago(40 * D) }],
    ai_settings: [...fixtures().ai_settings, { key: 'catalyst_inbox', value: { calls: { '9307': { by: 'someone@aiparagonconsulting.com', at: ago(D) } } } }],
    call_meta: [],
    call_outputs: [],
  })
  await stubFathom({
    connected: true,
    hint: '1234',
    items: [
      call(9301, 'Intro with Nora', D, [g('Nora New', 'nora@newco.example.org'), g('Ned Two', 'ned@newco.example.org')]),
      call(9302, 'Coffee with Cara', 2 * D, [g('Cara Harbor', 'cara@harbor.example.org')]),
      call(9303, 'Call with Gil', 3 * D, [g('Gil Free', 'gil@gmail.com')]),
      call(9304, 'Team sync', 3 * D),
      call(9305, 'Call with Ann', 4 * D, [g('Ann Peak', 'ann@peak.example.net')]),
      call(9306, 'Old call', 20 * D, [g('Old Contact', 'old@far.example.org')]),
      call(9307, 'Set aside call', 5 * D, [g('Aside Person', 'aside@side.example.org')]),
    ],
  })
})

test('someone new on a recent call shows on Today; a contact, a lead’s colleague, an old call or one set aside does not', async ({ page }) => {
  await signIn(page, '/today')
  await expect(rows(page)).toHaveCount(2)
  expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-key')))).toEqual(['client:9301', 'client:9303'])
  const nora = item(page, 'client:9301')
  await expect(nora).toContainText(`New contact on a call: Nora New, Example on ${usDay(ago(D))}`)
  await expect(nora).toContainText('Create a client record for them?')
  await expect(nora.getByRole('button')).toHaveText('Create client')
  // free mail names no company
  await expect(item(page, 'client:9303')).toContainText(`New contact on a call: Gil Free on ${usDay(ago(3 * D))}`)
})

test('Create client record: the lead in Prospect research from a call, the call filed in its folder, and the brief run if ticked', async ({ page }) => {
  await signIn(page, '/today')
  await item(page, 'client:9301').getByRole('button', { name: 'Create client' }).click()
  const dlg = page.getByRole('dialog', { name: 'Create a client record for Nora New?' })
  await expect(dlg.locator('p').first()).toHaveText('Catalyst · New contact on a call')
  await expect(dlg).toContainText(`${usDay(ago(D))} · 30 min · Intro with Nora`)
  await expect(dlg.getByTestId('client-line')).toHaveText(
    'Nora New is not a lead yet, and no client folder matches the people on this call. A client record puts them on the Lead pipeline in Prospect research and files this call in their folder.',
  )
  await expect(dlg.getByLabel('Name')).toHaveValue('Nora New')
  await expect(dlg.getByLabel('Client folder')).toHaveValue('Example')
  // another person on the call, and a company typed: the folder follows it until it is changed
  await dlg.getByLabel('Who is the client').selectOption({ label: 'Ned Two · ned@newco.example.org' })
  await expect(dlg.getByLabel('Email')).toHaveValue('ned@newco.example.org')
  await dlg.getByLabel('Company').fill('Newco Advisors')
  await expect(dlg.getByLabel('Client folder')).toHaveValue('Newco Advisors')
  await dlg.getByLabel('Write the pre-meeting prospect brief now').check()
  await dlg.getByRole('button', { name: 'Create client record' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(toasts(page)).toContainText('Created. The prospect brief shows on the Lead pipeline when it is done.')
  expect(await lead('ned@newco.example.org')).toMatchObject({ prospect_name: 'Ned Two', company_name: 'Newco Advisors', lead_source: 'Call', stage: 'research' })
  expect(await metaOf('9301')).toMatchObject({ folder: 'Newco Advisors', lead_email: 'ned@newco.example.org', lead_stage: 'research', updated_by: TEAM.email })
  expect(await setting('call_folders')).toEqual(['Newco Advisors'])
  const sent = await posts(FULL)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ email: 'ned@newco.example.org', prospectName: 'Ned Two', companyName: 'Newco Advisors', only: true, stage: 'research' })
  expect(((await setting('catalyst_runs')) as Record<string, unknown>)['ned@newco.example.org']).toMatchObject({ s: 'research', by: TEAM.email })
  await expect(item(page, 'client:9301')).toHaveCount(0)
})

test('Create client record without the brief, and what it checks first', async ({ page }) => {
  await signIn(page, '/today')
  await item(page, 'client:9303').getByRole('button', { name: 'Create client' }).click()
  const dlg = page.getByRole('dialog', { name: 'Create a client record for Gil Free?' })
  await expect(dlg.getByLabel('Company')).toHaveValue('')
  await expect(dlg.getByLabel('Client folder')).toHaveValue('Gil Free')
  await dlg.getByLabel('Email').fill('not an email')
  await dlg.getByRole('button', { name: 'Create client record' }).click()
  await expect(dlg.getByTestId('client-question-msg')).toHaveText('Add the client’s email address. It is how the dashboard knows their calls.')
  await dlg.getByLabel('Email').fill('gil@gmail.com')
  await dlg.getByLabel('Client folder').fill('G')
  await dlg.getByRole('button', { name: 'Create client record' }).click()
  await expect(dlg.getByTestId('client-question-msg')).toHaveText('Give the client folder a name, two letters or more, in letters, numbers and spaces.')
  await dlg.getByLabel('Client folder').fill('Gil Consulting')
  await dlg.getByRole('button', { name: 'Create client record' }).click()
  await expect(toasts(page)).toContainText('Created. Gil Free is on the Lead pipeline, and the call is filed under Gil Consulting.')
  expect(await lead('gil@gmail.com')).toMatchObject({ prospect_name: 'Gil Free', company_name: null, lead_source: 'Call', stage: 'research' })
  expect(await posts(FULL)).toHaveLength(0)
})

test('Just file the call sets its folder only; Not a client sets it aside for the team', async ({ page }) => {
  await signIn(page, '/today')
  await item(page, 'client:9303').getByRole('button', { name: 'Create client' }).click()
  let dlg = page.getByRole('dialog', { name: 'Create a client record for Gil Free?' })
  await dlg.getByLabel('Client folder').fill('Gil Consulting')
  await dlg.getByRole('button', { name: 'Just file the call' }).click()
  await expect(toasts(page)).toContainText('Filed under Gil Consulting.')
  expect(await metaOf('9303')).toMatchObject({ folder: 'Gil Consulting' })
  expect((await metaOf('9303'))?.lead_email).toBeUndefined()
  expect(await lead('gil@gmail.com')).toBeUndefined()
  await expect(item(page, 'client:9303')).toHaveCount(0)

  await item(page, 'client:9301').getByRole('button', { name: 'Create client' }).click()
  dlg = page.getByRole('dialog', { name: 'Create a client record for Nora New?' })
  await dlg.getByRole('button', { name: 'Not a client' }).click()
  await expect(toasts(page)).toContainText('Set aside. The call stays on Calls.')
  const inbox = (await setting('catalyst_inbox')) as { calls: Record<string, { by: string }> }
  expect(Object.keys(inbox.calls).sort()).toEqual(['9301', '9307'])
  expect(inbox.calls['9301'].by).toBe(TEAM.email)
  await expect(rows(page)).toHaveCount(0)
})
