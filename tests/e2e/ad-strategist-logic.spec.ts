import { expect, test } from '@playwright/test'
import {
  adRuns, adScheduleOf, adTabOf, adView, adsFollowOf, advertisers, bandOf, capIndex, capOfAd, chipClean, chipProblem, copySetOf, dayDiff, fbPage, filterAds,
  fitCrit, fitOf, forAds, industryAsk, industryFrom, industryLine, industryOf, indMapsOf, libSearch, liveOf, NO_FILTERS, pageUrl, partsSum, pickText, poolOf,
  runPrefix, sec8, seenOf, sortAds, topAds, topN, uploadsOverview, variantText, whyShort,
} from '../../src/lib/pipeline/ad-strategist'
import { competitorOf } from '../../src/lib/pipeline/intel'
import { A, CUSTOM, LIB, RUN0, RUN1, adsRows, ymd } from './ads-fixtures'

// The Ad Strategist's rules without a browser: one ad as the page shows it, live or stopped, the top ads, the fit with
// what the team follows, which brief an ad went into and why others were not, the filters and sorts, the runs, the
// industries, the uploads and the searches, on the made-up rows in tests/e2e/ads-fixtures.ts.

const NOW = Date.now()
const R = adsRows()
const rec = (n: number) => R.ad_records.find((r) => r.id === A(n))! as Record<string, unknown>
const pool = poolOf(R.ad_records as Record<string, unknown>[], NOW)
const by = (n: number) => pool.find((a) => a.id === A(n))!
const cap = capIndex(
  R.agent_outputs.filter((o) => o.output_type === 'creative_brief') as Record<string, unknown>[],
  R.creative_briefs as Record<string, unknown>[],
)
const caps = Object.fromEntries(pool.map((a) => [a.id, capOfAd(a, cap)]))
const day = (iso: string) => iso.slice(0, 10)

test('the tab an address word asks for, the old words too', () => {
  expect(adTabOf(null)).toBe('top')
  expect(adTabOf('all')).toBe('all')
  expect(adTabOf('winners')).toBe('all')
  expect(adTabOf('swipe')).toBe('uploads')
  expect(adTabOf('copy')).toBe('uploads')
  expect(adTabOf('brief')).toBe('takeaways')
  expect(adTabOf('follow')).toBe('following')
  expect(adTabOf('nope')).toBe('top')
})

test('live, stopped or last seen: by the latest pull of the advertiser', () => {
  expect(dayDiff('2026-11-01', '2026-11-03')).toBe(2)
  expect(dayDiff('2026-11-01T23:00:00Z', '2026-11-02T01:00:00Z')).toBe(1)
  const seen = seenOf(R.ad_records as Record<string, unknown>[])
  // uploads and the swipe file are not pulls
  expect(seen['old mill advisors']).toBeUndefined()
  expect(seen['example ridge advisors']).toBe(ymd(3))
  expect(liveOf(rec(1), seen, NOW).live).toBe('live')
  // a later pull of Example Ridge did not see it
  expect(liveOf(rec(3), seen, NOW)).toEqual({ live: 'stopped', last: ymd(20) })
  // nothing has checked Harbor since
  expect(liveOf(rec(6), seen, NOW)).toEqual({ live: 'unknown', last: ymd(15) })
  expect(by(1).live).toBe('live')
  expect(by(3).live).toBe('stopped')
  expect(by(6).live).toBe('unknown')
  expect(by(7).live).toBe('upload')
  expect(by(9).live).toBe('upload')
})

test('one ad: where it came from, its score and parts, its picture and what it shows', () => {
  const a1 = by(1)
  expect(a1).toMatchObject({ adv: 'Northwind Advisors', lib: true, up: false, sw: false, score: 82, days: 84, reps: 2, inBrief: true, dyn: false, price: 0 })
  expect(a1.parts).toEqual({ run: 1, live: 1, rep: 1, reach: 1 })
  expect(partsSum(a1.parts!)).toBe(100)
  expect(a1.patterns).toEqual(['Proof first: opens with a client result', 'Scarcity: limited spots'])
  expect(by(2).reps).toBe(2)
  // a catalog ad is named by its advertiser
  expect(by(5)).toMatchObject({ dyn: true, title: 'Dynamic catalog ad · Example Retail' })
  // not scored and run time unknown say nothing, not zero
  expect(by(6)).toMatchObject({ score: null, days: null, inBrief: false })
  // last seen about two weeks ago: part of the still-running points, none for run time, repeats or reach
  expect(by(6).parts).toMatchObject({ run: 0, rep: 0, reach: 0 })
  expect(by(6).parts!.live).toBeGreaterThan(0.8)
  expect(by(6).parts!.live).toBeLessThan(0.9)
  // an upload: no score, its takeaways and what its image does
  expect(by(7)).toMatchObject({ up: true, lib: false, parts: null, score: null, pend: false, uploadedBy: 'qa.teammate@aiparagonconsulting.com' })
  expect(by(7).takeaways).toEqual(['Opens with the time it saves', 'Shows the checklist on the image'])
  expect(by(7).visualHook).toBe('A stack of paper shrinking')
  expect(by(7).textOnImage).toBe('One afternoon')
  expect(by(8)).toMatchObject({ pend: true, pastedCopy: 'Advisors: get your week back.', img: 'https://cdn.example.com/upload-8.png', title: 'Untitled ad' })
  // the swipe file's own picture names are not pictures
  expect(by(9)).toMatchObject({ sw: true, img: '' })
  // no price stored is not free
  expect(by(4).price).toBeNull()
  expect(bandOf(70)).toBe('high')
  expect(bandOf(45)).toBe('medium')
  expect(bandOf(44)).toBe('low')
  expect(bandOf(null)).toBe('')
})

test('the top ads: scored Ad Library ads, at most two per advertiser, catalog ads only when real ones run out', () => {
  expect(topN(null, 6)).toBe(6)
  expect(topN(8, 6)).toBe(8)
  expect(topN(null, 1)).toBe(3)
  expect(topN(null, 'x')).toBe(5)
  expect(topAds(pool, 6).map((a) => a.id)).toEqual([A(1), A(4), A(2), A(5), A(3)])
  // enough real ones: the catalog ad stays out
  expect(topAds(pool, 3).map((a) => a.id)).toEqual([A(1), A(4), A(2)])
  // two per advertiser first, then the rest
  const many = [1, 2, 3].map((n) => ({ ...by(1), id: 'x' + n, title: 'Ad ' + n, score: 90 - n }))
  expect(topAds([...many, by(4)], 4).map((a) => a.id)).toEqual(['x1', 'x2', A(4), 'x3'])
})

test('the fit with what the team follows: accounts, an industry, keywords and the market', () => {
  const follows = R.competitors.map((r) => competitorOf(r as Record<string, unknown>))
  const C = fitCrit(R.ai_settings.find((r) => r.key === 'ads_follow')!.value, follows, { targetMarket: 'Independent advisors', industry: 'AI consulting for wealth management firms' })
  // posts-only and stopped accounts are not read for ads
  expect(C.accts).toEqual(['Northwind Advisors', 'Example Ridge Advisors', 'Fabrikam Insights'])
  expect(C.kw).toEqual(['AI automation', 'client onboarding'])
  expect(fitOf(by(1), C)).toEqual({ score: 30, hits: ['an account you follow'] })
  expect(fitOf(by(7), C)).toEqual({ score: 0, hits: [] })
  const ridge = { ...by(4), industry: 'Wealth management' }
  expect(fitOf(ridge, C)).toEqual({ score: 61, hits: ['an account you follow', 'the Wealth management industry', 'your market (advisor)'] })
  const words = { ...by(7), words: 'Client onboarding for independent advisors with AI automation' }
  expect(fitOf(words, C)).toEqual({ score: 40, hits: ['“AI automation”', '“client onboarding”', 'your market (independent, advisor)'] })
  // nothing followed: no fit at all
  expect(fitOf(by(1), fitCrit({}, [], { targetMarket: '', industry: '' }))).toBeNull()
  // capped at 100
  const all = fitCrit({ keywords: ['proof', 'client result', 'scarcity spots'], industries: ['Financial advice'] }, follows, { targetMarket: 'proof client', industry: '' })
  expect(fitOf({ ...by(1), industry: 'Financial advice' }, all)!.score).toBe(100)
})

test('which brief an ad went into, and why the others were not picked', () => {
  const s = sec8(R.agent_outputs[0].content_md as string)!
  expect(s.rule).toBe('3 curated · 2 advertisers · best of each advertiser first, running before stopped')
  expect(s.ads.map((x) => [x.n, x.adv, x.url])).toEqual([
    [1, 'Northwind Advisors', LIB(1)],
    [2, 'Example Ridge Advisors', LIB(4)],
    [3, 'Northwind Advisors', LIB(2)],
  ])
  expect(sec8('# no list')).toBeNull()
  expect(cap.runs[RUN1]).toMatchObject({ n: 3, listed: true, custom: false, advs: { 'northwind advisors': 2, 'example ridge advisors': 1 } })
  expect(cap.runs[CUSTOM]).toMatchObject({ n: 0, listed: false, custom: true })
  expect(Object.values(caps).filter((c) => c.st === 'in')).toHaveLength(5)
  expect(caps[A(1)].list.map((e) => e.B.runId)).toEqual([RUN1])
  expect(pickText(caps[A(1)].list[0], true)).toBe('proven, still running · 1st of 3 picked')
  expect(pickText(caps[A(1)].list[0], false)).toBe('proven, still running, 84 days, scored 82 for that brief · 1st of 3 picked')
  expect(pickText(caps[A(7)].list[0], false)).toBe('hand-picked by your team')
  expect(whyShort(by(1), caps[A(1)], day)).toBe('In the brief · proven, still running · 1st of 3 picked')
  expect(whyShort(by(3), caps[A(3)], day)).toBe('In the brief · stopped running · 1st of 1 picked')
  expect(whyShort(by(7), caps[A(7)], day)).toBe('In the brief · hand-picked by your team')
  expect(whyShort(by(8), caps[A(8)], day)).toBe('Uploaded by your team · not in a brief yet')
  const runDay = day(R.agent_outputs[0].created_at as string)
  expect(whyShort(by(5), caps[A(5)], day)).toBe('Not picked for the short list in the brief of ' + runDay)
  // the advertiser already had ads in the brief; an ad unseen for weeks; a run with no brief; a brief that listed nothing
  expect(whyShort({ ...by(2), id: 'x' }, capOfAd({ id: 'x', url: '', runId: RUN1 }, cap), day)).toBe(
    'Not picked · Northwind Advisors already has 2 ads in the brief of ' + runDay,
  )
  expect(whyShort({ ...by(6), stale: 60, act: false }, caps[A(6)], day)).toBe('Not picked · not seen for 60 days')
  expect(whyShort(by(6), capOfAd({ id: 'y', url: '', runId: 'agent2_none' }, cap), day)).toBe('No brief was saved for its run')
  expect(whyShort(by(6), capOfAd({ id: 'y', url: '', runId: CUSTOM }, cap), day)).toBe('Its run’s brief did not list its ads')
})

test('All ads: the filters combine, the sorts and their ties', () => {
  const f = (p: Partial<typeof NO_FILTERS>) => filterAds(pool, { ...NO_FILTERS, ...p }, caps).map((a) => a.id)
  expect(f({})).toHaveLength(9)
  expect(f({ st: 'live' })).toEqual([A(1), A(2), A(4), A(5)])
  expect(f({ st: 'up' })).toEqual([A(7), A(8), A(9)])
  expect(f({ adv: 'Northwind Advisors' })).toEqual([A(1), A(2)])
  expect(f({ run: RUN0 })).toEqual([A(3), A(9)])
  expect(f({ cap: 'in' })).toEqual([A(1), A(2), A(3), A(4), A(7)])
  expect(f({ cap: 'out' })).toEqual([A(5), A(6), A(8), A(9)])
  // the body counts too
  expect(f({ q: 'CHECKLIST' })).toEqual([A(2), A(4)])
  expect(f({ st: 'live', adv: 'Northwind Advisors', q: 'proof' })).toEqual([A(1)])
  const ind = poolOf(R.ad_records as Record<string, unknown>[], NOW, (adv) => (adv === 'Northwind Advisors' ? 'Financial advice' : ''))
  expect(filterAds(ind, { ...NO_FILTERS, ind: 'Financial advice' }, caps).map((a) => a.id)).toEqual([A(1), A(2)])
  expect(filterAds(ind, { ...NO_FILTERS, q: 'financial' }, caps).map((a) => a.id)).toEqual([A(1), A(2)])

  const s = (k: Parameters<typeof sortAds>[1], dir: 1 | -1) => sortAds(pool, k, dir, caps).map((a) => a.id)
  expect(s('score', -1).slice(0, 5)).toEqual([A(1), A(4), A(2), A(5), A(3)])
  expect(s('days', -1).slice(0, 3)).toEqual([A(9), A(1), A(4)])
  expect(s('ad', 1)[0]).toBe(A(5))
  // uploads, then stopped, then live; ties by score, then days running
  expect(s('status', 1).slice(0, 5)).toEqual([A(9), A(7), A(8), A(3), A(6)])
  expect(s('status', -1).slice(0, 4)).toEqual([A(1), A(4), A(2), A(5)])
  // in a brief first, newest brief first
  expect(s('cap', -1).slice(0, 5)).toEqual([A(1), A(4), A(2), A(7), A(3)])
})

test('the runs: one per run, briefs without a run, a run still going, and the run limits', () => {
  const runs = adRuns(R.runs.filter((r) => r.agent === 'ad_strategist') as Record<string, unknown>[], [
    { run_id: RUN1, created_at: R.creative_briefs[0].created_at },
    { run_id: CUSTOM, created_at: R.creative_briefs[1].created_at },
  ])
  expect(runs.map((r) => [r.runId, r.ok])).toEqual([
    [RUN1, true],
    [CUSTOM, true],
    [expect.stringMatching(/^agent2_/), false],
    [RUN0, true],
  ])
  expect(runs[0].stats).toEqual({ curated_ads: 3, advertisers: 2, confidence: 0.6 })
  expect(adRuns([{ run_id: 'r', status: 'running', started_at: '2026-11-01T00:00:00Z' }], [])[0]).toMatchObject({ running: true, ok: false })
  expect(adScheduleOf({ ads: { top: 6, behind: 24, per_advertiser: 4, after_intel: false } })).toEqual({ top: 6, behind: 24, per: 4, afterIntel: false })
  expect(adScheduleOf(null)).toEqual({ top: 5, behind: 30, per: 5, afterIntel: true })
  expect(adScheduleOf(JSON.stringify({ ads: { top: 40 } })).top).toBe(10)
  expect(runPrefix('upload_2026-11-01')).toBe('Uploads · ')
  expect(runPrefix(CUSTOM)).toBe('From uploads · ')
  expect(runPrefix(RUN1)).toBe('')
})

test('industries: the team’s first, the agent’s next, the banner’s words and what the agent is sent', () => {
  const M = indMapsOf({ 'northwind advisors': 'Financial advice', 'old mill advisors': ' ' }, JSON.stringify({ 'northwind advisors': 'Banking', 'example ridge advisors': 'Wealth management' }))
  expect(industryOf(M, ' Northwind Advisors ')).toBe('Financial advice')
  expect(industryFrom(M, 'Northwind Advisors')).toBe('you')
  expect(industryOf(M, 'Example Ridge Advisors')).toBe('Wealth management')
  expect(industryFrom(M, 'Example Ridge Advisors')).toBe('agent')
  // a blank one counts as none
  expect(industryOf(M, 'Old Mill Advisors')).toBe('')
  expect(industryFrom(M, 'Old Mill Advisors')).toBe('')
  expect(advertisers([...pool, { ...by(1), adv: 'Unknown advertiser' }])).toEqual([
    'Northwind Advisors',
    'Example Ridge Advisors',
    'Example Retail',
    'Harbor Example Group',
    'Old Mill Advisors',
    'Contoso Planning',
  ])
  expect(industryLine(6, 0)).toBe('')
  expect(industryLine(6, 1)).toBe('1 of 6 advertisers has no industry yet.')
  expect(industryLine(6, 3)).toBe('3 of 6 advertisers have no industry yet.')
  expect(industryLine(6, 6)).toBe('None of the 6 advertisers has an industry yet.')
  expect(industryLine(1, 1)).toBe('The advertiser has no industry yet.')
  expect(industryAsk(pool, ['Northwind Advisors', 'Example Retail'])).toEqual([
    { name: 'Northwind Advisors', site: 'northwind.example.com', ads: ['Your clients want proof, not promises · Free readiness review', 'Onboard clients in days, not weeks · Onboarding audit'] },
    // a catalog ad's template words never go out
    { name: 'Example Retail', site: '', ads: [] },
  ])
  expect(industryAsk(pool, Array.from({ length: 40 }, (_, i) => 'Adv ' + i))).toHaveLength(30)
})

test('the uploads overview and the ad copy written from them', () => {
  const O = uploadsOverview(pool, (a) => (a.id === A(7) ? 40 : a.id === A(9) ? 20 : null))
  expect(O).toEqual({
    total: 3,
    inNext: 3,
    avgFit: 30,
    patterns: [
      { label: 'Time saving', n: 1 },
      { label: 'Proof first', n: 1 },
    ],
    takeaways: [{ id: A(7), text: 'Opens with the time it saves' }],
    offers: ['Paperwork review', 'Planning session'],
  })
  const set = copySetOf(R.agent_outputs.find((o) => o.agent === 'ad_copywriter') as Record<string, unknown>)
  expect(set).toMatchObject({ title: 'Ad copy from Old Mill', platform: 'Facebook', sources: 1, takeaways: ['Lead with the time saved'] })
  expect(set.variants).toHaveLength(2)
  expect(variantText(set.variants[0])).toBe('Get your Fridays back\n\nWe sort the paperwork so you can see clients.\n\nHeadline: Paperwork, sorted\n\nCTA: Book a call')
  expect(copySetOf({ id: 'z', data: { variants: [{ angle: 'x' }] } }).variants).toEqual([])
})

test('Following: the searches as saved, a chip’s problems, a Facebook page from what was pasted', () => {
  expect(adsFollowOf(R.ai_settings.find((r) => r.key === 'ads_follow')!.value)).toEqual({
    keywords: ['AI automation', 'client onboarding'],
    industries: ['Wealth management'],
    types: ['image'],
    active: 'active',
    country: 'US',
    saved: true,
  })
  expect(adsFollowOf(null)).toEqual({ keywords: [], industries: [], types: [], active: 'all', country: 'US', saved: false })
  // types keep their order, unknown ones and countries are dropped
  expect(adsFollowOf({ types: ['text', 'gif', 'image'], country: 'FR' })).toMatchObject({ types: ['image', 'text'], country: 'US' })
  expect(chipClean('  "AI   \\ automation"  ')).toBe('AI automation')
  expect(chipProblem(['AI automation'], 'ai automation', 10)).toBe('“ai automation” is on the list already.')
  expect(chipProblem(['a', 'b'], 'cc', 2)).toBe('That is 2 already. Remove one first.')
  expect(chipProblem([], 'x', 2)).toBe('Type at least two letters.')
  expect(chipProblem([], 'xy', 2)).toBe('')
  expect(fbPage('https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=1234567')).toBe('1234567')
  expect(fbPage('https://facebook.com/profile.php?id=987')).toBe('987')
  expect(fbPage('https://m.facebook.com/northwind.advisors/')).toBe('northwind.advisors')
  expect(fbPage('facebook.com/pg/example-page')).toBe('example-page')
  expect(fbPage('facebook.com/groups/abc')).toBe('')
  expect(fbPage('fb.com/x')).toBe('')
  expect(fbPage('northwind.advisors')).toBe('northwind.advisors')
  expect(fbPage('two words')).toBe('')
  expect(fbPage('')).toBe('')
  expect(libSearch('Old Mill')).toBe(
    'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=Old%20Mill&search_type=keyword_unordered',
  )
  expect(pageUrl('northwind.advisors')).toBe('https://www.facebook.com/northwind.advisors')
  const follows = R.competitors.map((r) => competitorOf(r as Record<string, unknown>))
  expect(follows.filter((c) => c.status !== 'denied' && forAds(c)).map((c) => c.name)).toEqual(['Northwind Advisors', 'Example Ridge Advisors'])
})

test('a score set by hand reads as set, and an ad view without words', () => {
  const v = adView({ ...rec(4), performance_score: 0.9, score_overridden: true }, 1, {}, NOW)
  expect(v).toMatchObject({ score: 90, overridden: true })
  expect(adView({ id: 'z' }, 1, {}, NOW)).toMatchObject({ adv: 'Unknown advertiser', title: 'Untitled ad', live: 'stopped', score: null })
})
