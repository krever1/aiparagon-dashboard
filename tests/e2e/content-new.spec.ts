import { type Page, expect, test } from '@playwright/test'
import { dayText } from '../../src/components/ui/local-date'
import { SAMPLE } from '../../src/lib/pipeline/content-new'
import { AD_RUN, FM, INTEL_RUN, NT, PC, contentRows, formRows } from './content-fixtures'
import { TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'

// Content Transformation's New draft (Pipeline part 4b): what is being made and its category, the material (pasted,
// read from a link, the sample, a new idea; a file and a Fathom call are in content-material.spec.ts), the details,
// More options, the side (what comes back, what it will use, Generate and the draft on its way), the plan preview, and
// the links that fill the form in (Ideas, the quick starts, the strategy read). On the made-up rows in
// tests/e2e/content-fixtures.ts.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const form = (page: Page) => page.getByTestId('content-new')
const side = (page: Page) => page.getByTestId('new-side')
const uses = (page: Page) => side(page).getByTestId('use-row')
const material = (page: Page) => form(page).getByRole('tablist', { name: 'Your material' })
const tile = (page: Page, name: string) => form(page).getByTestId('kind-tile').filter({ hasText: name })
const day = (iso: unknown) => dayText(String(iso), 'UTC')
const ib = () => contentRows().agent_outputs.find((o) => o.output_type === 'intel_brief')!
const TEXT =
  'Most firms lose a week to onboarding. The intake call, the forms and the checklist each wait on someone.\n\n' +
  'We cut that week by running one call, one form and one checklist, owned by one person. Five days saved, from our own records.\n\n' +
  'If your onboarding takes longer than a week, start with the owner: one name next to every step.'
const newReq = async (title: string) => (await stubRows<Row>('content_requests')).find((r) => r.title === title)
/** Signs in, then opens an address that fills the form in (the form takes it once, then the address goes back to bare). */
const openWith = async (page: Page, q: string) => {
  await signIn(page, '/content-transformation')
  await page.goto('/content-transformation?' + q)
}

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ ...contentRows(), ...formRows() })
})

test('the form: kinds and categories, the material tabs, the questions, and what the side says it will use', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await expect(page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab')).toHaveText(['New draft', 'Drafts 4', 'Ideas 5'])
  await expect(form(page).getByRole('group', { name: 'What are you making? Posts and emails' }).getByRole('button')).toHaveText([
    'LinkedIn postThought leadership',
    'NewsletterFull issue or one section',
    'EmailFollow-up or nurture',
    'Paid adAd copy from your material',
  ])
  await expect(form(page).getByRole('group', { name: 'What are you making? Video' }).getByRole('button')).toHaveText(['Video scriptScene by scene', 'Short clipsCut from a long video'])
  await expect(tile(page, 'LinkedIn post')).toHaveAttribute('aria-pressed', 'true')
  const cats = form(page).getByRole('radiogroup', { name: 'Category' }).getByRole('radio')
  // each with how many findings the briefs have for it (none here: the brief has no posts to file them by)
  await expect(cats).toHaveText([
    'Opinion and frameworks0',
    'Educational and how-to0',
    'Case studies and results0',
    'Reports and white papers0',
    'News and announcements0',
    'Events and webinars0',
    'Podcasts and video0',
  ])
  await expect(cats.first()).toHaveAttribute('aria-checked', 'true')

  // the side: what comes back, what it will use, and Generate waiting for the material
  // the plan at the top of the side: what comes back, in the kind of post's parts (content-plan.spec.ts has the rest)
  const plan = side(page).getByTestId('plan')
  await expect(plan).toContainText('1 post, in these parts:')
  await expect(plan.getByTestId('plan-step').locator('b')).toHaveText(['The common belief', 'What we see', 'Why it matters'])
  await expect(plan).toContainText('Also: 3 opening lines to pick from')
  await expect(uses(page)).toHaveCount(4)
  await expect(uses(page).nth(0)).toContainText('Organic brief · ' + day(ib().created_at) + 'Needs review')
  await expect(uses(page).nth(0).getByRole('link', { name: 'Organic brief · ' + day(ib().created_at) })).toHaveAttribute('href', '/briefs?run=' + INTEL_RUN)
  await expect(uses(page).nth(1)).toContainText('Your fileNo file yet')
  await expect(uses(page).nth(2)).toContainText('Your voiceSaved ' + day(formRows().brand_voice[0].created_at))
  await expect(uses(page).nth(3)).toContainText('Feedback on earlier draftsAvoids what was asked before: weak hook, too long')
  const go = side(page).getByTestId('generate')
  await expect(go).toHaveText('Generate post')
  await expect(go).toBeDisabled()
  await expect(side(page).getByTestId('generate-hint')).toHaveText('Add your material in step 3 to generate.')

  // the material starts on Upload (a file is read here, content-material.spec.ts); Paste puts the cursor in the box
  await expect(material(page).getByRole('tab')).toHaveText(['Upload', 'Paste', 'Fathom call', 'New idea'])
  await expect(material(page).getByRole('tab', { name: 'Upload' })).toHaveAttribute('aria-selected', 'true')
  await expect(form(page).getByTestId('drop-zone')).toContainText('Drop a file or browse')
  await material(page).getByRole('tab', { name: 'Paste' }).click()
  await expect(material(page).getByRole('tab', { name: 'Paste' })).toHaveAttribute('aria-selected', 'true')
  await expect(form(page).getByRole('textbox', { name: /Source text/ })).toBeFocused()
  await material(page).getByRole('tab', { name: 'Fathom call' }).click()
  await expect(form(page).getByTestId('fathom')).toContainText('Pick a recorded call. Its transcript becomes your material.')
  await expect(uses(page).nth(1)).toContainText('Fathom callNo call picked yet')

  // a newsletter: its own questions and what comes back; a stand-alone article comes back as an article
  await tile(page, 'Newsletter').click()
  await expect(cats.first()).toHaveText('News and announcements0')
  await expect(cats.first()).toHaveAttribute('aria-checked', 'true')
  await expect(go).toHaveText('Generate issue')
  await expect(form(page).getByRole('checkbox', { name: 'A short summary at the top' })).toBeChecked()
  await expect(form(page).getByRole('radiogroup', { name: 'What should readers do?' })).toBeVisible()
  await cats.filter({ hasText: 'Stand-alone article' }).click()
  await expect(plan).toContainText('1 article with short sections, in these parts:')
  await expect(plan).toContainText('Also: 3 title options')
  // email has no categories; a paid ad has its ad types, and leads with the ads brief
  await tile(page, 'Email').click()
  await expect(form(page).getByRole('radiogroup', { name: 'Category' })).toHaveCount(0)
  await expect(form(page).getByRole('textbox', { name: /Who gets it\?/ })).toBeVisible()
  await tile(page, 'Paid ad').click()
  await expect(cats).toHaveText(['Image ad', 'Text ad', 'Carousel ad', 'Video ad script'])
  await expect(form(page).getByTestId('categories')).toContainText('Ad copy from your material: a body, three hooks and a call to action.')
  await cats.filter({ hasText: 'Video ad script' }).click()
  await expect(form(page).getByTestId('categories')).toContainText('A 30 to 45 second video ad: hook, problem, proof, ask.')
  const cb = contentRows().creative_briefs[0]
  await expect(uses(page).nth(0)).toContainText('Ads brief · ' + day(cb.created_at) + 'Needs review')
  // a video ad's plan is its own shape, the parts that are sent
  await expect(plan).toContainText('1 ad body, in these parts:')
  await expect(plan.getByTestId('plan-step').locator('b')).toHaveText(['The first three seconds', 'The problem', 'The proof', 'The ask'])
  await expect(plan).toContainText('Also: 3 hooks to test, A call to action and a headline')
  // a report's questions, with their defaults
  await tile(page, 'Report').click()
  await expect(form(page).getByRole('radiogroup', { name: 'Length' }).getByRole('radio', { name: 'Medium (5 to 8 pages)' })).toHaveAttribute('aria-checked', 'true')
  await expect(form(page).getByRole('checkbox', { name: 'Suggest charts (only from figures in the material)' })).toBeChecked()
  // the category picked for a kind is kept while the page is open
  await tile(page, 'Paid ad').click()
  await expect(cats.filter({ hasText: 'Video ad script' })).toHaveAttribute('aria-checked', 'true')
})

test('Generate: the request as Content from Source reads it, the template counted, and the draft on its way to Review it', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await material(page).getByRole('tab', { name: 'Paste' }).click()
  await form(page).getByRole('textbox', { name: /Source text/ }).fill(TEXT)
  await expect(form(page)).toContainText('Source text' + (TEXT.split(/\s+/).length) + ' words')
  await form(page).getByRole('radiogroup', { name: 'What is it for?' }).getByRole('radio', { name: 'Share a point of view' }).click()
  await form(page).getByRole('textbox', { name: /Topics or messages to stress/ }).fill('one owner per step')
  await form(page).getByRole('textbox', { name: /Core takeaway/ }).fill('Name one owner.')
  const must = form(page).getByRole('textbox', { name: 'Must use' })
  await must.fill('Five days saved')
  await must.press('Enter')
  await form(page).getByRole('button', { name: '$497 Onboarding audit', exact: true }).click()
  await expect(form(page).getByRole('button', { name: 'Remove Five days saved' })).toBeVisible()
  await expect(form(page).getByRole('button', { name: 'Remove $497 Onboarding audit' })).toBeVisible()
  // the suggestion added is no longer offered
  await expect(form(page).getByRole('button', { name: '$497 Onboarding audit', exact: true })).toHaveCount(0)
  await form(page).getByRole('textbox', { name: /Anything else\?/ }).fill('Keep it under 200 words.')
  await form(page).getByText('More options').click()
  await form(page).getByRole('combobox', { name: 'Structure' }).selectOption({ label: 'Client story' })
  await expect(form(page).getByRole('combobox', { name: 'What should they do?' })).toHaveValue('Book a call: Onboarding audit')
  await expect(form(page).getByRole('combobox', { name: 'What are you offering?' })).toHaveValue(FM.audit)
  await form(page).getByRole('textbox', { name: /Source title/ }).fill('Onboarding in five days')
  await expect(uses(page).nth(1)).toContainText('Pasted textOnboarding in five days · ' + TEXT.split(/\s+/).length + ' words')

  const go = side(page).getByTestId('generate')
  await expect(side(page).getByTestId('generate-hint')).toHaveText('About a minute. It lands in Drafts and waits in Approvals.')
  await go.click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  await expect(side(page).getByTestId('watch')).toContainText('Writing “Onboarding in five days”. Started just now. About a minute.')

  const r = await newReq('Onboarding in five days')
  expect(r).toMatchObject({
    requested_by: TEAM.email,
    start_mode: 'source',
    format: 'thought_leadership',
    content_type: 'thought_leadership',
    status: 'queued',
    desired_action: 'Book a call: Onboarding audit',
    voice: 'Use my saved voice',
    source_type: 'article',
    source_text: TEXT,
    takeaway: 'Name one owner.',
    source_url: null,
    template_id: FM.story,
  })
  expect(r!.setup).toEqual({
    type: 'thought_leadership',
    persona_id: FM.founder,
    persona: 'Ops-minded founder',
    offer_id: FM.audit,
    offer: 'Onboarding audit',
    cta: 'Book a call: Onboarding audit',
    angle: null,
    source: 'paste',
    must_use: ['Five days saved', '$497 Onboarding audit'],
    feedback: ['LinkedIn post: weak hook.', 'LinkedIn post: too long.'],
    questions: { 'What is it for?': 'Share a point of view', Length: 'Medium', 'Topics or messages to stress': 'one owner per step' },
    notes: 'Keep it under 200 words.',
    format_label: 'LinkedIn post',
    category: 'opinion',
    category_name: 'Opinion and frameworks',
  })
  const tpl = r!.template as Row
  expect(tpl.name).toBe('Client story')
  expect(tpl.description).toBe(
    'A client story in three beats. The team answered: What is it for?: Share a point of view. Length: Medium. Topics or messages to stress: one owner per step. Notes from the team: Keep it under 200 words.',
  )
  expect(tpl.rules).toBe(
    'Leave these parts of the organic brief out: The short version, Notable developments. Name the client only with their permission. ' +
      'Write it as a point of view: one clear opinion, backed by the material. Write for Ops-minded founder (Founder, Small advisory firm, 5 to 20). ' +
      'Their main pain: Onboarding eats a week of every new client. The offer to point to: Onboarding audit (A review of your intake and a one-page plan.). ' +
      'Mention it once, near the end, as the natural next step. It must use these, word for word where they are figures, names or offers: ' +
      'Five days saved; $497 Onboarding audit. Leave one out only if the material does not support it, and say so in the review notes.',
  )
  // the template counts a use; Content from Source is asked to write it
  expect((await stubRows<Row>('doc_templates')).find((t) => t.id === FM.story)!.uses).toBe(3)
  const sent = (await stubCalls()).filter((c) => c.path === '/webhook/e3-content-run')
  expect(sent).toHaveLength(1)
  expect(sent[0].body).toMatchObject({ request_id: r!.id, requested_by: TEAM.email })

  // the material, what it must use and the notes go; the kind, the answers chosen and More options stay
  await expect(form(page).getByRole('textbox', { name: /Source text/ })).toHaveValue('')
  await expect(form(page).getByRole('textbox', { name: /Core takeaway/ })).toHaveValue('')
  await expect(form(page).getByRole('textbox', { name: /Anything else\?/ })).toHaveValue('')
  await expect(form(page).getByRole('textbox', { name: /Topics or messages to stress/ })).toHaveValue('')
  await expect(form(page).getByRole('button', { name: /^Remove / })).toHaveCount(0)
  await expect(form(page).getByRole('radiogroup', { name: 'What is it for?' }).getByRole('radio', { name: 'Share a point of view' })).toHaveAttribute('aria-checked', 'true')
  await expect(form(page).getByRole('combobox', { name: 'Structure' })).toHaveValue(FM.story)
  await expect(go).toBeDisabled()

  // Content from Source writes it: the side says it is ready, and Review it opens it on Drafts
  const draftId = '00000000-0000-4000-8000-0000000000f1'
  const reqs = (await stubRows<Row>('content_requests')).map((x) => (x.id === r!.id ? { ...x, status: 'done', output_id: draftId } : x))
  const outs = await stubRows<Row>('agent_outputs')
  await stubSeed({
    content_requests: reqs,
    agent_outputs: [
      ...outs,
      {
        id: draftId, agent: 'content_generation', output_type: 'content_draft', run_id: 'cg_new', title: 'Onboarding in five days', created_at: new Date().toISOString(),
        data: { request_id: r!.id, format: 'thought_leadership', content_type: 'thought_leadership', start_mode: 'source', source_type: 'article', title: 'Onboarding in five days', hooks: [{ label: 'Hook A', text: 'Five days, not five weeks.' }], body: 'One owner per step.', cta: 'Book a call' },
      },
    ],
  })
  await expect(side(page).getByTestId('watch')).toContainText('Draft ready: “Onboarding in five days”It is waiting in Approvals too.', { timeout: 15_000 })
  await side(page).getByRole('button', { name: 'Review it' }).click()
  await expect(page).toHaveURL(/\/content-transformation\?tab=drafts&draft=00000000-0000-4000-8000-0000000000f1$/)
  await expect(page.getByTestId('draft-review').getByRole('heading', { level: 2 })).toHaveText('Onboarding in five days')
})

test('a workflow that does not start: the request waits, the side says why, and Try again starts it', async ({ page }) => {
  await stubHook('e3-content-run', 404, { code: 404, message: 'not registered' })
  await signIn(page, '/content-transformation')
  await material(page).getByRole('tab', { name: 'Paste' }).click()
  await form(page).getByRole('textbox', { name: /Source text/ }).fill(TEXT)
  await side(page).getByTestId('generate').click()
  const why = 'The Content from Source workflow in n8n is switched off. Turn on “Engine 3 · Content from Source” in n8n.'
  await expect(toast(page, 'Saved, but the workflow did not start (' + why + '). Try again from Drafts.')).toBeVisible()
  // no title given: the request has none, and the side calls it Your draft
  const r = (await stubRows<Row>('content_requests')).find((x) => x.source_text === TEXT)!
  expect(r).toMatchObject({ status: 'queued', title: null })
  const watch = side(page).getByTestId('watch')
  await expect(watch).toContainText('“Your draft” did not finish')
  await expect(watch).toContainText('The workflow did not start: ' + why)
  // the Drafts tab says the same
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: /Drafts/ }).click()
  await expect(page.getByTestId('progress-row').filter({ hasText: 'The workflow did not start: ' + why })).toHaveCount(1)
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: 'New draft' }).click()
  await stubHook('e3-content-run', 200, { ok: true, queued: true })
  await watch.getByRole('button', { name: 'Try again' }).click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  await expect(watch).toContainText('Writing “Your draft”.')
})

test('New idea: from Ideas, who it is for and the proof, and the team’s idea marked written up', async ({ page }) => {
  await signIn(page, '/content-transformation?tab=ideas')
  const note = contentRows().idea_notes.find((n) => n.id === NT.open)!.note
  await page.getByTestId('ideas-yours').getByTestId('idea-row').filter({ hasText: note }).getByRole('button', { name: 'Draft this' }).click()
  await expect(page).toHaveURL(/\/content-transformation$/)
  await expect(page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: 'New draft' })).toHaveAttribute('aria-selected', 'true')
  await expect(material(page).getByRole('tab', { name: 'New idea' })).toHaveAttribute('aria-selected', 'true')
  const idea = form(page).getByRole('textbox', { name: 'What point do you want to make?' })
  await expect(idea).toHaveValue(note)
  await expect(idea).toBeFocused()
  await expect(form(page).getByRole('combobox', { name: 'What is this material?' })).toHaveCount(0)
  await expect(uses(page).nth(1)).toContainText('Your idea' + note.slice(0, 50))
  await form(page).getByRole('radiogroup', { name: 'Who should see it?' }).getByRole('radio', { name: 'Practice manager' }).click()
  await expect(form(page).getByTestId('persona-sum')).toHaveText('Practice manager · Mid-size firm')
  await form(page).getByRole('textbox', { name: /Proof or example/ }).fill('One client lost ten days.')
  await side(page).getByTestId('generate').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  const r = (await stubRows<Row>('content_requests')).find((x) => x.thesis === note)!
  expect(r).toMatchObject({
    start_mode: 'idea',
    audience: 'Practice manager (Practice manager, Mid-size firm)',
    pain: null,
    proof: 'One client lost ten days.',
    title: 'Most firms buy the AI tool before they name who owns the workflow',
  })
  expect(r.setup).toMatchObject({ source: 'idea', persona_id: FM.manager })
  expect((await stubRows<Row>('idea_notes')).find((n) => n.id === NT.open)).toMatchObject({ status: 'used', used_in: r.id })
  await expect(idea).toHaveValue('')

  // a brief's idea: its text, then why; too little waits for more
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: /Ideas/ }).click()
  await page.getByTestId('ideas-brief').getByTestId('brief-idea').first().getByRole('button', { name: 'Draft this' }).click()
  await expect(idea).toHaveValue('Fee talk is up. Advisors post about fees more than last month')
  await idea.fill('Too short to build on.')
  await expect(side(page).getByTestId('generate')).toBeDisabled()
  await expect(side(page).getByTestId('generate-hint')).toHaveText('Write your point in step 3 to generate.')
  await expect(uses(page).nth(1)).toContainText('Your ideaToo short to build on. (a little more, please)')
})

test('Read link, the sample, and what a link reader that cannot read says', async ({ page }) => {
  await openWith(page, 'src=paste')
  await expect(material(page).getByRole('tab', { name: 'Paste' })).toHaveAttribute('aria-selected', 'true')
  const link = form(page).getByRole('textbox', { name: 'Link to an article, blog post or YouTube video' })
  const msg = form(page).getByTestId('link-msg')
  await form(page).getByRole('button', { name: 'Read link' }).click()
  await expect(msg).toHaveText('Paste a link first.')
  await expect(link).toBeFocused()
  await link.fill('example.com/week-three')
  await link.press('Enter')
  await expect(msg).toHaveText(/^Read \d+ words from example\.com\. Check the text, then generate\.$/)
  await expect(form(page).getByRole('textbox', { name: /Source text/ })).toHaveValue(/^Most new tools do not fail on the first day\./)
  await expect(link).toHaveValue('https://example.com/week-three')
  await form(page).getByText('More options').click()
  await expect(form(page).getByRole('textbox', { name: /Source title/ })).toHaveValue('The week-three slump')
  expect((await stubCalls()).filter((c) => c.path === '/webhook/e3-read-link')[0].body).toMatchObject({ url: 'example.com/week-three' })

  // reading again over text asks first; a YouTube video the reader cannot open says what to do instead
  await link.fill('https://www.youtube.com/watch?v=abc')
  page.once('dialog', (d) => {
    expect(d.message()).toBe('Replace what is in Source text with the text from this link?')
    void d.dismiss()
  })
  await form(page).getByRole('button', { name: 'Read link' }).click()
  await expect(msg).toHaveText('')
  await expect(form(page).getByRole('textbox', { name: /Source text/ })).toHaveValue(/^Most new tools do not fail on the first day\./)
  page.once('dialog', (d) => void d.accept())
  await form(page).getByRole('button', { name: 'Read link' }).click()
  await expect(msg).toHaveText(
    'YouTube does not let automated readers pull a video’s captions. If you have the video file, add it on the Upload tab and it gets transcribed. Its captions file (.srt) or a pasted transcript work too.',
  )
  await stubHook('e3-read-link', 404, { code: 404, message: 'not registered' })
  page.once('dialog', (d) => void d.accept())
  await form(page).getByRole('button', { name: 'Read link' }).click()
  await expect(msg).toHaveText('Reading links is switched off in n8n. Turn on “Engine 3 · Read a Link” and try again.')

  // the sample article
  await form(page).getByRole('button', { name: 'Try it with a sample article' }).click()
  await expect(form(page)).toContainText('Sample loaded. Swap in your own material for a real draft.')
  await expect(form(page).getByRole('textbox', { name: /Source text/ })).toHaveValue(SAMPLE.text)
  await expect(form(page).getByRole('textbox', { name: /Core takeaway/ })).toHaveValue(SAMPLE.take)
  await expect(uses(page).nth(1)).toContainText('Pasted textWhy AI pilots stall after week three · 161 words · sample')
  await side(page).getByTestId('generate').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  expect(await newReq('Sample · Why AI pilots stall after week three')).toMatchObject({ source_type: 'article', takeaway: SAMPLE.take })
})

test('a paid ad: the carousel’s shape and content type; Approve the brief it leads with', async ({ page }) => {
  await openWith(page, 'kind=ad&src=paste')
  await expect(tile(page, 'Paid ad')).toHaveAttribute('aria-pressed', 'true')
  await form(page).getByRole('radiogroup', { name: 'Category' }).getByRole('radio', { name: 'Carousel ad' }).click()
  await form(page).getByRole('textbox', { name: /Source text/ }).fill(TEXT)
  await form(page).getByText('More options').click()
  await form(page).getByRole('textbox', { name: /Source title/ }).fill('Carousel test')
  await expect(form(page).getByRole('combobox', { name: 'Structure' }).locator('option').first()).toHaveText('Let the brief suggest a structure')
  await side(page).getByTestId('generate').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  const r = await newReq('Carousel test')
  expect(r).toMatchObject({ format: 'ad', content_type: 'ad_carousel' })
  expect(r!.setup).toMatchObject({ type: 'ad', ad_type: 'ad_carousel', category_name: 'Carousel ad', questions: { Length: 'Short' } })
  expect((r!.template as Row).name).toBe('Carousel ad')

  // Approve the ads brief from the side, with Undo
  const brief = uses(page).nth(0)
  await brief.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByTestId('toasts')).toContainText('Approved')
  expect((await stubRows<Row>('agent_feedback')).find((f) => f.target_type === 'brief_approval')).toMatchObject({
    agent: 'ad_strategist',
    target_id: AD_RUN,
    action: 'approved',
    feedback: 'Approved in Approvals',
    author: TEAM.email,
  })
  await expect(brief).toContainText('Approved')
  await expect(brief.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/briefs?tab=ads&run=' + AD_RUN)
})

test('links that fill the form in: Use, Add a piece, the quick start and the strategy read; the form keeps what was typed', async ({ page }) => {
  const rows = contentRows()
  const body = 'Step one: one call with the client. Step two: one form. Step three: one checklist, owned by one person.'
  rows.content_pieces = rows.content_pieces.map((p) => (p.id === PC.own ? { ...p, body } : p))
  await stubSeed(rows)
  await signIn(page, '/content-transformation?tab=ideas')
  const pieces = page.getByTestId('ideas-pieces')
  await pieces.getByRole('button', { name: 'Show all 7' }).click()
  await pieces.getByTestId('piece-row').filter({ hasText: 'The three-step intake' }).getByRole('button', { name: 'Use' }).click()
  await expect(material(page).getByRole('tab', { name: 'Paste' })).toHaveAttribute('aria-selected', 'true')
  await expect(form(page).getByRole('textbox', { name: /Source text/ })).toHaveValue(body)
  await expect(form(page).getByRole('combobox', { name: 'What is this material?' })).toHaveValue('other')
  await expect(form(page).getByRole('textbox', { name: /Core takeaway/ })).toBeFocused()
  await form(page).getByText('More options').click()
  await expect(form(page).getByRole('textbox', { name: /Source title/ })).toHaveValue('The three-step intake')
  await expect(page).toHaveURL(/\/content-transformation$/)

  // the form keeps what was typed while another tab is looked at
  await form(page).getByRole('textbox', { name: /Core takeaway/ }).fill('One owner.')
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: /Drafts/ }).click()
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: 'New draft' }).click()
  await expect(form(page).getByRole('textbox', { name: /Core takeaway/ })).toHaveValue('One owner.')

  // a piece with too little text says so
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: /Ideas/ }).click()
  await pieces.getByRole('button', { name: 'Show all 7' }).click()
  await pieces.getByTestId('piece-row').filter({ hasText: 'Your week back' }).getByRole('button', { name: 'Use' }).click()
  await expect(toast(page, 'There is no text stored for this one. Add it again as a file or paste it.')).toBeVisible()

  // Add a piece, and the quick starts, open the Upload tab
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: /Ideas/ }).click()
  await pieces.getByRole('button', { name: 'Add a piece' }).click()
  await expect(material(page).getByRole('tab', { name: 'Upload' })).toHaveAttribute('aria-selected', 'true')

  // the strategy read's Create: the kind, an idea and the line that says where it came from
  const idea = 'Post the audit checklist. Show the three steps'
  await page.goto('/content-transformation?kind=newsletter&src=idea&idea=' + encodeURIComponent(idea) + '&from=read')
  await expect(toast(page, 'Filled in from the strategy read. Check it, then generate.')).toBeVisible()
  await expect(tile(page, 'Newsletter')).toHaveAttribute('aria-pressed', 'true')
  await expect(form(page).getByRole('textbox', { name: 'What point do you want to make?' })).toHaveValue(idea)
  await expect(page).toHaveURL(/\/content-transformation$/)
  await page.goto('/content-transformation?kind=email&src=upload&title=Audit+checklist&take=Three+steps&from=read')
  await expect(toast(page, 'Filled in from the strategy read. Add your material, then generate.')).toBeVisible()
  await expect(form(page).getByRole('textbox', { name: /Core takeaway/ })).toHaveValue('Three steps')
})

test('See everything it will use: what goes in, from the same pieces as the request', async ({ page }) => {
  await openWith(page, 'src=paste')
  await form(page).getByRole('button', { name: 'Try it with a sample article' }).click()
  await form(page).getByRole('textbox', { name: /Anything else\?/ }).fill('Mention the October webinar.')
  await side(page).getByRole('button', { name: 'See everything it will use' }).click()
  const d = page.getByRole('dialog', { name: 'Draft plan preview' })
  const p = d.getByTestId('plan-preview')
  await expect(d).toContainText('What the generator will use. Nothing is written until you press Generate.')
  await expect(p).toContainText('Thought leadership post · three openings')
  await expect(p).toContainText('This is the sample source. Swap in your own material for a real draft.')
  await expect(p).toContainText('Source: Article or blog post · 161 words')
  await expect(p).toContainText('Core takeaway: ' + SAMPLE.take)
  await expect(p).toContainText('Written for: Ops-minded founder (Founder, Small advisory firm, 5 to 20)')
  await expect(p).toContainText('Offer: Onboarding audit')
  await expect(p).toContainText('Call to action: Book a call: Onboarding audit')
  await expect(p).toContainText('Your answers: Length: Medium')
  await expect(p).toContainText('Notes: Mention the October webinar.')
  await expect(p).toContainText('Asked on earlier drafts: LinkedIn post: weak hook. / LinkedIn post: too long.')
  await expect(p).toContainText('Leaves out of the organic brief: The short version, Notable developments')
  await expect(p).toContainText('Organic signals lead: the Intel Tracker brief of ' + day(ib().created_at).replace(/ \d{4}$/, '') + ', waiting for review')
  await expect(p).toContainText('Fee talk is up')
  await expect(p).toContainText('Your saved voice: plain, direct')
  await expect(p).toContainText('The common belief')
  await expect(d.getByTestId('brief-warn')).toContainText('The organic brief is not reviewed yet.')
  await expect(d.getByTestId('brief-warn').getByRole('link', { name: 'Review it →' })).toHaveAttribute('href', '/briefs?run=' + INTEL_RUN)
  await d.getByRole('button', { name: 'Back to the form' }).click()
  await expect(d).toBeHidden()
  await side(page).getByRole('button', { name: 'See everything it will use' }).click()
  await d.getByRole('button', { name: 'Generate draft →' }).click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
})

test('on a phone the form fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWith(page, 'src=paste')
  await form(page).getByRole('button', { name: 'Try it with a sample article' }).click()
  await form(page).getByText('More options').click()
  await expect(side(page).getByTestId('generate')).toBeVisible()
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide).toBeLessThanOrEqual(0)
  // a draft of the newest kind is still reachable from Drafts
  await page.getByRole('tablist', { name: 'Content Transformation' }).getByRole('tab', { name: /Drafts/ }).click()
  await expect(page.getByTestId('draft-row').filter({ hasText: 'Why onboarding stalls' })).toHaveCount(1)
})
