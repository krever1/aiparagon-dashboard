import { type Page, expect, test } from '@playwright/test'
import { dayText } from '../../src/components/ui/local-date'
import { LEGACY, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'
import { DR, NT, PC, RQ, contentRows } from './content-fixtures'

// Content Transformation (Pipeline part 4a): the head, the Drafts tab (what is being written, the drafts made from the
// team's own material, a draft's review with Mark ready, What should change?, Copy, Download, Edit and save to
// library, How this draft was made), Try again, links to a draft, the Ideas tab (the brief's five things, the team's
// ideas, the library), New draft (still in the current dashboard), an empty page and a phone. On the made-up rows in
// tests/e2e/content-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const review = (page: Page) => page.getByTestId('draft-review')
const rowsOf = async (t: string) => stubRows<Row>(t)
const open = async (page: Page, title: string) => {
  await page.getByTestId('draft-row').filter({ hasText: title }).click()
  await expect(review(page).getByRole('heading', { level: 2 })).toHaveText(title)
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed(contentRows())
})

test('the drafts: the head, what is being written, the drafts made from your own material, and a draft’s review', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts')
  const status = page.getByTestId('content-status')
  await expect(status).toContainText('Writing 2 drafts')
  await expect(status).toContainText('3 drafts to review')
  await expect(page.getByRole('list', { name: 'What Content Transformation does' }).getByRole('listitem')).toHaveText([
    'Starts from your material',
    'Writes in your voice',
    'Drafts go to Approvals',
  ])
  await expect(page.getByRole('tab')).toHaveText(['New draft', 'Drafts 4', 'Ideas 5'])
  await expect(page.getByRole('tab', { name: /Drafts/ })).toHaveAttribute('aria-selected', 'true')

  // still being written, not picked up, did not finish: newest first
  const prog = page.getByTestId('progress-row')
  await expect(prog).toHaveCount(3)
  await expect(prog.nth(0)).toContainText('Client story: Halvern')
  await expect(prog.nth(0)).toContainText('Reading')
  await expect(prog.nth(0).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(prog.nth(1)).toContainText('Year-end checklist')
  await expect(prog.nth(1)).toContainText('Not picked up')
  await expect(prog.nth(2)).toContainText('Podcast episode 14')
  await expect(prog.nth(2)).toContainText('The transcript could not be read.')
  await expect(prog.nth(2)).toContainText('Did not finish')

  // the drafts made from the team's own material; the one made from the briefs is Marketing Generation's
  const list = page.getByTestId('draft-row')
  await expect(list.locator('b')).toHaveText(['Why onboarding stalls', 'Buy the owner first', 'Q4 in four slides', 'Your week back'])
  await expect(list.nth(0)).toHaveAttribute('aria-current', 'true')
  await expect(list.nth(1)).toContainText('Newsletter · ' + dayText(String(contentRows().agent_outputs[2].created_at), 'UTC') + ' · from an idea')
  await expect(list.nth(2)).toContainText('Presentation deck')
  await expect(list.nth(3)).toContainText('Ready')
  await expect(list.nth(0)).toContainText('Needs review')

  // the newest draft's review
  const r = review(page)
  await expect(r.getByTestId('draft-made-from')).toHaveText('Article → Thought leadership')
  await expect(r.getByRole('heading', { level: 2 })).toHaveText('Why onboarding stalls')
  await expect(r.getByTestId('draft-source')).toHaveText('From “The onboarding webinar” · led by the organic brief · See the creative brief')
  await expect(r.getByRole('link', { name: 'See the creative brief' })).toHaveAttribute('href', '/briefs?tab=combined&creative=' + RQ.post)
  const hooks = r.getByTestId('draft-hooks').getByRole('button')
  await expect(hooks).toHaveText(['Hook A', 'Hook B', 'Hook C'])
  await expect(hooks.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(r.getByTestId('draft-hook')).toHaveText('Most firms lose a week to onboarding.')
  await hooks.nth(2).click()
  await expect(r.getByTestId('draft-hook')).toHaveText('Your new clients wait ten days. Here is why.')
  await expect(r.getByTestId('draft-body').locator('p')).toHaveText([
    'Most firms treat onboarding as paperwork.',
    'It is the first promise you keep, or break.',
    'We cut it to three steps: one call, one form, one checklist.',
  ])
  await expect(r.getByTestId('draft-paper')).toContainText('Book a 20-minute intake review →')
  await expect(r.getByTestId('draft-paper')).toContainText('#onboarding #operations')
  await expect(r.getByTestId('draft-foot')).toContainText('Body · from your sourceHooks · inferred market patternsClaims · 2 to check')
  await expect(r.getByTestId('draft-trace')).toHaveCount(0)
  await r.getByRole('button', { name: 'Where each part came from' }).click()
  await expect(r.getByTestId('draft-trace')).toContainText('Body: The webinar, minutes 12 to 20')
  await expect(r.getByTestId('draft-trace')).toContainText('Hooks: Patterns from the organic brief')
  await expect(r.getByTestId('draft-trace')).toContainText('Claims: Five days: our own records')
  await expect(r.getByTestId('draft-actions').getByRole('button')).toHaveText(['Edit and save to library', 'Copy this version', 'Copy all hooks', 'Download .txt'])

  // the checks, the agent's flags, the asks
  const checks = r.getByTestId('draft-checks')
  await expect(checks.getByRole('checkbox')).toHaveCount(4)
  await expect(checks.getByTestId('draft-flags')).toContainText('The agent flagged 2 things to check')
  await expect(checks.getByTestId('review-line')).toHaveText('4 items to check before marking this ready.')
  await expect(checks.getByRole('button', { name: 'Mark ready' })).toBeDisabled()
  await expect(checks.getByTestId('draft-asks')).toHaveText('2 changes asked')
  await expect(checks.getByTestId('draft-asks')).toHaveAttribute('href', LEGACY + '/ai-settings')

  // how it was made, folded until Show
  const made = page.getByTestId('draft-made')
  await expect(made).toContainText('Your article, packaged with the market briefs')
  await expect(made.getByTestId('made-you')).toHaveCount(0)
  await made.getByRole('button', { name: 'Show' }).click()
  await expect(made).toContainText('The organic brief led the packaging, the ad brief supported it. Every claim comes from your source.')
  await expect(made.getByTestId('made-you')).toContainText('The onboarding webinar')
  await expect(made.getByTestId('made-you')).toContainText('Pulled out: 3 ideas · 2 stories · 1 framework · 1 quote')
  const ib = contentRows().agent_outputs.find((o) => o.output_type === 'intel_brief')!
  await expect(made.getByTestId('made-org')).toContainText('Organic brief · led' + dayText(String(ib.created_at), 'UTC') + 'Approved at the time.')
  await expect(made.getByTestId('made-ads')).toContainText('Ad brief' + dayText(String(contentRows().creative_briefs[0].created_at), 'UTC'))
  await expect(made.getByTestId('made-ads')).toContainText('Not approved yet at the time, so it was the newest instead.')
  await expect(made.getByTestId('made-house')).toContainText('2 house rules · template “LinkedIn post” · 1 knowledge base document · 2 asks from earlier drafts')
  await made.getByRole('button', { name: 'Which brief gets used' }).click()
  const info = page.getByRole('dialog', { name: 'Which brief gets used' })
  await expect(info).toContainText('Drafts from your content: the newest approved brief of each kind. If none is approved yet, the newest one.')
  await info.getByRole('button', { name: 'Got it' }).click()
  await expect(info).toBeHidden()

  // another draft: picked in the list, kept in the address
  await open(page, 'Buy the owner first')
  await expect(page).toHaveURL(new RegExp('tab=drafts&draft=' + DR.idea))
  await expect(r.getByTestId('draft-made-from')).toHaveText('New idea → Newsletter')
  await expect(r.getByTestId('draft-hooks').getByRole('button')).toHaveText(['Subject A', 'Subject B'])
  await expect(r.getByTestId('draft-paper')).toContainText('Preview: Name the owner first')
  await expect(r.getByTestId('draft-actions').getByRole('button')).toHaveText(['Edit and save to library', 'Copy this version', 'Copy all subjects', 'Download .txt'])
  await expect(r.getByTestId('draft-foot')).toContainText('Claims · none flagged')

  // a deck reads as cards
  await open(page, 'Q4 in four slides')
  await expect(r.getByTestId('draft-made-from')).toHaveText('Document or report → Presentation deck')
  await expect(r.getByTestId('draft-card')).toHaveCount(2)
  await expect(r.getByTestId('draft-card').nth(0)).toContainText('Slide 1: Where we startedThree clients waiting on paperwork.Notes: keep it short.')
  await expect(r).toContainText('These are written cards. Making the real file (slides or a cut video) comes later.')

  // a draft marked ready, already in the library
  await open(page, 'Your week back')
  await expect(r.getByTestId('draft-checks').getByTestId('review-line')).toContainText('Marked ready by pat')
  await expect(r.getByTestId('draft-checks').getByTestId('review-line')).toContainText('Nothing was published.')
  await expect(r.getByRole('button', { name: 'Mark ready' })).toHaveCount(0)
  for (const c of await r.getByRole('checkbox').all()) {
    await expect(c).toBeChecked()
    await expect(c).toBeDisabled()
  }
  await expect(r.getByTestId('draft-paper')).toContainText('Link headline: Onboarding in days, not weeks')
  await expect(r.getByTestId('draft-actions').getByRole('button').first()).toHaveText('Open saved piece')
})

test('Mark ready: the four checks, then the sign-off as the teammate; nothing is published', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts')
  const checks = review(page).getByTestId('draft-checks')
  const boxes = checks.getByRole('checkbox')
  await boxes.nth(0).check()
  await boxes.nth(2).check()
  await expect(checks.getByTestId('review-line')).toHaveText('2 items to check before marking this ready.')
  // the ticks stay with their draft while another is looked at
  await open(page, 'Buy the owner first')
  await expect(review(page).getByRole('checkbox').nth(0)).not.toBeChecked()
  await open(page, 'Why onboarding stalls')
  await expect(review(page).getByRole('checkbox').nth(0)).toBeChecked()
  await expect(review(page).getByRole('checkbox').nth(2)).toBeChecked()
  await boxes.nth(1).check()
  await boxes.nth(3).check()
  await expect(checks.getByTestId('review-line')).toHaveText('All checked. Mark it ready when you are happy.')
  await checks.getByRole('button', { name: 'Mark ready' }).click()
  await expect(toast(page, 'Marked ready. Nothing was published.')).toBeVisible()
  await expect(checks.getByTestId('review-line')).toContainText('Marked ready by qa.teammate')
  await expect(page.getByTestId('draft-row').nth(0)).toContainText('Ready')
  await expect(page.getByTestId('content-status')).toContainText('2 drafts to review')
  const fb = (await rowsOf('agent_feedback')).filter((r) => r.target_id === DR.post && r.action === 'ready')
  expect(fb).toEqual([expect.objectContaining({ agent: 'content_generation', target_type: 'draft_review', author: TEAM.email })])
  expect(JSON.parse(String(fb[0].feedback))).toEqual({
    checked: [
      'The story and framework match the source.',
      'The voice sounds like us and the wording is original.',
      'Offer, CTA and destination are accurate.',
      'Claims, testimonials and regulated-use hooks have had the right review.',
    ],
  })
})

test('What should change?: what was off and a note, kept for the next drafts', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts')
  await review(page).getByRole('button', { name: 'What should change?' }).click()
  const d = page.getByRole('dialog', { name: 'What should change in this post?' })
  await expect(d).toContainText('LinkedIn post · Why onboarding stalls')
  await expect(d.getByRole('button', { name: 'Off-voice' })).toBeFocused()
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d.getByRole('status')).toHaveText('Pick what was off, or write a sentence.')
  await d.getByRole('button', { name: 'Too long' }).click()
  await d.getByRole('button', { name: 'Too salesy' }).click()
  await expect(d.getByRole('button', { name: 'Too long' })).toHaveAttribute('aria-pressed', 'true')
  await d.getByRole('textbox', { name: /Anything to add/ }).fill('Cut the intro.')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(toast(page, 'Saved. The next drafts take it into account.')).toBeVisible()
  await expect(d).toBeHidden()
  await expect(review(page).getByTestId('draft-asks')).toHaveText('3 changes asked')
  const fb = (await rowsOf('agent_feedback')).filter((r) => r.target_id === DR.post && r.action === 'changes' && r.author === TEAM.email)
  expect(fb).toEqual([
    expect.objectContaining({ agent: 'content_generation', target_type: 'draft_review', feedback: 'LinkedIn post: too long, too salesy. Cut the intro.' }),
  ])
  // an ad draft is asked about as an ad
  await open(page, 'Your week back')
  await review(page).getByRole('button', { name: 'What should change?' }).click()
  const a = page.getByRole('dialog', { name: 'What should change in this ad?' })
  await expect(a).toContainText('Paid ad · Your week back')
  await a.getByRole('button', { name: 'Cancel' }).click()
  await expect(a).toBeHidden()
})

test('Try again: back in the queue and Content from Source asked again; a workflow that does not start says why', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts')
  const failed = page.getByTestId('progress-row').filter({ hasText: 'Podcast episode 14' })
  await failed.getByRole('button', { name: 'Try again' }).click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  await expect(failed).toContainText('Queued')
  await expect(failed.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect((await rowsOf('content_requests')).find((r) => r.id === RQ.failed)).toMatchObject({ status: 'queued', error: null })
  const sent = (await stubCalls()).filter((c) => c.path === '/webhook/e3-content-run')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ request_id: RQ.failed, requested_by: TEAM.email })
  expect(String(sent[0].body.auth)).not.toBe('')

  // switched off in n8n: the request waits in the queue, and its row says why
  await stubHook('e3-content-run', 404, { code: 404, message: 'not registered' })
  const stale = page.getByTestId('progress-row').filter({ hasText: 'Year-end checklist' })
  await stale.getByRole('button', { name: 'Try again' }).click()
  const why = 'The Content from Source workflow in n8n is switched off. Turn on “Engine 3 · Content from Source” in n8n.'
  await expect(toast(page, 'Saved, but the workflow did not start (' + why + '). Try again from Drafts.')).toBeVisible()
  await expect(stale).toContainText('The workflow did not start: ' + why)
  await expect(stale).toContainText('Not picked up')
  await expect(stale.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect((await rowsOf('content_requests')).find((r) => r.id === RQ.stale)).toMatchObject({ status: 'queued' })
})

test('the page reads again while a draft is being written, and says when it is ready', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts')
  await expect(page.locator('html[data-check-back="on"]')).toHaveCount(1)
  const R = contentRows()
  await stubSeed({ content_requests: R.content_requests.map((r) => (r.id === RQ.story ? { ...r, status: 'done', updated_at: new Date().toISOString() } : r)) })
  await expect(toast(page, 'Draft ready: Client story: Halvern')).toBeVisible({ timeout: 12_000 })
  await expect(page.getByTestId('progress-row').filter({ hasText: 'Client story: Halvern' })).toHaveCount(0)
})

test('Copy and Download: the version on screen, every hook, and a .txt', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await signIn(page, '/content-transformation?tab=drafts')
  const r = review(page)
  await r.getByTestId('draft-hooks').getByRole('button', { name: 'Hook B' }).click()
  await r.getByRole('button', { name: 'Copy this version' }).click()
  await expect(r.getByRole('button', { name: '✓ Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'The week nobody budgets for.\n\nMost firms treat onboarding as paperwork.\nIt is the first promise you keep, or break.\n\nWe cut it to three steps: one call, one form, one checklist.\n\nBook a 20-minute intake review\n\n#onboarding #operations',
  )
  await r.getByRole('button', { name: 'Copy all hooks' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Hook A: Most firms lose a week to onboarding.\nHook B: The week nobody budgets for.\nHook C: Your new clients wait ten days. Here is why.',
  )
  const [dl] = await Promise.all([page.waitForEvent('download'), r.getByRole('button', { name: 'Download .txt' }).click()])
  expect(dl.suggestedFilename()).toBe('why-onboarding-stalls.txt')
  const text = await new Promise<string>((ok, no) => {
    dl.createReadStream().then((s) => {
      let b = ''
      s.on('data', (c) => (b += c))
      s.on('end', () => ok(b))
      s.on('error', no)
    }, no)
  })
  expect(text.split('\n').slice(0, 3)).toEqual(['Why onboarding stalls', 'Format: Thought leadership', ''])
  expect(text).toContain('Check before publishing:\n- Check the five-day figure against this quarter')
})

test('Edit and save to library: a draft kept as a piece, opened again, changed and archived', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts')
  const r = review(page)
  await r.getByTestId('draft-hooks').getByRole('button', { name: 'Hook C' }).click()
  await r.getByRole('button', { name: 'Edit and save to library' }).click()
  const d = page.getByRole('dialog', { name: 'Edit and save to your library' })
  await expect(d).toContainText('Your edits are saved as a library piece. The original draft stays as it is in Content Transformation.')
  await expect(d.getByRole('textbox', { name: 'Title' })).toHaveValue('Why onboarding stalls')
  await expect(d.getByRole('combobox', { name: 'Format' })).toHaveValue('thought_leadership')
  const hooks = d.getByRole('textbox', { name: /Hooks or subject lines/ })
  // the hook on screen first
  await expect(hooks).toHaveValue('Your new clients wait ten days. Here is why.\nMost firms lose a week to onboarding.\nThe week nobody budgets for.')
  await expect(d.getByRole('button', { name: 'Archive' })).toHaveCount(0)

  // nothing to keep: no body and no hook
  const body = d.getByRole('textbox', { name: 'Body' })
  const was = await body.inputValue()
  await hooks.fill('')
  await body.fill('')
  await d.getByRole('button', { name: 'Save to library' }).click()
  await expect(d.getByRole('alert')).toHaveText('Add a body or at least one hook.')
  await hooks.fill('Your new clients wait ten days. Here is why.\nMost firms lose a week to onboarding.')
  await body.fill(was)
  await d.getByRole('textbox', { name: 'Tags' }).fill('Client wins, ops')
  await d.getByRole('button', { name: 'Save to library' }).click()
  await expect(toast(page, 'Saved to your content library.')).toBeVisible()
  await expect(d).toBeHidden()
  const mine = (await rowsOf('content_pieces')).filter((p) => p.source_draft_id === DR.post)
  expect(mine).toEqual([
    expect.objectContaining({
      title: 'Why onboarding stalls',
      format: 'thought_leadership',
      hooks: ['Your new clients wait ten days. Here is why.', 'Most firms lose a week to onboarding.'],
      body: was,
      cta: 'Book a 20-minute intake review',
      tags: ['client-wins', 'ops'],
      status: 'draft',
      source_request_id: RQ.post,
      created_by: TEAM.email,
      updated_by: TEAM.email,
    }),
  ])
  expect(String(mine[0].id)).toMatch(/^[0-9a-f-]{36}$/)

  // opened again: the piece on file, changed
  await r.getByRole('button', { name: 'Open saved piece' }).click()
  const e = page.getByRole('dialog', { name: 'Edit saved piece' })
  await expect(e.getByRole('textbox', { name: 'Tags' })).toHaveValue('client-wins, ops')
  await e.getByRole('combobox', { name: 'Status' }).selectOption('ready')
  await e.getByRole('textbox', { name: 'Notes' }).fill('Ran on LinkedIn')
  await e.getByRole('button', { name: 'Copy' }).click()
  await expect(e.getByRole('button', { name: '✓ Copied' })).toBeVisible()
  await e.getByRole('button', { name: 'Save changes' }).click()
  await expect(toast(page, 'Saved.')).toBeVisible()
  expect((await rowsOf('content_pieces')).find((p) => p.source_draft_id === DR.post)).toMatchObject({ status: 'ready', notes: 'Ran on LinkedIn' })

  // archived: it leaves the library, and the draft can be kept again
  await r.getByRole('button', { name: 'Open saved piece' }).click()
  await page.getByRole('dialog', { name: 'Edit saved piece' }).getByRole('button', { name: 'Archive' }).click()
  await expect(toast(page, 'Archived.')).toBeVisible()
  expect((await rowsOf('content_pieces')).find((p) => p.source_draft_id === DR.post)).toMatchObject({ status: 'archived', updated_by: TEAM.email })
  await expect(r.getByRole('button', { name: 'Edit and save to library' })).toBeVisible()
})

test('links to a draft: the one named, one made from the briefs, one not on file; Approvals and the old tab words', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts&draft=' + DR.deck)
  await expect(review(page).getByRole('heading', { level: 2 })).toHaveText('Q4 in four slides')
  await expect(page.getByTestId('draft-elsewhere')).toHaveCount(0)

  await page.goto('/content-transformation?tab=drafts&draft=' + DR.brief)
  await expect(page.getByTestId('draft-elsewhere')).toContainText('That draft was made from the briefs, so it is on Marketing Generation, in the current dashboard.')
  await expect(page.getByTestId('draft-elsewhere').getByRole('link', { name: 'Open Marketing Generation' })).toHaveAttribute('href', LEGACY + '/marketing-generation')
  await expect(review(page).getByRole('heading', { level: 2 })).toHaveText('Why onboarding stalls')

  await page.goto('/content-transformation?tab=drafts&draft=00000000-0000-4000-8000-0000000000ff')
  await expect(page.getByTestId('draft-elsewhere')).toHaveText('That draft is not on file any more. Here is the newest one.')

  await page.goto('/content-transformation?tab=requests')
  await expect(page.getByRole('tab', { name: /Drafts/ })).toHaveAttribute('aria-selected', 'true')
  await page.goto('/content-transformation?tab=library')
  await expect(page.getByRole('tab', { name: /Ideas/ })).toHaveAttribute('aria-selected', 'true')

  // Approvals: a draft is checked and approved here, at that draft
  await page.goto('/approvals')
  const row = page.locator(`[data-testid="approval"][data-key="draft:${DR.idea}"]`)
  await expect(row.getByRole('link', { name: 'Check and approve' })).toHaveAttribute('href', '/content-transformation?tab=drafts&draft=' + DR.idea)
  await row.getByRole('link', { name: 'Check and approve' }).click()
  await expect(review(page).getByRole('heading', { level: 2 })).toHaveText('Buy the owner first')
  await expect(page.locator(`[data-testid="approval"][data-key="draft:${DR.brief}"]`).getByRole('link', { name: 'Check and approve' })).toHaveCount(0)
})

test('See the creative brief opens it on the briefs page; See the draft comes back here', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=drafts')
  await review(page).getByRole('link', { name: 'See the creative brief' }).click()
  await expect(page).toHaveURL(/\/briefs\?tab=combined&creative=/)
  const drawer = page.getByRole('dialog', { name: /Why onboarding stalls/ })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('link', { name: 'See the draft' })).toHaveAttribute('href', '/content-transformation?tab=drafts&draft=' + DR.post)
  await drawer.getByRole('button', { name: 'Close' }).click()
  await expect(drawer).toBeHidden()
  await expect(page).toHaveURL(/\/briefs\?tab=combined$/)
  await page.getByTestId('creative').filter({ hasText: 'Why onboarding stalls' }).click()
  await page.getByRole('dialog', { name: /Why onboarding stalls/ }).getByRole('link', { name: 'See the draft' }).click()
  await expect(review(page).getByRole('heading', { level: 2 })).toHaveText('Why onboarding stalls')
})

test('ideas: the brief’s five things, your ideas added and deleted, and the library', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=ideas')
  const brief = page.getByTestId('ideas-brief')
  const ib = contentRows().agent_outputs.find((o) => o.output_type === 'intel_brief')!
  await expect(brief).toContainText('From the brief of ' + dayText(String(ib.created_at), 'UTC') + ' · pick one to start a draft')
  const cards = brief.getByTestId('brief-idea')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toContainText('PricingFee talk is upAdvisors post about fees more than last month')
  await expect(cards.nth(1)).toContainText('Social proof')
  // Draft this starts a draft on New draft, here (content-new.spec.ts follows it through)
  await expect(cards.nth(0).getByRole('button', { name: 'Draft this' })).toBeVisible()

  // your ideas: the open ones, newest first; a used one is not shown
  const yours = page.getByTestId('ideas-yours')
  const ideas = yours.getByTestId('idea-row')
  await expect(ideas).toHaveCount(2)
  await expect(ideas.nth(0)).toContainText('Most firms buy the AI tool before they name who owns the workflow.')
  await expect(ideas.nth(0)).toContainText('aiops' + dayText(String(contentRows().idea_notes[0].created_at), 'UTC') + ' · pat')
  await expect(yours).not.toContainText('An idea already drafted')

  // delete asks first
  page.once('dialog', (dlg) => void dlg.dismiss())
  await ideas.nth(1).getByRole('button', { name: 'Delete this idea' }).click()
  await expect(ideas).toHaveCount(2)
  page.once('dialog', (dlg) => {
    expect(dlg.message()).toBe('Delete this idea?')
    void dlg.accept()
  })
  await ideas.nth(1).getByRole('button', { name: 'Delete this idea' }).click()
  await expect(toast(page, 'Idea deleted')).toBeVisible()
  await expect(ideas).toHaveCount(1)
  expect((await rowsOf('idea_notes')).some((n) => n.id === NT.plain)).toBe(false)

  // add one
  await yours.getByRole('button', { name: 'Add an idea' }).click()
  const note = yours.getByRole('textbox', { name: 'Your idea' })
  await expect(note).toBeFocused()
  await yours.getByRole('button', { name: 'Save idea' }).click()
  await expect(note).toBeFocused()
  await note.fill('Clients remember the first week, not the proposal.')
  await yours.getByRole('textbox', { name: 'Tags' }).fill('growth, ops')
  await yours.getByRole('button', { name: 'Save idea' }).click()
  await expect(toast(page, 'Idea saved')).toBeVisible()
  await expect(ideas).toHaveCount(2)
  await expect(ideas.nth(0)).toContainText('Clients remember the first week, not the proposal.')
  const added = (await rowsOf('idea_notes')).find((n) => n.note === 'Clients remember the first week, not the proposal.')
  expect(added).toMatchObject({ tags: ['growth', 'ops'], status: 'open', created_by: TEAM.email })
  await expect(page.getByRole('tab', { name: /Ideas/ })).toHaveText('Ideas 5')

  // the library: newest first, once by title, six then all
  const pieces = page.getByTestId('ideas-pieces')
  await expect(pieces).toContainText('What you have given the engine so far. Use one to start a new draft.')
  await expect(pieces.getByRole('button', { name: 'Add a piece' })).toBeVisible()
  const rows = pieces.getByTestId('piece-row')
  await expect(rows).toHaveCount(6)
  await pieces.getByRole('button', { name: 'Show all 7' }).click()
  await expect(rows).toHaveCount(7)
  await expect(rows.locator('b')).toHaveText([
    'Client story: Halvern',
    'Year-end checklist',
    'The onboarding webinar',
    'Podcast episode 14',
    'Q4 client update',
    'Your week back',
    'The three-step intake',
  ])
  await expect(pieces).not.toContainText('An old piece')
  await expect(rows.nth(5)).toContainText('Paid ad · Ready · updated')
  await expect(rows.nth(5)).toContainText('#onboarding')
  await expect(rows.nth(0).getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(rows.nth(0).getByRole('button', { name: 'Use' })).toBeVisible()
  await rows.nth(6).getByRole('button', { name: 'Edit' }).click()
  const ed = page.getByRole('dialog', { name: 'Edit saved piece' })
  await expect(ed).toContainText('Saved pieces live in Content Transformation, under Ideas.')
  await expect(ed.getByRole('textbox', { name: 'Title' })).toHaveValue('The three-step intake')
  await ed.getByRole('textbox', { name: 'Title' }).fill('The three-step intake, v2')
  await ed.getByRole('button', { name: 'Save changes' }).click()
  await expect(toast(page, 'Saved.')).toBeVisible()
  expect((await rowsOf('content_pieces')).find((p) => p.id === PC.own)).toMatchObject({ title: 'The three-step intake, v2', updated_by: TEAM.email })
  await expect(rows.filter({ hasText: 'The three-step intake, v2' })).toHaveCount(1)
})

test('nothing yet: no drafts, no brief, no ideas; New draft leans on the material and the voice only', async ({ page }) => {
  await stubSeed({ content_requests: [], agent_outputs: [], idea_notes: [], content_pieces: [], agent_feedback: [], creative_briefs: [] })
  await signIn(page, '/content-transformation')
  // a bare address is New draft, and the head's New draft button is not needed there
  await expect(page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab')).toHaveText(['New draft', 'Drafts 0', 'Ideas 0'])
  await expect(page.getByRole('tab', { name: 'New draft' })).toHaveAttribute('aria-selected', 'true')
  const uses = page.getByTestId('new-side').getByTestId('use-row')
  await expect(uses).toHaveCount(3)
  await expect(uses.nth(0)).toContainText('No organic brief yetIt uses your material and voice only')
  await expect(page.getByTestId('content-status')).toContainText('Ready')
  await expect(page.getByTestId('content-status')).toContainText('No drafts waiting')
  await expect(page.getByTestId('content-page').getByRole('button', { name: 'New draft' })).toHaveCount(0)

  await page.getByRole('tab', { name: /Drafts/ }).click()
  await expect(page).toHaveURL(/tab=drafts/)
  await expect(page.getByText('No drafts yet', { exact: true })).toBeVisible()
  await expect(page.getByText('Drafts you generate show up here and wait in Approvals.')).toBeVisible()
  await page.getByRole('tabpanel').getByRole('button', { name: 'New draft' }).click()
  await expect(page.getByTestId('content-new')).toBeVisible()
  await expect(page).toHaveURL(/\/content-transformation$/)

  await page.getByRole('tab', { name: /Ideas/ }).click()
  await expect(page.getByText('No organic brief yet', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the Intel Tracker' })).toHaveAttribute('href', '/intel-tracker')
  await expect(page.getByTestId('ideas-yours')).toContainText('No saved ideas yet.')
  await expect(page.getByTestId('ideas-pieces')).toContainText('None on file yet. Add articles, webinars or transcripts to repurpose later.')
  await expect(page.getByTestId('piece-row')).toHaveCount(0)
})

test('on a phone: the drafts and their review fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '/content-transformation?tab=drafts')
  await expect(review(page).getByRole('heading', { level: 2 })).toHaveText('Why onboarding stalls')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('tab', { name: /Ideas/ }).click()
  await expect(page.getByTestId('ideas-pieces')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('the creative brief named by a link that is not on file opens nothing', async ({ page }) => {
  await signIn(page, '/briefs?tab=combined')
  await page.goto('/briefs?tab=combined&creative=' + RQ.failed)
  await expect(page.getByTestId('creatives')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
