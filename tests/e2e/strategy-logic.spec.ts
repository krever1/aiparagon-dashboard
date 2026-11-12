import { expect, test } from '@playwright/test'
import { dayText } from '../../src/lib/pipeline/ad-testing'
import {
  type Run, chips, chunk, clipWord, ctxSet, dayShort, errorOf, evidenceOf, formatName, gapsOf, hasMore, makeIn, memItem, memOf, memRules, memWith, parts, plain, readLine,
  readOf, refGo, refLabel, refShort, runState, runsOf, runsWith, sharpenOf, startedAgo,
} from '../../src/lib/pipeline/strategy'
import { testingRows } from './testing-fixtures'

// The strategy read's rules without a browser: a read as the page uses it, the codes in its text, where each source
// opens, what it read, a read started and what became of it, and what is remembered with the house rules made from it.

const reads = testingRows()
  .agent_outputs.filter((r) => r.output_type === 'strategy_insights')
  .map((r) => readOf(r as Record<string, unknown>))
const [daily, asked] = reads

test('a read as the page uses it, its data kept as an object or as text', () => {
  expect(daily).toMatchObject({
    id: 'sr-1',
    runId: 'insights_daily',
    daily: true,
    requestedBy: 'Daily read',
    focus: '',
    flags: [],
    headline: 'Lead with the onboarding audit',
    visionRead: 'It fits the offer [AB].',
    gaps: ['No proof from a client yet [ZZ].'],
    missing: ['Log the results of the audit ads.', 'Save two ideas.'],
    doubleDown: ['Keep the audit hook [C1].', 'Post on Tuesdays.'],
    changeOrStop: ['Stop the long intro.'],
    contentMix: 'Two posts a week and one ad.',
  })
  expect(daily.recs).toEqual([
    { title: 'Post the audit checklist', why: 'It got the most saves [R1].', angle: 'Show the three steps.', evidence: ['[OB]', '[R1]'], start: 'source', format: 'thought_leadership', priority: 'now' },
    { title: 'Run a second audit ad', why: '', angle: '', evidence: ['[C1]'], start: 'marketing', format: 'ad', priority: 'next' },
  ])
  expect(daily.refs.C1).toEqual({ kind: 'campaign', label: 'Campaign · 2026-11-06 · Onboarding Audit', runId: 'lt-run-1', id: 'lt-1', which: '' })
  // kept as text
  expect(asked).toMatchObject({
    daily: false,
    requestedBy: 'pat@aiparagonconsulting.com',
    focus: 'What should we post next month?',
    flags: ['Two results were logged without dates.'],
    headline: 'Book more diagnostic calls',
    recs: [],
  })
  // lists the model wrote as items with a text read the same; anything else is left out
  expect(readOf({ id: 'x', data: { insights: { double_down: [{ text: 'A' }, { point: 'B' }, 3, '', null] } } }).doubleDown).toEqual(['A', 'B'])
  // a recommendation with no title is left out
  expect(readOf({ id: 'x', data: { insights: { recommendations: [{ why: 'no title' }] } } }).recs).toEqual([])
})

test('the line over a read: its day, then a daily read or who asked', () => {
  const now = Date.now()
  expect(readLine(daily, now, 'UTC')).toBe('Strategy read · ' + dayText(daily.createdAt, false, 'UTC') + ' · Daily read')
  expect(readLine(asked, now, 'UTC')).toBe('Strategy read · ' + dayText(asked.createdAt, false, 'UTC') + ' · asked by pat')
  expect(dayShort('2025-03-04', Date.UTC(2026, 0, 1))).toBe('4 Mar 2025')
  expect(dayShort('2026-03-04', Date.UTC(2026, 5, 1))).toBe('4 Mar')
  expect(dayShort('', Date.now())).toBe('')
})

test('the codes in the text: a chip for what it read, an unknown one left out, no space before a full stop', () => {
  expect(parts(daily.summary, daily.refs)).toEqual([
    { text: 'Posts about onboarding got the most saves ' },
    { code: 'R1', short: 'Post result', label: 'Post · Why onboarding stalls' },
    { text: ', and the audit campaign is still running ' },
    { code: 'C1', short: 'Campaign 6 Nov', label: 'Campaign · 6 Nov 2026 · Onboarding Audit' },
    { text: '.' },
  ])
  expect(parts('No proof from a client yet [ZZ].', daily.refs)).toEqual([{ text: 'No proof from a client yet.' }])
  expect(parts('', daily.refs)).toEqual([])
  const r = { kind: '', label: '', runId: '', id: '', which: '' }
  expect(['OB', 'AB', 'D2', 'L1', 'I3', 'X1'].map((c) => refShort(c, r))).toEqual(['Organic brief', 'Ad brief', 'Draft', 'Library', 'Idea', 'X1'])
  expect(refShort('R2', { ...r, label: 'Ad · Audit hook' })).toBe('Ad result')
  expect(refShort('C2', { ...r, label: 'Campaign' })).toBe('Campaign')
  expect(refLabel(daily.refs.OB)).toBe('Organic brief · 9 Nov 2026')
  expect(plain('Keep the audit hook [C1].')).toBe('Keep the audit hook.')
  expect(evidenceOf(daily.recs[0], daily.refs).map((e) => e.code)).toEqual(['OB', 'R1'])
  expect(evidenceOf({ ...daily.recs[0], evidence: ['[ZZ]', 'OB', '[OB]'] }, daily.refs).map((e) => e.code)).toEqual(['OB'])
})

test('where a source opens, and where a recommendation is made', () => {
  expect(refGo(daily.refs.OB)).toEqual({ href: '/briefs?run=agent1_run_9' })
  expect(refGo(daily.refs.AB)).toEqual({ href: '/briefs?tab=ads&run=agent2_run_9' })
  expect(refGo(daily.refs.C1)).toEqual({ legacy: 'marketing-generation' })
  expect(refGo(daily.refs.R1)).toEqual({ tab: 'results' })
  expect(refGo({ kind: 'draft', label: 'Draft · x', runId: '', id: 'd1', which: '' })).toEqual({ href: '/content-transformation?tab=drafts&draft=d1' })
  expect(refGo({ kind: 'draft', label: 'Draft · x', runId: '', id: '', which: '' })).toEqual({ href: '/content-transformation?tab=ideas' })
  expect(refGo({ kind: 'library', label: 'Library · x', runId: '', id: 'p1', which: '' })).toEqual({ href: '/content-transformation?tab=ideas' })
  expect(refGo({ kind: 'brief', label: '', runId: '', id: '', which: 'organic' })).toEqual({ href: '/briefs' })
  expect(daily.recs.map(makeIn)).toEqual(['content-transformation', 'marketing-generation'])
  expect(makeIn({ ...daily.recs[0], start: 'source', format: 'ad' })).toBe('marketing-generation')
  expect(['ad', 'thought_leadership', '', 'webinar'].map(formatName)).toEqual(['Paid ad', 'Thought leadership', 'Content', 'webinar'])
  // the gaps column: the vision fit's gaps, else what is missing, which shows apart only when both are given
  expect(gapsOf(daily)).toEqual(daily.gaps)
  expect(sharpenOf(daily)).toEqual(daily.missing)
  expect(gapsOf(asked)).toEqual(['Log your first results.'])
  expect(sharpenOf(asked)).toEqual([])
  expect([hasMore(daily), hasMore(asked)]).toEqual([true, false])
})

test('what the next read reads, as chips, and whether the offer and context are set', () => {
  const C = chips({ voice: true, ctx: false, camps: 1, drafts: 1, lib: 1, ideas: 1, posts: 3, ads: 0, ob: '2026-11-09T14:00:00Z', ab: '' }, Date.UTC(2026, 10, 12), 'UTC')
  expect(C.map((c) => c.label + ' ' + c.value + (c.ok ? '' : ' !'))).toEqual([
    'Voice set',
    'Offer and context not set !',
    'Campaigns 1',
    'Drafts 1',
    'Library 1',
    'Open ideas 1',
    'Post results 3',
    'Ad results 0 !',
    'Briefs organic 9 Nov',
  ])
  expect(C.map((c) => c.go)).toEqual([
    { legacy: 'company-profile' },
    { legacy: 'company-profile' },
    { legacy: 'marketing-generation' },
    { href: '/content-transformation?tab=drafts' },
    { href: '/content-transformation?tab=ideas' },
    { href: '/content-transformation?tab=ideas' },
    { tab: 'results' },
    { tab: 'results' },
    { href: '/briefs' },
  ])
  expect(chips({ voice: false, ctx: false, camps: 0, drafts: 0, lib: 0, ideas: 0, posts: 0, ads: 0, ob: '', ab: '' }, Date.now()).at(-1)).toMatchObject({ value: 'none yet', ok: false })
  expect([ctxSet({ offer: ' ' }), ctxSet('{"differentiator":"We ship in a week"}'), ctxSet(null), ctxSet({ avoid_claims: 'guarantees' })]).toEqual([false, true, false, true])
})

test('a read started: running for five minutes, then taking longer; one that failed says why; one that finished says nothing', () => {
  const now = 1_800_000_000_000
  const run = (min: number, runId = 'r1'): Run => ({ runId, t: now - min * 60e3, by: 'a@x', focus: '' })
  expect(runState([], [], now)).toBeNull()
  expect(runState([run(1)], [], now)?.st).toBe('running')
  expect(runState([run(6)], [], now)?.st).toBe('slow')
  expect(runState([run(31)], [], now)).toBeNull()
  expect(runState([run(1)], [{ runId: 'r1', ok: true, error: '' }], now)).toBeNull()
  expect(runState([run(1)], [{ runId: 'r1', ok: false, error: 'Not enough to read yet.' }], now)).toMatchObject({ st: 'failed', error: 'Not enough to read yet.' })
  expect(runState([run(40)], [{ runId: 'r1', ok: false, error: 'x' }], now)).toBeNull()
  // the newest run is the one that counts
  expect(runState([run(10, 'old'), run(1, 'new')], [], now)).toMatchObject({ st: 'running', run: { runId: 'new' } })
  expect(runsOf({ runs: [{ run_id: 'a', t: 5, by: 'x', focus: 'f' }, { run_id: '', t: 1 }, { t: 3 }] })).toEqual([{ runId: 'a', t: 5, by: 'x', focus: 'f' }])
  expect(runsOf('{"runs":[{"run_id":"b","t":7}]}')).toEqual([{ runId: 'b', t: 7, by: '', focus: '' }])
  expect(runsWith([run(60 * 25, 'stale'), run(30, 'kept')], run(0, 'new'), now).map((r) => r.run_id)).toEqual(['new', 'kept'])
  expect(errorOf({ title: 'Strategy read did not finish', data: { error: 'Not enough to read yet.' } })).toBe('Not enough to read yet.')
  expect(errorOf({ title: 'Strategy read did not finish', data: '{}' })).toBe('Strategy read did not finish')
  expect(errorOf({})).toBe('The strategy read did not finish. Try again.')
  expect([startedAgo(now - 20e3, now), startedAgo(now - 60e3, now), startedAgo(now - 3 * 60e3, now)]).toEqual(['just now', 'a minute ago', '3 minutes ago'])
})

test('remembered for every run: the line without its codes, first in the list, and the house rules made from it', () => {
  const item = memItem(daily, 'dd', 0, 'me@aiparagonconsulting.com', 'T')
  expect(item).toEqual({ id: 'read:sr-1:dd:0', text: 'Double down: Keep the audit hook.', at: 'T', by: 'me@aiparagonconsulting.com' })
  expect(memItem(daily, 'cs', 0, 'me', 'T')?.text).toBe('Change or stop: Stop the long intro.')
  expect(memItem(daily, 'cs', 5, 'me', 'T')).toBeNull()
  expect(memOf({ memory: [{ id: 'a', text: 'x' }, { id: 'b' }, 'junk'] })).toEqual([{ id: 'a', text: 'x', at: '', by: '' }])
  const old = memOf(testingRows().ai_settings[0].value)
  const mem = memWith(old, item!)
  expect(mem.map((m) => m.id)).toEqual(['read:sr-1:dd:0', 'read:sr-1:dd:1'])
  // remembered again, it moves to the top once
  expect(memWith(mem, { ...old[0], at: 'U' }).map((m) => m.id)).toEqual(['read:sr-1:dd:1', 'read:sr-1:dd:0'])
  // forty at most
  const many = Array.from({ length: 45 }, (_, i) => ({ id: 'm' + i, text: 't' + i, at: '', by: '' }))
  expect(memWith(many, item!)).toHaveLength(40)
  expect(memRules(mem)).toEqual(['The team asked to remember: Double down: Keep the audit hook; Double down: Post on Tuesdays.'])
  expect(memRules([])).toEqual([])
  // a long list becomes as few rules as fit, each under 900 characters
  const long = chunk('P: ', ['a'.repeat(500), 'b'.repeat(500), 'c'], 900)
  expect(long.map((r) => r.length)).toEqual([504, 507])
  expect(clipWord('one two three four', 10)).toBe('one two…')
})
