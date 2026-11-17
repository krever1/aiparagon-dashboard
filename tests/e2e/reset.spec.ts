import { type Page, expect, test } from '@playwright/test'
import { OUTSIDER, PASSWORD, STUB, TEAM, serveLogo, stubCalls, stubReset } from './helpers'

// The password reset: Forgot your password? asks Supabase for an email whose link comes back to /auth/reset, and that
// page sets the new password. Supabase's link carries a short sign-in in the address's #fragment (the same kind of link
// the current dashboard asks for, so it works on any device); here the stand-in hands out that session.

async function linkFor(email: string) {
  const s = await (await fetch(STUB + '/__recovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })).json()
  return `/auth/reset#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery`
}

async function signInWith(page: Page, password: string) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(TEAM.email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('Forgot your password? asks for a link back to this app\'s reset page, sent straight to Supabase', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(TEAM.email)
  await page.getByRole('button', { name: 'Forgot your password?' }).click()
  await expect(page.locator('form').getByRole('status')).toHaveText('If that address has an account, a reset link is on its way.')
  const recover = (await stubCalls()).filter((c) => c.path === '/auth/v1/recover')
  expect(recover).toHaveLength(1)
  expect(recover[0].body.email).toBe(TEAM.email)
  expect(new URLSearchParams(recover[0].query).get('redirect_to')).toBe('http://127.0.0.1:3100/auth/reset')
  // no PKCE: a link that only worked in the browser that asked for it would fail on a phone
  expect(recover[0].body.code_challenge).toBeUndefined()
})

test('the link opens Set a new password, takes the tokens out of the address and changes the password', async ({ page }) => {
  await page.goto(await linkFor(TEAM.email))
  await expect(page).toHaveTitle('Set a new password · AI Paragon')
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  await expect(page.getByText('For ' + TEAM.email + '. It works in both dashboards.')).toBeVisible()
  // the sign-in tokens never stay in the address bar
  await expect(page).toHaveURL(/\/auth\/reset$/)
  expect(await page.evaluate(() => location.hash)).toBe('')

  const save = page.getByRole('button', { name: 'Save the new password' })
  const alert = page.locator('form').getByRole('alert')
  await page.getByLabel('New password').fill('short')
  await page.getByLabel('Type it again').fill('short')
  await save.click()
  await expect(alert).toHaveText('Use at least 8 characters.')
  await page.getByLabel('New password').fill('a much better one')
  await page.getByLabel('Type it again').fill('a much better on')
  await save.click()
  await expect(alert).toHaveText('The two passwords are not the same.')
  await page.getByLabel('New password').fill(PASSWORD)
  await page.getByLabel('Type it again').fill(PASSWORD)
  await save.click()
  await expect(alert).toHaveText('That is your current password. Choose a new one.')

  await page.getByLabel('New password').fill('a much better one')
  await page.getByLabel('Type it again').fill('a much better one')
  await save.click()
  await expect(page.locator('main').getByRole('status')).toHaveText('Your password is changed. Use it to sign in to both dashboards.')
  const put = (await stubCalls()).filter((c) => c.method === 'PUT' && c.path === '/auth/v1/user')
  expect(put.length).toBeGreaterThanOrEqual(2)

  // the page left the teammate signed in
  await page.getByRole('link', { name: 'Open the dashboard' }).click()
  await expect(page).toHaveURL(/\/today$/)

  // the old password no longer works, the new one does
  await page.context().clearCookies()
  await signInWith(page, PASSWORD)
  await expect(page.locator('form').getByRole('alert')).toHaveText('That email or password is not right.')
  await signInWith(page, 'a much better one')
  await expect(page).toHaveURL(/\/today$/)
})

test('an expired or used link says so and offers the sign-in page', async ({ page }) => {
  await page.goto('/auth/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.locator('main').getByRole('alert')).toContainText('This reset link has expired or was already used.')
  await expect(page).toHaveURL(/\/auth\/reset$/)
  await expect(page.getByLabel('New password')).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('a link whose tokens Supabase refuses says it has expired', async ({ page }) => {
  await page.goto('/auth/reset#access_token=not.a.token&refresh_token=nope&type=recovery')
  await expect(page.locator('main').getByRole('alert')).toContainText('This reset link has expired or was already used.')
  await page.goto('/today')
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/)
})

test('opened without a link, the page says where the link comes from', async ({ page }) => {
  await page.goto('/auth/reset')
  await expect(page.locator('main').getByRole('status')).toContainText('Open the link in your password reset email')
  await expect(page.getByLabel('New password')).toHaveCount(0)
})

test('a reset link for an account outside the team is turned away and leaves nobody signed in', async ({ page }) => {
  await page.goto(await linkFor(OUTSIDER))
  await expect(page.locator('main').getByRole('alert')).toContainText('That reset link is for an account outside it.')
  expect((await stubCalls()).some((c) => c.path === '/auth/v1/logout')).toBe(true)
  expect((await stubCalls()).some((c) => c.method === 'PUT' && c.path === '/auth/v1/user')).toBe(false)
  await page.goto('/today')
  await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/)
})

test('a reload after the link keeps the form, from the session the link started', async ({ page }) => {
  await page.goto(await linkFor(TEAM.email))
  await expect(page.getByLabel('New password')).toBeVisible()
  await page.reload()
  await expect(page.getByText('For ' + TEAM.email + '. It works in both dashboards.')).toBeVisible()
})
