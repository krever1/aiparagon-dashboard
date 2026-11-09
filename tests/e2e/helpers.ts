import { type Page, expect } from '@playwright/test'

export const STUB = 'http://127.0.0.1:54399'
export const TEAM = { email: 'qa.teammate@aiparagonconsulting.com', name: 'QA Teammate' }
export const OUTSIDER = 'outsider@example.org'
export const PASSWORD = 'correct horse battery'
export const LEGACY = 'https://aiparagon.vercel.app/dashboard'

/** The stand-in's record of what the app asked Supabase Auth (passwords left out). */
export async function stubCalls(): Promise<{ method: string; path: string; query: string; body: Record<string, unknown> }[]> {
  return (await fetch(STUB + '/__calls')).json()
}
export async function stubReset() {
  await fetch(STUB + '/__reset', { method: 'POST' })
}
export async function stubActAs(email: string | null) {
  await fetch(STUB + '/__as', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
}

/** The logo lives on the company site, which the tests cannot reach: answer it with a tiny picture. */
export async function serveLogo(page: Page, ok = true) {
  await page.route('https://www.aiparagonconsulting.com/**', (route) =>
    ok
      ? route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
        })
      : route.abort(),
  )
}

export async function signIn(page: Page, next = '/today', email = TEAM.email, password = PASSWORD) {
  await page.goto('/login?next=' + encodeURIComponent(next))
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(next.replace(/[?]/g, '\\?') + '$'))
}
