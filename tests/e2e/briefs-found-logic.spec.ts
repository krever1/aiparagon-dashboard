import { expect, test } from '@playwright/test'
import {
  type AdIn, type AdsIn, type Finding, type OrgIn, PICKED_LEAD, adInOf, adPool, catCount, catOfFormat, findingsFor, hashId, ideaFromPicks, insightsOf,
  laterNote, near, orgPool, pickOf, picksFrom, savedIds, topicsFrom, waitNote,
} from '../../src/lib/pipeline/briefs-found'
import { type Ctx, blankForm, buildRequest, offerOf, personaOf, tplOf } from '../../src/lib/pipeline/content-new'
import { formRows } from './content-fixtures'

// What the briefs found, without a browser: the organic and ads pools (what is read, skipped, tidied, kept once, and the
// category of the posts behind each), the findings for each kind and category, and what rides in the request. Made up.

type Row = Record<string, unknown>
const P = (n: number) => 'https://example.com/p/' + n
const items = [
  { url: P(1), competitor: 'Dana Reyes', headline: 'A founder on fee talk', summary: 'Names the fee.', working: 'Name the fee in the first line', format: 'Opinion post', engagement_total: 120 },
  { url: P(2), competitor: 'Lee Park', headline: 'A firm shows its client numbers', summary: 'One number.', working: 'Lead with one client number', format: 'Case study', engagement_total: 300 },
  { url: P(3), competitor: 'Sam Ortiz', headline: 'Hiring', summary: '', working: 'Off-topic: a hiring post', format: 'Job post', engagement_total: 900 },
  { url: P(4), competitor: 'Kim Lo', headline: 'A webinar recap', summary: '', working: 'Recap the questions people asked', format: 'webinar recap', engagement_total: 50 },
]
const md =
  '# Brief\n\n## TL;DR\n- **Fee talk is up:** Advisors post about fees.\n\n## 3. What changed\n**Shift:** Fees move to the first line\n- **Evidence:** [Dana Reyes](' +
  P(1) +
  '): named the fee\n- **For our content:** Say the price early\n\n## 4. Notable developments\n### Product news\n**A new fee tool** · [Acme](https://example.com/n/1): launched\n'
const snap = {
  items: [
    { text: 'Fee talk is up', why: 'Advisors talk about the fee more than last month', tag: '' },
    { text: 'Client numbers win replies — every time', why: 'A post with one client number gets twice the replies', tag: '' },
  ],
}
const org = (o: Partial<OrgIn> = {}): OrgIn => ({ run: 'r1', date: '2026-11-10T12:00:00Z', ok: true, md, data: { items }, snapshot: snap, ...o })

test('the organic pool: five things, shifts, developments and posts, each with the category of the posts behind it', () => {
  const L = orgPool([org()], [])
  const by = (src: string) => L.filter((x) => x.src === src)
  expect(by('Five things').map((x) => [x.text, x.c])).toEqual([
    ['Fee talk is up', 'opinion'],
    // dashes become commas (e9Clean)
    ['Client numbers win replies, every time', 'case_studies'],
  ])
  expect(by('What changed').map((x) => [x.text, x.why, x.url, x.who, x.c])).toEqual([['Fees move to the first line', 'Say the price early', P(1), 'Dana Reyes', 'opinion']])
  expect(by('Development').map((x) => [x.text, x.c])).toEqual([['A new fee tool', 'news']])
  // the off-topic post is left out; a free-text format still has a category
  expect(by('Post').map((x) => [x.text, x.c, x.eng])).toEqual([
    ['Name the fee in the first line', 'opinion', 120],
    ['Lead with one client number', 'case_studies', 300],
    ['Recap the questions people asked', 'events', 50],
  ])
  expect(L.every((x) => x.brief?.run === 'r1' && /^i[0-9a-z]+$/.test(x.id))).toBe(true)
  // the same finding keeps its id
  expect(orgPool([org()], [])[0].id).toBe(L[0].id)
  expect(hashId('org|r1|Five things|Fee talk is up')).toBe(L[0].id)
})

test('the organic pool skips what the review hid or the layout switched off, and the posts the review removed; six briefs, near copies once', () => {
  const hid = orgPool([org({ data: { items, review: { hidden: ['five'], removed: [P(1)] } } })], ['dev'])
  expect(hid.some((x) => x.src === 'Five things' || x.src === 'Development')).toBe(false)
  expect(hid.filter((x) => x.src === 'Post').map((x) => x.url)).toEqual([P(2), P(4)])
  expect(orgPool([org()], ['shift']).some((x) => x.src === 'What changed')).toBe(false)
  // a second brief saying the same keeps the first's
  const two = orgPool([org(), org({ run: 'r2', date: '2026-11-01T12:00:00Z' })], [])
  expect(two.filter((x) => x.text === 'Fee talk is up')).toHaveLength(1)
  const seven = Array.from({ length: 7 }, (_, i) => org({ run: 'r' + i, md: '', data: {}, snapshot: { items: [{ text: ['Pricing pages', 'Webinar replays', 'Hiring plans', 'Client stories', 'Tax season', 'Onboarding speed', 'Referral asks'][i], why: '' }] } }))
  expect(new Set(orgPool(seven, []).map((x) => x.brief?.run)).size).toBe(6)
  expect(near('Fee talk is up', 'Fee talk is up again')).toBe(true)
  expect(near('Fee talk is up', 'Client numbers win')).toBe(false)
  expect(catOfFormat('Podcast')).toBe('audio_video')
  expect(catOfFormat('client success story')).toBe('case_studies')
  expect(catOfFormat('We are hiring')).toBe('')
})

const adsIn = (o: Partial<AdsIn> = {}): AdsIn => ({
  row: {
    run_id: 'a1',
    created_at: '2026-11-11T12:00:00Z',
    winning_hooks: JSON.stringify(['Your week back', { pattern: 'Stop losing Mondays' }]),
    winning_offers: [{ type: 'Onboarding audit', price_point: '497.0', notes: 'Booked from the ad' }, { type: 'Free checklist', price_point: 0 }],
    core_pain_points: ['Slow onboarding'],
    objection_themes: ['Too busy to switch'],
    differentiation_angle: 'One owner for every step — of the intake',
  },
  ok: false,
  snapshot: null,
  hidden: [],
  ...o,
})
const ad = (o: Partial<AdIn> = {}): AdIn => ({ id: '00000000-0000-4000-8000-0000000000b1', run: 'a1', adv: 'Northwind', hook: 'Get your Mondays back', title: 'Get your Mondays back', cta: 'Book a call', fmt: 'static_image', score: 82, days: 40, ...o })

test('the ads pool: five things (the hooks and a pain without a snapshot), hooks, offers, pains, objections, the angle, then the ads', () => {
  const L = adPool([adsIn()], [ad(), ad({ id: 'x2', hook: '', title: 'Fast intake', days: 1 }), ad({ id: 'x3', hook: 'Get your Mondays back now', fmt: 'video' })], [])
  expect(L.map((x) => [x.src, x.text])).toEqual([
    ['Five things', 'Your week back'],
    ['Five things', 'Stop losing Mondays'],
    ['Five things', 'Slow onboarding'],
    ['Hook pattern', 'Your week back'],
    ['Hook pattern', 'Stop losing Mondays'],
    ['Offer', 'Onboarding audit at $497'],
    ['Offer', 'Free checklist'],
    ['Pain', 'Slow onboarding'],
    ['Objection', 'Too busy to switch'],
    ['Angle', 'One owner for every step, of the intake'],
    ['Ad', 'Get your Mondays back'],
    ['Ad', 'Fast intake'],
  ])
  const a = L.find((x) => x.src === 'Ad')!
  expect([a.why, a.adId, a.who, a.brief]).toEqual(['Northwind · 40 days running · Book a call', '00000000-0000-4000-8000-0000000000b1', 'Northwind', null])
  expect(L.find((x) => x.text === 'Fast intake')!.why).toBe('Northwind · 1 day running · Book a call')
  // the review's hidden sections and the layout's switched-off ones are skipped; hooks always come
  const off = adPool([adsIn({ hidden: ['five', 'pain'] })], [], ['offer', 'short'])
  expect([...new Set(off.map((x) => x.src))]).toEqual(['Hook pattern'])
  // a catalog ad made only of template words is left out
  expect(adInOf({ id: 'c', hook: '{{product.name}}', format: 'static_image', performance_score: 0.99 })).toBeNull()
  expect(adInOf({ id: 'd', hook: '', body: 'Body only', format: 'video', performance_score: '0.7', days_running: 3, advertiser_name: '' })).toMatchObject({
    title: 'Body only',
    score: 70,
    days: 3,
    adv: 'Unknown advertiser',
  })
})

test('the findings for a kind and category: ads of the type first by score, then the brief by weight; organic by category, posts by engagement', () => {
  const ads = adPool(
    [adsIn(), adsIn({ row: { ...adsIn().row, run_id: 'a0', created_at: '2026-11-01T12:00:00Z', winning_hooks: ['Older hook pattern here'], winning_offers: [] }, snapshot: { items: [] } })],
    [ad({ id: 'x1', hook: 'Low score ad', score: 10 }), ad(), ad({ id: 'x2', hook: 'Same score longer', score: 82, days: 90 }), ad({ id: 'x3', hook: 'A text ad', fmt: 'text' })],
    [],
  )
  const img = findingsFor(true, 'ad_image', [], ads)
  expect(img.filter((x) => x.src === 'Ad').map((x) => x.text)).toEqual(['Same score longer', 'Get your Mondays back', 'Low score ad'])
  // the brief: weight, then the newest brief first
  expect(img.filter((x) => x.src !== 'Ad').slice(0, 3).map((x) => [x.src, x.brief?.run])).toEqual([
    ['Five things', 'a1'],
    ['Five things', 'a1'],
    ['Five things', 'a1'],
  ])
  expect(img.findIndex((x) => x.text === 'Older hook pattern here')).toBeGreaterThan(img.findIndex((x) => x.text === 'Stop losing Mondays'))
  expect(findingsFor(true, 'ad_text', [], ads).filter((x) => x.src === 'Ad').map((x) => x.text)).toEqual(['A text ad'])
  expect(findingsFor(true, 'ad_carousel', [], ads).some((x) => x.src === 'Ad')).toBe(false)

  const O = orgPool([org()], [])
  expect(findingsFor(false, 'opinion', O, []).map((x) => x.text)).toEqual(['Fee talk is up', 'Fees move to the first line', 'Name the fee in the first line'])
  // no category (Email): the findings, not the posts
  expect(findingsFor(false, '', O, []).map((x) => x.src)).toEqual(['Five things', 'Five things', 'What changed', 'Development'])
  const many = orgPool([org({ data: { items: [...items, { ...items[0], url: P(9), working: 'Put the price in the hook line', engagement_total: 999 }] } })], [])
  expect(findingsFor(false, 'opinion', many, []).filter((x) => x.src === 'Post').map((x) => x.eng)).toEqual([999, 120])
  expect(catCount(O, 'opinion', {})).toBe(3)
  expect(catCount(O, 'opinion', { [O[0].id]: 1 })).toBe(2)
})

test('the notes, kept for later, and what rides in the request', () => {
  const day = (iso: string) => iso.slice(5, 10)
  const O = orgPool([org({ ok: false }), org({ run: 'r2', date: '2026-11-02T12:00:00Z', ok: false, snapshot: { items: [{ text: 'A different point entirely here', why: '' }] } })], [])
  expect(waitNote(O, day)).toBe('The briefs of 11-10 and 11-02 are not approved yet. Its findings can still be used.')
  expect(waitNote(O.slice(0, 1), day)).toBe('The brief of 11-10 is not approved yet. Its findings can still be used.')
  const x = O[0]
  expect(laterNote(x, 'Opinion and frameworks', day)).toEqual({
    note: 'Fee talk is up\nAdvisors talk about the fee more than last month\nFrom the organic brief of 11-10.',
    tags: ['From the briefs', 'Opinion and frameworks', 'insight:' + x.id],
  })
  expect(savedIds([{ tags: ['From the briefs', 'insight:' + x.id] }, { tags: ['ops'] }])).toEqual({ [x.id]: true })

  // the picks the browser sends are checked
  const raw = [pickOf(x), { text: 'x'.repeat(500), src: 'Ad', url: 'javascript:alert(1)', adId: 'nope', id: 'drop table' }, { text: 'No kind', src: 'Gossip' }]
  const P2 = picksFrom(raw)
  expect(P2).toHaveLength(2)
  expect(P2[1]).toMatchObject({ src: 'Ad', url: null, adId: null })
  expect(P2[1].text).toHaveLength(300)
  expect(picksFrom(Array(20).fill(pickOf(x)))).toHaveLength(12)
  expect(insightsOf([pickOf(x)])).toEqual([{ text: 'Fee talk is up', why: x.why, from: 'Five things', brief: 'r1', url: P(1), ad_id: null }])
  expect(topicsFrom([], O)).toBe('Fee talk is up; Client numbers win replies, every time; Fees move to the first line')
  expect(topicsFrom([pickOf(O[1])], O)).toBe(O[1].text)
  expect(ideaFromPicks([pickOf(x)])).toBe(PICKED_LEAD + '\n- Fee talk is up. Advisors talk about the fee more than last month')
})

test('a request with picks: the rule frames a piece made from material; an idea gets them after it, or is written from them', () => {
  const R = formRows()
  const ctx: Ctx = {
    email: 'qa.teammate@aiparagonconsulting.com',
    personas: R.client_personas.filter((p) => !p.archived).map(personaOf),
    offers: R.offers.map(offerOf),
    templates: R.doc_templates.filter((t) => t.active).map(tplOf),
    voice: null,
    leaveOut: ['The short version'],
    asks: [],
    now: Date.parse('2026-11-12T12:00:00Z'),
  }
  const picks = orgPool([org()], [])
    .slice(0, 2)
    .map((x: Finding) => pickOf(x))
  const text = 'Most firms lose a week to onboarding. '.repeat(10).trim()
  const src = buildRequest({ ...blankForm(), src: 'paste', text, picks }, ctx)
  if (!src.ok) throw new Error(src.error)
  const T = src.row.template as Row
  expect(String(T.rules).startsWith('Build it on these findings the team picked from the market briefs (they frame it; the facts come from our material): Fee talk is up; Client numbers win replies, every time. Leave these parts of the organic brief out: The short version.')).toBe(true)
  expect(((src.row.setup as Row).insights as Row[]).map((i) => i.from)).toEqual(['Five things', 'Five things'])

  const thesis = 'Most firms buy the AI tool before they name who owns the workflow, and the tool sits unused.'
  const idea = buildRequest({ ...blankForm(), src: 'idea', thesis, picks }, ctx)
  if (!idea.ok) throw new Error(idea.error)
  expect(idea.row.thesis).toBe(thesis + '\n\nWhat the team picked from the briefs to build on:\n1. Fee talk is up (Advisors talk about the fee more than last month)\n2. Client numbers win replies, every time (A post with one client number gets twice the replies)')
  expect(String((idea.row.template as Row).rules)).not.toContain('Build it on these findings')
  expect(idea.row.title).toBe('Most firms buy the AI tool before they name who owns the workflow, and the tool sits unuse')

  // written from the picks: the idea is the picks, named after the first one
  const from = buildRequest({ ...blankForm(), src: 'idea', thesis: ideaFromPicks(picks), picks }, ctx)
  if (!from.ok) throw new Error(from.error)
  expect(String(from.row.thesis).startsWith(PICKED_LEAD)).toBe(true)
  expect(String(from.row.thesis)).not.toContain('What the team picked')
  expect(from.row.title).toBe('Fee talk is up')

  // none picked: as before
  const plain = buildRequest({ ...blankForm(), src: 'paste', text }, ctx)
  if (!plain.ok) throw new Error(plain.error)
  expect((plain.row.setup as Row).insights).toBeUndefined()
})
