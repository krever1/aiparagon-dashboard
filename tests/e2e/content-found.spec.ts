import { type Page, expect, test } from '@playwright/test'
import { dayText } from '../../src/components/ui/local-date'
import { PICKED_LEAD } from '../../src/lib/pipeline/briefs-found'
import { AD, INTEL_RUN, contentRows, formRows, foundRows } from './content-fixtures'
import { serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'

// New draft's step 2, What the briefs found (v111): the findings for the kind and category, each card's Use, Not this
// (kept in this browser, with Undo and bring back) and Save for later, the category chips' counts, the side's picks row,
// Topics from the findings, what rides in the request, Write it from these with no material, a paid ad's ads of its
// type, Email across every category, and no briefs yet. On the made-up rows in tests/e2e/content-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const form = (page: Page) => page.getByTestId('content-new')
const step = (page: Page) => form(page).getByRole('region', { name: 'What the briefs found' })
const cards = (page: Page) => step(page).getByTestId('finding')
const card = (page: Page, text: string) => cards(page).filter({ has: page.locator('b', { hasText: text }) })
const side = (page: Page) => page.getByTestId('new-side')
const tile = (page: Page, name: string) => form(page).getByTestId('kind-tile').filter({ hasText: name })
const cat = (page: Page, name: string) => form(page).getByRole('radiogroup', { name: 'Category' }).getByRole('radio', { name: new RegExp('^' + name) })
const TEXT =
  'Most firms lose a week to onboarding. The intake call, the forms and the checklist each wait on someone.\n\n' +
  'We cut that week by running one call, one form and one checklist, owned by one person. Five days saved, from our own records.\n\n' +
  'If your onboarding takes longer than a week, start with the owner: one name next to every step.'

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  const base = contentRows()
  await stubSeed({ ...base, ...formRows(), ...foundRows(base) })
})

test('the findings for the category: use, drop with Undo, keep for later, the counts, Topics, and what the request carries', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await expect(step(page)).toContainText('for opinion and frameworks')
  await expect(step(page)).toContainText('From your last 2 organic briefs. Use what fits, drop what does not, or keep one for later.')
  await expect(cards(page).locator('b')).toHaveText(['Fee talk is up', 'Fees move to the first line', 'Name the fee in the first line'])
  await expect(card(page, 'Fee talk is up')).toContainText('Five things')
  await expect(card(page, 'Name the fee in the first line')).toContainText('What works in a post')
  await expect(card(page, 'Name the fee in the first line')).toContainText('A founder on fee talk · Dana Reyes')
  await expect(card(page, 'Name the fee in the first line').getByRole('link', { name: /See the post/ })).toHaveAttribute('href', 'https://example.com/p/1')
  // the approved brief needs no note
  await expect(step(page).getByTestId('found-note')).toHaveCount(0)
  // the counts on the category chips
  await expect(cat(page, 'Opinion and frameworks')).toContainText('3')
  await expect(cat(page, 'Case studies and results')).toContainText('2')
  await expect(step(page).getByTestId('found-write')).toBeDisabled()

  // Use: the side says so
  await card(page, 'Fee talk is up').getByRole('button', { name: 'Use' }).click()
  await expect(card(page, 'Fee talk is up').getByRole('button', { name: 'Using' })).toHaveAttribute('aria-pressed', 'true')
  await expect(step(page).getByTestId('found-count')).toHaveText('1 pick in use')
  await expect(side(page).getByTestId('use-row').filter({ hasText: 'From the briefs · 1 pick' })).toContainText('Fee talk is up')

  // Not this: gone, with Undo; and it stays gone after a reload, until it is brought back
  await card(page, 'Name the fee in the first line').getByRole('button', { name: 'Not this' }).click()
  await expect(card(page, 'Name the fee in the first line')).toHaveCount(0)
  await expect(cat(page, 'Opinion and frameworks')).toContainText('2')
  await page.getByTestId('toasts').getByRole('button', { name: 'Undo' }).click()
  await expect(card(page, 'Name the fee in the first line')).toHaveCount(1)
  await card(page, 'Name the fee in the first line').getByRole('button', { name: 'Not this' }).click()
  await expect(toast(page, 'Dropped. It will not come up again.')).toBeVisible()

  // Save for later: an idea with where it came from
  await card(page, 'Fees move to the first line').getByRole('button', { name: 'Save for later' }).click()
  await expect(toast(page, 'Saved for later. It is in Ideas on Content Transformation.')).toBeVisible()
  await expect(card(page, 'Fees move to the first line').getByRole('button', { name: 'Saved for later' })).toBeDisabled()
  const note = (await stubRows<Row>('idea_notes')).find((n) => String(n.note).startsWith('Fees move to the first line'))!
  const day = dayText(foundRows(contentRows()).agent_outputs.find((o) => o.id === 'ib-f')!.created_at as string, 'UTC')
  expect(note.note).toBe('Fees move to the first line\nSay the price early\nFrom the organic brief of ' + day + '.')
  expect((note.tags as string[]).slice(0, 2)).toEqual(['From the briefs', 'Opinion and frameworks'])
  expect((note.tags as string[])[2]).toMatch(/^insight:i[0-9a-z]+$/)
  expect(note).toMatchObject({ status: 'open', created_by: 'qa.teammate@aiparagonconsulting.com' })

  // Topics from what the briefs found: the picks
  await form(page).getByRole('button', { name: 'Use what the briefs found for the topics' }).click()
  await expect(form(page).getByRole('textbox', { name: 'Topics or messages to stress' })).toHaveValue('Fee talk is up')

  // the request: the picks frame a piece made from material
  await form(page).getByRole('tablist', { name: 'Your material' }).getByRole('tab', { name: 'Paste' }).click()
  await form(page).getByRole('textbox', { name: /^Source text/ }).fill(TEXT)
  await form(page).getByTestId('more-options').locator('summary').click()
  await form(page).getByTestId('more-options').getByRole('textbox', { name: 'Source title' }).fill('Found test')
  await side(page).getByTestId('generate').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  const req = (await stubRows<Row>('content_requests')).find((r) => r.title === 'Found test')!
  expect(String((req.template as Row).rules)).toMatch(
    /^Build it on these findings the team picked from the market briefs \(they frame it; the facts come from our material\): Fee talk is up\. Leave these parts/,
  )
  expect((req.setup as Row).insights).toEqual([
    { text: 'Fee talk is up', why: 'Advisors talk about the fee more than last month', from: 'Five things', brief: 'intel_run_f', url: 'https://example.com/p/1', ad_id: null },
  ])
  // a send keeps the picks, as before; ✕ on the side stops using them
  await expect(card(page, 'Fee talk is up').getByRole('button', { name: 'Using' })).toBeVisible()
  await side(page).getByRole('button', { name: 'Stop using the picks' }).click()
  await expect(step(page).getByTestId('found-count')).toHaveText('Nothing picked yet')

  // after a reload: the dropped one stays out, the kept one says so
  await page.reload()
  await expect(cards(page).locator('b')).toHaveText(['Fee talk is up', 'Fees move to the first line'])
  await expect(card(page, 'Fees move to the first line').getByRole('button', { name: 'Saved for later' })).toBeDisabled()
  await step(page).getByRole('button', { name: '1 dropped · bring it back' }).click()
  await expect(cards(page)).toHaveCount(3)
})

test('Write it from these with no material: the picks become the idea, named after the first', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await card(page, 'Fee talk is up').getByRole('button', { name: 'Use' }).click()
  await card(page, 'Fees move to the first line').getByRole('button', { name: 'Use' }).click()
  await expect(step(page).getByTestId('found-write')).toHaveText('Write it from these')
  await step(page).getByTestId('found-write').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  const req = (await stubRows<Row>('content_requests')).find((r) => r.title === 'Fee talk is up')!
  expect(req.start_mode).toBe('idea')
  expect(req.thesis).toBe(PICKED_LEAD + '\n- Fee talk is up. Advisors talk about the fee more than last month\n- Fees move to the first line. Say the price early')
  expect(((req.setup as Row).insights as Row[]).map((i) => i.text)).toEqual(['Fee talk is up', 'Fees move to the first line'])
  await expect(form(page).getByRole('tablist', { name: 'Your material' }).getByRole('tab', { name: 'New idea' })).toHaveAttribute('aria-selected', 'true')
  // another category: the picks of the first do not go with it
  await cat(page, 'Case studies and results').click()
  await expect(step(page).getByTestId('found-count')).toHaveText('Nothing picked yet')
  await expect(cards(page).locator('b')).toHaveText(['Client numbers win replies', 'Lead with one client number'])
})

test('a paid ad: the best ads of its type first, the catalog ad left out, then the ads brief; a type with no ads says so', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await tile(page, 'Paid ad').click()
  await expect(step(page)).toContainText('for image ad')
  await expect(step(page)).toContainText('From your ads briefs and the ads the Ad Strategist read.')
  const texts = cards(page).locator('b')
  await expect(texts.nth(0)).toHaveText('Get your Mondays back')
  await expect(texts.nth(1)).toHaveText('Onboarding in a day')
  await expect(card(page, 'Get your Mondays back')).toContainText('From the Ad Strategist')
  await expect(card(page, 'Get your Mondays back')).toContainText('Northwind Advisory · 40 days running · Book a call')
  const link = card(page, 'Get your Mondays back').getByRole('link', { name: /See the ad/ })
  await expect(link).toHaveAttribute('href', '/ad-strategist?ad=' + AD.best)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(step(page)).not.toContainText('{{product.name}}')
  await expect(step(page)).not.toContainText('Watch a real intake')
  await step(page).getByRole('button', { name: /^Show all/ }).click()
  await expect(step(page)).toContainText('Onboarding audit at $497')
  await expect(card(page, 'Too busy to switch')).toContainText('Answer it before the buyer raises it')
  // no counts on an ad type's chips
  await expect(cat(page, 'Video ad script')).toHaveText('Video ad script')
  await cat(page, 'Video ad script').click()
  await expect(texts.nth(0)).toHaveText('Watch a real intake')
  await cat(page, 'Carousel ad').click()
  await expect(step(page).getByTestId('found-note')).toHaveText('No carousel ads in what the Ad Strategist read yet. The brief’s hooks and pains still apply.')
})

test('Email: findings across every category, no posts, and a note for a brief not approved', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await tile(page, 'Email').click()
  await expect(step(page)).toContainText('across every category')
  await expect(step(page).getByText('What works in a post')).toHaveCount(0)
  await expect(card(page, 'Proof beats promises')).toHaveCount(1)
  const day = dayText(contentRows().agent_outputs.find((o) => o.run_id === INTEL_RUN && o.output_type === 'intel_brief')!.created_at as string, 'UTC')
  await expect(step(page).getByTestId('found-note')).toHaveText('The brief of ' + day + ' is not approved yet. Its findings can still be used.')
})

test('no briefs yet', async ({ page }) => {
  const base = contentRows()
  await stubSeed({ agent_outputs: base.agent_outputs.filter((o) => o.agent !== 'intel_tracker') })
  await signIn(page, '/content-transformation')
  await expect(step(page).getByTestId('found-empty')).toContainText('No briefs yet')
  await expect(step(page).getByTestId('found-empty')).toContainText('Pick another category, or say what it should focus on.')
  await form(page).getByRole('button', { name: 'Use what the briefs found for the topics' }).click()
  await expect(toast(page, 'Nothing in the briefs for this category yet')).toBeVisible()
})
