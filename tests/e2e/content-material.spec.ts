import { type Page, expect, test } from '@playwright/test'
import path from 'node:path'
import { dayText } from '../../src/components/ui/local-date'
import { INTEL_RUN, contentRows, formRows } from './content-fixtures'
import { serveLogo, signIn, stubCalls, stubFathom, stubHook, stubReset, stubRows, stubSeed } from './helpers'

// Content Transformation's New draft, part 4c: a file read in the browser on Upload (PDF, Word, captions, web pages,
// text), a Fathom call's transcript on Fathom call (and from Calls' Use as content source), and Fill it in for me. On
// the made-up rows in tests/e2e/content-fixtures.ts, the made-up files in tests/fixtures and the Fathom calls in
// tests/stub/fixtures.mjs.

test.use({ timezoneId: 'UTC' })

type Row = Record<string, unknown>
const toast = (page: Page, text: string) => page.getByTestId('toasts').getByText(text, { exact: true })
const form = (page: Page) => page.getByTestId('content-new')
const side = (page: Page) => page.getByTestId('new-side')
const uses = (page: Page) => side(page).getByTestId('use-row')
const material = (page: Page) => form(page).getByRole('tablist', { name: 'Your material' })
const upload = (page: Page) => form(page).getByLabel('Upload a file')
const fileMsg = (page: Page) => form(page).getByTestId('file-msg')
const what = (page: Page) => form(page).getByRole('combobox', { name: 'What is this material?' })
const more = (page: Page) => form(page).getByTestId('more-options')
const sourceTitle = (page: Page) => more(page).getByRole('textbox', { name: 'Source title' })
const sourceText = (page: Page) => form(page).getByRole('textbox', { name: /^Source text/ })
const day = (iso: unknown) => dayText(String(iso), 'UTC')
const ib = () => contentRows().agent_outputs.find((o) => o.output_type === 'intel_brief')!
const FIX = (name: string) => path.join(__dirname, '..', 'fixtures', name)
const words = (t: string) => t.trim().split(/\s+/).length
const LONG =
  'Most firms lose a week to onboarding. The intake call, the forms and the checklist each wait on someone.\n\n' +
  'We cut that week by running one call, one form and one checklist, owned by one person. Clients start sooner.\n\n' +
  'If your onboarding takes longer than a week, start with the owner: one name next to every step.'
const file = (name: string, mimeType: string, text: string) => ({ name, mimeType, buffer: Buffer.from(text) })

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  await stubSeed({ ...contentRows(), ...formRows() })
})

test('Upload: a PDF, a Word file, captions, a web page and text are read here, and the draft goes out with the file', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await expect(material(page).getByRole('tab', { name: 'Upload' })).toHaveAttribute('aria-selected', 'true')
  await expect(form(page).getByTestId('drop-zone')).toContainText('Drop a file or browse')
  await expect(form(page).getByTestId('drop-zone')).toContainText('PDF, DOCX, TXT, VTT or SRT. Video and audio are still transcribed in the current dashboard.')

  // a PDF: both pages, a title from its name, guessed as a document
  await upload(page).setInputFiles(FIX('onboarding-week.pdf'))
  await expect(fileMsg(page)).toContainText('Loaded onboarding-week.pdf')
  await expect(form(page).getByTestId('drop-zone')).toContainText('onboarding-week.pdf')
  await expect(form(page).getByTestId('drop-zone')).toContainText(/\d+ words ready\. Drop another file to replace it\./)
  await expect(what(page)).toHaveValue('report')
  await more(page).locator('summary').click()
  await expect(sourceTitle(page)).toHaveValue('onboarding week')
  await expect(uses(page).nth(1)).toContainText(/Your fileonboarding-week\.pdf · \d+ words/)
  await fileMsg(page).getByRole('button', { name: 'See the text' }).click()
  await expect(material(page).getByRole('tab', { name: 'Paste' })).toHaveAttribute('aria-selected', 'true')
  const pdfText = await sourceText(page).inputValue()
  expect(pdfText).toContain('Most firms lose a week to onboarding.')
  expect(pdfText).toContain('Start with the owner: one name next to every step of the onboarding checklist.')
  expect(pdfText).toMatch(/one person on the team\.[\s\S]*\n\n[\s\S]*What changed/)

  // a Word file: its title replaces the PDF's (a file's title is the file's own), and the guess stays a document
  await material(page).getByRole('tab', { name: 'Upload' }).click()
  await upload(page).setInputFiles(FIX('meeting-notes.docx'))
  await expect(fileMsg(page)).toContainText('Loaded meeting-notes.docx')
  await expect(sourceTitle(page)).toHaveValue('meeting notes')
  await expect(what(page)).toHaveValue('report')
  await material(page).getByRole('tab', { name: 'Paste' }).click()
  await expect(sourceText(page)).toHaveValue('Meeting notes for Pat Example (made up for the tests).\n\nThey want one workflow automated first: client intake.')

  // captions lose their timings and cue numbers, and read as a video
  await material(page).getByRole('tab', { name: 'Upload' }).click()
  await upload(page).setInputFiles(
    file('webinar_q3-recap.vtt', 'text/vtt', 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Sam>Welcome to the recap.\n\n2\n00:00:05.000 --> 00:00:09.000\nToday we cover the onboarding week and what changed.\n'),
  )
  await expect(fileMsg(page)).toContainText('Loaded webinar_q3-recap.vtt')
  await expect(what(page)).toHaveValue('video')
  await expect(sourceTitle(page)).toHaveValue('webinar q3 recap')
  await material(page).getByRole('tab', { name: 'Paste' }).click()
  await expect(sourceText(page)).toHaveValue('Welcome to the recap.\nToday we cover the onboarding week and what changed.')

  // what is this material, picked by hand, stays; a typed title stays too
  await what(page).selectOption('interview')
  await sourceTitle(page).fill('Our onboarding story')
  await material(page).getByRole('tab', { name: 'Upload' }).click()
  await upload(page).setInputFiles(
    file(
      'story.html',
      'text/html',
      '<html><head><style>p{color:red}</style><script>window.x=1</script></head><body><nav>Home · About</nav><h1>The onboarding week</h1><p>' +
        LONG.replace(/\n\n/g, '</p><p>') +
        '</p><footer>© Example</footer></body></html>',
    ),
  )
  await expect(fileMsg(page)).toContainText('Loaded story.html')
  await expect(what(page)).toHaveValue('interview')
  await expect(sourceTitle(page)).toHaveValue('Our onboarding story')
  await material(page).getByRole('tab', { name: 'Paste' }).click()
  const html = await sourceText(page).inputValue()
  expect(html.startsWith('The onboarding week\nMost firms lose a week to onboarding.')).toBe(true)
  for (const gone of ['Home · About', '© Example', 'window.x', 'color:red']) expect(html).not.toContain(gone)

  // the draft goes out with the file's name, its text and what it is
  await material(page).getByRole('tab', { name: 'Upload' }).click()
  await side(page).getByTestId('generate').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  const req = (await stubRows<Row>('content_requests')).find((r) => r.title === 'Our onboarding story')!
  expect(req).toMatchObject({ source_file_name: 'story.html', source_type: 'interview', start_mode: 'source' })
  expect(String(req.source_text)).toContain('Most firms lose a week to onboarding.')
  expect((req.setup as Row).source).toBe('upload')
  // the file is gone from the form after the send, the choice of what it is stays
  await expect(form(page).getByTestId('drop-zone')).toContainText('Drop a file or browse')
  await expect(fileMsg(page)).toHaveText('')
  await expect(what(page)).toHaveValue('interview')
})

test('Upload: files it cannot read say why, and video and audio point to the current dashboard', async ({ page }) => {
  await signIn(page, '/content-transformation')
  const cases: [Parameters<Page['setInputFiles']>[1], string][] = [
    [file('photo.png', 'image/png', 'not really a picture'), 'That file type is not supported. Use TXT, MD, PDF, DOCX, VTT or SRT.'],
    [file('notes.doc', 'application/msword', 'old Word'), 'That file type is not supported. Use TXT, MD, PDF, DOCX, VTT or SRT.'],
    [file('short.txt', 'text/plain', 'Too short.'), 'No readable text in that file. If it is a scanned PDF, paste the text instead.'],
    [file('broken.pdf', 'application/pdf', 'this is not a PDF at all, only some words'), 'Could not read that PDF. It may be damaged. Paste the text instead.'],
    [file('broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'not a zip'), 'Could not read that Word file. It may be damaged. Paste the text instead.'],
  ]
  for (const [f, msg] of cases) {
    await upload(page).setInputFiles(f)
    await expect(fileMsg(page)).toHaveText(msg)
    await expect(fileMsg(page)).toHaveClass(/text-bad/)
  }
  // nothing was taken in from those
  await expect(uses(page).nth(1)).toContainText('Your fileNo file yet')

  await upload(page).setInputFiles(file('episode-12.mp3', 'audio/mpeg', 'ID3'))
  await expect(fileMsg(page)).toContainText('Video and audio are still transcribed in the current dashboard. Open it there, or paste a transcript instead.')
  await expect(fileMsg(page).getByRole('link', { name: 'Open the current dashboard' })).toHaveAttribute('href', /\/dashboard\/content-transformation$/)

  // a good file after a bad one is read as usual
  await upload(page).setInputFiles(file('notes.md', 'text/markdown', LONG))
  await expect(fileMsg(page)).toContainText('Loaded notes.md')
  await expect(fileMsg(page)).toHaveClass(/text-good/)
  await expect(uses(page).nth(1)).toContainText('Your filenotes.md · ' + words(LONG) + ' words')
  await expect(side(page).getByTestId('generate')).toBeEnabled()
})

test('Fathom call: the newest calls with search, a pick fills the material, and the request says it was a call', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await material(page).getByRole('tab', { name: 'Fathom call' }).click()
  const box = form(page).getByTestId('fathom')
  await expect(box).toContainText('Pick a recorded call. Its transcript becomes your material.')
  const rows = box.getByRole('list', { name: 'Fathom calls' }).getByRole('button')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0)).toContainText('Discovery consultation with Robin')
  await expect(rows.nth(0)).toContainText('Client')
  await expect(rows.nth(0)).toContainText('Wed, Nov 4 · 5:00 PM · 45 min')
  await expect(rows.nth(2)).toContainText('Team sync')
  await expect(rows.nth(2)).not.toContainText('Client')

  // search reads the people on a call, as Calls' search does
  const search = box.getByRole('searchbox', { name: 'Search calls' })
  await search.fill('pat example')
  await expect(rows).toHaveText([/Catch-up with Pat/])
  await search.fill('nobody at all')
  await expect(box).toContainText('No calls match that.')
  await search.fill('')

  await rows.filter({ hasText: 'Discovery consultation with Robin' }).click()
  await expect(toast(page, 'Call transcript loaded as the source')).toBeVisible()
  const transcript = 'Robin Sample: We spend hours on onboarding paperwork.\nQA Teammate: What would you stop doing first?'
  await expect(form(page).getByTestId('material-line')).toContainText(words(transcript) + ' words ready from “Discovery consultation with Robin”')
  await expect(box.getByRole('button', { name: 'Pick another call' })).toBeVisible()
  await expect(what(page)).toHaveValue('call')
  await expect(uses(page).nth(1)).toContainText('Fathom callDiscovery consultation with Robin · ' + words(transcript) + ' words')
  await form(page).getByTestId('material-line').getByRole('button', { name: 'See the text' }).click()
  await expect(sourceText(page)).toHaveValue(transcript)
  await expect(form(page).getByRole('textbox', { name: 'Link to an article, blog post or YouTube video' })).toHaveValue('https://fathom.video/share/robinDiscovery01')

  // a short transcript is not enough to generate; another call's title replaces this one's
  await material(page).getByRole('tab', { name: 'Fathom call' }).click()
  await box.getByRole('list', { name: 'Fathom calls' }).getByRole('button', { name: /Catch-up with Pat/ }).click()
  await expect(form(page).getByTestId('material-line')).toContainText('words ready from “Catch-up with Pat”')
  await expect(side(page).getByTestId('generate')).toBeDisabled()

  // a call with a full transcript goes out as a call
  await stubFathom({
    connected: true,
    hint: 'k123',
    items: [{ id: 9101, title: 'Workshop with Lee', start: '2026-11-10T15:00:00Z', end: '2026-11-10T15:30:00Z', invitees: [], share_url: 'https://fathom.video/share/leeWorkshop0001' }],
    transcripts: { 9101: LONG.split('\n\n').map((t, i) => ({ speaker: i % 2 ? 'Lee Ready' : 'QA Teammate', t: '00:0' + i, text: t })) },
  })
  await page.reload()
  await material(page).getByRole('tab', { name: 'Fathom call' }).click()
  await form(page).getByTestId('fathom').getByRole('button', { name: /Workshop with Lee/ }).click()
  await expect(form(page).getByTestId('material-line')).toContainText('words ready from “Workshop with Lee”')
  await side(page).getByTestId('generate').click()
  await expect(toast(page, 'Draft started. It usually takes about a minute.')).toBeVisible()
  const req = (await stubRows<Row>('content_requests')).find((r) => r.title === 'Workshop with Lee')!
  expect(req).toMatchObject({ source_type: 'call', source_url: 'https://fathom.video/share/leeWorkshop0001', source_file_name: null })
  expect(String(req.source_text)).toContain('QA Teammate: Most firms lose a week to onboarding.')
  expect((req.setup as Row).source).toBe('fathom')
})

test('Fathom call: not connected, no transcript, and Calls’ Use as content source', async ({ page }) => {
  await stubFathom({ connected: false })
  await signIn(page, '/content-transformation')
  await material(page).getByRole('tab', { name: 'Fathom call' }).click()
  const box = form(page).getByTestId('fathom')
  await expect(box).toContainText('Fathom is not connected yet.')
  await expect(box.getByRole('link', { name: 'Connect Fathom' })).toHaveAttribute('href', '/calls')

  // a call with no transcript says so and the picker stays
  await stubFathom({ connected: true, hint: 'k123', items: [{ id: 9999, title: 'Silent call', start: '2026-11-10T15:00:00Z', end: '2026-11-10T15:05:00Z', invitees: [] }] })
  await page.reload()
  await material(page).getByRole('tab', { name: 'Fathom call' }).click()
  await box.getByRole('button', { name: /Silent call/ }).click()
  await expect(toast(page, 'Fathom has no transcript for this call.')).toBeVisible()
  await expect(box.getByRole('list', { name: 'Fathom calls' })).toBeVisible()

  // Calls: Use as content source opens New draft on the Fathom call tab with the call's transcript
  await stubFathom({ connected: true, hint: 'k123' })
  await page.goto('/calls?call=9001')
  const use = page.getByRole('link', { name: '✎ Use as content source' })
  await expect(use).toHaveAttribute('href', '/content-transformation?call=9001&title=Discovery+consultation+with+Robin&link=https%3A%2F%2Ffathom.video%2Fshare%2FrobinDiscovery01')
  await use.click()
  await expect(page).toHaveURL(/\/content-transformation$/)
  await expect(toast(page, 'Call transcript loaded as the source')).toBeVisible()
  await expect(material(page).getByRole('tab', { name: 'Fathom call' })).toHaveAttribute('aria-selected', 'true')
  await expect(form(page).getByTestId('material-line')).toContainText('ready from “Discovery consultation with Robin”')
  await expect(form(page).getByTestId('fathom').getByRole('button', { name: 'Pick another call' })).toBeVisible()
  await expect(what(page)).toHaveValue('call')
  await expect(form(page).getByRole('textbox', { name: /^Core takeaway/ })).toBeFocused()
})

test('Fill it in for me: a new idea from the newest brief, with the reasons, Undo, and what it was sent', async ({ page }) => {
  await signIn(page, '/content-transformation')
  await material(page).getByRole('tab', { name: 'New idea' }).click()
  await form(page).getByTestId('fill-go').click()
  const strip = form(page).getByTestId('fill-strip')
  await expect(strip).toContainText('Filled in from the organic brief of ' + day(ib().created_at))
  await expect(strip).toContainText('Built on “Buyers ask where to begin before what to buy”. Change anything, then generate.')
  const thesis = form(page).getByRole('textbox', { name: 'What point do you want to make?' })
  await expect(thesis).toHaveValue(/^We think most firms start with the tool\./)
  const whys = form(page).getByTestId('fill-why')
  await expect(whys.filter({ hasText: 'The brief’s top finding: buyers ask where to begin.' })).toBeVisible()
  // More options opens, with the voice, the structure and the call to action it picked, each with its reason
  await expect(more(page)).toHaveAttribute('open', '')
  await expect(more(page).getByRole('combobox', { name: 'Voice' })).toHaveValue('Use my saved voice')
  await expect(more(page).getByRole('combobox', { name: 'Structure' })).toHaveValue('builtin:problem')
  await expect(whys.filter({ hasText: 'Your saved voice keeps it sounding like you.' })).toBeVisible()
  await expect(whys.filter({ hasText: 'The brief found that problem-first posts land.' })).toBeVisible()
  await expect(whys.filter({ hasText: 'The brief says buyers want a small first step.' })).toBeVisible()

  // what it was sent: the kind, the briefs, who it is for, and the choices the form offers
  const sent = (await stubCalls()).filter((c) => c.path === '/webhook/e3-autofill').map((c) => c.body as Row)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ page: 'ct', format: 'thought_leadership', content_type: 'thought_leadership', start: 'idea', organic_run: INTEL_RUN, requested_by: 'qa.teammate@aiparagonconsulting.com' })
  expect(sent[0].typed).toEqual({ thesis: '', audience: 'Ops-minded founder (Founder, Small advisory firm, 5 to 20)', pain: '' })
  expect(((sent[0].options as Row).voice as Row[]).map((o) => o.value)).toEqual(['Use my saved voice', 'Match my source', 'Clear and authoritative', 'Conversational'])
  expect(((sent[0].options as Row).structure as Row[])[0]).toEqual({ value: '', label: 'The usual thought leadership shape' })

  // a reason goes once its field is changed by hand; a click shows a reason whole
  await thesis.fill(await thesis.inputValue() + ' And we have seen it work.')
  await expect(whys.filter({ hasText: 'The brief’s top finding' })).toHaveCount(0)
  const v = whys.filter({ hasText: 'Your saved voice' })
  await v.click()
  await expect(v).toHaveAttribute('aria-expanded', 'true')

  // Undo puts back what was there before
  await strip.getByRole('button', { name: 'Undo' }).click()
  await expect(toast(page, 'Put back what was there before.')).toBeVisible()
  await expect(thesis).toHaveValue('')
  await expect(strip).toHaveCount(0)
  await expect(whys).toHaveCount(0)

  // what was typed is kept, and the strip says so
  await thesis.fill('Our point: onboarding should take days, not weeks, and one owner per step is how we get there for every client.')
  await form(page).getByTestId('fill-go').click()
  await expect(strip).toContainText('Kept what you typed. Change anything, then generate.')
  await expect(thesis).toHaveValue('Our point: onboarding should take days, not weeks, and one owner per step is how we get there for every client.')

  // another kind, and the fill is done with
  await form(page).getByTestId('kind-tile').filter({ hasText: 'Newsletter' }).click()
  await expect(strip).toHaveCount(0)
  await expect(whys).toHaveCount(0)
})

test('Fill it in for me: with no material it picks a piece of the team’s own; with material it keeps it', async ({ page }) => {
  const piece = {
    id: '9a000000-0000-4000-8000-0000000000aa',
    title: 'Why onboarding takes a week',
    format: 'newsletter',
    status: 'ready',
    hooks: [],
    body: LONG,
    cta: '',
    headline: '',
    tags: [],
    notes: '',
    source_draft_id: null,
    source_request_id: null,
    created_by: 'sam@aiparagonconsulting.com',
    updated_by: 'sam@aiparagonconsulting.com',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  }
  await stubSeed({ content_pieces: [...contentRows().content_pieces, piece] })
  await signIn(page, '/content-transformation')
  await form(page).getByTestId('fill-go').click()
  const strip = form(page).getByTestId('fill-strip')
  await expect(strip).toContainText('Filled in from the organic brief of')
  await expect(form(page).getByTestId('material-line')).toContainText(words(LONG) + ' words ready from “Why onboarding takes a week”')
  await expect(form(page).getByTestId('fill-why').filter({ hasText: 'Picked from your library: “Why onboarding takes a week”. It answers the question the brief says buyers ask most.' })).toBeVisible()
  const take = form(page).getByRole('textbox', { name: /^Core takeaway/ })
  await expect(take).toHaveValue('Start with one meeting type, not the tool.')
  await expect(what(page)).toHaveValue('other')
  let sent = (await stubCalls()).filter((c) => c.path === '/webhook/e3-autofill').map((c) => c.body as Row)
  expect(sent[0]).toMatchObject({ start: 'source', typed: { title: '', take: '', text: '' } })

  // Undo takes the picked piece back out
  await strip.getByRole('button', { name: 'Undo' }).click()
  await expect(form(page).getByTestId('material-line')).toHaveCount(0)
  await expect(take).toHaveValue('')

  // with the team's own material on the form, it is sent and kept, and a typed takeaway stays
  await material(page).getByRole('tab', { name: 'Paste' }).click()
  await sourceText(page).fill(LONG)
  await take.fill('One owner per step.')
  await form(page).getByTestId('fill-go').click()
  await expect(strip).toContainText('Kept what you typed.')
  await expect(sourceText(page)).toHaveValue(LONG)
  await expect(take).toHaveValue('One owner per step.')
  sent = (await stubCalls()).filter((c) => c.path === '/webhook/e3-autofill').map((c) => c.body as Row)
  expect(sent[1]).toMatchObject({ start: 'source', typed: { take: 'One owner per step.', text: LONG } })
})

test('Fill it in for me: what stops it is said, with Try again; flags show in the strip', async ({ page }) => {
  // no organic brief yet
  await stubSeed({ agent_outputs: contentRows().agent_outputs.filter((o) => o.output_type !== 'intel_brief') })
  await signIn(page, '/content-transformation')
  await form(page).getByTestId('fill-go').click()
  const strip = form(page).getByTestId('fill-strip')
  await expect(strip).toContainText('Could not fill it in')
  await expect(strip).toContainText('There is no organic brief yet. Run the Intel Tracker first.')
  expect((await stubCalls()).filter((c) => c.path === '/webhook/e3-autofill')).toHaveLength(0)

  // the workflow switched off, then answering that it could not
  await stubSeed({ ...contentRows() })
  await stubHook('e3-autofill', 404, { code: 404, message: 'not registered' })
  await strip.getByRole('button', { name: 'Try again' }).click()
  await expect(strip).toContainText('Auto-fill is switched off in n8n. Turn on “Engine 3 · Auto-fill” and try again.')
  await stubHook('e3-autofill', 200, { ok: false, code: 'no_material', message: 'There is nothing of yours to repurpose yet. Add a source on this page or a file in Files, or switch to Describe a new idea.' })
  await strip.getByRole('button', { name: 'Try again' }).click()
  await expect(strip).toContainText('There is nothing of yours to repurpose yet.')

  // figures it could not find in the briefs are flagged
  await material(page).getByRole('tab', { name: 'New idea' }).click()
  await stubHook('e3-autofill', 200, {
    ok: true,
    filled: { thesis: 'We saw onboarding drop from 9 days to 4 days for every client who named one owner per step of the work.', audience: 'Founders' },
    why: {},
    based_on: 'Owners make onboarding faster',
    used: { organic_brief: { run_id: INTEL_RUN, created_at: ib().created_at }, lead: 'organic' },
    flags: ['Check these figures before you generate. They are not in your briefs or your material: 9 days'],
  })
  await form(page).getByTestId('fill-go').click()
  await expect(strip).toContainText('Check these figures before you generate. They are not in your briefs or your material: 9 days')
})
