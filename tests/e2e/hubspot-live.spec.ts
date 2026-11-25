import { type Page, expect, test } from '@playwright/test'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { serveLogo, signIn, stubCalls, stubHook, stubReset } from './helpers'

// A lead's HubSpot tab, read live (the current dashboard's v144): Dashboard · HubSpot Contact Proxy answers what HubSpot
// has right now, Refresh asks again, HubSpot not answering says why and keeps the synced copy, and a contact HubSpot does
// not have says so. The stand-in's Pat Example (tests/stub/fixtures.mjs, hubspotLive).

test.use({ timezoneId: 'UTC' })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const SAM = leadId({ prospect_name: 'Sam Synth', email: 'sam.synth@example.com' })
const HOOK = '/webhook/catalyst-hubspot-contact'
const live = (page: Page) => page.getByTestId('hubspot-live')
const asks = async () => (await stubCalls()).filter((c) => c.method === 'POST' && c.path === HOOK)

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('what HubSpot has right now, above the synced copy, and Refresh asks again', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=hubspot`)
  await expect(live(page)).toContainText('Live from HubSpot')
  await expect(live(page)).toContainText('read just now')
  const want: [string, string][] = [
    ['name', 'Pat Example'],
    ['email', 'pat.example@example.com'],
    ['company', 'Example Ridge Advisors'],
    ['title', 'Managing Partner'],
    ['phone', '555-0100'],
    ['mobile', '555-0199'],
    ['location', 'Springfield, OR, United States'],
    ['lifecycle', 'Sales qualified lead'],
    ['lead status', 'In progress'],
    ['source', 'Organic search'],
    ['notes', '3'],
    ['deals', '1'],
    ['last contacted', 'Nov 3'],
    ['next activity', 'Dec 2'],
    ['last email sent', 'Nov 3'],
    ['last reply', 'Nov 4'],
    ['in HubSpot since', 'Oct 1'],
    ['changed in HubSpot', 'Nov 5'],
  ]
  const year = new Date().getUTCFullYear()
  for (const [k, v] of want) {
    const shown = year === 2026 ? v : /^[A-Z][a-z]{2} \d+$/.test(v) ? v + ', 2026' : v
    await expect(live(page).locator('div', { has: page.locator('dt', { hasText: new RegExp('^' + k + '$') }) }).locator('dd')).toHaveText(shown)
  }
  await expect(live(page).getByRole('link', { name: 'example.com ↗' })).toHaveAttribute('href', 'https://example.com')
  // the synced copy stays below
  await expect(page.getByRole('region', { name: /HubSpot/ })).toContainText('synced 5 Nov · 06:00')
  const first = await asks()
  expect(first).toHaveLength(1)
  expect(first[0].body).toMatchObject({ email: 'pat.example@example.com' })

  await live(page).getByRole('button', { name: 'Refresh' }).click()
  await expect(live(page)).toContainText('read just now')
  await expect.poll(async () => (await asks()).length).toBe(2)
})

test('HubSpot not answering says why and keeps the synced copy; a contact HubSpot does not have says so', async ({ page }) => {
  await stubHook('catalyst-hubspot-contact', 200, { ok: false, code: 'hubspot_error', message: 'HubSpot refused the request.' })
  await signIn(page, `/lead-pipeline/${PAT}?tab=hubspot`)
  await expect(live(page)).toContainText('HubSpot refused the request. The details below are the last copy the sync made.')
  await expect(page.getByRole('region', { name: /HubSpot/ })).toContainText('Managing Partner')

  await stubHook('catalyst-hubspot-contact', 404, { message: 'not registered' })
  await live(page).getByRole('button', { name: 'Refresh' }).click()
  await expect(live(page)).toContainText(
    'The HubSpot Contact workflow in n8n is switched off. Turn on “Dashboard · HubSpot Contact Proxy” in n8n. The details below are the last copy the sync made.',
  )

  // Sam has no synced contact, and HubSpot has none either
  await stubReset()
  await page.goto(`/lead-pipeline/${SAM}?tab=hubspot`)
  await expect(live(page)).toContainText('HubSpot has no contact with sam.synth@example.com. Add them in HubSpot, or check the email on the lead.')
  await expect(page.getByText('No HubSpot contact synced for this email yet.')).toBeVisible()
})
