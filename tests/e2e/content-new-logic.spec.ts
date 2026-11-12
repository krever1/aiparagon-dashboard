import { expect, test } from '@playwright/test'
import {
  type Ask, type Ctx, type Form, CATS, SAMPLE, adTypeLine, afterSend, answersLine, answersMap, asksFor, blankForm, briefUse, briefWarn, buildRequest, catOf,
  ctaList, dbErr, feedbackLines, feedbackUse, formFrom, getsOf, hintOf, ideaThesis, leaveOutOf, materialLine, materialUse, mustOf, mustSuggest,
  newDraftHref, offerLine, offerOf, personaLine, personaOf, pickBrief, prefillOf, proofOf, readHref, readyOf, splitAsk, structChoices, structOf, tplOf,
  typeOf, usesNote, voiceOpts,
} from '../../src/lib/pipeline/content-new'
import { FM, formRows } from './content-fixtures'

// The New draft form's rules, without a browser: what each kind is filed as, the categories, the questions, the shapes,
// the request a send writes (as Content from Source reads it), what the side pane says, and the addresses that fill the
// form in. The fixtures are made up.

const NOW = Date.parse('2026-11-12T12:00:00Z')
const D = 864e5
const at = (ms: number) => new Date(NOW - ms).toISOString()
const R = formRows()
const ctx = (o: Partial<Ctx> = {}): Ctx => ({
  email: 'qa.teammate@aiparagonconsulting.com',
  personas: R.client_personas.filter((p) => !p.archived).map(personaOf),
  offers: R.offers.map(offerOf),
  templates: R.doc_templates.filter((t) => t.active).map(tplOf),
  voice: { createdAt: at(4 * D), tone: ['plain', 'direct'] },
  leaveOut: ['The short version', 'Notable developments'],
  asks: [],
  now: NOW,
  ...o,
})
const TEXT = 'Most firms lose a week to onboarding. '.repeat(10).trim()
const form = (o: Partial<Form> = {}): Form => ({ ...blankForm(), src: 'paste', text: TEXT, ...o })
type Row = Record<string, unknown>
const ok = (b: ReturnType<typeof buildRequest>) => {
  if (!b.ok) throw new Error(b.error)
  return b.row as Row & { setup: Row; template: Row }
}

test('kinds: each is filed under one of the four formats, and the category picks the kind of post', () => {
  expect(catOf('thought_leadership', undefined)).toBe('opinion')
  expect(catOf('newsletter', undefined)).toBe('news')
  expect(catOf('adcopy', undefined)).toBe('ad_image')
  expect(catOf('email', 'news')).toBe('')
  expect(catOf('report', 'case_studies')).toBe('case_studies')
  expect(catOf('report', 'events')).toBe('research')
  expect(typeOf('thought_leadership', 'case_studies')).toBe('social_proof')
  expect(typeOf('thought_leadership', 'audio_video')).toBe('video_script')
  expect(typeOf('newsletter', 'articles')).toBe('article')
  expect(typeOf('newsletter', 'research')).toBe('newsletter')
  expect(typeOf('adcopy', 'ad_text')).toBe('ad')
  expect(typeOf('how_to', 'opinion')).toBe('how_to')
  expect(CATS.email).toEqual([])
  expect(adTypeLine('ad_carousel')).toBe('A carousel: one idea across five to seven slides, then the call to action.')
  expect(adTypeLine('ad_image')).toBe('Ad copy from your material: a body, three hooks and a call to action.')
  expect(getsOf('newsletter', 'article')).toEqual(['1 article with short sections', '3 title options'])
  expect(getsOf('newsletter', 'newsletter')).toEqual(['1 issue with short sections', '3 subject lines'])
  // the four formats content_requests takes
  for (const [k, cat, format, type] of [
    ['thought_leadership', 'events', 'thought_leadership', 'event'],
    ['newsletter', 'articles', 'newsletter', 'article'],
    ['email', '', 'email', 'email'],
    ['adcopy', 'ad_video', 'ad', 'ad_video'],
    ['report', '', 'newsletter', 'report'],
    ['white_paper', '', 'newsletter', 'white_paper'],
    ['news_article', '', 'newsletter', 'news_article'],
    ['how_to', '', 'newsletter', 'how_to'],
    ['event_kit', '', 'thought_leadership', 'event_kit'],
    ['deck', '', 'thought_leadership', 'deck'],
    ['webinar_deck', '', 'thought_leadership', 'webinar_deck'],
    ['video', '', 'thought_leadership', 'video'],
    ['clips', '', 'thought_leadership', 'clips'],
    ['other', '', 'thought_leadership', 'other'],
  ] as const) {
    const row = ok(buildRequest(form({ kind: k, cat: cat ? { [k]: cat } : {} }), ctx()))
    expect([k, row.format, row.content_type]).toEqual([k, format, type])
  }
})

test('a LinkedIn post from pasted text: the row as Content from Source reads it', () => {
  const f = form({
    title: '  Why onboarding stalls ',
    take: 'Name an owner.',
    url: 'https://example.com/onboarding',
    must: ['Five days saved on onboarding'],
    notes: 'Keep it short.',
    answers: { thought_leadership: { goal: 'Share a point of view', topics: '  intake first ' } },
  })
  const asks: Ask[] = [
    { feedback: 'LinkedIn post: weak hook.', createdAt: at(1 * D), kind: 'thought_leadership' },
    { feedback: 'Newsletter: too long.', createdAt: at(0.5 * D), kind: 'newsletter' },
  ]
  const b = buildRequest(f, ctx({ asks }))
  const row = ok(b)
  expect(b.ok && b.templateId).toBe(null)
  expect(row).toMatchObject({
    requested_by: 'qa.teammate@aiparagonconsulting.com',
    start_mode: 'source',
    format: 'thought_leadership',
    content_type: 'thought_leadership',
    desired_action: 'Book a call: Onboarding audit',
    voice: 'Use my saved voice',
    status: 'queued',
    source_type: 'article',
    title: 'Why onboarding stalls',
    source_url: 'https://example.com/onboarding',
    source_text: TEXT,
    takeaway: 'Name an owner.',
    source_file_name: null,
  })
  // the setup, in the order the current dashboard builds it
  expect(Object.keys(row.setup)).toEqual([
    'type', 'persona_id', 'persona', 'offer_id', 'offer', 'cta', 'angle', 'source', 'must_use', 'feedback', 'questions', 'notes', 'format_label', 'category', 'category_name',
  ])
  expect(row.setup).toEqual({
    type: 'thought_leadership',
    persona_id: FM.founder,
    persona: 'Ops-minded founder',
    offer_id: FM.audit,
    offer: 'Onboarding audit',
    cta: 'Book a call: Onboarding audit',
    angle: null,
    source: 'paste',
    must_use: ['Five days saved on onboarding'],
    // its own kind first
    feedback: ['LinkedIn post: weak hook.', 'Newsletter: too long.'],
    questions: { 'What is it for?': 'Share a point of view', Length: 'Medium', 'Topics or messages to stress': 'intake first' },
    notes: 'Keep it short.',
    format_label: 'LinkedIn post',
    category: 'opinion',
    category_name: 'Opinion and frameworks',
  })
  expect(row.template).toEqual({
    name: 'Thought leadership',
    format: 'thought_leadership',
    description:
      'A LinkedIn post with your point of view, and three openings to pick from. The team answered: What is it for?: Share a point of view. Length: Medium. Topics or messages to stress: intake first. Notes from the team: Keep it short.',
    sections: [
      { title: 'The common belief', guidance: 'What most of the market assumes.' },
      { title: 'What we see', guidance: 'Our point of view, from the material.' },
      { title: 'Why it matters', guidance: 'An example or fact from the material, and what to do with it.' },
    ],
    rules:
      'Leave these parts of the organic brief out: The short version, Notable developments. ' +
      'Write it as a point of view: one clear opinion, backed by the material. ' +
      'Write for Ops-minded founder (Founder, Small advisory firm, 5 to 20). Their main pain: Onboarding eats a week of every new client. ' +
      'The offer to point to: Onboarding audit (A review of your intake and a one-page plan.). Mention it once, near the end, as the natural next step. ' +
      'It must use these, word for word where they are figures, names or offers: Five days saved on onboarding. Leave one out only if the material does not support it, and say so in the review notes.',
    example_text: '',
  })
  expect(row.template_id).toBeUndefined()
})

test('the material: too little, the sample, a file name, the cap; an idea: who it is for, the proof and the title', () => {
  expect(buildRequest(form({ text: 'Too short.' }), ctx())).toEqual({
    ok: false,
    error: 'Add your material first, at least a few paragraphs: a file, pasted text, a link or a Fathom call.',
  })
  const s = ok(buildRequest(form({ text: SAMPLE.text, title: SAMPLE.title }), ctx()))
  expect(s.title).toBe('Sample · Why AI pilots stall after week three')
  expect(ok(buildRequest(form({ fileName: 'onboarding.pdf' }), ctx())).title).toBe('onboarding.pdf')
  expect(ok(buildRequest(form({ type: 'not-a-type' }), ctx())).source_type).toBe('article')
  expect(ok(buildRequest(form({ type: 'call' }), ctx())).source_type).toBe('call')
  expect(String(ok(buildRequest(form({ text: 'x'.repeat(130_000) }), ctx())).source_text).length).toBe(120_000)
  expect(ok(buildRequest(form({ title: '' }), ctx())).title).toBe(null)

  expect(buildRequest(form({ src: 'idea', thesis: 'Too short to build on.' }), ctx())).toEqual({
    ok: false,
    error: 'Say a little more about the point you want to make, a few sentences, so there is something real to build from.',
  })
  const th = 'Most firms buy the tool first. They should name the owner of the workflow before anything else happens.'
  const idea = ok(buildRequest(form({ src: 'idea', thesis: th, proof: 'A client lost ten days.', must: ['$497 Onboarding audit'] }), ctx()))
  expect(idea).toMatchObject({
    start_mode: 'idea',
    audience: 'Ops-minded founder (Founder, Small advisory firm, 5 to 20)',
    pain: 'Onboarding eats a week of every new client.',
    thesis: th,
    proof: 'A client lost ten days.\n\nIt must use: $497 Onboarding audit',
    title: 'Most firms buy the tool first',
  })
  expect(idea.source_text).toBeUndefined()
  // anyone who follows us, and nothing to sell
  const any = ok(buildRequest(form({ src: 'idea', thesis: th, per: 'any', off: 'none' }), ctx()))
  expect(any).toMatchObject({ audience: 'Everyone who follows us', pain: null, proof: null, desired_action: 'Reply or comment' })
  expect(String(any.template.rules)).toContain('Write for everyone who follows us, not one buyer. Do not sell anything. Give value, then the call to action.')
  expect(any.setup).toMatchObject({ persona_id: null, persona: null, offer_id: null, offer: null })
})

test('a paid ad: the ad type is its content type, and a carousel or video ad keeps the answers after its own shape', () => {
  const img = ok(buildRequest(form({ kind: 'adcopy' }), ctx()))
  expect(img).toMatchObject({ format: 'ad', content_type: 'ad_image', desired_action: 'Book a call: Onboarding audit' })
  expect(img.setup).toMatchObject({ type: 'ad', category: 'ad_image', category_name: 'Image ad', ad_type: 'ad_image', questions: { Length: 'Short' } })
  expect(img.template).toMatchObject({
    name: 'Paid ad',
    format: 'ad',
    description: 'One ad body from your material, three hooks to test, a call to action and a headline. The team answered: Length: Short.',
    sections: [{ title: 'Follow the ads brief', guidance: 'Order the body the way the copy formula in the ads brief does, with each hook as the opening.' }],
    rules:
      'Leave these parts of the organic brief out: The short version, Notable developments. Write for Ops-minded founder (Founder, Small advisory firm, 5 to 20). Their main pain: Onboarding eats a week of every new client. The offer: Onboarding audit (A review of your intake and a one-page plan.).',
  })
  const car = ok(buildRequest(form({ kind: 'adcopy', cat: { adcopy: 'ad_carousel' }, notes: 'Use the green.' }), ctx({ leaveOut: [] })))
  expect(car.content_type).toBe('ad_carousel')
  expect(car.template.name).toBe('Carousel ad')
  expect(car.template.description).toBe(
    'A carousel: one idea across five to seven slides, then the call to action. The team answered: Length: Short. Notes from the team: Use the green.',
  )
  expect((car.template.sections as Row[]).map((s) => s.title)).toEqual(['Slide 1: the hook', 'Slides 2 to 5: the points', 'Last slide: the ask'])
  expect(String(car.template.rules)).toMatch(/^Write it slide by slide: under 20 words a slide\. Give the caption that goes with the carousel as the body\. Write for Ops-minded/)
  // what they should do lists the offer's step and the usual two
  expect(ctaList('ad', offerOf(R.offers[1]))).toEqual(['Book a call: Onboarding audit', 'Reply or comment', 'Follow for more'])
})

test('structure: the usual shape, a simple shape, or a team template, counted once it goes out', () => {
  const c = ctx()
  expect(structChoices('thought_leadership', 'social_proof', c.templates)).toEqual({
    first: 'The usual social proof shape',
    shapes: [
      { value: 'builtin:problem', label: 'Problem → insight → next step' },
      { value: 'builtin:story', label: 'Story → lesson → action' },
      { value: 'builtin:myth', label: 'Common belief → what is true → proof' },
      { value: 'builtin:steps', label: 'Practical steps' },
    ],
    templates: [{ value: FM.story, label: 'Client story' }],
  })
  expect(structChoices('adcopy', 'ad', c.templates).first).toBe('Let the brief suggest a structure')
  expect(structChoices('adcopy', 'ad', c.templates).templates).toEqual([])
  // a template for anything else shows under Something else only
  expect(structChoices('other', 'other', c.templates).templates.map((t) => t.label)).toEqual(['Client story', 'One-pager'])
  expect(structChoices('report', 'report', c.templates).templates).toEqual([])
  expect(structOf('builtin:story', 'adcopy', 'ad', c.templates)).toBe('')
  expect(structOf(FM.story, 'thought_leadership', 'thought_leadership', c.templates)).toBe(FM.story)

  const shape = ok(buildRequest(form({ struct: 'builtin:story', must: [] }), ctx({ leaveOut: [] })))
  // the shape's description reads as the current dashboard sends it, the answers after it
  expect(shape.template).toMatchObject({ name: 'Story → lesson → action', format: 'thought_leadership', description: 'A simple shape picked in the dashboard The team answered: Length: Medium.' })
  expect(String(shape.template.rules)).toMatch(/^Write it as a point of view: one clear opinion, backed by the material\. Write for Ops-minded/)
  const b = buildRequest(form({ struct: FM.story }), ctx({ leaveOut: [] }))
  const row = ok(b)
  expect(b.ok && b.templateId).toBe(FM.story)
  expect(row.template_id).toBe(FM.story)
  expect(row.template).toMatchObject({ name: 'Client story', format: 'thought_leadership', sections: R.doc_templates[0].sections })
  expect(String(row.template.rules)).toMatch(/^Name the client only with their permission\. Write it as a point of view/)
  // a paid ad does not take a post's shape: it goes with the brief's own
  expect(ok(buildRequest(form({ kind: 'adcopy', struct: 'builtin:story' }), ctx())).template.name).toBe('Paid ad')
})

test('questions: defaults, a switched-off yes goes as false, typed answers are trimmed, unknown choices are left out', () => {
  expect(answersMap('newsletter', {})).toEqual({ Length: 'Short and simple', 'A short summary at the top': true, 'Suggest visuals': false, 'Suggest charts (only from figures in the material)': false })
  expect(answersLine('newsletter', {})).toBe('Length: Short and simple. A short summary at the top')
  expect(answersMap('webinar_deck', { include: ['Poll questions', 'Nonsense'] })).toEqual({ Length: '45 min', Include: ['Poll questions'], 'Speaker notes': true })
  expect(answersLine('webinar_deck', {})).toBe('Length: 45 min. Include: Q&A slide, Offer at the end. Speaker notes')
  expect(answersMap('thought_leadership', { length: 'Huge', topics: '   ' })).toEqual({})
  expect(answersMap('email', { recipient: '  advisers who downloaded it ' })).toEqual({ 'Who gets it?': 'advisers who downloaded it' })
  // the event kit's What to make went to its plan's parts
  expect(answersLine('event_kit', {})).toBe('The event: Webinar')
})

test('what was asked to change on earlier drafts: its own kind first, the last 120 days, at most six', () => {
  const asks: Ask[] = [
    { feedback: 'Newsletter: too long.', createdAt: at(1 * D), kind: 'newsletter' },
    { feedback: 'LinkedIn post: too salesy, weak hook. Cut the intro.', createdAt: at(2 * D), kind: 'thought_leadership' },
    { feedback: 'LinkedIn post: too long.', createdAt: at(3 * D), kind: 'thought_leadership' },
    { feedback: 'Old: off-voice.', createdAt: at(130 * D), kind: 'thought_leadership' },
    { feedback: '   ', createdAt: at(1 * D), kind: 'thought_leadership' },
    ...Array.from({ length: 6 }, (_, i) => ({ feedback: 'Email: unclear point. Note ' + i + '.', createdAt: at((4 + i) * D), kind: 'email' })),
  ]
  expect(asksFor(asks, 'thought_leadership', NOW).map((a) => a.feedback)).toEqual([
    'LinkedIn post: too salesy, weak hook. Cut the intro.',
    'LinkedIn post: too long.',
    'Newsletter: too long.',
    'Email: unclear point. Note 0.',
    'Email: unclear point. Note 1.',
    'Email: unclear point. Note 2.',
  ])
  expect(feedbackLines([{ feedback: 'x'.repeat(300), createdAt: at(1 * D), kind: '' }], 'email', NOW)[0]).toHaveLength(240)
  expect(splitAsk('LinkedIn post: too salesy, weak hook. Cut the intro.')).toEqual({ why: ['too salesy', 'weak hook'], note: 'Cut the intro.' })
  expect(splitAsk('Just make it better')).toEqual({ why: [], note: 'Just make it better' })
  expect(feedbackUse(asks, 'thought_leadership', NOW)).toEqual({
    ok: true,
    title: 'Feedback on earlier drafts',
    sub: 'Avoids what was asked before: unclear point (3), too long (2), too salesy · 4 notes',
  })
  expect(feedbackUse([], 'email', NOW)).toBe(null)
})

test('the side: the brief it leads with, the material, the voice, the line under Generate', () => {
  const day = (iso: string) => iso.slice(5, 10)
  const rows = [
    { runId: 'r3', createdAt: at(1 * D), decision: '' },
    { runId: 'r2', createdAt: at(3 * D), decision: 'approved' },
    { runId: 'r1', createdAt: at(31 * D), decision: 'changes' },
  ]
  const pick = pickBrief(rows)
  expect(pick.use?.runId).toBe('r2')
  expect(briefUse(pick, false, NOW, day)).toEqual({ ok: true, title: 'Organic brief · ' + day(at(3 * D)), sub: 'Approved', action: 'open' })
  expect(briefWarn(pick, false, NOW, day)).toEqual({ text: 'Uses the approved brief of ' + day(at(3 * D)) + '. A newer one is waiting for review.', link: 'brief' })
  expect(briefUse(pickBrief([rows[0]]), false, NOW, day)).toMatchObject({ ok: false, sub: 'Needs review', action: 'approve' })
  // undone or edited waits for a review again, as Approvals counts it
  expect(briefUse(pickBrief([{ ...rows[0], decision: 'reopened' }]), false, NOW, day)).toMatchObject({ sub: 'Needs review', action: 'approve' })
  expect(briefUse(pickBrief([rows[2]]), true, NOW, day)).toMatchObject({ ok: false, title: 'Ads brief · ' + day(at(31 * D)), sub: 'Changes asked, 31 days old', action: 'open' })
  // an ads brief more than 30 days old says to run the Ad Strategist again
  expect(briefWarn(pickBrief([rows[2]]), true, NOW, day)).toEqual({
    text: 'Changes were asked on the advertisement brief. It is from ' + day(at(31 * D)) + '. Run the Ad Strategist for fresher patterns.',
    link: 'agent',
  })
  expect(briefWarn(pickBrief([{ ...rows[2], createdAt: at(30 * D) }]), true, NOW, day)).toEqual({ text: 'Changes were asked on the advertisement brief.', link: 'brief' })
  expect(briefUse(pickBrief([]), true, NOW, day)).toEqual({ ok: false, title: 'No ads brief yet', sub: 'Run the Ad Strategist, or it uses your material and voice only', action: null })
  expect(briefWarn(pickBrief([]), false, NOW, day)).toEqual({ text: 'No organic brief yet. The draft uses your material and voice only.', link: 'agent' })

  expect(materialUse({ src: 'idea', thesis: 'A short idea', text: '', title: '', fileName: '' })).toEqual({ ok: false, title: 'Your idea', sub: 'A short idea (a little more, please)' })
  expect(materialUse({ src: 'fathom', thesis: '', text: '', title: '', fileName: '' })).toEqual({ ok: false, title: 'Fathom call', sub: 'No call picked yet' })
  expect(materialUse({ src: 'paste', thesis: '', text: SAMPLE.text, title: SAMPLE.title, fileName: '' })).toEqual({
    ok: true,
    title: 'Pasted text',
    sub: 'Why AI pilots stall after week three · 161 words · sample',
  })
  expect(materialUse({ src: 'upload', thesis: '', text: 'Only a line.', title: 'T', fileName: 'notes.txt' }).sub).toBe('notes.txt · 3 words, add a few more paragraphs')
  expect(materialLine({ src: 'upload', text: 'Some words here', title: 'A call', fileName: '' })).toBe('3 words ready from “A call”')
  expect(materialLine({ src: 'paste', text: 'Some words here', title: '', fileName: '' })).toBe(null)
  expect(readyOf({ src: 'paste', text: TEXT, thesis: '' })).toBe(true)
  expect(hintOf({ src: 'idea', text: TEXT, thesis: 'no' }, 2)).toBe('Write your point in step 2 to generate.')
  expect(hintOf({ src: 'paste', text: 'no', thesis: '' }, 2)).toBe('Add your material in step 2 to generate.')
  expect(hintOf({ src: 'paste', text: TEXT, thesis: '' }, 2)).toBe('About a minute. It lands in Drafts and waits in Approvals.')
  expect(voiceOpts(false)).toEqual(['Match my source', 'Clear and authoritative', 'Conversational'])
})

test('the company profile: who it is for, the offer line, and what Must use suggests', () => {
  const [founder, manager] = R.client_personas.map(personaOf)
  expect(personaLine(founder)).toBe('Ops-minded founder (Founder, Small advisory firm, 5 to 20)')
  expect(personaLine(manager)).toBe('Practice manager (Practice manager, Mid-size firm)')
  const [checklist, audit] = R.offers.map(offerOf)
  expect(offerLine(audit)).toBe('$497 · 2 weeks · Book a call')
  expect(offerLine(checklist)).toBe('Free · Download a resource')
  const proof = R.client_proof.map(proofOf)
  expect(mustSuggest(proof, [checklist, audit], '2026-11-12', [])).toEqual(['Five days saved on onboarding', '$497 Onboarding audit'])
  expect(mustSuggest(proof, [checklist, audit], '2026-11-12', ['$497 Onboarding audit'])).toEqual(['Five days saved on onboarding'])
  // expired proof is not suggested
  expect(mustSuggest([{ ...proof[0], expires: '2026-01-01' }], [], '2026-11-12', [])).toEqual([])
  expect(mustOf(['a', ' a ', 'b'], 'c')).toEqual(['a', 'b', 'c'])
})

test('after a send: the choices stay, the material, what it must use, the notes and typed answers go', () => {
  const f = form({
    kind: 'email',
    take: 'T',
    url: 'https://x.test',
    title: 'T',
    must: ['m'],
    notes: 'n',
    per: FM.manager,
    voice: 'Conversational',
    note: FM.founder,
    answers: { email: { goal: 'Invite', recipient: 'advisers' } },
  })
  const g = afterSend(f)
  expect(g).toMatchObject({ kind: 'email', src: 'paste', text: '', take: '', url: '', title: '', must: [], notes: '', per: FM.manager, voice: 'Conversational', note: null })
  expect(g.answers.email).toMatchObject({ goal: 'Invite', recipient: '' })
  const h = afterSend(form({ src: 'idea', thesis: 'An idea', proof: 'p', text: TEXT }))
  expect(h).toMatchObject({ thesis: '', proof: '', text: TEXT })
})

test('a form from the browser is checked, and errors read as the current dashboard words them', () => {
  const f = formFrom({ kind: 'nope', src: 'x', cat: { thought_leadership: 'nonsense', report: 'news' }, type: 'weird', must: ['a', 'a', 'b'], note: 'not-an-id', answers: 5 })
  expect(f).toMatchObject({ kind: 'thought_leadership', src: 'upload', cat: { report: 'news' }, type: 'article', must: ['a', 'b'], note: null, answers: { thought_leadership: {} } })
  expect(formFrom({ kind: 'deck', answers: { deck: { slides: '20', notes: false, setting: 'Nowhere' } } }).answers).toEqual({ deck: { slides: '20', notes: false } })
  expect(dbErr({ code: '42501', message: 'new row violates row-level security policy' })).toBe(
    'your account is not allowed to create content requests. Only @aiparagonconsulting.com accounts can.',
  )
  expect(dbErr({ code: '23514', message: 'check' })).toBe('one of the values is not accepted by the table.')
  expect(dbErr({ message: 'x'.repeat(200) })).toHaveLength(160)
  // the briefs' layout: the handoff and the parts a team added are not named
  expect(leaveOutOf(R.ai_settings[0].value)).toEqual(['The short version', 'Notable developments'])
  expect(leaveOutOf({ org: { off: ['x_rising', 'themes'] } })).toEqual(['Themes and topic watch'])
  expect(leaveOutOf(null)).toEqual([])
  // a team idea counts as drafted while its opening words are in the idea that goes out
  expect(usesNote('Most firms buy the AI tool before they name who owns the workflow. And more.', 'Most firms buy the AI tool before they name who owns the workflow.')).toBe(true)
  expect(usesNote('Something else entirely, rewritten from scratch.', 'Most firms buy the AI tool before they name who owns the workflow.')).toBe(false)
})

test('addresses that fill the form in: Ideas, the quick starts and the strategy read', () => {
  expect(newDraftHref({ src: 'upload' })).toBe('/content-transformation?src=upload')
  expect(newDraftHref({ note: FM.founder })).toBe('/content-transformation?note=' + FM.founder)
  expect(ideaThesis({ text: 'Fee talk is up — and rising', why: 'Advisors post about fees' })).toBe('Fee talk is up, and rising. Advisors post about fees')
  const p = prefillOf(new URLSearchParams('src=idea&idea=An+idea&from=read&kind=ad'))
  expect(p).toMatchObject({ kind: 'adcopy', src: 'idea', thesis: 'An idea', say: 'Filled in from the strategy read. Check it, then generate.' })
  expect(prefillOf(new URLSearchParams('tab=drafts&draft=x'))).toBe(null)
  expect(prefillOf(new URLSearchParams('use=piece:' + FM.story))).toMatchObject({ src: null, use: { kind: 'piece', id: FM.story } })
  expect(prefillOf(new URLSearchParams('use=piece:not-an-id'))).toMatchObject({ src: null, use: null })
  expect(prefillOf(new URLSearchParams('note=' + FM.founder))).toMatchObject({ src: 'idea', note: FM.founder })
  // the strategy read's Create (v98Make): from material, or as an idea
  const src = readHref({ title: 'Post the audit checklist.', why: 'It got the most saves', angle: 'Show the three steps', start: 'source', format: 'newsletter' })
  expect(prefillOf(new URLSearchParams(src.split('?')[1]))).toMatchObject({
    kind: 'newsletter',
    src: 'upload',
    title: 'Post the audit checklist.',
    take: 'Show the three steps',
    say: 'Filled in from the strategy read. Add your material, then generate.',
  })
  const idea = readHref({ title: 'Post the audit checklist.', why: 'It got the most saves', angle: '', start: 'idea', format: 'weird' })
  expect(prefillOf(new URLSearchParams(idea.split('?')[1]))).toMatchObject({ kind: 'thought_leadership', src: 'idea', thesis: 'Post the audit checklist. It got the most saves' })
})
