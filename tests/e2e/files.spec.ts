import { type Page, expect, test } from '@playwright/test'
import path from 'node:path'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { STUB, serveLogo, signIn, stubCalls, stubReset, stubRows } from './helpers'

// A lead's Files tab: an upload goes from the browser straight into Storage at an address signed as the teammate,
// then its row, a copy to HubSpot and its text for the Ask bot (a Word file read here, anything else by Lead File Text
// Ingest); Index and Re-index; delete, asked first. On the stand-in's made-up Pat Example.

test.use({ timezoneId: 'UTC' })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const toasts = (page: Page) => page.getByTestId('toasts')
const upload = (page: Page) => page.getByTestId('upload')
const fileRow = (page: Page, name: string) => page.getByTestId('file').filter({ hasText: name })
const stored = async () => (await fetch(STUB + '/__storage')).json() as Promise<Record<string, { type: string; size: number }>>
const posts = async (p: string) => (await stubCalls()).filter((c) => c.method === 'POST' && c.path === p)

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('a text file: stored under the lead, its row, read for the Ask bot, and a copy sent to HubSpot', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  const form = upload(page)
  await form.getByLabel('File to upload').setInputFiles({ name: 'call notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Paperwork is the bottleneck.') })
  await form.getByLabel('Stage').selectOption({ label: 'Assessment' })
  await form.getByLabel('Note').fill('From the second call')
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toasts(page)).toContainText('Uploaded call notes.txt. The Ask bot can read it now.')

  const rows = (await stubRows<Record<string, unknown>>('lead_files')).filter((r) => r.file_name === 'call notes.txt')
  expect(rows).toHaveLength(1)
  const row = rows[0]
  expect(row).toMatchObject({ lead_email: 'pat.example@example.com', stage: 'anonymizer', note: 'From the second call', source: 'upload', uploaded_by: 'QA Teammate' })
  expect(String(row.file_path)).toMatch(/^pat\.example@example\.com\/\d+-call_notes\.txt$/)
  expect(row.file_url).toBe(STUB + '/storage/v1/object/public/lead-files/' + row.file_path)
  expect(row.file_text).toBe('Paperwork is the bottleneck.')
  expect(row.indexed_at).toBeTruthy()
  expect(await stored()).toEqual({ [String(row.file_path)]: { type: 'text/plain', size: 28 } })

  // the upload went to the address the server signed, never with the teammate's token in the browser
  const put = (await stubCalls()).find((c) => c.method === 'PUT' && c.path.startsWith('/storage/v1/object/upload/sign/lead-files/'))!
  expect(put.query).toMatch(/^\?token=/)
  const ingest = await posts('/webhook/file-ingest')
  expect(ingest).toHaveLength(1)
  expect(ingest[0].body).toMatchObject({ fileId: row.id, fileUrl: row.file_url, fileName: 'call notes.txt', table: 'lead_files' })
  await expect.poll(async () => (await posts('/webhook/hubspot-file-sync')).length).toBe(1)
  expect((await posts('/webhook/hubspot-file-sync'))[0].body).toMatchObject({
    fileUrl: row.file_url, fileName: 'call notes.txt', leadEmail: 'pat.example@example.com', note: 'From the second call', uploadedBy: 'QA Teammate',
  })

  // in the list, under its stage, readable
  const item = fileRow(page, 'call notes.txt')
  await expect(item).toContainText('upload · QA Teammate')
  await expect(item).toContainText('✦ searchable')
  await expect(item.getByRole('button', { name: 'Re-index' })).toBeVisible()
  await expect(page.locator('#files ~ div p').filter({ hasText: /^📁 Assessment/ })).toHaveText('📁 Assessment 2')
  await expect(form.getByLabel('Note')).toHaveValue('')
})

test('a Word file is read here; a file with nothing to read says so', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  const form = upload(page)
  await form.getByLabel('File to upload').setInputFiles(path.resolve('tests/fixtures/meeting-notes.docx'))
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toasts(page)).toContainText('Uploaded meeting-notes.docx. The Ask bot can read it now.')
  const doc = (await stubRows<Record<string, unknown>>('lead_files')).find((r) => r.file_name === 'meeting-notes.docx')!
  expect(doc.stage).toBe('manual')
  expect(String(doc.file_text)).toContain('They want one workflow automated first: client intake.')
  expect(await posts('/webhook/file-ingest')).toHaveLength(0)

  await form.getByLabel('File to upload').setInputFiles({ name: 'scan of the contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 image only') })
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toasts(page)).toContainText(
    'Uploaded scan of the contract.pdf, but it could not be read for the Ask bot: No readable text found in this file. PDFs, Word (.docx), txt, csv, md and html work; scanned images need OCR or a PDF export first. Press Index to try again.',
  )
  const scan = (await stubRows<Record<string, unknown>>('lead_files')).find((r) => r.file_name === 'scan of the contract.pdf')!
  expect(scan.file_text).toBeNull()
})

test('the checks before anything is sent, and Storage turning the upload away', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  const form = upload(page)
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText('Choose a file first.')
  await form.getByLabel('File to upload').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(25 * 1024 * 1024 + 1) })
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText('Keep uploads under 25 MB.')
  expect((await stubCalls()).filter((c) => c.path.startsWith('/storage/'))).toHaveLength(0)

  await fetch(STUB + '/__storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deny: true }) })
  await form.getByLabel('File to upload').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(form.getByRole('alert')).toHaveText('Storage turned the upload away: new row violates row-level security policy.')
  expect((await stubRows<Record<string, unknown>>('lead_files')).map((r) => r.file_name)).toEqual(['Intake notes.docx'])
  expect(await stored()).toEqual({})
})

test('Index and Re-index; a file kept outside the lead files’ storage is not fetched', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  // an upload whose reading failed: Index reads it
  const form = upload(page)
  await form.getByLabel('File to upload').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\nIntake first.') })
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toasts(page)).toContainText('Uploaded notes.md.')
  const item = fileRow(page, 'notes.md')
  await item.getByRole('button', { name: 'Re-index' }).click()
  // the upload's own toast may still be up: wait for the second reading itself
  await expect.poll(async () => (await posts('/webhook/file-ingest')).length).toBe(2)
  await expect(item.getByRole('button', { name: 'Re-index' })).toBeEnabled()

  // the fixture's Word file is a link elsewhere: the server never fetches it
  await fileRow(page, 'Intake notes.docx').getByRole('button', { name: 'Re-index' }).click()
  await expect(toasts(page)).toContainText('Indexing failed: This file is not kept in the lead files’ storage, so it can’t be read here.')
})

test('delete: asked first, then the row and its stored file go', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
  const form = upload(page)
  await form.getByLabel('File to upload').setInputFiles({ name: 'old.txt', mimeType: 'text/plain', buffer: Buffer.from('old') })
  await form.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toasts(page)).toContainText('Uploaded old.txt.')
  const row = (await stubRows<Record<string, unknown>>('lead_files')).find((r) => r.file_name === 'old.txt')!
  expect(Object.keys(await stored())).toEqual([row.file_path])

  await fileRow(page, 'old.txt').getByRole('button', { name: 'Delete old.txt' }).click()
  const dlg = page.getByRole('dialog', { name: 'Delete “old.txt”?' })
  await expect(dlg).toContainText('This cannot be undone.')
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  expect((await stubRows('lead_files')).length).toBe(2)

  await fileRow(page, 'old.txt').getByRole('button', { name: 'Delete old.txt' }).click()
  await page.getByRole('dialog', { name: 'Delete “old.txt”?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(toasts(page)).toContainText('Deleted')
  await expect(fileRow(page, 'old.txt')).toHaveCount(0)
  expect((await stubRows<Record<string, unknown>>('lead_files')).map((r) => r.file_name)).toEqual(['Intake notes.docx'])
  expect(await stored()).toEqual({})
  // the agents' documents have no delete
  await expect(fileRow(page, 'Proposal presentation (PDF)').getByRole('button', { name: /Delete/ })).toHaveCount(0)
})
