import { expect, test } from '@playwright/test'
import { GROUPS, HEADINGS, PAGES, PORTED, PRODUCTS, SETTINGS } from '../../src/lib/nav'
import { LEGACY, TEAM, serveLogo, signIn, stubReset } from './helpers'

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('every page has its address, heading and tab title; a page not moved yet links to it in the current dashboard', async ({ page }) => {
  await signIn(page, '/today')
  expect(PAGES).toHaveLength(25)
  for (const p of PAGES) {
    await page.goto('/' + p.slug)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS[p.slug] ?? p.title)
    await expect(page).toHaveTitle(p.title + ' · AI Paragon')
    const product = GROUPS.find((g) => g.key === p.product)!
    await expect(page.getByText(product.name + ' · ' + product.sub, { exact: true })).toBeVisible()
    const open = page.getByRole('link', { name: 'Open ' + p.label + ' in the current dashboard' })
    if (PORTED.has(p.slug)) await expect(open).toHaveCount(0)
    else await expect(open).toHaveAttribute('href', LEGACY + '/' + p.legacy)
  }
})

test('the sidebar: the five products and Settings, the current one open, one open at a time', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const g of [...PRODUCTS, SETTINGS]) await expect(nav.locator(`button[data-product="${g.key}"]`)).toBeVisible()
  await expect(nav.locator('button[data-product="catalyst"]')).toHaveAttribute('aria-expanded', 'true')
  await expect(nav.locator('button[data-product="touchpoint"]')).toHaveAttribute('aria-expanded', 'false')
  await expect(nav.getByRole('link', { name: 'Lead pipeline' })).toHaveAttribute('aria-current', 'page')
  for (const label of ['Overview', 'Lead pipeline', 'HubSpot contacts', 'Calls']) await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()

  await nav.locator('button[data-product="pipeline"]').click()
  await expect(nav.locator('button[data-product="pipeline"]')).toHaveAttribute('aria-expanded', 'true')
  await expect(nav.locator('button[data-product="catalyst"]')).toHaveAttribute('aria-expanded', 'false')
  await nav.getByRole('link', { name: 'Ad Testing' }).click()
  await expect(page).toHaveURL(/\/ad-testing$/)
  await expect(nav.getByRole('link', { name: 'Ad Testing' })).toHaveAttribute('aria-current', 'page')

  // the top bar says where you are
  const crumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(crumb).toContainText('Pipeline')
  await expect(crumb).toContainText('Ad Testing')

  // going to a page in another product opens that product
  await page.goto('/files')
  await expect(nav.locator('button[data-product="atlas"]')).toHaveAttribute('aria-expanded', 'true')
})

test('the user card shows who is signed in and opens Your account', async ({ page }) => {
  await signIn(page, '/today')
  const card = page.getByTestId('user-card')
  await expect(card).toContainText(TEAM.name)
  await expect(card).toContainText(TEAM.email)
  await card.getByRole('link', { name: /QA Teammate/ }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account')
})

test('product names, home and addresses from the current dashboard forward to the right page', async ({ page }) => {
  await signIn(page, '/today')
  const cases: [string, string][] = [
    ['/', '/today'], ['/home', '/today'], ['/touchpoint', '/today'], ['/catalyst', '/engine-1'], ['/canvas', '/deliverables'],
    ['/pipeline', '/engine-3'], ['/atlas', '/knowledge-base'], ['/settings', '/integrations'],
    ['/dashboard', '/today'], ['/dashboard/lead-pipeline', '/lead-pipeline'], ['/dashboard/catalyst', '/engine-1'], ['/dashboard/ad-testing', '/ad-testing'],
  ]
  for (const [from, to] of cases) {
    await page.goto(from)
    await expect(page, from + ' should open ' + to).toHaveURL(new RegExp(to.replace('/', '\\/') + '$'))
  }
})

test('an unknown address says the page does not exist', async ({ page }) => {
  await signIn(page, '/today')
  const res = await page.goto('/no-such-page')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible()
  await page.getByRole('link', { name: 'Go to Today' }).click()
  await expect(page).toHaveURL(/\/today$/)
})

test('the mark is the logo once it loads, the P when it cannot', async ({ page }) => {
  await signIn(page, '/today')
  const mark = page.getByRole('navigation', { name: 'Main' }).getByTestId('brand-mark')
  await expect(mark).toHaveClass(/has-logo/)
  const other = await page.context().newPage()
  await serveLogo(other, false)
  await other.goto('/today')
  const mark2 = other.getByRole('navigation', { name: 'Main' }).getByTestId('brand-mark')
  await expect(mark2).not.toHaveClass(/has-logo/)
  await expect(mark2.getByText('P', { exact: true })).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the menu opens the sidebar, a page closes it, and nothing scrolls sideways', async ({ page }) => {
    await signIn(page, '/today')
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    await page.getByRole('button', { name: 'Open the menu' }).click()
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await expect(drawer).toBeVisible()
    await drawer.locator('button[data-product="catalyst"]').click()
    await drawer.getByRole('link', { name: 'Calls' }).click()
    await expect(page).toHaveURL(/\/calls$/)
    await expect(drawer).toBeHidden()
    for (const path of ['/today', '/marketing-generation', '/login']) {
      if (path === '/login') await page.context().clearCookies()
      await page.goto(path)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(wide, path + ' scrolls sideways').toBeLessThanOrEqual(0)
    }
  })
})
