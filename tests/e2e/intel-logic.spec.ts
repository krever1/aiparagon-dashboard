import { expect, test } from '@playwright/test'
import {
  type IntelItem, briefSets, briefThemes, capOf, fiveFor, fmtN, focusAddProblem, focusOf, followCounts, itemOf, kindOf, linkedinHandle, longDay,
  nextRun, parseRunLine, pendingOf, pickRun, platLabel, rankPosts, ranksOf, runRows, runsOf, scheduleOf, scoreFrom, termsOf, themeCounts, themeLabel, tokens,
  valOf, whoOf, whyFull, whyShort, windowIso, xHandle, competitorOf,
} from '../../src/lib/pipeline/intel'
import { BRIEF_MD, P, RUN_A, RUN_B, RUN_C, U, intelRows } from './intel-fixtures'

// The Intel Tracker's rules, checked without a browser, on the made-up rows in tests/e2e/intel-fixtures.ts.

const rows = intelRows()
const comp = Object.fromEntries(rows.competitors.map((c) => [c.id, c.name]))
const items: IntelItem[] = rows.intel_items.map((r) => itemOf(r, whoOf(r, comp[String(r.competitor_id)] ?? '', '')))
const byId = (n: number) => items.find((i) => i.id === P(n))!
const briefA = rows.agent_outputs[0]

test('a post as the page reads it: JSON kept as text, the score, the value, who wrote it', () => {
  const p1 = byId(1)
  expect(p1).toMatchObject({ score: 82, val: 'high', eng: 340, likes: 300, comments: 30, shares: 10, themes: ['ai-adoption', 'client-experience'], who: 'Northwind Advisors' })
  expect(p1.parts).toEqual({ relevance: 90, engagement: 80, timeliness: 70, opportunity: 85, credibility: 75 })
  // "other" is no theme, but the brief's focus still sees it
  expect(byId(3)).toMatchObject({ themes: ['governance'], rawThemes: ['governance', 'other'], who: 'Contoso Planning', val: 'medium' })
  // no author: the account it follows
  expect(byId(4)).toMatchObject({ who: 'Acme Wealth', val: 'low' })
  // a web article has no engagement count
  expect(byId(5).eng).toBeNull()

  // the score from its parts only when all five are there; the value bands
  // (90×35 + 80×20 + 70×15 + 85×20 + 75×10) / 100 = 82.5, rounded
  expect(scoreFrom({ relevance: 90, engagement: 80, timeliness: 70, opportunity: 85, credibility: 75 })).toBe(83)
  expect(scoreFrom({ relevance: 90 })).toBeNull()
  expect([valOf(70, ''), valOf(69, ''), valOf(45, ''), valOf(44, ''), valOf(null, 'High'), valOf(null, 'x')]).toEqual(['high', 'medium', 'medium', 'low', 'high', ''])
  const noScore = itemOf({ id: 'x', score: null, score_parts: j({ relevance: 50, engagement: 50, timeliness: 50, opportunity: 50, credibility: 50 }) })
  expect(noScore.score).toBe(50)
  expect(itemOf({ id: 'y', summary: 'one two three four five six seven eight nine ten eleven twelve thirteen' }).head).toBe(
    'one two three four five six seven eight nine ten eleven twelve…',
  )

  // who: the author, the account followed, the name the brief gives the link, a LinkedIn post link, else nobody known
  expect(whoOf({ author_name: '', author_company: '' }, '', 'From Brief')).toBe('From Brief')
  expect(whoOf({ url: 'https://www.linkedin.com/posts/jane-doe-12345_ai-activity-1' }, '', '')).toBe('Jane Doe')
  expect(whoOf({}, '', '')).toBe('Unknown author')
})
const j = (v: unknown) => JSON.stringify(v)

test('words: numbers, platforms and themes', () => {
  expect([fmtN(999), fmtN(1200), fmtN(15300), fmtN(null)]).toEqual(['999', '1.2k', '15k', ''])
  expect(['linkedin', 'meta', 'twitter', 'instagram', 'web', ''].map(platLabel)).toEqual(['LinkedIn', 'Facebook', 'X', 'Instagram', 'Web', 'Web'])
  expect(['ai-adoption', 'product-dev', 'ria_growth', 'agentic-ai', 'value-and-results'].map(themeLabel)).toEqual([
    'AI adoption',
    'Product development',
    'RIA growth',
    'Agentic AI',
    'Value and results',
  ])
  expect(themeCounts(items).map((t) => `${t.l} ${t.n}`)).toEqual(['AI adoption 2', 'Client experience 2', 'Governance 1', 'Hiring 1', 'Regulation 1'])
  expect(briefThemes(JSON.parse(briefA.data as string).top_themes).map((t) => t.l)).toEqual(['AI adoption', 'Client experience', 'Governance'])
  expect(longDay('2026-11-09T14:08:00Z', 'UTC')).toBe('9 Nov 2026')
  expect(longDay('2026-11-09')).toBe('9 Nov 2026')
})

test('the five things: the brief’s TL;DR when there is no snapshot, each with the posts closest to it', () => {
  const five = fiveFor(undefined, BRIEF_MD, items)
  expect(five.map((f) => f.text)).toEqual(['Proof beats promises', 'Onboarding in days', 'Governance checklists spread', 'Step by step AI guides'])
  expect(five[0].tag).toBe('Theme')
  // 340 is the first post's engagement: six more points, so it comes first
  expect(five[0].ids[0]).toBe(P(1))
  expect(five[1].ids[0]).toBe(P(2))
  expect(five[2].ids).toContain(P(3))
  // three words each ("guides" loses its ending, "guide" keeps it, as before): the high-value post's extra point ties
  // them, and engagement puts the web article, which has none, second
  expect(five[3].ids).toEqual([P(1), P(5)])
  // the off-topic hiring post never comes up
  expect(five.flatMap((f) => f.ids)).not.toContain(P(4))
  // a snapshot wins
  const snap = j({ items: [{ text: 'Flat fees are the talk', why: 'Four posts', tag: 'Pricing' }] })
  expect(fiveFor(snap, BRIEF_MD, items).map((f) => [f.text, f.tag])).toEqual([['Flat fees are the talk', 'Pricing']])
  // words that count: no short or common ones, no endings
  expect(tokens('The advisors are sharing checklists, 340 reactions!')).toEqual(['advisor', 'shar', 'checklist', '340', 'reaction'])
  expect(rankPosts({ text: 'nothing in common at all here' }, items)).toEqual([])
})

test('which brief a post went into, and why, in one line and in full', () => {
  const B = briefSets(briefA as never)
  const ranks = ranksOf(items)
  expect(ranks[P(4)]).toMatchObject({ n: 1, of: 5 })
  expect(ranks[P(1)]).toMatchObject({ n: 2, sn: 1, sof: 5 })
  expect(ranks[P(5)]).toEqual({ sn: 3, sof: 5 })
  const cap = (n: number) => capOf(byId(n), B)
  expect([1, 2, 3, 4, 5, 6].map(cap)).toEqual(['in', 'in', 'in', 'out', 'out', 'out'])
  expect(capOf(byId(1), null)).toBe('none')
  expect(capOf(byId(1), undefined)).toBe('wait')
  const short = (n: number) => whyShort(byId(n), cap(n), B, ranks[P(n)])
  expect(short(1)).toBe('In the brief · score 82 · high value · quoted in the brief')
  expect(short(2)).toBe('In the brief · score 71 · flags a shift')
  expect(short(3)).toBe('In the brief · score 58 · topic watch: security')
  expect(short(4)).toBe('Left out: off-topic for your buyers')
  expect(short(5)).toBe('Left out: below the top 3 by score')
  expect(short(6)).toBe('Left out: not in a theme you track')
  expect(whyShort(byId(1), 'none', null)).toBe('No brief was saved for this run')

  const f1 = whyFull(byId(1), 'in', B, ranks[P(1)])
  expect(f1.head).toBe('Why it is in the brief')
  expect(f1.lines).toEqual([
    { label: 'Found', text: 'from Northwind Advisors, who you follow.' },
    { label: 'Read', text: 'each run reads up to 50 posts, the most engaged first. This was the 2nd most engaged of the 5 social posts read.' },
    { label: 'Scored', text: '82 out of 100.' },
    { label: 'In the brief', text: 'one of the top 3 on-topic posts of its run by score, in the themes and categories you track.' },
    { label: 'High value', text: 'Advisors want proof before they book a call.' },
    { label: 'Quoted', text: 'the brief links to it in its text.' },
    { label: 'Reply drafted', text: 'it is in the Engagement queue for your approval.' },
  ])
  expect(f1.foot).toBe('Captured in the organic brief of 9 Nov 2026.')
  const f6 = whyFull(byId(6), 'out', B, ranks[P(6)])
  expect(f6.head).toBe('Why it was left out')
  expect(f6.lines.find((l) => l.label === 'Left out')?.text).toBe(
    'the brief only takes posts in the themes and organic categories you track, and this one is in none of your themes. Change them on the Following tab.',
  )
  expect(f6.foot).toBe('Read for the organic brief of 9 Nov 2026, but not used in it.')
  const f5 = whyFull(byId(5), 'out', B, ranks[P(5)])
  expect(f5.lines[1]).toEqual({ label: 'Read', text: 'web articles have no engagement counts, so each run keeps room for some among the 50 posts it reads.' })
  expect(whyFull(byId(1), 'none', null).foot).toBe('No brief was saved for this run.')
})

test('the runs, newest first; the one to show; the next scheduled run', () => {
  const briefs = rows.agent_outputs.map((b) => ({ run_id: String(b.run_id), created_at: String(b.created_at) }))
  const runs = runsOf(rows.runs.filter((r) => r.agent === 'intel_tracker'), briefs)
  expect(runs.map((r) => [r.runId, r.ok])).toEqual([
    [RUN_A, true],
    [RUN_B, true],
    [RUN_C, false],
  ])
  expect(runs[0].stats).toEqual({ items: 6, high_value: 2, drafts: 2 })
  expect(pickRun(runs, briefs, RUN_B)).toBe(RUN_B)
  expect(pickRun(runs, briefs, 'unknown')).toBe(RUN_A)
  expect(pickRun([], [], null)).toBe('')
  // a brief with no run row is a run that finished
  expect(runsOf([], [{ run_id: 'agent1_x', created_at: '2026-11-01T00:00:00Z' }])).toMatchObject([{ runId: 'agent1_x', ok: true }])

  expect(windowIso('2026-11-02 14:00 UTC')).toBe('2026-11-02T14:00:00.000Z')
  expect(windowIso('2026-11-02')).toBe('2026-11-02T00:00:00.000Z')
  expect(windowIso('')).toBeNull()

  // weekly on Monday at 6 in the morning, Pacific: on Wednesday 11 Nov 2026 that is Monday 16 Nov, 14:00 UTC
  const S = scheduleOf({ intel: { cadence: 'weekly', day: 'mon', time: '06:00', tz: 'America/Los_Angeles' } })
  expect(new Date(nextRun(S, Date.parse('2026-11-11T12:00:00Z'))!).toISOString()).toBe('2026-11-16T14:00:00.000Z')
  // daily: the next morning
  expect(new Date(nextRun({ ...S, cadence: 'daily' }, Date.parse('2026-11-11T15:00:00Z'))!).toISOString()).toBe('2026-11-12T14:00:00.000Z')
  expect(scheduleOf(null)).toMatchObject({ cadence: 'weekly', day: 'mon', time: '06:00', read: 50, keep: 10, saved: false })
})

test('who it follows: people and companies, ads only left out of the counts; the searches', () => {
  const list = rows.competitors.map((c) => competitorOf(c))
  expect(list.map(kindOf)).toEqual(['company', 'company', 'person', 'company', 'company'])
  const T = termsOf({ topics: ['AI governance'], tech: ['Microsoft Copilot'], industries: [] }, ['AI governance', 'Microsoft Copilot', 'Older keyword'])
  expect(T).toEqual({ topics: ['AI governance', 'Older keyword'], tech: ['Microsoft Copilot'], industries: [] })
  // only keywords saved: they are the topics
  expect(termsOf(null, ['One', 'Two'])).toEqual({ topics: ['One', 'Two'], tech: [], industries: [] })
  expect(followCounts(list, T)).toEqual({ people: 1, companies: 2, topics: 2, tech: 1, industries: 0, all: 3 })
  expect(linkedinHandle('https://www.linkedin.com/in/pat-voice/', 'person')).toBe('in/pat-voice')
  expect(linkedinHandle('acme', 'company')).toBe('company/acme')
  expect(linkedinHandle('https://example.com/acme', 'company')).toBeNull()
  expect([xHandle('@acme'), xHandle('https://x.com/acme?s=1'), xHandle('')]).toEqual(['acme', 'acme', null])
})

test('what it tracks: everything until saved, a theme of the team’s own, why one cannot be added', () => {
  const all = focusOf(null)
  expect(all.saved).toBe(false)
  expect(all.themes).toHaveLength(14)
  expect(all.cats).toHaveLength(9)
  const saved = focusOf({ themes: ['security', 'nope'], custom: ['Succession planning'], categories: ['news'] })
  expect(saved).toEqual({ themes: ['security'], custom: ['Succession planning'], cats: ['news'], saved: true })
  expect(focusAddProblem(saved, 'a')).toBe('Type a theme of two letters or more.')
  expect(focusAddProblem(saved, 'succession PLANNING')).toBe('That theme is already on the list.')
  expect(focusAddProblem(saved, 'Agentic AI')).toBe('That theme is already on the list.')
  expect(focusAddProblem({ custom: Array.from({ length: 10 }, (_, i) => 'T' + i) }, 'New one')).toBe('You can add up to 10 themes of your own.')
  expect(focusAddProblem(saved, 'Estate law')).toBe('')
})

test('Run now: a pasted line, the rows that go, and why they cannot; the runs started and not landed', () => {
  expect(parseRunLine('Acme Advisory, acme.com, linkedin.com/company/acme, @acme, facebook.com/acme')).toEqual({
    name: 'Acme Advisory',
    website: 'acme.com',
    linkedin: 'linkedin.com/company/acme',
    x: '@acme',
    facebook: 'facebook.com/acme',
  })
  expect(parseRunLine('Northwind AI, a note, another note')).toEqual({ name: 'Northwind AI', notes: 'a note; another note' })
  expect(parseRunLine('   ')).toBeNull()
  expect(runRows([{}])).toEqual({ ok: false, error: 'Add at least one competitor.' })
  expect(runRows([{ website: 'acme.com' }])).toEqual({ ok: false, error: 'Competitor 1 needs a name.' })
  expect(runRows([{ name: 'Acme' }, { name: 'Beta', notes: 'x' }])).toEqual({
    ok: false,
    error: 'Acme, Beta: add a website or at least one social profile so the tracker has something to read.',
  })
  expect(runRows([{ name: ' Acme ', website: ' acme.com ' }, {}])).toEqual({ ok: true, rows: [{ name: 'Acme', website: 'acme.com' }] })

  const now = Date.parse('2026-11-11T12:00:00Z')
  const p = pendingOf({ runs: [{ run_id: 'a', names: ['Acme'], t: now - 60_000, by: 'qa@x' }, { run_id: 'b', t: now - 46 * 60_000 }] }, now)
  expect(p).toEqual([{ runId: 'a', names: ['Acme'], t: now - 60_000, by: 'qa@x', cascade: false }])
  expect(U(1)).toContain('example-post-1')
})
