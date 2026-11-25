import { type Page, expect, test } from '@playwright/test'
import { C, P, R, U, intelRows } from './intel-fixtures'
import { TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { connectionsFrom, csvRows, liKey, liUrl, whyLines } from '../../src/lib/pipeline/intel-replies'

// The Intel Tracker's replies (the current dashboard's v145, with v146's fixes): who each account is to the firm and
// whether its posts get replies, Why this post in a reply's window, and Import LinkedIn connections. Made-up accounts
// and posts from intel-fixtures.ts, and a made-up Connections.csv.

test.use({ timezoneId: 'UTC' })
const toast = (page: Page, t: string) => page.getByTestId('toasts').getByText(t)
type Row = Record<string, unknown>
const comps = async () => stubRows<Row>('competitors')

const CSV = [
  'Notes:',
  '"When exporting your connection data, you may notice that some of the email addresses are missing."',
  '',
  'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
  'Jane,Example,https://www.linkedin.com/in/jane-example,,"Example Partners, LLC",Partner,01 Nov 2026',
  'Jane,Example,http://uk.linkedin.com/in/jane-example/?trk=x,,Example Partners,Partner,01 Nov 2026',
  'Pat,Voice,linkedin.com/in/Pat-Voice/,,Voice Co,Founder,02 Nov 2026',
  'Omar,Sample,https://www.linkedin.com/company/sample-co,,Sample Co,CEO,03 Nov 2026',
  'Lee,"Quote ""Q"" Name",https://www.linkedin.com/in/lee-q,,,,04 Nov 2026',
  ',,https://www.linkedin.com/in/nobody,,,,',
].join('\r\n')

test('the rules: a profile link in any shape, the connections file, why a post got a reply', () => {
  expect(liUrl('http://uk.linkedin.com/in/jane-example/?trk=x')).toBe('https://www.linkedin.com/in/jane-example')
  expect(liUrl('linkedin.com/in/jane')).toBe('https://www.linkedin.com/in/jane')
  expect(liUrl('https://www.linkedin.com/company/x')).toBe('')
  expect(liKey('in/Pat-Voice/')).toBe('pat-voice')
  expect(liKey('https://www.linkedin.com/in/Pat-Voice')).toBe('pat-voice')
  expect(csvRows('a,"b,c"\n"d ""e"""')).toEqual([['a', 'b,c'], ['d "e"']])
  expect(connectionsFrom('Name,Email\nx,y')).toBeNull()
  expect(connectionsFrom(CSV)).toEqual([
    { name: 'Jane Example', url: 'https://www.linkedin.com/in/jane-example', company: 'Example Partners, LLC', position: 'Partner', on: '01 Nov 2026' },
    { name: 'Pat Voice', url: 'https://www.linkedin.com/in/Pat-Voice', company: 'Voice Co', position: 'Founder', on: '02 Nov 2026' },
    { name: 'Lee Quote "Q" Name', url: 'https://www.linkedin.com/in/lee-q', company: '', position: '', on: '04 Nov 2026' },
  ])
  // among the run's most engaged only when the run said so (v146)
  const w = whyLines({ why: { found: 'followed', relation: 'prospect', value: 'high', engagement: 1200 }, item: null, account: { name: 'Acme', relation: '' } })
  expect(w.lines).toEqual(['From an account you follow, a prospect', 'Rated high value: high-value posts always get a reply', '1,200 reactions, comments and shares'])
  expect(w.note).toContain('Replies to Acme can be turned off on Intel Tracker › Following.')
  const s = whyLines({ why: { found: 'linkedin_search', engagement: 40, top: true }, item: null, account: null })
  expect(s.lines).toEqual(['Found by a LinkedIn search for your topics', '40 reactions, comments and shares, among the run’s most engaged'])
  expect(s.note).not.toContain('Replies to')
  expect(whyLines({ why: {}, item: { source: 'tavily_web', engagement: null }, account: null }).lines).toEqual(['Found by a web search for your topics'])
})

test.describe('in the browser', () => {
  test.beforeEach(async ({ page }) => {
    await stubReset()
    await serveLogo(page)
    const rows = intelRows() as unknown as Record<string, Row[]>
    rows.engagement_drafts = [
      { ...rows.engagement_drafts[0], why: { found: 'followed', relation: 'client', value: 'high', engagement: 340, top: true } },
      rows.engagement_drafts[1],
      // an older draft with no why: its account is found by its name (v146)
      {
        id: R(3), run_id: rows.engagement_drafts[0].run_id, intel_item_id: null, competitor_name: 'Pat Voice', platform: 'linkedin', action: 'comment',
        source_url: U(6), draft: 'Rules are coming, and we are ready.', status: 'pending', created_at: '2026-11-09T14:05:00Z',
      },
    ]
    rows.intel_items = rows.intel_items.map((i: Row) => (i.id === P(1) ? { ...i, competitor_id: C(1) } : i))
    await stubSeed(rows)
  })

  test('Following: who each account is to you, and whether its posts get replies', async ({ page }) => {
    await signIn(page, '/intel-tracker?tab=follow')
    const pat = page.locator(`[data-testid="follow-row"][data-id="${C(3)}"]`)
    await expect(pat.getByLabel('Who Pat Voice is to you')).toHaveValue('competitor')
    await expect(pat.getByLabel('Draft replies')).toBeChecked()
    await pat.getByLabel('Who Pat Voice is to you').selectOption({ label: 'LinkedIn connection' })
    await expect(toast(page, 'Saved.')).toBeVisible()
    await expect.poll(async () => (await comps()).find((c) => c.id === C(3))?.relation).toBe('connection')
    const nw = page.locator(`[data-testid="follow-row"][data-id="${C(1)}"]`)
    await nw.getByLabel('Draft replies').uncheck()
    await expect(toast(page, 'No more replies drafted to Northwind Advisors.')).toBeVisible()
    await expect.poll(async () => (await comps()).find((c) => c.id === C(1))?.draft_replies).toBe(false)
    await page.reload()
    await expect(page.locator(`[data-testid="follow-row"][data-id="${C(1)}"]`).getByLabel('Draft replies')).not.toBeChecked()
    // a stopped account has no such controls
    await expect(page.locator(`[data-testid="follow-row"][data-id="${C(5)}"]`).getByTestId('follow-replies')).toHaveCount(0)
  })

  test('Why this post: from the draft’s why, and for an older draft from its account by name', async ({ page }) => {
    await signIn(page, '/approvals?review=reply:' + R(1))
    const w = page.getByRole('dialog', { name: 'Reply to Northwind Advisors' })
    const why = w.getByTestId('why-post')
    await expect(why.locator('li')).toHaveText([
      'From an account you follow, a client',
      'Rated high value: high-value posts always get a reply',
      '340 reactions, comments and shares, among the run’s most engaged',
      'On topic for advisors and backed by numbers.',
    ])
    await expect(why).toContainText('Replies to Northwind Advisors can be turned off on Intel Tracker › Following.')
    await page.keyboard.press('Escape')

    await page.goto('/approvals?review=reply:' + R(3))
    const w3 = page.getByRole('dialog', { name: 'Reply to Pat Voice' })
    await expect(w3.getByTestId('why-post').locator('li')).toHaveText(['From an account you follow, a competitor', '25 reactions, comments and shares'])
  })

  test('Import LinkedIn connections: read here, those followed marked, the picked ones followed as people', async ({ page }) => {
    await signIn(page, '/intel-tracker?tab=follow')
    await page.getByRole('button', { name: 'Import LinkedIn connections' }).click()
    const dlg = page.getByRole('dialog', { name: 'Import LinkedIn connections' })
    const file = dlg.locator('input[type=file]')
    await file.setInputFiles({ name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Email\nx,y') })
    await expect(dlg.getByTestId('import-msg')).toHaveText('That is not LinkedIn’s Connections.csv: it has no First Name and URL columns.')
    await file.setInputFiles({ name: 'Connections.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
    await expect(dlg.getByTestId('import-msg')).toHaveText('3 connections read. Those you follow already are marked.')
    const rows = dlg.getByTestId('connection')
    await expect(rows).toHaveCount(3)
    // Pat Voice is followed already, under in/pat-voice (another shape of the same link)
    await expect(rows.filter({ hasText: 'Pat Voice' })).toContainText('followed already')
    await expect(rows.filter({ hasText: 'Pat Voice' }).getByRole('checkbox')).toBeDisabled()
    await dlg.getByLabel('Search connections').fill('example partners')
    await expect(rows).toHaveCount(1)
    await rows.first().getByRole('checkbox').first().check()
    await dlg.getByLabel('Search connections').fill('')
    const lee = rows.filter({ hasText: 'Lee Quote' })
    await lee.getByRole('checkbox').first().check()
    await lee.getByLabel('Draft replies').uncheck()
    await dlg.getByRole('button', { name: 'Follow 2 people' }).click()
    await expect(toast(page, 'Following 2 connections. The next run reads their posts.')).toBeVisible()
    const added = (await comps()).filter((c) => c.source === 'linkedin_import')
    expect(added.map((c) => [c.name, c.handle_linkedin, c.draft_replies, c.notes])).toEqual([
      ['Jane Example', 'https://www.linkedin.com/in/jane-example', true, 'Partner at Example Partners, LLC'],
      ['Lee Quote "Q" Name', 'https://www.linkedin.com/in/lee-q', false, null],
    ])
    for (const c of added) expect(c).toMatchObject({ follow_kind: 'person', follow_for: 'posts', status: 'approved', relation: 'connection', added_by: TEAM.email })
    await expect(page.getByTestId('follow-person')).toContainText('Jane Example')
  })
})
