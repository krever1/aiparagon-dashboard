import { expect, test } from '@playwright/test'
import { OUTSIDER, PASSWORD, TEAM, serveLogo, signIn, stubActAs, stubCalls, stubReset } from './helpers'

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('a signed-out visit goes to sign-in, then back to the page asked for', async ({ page }) => {
  await page.goto('/lead-pipeline')
  await expect(page).toHaveURL(/\/login\?next=%2Flead-pipeline$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page).toHaveTitle('Sign in · AI Paragon')
  await page.getByLabel('Work email').fill(TEAM.email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/lead-pipeline$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Lead pipeline' })).toBeVisible()
})

test('a wrong password says so, in the current dashboard\'s words', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(TEAM.email)
  await page.getByLabel('Password').fill('not it')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('That email or password is not right.')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByLabel('Work email')).toHaveValue(TEAM.email)
})

test('empty fields are asked for', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Enter your email and password.')
})

test('only team accounts can sign in, and Supabase is not even asked for another address', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(OUTSIDER)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Accounts are limited to @aiparagonconsulting.com addresses.')
  expect((await stubCalls()).filter((c) => c.path === '/auth/v1/token')).toHaveLength(0)
})

test('a session that is not a team account is signed out and turned away', async ({ page }) => {
  await signIn(page, '/today')
  // the shared Supabase project also has care portal and voice agent accounts: one of those must not get in
  await stubActAs(OUTSIDER)
  await page.goto('/calls')
  await expect(page).toHaveURL(/\/login\?denied=1$/)
  await expect(page.locator('form').getByRole('alert')).toContainText('This workspace is for the AI Paragon team.')
  expect((await stubCalls()).some((c) => c.path === '/auth/v1/logout')).toBe(true)
  await stubActAs(null)
  await page.goto('/today')
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/)
})

test('signed in, the sign-in page opens Today', async ({ page }) => {
  await signIn(page, '/calls')
  await page.goto('/login')
  await expect(page).toHaveURL(/\/today$/)
})

test('after sign-in, next can only point inside the app', async ({ page }) => {
  for (const next of ['//evil.example/x', 'https://evil.example', '/\\evil.example']) {
    await stubReset()
    await page.context().clearCookies()
    await page.goto('/login?next=' + encodeURIComponent(next))
    await page.getByLabel('Work email').fill(TEAM.email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/127\.0\.0\.1:3100\/today$/)
  }
})

test('sign out ends the session and the pages ask for sign-in again', async ({ page }) => {
  await signIn(page, '/today')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  const logout = (await stubCalls()).find((c) => c.path === '/auth/v1/logout')
  expect(logout?.query).toContain('scope=local')
  await page.goto('/templates')
  await expect(page).toHaveURL(/\/login\?next=%2Ftemplates$/)
})

test('Forgot your password? sends a reset link and says so either way', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Forgot your password?' }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Enter your email first, then press this again.')
  await page.getByLabel('Work email').fill(TEAM.email)
  await page.getByRole('button', { name: 'Forgot your password?' }).click()
  await expect(page.locator('form').getByRole('status')).toHaveText('If that address has an account, a reset link is on its way.')
  const recover = (await stubCalls()).find((c) => c.path === '/auth/v1/recover')
  expect(recover?.body.email).toBe(TEAM.email)
})
