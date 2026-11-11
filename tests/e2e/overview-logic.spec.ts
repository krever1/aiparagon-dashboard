import { expect, test } from '@playwright/test'
import {
  type TileInput, W_KEYS, agentTiles, agoDays, campStatus, clip, contextOf, daysAgo, draftTitle, hiddenOf, moved, orderOf, voiceItems, voiceLine,
} from '../../src/lib/pipeline/overview'

// The Pipeline Overview's rules, without a browser: the cards' order, the agent tiles, what the agents know about the
// team, a campaign's approval line and a draft's title.

const D = 864e5
const NOW = Date.parse('2026-11-11T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const words = { day: (iso: string) => iso.slice(0, 10), when: (iso: string) => 'at ' + iso.slice(0, 10) }

const base: TileInput = {
  intelBrief: null,
  intelPosts: 0,
  adsBrief: null,
  ads: 0,
  intelRun: null,
  adsRun: null,
  replies: 0,
  briefsWaiting: 0,
  drafts: { n: 0, toCheck: 0, latest: null },
  campaigns: { n: 0, latest: null },
  results: { n: 0, read: null },
}

test('the cards: the usual order, a saved one with new cards added and unknown ones left out, and moves', () => {
  expect(orderOf(null)).toEqual(['needs', 'quick', 'agents', 'lead', 'camp', 'voice', 'tl', 'runs'])
  expect(orderOf(['runs', 'nope', 'needs', 'runs'])).toEqual(['runs', 'needs', 'quick', 'agents', 'lead', 'camp', 'voice', 'tl'])
  expect(orderOf('broken')).toEqual(W_KEYS)
  expect(hiddenOf(['tl', 'x', 'tl'])).toEqual(['tl'])
  expect(hiddenOf({})).toEqual([])
  const o = orderOf(null)
  expect(moved(o, 'quick', -1)?.slice(0, 2)).toEqual(['quick', 'needs'])
  expect(moved(o, 'needs', -1)).toBeNull()
  expect(moved(o, 'runs', 1)).toBeNull()
})

test('days ago, as the current dashboard counts them', () => {
  expect(daysAgo(ago(2 * D + 1000), NOW)).toBe(2)
  expect(daysAgo(null, NOW)).toBeNull()
  expect(agoDays(ago(3600e3), NOW)).toBe('today')
  expect(agoDays(ago(D + 1000), NOW)).toBe('yesterday')
  expect(agoDays(ago(12 * D + 1000), NOW)).toBe('12 days ago')
})

test('the agent tiles: numbers, lines, when they ran and their dots', () => {
  let t = agentTiles(base, words, NOW)
  expect(t.map((x) => x.slug)).toEqual(['intel-tracker', 'ad-strategist', 'briefs', 'content-transformation', 'marketing-generation', 'ad-testing'])
  expect(t.map((x) => x.s)).toEqual(['Not run yet', 'Not run yet', 'No briefs yet', 'No drafts yet', 'No campaigns yet', 'No strategy read yet'])
  expect(t.map((x) => x.dot)).toEqual(['', '', '', 'good', 'good', 'warn'])
  expect(t[3].u).toBe('drafts')

  t = agentTiles(
    {
      ...base,
      intelBrief: { createdAt: ago(D), nItems: 50, nHigh: 4 },
      intelPosts: 900,
      intelRun: { status: 'error', at: ago(D) },
      adsRun: { status: 'success', at: ago(10 * D) },
      adsBrief: { createdAt: ago(10 * D) },
      ads: 120,
      briefsWaiting: 1,
      drafts: { n: 1, toCheck: 0, latest: ago(D) },
      campaigns: { n: 1, latest: ago(D) },
      results: { n: 1, read: ago(D) },
    },
    words,
    NOW,
  )
  expect(t[0]).toMatchObject({ n: 50, l: '4 high value in the last brief', s: 'Last run failed · at ' + ago(D).slice(0, 10), dot: 'bad', why: 'The last run did not finish' })
  expect(t[1]).toMatchObject({ n: 120, l: 'Ads brief of ' + ago(10 * D).slice(0, 10), s: 'Last run ' + ago(10 * D).slice(0, 10) + ', 10 days ago', dot: 'warn', why: 'Last ran 10 days ago' })
  expect(t[2]).toMatchObject({ n: 1, dot: 'warn' })
  expect(t[3]).toMatchObject({ u: 'draft', l: 'From your own material', dot: 'good' })
  expect(t[4].u).toBe('campaign')
  expect(t[5]).toMatchObject({ u: 'result', l: 'Logged by your team', dot: 'good' })

  // replies come before the brief's numbers; the posts read stand in when the brief does not count them
  t = agentTiles({ ...base, replies: 1, intelBrief: { createdAt: ago(D), nItems: null, nHigh: 3 }, intelPosts: 7 }, words, NOW)
  expect(t[0]).toMatchObject({ n: 7, l: '1 reply to approve' })
})

test('what the agents know: eight things, what is missing, and the context kept as text', () => {
  const I = voiceItems({
    voice: { tone: '["Clear","Warm"]', summary: '', about: 'About us\nMore', mission: '', values_text: 'Plain words' },
    industry: 'Consulting',
    targetMarket: '',
    context: contextOf('{"offer":"Readiness review","differentiator":" "}'),
    topics: ['A', 'B', 'C', 'D', 'E'],
    following: [],
  })
  expect(I.map((x) => x.v)).toEqual(['Clear, Warm · About us', 'Plain words', 'Consulting', '', 'Readiness review', '', 'A, B, C +2 more', ''])
  expect(voiceLine(I)).toBe('Missing: ideal client, what makes you different, competitors followed. Drafts sound more like you once these are in.')
  expect(voiceLine(I.map((x) => ({ ...x, v: 'set' })))).toBe('Everything the agents read about you is set.')
  const none = voiceItems({ voice: null, industry: '', targetMarket: '', context: contextOf(null), topics: [], following: [] })
  expect(voiceLine(none)).toBe('Missing: your voice, mission and values, industry, ideal client and 4 more. Drafts sound more like you once these are in.')
})

test('a campaign’s approval line, a draft’s title and clipped text', () => {
  const img = (file: string) => ({ url: 'https://example.com/' + file, label: '', file })
  expect(campStatus([], {})).toEqual({ tone: 'info', text: 'Waiting for approval' })
  expect(campStatus([img('a'), img('b')], { a: 'approved', b: 'approved' })).toEqual({ tone: 'good', text: 'All 2 approved' })
  expect(campStatus([img('a'), img('b'), { url: '', label: 'No file', file: '' }], { a: 'approved', b: 'reopened' })).toEqual({ tone: 'warn', text: '1 of 2 approved' })
  expect(campStatus([img('a')], { a: 'rejected' })).toEqual({ tone: 'info', text: '0 of 1 approved' })
  expect(draftTitle('Draft title', { brief: { title: 'Why onboarding stalls' } })).toBe('Why onboarding stalls')
  expect(draftTitle(null, {})).toBe('Content draft')
  expect(draftTitle('Row title', { title: 'Its own title' })).toBe('Its own title')
  expect(clip('one two three four', 12)).toBe('one two…')
  expect(clip('  short  ', 12)).toBe('short')
})
