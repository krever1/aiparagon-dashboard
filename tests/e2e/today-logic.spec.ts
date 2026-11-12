import { expect, test } from '@playwright/test'
import { normCall, normMeta } from '../../src/lib/catalyst/calls'
import { callItems, crmItems, inboxItems, itemText, recent } from '../../src/lib/catalyst/inbox'
import type { LeadView } from '../../src/lib/catalyst/view'
import type { Item, Kind } from '../../src/lib/touchpoint/approvals'
import {
  TOUR, agentName, agoWords, catalystLine, firstName, greeting, hello, needChips, needLine, pipelineLine, runIcon, runState, todayText, touchLine,
  waiting, whenText,
} from '../../src/lib/touchpoint/today'

// Today's rules, checked without a browser: the hello line, what is counted as waiting, the products' lines, the runs
// and the sign-ups' times, and Catalyst's new clients and transcripts.

test('the hello line: the greeting by the hour, the first name, the date and how many things need you', () => {
  expect([0, 11, 12, 17, 18, 23].map(greeting)).toEqual(['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening'])
  expect(['QA Teammate', 'kser.v@aiparagonconsulting.com', 'erica', '', '  maria_lopez'].map(firstName)).toEqual(['QA', 'Kser', 'Erica', '', 'Maria'])
  expect([hello(9, 'QA Teammate'), hello(20, '')]).toEqual(['Good morning, QA.', 'Good evening.'])
  expect([0, 1, 5].map(needLine)).toEqual(['Nothing needs you right now.', '1 thing needs you.', '5 things need you.'])
  expect(todayText(new Date('2026-11-11T09:30:00Z'), 'UTC')).toBe('Wednesday 11 November')
  // the viewer's own day: late on the 11th in UTC is already the 12th in Manila
  expect(todayText(new Date('2026-11-11T23:30:00Z'), 'Asia/Manila')).toBe('Thursday 12 November')
})

test('what waits: not skipped in this browser, not a reply older than a week; Needs you’s chips', () => {
  const it = (key: string, kind: Kind, stale = false) =>
    ({ key, kind, icon: 'file', title: key, text: '', tags: [], approve: true, review: { kind: 'reply' }, when: '', stale }) as Item
  const items = [it('b1', 'brief'), it('a1', 'ad'), it('a2', 'ad'), it('r1', 'reply'), it('r2', 'reply', true), it('f1', 'failed')]
  expect(waiting(items, { a1: 1 }).map((x) => x.key)).toEqual(['b1', 'a2', 'r1', 'f1'])
  expect(needChips(waiting(items, {}))).toEqual([
    { kind: 'brief', word: 'briefs', label: '1 brief' },
    { kind: 'ad', word: 'ads', label: '2 ads' },
    { kind: 'reply', word: 'replies', label: '1 reply' },
    { kind: 'failed', word: 'failed', label: '1 failed request' },
  ])
})

test('the products’ lines', () => {
  expect([touchLine(0), touchLine(1), touchLine(4)]).toEqual(['Nothing waiting for you', '1 thing waiting for you', '4 things waiting for you'])
  expect([catalystLine(1, 0), catalystLine(12, 9)]).toEqual(['1 lead', '12 leads · 9 waiting on a next stage'])
  expect([pipelineLine(0, 0), pipelineLine(2, 1), pipelineLine(1, null), pipelineLine(0, 3)]).toEqual([
    'No briefs waiting · 0 live landing pages',
    '2 briefs to review · 1 live landing page',
    '1 brief to review',
    'No briefs waiting · 3 live landing pages',
  ])
})

test('recent runs: the agent’s name, its icon, when and how it went', () => {
  expect(['success', 'Done', 'OK', 'completed', 'running', 'queued', 'started', 'error', '', 'failed'].map(runState)).toEqual([
    'done', 'done', 'done', 'done', 'running', 'running', 'running', 'failed', 'failed', 'failed',
  ])
  expect(['intel_tracker', 'ad_strategist', 'low_ticket_content', 'content_generation', 'funnel_builder', ''].map(agentName)).toEqual([
    'Intel Tracker', 'Ad Strategist', 'Marketing Generation', 'Content Transformation', 'funnel builder', 'Agent',
  ])
  expect(['ad_strategist', 'intel_tracker', 'funnel_builder'].map(runIcon)).toEqual(['megaphone', 'radar', 'rocket'])
  const thisYear = new Date().getUTCFullYear()
  expect(whenText(`${thisYear}-11-11T14:05:00Z`, 'UTC')).toMatch(/^[A-Z][a-z]{2} 11 Nov, 2:05 PM$/)
  expect(whenText(`${thisYear - 3}-03-02T08:00:00Z`, 'UTC')).toMatch(new RegExp(`^[A-Z][a-z]{2} 2 Mar ${thisYear - 3}, 8:00 AM$`))
  expect(whenText('', 'UTC')).toBe('')
})

test('a sign-up’s time, in words', () => {
  const now = Date.parse('2026-11-11T12:00:00Z')
  const ago = (ms: number) => agoWords(new Date(now - ms).toISOString(), now)
  expect([ago(20e3), ago(60e3), ago(5 * 60e3), ago(3 * 36e5), ago(30 * 36e5), ago(50 * 36e5), ago(4 * 864e5)]).toEqual([
    'just now', '1 minute ago', '5 minutes ago', '3 hours ago', 'yesterday', '2 days ago', '4 days ago',
  ])
  expect(agoWords('not a time')).toBe('')
})

// ---------- Catalyst's new clients and transcripts ----------


const NOW_I = Date.parse('2026-11-11T12:00:00Z')
const agoI = (ms: number) => new Date(NOW_I - ms).toISOString()
const TEAMP = { name: 'QA Teammate', email: 'qa.teammate@aiparagonconsulting.com' }
const lv = (name: string, email: string, stage: string) =>
  ({ id: name.toLowerCase().replace(/\s+/g, '-') + '-0000000000', name, email, emails: [email], stored: stage, derived: 'research', run: null }) as unknown as LeadView

test('new clients from HubSpot: seen lately, not a lead, not set aside, not the team’s', () => {
  const c = (email: string, days: number | null, extra: Record<string, unknown> = {}) => ({
    email, first_name: 'First', last_name: email.split('@')[0], first_seen: days === null ? null : agoI(days * 864e5), ...extra,
  })
  const items = crmItems(
    [
      c('Tom.Becker@Example.com', 2, { first_name: 'Tom', last_name: 'Becker', company: 'Halvern Foods', job_title: 'COO' }),
      c('tom.becker@example.com', 1),
      c('old@example.com', 20),
      c('lead@example.com', 1),
      c('aside@example.com', 1),
      c('mate@aiparagonconsulting.com', 1),
      c('never@example.com', null),
      { email: 'noname@example.com', first_seen: agoI(864e5) },
    ],
    new Set(['lead@example.com']),
    { 'aside@example.com': { by: 'x' } },
    NOW_I,
  )
  expect(items.map((x) => [x.key, x.raw, x.name, x.company])).toEqual([
    ['crm:tom.becker@example.com', 'Tom.Becker@Example.com', 'Tom Becker', 'Halvern Foods'],
    ['crm:noname@example.com', 'noname@example.com', 'noname@example.com', ''],
  ])
  expect([recent(agoI(14 * 864e5 - 1000), NOW_I), recent(agoI(14 * 864e5 + 1000), NOW_I), recent('', NOW_I)]).toEqual([true, false, false])
})

test('new transcripts: recorded lately, with a lead among the guests, not filed yet', () => {
  const call = (id: number, title: string, hoursAgo: number, guest?: { name: string; email: string }) =>
    normCall({
      id, title, start: agoI(hoursAgo * 36e5), end: new Date(NOW_I - hoursAgo * 36e5 + 40 * 60e3).toISOString(), recorded_by: TEAMP,
      invitees: guest ? [TEAMP, { ...guest, external: true }] : [TEAMP],
    })
  const leads = [lv('Nia New', 'nia.new@example.com', 'research'), lv('Ria Review', 'ria.review@example.com', 'review')]
  const metas = { '3': normMeta({ call_id: '3', lead_email: 'nia.new@example.com', lead_stage: 'research' }) }
  const items = callItems(
    [
      call(1, 'Discovery call with Nia', 49, { name: 'Nia New', email: 'nia.new@example.com' }),
      call(2, 'Old call with Nia', 20 * 24, { name: 'Nia New', email: 'nia.new@example.com' }),
      call(3, 'Filed call with Nia', 24, { name: 'Nia New', email: 'nia.new@example.com' }),
      call(4, 'Team sync', 24),
      call(5, 'Review call with Ria', 3, { name: 'Ria Review', email: 'Ria.Review@example.com' }),
    ],
    metas,
    leads,
    NOW_I,
  )
  expect(items.map((x) => [x.key, x.leadName, x.cur, x.nx, x.minutes])).toEqual([
    ['call:1', 'Nia New', 'research', 'consultation', 40],
    ['call:5', 'Ria Review', 'review', 'review', 40],
  ])
  const crm = crmItems([{ email: 'tom@example.com', first_name: 'Tom', first_seen: agoI(48 * 36e5) }], new Set(), {}, NOW_I)
  expect(inboxItems(crm, items).map((x) => x.key)).toEqual(['call:5', 'crm:tom@example.com', 'call:1'])

  // what each row says, with the team's name for a stage
  const names = { consultation: 'Kickoff call' }
  expect(itemText(crm[0], names, '')).toEqual({ t: 'New client from HubSpot: Tom', s: 'Run the pre-meeting prospect brief?', b: 'Run the brief' })
  expect(itemText(items[0], names, 'Nov 9')).toEqual({
    t: 'New transcript: your call with Nia New on Nov 9',
    s: 'In Prospect research. Run the kickoff call stage?',
    b: 'Run kickoff call',
  })
  expect(itemText(items[1], {}, 'Nov 11')).toEqual({
    t: 'New transcript: your call with Ria Review on Nov 11',
    s: 'In Client review. Run the client review brief again with it?',
    b: 'Run it again',
  })
})

test('the tour: four steps, the current dashboard’s first three, and a fourth that is true here', () => {
  expect(TOUR.map((s) => s.t)).toEqual(['Five products, one sidebar', 'One place for every approval', 'Two ways to create', 'Some pages are still moving over'])
  expect(TOUR[0].p).toContain('Click a name to open its pages.')
  // nothing about what this dashboard does not have
  for (const s of TOUR) expect(s.p).not.toMatch(/Ctrl K|Customize|\bAsk\b|G then a letter/)
  expect(TOUR[3].p).toContain('current dashboard')
})
