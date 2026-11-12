import { expect, test } from '@playwright/test'
import {
  type Ad, adActive, adClean, adOf, adSources, adStale, adTitle, candOf, hookSource, hookUrlsFor, idsOf, isDynamic, metaText, rankAds, runDateOf,
} from '../../src/lib/pipeline/ads'
import {
  type DecRow, ADDED, CHECKS, RAIL, SECS, actionLabel, adEvidence, adFive, adsParts, ageDays, angleOf, combinedPick, comboCards, decLine, devsOf, devsShown,
  fiveHeading, fiveItems, layoutOf, mdPlain, mdSec, newestFor, newestPerRun, optOf, orgEvidence, orgFive, orgGlance, provenOf, reviewOf, shiftsOf, stateOf,
  topicWatch, waitingLine,
} from '../../src/lib/pipeline/briefs'
import { itemOf } from '../../src/lib/pipeline/intel'
import { ADS2_MD, LIB, ORG_MD, POST, W, briefRows } from './briefs-fixtures'

// The briefs page's rules, checked without a browser, on the made-up rows in tests/e2e/briefs-fixtures.ts.

const NOW = Date.parse('2026-11-11T12:00:00Z')
const rows = briefRows(NOW)
const org = JSON.parse(String(rows.agent_outputs[0].data)) as Record<string, unknown>
const posts = rows.intel_items.map((r) => itemOf(r, String(r.author_name || r.author_company || '')))
const ads: Ad[] = rows.winner_creatives.map((r) => adOf(r, NOW))
const dec = (target_id: string, action: string, created_at = '2026-11-10T10:00:00Z', feedback = '', author = 'erin@example.com'): DecRow => ({
  target_id,
  action,
  feedback,
  author,
  created_at,
})

test('who decided what: only the newest decision counts, and undone or edited is no decision', () => {
  const list = [dec('r1', 'reopened', '2026-11-10T12:00:00Z'), dec('r1', 'approved', '2026-11-10T11:00:00Z'), dec('r2', 'changes')]
  expect(newestFor(list, 'r1')?.action).toBe('reopened')
  expect([stateOf(newestFor(list, 'r1')), stateOf(newestFor(list, 'r2')), stateOf(null), stateOf(dec('r3', 'edited'))]).toEqual([
    'pending',
    'changes',
    'pending',
    'pending',
  ])
  expect(stateOf(dec('r', 'approved'))).toBe('ok')

  const ago = () => '2d ago'
  expect(decLine(null, 'Helper.', ago)).toBe('Helper.')
  expect(decLine(dec('r', 'approved'), 'Helper.', ago)).toBe('Approved by erin 2d ago')
  expect(decLine(dec('r', 'changes', '', 'Drop the fee posts.'), 'Helper.', ago)).toBe('Changes requested by erin 2d ago: “Drop the fee posts.”')
  expect(decLine(dec('r', 'changes', '', 'x'.repeat(200)), 'Helper.', ago)).toBe('Changes requested by erin 2d ago: “' + 'x'.repeat(140) + '”')
  expect(decLine(dec('r', 'edited', '', 'Removed two shifts. '), 'Helper.', ago)).toBe('Edited by erin 2d ago: Removed two shifts. Approve it when it reads right.')
  expect(decLine(dec('r', 'reopened'), 'Helper.', ago)).toBe('Helper.')
  expect(decLine(dec('r', 'approved', '', '', ''), 'Helper.', ago)).toBe('Approved by someone 2d ago')

  expect(waitingLine(1, true)).toEqual({ tone: 'warn', text: '1 brief waiting for your review' })
  expect(waitingLine(3, true)).toEqual({ tone: 'warn', text: '3 briefs waiting for your review' })
  expect(waitingLine(0, true)).toEqual({ tone: 'good', text: 'Every brief reviewed' })
  expect(waitingLine(0, false)).toEqual({ tone: 'good', text: 'No briefs yet' })
})

test('a saved review, a custom run, one brief per run', () => {
  const d2 = JSON.parse(String(rows.agent_outputs[2].data)) as Record<string, unknown>
  expect(reviewOf(d2)).toEqual({ by: 'erin@example.com', at: (d2.review as { at: string }).at, hidden: ['dev'], removed: [], original: true })
  expect(reviewOf({})).toBeNull()
  expect(reviewOf({ review: JSON.stringify({ by: 'x@example.com', hidden: 'five' }) })).toEqual({ by: 'x@example.com', at: '', hidden: [], removed: [], original: false })

  const r = newestPerRun([
    { run_id: 'a', created_at: '2026-11-01T00:00:00Z', n: 1 },
    { run_id: 'b', created_at: '2026-11-03T00:00:00Z', n: 2 },
    { run_id: 'a', created_at: '2026-11-04T00:00:00Z', n: 3 },
    { run_id: '', created_at: '2026-11-05T00:00:00Z', n: 4 },
  ])
  expect(r.map((x) => x.n)).toEqual([3, 2])
})

test('the organic brief read from its markdown: sections, what changed and developments', () => {
  expect(mdSec(ORG_MD, 3)).toContain('**Shift: From promises to proof**')
  expect(mdSec(ORG_MD, 3)).not.toContain('Notable developments')
  expect(mdSec(ORG_MD, 7)).toBe('')
  expect(mdSec('## 3\\. Escaped\nbody\n---\nafter', 3)).toBe('body\n')
  expect(mdPlain('**Bold** and [a link](https://example.com) with _emphasis_ → hand to Agent 2')).toBe('Bold and a link with emphasis')
  expect(mdPlain(', leading and trailing;')).toBe('leading and trailing')

  expect(shiftsOf(ORG_MD, org)).toEqual([
    {
      title: 'From promises to proof',
      interp: 'Advisors now lead with client results, not features.',
      obs: 'A post on client results drew 340 reactions.',
      who: 'Northwind Advisors',
      url: POST(1),
      use: 'Lead with one real result per post.',
    },
    {
      title: 'Onboarding speed is the new differentiator',
      interp: 'Firms compete on how fast a client is set up.',
      obs: 'Onboarding in days, not weeks.',
      who: 'Example Ridge Advisors',
      url: POST(9),
      use: 'Show your onboarding checklist.',
    },
  ])
  // the older one-line form: "Shift: title – reading" (a real dash: a hyphen is part of the title), " · " before its parts
  expect(
    shiftsOf('## 3. What changed\nShift: Fees go flat – Advisors price by the year · **Evidence:** [Acme](https://example.com/a): Four posts · **Implication for our content:** Say the fee', {}),
  ).toEqual([{ title: 'Fees go flat', interp: 'Advisors price by the year', obs: 'Four posts', who: 'Acme', url: 'https://example.com/a', use: 'Say the fee' }])
  // without a "What changed" section, the brief's own list: the note is the title, the summary what was seen
  const long = 'A note much longer than the title can hold, so the whole of it is kept as the reading while the title is cut short to fit.'
  expect(
    shiftsOf('', {
      sophistication_shifts: JSON.stringify([
        { note: 'Fees go flat', summary: 'Four posts on flat fees', competitor: 'Acme', url: 'https://example.com/a' },
        { note: long, summary: '' },
        { summary: 'Only a summary' },
        { note: '', summary: '' },
      ]),
    }),
  ).toEqual([
    { title: 'Fees go flat', interp: '', obs: 'Four posts on flat fees', who: 'Acme', url: 'https://example.com/a', use: '' },
    { title: long.slice(0, 109).replace(/\s+\S*$/, '') + '…', interp: long, obs: '', who: '', url: '', use: '' },
    { title: 'Only a summary', interp: '', obs: '', who: '', url: '', use: '' },
  ])

  const devs = devsOf(ORG_MD)
  expect(devs).toEqual([
    { cat: 'Thought leadership', title: 'A governance checklist', who: 'Contoso Planning', url: POST(3), text: 'Security steps before using AI tools.', why: 'Buyers ask about governance first.' },
    { cat: 'Product news', title: 'New AI notetaker', who: 'Fabrikam Insights', url: 'https://example.com/notetaker', text: 'A notetaker built for advisors.', why: 'Shows where tooling is heading.' },
  ])
  // a link-first item and a ### group
  expect(devsOf('## 4. Developments\n### Pricing\n[Acme](https://example.com/f): Four posts on flat fees. *Why it matters:* Buyers compare.')).toEqual([
    { cat: 'Pricing', title: '', who: 'Acme', url: 'https://example.com/f', text: 'Four posts on flat fees.', why: 'Buyers compare.' },
  ])
  const many = [1, 2, 3].flatMap((i) => ['a', 'b'].map((c) => ({ cat: c, title: c + i, who: '', url: '', text: '', why: '' })))
  expect(devsShown(many, 2).map((d) => d.title)).toEqual(['a1', 'b1', 'a2', 'b2'])
  expect(devsShown(many, 1).map((d) => d.title)).toEqual(['a1', 'b1'])
  expect(devsShown(many, 'all')).toHaveLength(6)
})

test('the posts behind an organic brief, topic watch and the numbers at a glance', () => {
  // built from the top posts by score: all of them, in the brief's order, the run's posts filling in
  const ev = orgEvidence(org, posts)
  expect(ev.map((r) => [r.rec, r.who, r.type, r.topic, r.eng, r.why, r.postId])).toEqual([
    ['O1', 'Northwind Advisors', 'Opinion post', 'Show the proof, not the promise', 340, 'Concrete client results.', posts[0].id],
    ['O2', 'Example Ridge Advisors', 'Case study', 'Onboarding in days, not weeks', 120, 'Speed sells.', posts[1].id],
    ['O3', 'Contoso Planning', 'How-to guide', 'A governance checklist for advisors', null, '', posts[2].id],
  ])
  // an older brief: its high-value posts, else its ten most engaged
  expect(orgEvidence({ items: org.items, high_value_items: [{ url: 'https://example.com/hv', competitor: 'Acme', summary: 'One two three' }] }, []).map((r) => r.topic)).toEqual([
    'One two three',
  ])
  const twelve = Array.from({ length: 12 }, (_, i) => ({ url: 'https://example.com/' + i, engagement_total: i, headline: 'Post ' + i }))
  expect(orgEvidence({ items: twelve }, []).map((r) => r.topic)).toEqual(['Post 11', 'Post 10', 'Post 9', 'Post 8', 'Post 7', 'Post 6', 'Post 5', 'Post 4', 'Post 3', 'Post 2'])

  expect(topicWatch(org)).toEqual([{ key: 'security', n: 1, items: [{ who: 'Contoso Planning', url: POST(3), text: 'A security checklist for advisors' }] }])
  expect(topicWatch({ topic_watch: JSON.stringify({ ai_adoption: [{ summary: 'x' }] }) })).toEqual([{ key: 'ai-adoption', n: 1, items: [{ who: 'Source', url: '', text: 'x' }] }])
  // a link that is not a web address is not kept
  expect(topicWatch({ topic_watch: { security: [{ competitor: 'X', url: 'javascript:alert(1)', summary: 'y' }] } })[0].items[0].url).toBe('')

  expect(orgGlance(org)).toEqual([
    { value: '48', label: 'posts read', note: 'Up to 50 a run, the most engaged first' },
    { value: '3', label: 'in the brief', note: 'The top 3 on-topic posts by score' },
    { value: '5', label: 'high value', note: 'Scored 70 or more' },
    { value: '10', label: 'filtered', note: 'Off-topic or too little engagement' },
    { value: '1', label: 'replies drafted', note: 'Waiting in Replies until you approve' },
  ])
  // an older brief, read by the agent
  expect(orgGlance({ n_items: 20, n_high_value: 2, n_out_of_focus: 3 })).toEqual([
    { value: '20', label: 'posts read', note: 'Every new post from the accounts and topics you follow' },
    { value: '2', label: 'high value', note: 'Rated worth acting on, by the agent' },
    { value: '3', label: 'filtered', note: 'Off-topic, too little engagement or outside what you track' },
  ])
})

test('the five things: the snapshot, else the TL;DR (or hooks and a pain), none when hidden, five at most', () => {
  const snap = rows.agent_outputs[1].snapshot
  expect(orgFive(snap, ORG_MD, false).map((x) => x.text)).toEqual(['Proof beats promises', 'Onboarding in days', 'Governance checklists spread'])
  expect(orgFive(undefined, ORG_MD, false)).toEqual([
    { text: 'Proof beats promises', why: 'Advisors ask for evidence of results before they book a call.', tag: 'Theme' },
    { text: 'Onboarding in days', why: 'Firms now promise client onboarding in days, not weeks.', tag: 'Theme' },
  ])
  expect(orgFive(snap, ORG_MD, true)).toEqual([])
  expect(fiveItems({ items: Array.from({ length: 7 }, (_, i) => ({ text: 'T' + i })) }, [], false)).toHaveLength(5)
  expect(fiveItems({ items: [{ text: '' }, { text: 'Kept' }] }, [], false).map((x) => x.text)).toEqual(['Kept'])
  expect(fiveHeading(5)).toBe('Five things working')
  expect(fiveHeading(1)).toBe('One thing working')
  expect(fiveHeading(9)).toBe('Five things working')
})

test('the ads brief’s parts, kept as JSON text or lists', () => {
  const p = adsParts(rows.creative_briefs[0] as never)
  expect(p).toEqual({
    hooks: ['Your clients want proof, not promises', 'Onboarding in days, not weeks', 'One workflow, automated first'],
    offers: [
      { type: 'Free readiness review', price: '$0', notes: 'A 30-minute call with a scorecard.' },
      { type: 'Paid audit', price: '', notes: '' },
    ],
    pains: ['Paperwork eats the advisors’ week', 'Clients wait weeks to be onboarded'],
    objections: ['We tried AI and it made mistakes'],
    // an object reads as its words, not as raw JSON
    cross: ['Accounting firms lead with a free health check', 'Dental clinics show before and after'],
    formula: 'Problem → Proof → Offer',
    angle: 'Most firms sell features; the firm’s angle is “proof you can check in a week”. It’s not about tools.',
  })
  expect(adsParts({ winning_hooks: null, winning_offers: '[]', cross_niche_sources: '' } as never)).toMatchObject({ hooks: [], offers: [], cross: [], formula: '', angle: '' })
  expect(provenOf('**Evidence:** 9 proven + 4 emerging')).toEqual({ proven: 9, emerging: 4 })
  expect(provenOf('nothing')).toBeNull()
  expect(ageDays('2026-10-10T12:00:00Z', NOW)).toBe(32)
  expect(ageDays('', NOW)).toBe(0)
})

test('an ad as the page reads it: catalog ads, run time, uploads', () => {
  const [w1, w2, w3, , w5] = ads
  expect(w1).toMatchObject({ adv: 'Northwind Advisors', title: 'Your clients want proof, not promises', lib: true, up: false, days: 60, act: true, score: 81 })
  expect(w2).toMatchObject({ up: true, lib: false })
  expect(w3).toMatchObject({ title: 'Dynamic catalog ad · Example Retail', act: false, score: 30 })
  expect(w5).toMatchObject({ sw: true, lib: false, act: false })
  expect(isDynamic({ hook: 'Shop {{ product.name }}' })).toBe(true)
  expect(adTitle({ hook: '', body: 'Body only' })).toBe('Body only')
  expect(adTitle({})).toBe('Untitled ad')
  expect([adClean('{{product.brand}}'), adClean('placeholder -> placeholder'), adClean(' Book now ')]).toEqual(['', '', 'Book now'])
  expect(adStale({ stale_days: 3 }, NOW)).toBe(3)
  expect(adStale({ last_seen: '2026-11-08T12:00:00Z' }, NOW)).toBe(3)
  expect(adStale({}, NOW)).toBeNull()
  expect(adActive({ is_active: false, last_seen: '2026-11-06T12:00:00Z' }, NOW)).toBe(true)
  expect(adActive({ is_active: false, last_seen: '2026-11-01T12:00:00Z' }, NOW)).toBe(false)

  expect(idsOf([W(1), W(2)])).toEqual([W(1), W(2)])
  expect(idsOf(JSON.stringify([W(1)]))).toEqual([W(1)])
  expect(idsOf('{"' + W(1) + '",' + W(2) + '}')).toEqual([W(1), W(2)])
  expect([idsOf(''), idsOf('[broken'), idsOf('plain')]).toEqual([[], [], []])
  expect(runDateOf('agent2_2026-11-09_1412')).toBe('2026-11-09T14:12:00Z')
  expect(runDateOf('agent2_custom_2026-11-09')).toBe('2026-11-09T12:00:00Z')
  expect(runDateOf('upload')).toBeNull()
})

test('how an ad in the brief’s list was doing, in words; “uploaded” said once', () => {
  expect(metaText('PROVEN · active · 64d · score 0.71', false)).toBe('proven, still running, 64 days, score 0.71')
  expect(metaText('PROVEN · active · 64d · score 0.71', true)).toBe('proven, still running')
  expect(metaText('EMERGING · ended · uploaded · swipe_file', true)).toBe('emerging, stopped running, uploaded by your team')
  expect(metaText('8wk_plus · under_6wk · 6wk_plus · paused', true)).toBe('ran 8+ weeks, under 6 weeks, ran 6+ weeks, stopped running')
  expect(metaText('', true)).toBe('listed in the brief')
})

test('the ads behind a brief: its markdown list matched to the kept ads, else the run’s best', () => {
  const recs = rows.ad_records
  const s = adSources(ADS2_MD, recs, 'agent2_2026-10-10_0900')
  expect(s).toEqual([
    { advertiser: 'Harbor Example Group', meta: 'PROVEN · active · 64d · score 0.71', hook: 'Your first workflow, automated in a week', url: LIB(4), days: 64, active: true, recordId: 'ar-4' },
    { advertiser: 'Old Mill Advisors', meta: 'EMERGING · ended · uploaded · swipe_file', hook: 'Stop losing a week to paperwork', url: LIB(5), days: 20, active: false, recordId: 'ar-5' },
  ])
  // no list: the run's own ads by score, a swipe link swapped for the landing page
  const own = adSources('no list here', [
    { id: 1, run_id: 'r', advertiser_name: 'Low', hook: 'Low', performance_score: 0.2, ad_library_url: 'https://example.com/low' },
    { id: 2, run_id: 'r', advertiser_name: 'High', hook: 'High', performance_score: 0.9, ad_library_url: 'swipe:abc', destination_url: 'https://example.com/lp', uploaded_by: 'x@example.com' },
    { id: 3, run_id: 'other', advertiser_name: 'Other', performance_score: 1 },
  ], 'r')
  expect(own.map((x) => [x.advertiser, x.url, x.meta])).toEqual([
    ['High', 'https://example.com/lp', 'uploaded by your team'],
    ['Low', 'https://example.com/low', ''],
  ])

  // named by id: in the brief's order, hand-picked ones say so; a review that removed an ad leaves it out
  const picked = [ads[0], ads[1], ads[2]]
  const ev = adEvidence(picked, [], [], [])
  expect(ev.map((r) => [r.rec, r.adv, r.hook, r.status, r.days, r.score])).toEqual([
    ['P1', 'Northwind Advisors', 'Your clients want proof, not promises', 'Still running', 60, 81],
    ['P2', 'Example Ridge Advisors', 'Onboarding in days, not weeks', 'Hand-picked by your team', null, null],
    ['P3', 'Example Retail', 'Dynamic catalog ad · Example Retail', 'Stopped', 12, 30],
  ])
  expect(adEvidence(picked, [], [], [W(2)]).map((r) => r.rec + ' ' + r.adv)).toEqual(['P1 Northwind Advisors', 'P2 Example Retail'])
  // listed in the markdown, matched by link
  const pool = [ads[3], ads[4]]
  expect(adEvidence([], s, pool, []).map((r) => [r.adv, r.cta, r.offer, r.status, r.days, r.score])).toEqual([
    ['Harbor Example Group', 'Book a call', 'Workflow sprint', 'proven, still running', 64, 71],
    ['Old Mill Advisors', '', 'Paperwork review', 'emerging, stopped running, uploaded by your team', 20, null],
  ])
  expect(adEvidence([], s, pool, [LIB(5)]).map((r) => r.adv)).toEqual(['Harbor Example Group'])
})

test('the ads closest to a point, and where a hook was seen', () => {
  const snap = rows.agent_outputs.find((r) => r.run_id === 'agent2_2026-11-09_1412')!.snapshot
  const picked = [ads[0], ads[1], ads[2]]
  const b = rows.creative_briefs[0] as never
  const five = adFive(b, snap, false, picked, null, picked)
  expect(five.map((f) => [f.text, f.tag, f.ads?.map((a) => a.adv), f.all])).toEqual([
    ['Proof-first openings keep running', 'Hook', ['Northwind Advisors'], false],
    ['Free readiness reviews', 'Offer', ['Northwind Advisors'], false],
  ])
  // a point no ad is close to: a brief built from a few hand-picked ads came from all of them
  const none = adFive(b, { items: [{ text: 'Seasonal tax planning', tag: 'Hook' }] }, false, picked, null, picked)
  expect(none[0]).toMatchObject({ all: true })
  expect(none[0].ads).toHaveLength(3)
  expect(adFive(b, snap, true, picked, null, picked)).toEqual([])
  // nothing to match against: no sources at all
  expect(adFive(b, snap, false, [], null, [])[0].ads).toBeNull()

  // ranking: shared words (six at most), six more for the ads the snapshot names, one for an offer point
  const rowsC = picked.map(candOf)
  expect(rankAds({ text: 'Clients want proof' }, rowsC, null).map((r) => r.who)).toEqual(['Northwind Advisors'])
  expect(rankAds({ text: 'Onboarding' }, rowsC, new Set([LIB(1)])).map((r) => r.who)).toEqual(['Northwind Advisors'])
  expect(rankAds({ text: 'Unrelated words entirely' }, rowsC, null)).toEqual([])

  expect(hookSource(snap, 'Your clients want proof, not promises')).toEqual({ ads: [LIB(1)], who: ['Northwind Advisors'], note: '' })
  expect(hookSource(snap, 'Onboarding in days')).toBeNull()
  expect(hookSource({}, 'Your clients')).toBeNull()
  expect([...(hookUrlsFor(snap, 'Clients want proof today') ?? [])]).toEqual([LIB(1)])
  expect([...(hookUrlsFor(snap, 'Proof only') ?? [])]).toEqual([])
  expect(hookUrlsFor({}, 'x')).toBeNull()
})

test('Combined: the approved brief over the newest, the angle in a few words, the six cards', () => {
  const list = [{ run_id: 'new' }, { run_id: 'old' }]
  expect(combinedPick(list, [dec('old', 'approved')])).toEqual({ row: { run_id: 'old' }, ok: true })
  expect(combinedPick(list, [dec('old', 'changes')])).toEqual({ row: { run_id: 'new' }, ok: false })
  expect(combinedPick([], [])).toBeNull()

  // a quoted phrase, in straight or curly double quotes; apostrophes are not quotes
  expect(angleOf('The angle is “proof you can check in a week”. More.')).toBe('proof you can check in a week')
  expect(angleOf('Say "results in days, not months" every time.')).toBe('results in days, not months')
  expect(angleOf('The firm’s angle is speed. It’s not about tools.')).toBe('The firm’s angle is speed.')
  expect(angleOf('Too "short" to quote. Second.')).toBe('Too "short" to quote.')

  expect([actionLabel(null), actionLabel('download'), actionLabel('inquiry'), actionLabel('purchase'), actionLabel('webinar_signup')]).toEqual([
    'Book a call',
    'Download a resource',
    'Request a proposal',
    'Buy a small offer',
    'webinar_signup',
  ])

  const day = (iso: string) => 'day of ' + iso.slice(0, 10)
  const full = comboCards({
    org: { createdAt: '2026-11-09T14:00:00Z', five: [{ text: 'Proof beats promises', why: '', tag: '' }] },
    ads: { createdAt: '2026-11-09T14:12:00Z', angle: 'Sell “proof you can check in a week”.', five: [], hooks: JSON.stringify([{ pattern: 'Your clients want proof' }]) },
    persona: { name: 'Ops lead', role: 'Head of Operations', firm: '' },
    targetMarket: 'RIAs',
    offer: { name: 'Readiness Review', price: '', free: true, action: 'download' },
    proof: { name: 'Example Case', claim: 'Cut onboarding to 5 days' },
    day,
  })
  expect(full.map((c) => [c.label, c.value, c.source])).toEqual([
    ['Angle', 'proof you can check in a week', 'From the ads brief of day of 2026-11-09'],
    ['Audience', 'Head of Operations', 'Your default buyer, from the company profile'],
    ['Hook to test', 'Your clients want proof', 'From the ads brief of day of 2026-11-09'],
    ['Offer', 'Readiness Review · free', 'Your default offer'],
    ['Proof', 'Example Case: Cut onboarding to 5 days', 'Approved proof you may quote'],
    ['Call to action', 'Download a resource', 'From your default offer'],
  ])
  // no ads brief and no profile: the organic brief's first point, the target market's first part, the rest to add
  const bare = comboCards({ org: { createdAt: '2026-11-02T14:00:00Z', five: [{ text: 'Fee talk is up', why: '', tag: '' }] }, ads: null, persona: null, targetMarket: 'Independent RIAs; family offices', offer: null, proof: null, day })
  expect(bare.map((c) => [c.value, c.add])).toEqual([
    ['Fee talk is up', ''],
    ['Independent RIAs', 'audiences'],
    ['', ''],
    ['', 'audiences'],
    ['', 'proof'],
    ['', 'audiences'],
  ])
  expect(bare[0].source).toBe('From the organic brief of day of 2026-11-02')
})

test('the team’s layout: order, sections off and options, with the locked ones kept', () => {
  const usual = layoutOf(undefined, 'org')
  expect(usual).toEqual({ order: SECS.org.map((x) => x.k), off: [], opt: {} })
  expect(layoutOf(undefined, 'ads').order).toEqual(SECS.ads.map((x) => x.k))

  const saved = JSON.stringify({
    org: {
      order: ['review', 'ev', 'shift', 'x_reg', 'nope', 'ev', 'themes', 'dev', 'short', 'hand'],
      off: ['hand', 'short', 'ev', 'review', 'x_reg', 'x_questions', 'hand'],
      opt: { five: { n: '3', why: 'short' }, shift: { n: '7' }, ev: 'bad' },
    },
  })
  const L = layoutOf(saved, 'org')
  // the record and the five things lead, the review closes; unknown and repeated keys go; missing ones come back at the end
  expect(L.order).toEqual(['rec', 'five', 'ev', 'shift', 'x_reg', 'themes', 'dev', 'short', 'hand', 'review'])
  // locked sections cannot be switched off; an added one only when it is in the layout
  expect(L.off).toEqual(['hand', 'short', 'x_reg'])
  expect(optOf(L, 'org', 'five', 'n')).toBe('3')
  expect(optOf(L, 'org', 'five', 'why')).toBe('short')
  // not one of the choices: the usual one
  expect(optOf(L, 'org', 'shift', 'n')).toBe('6')
  expect(optOf(L, 'org', 'ev', 'n')).toBe('10')
  expect(optOf(L, 'org', 'dev', 'n')).toBe('2')
  expect(optOf(L, 'org', 'short', 'n')).toBe('')
  // the ads kind is read on its own
  expect(layoutOf(saved, 'ads')).toEqual({ order: SECS.ads.map((x) => x.k), off: [], opt: {} })

  // every section has a name in the rail, and every kind three checks
  for (const k of ['org', 'ads'] as const) {
    for (const s of SECS[k]) if (s.k !== 'rec') expect(RAIL[k][s.k], k + ' ' + s.k).toBeTruthy()
    expect(CHECKS[k]).toHaveLength(3)
    expect(Object.keys(ADDED[k]).every((x) => x.startsWith('x_'))).toBe(true)
  }
})
