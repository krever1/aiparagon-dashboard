import { expect, test } from '@playwright/test'
import type { Item, Kind } from '../../src/lib/touchpoint/approvals'
import {
  agentName, agoWords, catalystLine, firstName, greeting, hello, needChips, needLine, pipelineLine, runIcon, runState, todayText, touchLine, waiting,
  whenText,
} from '../../src/lib/touchpoint/today'

// Today's rules, checked without a browser: the hello line, what is counted as waiting, the products' lines, the runs
// and the sign-ups' times.

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
