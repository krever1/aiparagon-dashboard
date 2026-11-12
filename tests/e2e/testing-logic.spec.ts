import { expect, test } from '@playwright/test'
import {
  type Result, ago, clip, dayText, eng, int, isRanked, lpPageOf, lpRows, money, noDash, num, pct, per, pickOf, postsByEngagement, rank, resultFrom, resultOf, roas, say,
  spendOf, split, srcLine, stats, syncLine, times, whatLine, workLine, working,
} from '../../src/lib/pipeline/ad-testing'
import { R, testingRows } from './testing-fixtures'

// The Ad Testing rules without a browser: the numbers as the page writes them, how results came in, what is working,
// the leaderboard, the landing pages' sign-ups with the spend matched by code, the log form's checks and the sync line.

const rows = testingRows()
const all = rows.content_results.map((r) => resultOf(r as Record<string, unknown>))
const byId = (id: string) => all.find((r) => r.id === id) as Result

test('numbers as the page writes them', () => {
  expect(num('$1,250.50')).toBe(1250.5)
  expect(num('')).toBeNull()
  expect(num('abc')).toBeNull()
  expect(int(1234.4)).toBe('1,234')
  expect(int(null)).toBe('–')
  expect(money(1619)).toBe('$1,619')
  expect(money(12.5)).toBe('$12.50')
  expect(money(null)).toBe('–')
  expect(pct(240, 12000)).toBe('2%')
  expect(pct(5, 0)).toBe('–')
  expect(per(300, 10)).toBe('$30')
  expect(per(300, 0)).toBe('–')
  expect(times(15)).toBe('15x')
  expect(times(2.46)).toBe('2.5x')
  expect(times(null)).toBe('–')
  expect(eng(byId(R.p1))).toBe(160)
  expect(eng(byId(R.p3))).toBeNull()
  expect(roas(byId(R.r1))).toBe(15)
  expect(roas(byId(R.synced))).toBeNull()
  expect(dayText('2026-11-03')).toBe('3 Nov')
  expect(dayText('2026-11-03', true)).toBe('3 Nov 2026')
  expect(dayText('2026-11-03T23:30:00Z', true, 'UTC')).toBe('3 Nov 2026')
  expect(dayText('2026-11-03T23:30:00Z', false, 'Asia/Tokyo')).toBe('4 Nov')
  expect(noDash('A field note — draft')).toBe('A field note · draft')
  expect(clip('one two three', 8)).toBe('one two…')
})

test('a row as the page uses it, and how the results came in', () => {
  const s = byId(R.synced)
  expect(s).toMatchObject({ kind: 'ad', attribution: 'api', spend: 120, leads: 2, revenue: null, periodStart: rows.content_results[1].period_start })
  expect(srcLine(all)).toBe('5 entered by hand · 1 imported from a file · 1 synced from the ad platforms')
  expect(srcLine([])).toBe('')
  expect(whatLine(s, 'UTC')).toBe(dayText(s.periodStart, true) + ' · Meta ads · synced from Meta')
  expect(whatLine(byId(R.r4), 'UTC')).toBe(dayText(byId(R.r4).postedOn, true) + ' · LinkedIn ads · imported')
  expect(whatLine(resultOf({ title: 'x', attribution: 'crm', created_at: '2026-01-02T10:00:00Z' }), 'UTC')).toBe('2 Jan 2026 · from a CRM export')
  expect(whatLine(resultOf({ title: 'x', attribution: 'api', platform: 'Something' }), 'UTC')).toBe('Something · synced from the ad platform')
  const T = split(all)
  expect(T.ads.map((r) => r.id)).toEqual([R.r1, R.synced, R.r3, R.r4])
  expect(T.posts).toHaveLength(3)
})

test('the six numbers under the heading', () => {
  expect(stats(all).map((s) => s.n + ' ' + s.label)).toEqual(['3 posts logged', '4 ads logged', '$1,619 ad spend', '16 leads', '1 client won', '$4,500 revenue'])
  expect(stats([]).map((s) => s.n + ' ' + s.label)).toEqual(['0 posts logged', '0 ads logged', '$0 ad spend', '0 leads', '0 clients won', '$0 revenue'])
})

test('what is working and what is not: by cost per lead against the middle, or by return', () => {
  const W = working(split(all).ads)!
  expect(W.good.map((x) => x.r.id)).toEqual([R.r1, R.r4])
  expect(W.bad.map((x) => x.r.id)).toEqual([R.r3])
  expect(workLine(W.good[0])).toBe('Meta ads · $300 spent · 10 leads at $30 each')
  expect(workLine(W.bad[0])).toBe('Meta ads · $999 spent · no leads yet')
  // one ad with spend says nothing
  expect(working([byId(R.r1)])).toBeNull()
})

test('the leaderboard: return, then what a client, a call, a qualified lead and a lead cost', () => {
  const ads = rank(split(all).ads)
  expect(ads.map((r) => r.id)).toEqual([R.r1, R.r4, R.synced, R.r3])
  expect(ads.map(isRanked)).toEqual([true, true, true, false])
  expect(say(ads[0])).toBe('15x return on $300')
  expect(say(ads[1])).toBe('$50 per lead')
  const booked = rank([resultOf({ id: 'b', kind: 'ad', title: 'b', spend: 100, bookings: 4, leads: 8 })])[0]
  expect(say(booked)).toBe('$25 per booked call')
  expect(postsByEngagement(split(all).posts).map((r) => r.id)).toEqual([R.p1, R.p2])
})

test('spend matched by the code in the ad’s name: the synced numbers when there are any, the last 30 days only', () => {
  const ads = split(all).ads
  const since = Date.now() - 30 * 864e5
  // the synced ad and one logged by hand both name PK7Q2-A1: only the synced one counts
  expect(spendOf('PK7Q2-A1', ads, since)).toBe(120)
  expect(spendOf('PK7Q2-A1', ads.filter((r) => r.attribution !== 'api'), since)).toBe(999)
  // a longer code is another ad; case does not matter
  expect(spendOf('PK7Q2-A1', [resultOf({ kind: 'ad', title: 'pk7q2-a10 test', spend: 5, created_at: new Date().toISOString() })], since)).toBe(0)
  expect(spendOf('PK7Q2-A1', [resultOf({ kind: 'ad', title: 'Ad (pk7q2-a1)', spend: 5, created_at: new Date().toISOString() })], since)).toBe(5)
  expect(spendOf('PK7Q2-A1', [resultOf({ kind: 'ad', title: 'PK7Q2-A1 old', spend: 5, period_end: '2020-01-01' })], since)).toBe(0)
  const pages = rows.landing_pages.filter((p) => p.published_at).map((p) => lpPageOf(p as Record<string, unknown>))
  const su = rows.lp_signups.map((s) => ({ pageId: s.page_id, code: s.ad_code, createdAt: s.created_at }))
  const views = rows.lp_views.map((v) => ({ pageId: v.page_id, code: v.ad_code, views: v.views }))
  expect(lpRows(pages, su, views, ads, Date.now())).toEqual([
    { page: 'Onboarding audit', code: 'PK7Q2-A1', hook: 'Stop losing a week to paperwork', visits: 30, signups: 2, spend: 120 },
    { page: 'Onboarding audit', code: 'PK7Q2-A2', hook: 'Your first workflow, automated', visits: 0, signups: 0, spend: 0 },
    { page: 'Onboarding audit', code: '', hook: 'Visits without an ad code', visits: 10, signups: 1, spend: 0 },
  ])
})

test('the log form’s checks, in order, and the row it saves', () => {
  const today = '2026-11-12'
  const base = { kind: 'ad' as const, title: 'An ad', platform: 'Meta ads', url: '', postedOn: '', notes: '', nums: { leads: '3' } }
  expect(resultFrom({ ...base, title: '  ' }, today)).toEqual({ error: 'Add a title: the hook, the headline or a short name.' })
  expect(resultFrom({ ...base, url: 'linkedin.com/x' }, today)).toEqual({
    error: 'That link does not look right. Use the full address, like https://www.linkedin.com/posts/…',
  })
  expect(resultFrom({ ...base, nums: { spend: '-5' } }, today)).toEqual({ error: 'Use a number of zero or more for spend.' })
  expect(resultFrom({ ...base, nums: { bookings: '1.5' } }, today)).toEqual({ error: 'Use a whole number for booked calls.' })
  expect(resultFrom({ ...base, nums: {} }, today)).toEqual({ error: 'Add at least one number from the platform, such as impressions or clicks.' })
  expect(resultFrom({ ...base, nums: { leads: '3', qualified: '4' } }, today)).toEqual({ error: 'Qualified leads cannot be more than leads.' })
  expect(resultFrom({ ...base, nums: { leads: '3', won: '4' } }, today)).toEqual({ error: 'Clients won cannot be more than leads.' })
  expect(resultFrom({ ...base, postedOn: '2026-11-13' }, today)).toEqual({ error: 'The posted date is in the future.' })
  const ok = resultFrom({ ...base, url: 'https://example.org/ad', nums: { spend: '$1,250.555', leads: '3', revenue: '4500', reactions: '7' }, variantFile: 'a.png' }, today)
  expect(ok).toEqual({
    row: expect.objectContaining({ kind: 'ad', title: 'An ad', spend: 1250.56, leads: 3, revenue: 4500, reactions: null, url: 'https://example.org/ad', variant_file: 'a.png' }),
  })
  // a post keeps only a post's numbers, and no ad image
  const post = resultFrom({ ...base, kind: 'post', nums: { reactions: '7', spend: '9' }, variantFile: 'a.png' }, today)
  expect(post).toEqual({ row: expect.objectContaining({ kind: 'post', reactions: 7, spend: null, variant_file: null }) })
  expect(pickOf(byId(R.r1))).toBe('c:lt-run-1')
  expect(pickOf(resultOf({ content_piece_id: 'cp-1' }))).toBe('l:cp-1')
  expect(pickOf(resultOf({ source_output_id: 'dr-1' }))).toBe('d:dr-1')
})

test('the line about the daily numbers from Meta and LinkedIn', () => {
  const now = Date.now()
  expect(syncLine({ st: 'missing', meta: {}, linkedin: {}, msg: '' }, now).text).toBe(
    'Daily numbers from Meta and LinkedIn: the sync workflow is not switched on in n8n yet.',
  )
  expect(syncLine({ st: 'ok', meta: {}, linkedin: {}, msg: '' }, now)).toEqual({
    text: 'Connect Meta and LinkedIn on Integrations and the numbers come in every morning.',
    connected: false,
  })
  expect(syncLine({ st: 'ok', meta: { connected: true }, linkedin: { connected: true }, msg: '' }, now)).toEqual({
    text: 'Synced every morning from Meta (Facebook and Instagram) and LinkedIn. First sync tomorrow morning.',
    connected: true,
  })
  expect(syncLine({ st: 'ok', meta: { connected: true, last_sync: new Date(now - 3 * 36e5).toISOString() }, linkedin: {}, msg: '' }, now).text).toBe(
    'Synced every morning from Meta (Facebook and Instagram). Last sync 3 hours ago.',
  )
  expect(syncLine({ st: 'err', meta: {}, linkedin: {}, msg: 'Timed out.' }, now).text).toBe('Could not check the daily numbers from Meta and LinkedIn: Timed out.')
  expect(ago(new Date(now - 30 * 60e3).toISOString(), now)).toBe('30 minutes ago')
  expect(ago(new Date(now - 30 * 36e5).toISOString(), now)).toBe('yesterday')
})
