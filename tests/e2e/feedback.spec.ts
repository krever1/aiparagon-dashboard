import { type Page, expect, test } from '@playwright/test'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { TASK_METAS, TASK_OUTPUTS } from './tasks-fixtures'

// Feedback pins (the current dashboard's v144): Feedback in the top bar turns on feedback mode, where a click on any part
// of a page opens a note on that spot instead of running it; notes are saved for the team in dashboard_comments
// (target_key fb:<the current dashboard's view>[:<lead email>], anchor_text {sel, label, x, y}), show as numbered pins,
// are listed in All feedback with Go to it and Resolve, and on Approvals as "Feedback from <name>". Made-up notes.

test.use({ timezoneId: 'UTC' })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const NOW = Date.now()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const N1 = '0b0b0b0b-0000-4000-8000-000000000001'
const N2 = '0b0b0b0b-0000-4000-8000-000000000002'
const N3 = '0b0b0b0b-0000-4000-8000-000000000003'
const N4 = '0b0b0b0b-0000-4000-8000-000000000004'

const button = (page: Page) => page.getByRole('button', { name: 'Feedback', exact: true })
const bar = (page: Page) => page.getByTestId('feedback-bar')
const pins = (page: Page) => page.getByTestId('fb-pin')
const toasts = (page: Page) => page.getByTestId('toasts')
const notes = () => stubRows<Record<string, unknown>>('dashboard_comments')

function seedNotes() {
  return [
    // left in the current dashboard on Tasks: its path is that app's, so the pin finds its spot by what it says
    {
      id: N1, target_key: 'fb:tasks', author: 'erin@example.com', body: 'Make the open count bigger', created_at: ago(36e5), resolved: false,
      anchor_text: JSON.stringify({ sel: '#view-app>div:nth-of-type(3)>h2', label: 'Post-call to-dos', x: 0.5, y: 0.5 }),
    },
    // on Pat's page
    {
      id: N2, target_key: 'fb:e1pipeline:pat.example@example.com', author: 'robin@example.com', body: 'Show the firm size first', created_at: ago(2 * 36e5),
      resolved: false, anchor_text: JSON.stringify({ sel: '', label: 'Pat Example', x: 0.1, y: 0.5 }),
    },
    // a spot that is not on the page any more: counted, listed, no pin
    {
      id: N3, target_key: 'fb:tasks', author: 'robin@example.com', body: 'Where did the old button go?', created_at: ago(3 * 36e5), resolved: false,
      anchor_text: JSON.stringify({ sel: '#nothing', label: 'A button that is gone', x: 0, y: 0 }),
    },
    { id: N4, target_key: 'fb:calls', author: 'erin@example.com', body: 'Done already', created_at: ago(4 * 36e5), resolved: true, resolved_by: 'Erin' },
    // an ordinary comment on a document is not feedback
    { id: '0b0b0b0b-0000-4000-8000-000000000005', target_key: 'e1:pat.example@example.com:anonymizer', author: 'erin@example.com', body: 'Ask about fees', created_at: ago(36e5), resolved: false },
  ]
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ dashboard_comments: seedNotes(), call_outputs: TASK_OUTPUTS, call_meta: TASK_METAS })
})

test('feedback mode: a click opens a note on that spot instead of running it; saved for the team, shown as a pin, resolved', async ({ page }) => {
  await signIn(page, '/calls')
  await expect(page.getByTestId('feedback-count')).toHaveText('3')
  await expect(button(page)).toHaveAttribute('title', 'Leave feedback on any part of the page')
  await button(page).click()
  await expect(button(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(bar(page)).toContainText('Feedback mode')
  await expect(bar(page)).toContainText('Click any part of the page to say what should change there.')
  await expect(bar(page).getByRole('button', { name: 'All feedback (3)' })).toBeVisible()

  // a call in the list does not open: the note box does
  const row = page.getByTestId('call-rows').getByRole('button').nth(1)
  await row.click()
  await expect(page).toHaveURL(/\/calls$/)
  const box = page.getByRole('dialog', { name: 'Leave feedback' })
  await expect(box).toContainText('Feedback on this')
  await box.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('fb-err')).toHaveText('Say what should change.')
  await box.getByRole('textbox', { name: 'What should change here?' }).press('Escape')
  await expect(box).toHaveCount(0)

  await page.getByRole('heading', { level: 1, name: 'Calls' }).click()
  await expect(box.locator('small')).toHaveText('Calls')
  await box.getByRole('textbox', { name: 'What should change here?' }).fill('Say how many calls are loaded here')
  await box.getByRole('button', { name: 'Save' }).click()
  await expect(toasts(page)).toContainText('Feedback saved for the team. It shows on Approvals too.')
  await expect.poll(async () => (await notes()).filter((r) => r.target_key === 'fb:calls' && !r.resolved).length).toBe(1)
  const saved = (await notes()).find((r) => r.target_key === 'fb:calls' && !r.resolved)!
  expect(saved).toMatchObject({ author: TEAM.email, body: 'Say how many calls are loaded here' })
  const a = JSON.parse(String(saved.anchor_text))
  expect(a.label).toBe('Calls')
  expect(typeof a.sel).toBe('string')
  expect(a.x).toBeGreaterThanOrEqual(0)
  expect(a.x).toBeLessThanOrEqual(1)
  await expect(pins(page)).toHaveCount(1)
  await expect(pins(page).first()).toHaveAttribute('aria-label', 'Feedback 1: Say how many calls are loaded here')
  await expect(bar(page)).toContainText('1 open here.')
  await expect(page.getByTestId('feedback-count')).toHaveText('4')

  // the pin opens the note, and Resolve closes it for the team
  await pins(page).first().click()
  const show = page.getByTestId('fb-show')
  await expect(show).toContainText('qa.teammate')
  await expect(show).toContainText('Say how many calls are loaded here')
  await show.getByRole('button', { name: 'Resolve' }).click()
  await expect(toasts(page)).toContainText('Resolved.')
  await expect.poll(async () => (await notes()).find((r) => r.id === saved.id)?.resolved).toBe(true)
  expect((await notes()).find((r) => r.id === saved.id)?.resolved_by).toBe(TEAM.name)
  await expect(pins(page)).toHaveCount(0)

  // Esc leaves the mode, and clicks run again
  await page.keyboard.press('Escape')
  await expect(bar(page)).toHaveCount(0)
  await expect(button(page)).toHaveAttribute('aria-pressed', 'false')
  await row.click()
  await expect(page).toHaveURL(/\/calls\?call=/)
})

test('a note left in the current dashboard finds its spot by what it says; one whose spot is gone has no pin', async ({ page }) => {
  await signIn(page, '/tasks')
  await button(page).click()
  await expect(bar(page)).toContainText('2 open here.')
  await expect(pins(page)).toHaveCount(1)
  // numbered oldest first among the page's open notes, as in the current dashboard (the one with no spot is 1)
  await expect(pins(page).first()).toHaveAttribute('aria-label', 'Feedback 2: Make the open count bigger')
  const box = await page.getByRole('heading', { name: 'Post-call to-dos' }).boundingBox()
  const pin = await pins(page).first().boundingBox()
  expect(Math.abs(pin!.x + 11 - (box!.x + box!.width / 2))).toBeLessThan(4)
  await bar(page).getByRole('button', { name: 'Done' }).click()
  await expect(pins(page)).toHaveCount(0)
})

test('All feedback: open notes by page, Go to it opens the page at the note; a lead’s page keys its notes by the lead', async ({ page }) => {
  await signIn(page, '/today')
  await button(page).click()
  await bar(page).getByRole('button', { name: 'All feedback (3)' }).click()
  const all = page.getByRole('dialog', { name: 'All feedback' })
  await expect(all.getByTestId('fb-group').locator('h3')).toHaveText(['Tasks 2 open', 'Pat Example · lead page 1 open'])
  await expect(all.getByTestId('fb-item').first()).toContainText('Make the open count bigger')
  await expect(all.getByTestId('fb-item').first()).toContainText('erin · ')
  await expect(all.getByTestId('fb-item').first()).toContainText('on “Post-call to-dos”')
  await all.getByText('Resolved (1)').click()
  await expect(all).toContainText('Done already')
  await expect(all).toContainText('resolved by Erin')

  await all.getByTestId('fb-group').filter({ hasText: 'Pat Example' }).getByRole('button', { name: 'Go to it' }).click()
  await expect(page).toHaveURL(new RegExp('/lead-pipeline/' + PAT + '$'))
  await expect(page.getByTestId('fb-show')).toContainText('Show the firm size first')
  await expect(bar(page)).toContainText('1 open here.')
  await page.getByTestId('fb-show').getByRole('button', { name: 'Close' }).click()

  // a note left here is the lead's
  await page.getByRole('heading', { level: 1 }).click()
  const box = page.getByRole('dialog', { name: 'Leave feedback' })
  await box.getByRole('textbox', { name: 'What should change here?' }).fill('Put the stage next to the name')
  await box.getByRole('textbox', { name: 'What should change here?' }).press('Control+Enter')
  await expect(toasts(page)).toContainText('Feedback saved for the team.')
  await expect.poll(async () => (await notes()).filter((r) => r.target_key === 'fb:e1pipeline:pat.example@example.com').length).toBe(2)
})

test('Approvals lists each open note as Feedback from <name>, with Go to it to its spot', async ({ page }) => {
  await signIn(page, '/approvals?tab=comments')
  const row = page.getByTestId('approval').filter({ hasText: 'Make the open count bigger' })
  await expect(row).toContainText('Feedback from erin')
  await expect(row).toContainText('Feedback')
  await expect(row).toContainText('Tasks')
  await expect(row.getByRole('link', { name: 'Go to it' })).toHaveAttribute('href', '/tasks?fb=' + N1)
  await expect(page.getByTestId('approval').filter({ hasText: 'Show the firm size first' }).getByRole('link', { name: 'Go to it' })).toHaveAttribute(
    'href',
    '/lead-pipeline/' + PAT + '?fb=' + N2,
  )
  await expect(page.getByTestId('approval').filter({ hasText: 'Ask about fees' })).toContainText('Comment from erin')
  await row.getByRole('link', { name: 'Go to it' }).click()
  await expect(page).toHaveURL(/\/tasks$/)
  await expect(page.getByTestId('fb-show')).toContainText('Make the open count bigger')
})
