import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { TEAM, serveLogo, signIn, stubCalls, stubReset, stubRows, stubSeed } from './helpers'

// HubSpot contacts: the synced contacts with search, Run Catalyst (the New run form, prefilled from the contact),
// Follow (the company goes on the watchlist) and Open lead for a contact who is a lead. Made-up contacts.

test.use({ timezoneId: 'UTC' })

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ hubspot_contacts: CONTACTS() })
})

const FULL = '/webhook/870a1ffa-cbc6-4085-894a-6f3bc90a40f2'
const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const F = () => fixtures() as unknown as { hubspot_contacts: Record<string, unknown>[] }

const CONTACTS = () => [
  ...F().hubspot_contacts,
  {
    email: 'quinn@prospectlabs.example', first_name: 'Quinn', last_name: 'Prospect', company: 'Prospect Labs', job_title: 'COO',
    phone: '555-0199', lifecycle_stage: 'subscriber', website: 'prospectlabs.example', hs_id: '1002', synced_at: '2026-11-06T06:00:00Z',
  },
  { email: 'jane@doe.example', first_name: 'Jane Doe', last_name: 'Doe', company: 'Doe & Co', synced_at: '2026-11-04T06:00:00Z' },
  // the anonymizer's placeholder contact: an e1_leads row has its email, but it is no real lead
  { email: 'contact@deltaadvisory.com', first_name: 'Delta', last_name: 'Advisory', company: 'Delta Advisory', synced_at: '2026-11-03T06:00:00Z' },
  { email: 'nameless@example.com', synced_at: null },
]

const rows = (page: Page) => page.getByTestId('contact')
const row = (page: Page, name: string) => rows(page).filter({ hasText: name })
const toasts = (page: Page) => page.getByTestId('toasts')

async function posts(path: string) {
  return (await stubCalls()).filter((c) => c.method === 'POST' && c.path === path)
}

test('the contacts, newest sync first, with search; Open lead only on a contact who is a lead', async ({ page }) => {
  await signIn(page, '/hubspot')
  await expect(page.getByRole('heading', { level: 1, name: 'HubSpot contacts' })).toBeVisible()
  await expect(page.getByText('Catalyst · Clients and meetings', { exact: true })).toBeVisible()
  await expect(page.getByText('Synced from HubSpot into the shared knowledge base every 6 hours.')).toBeVisible()
  await expect(page.getByText('Still in the current dashboard')).toHaveCount(0)
  await expect(page.getByTestId('contacts-count')).toHaveText('5')
  await expect(page.getByText('last sync: 6 Nov · 06:00')).toBeVisible()

  await expect(rows(page).locator('b')).toHaveText(['Quinn Prospect', 'Pat Example', 'Jane Doe', 'Delta Advisory', 'nameless@example.com'])
  const pat = row(page, 'Pat Example')
  await expect(pat).toContainText('Pat Example · pat.example@example.com')
  await expect(pat).toContainText('Example Ridge Advisors · Managing Partner')
  await expect(pat).toContainText('lead')
  await expect(pat).toContainText('NEW')
  await expect(pat.getByRole('link', { name: 'Open lead →' })).toHaveAttribute('href', `/lead-pipeline/${PAT}`)
  await expect(row(page, 'Quinn Prospect').getByRole('link', { name: 'Open lead →' })).toHaveCount(0)
  await expect(row(page, 'Delta Advisory').getByRole('link', { name: 'Open lead →' })).toHaveCount(0)
  await expect(row(page, 'nameless@example.com')).not.toContainText(' · ')

  const search = page.getByLabel('Search contacts')
  await search.fill('prospect labs')
  await expect(rows(page).locator('b')).toHaveText(['Quinn Prospect'])
  await search.fill('COO') // the job title counts
  await expect(rows(page).locator('b')).toHaveText(['Quinn Prospect'])
  await search.fill('nobody here')
  await expect(rows(page)).toHaveCount(0)
  await expect(page.getByText('No contacts match that search.')).toBeVisible()
  await search.fill('')
  await expect(rows(page)).toHaveCount(5)

  await pat.getByRole('link', { name: 'Open lead →' }).click()
  await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${PAT}`))
  await expect(page.getByRole('heading', { level: 1, name: 'Pat Example' })).toBeVisible()
})

test('Run Catalyst opens New run prefilled from the contact, and starts the prospect brief', async ({ page }) => {
  await signIn(page, '/hubspot')
  await row(page, 'Quinn Prospect').getByRole('button', { name: '▶ Run Catalyst' }).click()
  const dlg = page.getByRole('dialog', { name: 'New Catalyst run' })
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Prefilled from HubSpot: fill any gaps, then start.')
  await expect(dlg.getByRole('radio', { name: /Prospect research/ })).toBeChecked()
  await expect(dlg.getByLabel('First name')).toHaveValue('Quinn')
  await expect(dlg.getByLabel('Last name')).toHaveValue('Prospect')
  await expect(dlg.getByLabel('Title')).toHaveValue('COO')
  await expect(dlg.getByLabel('Company', { exact: true })).toHaveValue('Prospect Labs')
  await expect(dlg.getByLabel('Company link')).toHaveValue('https://prospectlabs.example')
  await expect(dlg.getByLabel('Email')).toHaveValue('quinn@prospectlabs.example')
  await expect(dlg.getByLabel('Phone')).toHaveValue('555-0199')

  await dlg.getByRole('button', { name: 'Start run ▶' }).click()
  await expect(dlg.getByTestId('new-run-msg')).toHaveText('Started ✓: the document lands on the lead when it is done.')
  const sent = await posts(FULL)
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({
    firstName: 'Quinn', lastName: 'Prospect', prospectName: 'Quinn Prospect', companyName: 'Prospect Labs', email: 'quinn@prospectlabs.example',
    prospectTitle: 'COO', website: 'https://prospectlabs.example', phone: '555-0199', only: true, stage: 'research',
  })
  const lead = (await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === 'quinn@prospectlabs.example')
  expect(lead).toMatchObject({ prospect_name: 'Quinn Prospect', company_name: 'Prospect Labs', stage: 'research' })
})

test('Follow puts the company on the watchlist with the places to read it from, once', async ({ page }) => {
  await stubSeed({ competitors: [] })
  await signIn(page, '/hubspot')
  await row(page, 'Quinn Prospect').getByRole('button', { name: '◎ Follow' }).click()
  const dlg = page.getByRole('dialog', { name: 'Follow this company' })
  await expect(dlg.getByLabel('Company / advertiser name')).toHaveValue('Prospect Labs')
  await expect(dlg.getByLabel('Website')).toHaveValue('https://prospectlabs.example')
  await expect(dlg.getByLabel('Why are we tracking them?')).toHaveValue('Added from HubSpot contact quinn@prospectlabs.example')
  await expect(dlg.getByLabel('Priority')).toHaveValue('medium')

  const add = dlg.getByRole('button', { name: 'Add to watchlist' })
  await add.click()
  await expect(dlg.getByTestId('follow-msg')).toHaveText('Add at least one scrape target: Meta page, X handle, or LinkedIn.')
  await dlg.getByLabel('Meta page: paste the Ad Library link').fill('<PAGE_ID>')
  await add.click()
  await expect(dlg.getByTestId('follow-msg')).toHaveText('That is still a placeholder: paste the real Ad Library link, or leave it blank.')
  expect(await stubRows('competitors')).toHaveLength(0)

  await dlg.getByLabel('Meta page: paste the Ad Library link').fill('https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=123456789')
  await dlg.getByLabel('X / Twitter handle').fill('@prospectlabs')
  await dlg.getByLabel('LinkedIn').fill('https://www.linkedin.com/company/prospect-labs/')
  await dlg.getByLabel('Priority').selectOption('high')
  await add.click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText(
    'Prospect Labs is followed now. The Intel Tracker picks them up on its next run, and the Ad Strategist pulls their Meta ads right after it.',
  )
  const saved = await stubRows<Record<string, unknown>>('competitors')
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({
    name: 'Prospect Labs', website: 'https://prospectlabs.example', meta_page_id: '123456789', handle_x: 'prospectlabs',
    handle_linkedin: 'company/prospect-labs', category: 'ads_strategist', priority: 'high',
    notes: 'Added from HubSpot contact quinn@prospectlabs.example', added_by: TEAM.email,
  })

  // the same company again (whatever its case) is turned away
  await row(page, 'Quinn Prospect').getByRole('button', { name: '◎ Follow' }).click()
  await dlg.getByLabel('Company / advertiser name').fill('prospect labs')
  await dlg.getByLabel('LinkedIn').fill('company/other')
  await add.click()
  await expect(dlg.getByTestId('follow-msg')).toHaveText('prospect labs is already on the watchlist.')
  await dlg.getByRole('button', { name: 'Close' }).click()
  expect(await stubRows('competitors')).toHaveLength(1)

  // no Meta page: followed, and it says no ads will be pulled
  await row(page, 'Jane Doe').getByRole('button', { name: '◎ Follow' }).click()
  await expect(dlg.getByLabel('Company / advertiser name')).toHaveValue('Doe & Co')
  await dlg.getByLabel('X / Twitter handle').fill('doeandco')
  await add.click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText(
    'Doe & Co is followed now. The Intel Tracker picks them up on its next run. No Meta page ID was given, so no ads will be pulled for them.',
  )
  expect((await stubRows<Record<string, unknown>>('competitors')).map((c) => c.name)).toEqual(['Prospect Labs', 'Doe & Co'])
})

test('no contacts synced yet says how to start the sync', async ({ page }) => {
  await stubSeed({ hubspot_contacts: [] })
  await signIn(page, '/hubspot')
  await expect(page.getByText('No contacts synced yet. Activate the HubSpot Contact Sync workflow in n8n and execute it once.')).toBeVisible()
  await expect(page.getByTestId('contacts-count')).toHaveText('0')
  await expect(page.getByLabel('Search contacts')).toHaveCount(0)
})

test('on a phone the rows wrap and nothing scrolls sideways; signed out goes to sign-in first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/hubspot')
  await expect(rows(page)).toHaveCount(5)
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide).toBeLessThanOrEqual(0)

  await page.context().clearCookies()
  await page.goto('/hubspot')
  await expect(page).toHaveURL(/\/login\?next=%2Fhubspot/)
})
