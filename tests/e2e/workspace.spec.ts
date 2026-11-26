import { type Page, expect, test } from '@playwright/test'
import path from 'node:path'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { STUB, TEAM, serveLogo, signIn, stubCalls, stubReset, stubRows, stubSeed } from './helpers'

// The client workspace on a lead's Files tab (the current dashboard's v145, with v146's fixes): Files and Calls, the
// folders, an upload (a file or a pasted transcript, with a name, a folder, a description and whether the stage runs
// read it), star, move, edit and delete, a call moved to a stage folder filed under that stage, and the uploads ticked
// as a source in a stage run's notes. On the stand-in's made-up Pat Example.

test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 900 } })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const MIA = leadId({ prospect_name: 'Mia Caps', email: 'Mia.Caps@Example.com' })
const CUSTOM = '/webhook/e1-custom-run-erica'
const toasts = (page: Page) => page.getByTestId('toasts')
const items = (page: Page) => page.getByTestId('ws-item')
const item = (page: Page, name: string) => items(page).filter({ hasText: name })
const stored = async () => (await fetch(STUB + '/__storage')).json() as Promise<Record<string, { type: string; size: number }>>
const posts = async (p: string) => (await stubCalls()).filter((c) => c.method === 'POST' && c.path === p)
const F = () => fixtures() as unknown as { e1_leads: Record<string, unknown>[]; ai_settings: Record<string, unknown>[] }
type Ws = Record<string, { folders: { id: string; name: string }[]; items: Record<string, Record<string, unknown>> }>
// an item without its change log (v153), and what the log says
const bare = (m: Record<string, unknown> | undefined) => {
  const { log, ...rest } = m ?? {}
  void log
  return rest
}
const said = (m: Record<string, unknown> | undefined) => ((m?.log ?? []) as { what: string; by: string }[]).map((l) => l.what)
async function ws(): Promise<Ws> {
  return ((await stubRows<{ key: string; value: Ws }>('ai_settings')).find((r) => r.key === 'catalyst_ws')?.value ?? {}) as Ws
}
async function file(name: string) {
  return (await stubRows<Record<string, unknown>>('lead_files')).find((r) => r.file_name === name)
}
async function openUpload(page: Page) {
  await page.getByRole('button', { name: 'Upload file' }).click()
  return page.getByRole('dialog', { name: 'Add a client file' })
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('a file: stored under the lead with its name, folder and description, read for the Ask bot, a copy to HubSpot', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  await expect(page.getByRole('navigation', { name: 'Client folders' })).toContainText('All content6')
  const cards = page.getByTestId('stage-folders').getByRole('button')
  await expect(cards.filter({ hasText: 'Current' })).toContainText('Proposal')
  const dlg = await openUpload(page)
  await dlg.locator('input[type=file]').setInputFiles({ name: 'call notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Paperwork is the bottleneck.') })
  await expect(dlg.getByLabel('Document name')).toHaveValue('call notes')
  // the folder starts on the lead's stage
  await expect(dlg.getByLabel('Folder')).toHaveValue('proposal')
  await dlg.getByLabel('Folder').selectOption({ label: 'Assessment' })
  await dlg.getByLabel('Description').fill('From the second call')
  await expect(dlg.getByLabel('Use it as a source: this client’s stage runs read it')).toBeChecked()
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('File added to Assessment.')

  const row = (await file('call notes.txt'))!
  expect(row).toMatchObject({ lead_email: 'pat.example@example.com', stage: 'anonymizer', note: 'From the second call', source: 'upload', uploaded_by: 'QA Teammate', category: null })
  expect(row.file_text).toBe('Paperwork is the bottleneck.')
  expect(String(row.file_path)).toMatch(/^pat\.example@example\.com\/\d+-call_notes\.txt$/)
  expect(await stored()).toEqual({ [String(row.file_path)]: { type: 'text/plain', size: 28 } })
  expect((await posts('/webhook/file-ingest')).map((c) => c.body.fileId)).toEqual([row.id])
  await expect.poll(async () => (await posts('/webhook/hubspot-file-sync')).length).toBe(1)
  expect((await ws())['pat.example@example.com'].items['f:' + row.id]).toEqual({ name: 'call notes', folder: 'assessment', desc: 'From the second call', source: true })

  const it = item(page, 'call notes')
  await expect(it).toContainText('TXT')
  await expect(it).toContainText('Source')
  await expect(it).toContainText('From the second call')
  await expect(it).toContainText('Assessment')
  await page.getByRole('navigation', { name: 'Client folders' }).getByRole('button', { name: /^Assessment/ }).click()
  await expect(items(page).locator(':scope > div > b')).toHaveText(['call notes', 'Assessment report'])
})

test('a pasted transcript: kept with its text, in Calls as Uploaded, and a stage run reads it', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  const dlg = await openUpload(page)
  await dlg.getByLabel('A call transcript, pasted').check()
  await dlg.getByRole('textbox', { name: 'Transcript', exact: true }).fill('Too short')
  await dlg.getByLabel('Document name').fill('Pricing call')
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(dlg.getByTestId('ws-msg')).toHaveText('Paste the transcript first (a few lines at least).')
  await dlg.getByRole('textbox', { name: 'Transcript', exact: true }).fill('Pat: We can start in January if the price holds.\nUs: It holds.')
  await dlg.getByLabel('Folder').selectOption('')
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(toasts(page)).toContainText('Transcript added.')
  const row = (await file('Pricing call.txt'))!
  expect(row).toMatchObject({ category: 'transcript', stage: 'manual', file_text: 'Pat: We can start in January if the price holds.\nUs: It holds.' })
  expect(row.indexed_at).toBeTruthy()
  expect(await posts('/webhook/file-ingest')).toHaveLength(0)

  await page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab', { name: /^Calls/ }).click()
  await expect(item(page, 'Pricing call')).toContainText('Uploaded by QA Teammate')
  await expect(item(page, 'Pricing call')).toContainText('Source')
  // Pat's Fathom call was set aside and the transcript has no folder: both need one
  await expect(page.getByText('2 calls need a folder.')).toBeVisible()

  // the proposal's run reads it, after the transcripts
  await page.getByRole('tab', { name: '✓ Proposal' }).click()
  await page.getByTestId('doc-card').getByTestId('run-report').click()
  const q = page.getByRole('dialog', { name: /Run the proposal presentation/ })
  await expect(q.getByTestId('reads')).toContainText('From the client workspace: Pricing call')
  await q.getByRole('button', { name: 'Run it again' }).click()
  await expect(toasts(page)).toContainText('Started.')
  const sent = String((await posts(CUSTOM))[0].body.transcript)
  expect(sent).toContain('FILES AND TRANSCRIPTS ADDED TO THE CLIENT WORKSPACE\nTranscript: Pricing call\nPat: We can start in January if the price holds.')
})

test('star, a folder of the team’s own, move, edit; a folder gone is To organize (v146)', async ({ page }) => {
  await stubSeed({
    ai_settings: [
      ...F().ai_settings,
      { key: 'catalyst_ws', value: { 'pat.example@example.com': { folders: [], items: { 'a:lead_research': { folder: 'wf-gone01', desc: 'In a folder deleted since' } } } } },
    ],
  })
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  const nav = page.getByRole('navigation', { name: 'Client folders' })
  await nav.getByRole('button', { name: /^To organize/ }).click()
  await expect(items(page).locator(':scope > div > b')).toHaveText(['Follow-up guide', 'Intake notes.docx', 'Pre-meeting prospect brief'])

  await item(page, 'Intake notes.docx').getByRole('button', { name: 'Star Intake notes.docx' }).click()
  await expect(item(page, 'Intake notes.docx').getByRole('button', { name: 'Unstar Intake notes.docx' })).toBeVisible()
  await nav.getByRole('button', { name: /^Starred/ }).click()
  await expect(items(page)).toHaveCount(1)

  await page.getByRole('button', { name: 'New folder' }).first().click()
  const nf = page.getByRole('dialog', { name: 'New folder' })
  await nf.getByLabel('Folder name').fill('proposal')
  await nf.getByRole('button', { name: 'Add folder' }).click()
  await expect(nf.getByTestId('ws-msg')).toHaveText('There is already a folder called proposal.')
  await nf.getByLabel('Folder name').fill('Contracts')
  await nf.getByRole('button', { name: 'Add folder' }).click()
  await expect(toasts(page)).toContainText('Folder added.')
  const id = (await ws())['pat.example@example.com'].folders[0].id
  expect(id).toMatch(/^wf-[a-z0-9]{6}$/)
  await expect(nav.getByRole('button', { name: /^Contracts/ })).toHaveAttribute('aria-pressed', 'true')

  await nav.getByRole('button', { name: /^All content/ }).click()
  await item(page, 'Follow-up guide').getByLabel('Folder for Follow-up guide').selectOption({ label: 'Contracts' })
  await expect(toasts(page)).toContainText('Moved to Contracts.')
  await expect(item(page, 'Follow-up guide')).toContainText('Contracts')

  await item(page, 'Intake notes.docx').getByRole('button', { name: 'Edit Intake notes.docx' }).click()
  const ed = page.getByRole('dialog', { name: 'Intake notes.docx' })
  await expect(ed.getByLabel('Description')).toHaveValue('From the first call')
  await ed.getByLabel('Name').fill('Intake notes')
  await ed.getByLabel('Folder').selectOption({ label: 'Contracts' })
  await ed.getByLabel('Description').fill('The first call, typed up')
  await ed.getByLabel('Use it as a source: this client’s stage runs read it').check()
  await ed.getByRole('button', { name: 'Save' }).click()
  await expect(toasts(page)).toContainText('Saved.')
  const meta = (await ws())['pat.example@example.com']
  expect(bare(meta.items['f:20000000-0000-4000-8000-000000000001'])).toEqual({ star: true, name: 'Intake notes', folder: id, desc: 'The first call, typed up', source: true })
  expect(said(meta.items['f:20000000-0000-4000-8000-000000000001'])).toEqual([
    'Starred',
    'Renamed to “Intake notes”',
    'Moved to Contracts',
    'Description changed',
    'Marked as a source for the stage runs',
  ])
  expect(bare(meta.items['a:discovery_call'])).toEqual({ folder: id })
  expect(said(meta.items['a:discovery_call'])).toEqual(['Moved to Contracts'])
  await nav.getByRole('button', { name: /^Contracts/ }).click()
  await expect(items(page).locator(':scope > div > b')).toHaveText(['Follow-up guide', 'Intake notes'])
  await expect(item(page, 'Intake notes')).toContainText('Source')
  // a document of an agent has no Delete
  await item(page, 'Follow-up guide').getByRole('button', { name: 'Edit Follow-up guide' }).click()
  await expect(page.getByRole('dialog', { name: 'Follow-up guide' }).getByRole('button', { name: 'Delete' })).toHaveCount(0)
})

test('a call moved to a stage folder is filed under that stage; moved to a team folder after, it stays there (v146)', async ({ page }) => {
  await stubSeed({ ai_settings: [...F().ai_settings, { key: 'catalyst_ws', value: { 'pat.example@example.com': { folders: [{ id: 'wf-deals01', name: 'Deals' }], items: {} } } }] })
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  await page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab', { name: /^Calls/ }).click()
  const call = item(page, 'Catch-up with Pat')
  await expect(call).toContainText('20 min · Pat Example · Fathom')
  await call.getByLabel('Folder for Catch-up with Pat').selectOption({ label: 'Proposal' })
  await expect(toasts(page)).toContainText('Moved to Proposal.')
  await expect.poll(async () => (await stubRows<Record<string, unknown>>('call_meta')).find((r) => r.call_id === '9004')?.lead_stage).toBe('proposal')
  expect(bare((await ws())['pat.example@example.com'].items['c:9004'])).toEqual({ folder: 'proposal', stage: 'proposal' })

  await item(page, 'Catch-up with Pat').getByRole('button', { name: 'Edit Catch-up with Pat' }).click()
  const ed = page.getByRole('dialog', { name: 'Catch-up with Pat' })
  await expect(ed.getByLabel('Use it as a source: this client’s stage runs read it')).toHaveCount(0)
  await ed.getByLabel('Name').fill('Catch-up, Oct')
  await ed.getByLabel('Folder').selectOption({ label: 'Deals' })
  await ed.getByRole('button', { name: 'Save' }).click()
  await expect(toasts(page)).toContainText('Saved.')
  // only what the window changed is saved (v153): the name and the folder, not the description left as it was
  expect(bare((await ws())['pat.example@example.com'].items['c:9004'])).toEqual({ folder: 'wf-deals01', stage: 'proposal', name: 'Catch-up, Oct' })
  expect(said((await ws())['pat.example@example.com'].items['c:9004'])).toEqual(['Moved to Proposal', 'Renamed to “Catch-up, Oct”', 'Moved to Deals'])
  await page.reload()
  await page.getByRole('tablist', { name: 'Workspace' }).getByRole('tab', { name: /^Calls/ }).click()
  await expect(item(page, 'Catch-up, Oct')).toContainText('Deals')
  await expect(item(page, 'Catch-up, Oct').getByRole('link', { name: 'Open Catch-up, Oct on Calls' })).toHaveAttribute('href', '/calls?call=9004&seg=post')
})

test('delete: asked first, the file goes before its entry; the checks before anything is sent; a Word file read here', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  let dlg = await openUpload(page)
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(dlg.getByTestId('ws-msg')).toHaveText('Choose a file first.')
  await dlg.locator('input[type=file]').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(25 * 1024 * 1024 + 1) })
  await dlg.getByLabel('Document name').fill('')
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(dlg.getByTestId('ws-msg')).toHaveText('Give it a name.')
  await dlg.getByLabel('Document name').fill('Huge')
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(dlg.getByTestId('ws-msg')).toHaveText('Keep uploads under 25 MB.')
  expect((await stubCalls()).filter((c) => c.path.startsWith('/storage/'))).toHaveLength(0)
  await fetch(STUB + '/__storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deny: true }) })
  await dlg.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(dlg.getByTestId('ws-msg')).toHaveText('Storage turned the upload away: new row violates row-level security policy.')
  await fetch(STUB + '/__storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deny: false }) })
  await dlg.getByRole('button', { name: 'Cancel' }).click()

  dlg = await openUpload(page)
  await dlg.locator('input[type=file]').setInputFiles(path.resolve('tests/fixtures/meeting-notes.docx'))
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(toasts(page)).toContainText('File added to Proposal.')
  const doc = (await file('meeting-notes.docx'))!
  expect(doc.stage).toBe('growth_plan')
  expect(String(doc.file_text)).toContain('They want one workflow automated first: client intake.')
  expect(await posts('/webhook/file-ingest')).toHaveLength(0)
  expect((await ws())['pat.example@example.com'].items['f:' + doc.id]).toMatchObject({ name: 'meeting-notes', folder: 'proposal' })

  await item(page, 'meeting-notes').getByRole('button', { name: 'Edit meeting-notes' }).click()
  const ed = page.getByRole('dialog', { name: 'meeting-notes' })
  page.once('dialog', (d) => d.dismiss())
  await ed.getByRole('button', { name: 'Delete' }).click()
  expect(await file('meeting-notes.docx')).toBeTruthy()
  page.once('dialog', (d) => {
    expect(d.message()).toBe('Delete meeting-notes? The file is removed for the whole team.')
    void d.accept()
  })
  await ed.getByRole('button', { name: 'Delete' }).click()
  await expect(toasts(page)).toContainText('meeting-notes deleted.')
  await expect(item(page, 'meeting-notes')).toHaveCount(0)
  expect(await file('meeting-notes.docx')).toBeUndefined()
  expect(await stored()).toEqual({})
  expect((await ws())['pat.example@example.com'].items['f:' + doc.id]).toBeUndefined()
})

test('a lead whose email has capitals: the upload is kept under that email, and its runs read it (v146)', async ({ page }) => {
  await stubSeed({
    e1_leads: [
      ...F().e1_leads,
      { email: 'Mia.Caps@Example.com', prospect_name: 'Mia Caps', company_name: 'Caps Co', stage: 'onboarding', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-20T10:00:00Z' },
    ],
  })
  await signIn(page, `/lead-pipeline/${MIA}?tab=files`)
  const dlg = await openUpload(page)
  await dlg.getByLabel('A call transcript, pasted').check()
  await dlg.getByRole('textbox', { name: 'Transcript', exact: true }).fill('Mia: the onboarding should start with the two advisors.')
  await dlg.getByLabel('Document name').fill('Kickoff notes')
  await dlg.getByRole('button', { name: 'Add file' }).click()
  await expect(toasts(page)).toContainText('Transcript added to Onboarding.')
  const row = (await file('Kickoff notes.txt'))!
  expect(row.lead_email).toBe('Mia.Caps@Example.com')
  expect(String(row.file_path)).toMatch(/^Mia\.Caps@Example\.com\//)
  expect(Object.keys(await ws())).toContain('mia.caps@example.com')
  await expect(item(page, 'Kickoff notes')).toBeVisible()

  // the onboarding plan's run reads it (it has nothing else to work from)
  await page.getByRole('tab', { name: 'Onboarding plan' }).click()
  await page.getByTestId('run-report').click()
  const q = page.getByRole('dialog', { name: /Run the onboarding plan/ })
  await expect(q.getByTestId('reads')).toContainText('From the client workspace: Kickoff notes')
  await q.getByRole('button', { name: 'Run it' }).click()
  await expect(toasts(page)).toContainText('Started.')
  const sent = (await posts('/webhook/catalyst-meeting-prep'))[0].body
  expect(String(sent.transcript)).toContain('FILES AND TRANSCRIPTS ADDED TO THE CLIENT WORKSPACE\nTranscript: Kickoff notes\nMia: the onboarding should start')
  expect(sent).toMatchObject({ stage: 'onboarding', leadEmail: 'Mia.Caps@Example.com' })
  expect(TEAM.email).toBeTruthy()
})
