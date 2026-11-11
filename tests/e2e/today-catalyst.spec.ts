import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { TEAM, serveLogo, signIn, stubCalls, stubFathom, stubReset, stubRows, stubSeed } from './helpers'

// Today's Catalyst card: new clients from HubSpot and new transcripts, each with its question, counted in the hello
// line. Made-up contacts, leads and calls, dated from now (the card looks back 14 days).

test.use({ timezoneId: 'UTC' })

const NOW = Date.now()
const H = 36e5
const D = 864e5
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const FULL = '/webhook/870a1ffa-cbc6-4085-894a-6f3bc90a40f2'
const TEAMP = { name: 'QA Teammate', email: TEAM.email }

const rows = (page: Page) => page.getByTestId('inbox-item')
const item = (page: Page, key: string) => page.locator(`[data-testid="inbox-item"][data-key="${key}"]`)
const toasts = (page: Page) => page.getByTestId('toasts')
const posts = async (path: string) => (await stubCalls()).filter((c) => c.method === 'POST' && c.path === path)
const setting = async (key: string) => (await stubRows<{ key: string; value: Record<string, unknown> }>('ai_settings')).find((r) => r.key === key)?.value
const lead = async (email: string) => (await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === email)

/** "Nov 9", as the page says a day in the questions (with the year when it is not this year). */
function usDay(iso: string) {
  const d = new Date(iso)
  const other = d.getUTCFullYear() !== new Date().getUTCFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC', ...(other ? { year: 'numeric' as const } : {}) })
}

const contact = (email: string, first: string, last: string, seen: number | null, extra: Record<string, unknown> = {}) => ({
  email, first_name: first, last_name: last, first_seen: seen === null ? null : ago(seen), ...extra,
})
const call = (id: number, title: string, age: number, guest?: { name: string; email: string }) => ({
  id, title, start: ago(age), end: ago(age - 40 * 60e3), recorded_by: TEAMP, invitees: guest ? [TEAMP, { ...guest, external: true }] : [TEAMP],
})
const NIA = { name: 'Nia New', email: 'nia.new@example.com' }
const RIA = { name: 'Ria Review', email: 'ria.review@example.com' }

function seed() {
  return {
    agent_outputs: [],
    creative_briefs: [],
    engagement_drafts: [],
    e1_leads: [
      { email: NIA.email, prospect_name: NIA.name, company_name: 'New Example Partners', fit_rating: 'Moderate', updated_at: ago(3 * D) },
      { email: RIA.email, prospect_name: RIA.name, company_name: 'Review Example LLC', fit_rating: 'Strong', stage: 'review', updated_at: ago(2 * D) },
    ],
    hubspot_contacts: [
      contact('Tom.Becker@Example.com', 'Tom', 'Becker', 2 * D, { company: 'Halvern Foods', job_title: 'COO', website: 'https://halvern.example' }),
      contact('old.contact@example.com', 'Old', 'Contact', 40 * D),
      contact(NIA.email, 'Nia', 'New', D),
      contact('teammate2@aiparagonconsulting.com', 'Team', 'Mate', D),
      contact('aside@example.com', 'Set', 'Aside', 3 * D),
      contact('never.seen@example.com', 'Never', 'Seen', null),
    ],
    ai_settings: [
      ...fixtures().ai_settings,
      { key: 'catalyst_inbox', value: { crm: { 'aside@example.com': { by: 'someone@aiparagonconsulting.com', at: ago(D) } } } },
    ],
    call_meta: [{ call_id: '9103', lead_email: NIA.email, lead_stage: 'research' }],
    call_outputs: [],
  }
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(seed())
  await stubFathom({
    connected: true,
    hint: '1234',
    items: [
      call(9101, 'Discovery call with Nia', 2 * D + H, NIA),
      call(9102, 'Old call with Nia', 20 * D, NIA),
      call(9103, 'Filed call with Nia', D, NIA),
      call(9104, 'Team sync', D),
      call(9105, 'Review call with Ria', 3 * H, RIA),
    ],
  })
})

test('new clients and transcripts come first, newest first, counted in the hello line', async ({ page }) => {
  await signIn(page, '/today')
  // three here, and Nia and Ria wait on their next document (Approvals' Leads)
  await expect(page.getByTestId('today-need')).toHaveText('5 things need you.')
  const card = page.getByTestId('catalyst-inbox')
  await expect(card.getByRole('heading', { level: 2 })).toHaveText('Catalyst · Before your next meetings')
  await expect(rows(page)).toHaveCount(3)
  expect(await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-key')))).toEqual(['call:9105', 'crm:tom.becker@example.com', 'call:9101'])

  const ria = item(page, 'call:9105')
  await expect(ria).toContainText(`New transcript: your call with Ria Review on ${usDay(ago(3 * H))}`)
  await expect(ria).toContainText('In Client review. Run the client review brief again with it?')
  await expect(ria.getByRole('button')).toHaveText('Run it again')
  const tom = item(page, 'crm:tom.becker@example.com')
  await expect(tom).toContainText('New client from HubSpot: Tom Becker, Halvern Foods')
  await expect(tom).toContainText('Run the pre-meeting prospect brief?')
  await expect(tom.getByRole('button')).toHaveText('Run the brief')
  // the team's name for the consultation stage
  const nia = item(page, 'call:9101')
  await expect(nia).toContainText('In Prospect research. Run the kickoff call stage?')
  await expect(nia.getByRole('button')).toHaveText('Run kickoff call')

  // the card comes before Needs you
  const order = await page.locator('[data-testid="catalyst-inbox"], [data-testid="needs-you"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  expect(order).toEqual(['catalyst-inbox', 'needs-you'])
})

test('a new client: what the brief reads, and Not a client sets them aside for the team', async ({ page }) => {
  await signIn(page, '/today')
  await item(page, 'crm:tom.becker@example.com').getByRole('button', { name: 'Run the brief' }).click()
  const dlg = page.getByRole('dialog', { name: 'Run the pre-meeting prospect brief for Tom Becker?' })
  await expect(dlg.locator('p').first()).toHaveText('Catalyst · New client from HubSpot')
  await expect(dlg.getByTestId('crm-line')).toHaveText(
    `Tom Becker, COO, Halvern Foods is new in HubSpot since ${usDay(ago(2 * D))}. Catalyst adds them to the Lead pipeline in Prospect research and writes the pre-meeting prospect brief. Only that runs, and nothing goes to the client.`,
  )
  // the contact is found though HubSpot keeps its email in capitals
  await expect(dlg.getByTestId('reads')).toContainText('The CRM record: Tom Becker · COO · Halvern Foods · website: https://halvern.example')
  await dlg.getByRole('button', { name: 'Not a client' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(toasts(page)).toContainText('Set aside. Tom Becker stays in HubSpot contacts.')
  await expect(rows(page)).toHaveCount(2)
  await expect(page.getByTestId('today-need')).toHaveText('4 things need you.')
  const inbox = (await setting('catalyst_inbox')) as { crm: Record<string, { by: string }> }
  expect(Object.keys(inbox.crm).sort()).toEqual(['aside@example.com', 'tom.becker@example.com'])
  expect(inbox.crm['tom.becker@example.com'].by).toBe(TEAM.email)
  expect(await lead('tom.becker@example.com')).toBeUndefined()
})

test('a new client: Add without running puts them in Prospect research; nothing runs', async ({ page }) => {
  await signIn(page, '/today')
  await item(page, 'crm:tom.becker@example.com').getByRole('button', { name: 'Run the brief' }).click()
  const dlg = page.getByRole('dialog', { name: 'Run the pre-meeting prospect brief for Tom Becker?' })
  await dlg.getByRole('button', { name: 'Add without running' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(toasts(page)).toContainText('Added to Prospect research on the Lead pipeline.')
  expect(await lead('tom.becker@example.com')).toMatchObject({
    prospect_name: 'Tom Becker', prospect_title: 'COO', company_name: 'Halvern Foods', lead_source: 'HubSpot', stage: 'research',
  })
  expect(await posts(FULL)).toHaveLength(0)
  // a lead now, so no longer new
  await expect(item(page, 'crm:tom.becker@example.com')).toHaveCount(0)
})

test('a new client: Run the prospect brief adds them and runs only the brief, with their HubSpot details', async ({ page }) => {
  await signIn(page, '/today')
  await item(page, 'crm:tom.becker@example.com').getByRole('button', { name: 'Run the brief' }).click()
  const dlg = page.getByRole('dialog', { name: 'Run the pre-meeting prospect brief for Tom Becker?' })
  await dlg.getByRole('button', { name: 'Run the prospect brief' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(toasts(page)).toContainText('Started. The prospect brief shows on the Lead pipeline when it is done.')
  const sent = await posts(FULL)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    firstName: 'Tom', lastName: 'Becker', prospectName: 'Tom Becker', prospectTitle: 'COO', companyName: 'Halvern Foods', website: 'https://halvern.example',
    email: 'tom.becker@example.com', emailAddress: 'tom.becker@example.com', hearAboutUs: 'HubSpot', only: true, stage: 'research',
  })
  expect(await lead('tom.becker@example.com')).toMatchObject({ lead_source: 'HubSpot', stage: 'research' })
  expect(((await setting('catalyst_runs')) ?? {})['tom.becker@example.com']).toMatchObject({ s: 'research', by: TEAM.email })
})

test('a new transcript opens the call question; Just file it files it under the lead’s stage', async ({ page }) => {
  await signIn(page, '/today')
  await item(page, 'call:9101').getByRole('button', { name: 'Run kickoff call' }).click()
  const dlg = page.getByRole('dialog', { name: 'Run the kickoff call stage for Nia New?' })
  await expect(dlg.locator('p').first()).toHaveText('Catalyst · New transcript')
  await expect(dlg.getByTestId('call-card')).toContainText('Your call with Nia New')
  await dlg.getByRole('button', { name: 'Just file it' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(toasts(page)).toContainText('Filed under Prospect research.')
  const meta = (await stubRows<Record<string, unknown>>('call_meta')).find((r) => r.call_id === '9101')
  expect(meta).toMatchObject({ lead_email: NIA.email, lead_stage: 'research' })
  await expect(item(page, 'call:9101')).toHaveCount(0)
  await expect(rows(page)).toHaveCount(2)
})

test('four at a time, then Show more; with Fathom off only the new clients show', async ({ page }) => {
  await stubSeed({
    hubspot_contacts: [
      ...seed().hubspot_contacts,
      contact('ana@example.com', 'Ana', 'One', 4 * H),
      contact('ben@example.com', 'Ben', 'Two', 5 * H),
      contact('cy@example.com', 'Cy', 'Three', 6 * H),
    ],
  })
  await signIn(page, '/today')
  await expect(rows(page)).toHaveCount(4)
  await expect(page.getByTestId('today-need')).toHaveText('8 things need you.')
  await page.getByRole('button', { name: 'Show 2 more' }).click()
  await expect(rows(page)).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true')

  await stubFathom({ connected: false })
  await page.reload()
  await expect(rows(page)).toHaveCount(4)
  expect(await rows(page).evaluateAll((els) => els.every((e) => String(e.getAttribute('data-key')).startsWith('crm:')))).toBe(true)
  await expect(page.getByRole('button', { name: /Show/ })).toHaveCount(0)
})
