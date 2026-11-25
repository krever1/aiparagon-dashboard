import { type Page, expect, test } from '@playwright/test'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { serveLogo, signIn, stubReset } from './helpers'

// Back in the top bar (v143): the pages visited in this browser tab, a lead's own page included, kept in
// sessionStorage. Hidden on the first page, "Back to <page>" on hover, the arrow only on a phone, and going back adds
// nothing to the list. Made-up leads from tests/stub/fixtures.mjs.

test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 900 } })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const back = (page: Page) => page.getByTestId('back')
const allTab = (page: Page) => page.getByRole('tablist', { name: 'Lead pipeline views' }).getByRole('tab', { name: /^All/ })
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const places = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('ap.next.back.v1') || '[]').map((p: { path: string }) => p.path))

/** A page in the sidebar: its product opened first when it is not open. */
async function go(page: Page, product: string, label: string) {
  const link = nav(page).getByRole('link', { name: label, exact: true })
  if (!(await link.isVisible())) await nav(page).locator(`button[data-product="${product}"]`).click()
  await link.click()
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('Back goes through the pages this tab visited, a lead’s page included, and adds nothing on the way', async ({ page }) => {
  await signIn(page, '/today')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // the first page: nothing to go back to
  await expect(back(page)).toHaveCount(0)

  await go(page, 'touchpoint', 'Approvals')
  await expect(page).toHaveURL(/\/approvals$/)
  await expect(back(page)).toHaveAttribute('title', 'Back to Today')
  await expect(back(page)).toHaveAccessibleName('Back to Today')
  await expect(back(page)).toHaveText('Back')

  await go(page, 'catalyst', 'Lead pipeline')
  await expect(back(page)).toHaveAttribute('title', 'Back to Approvals')
  await page.locator('[data-s="proposal"] [data-lead^="pat-example-"]').getByRole('link', { name: 'Proposal ready' }).click()
  await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${PAT}\\?tab=proposal$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pat Example')
  await expect(back(page)).toHaveAttribute('title', 'Back to Lead pipeline')

  // a lead's page is named by the lead
  await go(page, 'touchpoint', 'Tasks')
  await expect(page).toHaveURL(/\/tasks$/)
  await expect(back(page)).toHaveAttribute('title', 'Back to Pat Example')

  await back(page).click()
  await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${PAT}`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pat Example')
  await expect(back(page)).toHaveAttribute('title', 'Back to Lead pipeline')
  await back(page).click()
  await expect(page).toHaveURL(/\/lead-pipeline$/)
  await expect(back(page)).toHaveAttribute('title', 'Back to Approvals')
  await back(page).click()
  await expect(page).toHaveURL(/\/approvals$/)
  await expect(back(page)).toHaveAttribute('title', 'Back to Today')
  await back(page).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(back(page)).toHaveCount(0)
  expect(await places(page)).toEqual(['/today'])
})

test('Back opens a page as it was left (its tab), survives a reload, and starts again after signing out', async ({ page }) => {
  await signIn(page, '/approvals')
  await expect(back(page)).toHaveCount(0)
  await page.getByRole('tablist', { name: 'Filter' }).getByRole('tab').first().click()
  await go(page, 'catalyst', 'Lead pipeline')
  await allTab(page).click()
  await expect(page).toHaveURL(/\/lead-pipeline\?tab=all$/)
  await go(page, 'touchpoint', 'Tasks')
  await expect(back(page)).toHaveAttribute('title', 'Back to Lead pipeline')

  // a reload keeps the list
  await page.reload()
  await expect(back(page)).toHaveAttribute('title', 'Back to Lead pipeline')
  await back(page).click()
  await expect(page).toHaveURL(/\/lead-pipeline\?tab=all$/)
  await expect(allTab(page)).toHaveAttribute('aria-selected', 'true')
  expect(await places(page)).toEqual(['/approvals', '/lead-pipeline'])

  // signing out starts a new list for whoever signs in next
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await signIn(page, '/tasks')
  await expect(back(page)).toHaveCount(0)
  expect(await places(page)).toEqual(['/tasks'])
})

test('on a phone Back shows its arrow only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/today')
  await page.goto('/tasks')
  await expect(back(page)).toBeVisible()
  await expect(back(page)).toHaveAccessibleName('Back to Today')
  await expect(back(page).getByText('Back')).toBeHidden()
  const box = await back(page).boundingBox()
  expect(box!.width).toBeLessThan(40)
  // nothing runs off the side
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
