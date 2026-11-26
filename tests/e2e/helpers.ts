import { type Locator, type Page, expect } from '@playwright/test'

// the stand-in's address (STUB_PORT moves it, for a second copy of the suite running beside this one)
export const STUB = 'http://127.0.0.1:' + (process.env.STUB_PORT || '54399')
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

/** The stand-in's rows of a table, as the app left them. */
export async function stubRows<T = Record<string, unknown>>(table: string): Promise<T[]> {
  return (await fetch(STUB + '/__rows?table=' + encodeURIComponent(table))).json()
}
/** Replaces some of the stand-in's tables with a test's own rows. */
export async function stubSeed(tables: Record<string, unknown[]>) {
  await fetch(STUB + '/__seed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tables) })
}
/** A canned answer from the n8n stand-in for /webhook/<path>. */
export async function stubHook(path: string, status: number, body: unknown) {
  await fetch(STUB + '/__hook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, status, body }) })
}

/** The team's Fathom key as the Fathom proxy stand-in keeps it ({connected: false} disconnects it). */
export async function stubFathom(state: Record<string, unknown>) {
  await fetch(STUB + '/__fathom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) })
}

// React marks an element it has hydrated (a __reactProps$ key on the node). A change made before that, such as picking
// an option right after page.goto, reaches no handler and is lost, so a test that acts at once on a fresh page waits.
export async function untilHydrated(el: Locator) {
  await expect.poll(() => el.evaluate((n) => Object.keys(n).some((k) => k.startsWith('__reactProps$')))).toBe(true)
}
