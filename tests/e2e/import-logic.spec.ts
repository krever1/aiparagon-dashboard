import { expect, test } from '@playwright/test'
import {
  type Existing, F_LEADS, F_ROWS, type ImportState, checkRow, dbWrite, decComma, dayFirst, guess, headAt, importRows, parseCsv, parseDay, parseNum, readFile, stageGuess,
  stageValues,
} from '../../src/lib/pipeline/ad-testing-import'

// Import a CSV without a browser (v106 in the current dashboard): a file read as it writes itself, its header and
// columns guessed, its numbers and days, what a CRM stage means, the rows a results file and a CRM export become and
// what they match, and the server's own checks before it writes.

const TODAY = '2026-11-12'

test('a CSV read as the file writes it: commas, semicolons or tabs, quotes, a BOM, blank lines', () => {
  expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\n\n1,2\r\n')).toEqual({
    rows: [
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', '2'],
    ],
    delim: ',',
  })
  expect(parseCsv('a;b;c\n1,5;2;3')).toEqual({
    rows: [
      ['a', 'b', 'c'],
      ['1,5', '2', '3'],
    ],
    delim: ';',
  })
  expect(parseCsv('a\tb\n1\t2').delim).toBe('\t')
  // a quote in the middle of a field is only a quote
  expect(parseCsv('a,b\nsay "hi",2').rows[1]).toEqual(['say "hi"', '2'])
  // a line break inside quotes stays in the field
  expect(parseCsv('a,b\n"one\ntwo",2').rows[1]).toEqual(['one\ntwo', '2'])
})

test('the header: the first line that names two columns we know; the columns guessed by their names', () => {
  expect(
    headAt([
      ['Report: Ads', ' Nov 2026'],
      ['Ad name', 'Amount spent (USD)', 'Results'],
      ['x', '1', '2'],
    ]),
  ).toBe(1)
  expect(headAt([['a'], ['b']])).toBe(0)
  expect(guess(['Ad name', 'Platform', 'Reporting starts', 'Amount spent (USD)', 'Impressions', 'Link clicks', 'Results'], F_ROWS)).toEqual({
    title: 0,
    platform: 1,
    posted_on: 2,
    spend: 3,
    impressions: 4,
    clicks: 5,
    leads: 6,
  })
  // a long name inside a header counts; a short one only as the whole header
  expect(guess(['Campaign name (ad set)', 'Total impressions', 'Ads'], F_ROWS)).toEqual({ title: 0, impressions: 1 })
  expect(guess(['Lifecycle Stage', 'Create Date', 'UTM Content'], F_LEADS)).toEqual({ title: 2, stage: 0, posted_on: 1 })
})

test('numbers and days as the file writes them, and no day after today', () => {
  expect([decComma(['1.250,50', '3,2'], ','), decComma(['1,250.50', '12.5'], ';'), decComma(['12', '13'], ';'), decComma(['12'], ',')]).toEqual([true, false, true, false])
  expect(parseNum('$1,250.50', false)).toBe(1250.5)
  expect(parseNum('1.250,50 €', true)).toBe(1250.5)
  expect(parseNum('18.000', true)).toBe(18000)
  expect([parseNum('–', false), parseNum('', false), parseNum('1-2', false)]).toEqual([null, null, null])
  expect([dayFirst(['20/09/2026', '01/02/2026']), dayFirst(['09/20/2026']), dayFirst(['01.02.2026'])]).toEqual([true, false, true])
  expect(parseDay('2026-09-20', false, TODAY)).toBe('2026-09-20')
  expect(parseDay('09/20/2026', false, TODAY)).toBe('2026-09-20')
  expect(parseDay('20.09.2026', true, TODAY)).toBe('2026-09-20')
  expect(parseDay('20/09/26', true, TODAY)).toBe('2026-09-20')
  expect(parseDay('Sep 20, 2026', false, TODAY)).toBe('2026-09-20')
  expect([parseDay('2026-02-30', false, TODAY), parseDay('2026-11-13', false, TODAY), parseDay('soon', false, TODAY)]).toEqual([null, null, null])
})

test('what a CRM stage most likely means: a lost or bad fit is only a lead', () => {
  const words = ['Customer', 'Closed won', 'Meeting booked', 'Demo scheduled', 'SQL', 'Opportunity', 'Unqualified', 'Lost', 'Spam', '', 'Subscriber', 'Won’t buy', "Won't buy"]
  expect(words.map(stageGuess)).toEqual(['won', 'won', 'booked', 'booked', 'qualified', 'qualified', 'lead', 'lead', 'lead', 'lead', 'lead', 'lead', 'lead'])
})

const head = ['Ad name', 'Platform', 'Reporting starts', 'Amount spent (USD)', 'Impressions', 'Link clicks', 'Results']
const ex: Existing[] = [
  { id: 'e1', kind: 'ad', title: 'Stop losing a week to paperwork', platform: 'Meta ads', postedOn: '2026-11-07', periodStart: '' },
  { id: 'e2', kind: 'ad', title: 'Undated', platform: '', postedOn: '', periodStart: '' },
]

test('a results file: one result per ad and day, two ad sets added together, matched to the one logged', () => {
  const I: ImportState = {
    mode: 'rows',
    kind: 'ad',
    map: guess(head, F_ROWS),
    stages: {},
    delim: ',',
    rows: [
      ['Stop losing a week to paperwork', 'Meta ads', '2026-11-07', '1,250.50', '9000', '120', '6'],
      ['New hook', 'Meta ads', '2026-11-10', '80', '2000', '20', '1'],
      ['New hook', 'Meta ads', '2026-11-10', '20', '500', '5', '0'],
      ['Undated', 'LinkedIn ads', '2026-11-01', '5', '10', '1', '0'],
      ['No numbers', '', '', '', '', '', ''],
      ['', 'Meta ads', '2026-11-10', '1', '1', '1', '1'],
    ],
  }
  const out = importRows(I, ex, TODAY)
  expect(out.map((r) => [r.title, r.match, r.matchDay])).toEqual([
    ['Stop losing a week to paperwork', 'e1', '2026-11-07'],
    ['New hook', null, null],
    // a result logged with no day, and no platform, is the one with that name
    ['Undated', 'e2', null],
  ])
  expect(out[0]).toMatchObject({ kind: 'ad', spend: 1250.5, impressions: 9000, clicks: 120, leads: 6, posted_on: '2026-11-07' })
  expect(out[1]).toMatchObject({ spend: 100, impressions: 2500, clicks: 25, leads: 1 })
  // organic posts leave out the ad numbers, and match no ad
  const posts = importRows({ ...I, kind: 'post' }, ex, TODAY)
  expect(posts[0]).toMatchObject({ kind: 'post', spend: null, leads: null, impressions: 9000, match: null })
  // a kind column decides for each row
  const k = importRows(
    {
      ...I,
      map: { title: 0, kind: 1, impressions: 2 },
      rows: [
        ['A', 'Sponsored', '10'],
        ['B', 'Organic', '20'],
      ],
    },
    [],
    TODAY,
  )
  expect(k.map((r) => r.kind)).toEqual(['ad', 'post'])
  // no name column, nothing
  expect(importRows({ ...I, map: { spend: 3 } }, ex, TODAY)).toEqual([])
})

test('a CRM export: leads counted for each ad by what its stage means, matched to the ad logged nearest before', () => {
  const H = ['Contact ID', 'Lifecycle Stage', 'Create Date', 'UTM Content']
  const I: ImportState = {
    mode: 'leads',
    kind: 'ad',
    delim: ',',
    map: guess(H, F_LEADS),
    stages: {},
    rows: [
      ['1', 'Lead', '2026-11-09', 'Audit ad'],
      ['2', 'Customer', '2026-11-09', 'Audit ad'],
      ['3', 'Meeting booked', '2026-11-10', 'New ad'],
      ['4', 'Unqualified', '2026-11-10', 'New ad'],
      ['5', 'Spam', '2026-11-10', ''],
    ],
  }
  expect(stageValues(I)).toEqual(['Lead', 'Customer', 'Meeting booked', 'Unqualified', 'Spam'])
  for (const v of stageValues(I)) I.stages[v] = stageGuess(v)
  I.stages.Unqualified = 'skip'
  const logged: Existing[] = [
    { id: 'old', kind: 'ad', title: 'Audit ad', platform: 'Meta ads', postedOn: '2026-11-01', periodStart: '' },
    { id: 'near', kind: 'ad', title: 'Audit ad', platform: 'Meta ads', postedOn: '2026-11-08', periodStart: '' },
    { id: 'later', kind: 'ad', title: 'Audit ad', platform: 'Meta ads', postedOn: '2026-11-11', periodStart: '' },
  ]
  expect(importRows(I, logged, TODAY).map((r) => ({ title: r.title, match: r.match, day: r.matchDay, leads: r.leads, q: r.qualified, b: r.bookings, w: r.won, on: r.posted_on }))).toEqual([
    { title: 'Audit ad', match: 'near', day: '2026-11-08', leads: 2, q: 1, b: 1, w: 1, on: null },
    { title: 'New ad', match: null, day: null, leads: 1, q: 1, b: 1, w: 0, on: '2026-11-10' },
  ])
})

test('a file read: its header after a report line, a CRM export read as leads, too few rows refused, 5,000 rows at most', () => {
  const r = readFile('Report: Ads, Nov 2026\nAd name,Amount spent (USD),Results\nX,5,1\n')
  expect(r).toMatchObject({ ok: true, head: ['Ad name', 'Amount spent (USD)', 'Results'], rows: [['X', '5', '1']], mode: 'rows', map: { title: 0, spend: 1, leads: 2 }, cut: false })
  expect(readFile('Lifecycle Stage,UTM Content\nCustomer,Ad')).toMatchObject({ ok: true, mode: 'leads', map: { stage: 0, title: 1 }, stages: { Customer: 'won' } })
  expect(readFile('Ad name,Spend\n')).toEqual({ ok: false, error: 'No rows found. Use a CSV with a header row and at least one row of results.' })
  const big = readFile('Ad name,Spend\n' + Array.from({ length: 5030 }, (_, i) => 'Ad ' + i + ',' + i).join('\n'))
  expect(big.ok && [big.rows.length, big.cut]).toEqual([5000, true])
})

test('the server checks every row again, and writes only what the file gives', () => {
  expect(checkRow({ kind: 'ad', title: ' X ', spend: '5.556', leads: 2, posted_on: '2026-11-10', url: 'javascript:alert(1)', match: 'e1' }, 'rows', TODAY)).toMatchObject({
    kind: 'ad',
    title: 'X',
    spend: 5.56,
    leads: 2,
    posted_on: '2026-11-10',
    url: null,
    match: 'e1',
  })
  expect(checkRow({ kind: 'post', title: 'P', spend: 5, impressions: 10 }, 'rows', TODAY)).toMatchObject({ spend: null, impressions: 10 })
  // refused: no kind, no name, no number (a negative one is none), not an object
  expect([
    checkRow({ kind: 'x', title: 'P', impressions: 1 }, 'rows', TODAY),
    checkRow({ kind: 'ad', title: '  ', leads: 1 }, 'rows', TODAY),
    checkRow({ kind: 'ad', title: 'A' }, 'rows', TODAY),
    checkRow({ kind: 'ad', title: 'A', leads: -1 }, 'rows', TODAY),
    checkRow('A', 'rows', TODAY),
  ]).toEqual([null, null, null, null, null])
  // a day after today and an id that is not one are dropped
  expect(checkRow({ kind: 'ad', title: 'A', leads: 1, posted_on: '2026-11-13', match: 'x;drop' }, 'rows', TODAY)).toMatchObject({ posted_on: null, match: null })
  // a CRM row is an ad's lead counts, nothing else
  expect(checkRow({ kind: 'post', title: 'A', leads: 2, spend: 9, notes: 'x', url: 'https://a.b' }, 'leads', TODAY)).toMatchObject({ kind: 'ad', leads: 2, spend: null, notes: null, url: null })

  const rows = [
    checkRow({ kind: 'ad', title: 'New', spend: 10, leads: 1, posted_on: '2026-11-10', period_end: '2026-11-11', notes: 'n' }, 'rows', TODAY)!,
    checkRow({ kind: 'ad', title: 'Old', clicks: 4, url: 'https://x.y/ad', match: 'e1' }, 'rows', TODAY)!,
  ]
  const w = dbWrite(rows, 'rows', 'me@aiparagonconsulting.com', 'T')
  expect(w.add).toEqual([
    {
      kind: 'ad', title: 'New', platform: null, url: null, posted_on: '2026-11-10', period_start: '2026-11-10', period_end: '2026-11-11', notes: 'n',
      impressions: null, reactions: null, comments: null, shares: null, clicks: null, spend: 10, leads: 1, qualified: null, bookings: null, won: null, revenue: null,
      attribution: 'csv', created_by: 'me@aiparagonconsulting.com', updated_by: 'me@aiparagonconsulting.com', updated_at: 'T',
    },
  ])
  expect(w.upd).toEqual([['e1', { updated_by: 'me@aiparagonconsulting.com', updated_at: 'T', attribution: 'csv', clicks: 4, url: 'https://x.y/ad' }]])
  const crm = dbWrite([checkRow({ title: 'Old', leads: 3, qualified: 1, bookings: 0, won: 0, match: 'e1' }, 'leads', TODAY)!], 'leads', 'me', 'T')
  expect(crm.upd).toEqual([['e1', { updated_by: 'me', updated_at: 'T', attribution: 'crm', leads: 3, qualified: 1, bookings: 0, won: 0 }]])
})
