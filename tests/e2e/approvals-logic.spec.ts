import { expect, test } from '@playwright/test'
import {
  type ApprovalInput, type Campaign, type Item, PAGE, approvalItems, clip, draftTitle, hookText, kindLabel, parseKey, safeUrl, snapItems, tabFromWord, tldr,
  undecided, viewOf, waitingChips, whyText, wordOf,
} from '../../src/lib/touchpoint/approvals'
import { DR, IMG, INTEL_MD, RID, RQ, RUN1, RUN2, RUN4, approvalRows, campaignRows, file, reply } from './approvals-fixtures'

// Approvals' rules, checked without a browser: what is waiting, what each row says, the tabs and their counts, the
// reason a reply was rejected, and which keys a write takes. The rows are made up (tests/e2e/approvals-fixtures.ts).

const NOW = Date.parse('2026-11-11T12:00:00Z')
const D = 864e5
const LEGACY = 'https://aiparagon.vercel.app/dashboard'

type Rows = ReturnType<typeof approvalRows>
const asReplies = (drafts: Rows['engagement_drafts']) =>
  drafts
    .filter((d) => d.status === 'pending')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((d) => ({ id: d.id, competitor: d.competitor_name, platform: d.platform, action: d.action, draft: d.draft, sourceUrl: d.source_url, createdAt: d.created_at }))

/** The loader's input from the made-up rows, as approvals-load.ts builds it. */
function input(over: Partial<ApprovalInput> = {}, rows: Rows = approvalRows(NOW)): ApprovalInput {
  const ib = rows.agent_outputs[0]
  const ab = rows.creative_briefs[0]
  return {
    intel: { run_id: ib.run_id, created_at: ib.created_at, content_md: ib.content_md, n_items: ib.data.n_items },
    ads: { run_id: ab.run_id, created_at: ab.created_at, winning_hooks: ab.winning_hooks, core_pain_points: ab.core_pain_points },
    decisions: {},
    snaps: {},
    replies: asReplies(rows.engagement_drafts),
    legacy: LEGACY + '/',
    now: NOW,
    ...over,
  }
}
const keys = (xs: Item[]) => xs.map((x) => x.key)
const tabs = (v: ReturnType<typeof viewOf>) => v.tabs.map((t) => `${t.label} ${t.n}`)

test('everything waiting, in the current dashboard’s order, with what each row says', () => {
  const items = approvalItems(input())
  expect(keys(items)).toEqual([
    'brief:intel_tracker:intel_run_new',
    'brief:ad_strategist:ads_run_new',
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => 'reply:' + RID(n)),
  ])
  const [org, ads] = items
  expect(org).toMatchObject({
    kind: 'brief',
    title: 'Organic brief',
    titleDay: approvalRows(NOW).agent_outputs[0].created_at,
    text: 'Onboarding is the theme. Three firms you follow posted about slow client onboarding this week.',
    tags: [{ text: 'Brief' }, { text: 'From Intel Tracker' }, { text: '12 posts' }],
    approve: true,
    review: { kind: 'link', href: LEGACY + '/briefs' },
  })
  expect(ads).toMatchObject({
    title: 'Ads brief',
    text: 'Onboarding should take days, not weeks',
    tags: [{ text: 'Brief' }, { text: 'From Ad Strategist' }, { text: '20 days old', tone: 'warn' }],
    review: { kind: 'link', href: LEGACY + '/briefs' },
  })
  const quote = items.find((x) => x.key === 'reply:' + RID(2))!
  expect(quote.title).toBe('Quote post on Sample Peak Partners')
  expect(quote.tags).toEqual([{ text: 'Reply' }, { text: 'X' }, { day: quote.when }])
  expect(quote.review).toEqual({ kind: 'reply' })
  expect(items.find((x) => x.key === 'reply:' + RID(1))!.title).toBe('Reply to Northwind Advisors')
  expect(items.find((x) => x.key === 'reply:' + RID(1))!.tags[1]).toEqual({ text: 'LinkedIn' })
  // more than a week old: left out of the counts
  expect(items.filter((x) => x.stale).map((x) => x.key)).toEqual(['reply:' + RID(7), 'reply:' + RID(8)])

  // one post; no posts counted; a brief under 14 days old has no age tag
  const one = approvalItems(input({ intel: { ...input().intel!, n_items: 1 } }))
  expect(one[0].tags).toContainEqual({ text: '1 post' })
  expect(approvalItems(input({ intel: { ...input().intel!, n_items: 0 } }))[0].tags).toHaveLength(2)
  const at = (days: number) => approvalItems(input({ ads: { ...input().ads!, created_at: new Date(NOW - days * D - 60e3).toISOString() } }))[1].tags
  expect(at(13)).toHaveLength(2)
  expect(at(14)).toContainEqual({ text: '14 days old', tone: 'warn' })
  // a reply with no firm named, or no platform
  const bare = approvalItems(input({ intel: null, ads: null, replies: [{ ...input().replies[0], competitor: '', platform: '' }] }))[0]
  expect([bare.title, bare.tags[1]]).toEqual(['Reply to a post', { text: 'Social' }])
})

test('a brief waits until it is decided; an undo or an edit sends it back', () => {
  expect(undecided([])).toBe(true)
  expect(undecided([{ action: 'approved' }])).toBe(false)
  expect(undecided([{ action: 'reopened' }, { action: 'approved' }])).toBe(true)
  expect(undecided([{ action: 'edited' }, { action: 'approved' }])).toBe(true)
  expect(undecided([{ action: 'approved' }, { action: 'reopened' }])).toBe(false)
  const items = approvalItems(input({ decisions: { intel_run_new: [{ action: 'approved' }] } }))
  expect(keys(items).filter((k) => k.startsWith('brief'))).toEqual(['brief:ad_strategist:ads_run_new'])
  expect(keys(approvalItems(input({ intel: null, ads: null })))).toHaveLength(8)
})

test('a snapshot wins over the fallback, stored as text once or twice over', () => {
  const snap = { items: [{ text: 'Calm, plain hooks win', why: 'they ran longest — 40+ days', tag: 'Hook' }] }
  expect(snapItems(JSON.stringify(JSON.stringify(snap)))).toEqual(snap.items)
  expect(snapItems(snap)).toEqual(snap.items)
  for (const bad of ['{broken', { items: [] }, { items: 'x' }, null, 7]) expect(snapItems(bad)).toBeNull()
  const items = approvalItems(input({ snaps: { ads_run_new: JSON.stringify(snap) } }))
  expect(items[1].text).toBe('Calm, plain hooks win. they ran longest, 40+ days')

  // the briefs' own fallbacks, then a line when even those are empty
  expect(tldr(INTEL_MD)).toEqual([
    { title: 'Onboarding is the theme', text: 'Three firms you follow posted about slow client onboarding this week.' },
    { title: 'Fee talk', text: 'is up again: two posts on flat fees.' },
  ])
  expect(tldr('No summary here')).toEqual([])
  const empty = approvalItems(input({ intel: { ...input().intel!, content_md: '# Brief' }, ads: { ...input().ads!, winning_hooks: null, core_pain_points: '[]' } }))
  expect(empty[0].text).toBe('What the people and topics you follow are talking about.')
  expect(empty[1].text).toBe('The competitor ads that keep running, and why.')
  // hooks kept as a list, and a pain point after them
  const listed = approvalItems(input({ ads: { ...input().ads!, winning_hooks: [], core_pain_points: ['Paperwork eats the week'] } }))
  expect(listed[1].text).toBe('Paperwork eats the week')
})

test('the tabs, their counts and what each one shows', () => {
  const items = approvalItems(input())
  const all = viewOf(items, {}, 'all', PAGE)
  expect([all.tab, all.waiting, tabs(all)]).toEqual(['all', 8, ['All 8', 'Briefs 2', 'Replies 6']])
  // All shows five replies and says how many more
  expect(keys(all.rows)).toEqual(keys(items).slice(0, 7))
  expect([all.replyMore, all.old]).toEqual([1, []])

  const replies = viewOf(items, {}, 'reply', PAGE)
  expect(keys(replies.rows)).toEqual([1, 2, 3, 4, 5, 6].map((n) => 'reply:' + RID(n)))
  expect(keys(replies.old)).toEqual(['reply:' + RID(7), 'reply:' + RID(8)])
  expect([replies.total, replies.replyMore]).toEqual([6, 0])

  // skipped: out of the counts, in a tab of its own
  const skips = { ['reply:' + RID(1)]: 1 }
  const skipped = viewOf(items, skips, 'all', PAGE)
  expect(tabs(skipped)).toEqual(['All 7', 'Briefs 2', 'Replies 5', 'Skipped 1'])
  expect(keys(skipped.rows)).not.toContain('reply:' + RID(1))
  expect(skipped.replyMore).toBe(0)
  expect(keys(viewOf(items, skips, 'skipped', PAGE).rows)).toEqual(['reply:' + RID(1)])

  // a tab with nothing in it shows All
  expect(viewOf(items, {}, 'skipped', PAGE).tab).toBe('all')
  expect(viewOf(items, {}, 'ad', PAGE).tab).toBe('all')
  // v117: only old replies left: Replies says 0 and keeps them in their box
  const oldOnly = items.filter((x) => x.kind === 'brief' || x.stale)
  expect(tabs(viewOf(oldOnly, {}, 'all', PAGE))).toEqual(['All 2', 'Briefs 2', 'Replies 0'])
  const r0 = viewOf(oldOnly, {}, 'reply', PAGE)
  expect([r0.tab, r0.rows.length, r0.old.length]).toEqual(['reply', 0, 2])
  // nothing at all
  expect(tabs(viewOf([], {}, 'reply', PAGE))).toEqual(['All 0'])

  // 20 at a time
  const many = approvalItems(input({ intel: null, ads: null, replies: asReplies(Array.from({ length: 25 }, (_, i) => reply(100 + i, 'Firm ' + i, (i + 1) * 60e3, NOW))) }))
  const p1 = viewOf(many, {}, 'reply', PAGE)
  expect([p1.rows.length, p1.total]).toEqual([20, 25])
  expect(viewOf(many, {}, 'reply', PAGE + PAGE).rows).toHaveLength(25)
  expect(viewOf(many, {}, 'all', PAGE).replyMore).toBe(20)
})

test('Today’s chips, the tab words in the address and the count words', () => {
  const items = approvalItems(input())
  expect(waitingChips(items, {})).toEqual([
    { kind: 'brief', n: 2, label: '2 briefs' },
    { kind: 'reply', n: 6, label: '6 replies' },
  ])
  expect(waitingChips(items, { 'brief:intel_tracker:intel_run_new': 1 })[0].label).toBe('1 brief')
  expect([tabFromWord('replies'), tabFromWord('briefs'), tabFromWord('skipped'), tabFromWord(null), tabFromWord('reply')]).toEqual([
    'reply', 'brief', 'skipped', 'all', 'all',
  ])
  expect([wordOf('all'), wordOf('reply'), wordOf('failed'), wordOf('skipped')]).toEqual(['', 'replies', 'failed', 'skipped'])
  expect([kindLabel('reply', 1), kindLabel('reply', 3), kindLabel('failed', 2), kindLabel('ad', 2)]).toEqual(['1 reply', '3 replies', '2 failed requests', '2 ads'])
  expect(clip('one two three four', 12)).toBe('one two…')
})

test('why a reply was rejected, in one sentence', () => {
  expect(whyText(['long', 'salesy'], '  Skip posts  about a client loss. ')).toBe('Reply: too salesy, too long. Skip posts about a client loss.')
  expect(whyText(['skip'], '')).toBe('Reply: not worth a reply.')
  expect(whyText([], 'Too pushy')).toBe('Reply: Too pushy')
  expect(whyText([], '   ')).toBe('')
  expect(whyText(['nope'], '')).toBe('')
  expect(whyText([], 'x'.repeat(900))).toHaveLength(600)
})

test('the keys a write takes, and the links a reply may open', () => {
  expect(parseKey('brief:intel_tracker:intel_run_new')).toEqual({ kind: 'brief', agent: 'intel_tracker', runId: 'intel_run_new' })
  expect(parseKey('brief:ad_strategist:run:2026-11-09T13:05')).toEqual({ kind: 'brief', agent: 'ad_strategist', runId: 'run:2026-11-09T13:05' })
  expect(parseKey('reply:' + RID(1))).toEqual({ kind: 'reply', id: RID(1) })
  for (const bad of ['brief:lead_research:r1', 'brief:intel_tracker:', 'brief:intel_tracker:a b', 'brief:intel_tracker:x;drop', 'reply:42', 'reply:' + RID(1) + ':x', 'ad:1', '', null]) {
    expect(parseKey(bad)).toBeNull()
  }
  expect(safeUrl('https://www.linkedin.com/feed/update/urn:li:activity:1')).toBe('https://www.linkedin.com/feed/update/urn:li:activity:1')
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//example.com', 'https://exa mple.com', '']) expect(safeUrl(bad)).toBe('')
})

// ---------- part B: failed requests, ad images, content drafts ----------

const B = () => campaignRows(NOW)
/** Part B's rows as the loader hands them on: the newest row of each campaign, data read, hooks and decisions by key. */
function inputB(over: Partial<ApprovalInput> = {}): ApprovalInput {
  const b = B()
  const campaigns: Campaign[] = []
  for (const o of [...b.campaigns].sort((x, y) => y.created_at.localeCompare(x.created_at))) {
    if (!campaigns.some((c) => c.run_id === o.run_id)) campaigns.push({ run_id: o.run_id, created_at: o.created_at, data: JSON.parse(o.data) })
  }
  const adDecisions: Record<string, string> = {}
  for (const f of [...b.adFeedback].filter((f) => f.target_type === 'ad_image_variant').sort((x, y) => y.created_at.localeCompare(x.created_at))) {
    if (!(f.target_id in adDecisions)) adDecisions[f.target_id] = f.action
  }
  return input({
    requests: b.content_requests.map((r) => ({ id: r.id, title: r.title ?? '', status: r.status, error: r.error ?? '', created_at: r.created_at })),
    drafts: b.drafts.map((o) => ({ id: o.id, title: o.title ?? '', created_at: o.created_at, data: typeof o.data === 'string' ? JSON.parse(o.data) : o.data })),
    ready: [DR(3)],
    campaigns,
    hooks: { [RUN1]: ['Stop losing a week to paperwork', 'Your first workflow, automated'], [RUN2]: ['Onboarding in days, not weeks'] },
    adDecisions,
    ...over,
  })
}

test('part B: failed requests first, then the briefs, the ads, the drafts and the replies', () => {
  const items = approvalItems(inputB())
  expect(keys(items).slice(0, 10)).toEqual([
    'req:' + RQ(1),
    'req:' + RQ(3),
    'brief:intel_tracker:intel_run_new',
    'brief:ad_strategist:ads_run_new',
    `ad:${RUN1}:${file(RUN1, 'b')}`,
    `ad:${RUN1}:${file(RUN1, 'c')}`,
    `ad:${RUN2}:${file(RUN2, 'a')}`,
    `ad:${RUN2}:${file(RUN2, 'b')}`,
    'draft:' + DR(1),
    'draft:' + DR(2),
  ])
  expect(keys(items).slice(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => 'reply:' + RID(n)))

  const [failed, untitled] = items
  expect(failed).toMatchObject({
    kind: 'failed',
    title: 'LinkedIn post from the webinar did not finish',
    text: 'The transcript could not be read.',
    tags: [{ text: 'Failed', tone: 'bad' }, { text: 'Content Transformation' }, { day: B().content_requests[0].created_at }],
    approve: false,
    review: { kind: 'link', href: LEGACY + '/content-transformation', out: true },
  })
  expect([untitled.title, untitled.text]).toEqual(['A content request did not finish', 'Open it to see why and try again.'])
  // a brief's Review opens the briefs page, which is still in the current dashboard
  expect(items[2].review).toEqual({ kind: 'link', href: LEGACY + '/briefs', out: true, label: undefined })
})

test('part B: the ad images of the three newest campaigns that nobody has approved or turned down', () => {
  const ads = approvalItems(inputB()).filter((x) => x.kind === 'ad')
  expect(ads.map((x) => x.title)).toEqual(['Ad 2 · Onboarding Audit', 'Ad 3 · Onboarding Audit', 'Ad 1 · Campaign', 'Ad 2 · Campaign'])
  // the campaign's hook for that image, else the image's label
  expect(ads.map((x) => x.text)).toEqual(['Your first workflow, automated', 'Calm photo', 'Onboarding in days, not weeks', 'Minimal headline'])
  expect(ads[0]).toMatchObject({
    icon: 'megaphone',
    img: IMG + file(RUN1, 'b'),
    approve: true,
    review: { kind: 'link', href: LEGACY + '/marketing-generation', out: true },
    tags: [{ text: 'Ad' }, { day: B().campaigns[1].created_at, before: 'Campaign of ' }, { text: '1 of 3 approved' }],
  })
  expect(ads[2].tags[2]).toEqual({ text: '0 of 2 approved' })
  // a picture that is not a web address is not shown
  expect(ads[3].img).toBeUndefined()
  // one turned down and then undone waits again; one approved does not; a fourth campaign is not read
  const decided = { ...inputB().adDecisions, [file(RUN1, 'b')]: 'rejected', [file(RUN1, 'c')]: 'approved' }
  const none = approvalItems(inputB({ adDecisions: decided })).filter((x) => x.kind === 'ad')
  expect(none.map((x) => x.key)).toEqual([`ad:${RUN2}:${file(RUN2, 'a')}`, `ad:${RUN2}:${file(RUN2, 'b')}`])
  expect(keys(approvalItems(inputB()))).not.toContain(`ad:${RUN4}:${file(RUN4, 'a')}`)
  expect([hookText('Plain'), hookText({ hook: 'A' }), hookText({ text: 'B' }), hookText({ line: 'C' }), hookText(null)]).toEqual(['Plain', 'A', 'B', 'C', ''])
})

test('part B: content drafts not marked ready, opened on their own page to check and approve', () => {
  const drafts = approvalItems(inputB()).filter((x) => x.kind === 'draft')
  expect(drafts.map((x) => [x.title, x.tags[1]])).toEqual([
    ['Why onboarding stalls', { text: 'Thought leadership' }],
    ['Content draft', { text: 'Content' }],
  ])
  expect(drafts[0].text).toBe('Most firms lose a week to onboarding.')
  expect(drafts[1].text.length).toBeLessThanOrEqual(200)
  expect(drafts[1].text.endsWith('…')).toBe(true)
  expect(drafts[0]).toMatchObject({ approve: false, review: { kind: 'link', href: LEGACY + '/content-transformation', label: 'Check and approve', out: true } })
  expect(draftTitle({ id: 'x', title: '', created_at: '', data: { title: 'draft title' } })).toBe('Content draft')
  expect(draftTitle({ id: 'x', title: 'Row title', created_at: '', data: {} })).toBe('Row title')

  // the tabs and Today's chips count them all
  const items = approvalItems(inputB())
  expect(tabs(viewOf(items, {}, 'all', PAGE))).toEqual(['All 16', 'Briefs 2', 'Ads 4', 'Drafts 2', 'Replies 6', 'Failed 2'])
  expect(waitingChips(items, {}).map((c) => c.label)).toEqual(['2 briefs', '4 ads', '2 drafts', '6 replies', '2 failed requests'])
})

test('part B: the key an ad image’s approval takes', () => {
  expect(parseKey(`ad:${RUN1}:${file(RUN1, 'b')}`)).toEqual({ kind: 'ad', runId: RUN1, file: file(RUN1, 'b') })
  expect(parseKey('ad:run_1:folder/a:b.png')).toEqual({ kind: 'ad', runId: 'run_1', file: 'folder/a:b.png' })
  for (const bad of ['ad::a.png', 'ad:run_1:', 'ad:run 1:a.png', 'ad:run_1:a b.png', 'ad:run_1:<x>.png', 'ad:' + 'r'.repeat(121) + ':a.png']) {
    expect(parseKey(bad)).toBeNull()
  }
})
