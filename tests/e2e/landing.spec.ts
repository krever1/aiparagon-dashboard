import { type Page, expect, test } from '@playwright/test'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { whenText } from '../../src/lib/touchpoint/today'
import { TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'
import { LIVE_CONTENT, LP, PK, ago, landingRows } from './landing-fixtures'

// Landing pages: the numbers, the pages with theirs, the sign-ups (search, the CSV, a lead's page), the picker that
// makes a page from a campaign, the editor (every box, the checks before a page goes live, the campaign approved on its
// way live, Pause, Delete), each ad's links, and the preview of a page that is not live. On the made-up rows in
// tests/e2e/landing-fixtures.ts.

test.use({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const rowOf = (page: Page, id: string) => page.locator(`[data-testid="landing-row"][data-id="${id}"]`)
const editor = (page: Page) => page.getByTestId('landing-editor')
const msg = (page: Page) => editor(page).getByTestId('editor-msg')
const box = (page: Page, name: string | RegExp) => editor(page).getByRole('textbox', { name, exact: typeof name === 'string' })
const pageRow = async (id: string) => (await stubRows<Row>('landing_pages')).find((r) => r.id === id)
const openEditor = async (page: Page, id: string) => {
  await rowOf(page, id).getByRole('button', { name: 'Edit' }).click()
  await expect(editor(page)).toBeVisible()
}

// the rows as seeded, for the dates the tests compare
let seeded = landingRows()
test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  seeded = landingRows()
  await stubSeed(seeded)
})

test('the header, the numbers, and each page with its own', async ({ page }) => {
  await signIn(page, '/landing-pages')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Landing pages')
  await expect(page.getByTestId('landing-status')).toHaveText('1 page live')
  await expect(page.getByRole('list', { name: 'What landing pages do' }).getByRole('listitem')).toHaveText([
    'Pages at aiparagon.vercel.app/go',
    'Sign-ups go to HubSpot and the lead pipeline',
    'A tracking link for each ad',
  ])
  // visits in the last 30 days (a visit 40 days ago is not counted), sign-ups in them, and the rate
  await expect(page.getByTestId('landing-strip').getByRole('button')).toHaveText(['1 live', '45 visits in 30 days', '2 sign-ups in 30 days', '4.4% sign-up rate'])
  await expect(page.getByRole('tab')).toHaveText(['Pages 3', 'Sign-ups 3'])

  // newest change first
  const rows = page.getByTestId('landing-row')
  await expect(rows.locator('b').first()).toHaveText('Onboarding audit')
  await expect(rows).toHaveCount(3)
  const live = rowOf(page, LP.live)
  await expect(live).toContainText('LiveBook a call40 visits in 30 days2 sign-ups5% sign up')
  await expect(live.getByRole('link', { name: 'aiparagon.vercel.app/go/onboarding-audit' })).toHaveAttribute('href', 'https://aiparagon.vercel.app/go/onboarding-audit')
  await expect(live.getByRole('button')).toHaveText(['Ad links', 'Copy link', 'Edit'])
  const draft = rowOf(page, LP.draft)
  await expect(draft).toContainText('DraftWebinar0 visits in 30 days0 sign-ups')
  await expect(draft).not.toContainText('% sign up')
  await expect(draft.getByRole('button')).toHaveText(['Edit'])
  const paused = rowOf(page, LP.paused)
  await expect(paused).toContainText('PausedDownload5 visits in 30 days1 sign-up0% sign up')
  // a page that is not live has no link to open
  await expect(paused.getByRole('link')).toHaveCount(0)
  await expect(paused.getByRole('button')).toHaveText(['Ad links', 'Edit'])

  await live.getByRole('button', { name: 'Copy link' }).click()
  await expect(toast(page, 'Copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://aiparagon.vercel.app/go/onboarding-audit')

  // the sign-ups number opens their tab, which the address keeps
  await page.getByTestId('landing-strip').getByRole('button', { name: '2 sign-ups in 30 days' }).click()
  await expect(page).toHaveURL(/\/landing-pages\?tab=signups$/)
  await expect(page.getByRole('tab', { name: 'Sign-ups 3' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Pages 3' }).click()
  await expect(page).toHaveURL(/\/landing-pages$/)
})

test('the sign-ups: where each came from, HubSpot, the lead, search and the CSV', async ({ page }) => {
  await signIn(page, '/landing-pages?tab=signups')
  const rows = page.getByTestId('signup-row')
  await expect(rows).toHaveCount(3)
  const r = seeded.lp_signups
  await expect(rows.nth(0).getByRole('cell')).toHaveText([
    whenText(r[0].created_at, 'UTC'),
    'Pat ExampleCOO',
    'pat@example.org',
    'Example Advisors',
    'Onboarding audit',
    'PK7Q2-A1 · meta',
    'Added',
    'Open lead',
  ])
  await expect(rows.nth(0).getByRole('link', { name: 'Open lead' })).toHaveAttribute('href', '/lead-pipeline/' + leadId({ prospect_name: 'Pat Example', email: 'pat@example.org' }))
  // text from the public is shown as text
  await expect(rows.nth(1).getByRole('cell')).toHaveText([whenText(r[1].created_at, 'UTC'), 'Casey Sample', 'casey@example.org', '=HYPERLINK("x")', 'Onboarding audit', 'Direct', 'Not added', 'No'])
  await expect(rows.nth(1).getByText('Not added')).toHaveAttribute('title', 'Rate limited')
  await expect(rows.nth(2).getByRole('cell')).toHaveText([whenText(r[2].created_at, 'UTC'), 'Jordan Test', 'jordan@example.org', '', 'AI readiness guide', 'linkedin', 'Waiting', 'No'])

  const search = page.getByRole('searchbox', { name: 'Search sign-ups' })
  await search.fill('advisors')
  await expect(rows).toHaveCount(1)
  // the CSV holds what the search shows
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
  expect(dl.suggestedFilename()).toMatch(/^sign-ups-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = (await (await dl.createReadStream()).toArray()).join('').split('\n')
  expect(csv).toHaveLength(2)
  expect(csv[0]).toBe('When,Name,Email,Company,Job title,Phone,Page,Ad code,Source,Medium,Campaign,HubSpot,In lead pipeline')
  expect(csv[1]).toBe(r[0].created_at + ',Pat Example,pat@example.org,Example Advisors,COO,,Onboarding audit,PK7Q2-A1,meta,paid,onboarding-audit,Added,Yes')
  await search.fill('casey')
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
  // a cell a spreadsheet would run as a formula starts with a quote mark
  expect((await (await dl2.createReadStream()).toArray()).join('')).toContain(`,"'=HYPERLINK(""x"")",`)

  await search.fill('nobody at all')
  await expect(page.getByText('Nothing matches')).toBeVisible()
  await expect(page.getByText('Try another search.')).toBeVisible()
})

test('nothing yet: no pages, no sign-ups', async ({ page }) => {
  await stubSeed({ landing_pages: [], lp_signups: [], lp_views: [] })
  await signIn(page, '/landing-pages')
  await expect(page.getByTestId('landing-status')).toHaveText('0 pages live')
  await expect(page.getByTestId('landing-strip').getByRole('button')).toHaveText(['0 live', '0 visits in 30 days', '0 sign-ups in 30 days', '– sign-up rate'])
  await expect(page.getByText('No landing pages yet')).toBeVisible()
  await expect(page.getByText('Make a funnel or a book-a-call campaign in Marketing Generation, then put its page live here.')).toBeVisible()
  await page.getByRole('tab', { name: 'Sign-ups 0' }).click()
  await expect(page.getByText('No sign-ups yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
})

test('the picker: where each campaign stands, its page, and a new page made from one', async ({ page }) => {
  await signIn(page, '/landing-pages')
  await page.getByRole('button', { name: 'Put a page live' }).click()
  const dlg = page.getByRole('dialog', { name: 'Which page goes live?' })
  await expect(dlg.getByText('Each one becomes a page with a sign-up form. You can edit it before it goes live.')).toBeVisible()
  const picks = dlg.getByTestId('pick-row')
  await expect(picks.locator('b')).toHaveText(['AI readiness checklist', 'Compliance review call', 'Onboarding audit', 'AI in wealth webinar'])
  // a book-a-call campaign counts as approved once every ad is; a Funnel Builder one sent back says so
  await expect(picks.nth(0)).toContainText('Not approved yet')
  await expect(picks.nth(1)).toContainText('Approved')
  await expect(picks.nth(2)).toContainText('Not approved yetLive')
  await expect(picks.nth(3)).toContainText('Sent backDraft')
  await expect(picks.getByRole('button')).toHaveText(['Use this', 'Use this', 'Open its page', 'Open its page'])

  await picks.nth(0).getByRole('button', { name: 'Use this' }).click()
  await expect(dlg).toBeHidden()
  await expect(editor(page)).toBeVisible()
  await expect(editor(page).getByRole('heading', { name: 'AI readiness checklist' })).toBeVisible()
  await expect(editor(page)).toContainText('Download · Draft')
  // the address its name gives is taken, so it gets the next one along
  await expect(editor(page).getByRole('textbox', { name: 'Address' })).toHaveValue('ai-readiness-checklist-2')
  await expect(box(page, 'Headline')).toHaveValue('The AI readiness checklist, for advisory firms')
  await expect(editor(page).getByRole('textbox', { name: /^Button link/ })).toHaveValue('https://example.org/checklist.pdf')
  await expect(editor(page).getByTestId('editor-flags')).toContainText('Check the checklist link works')
  await expect(editor(page).getByRole('checkbox', { name: 'I checked these' })).not.toBeChecked()

  const made = (await stubRows<Row>('landing_pages')).find((r) => r.source_id === PK.fresh)!
  expect(made).toMatchObject({
    slug: 'ai-readiness-checklist-2', title: 'AI readiness checklist', status: 'draft', kind: 'download', source_type: 'funnel_package', source_run: 'fb-run-2',
    add_to_pipeline: true, created_by: TEAM.email, updated_by: TEAM.email, published_at: null,
  })
  const content = made.content as Record<string, unknown>
  expect(content).toMatchObject({ fields: ['name', 'email', 'company'], cta: 'Send it to me', flags: ['Check the checklist link works'] })
  const ads = made.ads as { code: string; n: number; hook: string }[]
  expect(ads.map((a) => a.hook)).toEqual(['Is your firm ready for AI?', 'Twelve questions before you buy.'])
  expect(ads[0].code).toMatch(/^P[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}-A1$/)
  expect(ads[1].code).toBe(ads[0].code.replace(/A1$/, 'A2'))

  // the campaign now has its page: the picker opens it, it never makes a second one
  await editor(page).getByRole('button', { name: 'Close' }).click()
  await expect(rowOf(page, made.id as string)).toBeVisible()
  await page.getByRole('button', { name: 'Put a page live' }).click()
  await expect(picks.nth(0)).toContainText('Draft')
  await picks.nth(0).getByRole('button', { name: 'Open its page' }).click()
  await expect(editor(page).getByRole('heading', { name: 'AI readiness checklist' })).toBeVisible()
  expect((await stubRows<Row>('landing_pages')).filter((r) => r.source_id === PK.fresh)).toHaveLength(1)
})

test("Today's quick start opens the picker once", async ({ page }) => {
  await signIn(page, '/today')
  await page.getByTestId('quick-start').getByRole('link', { name: /Put a landing page live/ }).click()
  await expect(page.getByRole('dialog', { name: 'Which page goes live?' })).toBeVisible()
  await expect(page).toHaveURL(/\/landing-pages$/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Which page goes live?' })).toBeHidden()
  await page.reload()
  await expect(page.getByTestId('landing-list')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Which page goes live?' })).toBeHidden()
})

test('a draft goes live: the holes, the checks, then the campaign sent back is approved on the way', async ({ page }) => {
  await signIn(page, '/landing-pages')
  await openEditor(page, LP.draft)
  await expect(editor(page)).toContainText('Webinar · Draft')
  await expect(editor(page).getByTestId('editor-holes')).toHaveText('Fill these in before it goes live: [ADD date and time] (When)')
  await expect(box(page, 'When')).toHaveValue('[ADD date and time]')
  await expect(box(page, 'Who presents')).toHaveValue('Jamie Host')
  await expect(box(page, /^Proof/)).toHaveValue('Run with 40 firms')
  // a box the page does not use is not shown
  await expect(box(page, 'How often')).toHaveCount(0)
  await expect(editor(page).getByRole('button')).toContainText(['Delete', 'Preview', 'Save', 'Put it live'])

  const live = editor(page).getByRole('button', { name: 'Put it live' })
  await live.click()
  await expect(msg(page)).toHaveText('Fill in [ADD date and time] (When) before it goes live.')
  await box(page, 'When').fill('Thursday 4 December, 11am – 12pm Pacific')
  await live.click()
  await expect(msg(page)).toHaveText('Tick "I checked these" first.')
  await editor(page).getByRole('checkbox', { name: 'I checked these' }).check()
  await live.click()
  await expect(msg(page)).toHaveText('This campaign was sent back for changes. Putting the page live approves it anyway.')
  expect((await pageRow(LP.draft))!.status).toBe('draft')
  expect((await stubRows<Row>('funnel_packages')).find((f) => f.id === PK.web)!.status).toBe('draft')

  await editor(page).getByRole('button', { name: 'Approve and put it live' }).click()
  await expect(editor(page)).toBeHidden()
  await expect(toast(page, 'Campaign approved. It is live at aiparagon.vercel.app/go/ai-in-wealth-webinar')).toBeVisible()
  const saved = (await pageRow(LP.draft))!
  expect(saved).toMatchObject({ status: 'live', updated_by: TEAM.email })
  expect(saved.published_at).toBeTruthy()
  // a range keeps its hyphen
  expect((saved.content as Row).when).toBe('Thursday 4 December, 11am-12pm Pacific')
  expect((await stubRows<Row>('funnel_packages')).find((f) => f.id === PK.web)!.status).toBe('approved')
  const fb = (await stubRows<Row>('agent_feedback')).filter((f) => f.target_type === 'funnel_package')
  expect(fb).toEqual([
    expect.objectContaining({
      agent: 'funnel_builder', target_id: PK.web, action: 'approved', author: TEAM.email,
      feedback: 'Approved by putting its landing page live (/go/ai-in-wealth-webinar)',
    }),
  ])
  await expect(rowOf(page, LP.draft)).toContainText('Live')
  await expect(page.getByTestId('landing-status')).toHaveText('2 pages live')
  // no ads on this page, so no Ad links window
  await expect(page.getByRole('dialog', { name: 'Ad links' })).toHaveCount(0)
})

test("a live page's boxes: the address, the checks it keeps, the sections, the questions, the form and the pipeline", async ({ page }) => {
  await signIn(page, '/landing-pages')
  await openEditor(page, LP.live)
  await expect(editor(page)).toContainText('Book a call · Live')
  await expect(editor(page).getByText('Changing it breaks the links already in your ads')).toBeVisible()
  await expect(editor(page).getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(editor(page).getByRole('button', { name: 'Put it live' })).toHaveCount(0)
  await expect(editor(page).getByRole('button', { name: 'Save and preview' })).toHaveAttribute('title', 'Saves the page, so visitors see the change now')
  // ticked for a page that has been live
  await expect(editor(page).getByRole('checkbox', { name: 'I checked these' })).toBeChecked()

  const save = editor(page).getByRole('button', { name: 'Save', exact: true })
  const addr = editor(page).getByRole('textbox', { name: 'Address' })
  await addr.fill('Bad Slug')
  await save.click()
  await expect(msg(page)).toHaveText('The address takes 3 to 60 lowercase letters, numbers and single dashes.')
  await addr.fill('ai-in-wealth-webinar')
  await save.click()
  await expect(msg(page)).toHaveText('Another page already uses that address.')
  await addr.fill('onboarding-audit')
  // a live page keeps to the checks on every save
  await box(page, 'Headline').fill('')
  await save.click()
  await expect(msg(page)).toHaveText('Add a headline before it goes live.')
  await box(page, 'Headline').fill('Get your onboarding audit today')

  await editor(page).getByRole('button', { name: 'Add a section' }).click()
  await editor(page).getByRole('group', { name: 'Section 2', exact: true }).getByRole('textbox', { name: 'Heading (optional)' }).fill('Pricing')
  const faq = editor(page).getByRole('group', { name: 'Question 1', exact: true })
  await faq.getByRole('button', { name: 'Remove' }).click()
  await editor(page).getByRole('button', { name: 'Add a question' }).click()
  await faq.getByRole('textbox', { name: 'Question' }).fill('Is it free?')
  await faq.getByRole('textbox', { name: 'Answer' }).fill('Yes, for advisors.')
  await expect(editor(page).getByRole('checkbox', { name: 'Work email' })).toBeDisabled()
  await editor(page).getByRole('checkbox', { name: 'Phone' }).check()
  await editor(page).getByRole('checkbox', { name: 'Job title' }).uncheck()
  await editor(page).getByRole('checkbox', { name: 'What slows onboarding most?' }).uncheck()
  const pipe = editor(page).getByRole('switch', { name: 'Add sign-ups to the lead pipeline' })
  await expect(pipe).toHaveAttribute('aria-checked', 'true')
  await pipe.click()
  await expect(pipe).toHaveAttribute('aria-checked', 'false')
  await save.click()
  await expect(editor(page)).toBeHidden()
  // the heading with no text is left out, and the message says so
  await expect(toast(page, 'Saved. One unfinished section or question was left out.')).toBeVisible()

  const saved = (await pageRow(LP.live))!
  expect(saved).toMatchObject({ status: 'live', slug: 'onboarding-audit', add_to_pipeline: false, published_at: seeded.landing_pages[1].published_at })
  const c = saved.content as Row
  expect(c.headline).toBe('Get your onboarding audit today')
  expect(c.sections).toEqual([{ title: 'How it works', body: 'We look at your forms.\n\nThen we map the steps.' }])
  expect(c.faq).toEqual([{ q: 'Is it free?', a: 'Yes, for advisors.' }])
  expect(c.fields).toEqual(['name', 'email', 'company', 'phone'])
  expect(c.questions).toEqual([
    { key: 'q1', label: 'How many advisors?', options: ['1-5', '6-20', '21+'], off: false },
    { key: 'q2', label: 'What slows onboarding most?', options: [], off: true },
  ])
  expect(c.flags).toEqual(['Check the claim about two weeks'])
})

test('Pause, and a paused page put live again: the link after sign-up, then its ad links', async ({ page }) => {
  await signIn(page, '/landing-pages')
  await openEditor(page, LP.live)
  await editor(page).getByRole('button', { name: 'Pause' }).click()
  await expect(toast(page, 'Paused. The page now says it is not taking sign-ups.')).toBeVisible()
  expect((await pageRow(LP.live))!.status).toBe('paused')
  await expect(page.getByTestId('landing-status')).toHaveText('0 pages live')

  await openEditor(page, LP.paused)
  await expect(editor(page)).toContainText('Download · Paused')
  // it has been live, so it cannot be deleted
  await expect(editor(page).getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(editor(page).getByRole('button', { name: 'Preview' })).toBeVisible()
  const link = editor(page).getByRole('textbox', { name: /^Button link/ })
  await expect(editor(page).getByText('the file they get, needed to go live')).toBeVisible()
  await link.fill('')
  const live = editor(page).getByRole('button', { name: 'Put it live' })
  await live.click()
  await expect(msg(page)).toHaveText('Add the link to the file under After they sign up, so people get it.')
  await link.fill('http://example.org/guide.pdf')
  await live.click()
  await expect(msg(page)).toHaveText('The button link after sign-up needs to start with https://')
  await link.fill('https://example.org/guide-v2.pdf')
  await live.click()
  await expect(toast(page, 'It is live at aiparagon.vercel.app/go/ai-readiness-checklist')).toBeVisible()
  const saved = (await pageRow(LP.paused))!
  // a page with no campaign behind it goes live as it is; it keeps the day it first went live
  expect(saved).toMatchObject({ status: 'live', published_at: seeded.landing_pages[0].published_at })
  // its ads' links come up next
  const ads = page.getByRole('dialog', { name: 'Ad links' })
  await expect(ads).toBeVisible()
  await expect(ads.getByTestId('ad-card')).toHaveCount(1)
})

test("each ad's code and its links, and what a page that is not live says", async ({ page }) => {
  await signIn(page, '/landing-pages')
  await rowOf(page, LP.live).getByRole('button', { name: 'Ad links' }).click()
  const dlg = page.getByRole('dialog', { name: 'Ad links' })
  await expect(dlg).toContainText('start the ad’s name with its code in Ads Manager, like PK7Q2-A1 Onboarding audit.')
  const cards = dlg.getByTestId('ad-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('PK7Q2-A1Stop losing a week to paperwork')
  await expect(cards.nth(0).getByTestId('ad-link').locator('code')).toHaveText([
    'https://aiparagon.vercel.app/go/onboarding-audit?utm_source=meta&utm_medium=paid&utm_campaign=onboarding-audit&utm_content=PK7Q2-A1',
    'https://aiparagon.vercel.app/go/onboarding-audit?utm_source=linkedin&utm_medium=paid&utm_campaign=onboarding-audit&utm_content=PK7Q2-A1',
    'https://aiparagon.vercel.app/go/onboarding-audit?utm_source=post&utm_medium=organic&utm_campaign=onboarding-audit&utm_content=PK7Q2-A1',
  ])
  await expect(dlg.getByText(/not taking sign-ups/)).toHaveCount(0)
  await cards.nth(1).getByRole('button', { name: 'Copy the LinkedIn link' }).click()
  await expect(toast(page, 'Copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://aiparagon.vercel.app/go/onboarding-audit?utm_source=linkedin&utm_medium=paid&utm_campaign=onboarding-audit&utm_content=PK7Q2-A2',
  )
  await page.keyboard.press('Escape')
  await rowOf(page, LP.paused).getByRole('button', { name: 'Ad links' }).click()
  await expect(dlg).toContainText('The page is paused, so these links show a "not taking sign-ups" page until you put it live again.')
})

test('Delete: only a draft that never went live, and it asks first', async ({ page }) => {
  await signIn(page, '/landing-pages')
  await openEditor(page, LP.draft)
  page.once('dialog', (d) => {
    expect(d.message()).toBe('Delete the draft "AI in wealth webinar"? It has never been live.')
    void d.dismiss()
  })
  await editor(page).getByRole('button', { name: 'Delete' }).click()
  await expect(editor(page)).toBeVisible()
  expect(await pageRow(LP.draft)).toBeTruthy()

  // the draft went live meanwhile (on another computer): the database keeps it, and the page says why
  const pages = landingRows().landing_pages as Row[]
  pages[2] = { ...pages[2], status: 'live', published_at: ago(60e3) }
  await stubSeed({ landing_pages: pages })
  page.once('dialog', (d) => void d.accept())
  await editor(page).getByRole('button', { name: 'Delete' }).click()
  await expect(toast(page, 'Could not delete it: only a draft that has never been live can be deleted')).toBeVisible()
  expect(await pageRow(LP.draft)).toBeTruthy()

  await stubSeed({ landing_pages: landingRows().landing_pages })
  page.once('dialog', (d) => void d.accept())
  await editor(page).getByRole('button', { name: 'Delete' }).click()
  await expect(toast(page, 'Deleted')).toBeVisible()
  await expect(editor(page)).toBeHidden()
  await expect(rowOf(page, LP.draft)).toHaveCount(0)
  expect(await pageRow(LP.draft)).toBeUndefined()
})

test('Preview saves first, then opens the page as visitors will see it', async ({ page, context }) => {
  await context.route('https://www.aiparagonconsulting.com/**', (route) => route.abort())
  await context.route('https://aiparagon.vercel.app/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>The public page</p>' }))
  await signIn(page, '/landing-pages')
  await openEditor(page, LP.draft)
  await box(page, 'Headline').fill('AI in wealth management, live')
  const [pop] = await Promise.all([page.waitForEvent('popup'), editor(page).getByRole('button', { name: 'Preview' }).click()])
  await pop.waitForURL('**/preview/landing/' + LP.draft)
  await expect(msg(page)).toHaveText('Saved. The preview opens in a new tab.')
  expect(((await pageRow(LP.draft))!.content as Row).headline).toBe('AI in wealth management, live')

  const lp = pop.getByTestId('lp-preview')
  await expect(lp.locator('.lp-preview')).toHaveText('Preview, not live yet. Sign-ups are off here.')
  await expect(lp.locator('.lp-brand')).toHaveText('AI Paragon Consulting Group')
  await expect(lp.locator('.lp-kicker')).toHaveText('Webinar')
  await expect(pop.getByRole('heading', { level: 1 })).toHaveText('AI in wealth management, live')
  await expect(lp.locator('.lp-meta > span')).toHaveText(['When [ADD date and time]', 'With Jamie Host'])
  await expect(lp.locator('.lp-bullets li')).toHaveText(['What works today', 'What to leave alone'])
  await expect(lp.locator('.lp-sec h2')).toHaveText('Agenda')
  await expect(lp.locator('.lp-sec p')).toHaveText(['Where firms start.', 'What it costs.'])
  await expect(lp.locator('.lp-proof li')).toHaveText('Run with 40 firms')
  const form = pop.getByRole('form', { name: 'Sign up' })
  await expect(form.locator('label')).toHaveText(['Full name', 'Work email', 'Company'])
  await form.getByRole('button', { name: 'Save my seat' }).click()
  await expect(form.getByRole('alert')).toHaveText('This is a preview, so sign-ups are off.')
  await expect(lp.locator('.lp-foot')).toContainText('© ' + new Date().getUTCFullYear() + ' AI Paragon Consulting Group')
  await expect(pop).toHaveTitle('AI in wealth management, live · AI Paragon Consulting Group')
  await pop.close()

  // a live page: the public page itself, which shows a live page to anyone
  await editor(page).getByRole('button', { name: 'Close' }).click()
  await openEditor(page, LP.live)
  const [pub] = await Promise.all([page.waitForEvent('popup'), editor(page).getByRole('button', { name: 'Save and preview' }).click()])
  await pub.waitForURL('https://aiparagon.vercel.app/go/onboarding-audit?preview=1')
  await expect(msg(page)).toHaveText('Saved, so visitors see it now. The preview opens in a new tab.')
})

test("the preview page: a campaign's questions, a page that is gone, and a sign-in", async ({ page, browser, baseURL }) => {
  await signIn(page, '/landing-pages')
  await page.goto('/preview/landing/' + LP.live)
  const lp = page.getByTestId('lp-preview')
  await expect(lp.locator('.lp-preview')).toHaveText('Preview. Sign-ups are off here.')
  const form = page.getByRole('form', { name: 'Sign up' })
  await expect(form.locator('label')).toHaveText(['Full name', 'Work email', 'Company', 'Job title', 'How many advisors?optional', 'What slows onboarding most?optional'])
  await expect(form.getByLabel('How many advisors?').locator('option')).toHaveText(['Choose one', '1-5', '6-20', '21+'])
  await expect(form.getByRole('textbox', { name: /What slows onboarding most/ })).toBeVisible()
  await expect(form.getByRole('button', { name: 'Book my call' })).toBeVisible()
  await expect(lp.locator('.lp-faq summary')).toHaveText('How long is the call?')
  // a box the campaign switched off is not on the page
  const pages = landingRows().landing_pages as Row[]
  pages[1] = { ...pages[1], content: { ...LIVE_CONTENT, questions: [{ key: 'q1', label: 'How many advisors?', options: [], off: true }] } }
  await stubSeed({ landing_pages: pages })
  await page.reload()
  await expect(form.locator('label')).toHaveText(['Full name', 'Work email', 'Company', 'Job title'])

  await page.goto('/preview/landing/a1000000-0000-4000-8000-00000000dead')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page is not available')
  await expect(page.getByRole('link', { name: 'Open Landing pages' })).toHaveAttribute('href', '/landing-pages')

  // signed out: the sign-in page first
  const other = await browser.newContext({ baseURL })
  const p2 = await other.newPage()
  await p2.goto('/preview/landing/' + LP.draft)
  await expect(p2).toHaveURL(/\/login\?next=%2Fpreview%2Flanding%2F/)
  await other.close()
})

test('on a phone: nothing runs off the side, the sign-ups scroll in their box and the editor takes the width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/landing-pages')
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(await wide()).toBeLessThanOrEqual(0)
  await openEditor(page, LP.live)
  const w = await editor(page).evaluate((e) => e.getBoundingClientRect().width)
  expect(w).toBeGreaterThan(380)
  await editor(page).getByRole('button', { name: 'Close' }).click()
  await page.getByRole('tab', { name: 'Sign-ups 3' }).click()
  await expect(page.getByTestId('signups')).toBeVisible()
  expect(await wide()).toBeLessThanOrEqual(0)
  await page.goto('/preview/landing/' + LP.draft)
  await expect(page.getByTestId('lp-preview')).toBeVisible()
  expect(await wide()).toBeLessThanOrEqual(0)
})
