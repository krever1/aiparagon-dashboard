import { expect, test } from '@playwright/test'
import {
  CHECKS, askProblem, askText, asksOf, bodyOf, briefIdeas, checkLine, draftFile, draftLine, draftOf, draftOrigin, draftText, fmtName, formOfDraft,
  formOfPiece, hookLabel, hookWord, hooksText, kindName, kindNoun, kindOf, labelCase, madeFrom, madeOf, noteOf, noteTags, openNotes, pieceOf, pieceRow,
  pieceText, progRows, readyOf, reqOf, reviewOf, shelfOf, sourceLine, tabOf, tagsOf,
} from '../../src/lib/pipeline/content'
import { DR, NT, PC, RQ, contentRows } from './content-fixtures'

// Content Transformation's rules, checked without a browser: a draft as Content from Source saves it, where it
// belongs, its review, the requests still being written, the body as paragraphs or cards, what Copy and Download give,
// How this draft was made, What should change?, the library piece editor, the ideas and the address. On the made-up
// rows in tests/e2e/content-fixtures.ts.

const NOW = Date.now()
const M = 60_000
const day = (iso: string) => iso.slice(0, 10)
type Row = Record<string, unknown>
const rows = () => contentRows() as unknown as Record<string, Row[]>
const drafts = () => rows().agent_outputs.filter((o) => o.output_type === 'content_draft').map(draftOf)
const reqs = () => rows().content_requests.map(reqOf)
const one = (id: string) => drafts().find((d) => d.id === id)!

test('a draft as Content from Source saves it: data kept as text, the placeholder title, hooks, brief, extraction and house settings', () => {
  const d = one(DR.post)
  expect(d).toMatchObject({
    id: DR.post,
    runId: 'cg-post',
    title: 'Why onboarding stalls',
    format: 'thought_leadership',
    contentType: 'thought_leadership',
    startMode: 'source',
    sourceType: 'article',
    requestId: RQ.post,
    cta: 'Book a 20-minute intake review',
    hashtags: ['#onboarding', '#operations'],
    trace: { body: 'The webinar, minutes 12 to 20', hooks: 'Patterns from the organic brief', claims: 'Five days: our own records' },
    pulled: { ideas: 3, stories: 2, frameworks: 1, dataPoints: 0, quotes: 1 },
    house: { rules: 2, template: 'LinkedIn post', kbDocs: 1, feedback: 2, contentType: 'thought_leadership' },
  })
  expect(d.hooks.map((h) => h.label)).toEqual(['Hook A', 'Hook B', 'Hook C'])
  expect(d.flags).toHaveLength(2)
  expect(d.brief).toMatchObject({ primary: 'intel_tracker', intelRun: 'intel_run_c', intelApproved: true, adRun: 'agent2_run_c', adApproved: false })
  // "Draft title" from the agent gives way to the brief's title, else Content draft
  expect(draftOf({ id: 'x', title: 'Draft title', data: { brief: { title: 'From the brief' } } }).title).toBe('From the brief')
  expect(draftOf({ id: 'x', title: 'draft title', data: {} }).title).toBe('Content draft')
  // hooks kept as plain lines read too, and an empty one is left out
  expect(draftOf({ id: 'x', data: { hooks: ['One', '', { text: 'Two' }] } }).hooks).toEqual([
    { label: '', text: 'One' },
    { label: '', text: 'Two' },
  ])
  // a list item kept as an object reads as its words
  expect(draftOf({ id: 'x', data: { review_flags: [{ text: 'Check it' }, 'And this'], brief: { substance: [{ claim: 'A claim' }] } } })).toMatchObject({
    flags: ['Check it', 'And this'],
    brief: { substance: ['A claim'] },
  })
})

test('names: a newer format by its own name, kinds and their words, hooks or subject lines', () => {
  expect([fmtName('thought_leadership'), fmtName('ad'), fmtName('newsletter', 'report'), fmtName('thought_leadership', 'deck'), fmtName('x')]).toEqual([
    'Thought leadership',
    'Paid ad',
    'Report',
    'Presentation deck',
    'Draft',
  ])
  // an ad draft is the Paid ad tile; the house settings name the kind first
  expect(kindOf(one(DR.ad))).toBe('adcopy')
  expect(kindOf(one(DR.deck))).toBe('deck')
  expect(kindOf({ format: 'newsletter', contentType: 'report', house: { rules: null, template: '', kbDocs: null, feedback: 0, contentType: '' } })).toBe('report')
  expect([kindName('thought_leadership'), kindNoun('thought_leadership'), kindName('adcopy'), kindNoun('newsletter'), kindName('educational'), kindNoun('x')]).toEqual([
    'LinkedIn post',
    'post',
    'Paid ad',
    'issue',
    'Draft',
    'draft',
  ])
  expect([hookWord('newsletter'), hookWord('email'), hookWord('ad')]).toEqual(['Subject', 'Subject', 'Hook'])
  // a hook with no label of its own is named by its place
  expect([hookLabel(one(DR.idea), 0), hookLabel(one(DR.idea), 1)]).toEqual(['Subject A', 'Subject B'])
  expect(madeFrom(one(DR.post))).toBe('Article → Thought leadership')
  expect(madeFrom(one(DR.idea))).toBe('New idea → Newsletter')
  expect(madeFrom(one(DR.deck))).toBe('Document or report → Presentation deck')
  expect(draftLine(one(DR.idea), '11 Nov')).toBe('Newsletter · 11 Nov · from an idea')
})

test('where a draft belongs: one made from the briefs is Marketing Generation’s, by its own source or its request’s', () => {
  const R = reqs()
  expect(drafts().map((d) => draftOrigin(d, R))).toEqual(['mine', 'brief', 'mine', 'mine', 'mine'])
  expect(draftOrigin({ sourceType: '', requestId: RQ.brief }, R)).toBe('brief')
  expect(draftOrigin({ sourceType: '', requestId: 'not-loaded' }, R)).toBe('mine')
})

test('the review: the sign-off, the changes asked, the checks', () => {
  const revs = rows().agent_feedback.map(reviewOf)
  expect(readyOf(DR.ad, revs)).toMatchObject({ author: 'pat@aiparagonconsulting.com', action: 'ready' })
  expect(readyOf(DR.post, revs)).toBeUndefined()
  expect(asksOf(DR.post, revs).map((r) => r.feedback)).toEqual(['LinkedIn post: too long.', 'LinkedIn post: weak hook.'])
  // an empty ask is not counted
  expect(asksOf(DR.post, [...revs, { id: 'z', target: DR.post, action: 'changes', feedback: ' ', author: '', createdAt: '' }])).toHaveLength(2)
  expect(CHECKS).toHaveLength(4)
  expect([checkLine(4), checkLine(1), checkLine(0)]).toEqual([
    '4 items to check before marking this ready.',
    '1 item to check before marking this ready.',
    'All checked. Mark it ready when you are happy.',
  ])
})

test('the requests still being written, and the ones that did not finish or were not picked up', () => {
  const R = reqs().filter((r) => r.sourceType !== 'brief')
  const P = progRows(R, NOW, {}, day)
  expect(P.map((p) => [p.req.title, p.tone, p.pill, p.retry])).toEqual([
    ['Client story: Halvern', 'info', 'Reading', false],
    ['Podcast episode 14', 'bad', 'Did not finish', true],
    ['Year-end checklist', 'warn', 'Not picked up', true],
  ])
  expect(P[0].line).toBe('Newsletter · ' + day(R.find((r) => r.id === RQ.story)!.createdAt))
  expect(P[1].line).toBe('The transcript could not be read.')
  // a request whose workflow did not start says why, until it is done
  const K = progRows(R, NOW, { [RQ.story]: 'The Content from Source workflow in n8n is switched off.' }, day)
  expect(K[0]).toMatchObject({ tone: 'warn', pill: 'Not picked up', retry: true, line: 'The workflow did not start: The Content from Source workflow in n8n is switched off.' })
  expect(progRows(R, NOW, { [RQ.post]: 'x' }, day).some((p) => p.req.id === RQ.post)).toBe(false)
  // a request still marked running after 12 minutes is no longer shown
  expect(progRows(R, NOW + 13 * M, {}, day).map((p) => p.req.title)).toEqual(['Podcast episode 14'])
  // eight at most
  const many = Array.from({ length: 10 }, (_, i) => ({ ...R[1], id: 'r' + i }))
  expect(progRows(many, NOW, {}, day)).toHaveLength(8)
})

test('the source line, the body as paragraphs or cards, and what Copy and Download give', () => {
  expect(sourceLine(one(DR.post), 'The onboarding webinar')).toBe('From “The onboarding webinar” · led by the organic brief')
  expect(sourceLine(one(DR.ad), '')).toBe('Led by the advertisement brief')
  expect(sourceLine(draftOf({ id: 'x', data: {} }), '')).toBe('')
  // every line that does not start with a space is its own paragraph
  expect(bodyOf(one(DR.post).body)).toEqual({
    paras: ['Most firms treat onboarding as paperwork.', 'It is the first promise you keep, or break.', 'We cut it to three steps: one call, one form, one checklist.'],
    cards: [],
  })
  // two lines that start a card make cards; the lines before them stay paragraphs, notes are marked
  expect(bodyOf(one(DR.deck).body)).toEqual({
    paras: ['Use these for the client call.'],
    cards: [
      { h: 'Slide 1: Where we started', lines: [{ text: 'Three clients waiting on paperwork.', note: false }, { text: 'Notes: keep it short.', note: true }] },
      { h: 'Slide 2: What changed', lines: [{ text: 'One form instead of five.', note: false }] },
    ],
  })
  expect(bodyOf('## **Scene 1:** The hook\nSay it.\nScene 2: The close').cards.map((c) => c.h)).toEqual(['Scene 1: The hook', 'Scene 2: The close'])
  expect(bodyOf('Slide 1: only one card').cards).toEqual([])
  const d = one(DR.post)
  expect(draftText(d, 1)).toBe(
    'The week nobody budgets for.\n\n' + d.body + '\n\nBook a 20-minute intake review\n\n#onboarding #operations',
  )
  expect(hooksText(d)).toBe('Hook A: Most firms lose a week to onboarding.\nHook B: The week nobody budgets for.\nHook C: Your new clients wait ten days. Here is why.')
  const f = draftFile(d)
  expect(f.name).toBe('why-onboarding-stalls.txt')
  expect(f.text.split('\n').slice(0, 6)).toEqual([
    'Why onboarding stalls',
    'Format: Thought leadership',
    '',
    'Hook A: Most firms lose a week to onboarding.',
    'Hook B: The week nobody budgets for.',
    'Hook C: Your new clients wait ten days. Here is why.',
  ])
  expect(f.text).toContain('CTA: Book a 20-minute intake review')
  expect(f.text.endsWith('Check before publishing:\n- Check the five-day figure against this quarter\n- Get the client’s OK to tell the filing story')).toBe(true)
  expect(draftFile(draftOf({ id: 'x', title: '!!!', data: {} })).name).toBe('draft.txt')
})

test('how a draft was made: what it pulled out, which brief led, the briefs’ days, the house settings', () => {
  const d = one(DR.post)
  const req = reqs().find((r) => r.id === RQ.post)
  const m = madeOf(d, req, (k, run) => (k === 'org' && run === 'intel_run_c' ? '10 Nov' : ''))
  expect(m.heading).toBe('Your article, packaged with the market briefs')
  expect(m.lead).toBe('The organic brief led the packaging, the ad brief supported it. Every claim comes from your source.')
  expect(m.you).toEqual({
    title: 'The onboarding webinar',
    text: 'Pulled out: 3 ideas · 2 stories · 1 framework · 1 quote',
    items: ['Our three-step intake cuts a week from onboarding', 'A client story: the filing that waited ten days'],
  })
  expect(m.org).toEqual({ led: true, day: '10 Nov', text: 'Approved at the time.', items: ['Lead with the week buyers lose', 'Name the cost before the fix'] })
  // a brief not found reads as an earlier one
  expect(m.ads).toMatchObject({ led: false, day: 'Earlier brief', text: 'Not approved yet at the time, so it was the newest instead.' })
  expect(m.house).toBe('2 house rules · template “LinkedIn post” · 1 knowledge base document · 2 asks from earlier drafts')
  const idea = madeOf(one(DR.idea), undefined, () => '')
  expect(idea.heading).toBe('Your idea, packaged with the market briefs')
  expect(idea.you.text).toBe('Your own words and point of view.')
  expect(idea.org.text).toBe('No organic brief was on file.')
  expect(idea.house).toBe('0 house rules · no template · 0 knowledge base documents')
  expect(madeOf(one(DR.deck), undefined, () => '').lead).toBe('The ad brief led the packaging, the organic brief supported it. Every claim comes from your source.')
  expect(madeOf(draftOf({ id: 'x', data: {} }), undefined, () => '').lead).toBe('Both briefs shaped the packaging. Every claim comes from your source.')
})

test('What should change?: the sentence the next drafts read, and what stops a save', () => {
  expect(askText('thought_leadership', ['salesy', 'long'], '  Cut   the intro. ')).toBe('LinkedIn post: too long, too salesy. Cut the intro.')
  expect(askText('adcopy', [], 'Lead with the number')).toBe('Paid ad: Lead with the number')
  expect(askText('deck', ['hook'], '')).toBe('Presentation deck: weak hook.')
  expect(askText('educational', ['point'], '')).toBe('Draft: unclear point.')
  expect(askText('email', [], 'x'.repeat(700))).toHaveLength(600)
  expect(askProblem([], 'too short')).toBe('Pick what was off, or write a sentence.')
  expect(askProblem(['long'], '')).toBeNull()
  expect(askProblem([], 'Open with the client’s own words.')).toBeNull()
})

test('the library piece editor: a draft kept as a piece, a piece on file, tags and what stops a save', () => {
  // the hook on screen goes first
  expect(formOfDraft(one(DR.post), 2)).toEqual({
    title: 'Why onboarding stalls',
    format: 'thought_leadership',
    hooks: 'Your new clients wait ten days. Here is why.\nMost firms lose a week to onboarding.\nThe week nobody budgets for.',
    body: one(DR.post).body,
    cta: 'Book a 20-minute intake review',
    headline: '',
    tags: '',
    status: 'draft',
    notes: '',
  })
  expect(formOfDraft(one(DR.deck), 9).format).toBe('thought_leadership')
  expect(formOfDraft(draftOf({ id: 'x', data: { format: 'webinar' } }), 0)).toMatchObject({ format: 'other', hooks: '' })
  expect(formOfDraft(draftOf({ id: 'x', data: {} }), 0).format).toBe('ad')
  const kept = pieceOf(rows().content_pieces.find((p) => p.id === PC.kept)!)
  expect(formOfPiece(kept)).toMatchObject({ title: 'Your week back', format: 'ad', hooks: 'Get your week back.\nOnboarding in days.', tags: 'onboarding', status: 'ready' })
  expect(tagsOf(' #Client Wins, ops, OPS, ' + 'x'.repeat(40))).toEqual(['client-wins', 'ops', 'x'.repeat(30)])
  expect(tagsOf(Array.from({ length: 15 }, (_, i) => 't' + i))).toHaveLength(12)
  const r = pieceRow({ title: '  ', format: 'webinar', hooks: ' a \n\n b ', body: '', cta: ' Go ', headline: '', tags: 'A, a', status: 'live', notes: ' n ' })
  expect(r).toEqual({ ok: true, row: { title: 'Untitled piece', format: 'other', hooks: ['a', 'b'], body: '', cta: 'Go', headline: '', tags: ['a'], status: 'draft', notes: 'n' } })
  expect(pieceRow({ title: 'x', format: 'ad', hooks: ' ', body: ' ', cta: '', headline: '', tags: '', status: 'draft', notes: '' })).toEqual({
    ok: false,
    error: 'Add a body or at least one hook.',
  })
  expect(pieceText({ hooks: ['First', 'Second'], body: 'Body', cta: 'Go' })).toBe('First\n\nBody\n\nGo')
})

test('ideas: the brief’s five things, the team’s ideas still open, and what the team has given the engine', () => {
  const ib = rows().agent_outputs.find((o) => o.output_type === 'intel_brief')!
  const snap = rows().agent_outputs.find((o) => o.id === 'ib-snap')!.snapshot
  expect(briefIdeas(String(ib.content_md), snap).map((x) => [x.text, x.tag])).toEqual([
    ['Fee talk is up', 'pricing'],
    ['Proof beats promises', 'social_proof'],
    ['Onboarding is the new sales pitch', ''],
  ])
  // no snapshot: the brief's TL;DR
  expect(briefIdeas(String(ib.content_md), null).map((x) => x.text)).toEqual(['Fee talk is up', 'Proof beats promises'])
  expect(briefIdeas('', JSON.stringify(JSON.stringify(snap))).length).toBe(3)
  expect([labelCase('social_proof'), labelCase('pricing'), labelCase('')]).toEqual(['Social proof', 'Pricing', ''])
  const notes = rows().idea_notes.map(noteOf)
  expect(openNotes(notes).map((n) => n.id)).toEqual([NT.open, NT.plain])
  expect(noteTags(' ai, , ops ,a,b,c,d,e,f,g')).toEqual(['ai', 'ops', 'a', 'b', 'c', 'd', 'e', 'f'])
  const pieces = rows().content_pieces.filter((p) => p.status !== 'archived').map(pieceOf)
  const S = shelfOf(pieces, reqs(), day)
  // newest first, once by title (a request with the title of another goes), no ideas and nothing made from the briefs
  expect(S.map((x) => [x.k, x.title])).toEqual([
    ['request', 'Client story: Halvern'],
    ['request', 'Year-end checklist'],
    ['request', 'The onboarding webinar'],
    ['request', 'Podcast episode 14'],
    ['request', 'Q4 client update'],
    ['piece', 'Your week back'],
    ['piece', 'The three-step intake'],
  ])
  expect(S.find((x) => x.title === 'Your week back')!.sub).toBe('Paid ad · Ready · updated ' + day(pieces[0].updatedAt))
  expect(S.find((x) => x.title === 'The three-step intake')!.sub).toBe('Newsletter · Draft · saved ' + day(pieces[1].updatedAt))
  expect(S.find((x) => x.title === 'Q4 client update')!.sub).toMatch(/^Document or report · added /)
  // a sample's own copy is the same piece
  expect(shelfOf([{ ...pieces[0], title: 'Sample · Your week back' }, pieces[0]], [], day)).toHaveLength(1)
})

test('the address: the tab, with the old words carried over', () => {
  expect([null, 'new', 'drafts', 'ideas', 'library', 'requests', 'voice', 'how', 'nonsense'].map(tabOf)).toEqual([
    'new',
    'new',
    'drafts',
    'ideas',
    'ideas',
    'drafts',
    'new',
    'new',
    'new',
  ])
})
