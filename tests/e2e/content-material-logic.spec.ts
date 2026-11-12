import { expect, test } from '@playwright/test'
import { type FillAnswer, type FillCtx, applyFill, fillAnswerOf, fillFrom, fillIntro, fillKey, fillOptions, fillRequest, kindLine, ownMaterial } from '../../src/lib/pipeline/content-fill'
import { FILE_ACCEPT, cleanCaptions, fileKind, fileTitle, guessType, isMedia } from '../../src/lib/pipeline/content-files'
import { type Form, SAMPLE, TEXT_MAX, afterSend, blankForm, newDraftHref, offerOf, personaOf, prefillOf, tplOf, withMaterial } from '../../src/lib/pipeline/content-new'
import { formRows } from './content-fixtures'

// New draft's material and Fill it in for me, without a browser: which files are read and how, a file's or a call's
// material in the form (its title kept when one was typed), the address Calls' Use as content source opens, the request
// Engine 3 · Auto-fill reads, its answer checked, and the form with the answer in it. The fixtures are made up.

const R = formRows()
const ORG = { runId: 'intel_run_org', createdAt: '2026-11-05T09:00:00Z', decision: 'approved' }
const ADS = { runId: 'agent2_run_ads', createdAt: '2026-11-03T09:00:00Z', decision: '' }
const ctx = (o: Partial<FillCtx> = {}): FillCtx => ({
  personas: R.client_personas.filter((p) => !p.archived).map(personaOf),
  offers: R.offers.map(offerOf),
  templates: R.doc_templates.filter((t) => t.active).map(tplOf),
  voice: { createdAt: '2026-11-08T09:00:00Z', tone: ['plain'] },
  org: { use: ORG, newest: ORG },
  ads: { use: ADS, newest: ADS },
  ...o,
})
const LONG = 'Most firms lose a week to onboarding. '.repeat(10).trim()
const form = (o: Partial<Form> = {}): Form => ({ ...blankForm(), ...o })
type Row = Record<string, unknown>
const answer = (o: Row = {}): FillAnswer => {
  const a = fillAnswerOf({ ok: true, filled: {}, why: {}, used: {}, flags: [], ...o })
  if (!a) throw new Error('no answer')
  return a
}

test('files: what is read and how, captions cleaned, what the material is guessed to be, and the title a file gives', () => {
  expect(fileKind('Report.PDF', 'application/pdf')).toBe('pdf')
  expect(fileKind('notes.docx', '')).toBe('docx')
  expect(fileKind('a.md', 'text/markdown')).toBe('text')
  expect(fileKind('data.csv', 'text/csv')).toBe('text')
  expect(fileKind('page.htm', 'text/html')).toBe('html')
  expect(fileKind('cues.srt', '')).toBe('captions')
  expect(fileKind('episode.m4a', '')).toBe('media')
  expect(fileKind('clip', 'video/mp4')).toBe('media')
  expect(fileKind('old.doc', 'application/msword')).toBeNull()
  expect(fileKind('photo.png', 'image/png')).toBeNull()
  expect(fileKind('no-ending', '')).toBeNull()
  expect(isMedia('talk.WEBM', '')).toBe(true)
  expect(isMedia('talk.txt', 'audio/mpeg')).toBe(true)
  expect(FILE_ACCEPT.split(',')).toEqual(expect.arrayContaining(['.pdf', '.docx', '.vtt', '.srt', 'video/*', 'audio/*']))

  const srt = '1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Hello</i> and welcome.\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000 align:start\r\nToday: the onboarding week.\r\n'
  expect(cleanCaptions(srt)).toBe('Hello and welcome.\nToday: the onboarding week.')
  expect(cleanCaptions('WEBVTT Kind: captions\n\n00:01.000 --> 00:02.000\nOne line.')).toBe('One line.')

  expect(guessType('a.mp4', '')).toBe('video')
  expect(guessType('a.srt', '')).toBe('video')
  expect(guessType('a.wav', '')).toBe('podcast')
  expect(guessType('x', 'audio/ogg')).toBe('podcast')
  expect(guessType('a.pdf', '')).toBe('report')
  expect(guessType('a.docx', '')).toBe('report')
  expect(guessType('a.txt', '')).toBe('article')
  expect(fileTitle('Q3_board-update--final.pdf')).toBe('Q3 board update final')
  expect(fileTitle('notes')).toBe('notes')
})

test('material: its text, link and file name go in; a typed title stays, a title the last material gave is replaced', () => {
  let f = withMaterial(form(), { text: LONG, title: 'onboarding week', fileName: 'onboarding-week.pdf', guess: 'report' })
  expect(f).toMatchObject({ text: LONG, title: 'onboarding week', titleFrom: 'onboarding week', type: 'report', fileName: 'onboarding-week.pdf', url: '' })
  // the next file names it after itself, and a link that was there before goes
  f = withMaterial({ ...f, url: 'https://example.com/old' }, { text: LONG, title: 'meeting notes', fileName: 'meeting-notes.docx', guess: 'report' })
  expect(f).toMatchObject({ title: 'meeting notes', url: '', fileName: 'meeting-notes.docx' })
  // a typed title stays through files and calls
  f = withMaterial({ ...f, title: 'Our story' }, { text: 'x', title: 'Discovery call', url: 'https://fathom.video/share/abc', guess: 'call' })
  expect(f).toMatchObject({ title: 'Our story', titleFrom: 'meeting notes', type: 'call', url: 'https://fathom.video/share/abc', fileName: '' })
  // what the material is, picked by hand, is not guessed over; a type given is always set
  f = withMaterial({ ...f, type: 'interview', typeSet: true }, { text: 'x', title: '', guess: 'video' })
  expect(f.type).toBe('interview')
  expect(withMaterial({ ...f, typeSet: true }, { text: 'x', title: '', type: 'article' }).type).toBe('article')
  expect(withMaterial(form(), { text: 'x', title: '', guess: 'not-a-type' }).type).toBe('article')
  // the text is kept to 120,000 characters, and a send clears the material and the title it gave
  expect(withMaterial(form(), { text: 'a'.repeat(TEXT_MAX + 50), title: '' }).text).toHaveLength(TEXT_MAX)
  expect(afterSend(withMaterial(form({ src: 'upload' }), { text: LONG, title: 'notes', fileName: 'notes.md' }))).toMatchObject({ text: '', title: '', titleFrom: '', fileName: '' })
})

test('Calls’ Use as content source: the address opens the Fathom call tab with the call, its title and its share link', () => {
  const href = newDraftHref({ call: '9001', title: 'Discovery with Robin', link: 'https://fathom.video/share/abc123' })
  expect(href).toBe('/content-transformation?title=Discovery+with+Robin&call=9001&link=https%3A%2F%2Ffathom.video%2Fshare%2Fabc123')
  const p = prefillOf(new URL('http://x' + href).searchParams)!
  expect(p).toMatchObject({ call: '9001', src: 'fathom', title: 'Discovery with Robin', link: 'https://fathom.video/share/abc123' })
  // only a Fathom link is kept, and only a call id that looks like one
  expect(prefillOf(new URLSearchParams('call=9001&link=https://evil.example.com/x'))!.link).toBe('')
  expect(prefillOf(new URLSearchParams('call=../../etc'))!.call).toBeNull()
  expect(prefillOf(new URLSearchParams('link=https://fathom.video/share/abc'))!.link).toBe('')
})

test('Fill it in: the request for a new idea, for the team’s own material, and with none; paid ads lead with their brief', () => {
  // a new idea: the idea typed and who it is for (the persona, anyone who follows us, or nobody named)
  let r = fillRequest(form({ src: 'idea', thesis: '  Our idea.  ' }), ctx())
  if (!r.ok) throw new Error(r.error)
  expect(r.body).toMatchObject({
    page: 'ct',
    format: 'thought_leadership',
    content_type: 'thought_leadership',
    start: 'idea',
    brief_run: ADS.runId,
    organic_run: ORG.runId,
    typed: { thesis: 'Our idea.', audience: 'Ops-minded founder (Founder, Small advisory firm, 5 to 20)', pain: '' },
  })
  expect(fillRequest(form({ src: 'idea', per: 'any' }), ctx())).toMatchObject({ body: { typed: { audience: 'Everyone who follows us' } } })
  expect(fillRequest(form({ src: 'idea' }), ctx({ personas: [] }))).toMatchObject({ body: { typed: { audience: '' } } })

  // the team's own material goes along (its first 4,000 characters); the sample, or too little, does not
  const text = 'x'.repeat(5000)
  r = fillRequest(form({ src: 'paste', text, title: 'Mine', take: 'Keep it' }), ctx())
  expect(r).toMatchObject({ ok: true, body: { start: 'source', typed: { title: 'Mine', take: 'Keep it' } } })
  expect(r.ok && r.body.typed.text).toHaveLength(4000)
  expect(fillRequest(form({ src: 'upload', text: SAMPLE.text, title: SAMPLE.title }), ctx())).toMatchObject({ body: { typed: { title: '', take: '', text: '' } } })
  expect(ownMaterial({ text: SAMPLE.text })).toBe(false)
  expect(ownMaterial({ text: 'short' })).toBe(false)
  expect(ownMaterial({ text: LONG })).toBe(true)

  // the kind and its category set the format and the kind of post; a paid ad is filed as an ad
  expect(fillRequest(form({ kind: 'newsletter', cat: { newsletter: 'articles' } }), ctx())).toMatchObject({ body: { format: 'newsletter', content_type: 'article' } })
  expect(fillRequest(form({ kind: 'adcopy' }), ctx())).toMatchObject({ body: { format: 'ad', content_type: 'ad' } })
  expect(fillRequest(form({ kind: 'report' }), ctx())).toMatchObject({ body: { format: 'newsletter', content_type: 'report' } })

  // no brief to lead with
  expect(fillRequest(form({ kind: 'adcopy' }), ctx({ ads: { use: null, newest: null } }))).toEqual({ ok: false, error: 'There is no advertisement brief yet. Run the Ad Strategist first.' })
  expect(fillRequest(form(), ctx({ org: { use: null, newest: null } }))).toEqual({ ok: false, error: 'There is no organic brief yet. Run the Intel Tracker first.' })
  expect(fillRequest(form({ kind: 'adcopy' }), ctx({ org: { use: null, newest: null } })).ok).toBe(true)

  // the choices the form offers: the voices, the structures (a template with what it is for), the calls to action
  const o = fillOptions(form(), ctx())
  expect(o.voice.map((x) => x.value)).toEqual(['Use my saved voice', 'Match my source', 'Clear and authoritative', 'Conversational'])
  expect(o.structure[0]).toEqual({ value: '', label: 'The usual thought leadership shape' })
  expect(o.structure.slice(1, 5).map((x) => x.value)).toEqual(['builtin:problem', 'builtin:story', 'builtin:myth', 'builtin:steps'])
  const tpl = o.structure.find((x) => x.label === 'Client story')!
  expect(tpl.note).toBe(R.doc_templates.find((t) => t.name === 'Client story')!.description.slice(0, 180))
  expect(o.cta.length).toBeGreaterThan(1)
  expect(fillOptions(form({ kind: 'adcopy' }), ctx()).structure[0].label).toBe('Let the brief suggest a structure')
  expect(fillOptions(form(), ctx({ voice: null })).voice.map((x) => x.value)).toEqual(['Match my source', 'Clear and authoritative', 'Conversational'])
})

test('Fill it in: the answer is checked, and goes in without overwriting what was typed', () => {
  const pieceId = '9a000000-0000-4000-8000-0000000000aa'
  // the answer as the workflow sends it, checked
  const a = answer({
    filled: {
      thesis: 'We think onboarding should take days.',
      audience: 'Founders of small firms',
      proof: 'A firm cut onboarding to four days.',
      proof_ref: { kind: 'piece', id: pieceId, title: 'Why onboarding takes a week, and what we changed for every client we work with' },
      takeaway: 'One owner per step.',
      voice: 'Match my source',
      cta: 'Not an option on the form',
      structure: 'builtin:story',
    },
    why: { thesis: 'The brief’s top finding.', voice: 'Your material leads.', structure: 'Stories land.', junk: 'x' },
    based_on: 'Buyers ask where to begin',
    used: { organic_brief: { run_id: ORG.runId, created_at: ORG.createdAt }, ad_brief: null, lead: 'organic' },
    flags: ['Check these figures before you generate. They are not in your briefs or your material: 9 days'],
  })
  expect(a.why).toEqual({ thesis: 'The brief’s top finding.', voice: 'Your material leads.', structure: 'Stories land.' })
  expect(a.used).toEqual({ org: { runId: ORG.runId, createdAt: ORG.createdAt }, ad: null, lead: 'organic' })
  expect(fillAnswerOf({ ok: false, message: 'x' })).toBeNull()
  expect(fillAnswerOf(null)).toBeNull()
  expect(answer({ filled: { source: { kind: 'file', id: 'not-a-uuid', title: 'x' } } }).filled.source).toBeNull()
  expect(answer({ filled: { source: { kind: 'other', id: pieceId } } }).filled.source).toBeNull()
  expect(answer({ filled: {} }).filled.structure).toBeNull()
  expect(answer({ filled: { structure: '' } }).filled.structure).toBe('')

  // a new idea: the idea and the proof go in where nothing was typed, with the reasons; an option the form lacks does not
  const idea = form({ src: 'idea' })
  let x = applyFill(idea, a, null, ctx())
  expect(x.form).toMatchObject({
    thesis: 'We think onboarding should take days.',
    proof: 'A firm cut onboarding to four days. (from your library: “Why onboarding takes a week, and what we changed for every…”)',
    voice: 'Match my source',
    struct: 'builtin:story',
    cta: '',
  })
  expect(x.notes).toEqual({ thesis: 'The brief’s top finding.', voice: 'Your material leads.', struct: 'Stories land.' })
  expect(x.kept).toEqual([])
  expect(x.snap).toEqual({ thesis: '', proof: '', voice: '', struct: '' })
  // typed text stays, and the strip says so
  x = applyFill({ ...idea, thesis: 'My own idea, kept.', proof: 'My proof.' }, a, null, ctx())
  expect(x.form).toMatchObject({ thesis: 'My own idea, kept.', proof: 'My proof.' })
  expect(x.kept).toEqual(['thesis', 'proof'])
  // with no personas on file, who it suggests writing for is said
  expect(applyFill(idea, a, null, ctx({ personas: [] })).notes.per).toBe('The agent suggests writing for: Founders of small firms. Add them as a persona to use it.')
  // the usual shape is a pick too; an unknown one is not
  expect(applyFill(idea, answer({ filled: { structure: '' } }), null, ctx()).form.struct).toBe('')
  expect(applyFill({ ...idea, struct: 'builtin:myth' }, answer({ filled: { structure: '' } }), null, ctx()).snap).toEqual({ struct: 'builtin:myth' })
  expect(applyFill({ ...idea, struct: 'builtin:myth' }, answer({ filled: { structure: 'nope' } }), null, ctx()).form.struct).toBe('builtin:myth')
})

test('Fill it in: with no material it brings in the piece it picked; with the team’s own it keeps it', () => {
  const pieceId = '9a000000-0000-4000-8000-0000000000aa'
  const a = answer({
    filled: { source: { kind: 'piece', id: pieceId, title: 'Why onboarding takes a week' }, takeaway: 'Start with one owner.' },
    why: { pick: 'It answers what buyers ask.', takeaway: 'The brief says so.' },
  })
  const m = { text: LONG, title: 'Why onboarding takes a week', url: '', type: 'not-known' }
  const empty = form({ src: 'upload', take: 'Old takeaway', fileName: 'old.pdf', titleFrom: 'old', title: 'old' })
  const x = applyFill(empty, a, m, ctx())
  expect(x.form).toMatchObject({ text: LONG, title: 'Why onboarding takes a week', type: 'other', fileName: '', take: 'Start with one owner.' })
  expect(x.notes).toEqual({ text: 'Picked from your library: “Why onboarding takes a week”. It answers what buyers ask.', take: 'The brief says so.' })
  expect(x.snap).toMatchObject({ text: '', take: 'Old takeaway', fileName: 'old.pdf', title: 'old' })
  // the team's own material stays, and so does a typed takeaway
  const own = form({ src: 'paste', text: LONG, take: 'Mine' })
  const y = applyFill(own, a, m, ctx())
  expect(y.form).toMatchObject({ text: LONG, take: 'Mine' })
  expect(y.kept).toEqual(['take'])
  expect(y.notes.text).toBeUndefined()
  // what it was picked from, and from which brief it filled in
  expect(['request', 'file', 'piece', 'x'].map(kindLine)).toEqual(['material you added before', 'your knowledge base', 'your library', 'your material'])
  const day = (iso: string) => iso.slice(5, 10)
  expect(fillFrom({ org: { runId: 'o', createdAt: '2026-11-05' }, ad: null, lead: 'organic' }, day)).toBe('the organic brief of 11-05')
  expect(fillFrom({ org: { runId: 'o', createdAt: '2026-11-05' }, ad: { runId: 'a', createdAt: '2026-11-03' }, lead: 'ad' }, day)).toBe(
    'the advertisement brief of 11-03 and the organic brief of 11-05',
  )
  expect(fillFrom({ org: null, ad: null, lead: 'organic' }, day)).toBe('the newest brief')
})

test('Fill it in: what is being made keys the fill, and what it says it does follows the form', () => {
  expect(fillKey(form({ src: 'upload' }))).toBe('source:thought_leadership:thought_leadership')
  expect(fillKey(form({ src: 'paste' }))).toBe(fillKey(form({ src: 'fathom' })))
  expect(fillKey(form({ src: 'idea' }))).toBe('idea:thought_leadership:thought_leadership')
  expect(fillKey(form({ cat: { thought_leadership: 'case_studies' } }))).toBe('source:thought_leadership:social_proof')
  expect(fillIntro(form({ src: 'idea' }))).toBe(
    'It drafts a key idea from the newest organic brief, in line with your mission and the persona and offer picked, then fills in the voice, the call to action and the structure. Make the idea yours before you generate.',
  )
  expect(fillIntro(form({ src: 'idea', kind: 'adcopy' }))).toContain('from the newest advertisement brief')
  expect(fillIntro(form({ src: 'paste', text: LONG }))).toBe('It keeps the source you added and fills in the takeaway, the voice, the call to action and the structure from the newest organic brief.')
  expect(fillIntro(form({ src: 'upload' }))).toBe(
    'It picks the piece of your own material that best fits what the newest organic brief found, then fills in the takeaway, the voice, the call to action and the structure.',
  )
})
