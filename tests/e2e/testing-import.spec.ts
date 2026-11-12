import { type Page, expect, test } from '@playwright/test'
import { dayText } from '../../src/lib/pipeline/ad-testing'
import { TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { R, dayAgo, testingRows } from './testing-fixtures'

// Import a CSV on Ad Testing: a results file (its header after a report line, the columns guessed, two ad sets added
// together, one result matched and updated, a synced one left alone), a CRM export (read as leads, its stages guessed
// and changed, counted for each ad), and what the window refuses. On the made-up rows in tests/e2e/testing-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const dlg = (page: Page) => page.getByRole('dialog', { name: 'Import results' })
const csv = (name: string, lines: string[]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) })
const pick = async (page: Page, file: { name: string; mimeType: string; buffer: Buffer }) => dlg(page).locator('input[type="file"]').setInputFiles(file)
const values = (page: Page, id: string) => dlg(page).getByTestId(id).locator('select').evaluateAll((s) => s.map((x) => (x as HTMLSelectElement).value))
const cells = (page: Page) => dlg(page).getByTestId('import-row')
const result = async (pred: (r: Row) => boolean) => (await stubRows<Row>('content_results')).filter(pred)

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(testingRows())
})

test('a results file: the header after a report line, columns guessed, two ad sets added together, one matched, a synced one left alone', async ({ page }) => {
  await signIn(page, '/ad-testing?tab=results')
  await page.getByRole('button', { name: 'Import a CSV' }).first().click()
  await expect(dlg(page).getByRole('radio', { name: 'One row per ad or post' })).toHaveAttribute('aria-checked', 'true')
  await expect(dlg(page).getByRole('radio', { name: 'Ads', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(dlg(page)).toContainText('An export from Meta, LinkedIn or a spreadsheet. Download the template for the column names.')
  await expect(dlg(page).getByRole('button', { name: 'Import', exact: true })).toBeDisabled()

  await pick(
    page,
    csv('meta-ads.csv', [
      'Report: Ads, last 30 days',
      'Ad name,Platform,Reporting starts,Amount spent (USD),Impressions,Link clicks,Results',
      `Stop losing a week to paperwork,Meta ads,${dayAgo(5)},"1,250.50",9000,120,6`,
      `New hook test,Meta ads,${dayAgo(2)},80,2000,20,1`,
      `New hook test,Meta ads,${dayAgo(2)},20,500,5,0`,
      `PK7Q2-A1 Onboarding audit — Meta,Meta ads,${dayAgo(10)},130,5200,82,3`,
      'Nothing here,,,,,,',
    ]),
  )
  await expect(dlg(page).getByTestId('import-file')).toHaveText('meta-ads.csv · 5 rows')
  // the columns it found: the name, where, the day, spend, impressions, clicks and leads
  expect(await values(page, 'import-map')).toEqual(['0', '', '1', '2', '', '3', '4', '5', '6', '', '', '', '', '', '', '', '', ''])
  await expect(dlg(page).getByTestId('import-count')).toHaveText('3 results · 1 update results already logged')
  await expect(cells(page).nth(0).getByRole('cell')).toHaveText([
    'Stop losing a week to paperwork · logged ' + dayText(dayAgo(5), true),
    dayText(dayAgo(5), true),
    '$1,250.50',
    '120',
    '6',
    '–',
    '–',
  ])
  // two ad sets of one ad on one day are added together
  await expect(cells(page).nth(1).getByRole('cell')).toHaveText(['New hook test', dayText(dayAgo(2), true), '$100', '25', '1', '–', '–'])
  // the synced row is never matched: the next sync would undo a change
  await expect(cells(page).nth(2).getByRole('cell').first()).toHaveText('PK7Q2-A1 Onboarding audit — Meta')

  await dlg(page).getByRole('button', { name: 'Import 3 results' }).click()
  await expect(toast(page, 'Imported 2 new results and updated 1. The leaderboard and the next strategy read use them.')).toBeVisible()
  await expect(dlg(page)).toBeHidden()
  expect((await result((r) => r.id === R.r1))[0]).toMatchObject({ spend: 1250.5, impressions: 9000, clicks: 120, leads: 6, revenue: 4500, attribution: 'csv', updated_by: TEAM.email })
  expect((await result((r) => r.id === R.synced))[0]).toMatchObject({ spend: 120, attribution: 'api' })
  expect(await result((r) => r.title === 'New hook test')).toEqual([
    expect.objectContaining({
      kind: 'ad', platform: 'Meta ads', posted_on: dayAgo(2), period_start: dayAgo(2), spend: 100, impressions: 2500, clicks: 25, leads: 1, revenue: null,
      attribution: 'csv', created_by: TEAM.email,
    }),
  ])
  expect(await result((r) => r.title === 'PK7Q2-A1 Onboarding audit — Meta')).toHaveLength(2)
  await expect(page.getByRole('table', { name: 'Ads', exact: true }).getByTestId('result-row')).toHaveCount(6)
})

test('a CRM export: read as leads, its stages guessed and one changed, counted for each ad', async ({ page }) => {
  await signIn(page, '/ad-testing?tab=results')
  await page.getByRole('button', { name: 'Import a CSV' }).first().click()
  await pick(
    page,
    csv('hubspot-contacts.csv', [
      'Contact ID,First Name,Lifecycle Stage,Create Date,UTM Content',
      `1,Ann,Lead,${dayAgo(3)},Stop losing a week to paperwork`,
      `2,Bo,Customer,${dayAgo(3)},Stop losing a week to paperwork`,
      `3,Cy,Meeting booked,${dayAgo(2)},Your first workflow`,
      `4,Di,Unqualified,${dayAgo(2)},Your first workflow`,
      `5,Ed,Spam,${dayAgo(1)},`,
    ]),
  )
  // a file of people with a stage is read as leads
  await expect(dlg(page).getByRole('radio', { name: 'One row per lead, from a CRM' })).toHaveAttribute('aria-checked', 'true')
  await expect(dlg(page)).toContainText('An export of contacts or deals. It counts leads, qualified leads and booked calls for each ad')
  await expect(dlg(page).getByRole('radiogroup', { name: 'These are' })).toHaveCount(0)
  expect(await values(page, 'import-map')).toEqual(['4', '2', '3'])
  const stages = dlg(page).getByTestId('import-stages')
  await expect(stages.locator('label > span')).toHaveText(['Lead', 'Customer', 'Meeting booked', 'Unqualified', 'Spam'])
  expect(await values(page, 'import-stages')).toEqual(['lead', 'won', 'booked', 'lead', 'lead'])
  await stages.locator('label').filter({ hasText: 'Unqualified' }).locator('select').selectOption({ label: 'Leave out' })

  await expect(dlg(page).getByTestId('import-count')).toHaveText('2 results · 1 update results already logged')
  await expect(cells(page).nth(0).getByRole('cell')).toHaveText(['Stop losing a week to paperwork · logged ' + dayText(dayAgo(5), true), '2', '1', '1'])
  await expect(cells(page).nth(1).getByRole('cell')).toHaveText(['Your first workflow', '1', '1', '1'])
  await dlg(page).getByRole('button', { name: 'Import 2 results' }).click()
  await expect(toast(page, 'Imported 1 new result and updated 1. The leaderboard and the next strategy read use them.')).toBeVisible()
  expect((await result((r) => r.id === R.r1))[0]).toMatchObject({ leads: 2, qualified: 1, bookings: 1, won: 1, spend: 300, attribution: 'crm', updated_by: TEAM.email })
  expect(await result((r) => r.title === 'Your first workflow')).toEqual([
    expect.objectContaining({ kind: 'ad', leads: 1, qualified: 1, bookings: 1, won: 0, spend: null, posted_on: dayAgo(2), attribution: 'crm', created_by: TEAM.email }),
  ])
})

test('what the window refuses: no rows, no column for the name, nothing with numbers, a file over 3 MB; posts have no ad columns', async ({ page }) => {
  await signIn(page, '/ad-testing?tab=results')
  await page.getByRole('button', { name: 'Import a CSV' }).first().click()
  await pick(page, csv('empty.csv', ['Ad name,Spend', '']))
  await expect(dlg(page).getByRole('alert').filter({ hasText: 'No rows found. Use a CSV with a header row and at least one row of results.' })).toBeVisible()

  await pick(page, csv('one.csv', ['Ad name,Spend,Impressions', 'An ad,5,100']))
  await expect(dlg(page).getByTestId('import-file')).toHaveText('one.csv · 1 row')
  await expect(dlg(page).getByRole('button', { name: 'Import 1 result' })).toBeEnabled()
  const map = dlg(page).getByTestId('import-map')
  await map.locator('select').first().selectOption('')
  await expect(dlg(page).getByRole('alert').filter({ hasText: 'Pick the column with the name of the ad or post.' })).toBeVisible()
  await expect(dlg(page).getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
  await map.locator('select').first().selectOption('0')
  // organic posts: no spend, leads or revenue columns
  await dlg(page).getByRole('radio', { name: 'Organic posts' }).click()
  await expect(map.locator('label > span').filter({ hasText: /^Spend$/ })).toHaveCount(0)
  await expect(map.locator('label > span')).toHaveCount(12)
  await expect(cells(page).nth(0).getByRole('cell')).toHaveText(['An ad', '–', '100', '–', '–', '–'])
  // a label holds its select's options too, so the column is found by its place: impressions is the sixth for posts
  await expect(map.locator('label > span').nth(5)).toHaveText('Impressions')
  await map.locator('select').nth(5).selectOption('')
  await expect(dlg(page).getByRole('alert').filter({ hasText: 'No rows with numbers to import. Check which column holds what.' })).toBeVisible()

  await pick(page, { name: 'huge.csv', mimeType: 'text/csv', buffer: Buffer.alloc(3 * 1024 * 1024 + 10, 'a') })
  await expect(dlg(page).getByRole('alert').filter({ hasText: 'That file is over 3 MB. Export a shorter date range and try again.' })).toBeVisible()
  await dlg(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dlg(page)).toBeHidden()
  expect(await stubRows<Row>('content_results')).toHaveLength(7)
})
