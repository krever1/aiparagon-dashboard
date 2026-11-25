import { type Page, expect, test } from '@playwright/test'
import { TEAM, serveLogo, signIn, stubFathom, stubReset, stubSeed } from './helpers'

// Calls' Calendar tab (the current dashboard's v144): a month from Monday, today marked, each day with its first calls;
// a day lists its recordings, one opens on All, and Load older calls reads older pages from Fathom. Made-up calls,
// dated from now, in UTC.

test.use({ timezoneId: 'UTC' })

const NOW = new Date()
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(Date.UTC(y, m, d, h, min)).toISOString()
const Y = NOW.getUTCFullYear()
const M = NOW.getUTCMonth()
const D = NOW.getUTCDate()
const TEAMP = { name: TEAM.name, email: TEAM.email }
const NORA = { name: 'Nora New', email: 'nora@newco.example.org', external: true }
const call = (id: number, title: string, start: string, mins: number, guests: unknown[] = []) => ({
  id, title, start, end: new Date(Date.parse(start) + mins * 60e3).toISOString(), recorded_by: TEAMP, invitees: [TEAMP, ...guests],
})
const monthLabel = (y: number, m: number) => new Date(Date.UTC(y, m, 1, 12)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
const prev = (n: number) => ({ y: M - n < 0 ? Y - 1 : Y, m: (M - n + 12) % 12 })
const P1 = prev(1)
const P3 = prev(3)

const cal = (page: Page) => page.getByTestId('calls-calendar')
const day = (page: Page) => page.getByTestId('cal-day')

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ call_meta: [], call_outputs: [] })
  await stubFathom({
    connected: true,
    hint: '1234',
    items: [
      call(9203, 'Kickoff', at(Y, M, D, 16), 30),
      call(9202, 'Team sync', at(Y, M, D, 15), 20),
      call(9201, 'Planning with Nora', at(Y, M, D, 10), 45, [NORA]),
      call(9204, 'Last month call', at(P1.y, P1.m, 10, 12), 30, [NORA]),
    ],
    older: [call(9205, 'An older call', at(P3.y, P3.m, 3, 9), 25)],
  })
})

test('the month: weeks from Monday, today marked with its first calls, and the day’s recordings beside it', async ({ page }) => {
  await signIn(page, '/calls')
  await page.getByRole('tab', { name: 'Calendar' }).click()
  await expect(page).toHaveURL(/\/calls\?tab=cal$/)
  await expect(page.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true')
  await expect(cal(page).getByRole('heading', { level: 3 })).toHaveText(monthLabel(Y, M))
  await expect(page.getByTestId('cal-count')).toHaveText('3 calls')
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled()
  const first = new Date(Date.UTC(Y, M, 1))
  // the first of the month sits under its weekday, weeks starting on Monday
  const lead = (first.getUTCDay() + 6) % 7
  expect(await cal(page).getByRole('group').locator(':scope > *').nth(lead).getAttribute('data-d')).toBe(at(Y, M, 1, 0).slice(0, 10))

  const today = cal(page).getByRole('button', { name: dayLabel(at(Y, M, D, 12)) + ', 3 calls' })
  await expect(today).toHaveAttribute('aria-pressed', 'true')
  await expect(today).toContainText('10:00 AM Planning with Nora')
  await expect(today).toContainText('3:00 PM Team sync')
  await expect(today).toContainText('+1 more')
  await expect(day(page).getByRole('heading', { level: 4 })).toHaveText(dayLabel(at(Y, M, D, 12)))
  const recs = day(page).getByRole('button')
  await expect(recs).toHaveCount(3)
  await expect(recs.nth(0)).toContainText('Planning with Nora')
  await expect(recs.nth(0)).toContainText('Client')
  await expect(recs.nth(0)).toContainText('10:00 AM · 45 min · Example')
  await expect(recs.nth(0)).toContainText('Nora New')
  await expect(recs.nth(1)).toContainText('3:00 PM · 20 min · AI Paragon (internal)')

  // a day with nothing recorded
  const empty = D === 1 ? 2 : 1
  await cal(page).getByRole('button', { name: dayLabel(at(Y, M, empty, 12)) + ', no calls' }).click()
  await expect(day(page)).toContainText('No recordings that day.')

  // a call opens on All
  await page.getByRole('button', { name: 'Today' }).click()
  await recs.nth(0).click()
  await expect(page).toHaveURL(/\/calls\?call=9201$/)
  await expect(page.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('call-detail').getByRole('heading', { level: 2 })).toContainText('Planning with Nora')
})

test('earlier months, and Load older calls reads older pages from Fathom until they reach the month', async ({ page }) => {
  await signIn(page, '/calls?tab=cal')
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(cal(page).getByRole('heading', { level: 3 })).toHaveText(monthLabel(P1.y, P1.m))
  await expect(page.getByTestId('cal-count')).toHaveText('1 call')
  // the last day with calls is picked
  await expect(day(page).getByRole('heading', { level: 4 })).toHaveText(dayLabel(at(P1.y, P1.m, 10, 12)))
  await expect(day(page)).toContainText('Last month call')
  await expect(page.getByText('Older calls are still in Fathom.')).toBeVisible()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(cal(page).getByRole('heading', { level: 3 })).toHaveText(monthLabel(P3.y, P3.m))
  await expect(page.getByTestId('cal-count')).toHaveText('0 calls')
  await expect(day(page)).toContainText('Pick a day with calls to see its recordings.')
  await page.getByRole('button', { name: 'Load older calls' }).click()
  await expect(page.getByTestId('cal-count')).toHaveText('1 call')
  await expect(day(page)).toContainText('An older call')
  await expect(page.getByText('Older calls are still in Fathom.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(cal(page).getByRole('heading', { level: 3 })).toHaveText(monthLabel(Y, M))
  // the older call is on the All tab too
  await page.getByRole('tab', { name: /^All/ }).click()
  await expect(page.getByTestId('call-rows')).toContainText('An older call')
})

test('on a phone the month fits, with a dot for a day with calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/calls?tab=cal')
  await expect(cal(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
