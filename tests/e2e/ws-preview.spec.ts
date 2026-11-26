import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { TEAM, serveLogo, signIn, stubCalls, stubFathom, stubReset, stubRows, stubSeed } from './helpers'

// The client workspace's preview panel and folder suggestions for calls (the current dashboard's v153): an item's name
// opens a side panel (Preview, Details, Activity; Star, Rename and Move in its head; Open and View related call in its
// foot), every change made in the workspace is logged on the item for the team, "/" goes to the search, and the calls
// with no folder get Review suggestions (a folder each, with why, filed in one go). On the stand-in's made-up Pat
// Example, with calls, files and post-call actions made up here.

test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 900 } })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const EM = 'pat.example@example.com'
const ADV = '20000000-0000-4000-8000-0000000f1001'
const NOTES = '20000000-0000-4000-8000-0000000f1003'
const items = (page: Page) => page.getByTestId('ws-item')
const item = (page: Page, name: string) => items(page).filter({ hasText: name })
const panel = (page: Page) => page.getByTestId('ws-preview')
const pane = (page: Page) => panel(page).getByTestId('ws-pane')
const toasts = (page: Page) => page.getByTestId('toasts')
const F = () => fixtures() as unknown as Record<string, Record<string, unknown>[]>
type Ws = Record<string, { folders: { id: string; name: string }[]; items: Record<string, Record<string, unknown>> }>
const ws = async () =>
  (((await stubRows<{ key: string; value: Ws }>('ai_settings')).find((r) => r.key === 'catalyst_ws')?.value ?? {}) as Ws)[EM]?.items ?? {}

const TEAMI = { name: TEAM.name, email: TEAM.email }
const call = (id: number, title: string, start: string, mins: number) => ({
  id, title, start, end: new Date(Date.parse(start) + mins * 60_000).toISOString(), recorded_by: TEAMI,
  invitees: [TEAMI, { name: 'Pat Example', email: EM, external: true }], share_url: 'https://fathom.video/share/pat' + id + 'abcdefgh',
})
const CALLS = [
  call(9103, 'Catch-up with Pat', '2026-11-22T17:00:00Z', 15),
  call(9101, 'Proposal walkthrough', '2026-11-20T17:00:00Z', 27),
  call(9102, 'Intro chat', '2026-10-06T18:00:00Z', 22),
]

async function setup(o: { meta?: Record<string, unknown>[] } = {}) {
  await stubFathom({
    connected: true,
    hint: 'abcd',
    items: CALLS,
    transcripts: { 9101: [{ speaker: 'Pat Example', text: 'We want to start in January.' }, { speaker: 'QA Teammate', text: 'Then the scope comes first.' }] },
  })
  await stubSeed({
    lead_files: [
      ...F().lead_files,
      {
        id: ADV, lead_email: EM, file_name: 'Form-ADV.pdf', file_url: 'https://example.com/files/Form-ADV.pdf', file_path: 'pat/Form-ADV.pdf', stage: 'lead_research',
        source: 'upload', note: '', uploaded_by: 'QA Teammate', created_at: '2026-10-02T09:00:00Z', indexed_at: '2026-10-02T09:05:00Z', file_text: 'Made-up ADV text.',
      },
      {
        id: NOTES, lead_email: EM, file_name: 'Discovery call notes.txt', file_url: 'https://example.com/files/notes.txt', file_path: 'pat/notes.txt', stage: 'manual',
        source: 'upload', note: 'What Pat said about reporting', uploaded_by: 'QA Teammate', created_at: '2026-11-21T09:00:00Z', category: 'transcript',
        file_text: 'Pat: Month-end reports take us two days.\nQA Teammate: What would a pilot need?',
      },
    ],
    call_outputs: [
      ...F().call_outputs,
      {
        id: '40000000-0000-4000-8000-0000000ca0b1', call_id: '9101', call_title: 'Proposal walkthrough', meeting_type: 'proposal', status: 'done',
        summary: ['Walked through the proposed pilot', 'Pat asked for a January start'], tasks: [{ id: 't9', text: 'Send the revised scope', owner: 'Kaeser', done: false }],
        created_at: '2026-11-20T18:00:00Z', updated_at: '2026-11-20T18:00:00Z',
      },
    ],
    call_meta: [
      ...F().call_meta,
      { call_id: '9103', meeting_type: 'onboarding', created_at: '2026-11-22T18:00:00Z', updated_at: '2026-11-22T18:00:00Z', updated_by: TEAM.email },
      ...(o.meta ?? []),
    ],
  })
}

async function openFiles(page: Page) {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  await expect(item(page, 'Form-ADV.pdf')).toBeVisible()
}
async function callsView(page: Page) {
  await page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab', { name: /^Calls/ }).click()
  await expect(item(page, 'Proposal walkthrough')).toBeVisible()
}
async function openItem(page: Page, name: string) {
  await item(page, name).getByTestId('ws-open').click()
  await expect(panel(page)).toBeVisible()
}
const tab = (page: Page, name: string) => panel(page).getByRole('tab', { name }).click()

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('a file: its text, details and activity; rename, star, move and the description saved and logged for the team', async ({ page }) => {
  await setup()
  await openFiles(page)
  await expect(page.getByTestId('ws-open')).toHaveCount(8)
  await openItem(page, 'Form-ADV.pdf')
  await expect(panel(page)).toContainText('File preview')
  await expect(panel(page).getByRole('heading', { name: 'Form-ADV.pdf' })).toBeVisible()
  await expect(panel(page).getByTestId('ws-folder-chip')).toHaveText('Prospect research')
  await expect(panel(page).getByTestId('ws-by')).toHaveText('Uploaded by QA Teammate · Updated Oct 2, 2026')
  await expect(panel(page).getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
  await expect(pane(page)).toContainText('Made-up ADV text.')
  await expect(panel(page).getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', 'https://example.com/files/Form-ADV.pdf')

  await tab(page, 'Details')
  const det = panel(page).getByTestId('ws-details')
  await expect(det).toContainText('KindUploaded file')
  await expect(det).toContainText('FolderProspect research')
  await expect(det).toContainText('Uploaded byQA Teammate')
  await expect(det).toContainText('DateOct 2, 2026, 9:00 AM')
  await expect(det).toContainText('SourceNo: the stage runs leave it out')
  await panel(page).getByRole('button', { name: 'Save details' }).click()
  await expect(panel(page).getByTestId('ws-preview-msg')).toHaveText('Nothing changed.')
  await panel(page).getByLabel('Description').fill('Their Form ADV, for the assessment')
  await panel(page).getByRole('button', { name: 'Save details' }).click()
  await expect(panel(page).getByTestId('ws-preview-msg')).toHaveText('Saved.')
  expect((await ws())['f:' + ADV].desc).toBe('Their Form ADV, for the assessment')
  await expect(item(page, 'Form-ADV.pdf')).toContainText('Their Form ADV, for the assessment')

  // Rename: Esc cancels and keeps the panel, Enter saves
  await panel(page).getByRole('button', { name: 'Rename' }).click()
  const rn = panel(page).getByRole('textbox', { name: 'New name' })
  await expect(rn).toBeFocused()
  await rn.fill('Something else')
  await rn.press('Escape')
  await expect(rn).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
  await panel(page).getByRole('button', { name: 'Rename' }).click()
  await rn.fill('Form ADV (2026)')
  await rn.press('Enter')
  await expect(panel(page).getByTestId('ws-preview-msg')).toHaveText('Renamed.')
  await expect(panel(page).getByRole('heading', { name: 'Form ADV (2026)' })).toBeVisible()
  await expect(page.getByTestId('ws-open').filter({ hasText: 'Form ADV (2026)' })).toHaveCount(1)

  await panel(page).getByRole('button', { name: 'Star Form ADV (2026)', exact: true }).click()
  await expect(panel(page).getByRole('button', { name: 'Unstar Form ADV (2026)' })).toHaveAttribute('aria-pressed', 'true')
  await panel(page).getByLabel('Move Form ADV (2026) to').selectOption({ label: 'Assessment' })
  await expect(toasts(page)).toContainText('Moved to Assessment.')
  await expect(panel(page).getByTestId('ws-folder-chip')).toHaveText('Assessment')

  await tab(page, 'Activity')
  const act = panel(page).getByTestId('ws-activity')
  await expect(act.locator('li > span:not([aria-hidden])')).toHaveText([
    'Moved to Assessment',
    'Starred',
    'Renamed to “Form ADV (2026)”',
    'Description changed',
    'Text read for the Ask bot and the stage runs',
    'Uploaded by QA Teammate',
  ])
  await expect(act.locator('li').first()).toContainText('QA Teammate')
  await expect(pane(page)).toContainText('Renames, moves, stars and description changes are kept from Nov 26 on.')
  const it = (await ws())['f:' + ADV]
  expect(it).toMatchObject({ name: 'Form ADV (2026)', star: true, folder: 'assessment', desc: 'Their Form ADV, for the assessment' })
  const log = it.log as { at: string; by: string; what: string }[]
  expect(log.map((l) => l.what)).toEqual(['Description changed', 'Renamed to “Form ADV (2026)”', 'Starred', 'Moved to Assessment'])
  expect(log.every((l) => l.by === 'QA Teammate' && !Number.isNaN(Date.parse(l.at)))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})

test('the log keeps the last 30, and an upload made with its entry is not logged as a change', async ({ page }) => {
  const old = Array.from({ length: 30 }, (_, n) => ({ at: '2026-11-0' + ((n % 9) + 1) + 'T10:00:00Z', by: 'Erica', what: 'Starred' }))
  await setup()
  await stubSeed({ ai_settings: [...F().ai_settings, { key: 'catalyst_ws', value: { [EM]: { folders: [], items: { ['f:' + ADV]: { star: true, log: old } } } } }] })
  await openFiles(page)
  await item(page, 'Form-ADV.pdf').getByRole('button', { name: 'Unstar Form-ADV.pdf' }).click()
  await expect(item(page, 'Form-ADV.pdf').getByRole('button', { name: 'Star Form-ADV.pdf', exact: true })).toBeVisible()
  const log = (await ws())['f:' + ADV].log as { what: string }[]
  expect(log).toHaveLength(30)
  expect(log[29].what).toBe('Unstarred')
  // the Edit window with nothing changed saves nothing, so nothing is logged (its usual name is not a rename)
  await item(page, 'Form-ADV.pdf').getByRole('button', { name: 'Edit Form-ADV.pdf' }).click()
  await page.getByRole('dialog', { name: 'Form-ADV.pdf' }).getByRole('button', { name: 'Save' }).click()
  await expect(toasts(page)).toContainText('Nothing changed.')
  expect(((await ws())['f:' + ADV].log as unknown[]).length).toBe(30)
  expect((await ws())['f:' + ADV].name).toBeUndefined()

  // a new upload's entry, made with it, has no log
  await page.getByRole('button', { name: 'Upload file' }).click()
  const dlg = page.getByRole('dialog', { name: 'Add a client file' })
  await dlg.getByLabel('A call transcript, pasted').check()
  await dlg.getByRole('textbox', { name: 'Transcript', exact: true }).fill('Pat: We can start in January if the price holds.\nUs: It holds.')
  await dlg.getByLabel('Document name').fill('Pricing call')
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(toasts(page)).toContainText('Transcript added')
  const row = (await stubRows<Record<string, unknown>>('lead_files')).find((r) => r.file_name === 'Pricing call.txt')!
  expect((await ws())['f:' + row.id].log).toBeUndefined()
})

test('a document shows its own text safely, with its formats; View related call opens the newest call in its folder', async ({ page }) => {
  await setup({ meta: [{ call_id: '9102', lead_email: EM, lead_stage: 'research', created_at: '2026-10-07T10:00:00Z', updated_at: '2026-10-07T10:00:00Z', updated_by: TEAM.email }] })
  await openFiles(page)
  await openItem(page, 'Pre-meeting prospect brief')
  await expect(panel(page).getByTestId('ws-by')).toHaveText('AI generated · Updated Oct 5, 2026')
  await expect(pane(page).getByRole('heading', { name: 'Who they are' })).toBeVisible()
  await expect(pane(page).getByRole('listitem').filter({ hasText: 'Founded by Pat Example' })).toBeVisible()
  await expect(pane(page).getByTestId('ws-formats').getByRole('link', { name: 'Google Doc' })).toHaveAttribute('href', /docPatResearch/)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await expect(panel(page).getByRole('link', { name: 'Open Google Doc' })).toBeVisible()
  await panel(page).getByRole('button', { name: 'View related call' }).click()
  await expect(panel(page)).toContainText('Call preview')
  await expect(panel(page).getByRole('heading', { name: 'Intro chat' })).toBeVisible()
  await tab(page, 'Details')
  await expect(panel(page).getByTestId('ws-details')).toContainText('FiledFiled under Prospect research')
  await tab(page, 'Activity')
  await expect(panel(page).getByTestId('ws-activity')).toContainText('Filed under Prospect research')
  await page.keyboard.press('Escape')

  // a document with no saved text says so
  await openItem(page, 'Assessment report')
  await expect(pane(page)).toContainText('No text of this document is kept in the dashboard. Open it from its format above.')
  await page.keyboard.press('Escape')

  // a transcript: its text; the source switch saved and logged
  await openItem(page, 'Discovery call notes.txt')
  await expect(pane(page)).toContainText('Month-end reports take us two days.')
  await expect(panel(page).getByRole('link', { name: 'Open the transcript file' })).toBeVisible()
  await tab(page, 'Details')
  await expect(panel(page).getByTestId('ws-details')).toContainText('SourceYes')
  const src = panel(page).getByLabel('Use it as a source: this client’s stage runs read it')
  await expect(src).toBeChecked()
  await src.uncheck()
  await panel(page).getByRole('button', { name: 'Save details' }).click()
  await expect(panel(page).getByTestId('ws-preview-msg')).toHaveText('Saved.')
  const t = (await ws())['f:' + NOTES]
  expect(t.source).toBe(false)
  expect((t.log as { what: string }[]).map((l) => l.what)).toEqual(['No longer a source for the stage runs'])
})

test('a call: its summary and next steps, the transcript only when asked, Fathom and Calls in its foot', async ({ page }) => {
  await setup()
  await openFiles(page)
  await callsView(page)
  await openItem(page, 'Proposal walkthrough')
  await expect(panel(page).getByTestId('ws-by')).toHaveText('27 min · Pat Example · Fathom · Nov 20, 2026')
  await expect(pane(page)).toContainText('Walked through the proposed pilot')
  await expect(pane(page)).toContainText('Send the revised scope (Kaeser)')
  expect((await stubCalls()).some((c) => c.body?.action === 'transcript')).toBe(false)
  await pane(page).getByRole('button', { name: 'Show the transcript' }).click()
  await expect(pane(page).getByTestId('ws-transcript')).toContainText('Pat Example: We want to start in January.')
  expect((await stubCalls()).some((c) => c.body?.action === 'transcript' && String(c.body.id) === '9101')).toBe(true)
  await expect(panel(page).getByRole('link', { name: 'Open in Fathom' })).toHaveAttribute('href', /fathom\.video\/share\/pat9101/)
  await expect(panel(page).getByRole('link', { name: 'Open on Calls' })).toHaveAttribute('href', '/calls?call=9101&seg=post')
  await tab(page, 'Details')
  const det = panel(page).getByTestId('ws-details')
  await expect(det).toContainText('PeoplePat Example')
  await expect(det).toContainText('Length27 min')
  await expect(det).toContainText('Call typeProposal')
  await expect(det).toContainText('FiledNot filed under a stage yet')
  await tab(page, 'Activity')
  await expect(panel(page).getByTestId('ws-activity').locator('li > span:not([aria-hidden])')).toHaveText(['Post-call actions written', 'Recorded on Fathom'])
  // the tabs answer the arrow keys
  await panel(page).getByRole('tab', { name: 'Activity' }).press('ArrowRight')
  await expect(panel(page).getByRole('tab', { name: 'Preview' })).toBeFocused()
  await expect(panel(page).getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
})

test('calls with no folder: Review suggestions, a folder each with why, filed in one go', async ({ page }) => {
  await setup()
  await openFiles(page)
  await callsView(page)
  const note = page.getByTestId('ws-note')
  await expect(note).toContainText('4 calls need a folder.')
  await expect(note).toContainText('A folder is suggested for each one, for you to check.')
  await note.getByRole('button', { name: 'Review suggestions →' }).click()
  const dlg = page.getByRole('dialog', { name: '4 calls need a folder' })
  const row = (name: string) => dlg.getByTestId('ws-suggestion').filter({ hasText: name })
  await expect(dlg.getByTestId('ws-suggestion')).toHaveCount(4)
  await expect(row('Proposal walkthrough').getByRole('combobox')).toHaveValue('proposal')
  await expect(row('Proposal walkthrough').getByTestId('ws-why')).toHaveText('Its title says “Proposal”')
  await expect(row('Catch-up with Pat').getByRole('combobox')).toHaveValue('onboarding')
  await expect(row('Catch-up with Pat').getByTestId('ws-why')).toHaveText('Its call type is Onboarding: the Onboarding stage’s meeting')
  await expect(row('Intro chat').getByRole('combobox')).toHaveValue('research')
  await expect(row('Intro chat').getByTestId('ws-why')).toHaveText('Held after the Pre-meeting prospect brief was written (Oct 5, 2026)')
  await expect(row('Discovery call notes.txt').getByRole('combobox')).toHaveValue('proposal')
  await expect(row('Discovery call notes.txt').getByTestId('ws-why')).toHaveText('Held after the Proposal presentation was written (Oct 16, 2026)')
  await expect(row('Discovery call notes.txt')).toContainText('Nov 21, 2026 · Uploaded')
  await expect(row('Intro chat')).toContainText('Oct 6, 2026 · 22 min · Pat Example · Fathom')
  await expect(dlg.getByRole('checkbox', { name: /^File / })).toHaveCount(4)
  for (const c of await dlg.getByRole('checkbox', { name: /^File / }).all()) await expect(c).toBeChecked()
  await expect(dlg.getByRole('button', { name: 'File 4 calls' })).toBeEnabled()

  await row('Catch-up with Pat').getByRole('checkbox').uncheck()
  await row('Intro chat').getByRole('combobox').selectOption({ label: 'Kickoff call' })
  await row('Discovery call notes.txt').getByRole('combobox').selectOption('')
  await expect(row('Discovery call notes.txt').getByRole('checkbox')).not.toBeChecked()
  await expect(dlg.getByRole('button', { name: 'File 2 calls' })).toBeEnabled()
  await dlg.getByRole('button', { name: 'File 2 calls' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Filed 2 calls.')

  const meta = async (id: string) => (await stubRows<Record<string, unknown>>('call_meta')).find((r) => r.call_id === id) ?? {}
  expect(await meta('9101')).toMatchObject({ lead_email: EM, lead_stage: 'proposal', updated_by: TEAM.email })
  expect(await meta('9102')).toMatchObject({ lead_email: EM, lead_stage: 'consultation' })
  expect((await meta('9103')).lead_stage).toBeFalsy()
  const w = await ws()
  expect(w['c:9101']).toMatchObject({ folder: 'proposal', stage: 'proposal' })
  expect(w['c:9102']).toMatchObject({ folder: 'consultation', stage: 'consultation' })
  expect((w['c:9101'].log as { what: string }[]).map((l) => l.what)).toEqual(['Moved to Proposal'])
  expect(w['c:9103']).toBeUndefined()
  await expect(note).toContainText('2 calls need a folder.')
})

test('filing stops halfway: the ones filed are kept, and it says how many went', async ({ page }) => {
  await setup()
  await stubSeed({ __refuse: [{ table: 'call_meta', col: 'call_id', value: '9101' }] })
  await openFiles(page)
  await callsView(page)
  await page.getByTestId('ws-note').getByRole('button', { name: 'Review suggestions →' }).click()
  const dlg = page.getByRole('dialog', { name: '4 calls need a folder' })
  await dlg.getByRole('button', { name: 'File 4 calls' }).click()
  await expect(dlg.getByTestId('ws-sg-msg')).toHaveText('Filed 2 of 4, then it stopped: stub: refused')
  const w = await ws()
  expect(w['c:9103']).toMatchObject({ folder: 'onboarding', stage: 'onboarding' })
  expect(w['f:' + NOTES]).toMatchObject({ folder: 'proposal' })
  expect(w['c:9101']).toBeUndefined()
  expect(w['c:9102']).toBeUndefined()
  // the two filed are unticked: filing again sends only the others
  await expect(dlg.getByRole('button', { name: 'File 2 calls' })).toBeEnabled()
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('ws-note')).toContainText('2 calls need a folder.')
})

test('"/" puts the cursor in the workspace search, but not while typing or with a window open', async ({ page }) => {
  await setup()
  await openFiles(page)
  const q = page.getByRole('searchbox', { name: 'Search' })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('/')
  await expect(q).toBeFocused()
  await expect(q).toHaveValue('')
  await q.fill('a/b')
  await expect(q).toHaveValue('a/b')
  await q.fill('')
  await openItem(page, 'Form-ADV.pdf')
  await page.keyboard.press('/')
  await expect(q).not.toBeFocused()
})

test('on a phone the panel and the suggestions fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup()
  await openFiles(page)
  await openItem(page, 'Form-ADV.pdf')
  for (const t of ['Details', 'Activity', 'Preview']) {
    await tab(page, t)
    expect(await panel(page).evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(1)
  }
  const box = await panel(page).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(391)
  await page.keyboard.press('Escape')
  await callsView(page)
  await page.getByTestId('ws-note').getByRole('button', { name: 'Review suggestions →' }).click()
  const dlg = page.getByRole('dialog', { name: /calls? needs? a folder/ })
  await expect(dlg).toBeVisible()
  const b = await dlg.boundingBox()
  expect(b!.x).toBeGreaterThanOrEqual(-1)
  expect(b!.x + b!.width).toBeLessThanOrEqual(391)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
