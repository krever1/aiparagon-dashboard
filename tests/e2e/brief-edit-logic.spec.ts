import { expect, test } from '@playwright/test'
import {
  type AdsDoc, type OrgDoc, adsRows, cbOf, devIdx, devTidy, mdDrop, mdTidy, orgDataOf, orgRows, reviewNew, rowDel, rowEdit, secDel, shiftBlocks, snapOf, sumOf, tlIdx,
  tlLine,
} from '../../src/lib/pipeline/brief-edit'
import { cleanLayout, devsOf, layoutOf, shiftsOf } from '../../src/lib/pipeline/briefs'
import { tldr } from '../../src/lib/touchpoint/approvals'
import { ORG_MD, POST } from './briefs-fixtures'

// The brief editor's rules and the team layout's, without a browser: what removing or editing a row or a section does
// to an organic brief's markdown, data and snapshot and to an ads brief's fields, the change summary, the saved review,
// and a layout as it is saved.

const org = (o: Partial<OrgDoc> = {}): OrgDoc => ({
  md: ORG_MD,
  data: { items: [{ url: POST(1) }, { url: POST(9) }], high_value_items: [{ url: POST(1) }], keep: 10, topic_watch: { security: [{ url: POST(1) }, { url: POST(3) }] }, review: { by: 'x' } },
  snap: { items: [{ text: 'Proof first', why: 'Results drew replies', tag: 'Hook' }, { text: 'Fees', why: 'Asked first', tag: 'Theme' }], at: 'keep me' },
  rev: { hidden: [], removed: [] },
  ...o,
})

test('the markdown: a section taken out, the short version, shifts and developments as the page reads them', () => {
  expect(mdDrop(ORG_MD, 3)).not.toContain('## 3.')
  expect(mdDrop(ORG_MD, 3)).toContain('## 4. Notable developments')
  expect(mdDrop('a\n## 9. Nothing\n', 2)).toBe('a\n## 9. Nothing\n')
  expect(mdTidy('a\n\n\n\nb\n---\n\n---\nc')).toBe('a\n\nb\n---\n\nc')
  // the TL;DR's two lines; a line written again keeps its bullet
  expect(tlIdx(ORG_MD).map((i) => ORG_MD.split('\n')[i])).toEqual([
    '- **Proof beats promises:** Advisors ask for evidence of results before they book a call.',
    '- **Onboarding in days:** Firms now promise client onboarding in days, not weeks.',
  ])
  expect(tlLine('  * **[Old](https://x.example.com/a)**: was', 'New [lead]', 'New **text**')).toBe('  * **[New lead](https://x.example.com/a)**: New text')
  expect(tlLine('- old', '', 'Only text')).toBe('- Only text')
  // the two shift blocks map onto the two shifts; the developments onto their lines
  expect(shiftBlocks(ORG_MD)).toHaveLength(2)
  expect(devIdx(ORG_MD)).toHaveLength(devsOf(ORG_MD).length)
  // a group heading with nothing under it goes
  const lines = ORG_MD.split('\n')
  const second = devIdx(ORG_MD)[1]
  expect(devTidy(lines.filter((_, i) => i !== second).join('\n'))).not.toContain('**Product news**')
})

test('an organic brief: its rows, then removing and editing them', () => {
  const doc = org({ data: orgDataOf(org().data) })
  expect(doc.data.review).toBeUndefined()
  expect(orgRows(doc, 'five').map((r) => r.h)).toEqual(['Proof first', 'Fees'])
  expect(orgRows(doc, 'short').map((r) => r.h)).toEqual(['Proof beats promises', 'Onboarding in days'])
  expect(orgRows(doc, 'shift').map((r) => [r.h, r.meta])).toEqual([
    ['From promises to proof', 'Northwind Advisors'],
    ['Onboarding speed is the new differentiator', 'Example Ridge Advisors'],
  ])
  expect(orgRows(doc, 'dev').map((r) => r.h)).toEqual(['A governance checklist', 'New AI notetaker'])

  // a short version line edited, then the last ones removed: the section goes
  let c = rowEdit('org', doc, 'short', 0, orgRows(doc, 'short')[0], { h: 'Proof wins', t: 'Results first.' })
  let d = c.doc as OrgDoc
  expect(tldr(d.md)[0]).toEqual({ title: 'Proof wins', text: 'Results first.' })
  expect(c.log).toEqual({ v: 'edited', w: 'line', n: '' })
  // unchanged closes the form; all empty is refused
  expect(rowEdit('org', d, 'short', 0, orgRows(d, 'short')[0], { h: 'Proof wins', t: 'Results first.' }).same).toBe(true)
  expect(rowEdit('org', d, 'short', 0, orgRows(d, 'short')[0], { h: ' ', t: '' }).err).toBe('That would leave it empty. Remove it instead.')
  d = rowDel('org', d, 'short', 0).doc as OrgDoc
  d = rowDel('org', d, 'short', 0).doc as OrgDoc
  expect(d.md).not.toContain('## 1.')
  expect(d.rev.hidden).toEqual(['short'])

  // a shift written again reads back as written; another removed
  c = rowEdit('org', doc, 'shift', 0, orgRows(doc, 'shift')[0], { h: 'Proof over promises', obs: 'Results drew replies.', interp: 'Lead with results.', use: 'One result a post.' })
  d = c.doc as OrgDoc
  expect(shiftsOf(d.md, {})[0]).toEqual({
    title: 'Proof over promises',
    interp: 'Lead with results.',
    obs: 'Results drew replies.',
    who: 'Northwind Advisors',
    url: POST(1),
    use: 'One result a post.',
  })
  d = rowDel('org', d, 'shift', 1).doc as OrgDoc
  expect(shiftsOf(d.md, {}).map((s) => s.title)).toEqual(['Proof over promises'])

  // a development edited keeps its link; the five things edited keep the snapshot's other fields
  d = rowEdit('org', doc, 'dev', 1, orgRows(doc, 'dev')[1], { h: 'A notetaker', t: 'Built for advisors.', why: '' }).doc as OrgDoc
  expect(devsOf(d.md)[1]).toMatchObject({ title: 'A notetaker', who: 'Fabrikam Insights', url: 'https://example.com/notetaker', text: 'Built for advisors.', why: '' })
  d = rowEdit('org', doc, 'five', 1, orgRows(doc, 'five')[1], { h: 'Fees first', t: 'Clients ask', tag: '' }).doc as OrgDoc
  expect(d.snap).toEqual({ items: [{ text: 'Proof first', why: 'Results drew replies', tag: 'Hook' }, { text: 'Fees first', why: 'Clients ask', tag: 'Theme' }], at: 'keep me' })
  // the last finding removed: the section is taken out too, so the TL;DR does not come back in its place
  d = rowDel('org', rowDel('org', doc, 'five', 0).doc, 'five', 0).doc as OrgDoc
  expect(d.snap?.items).toEqual([])
  expect(d.rev.hidden).toEqual(['five'])

  // a post removed: out of the lists, recounted, out of the topic watch and the developments, flagged where quoted
  d = rowDel('org', doc, 'post', 0, POST(1)).doc as OrgDoc
  expect(d.data.items).toEqual([{ url: POST(9) }])
  expect(d.data.high_value_items).toEqual([])
  expect(d.data.n_kept).toBe(1)
  expect(d.data.topic_watch).toEqual({ security: [{ url: POST(3) }] })
  expect(d.rev.removed).toEqual([POST(1)])
  expect(orgRows(d, 'shift')[0].flag).toBe(true)
  const third = rowDel('org', doc, 'post', 0, POST(3)).doc as OrgDoc
  expect(devsOf(third.md).map((x) => x.title)).toEqual(['New AI notetaker'])
  expect(third.md).not.toContain('**Thought leadership**')
  // the brief before any of it is as it was
  expect(doc.md).toBe(ORG_MD)
})

test('an organic brief: sections taken out', () => {
  const doc = org({ data: orgDataOf(org().data) })
  let d = secDel('org', doc, 'shift').doc as OrgDoc
  expect(d.md).not.toContain('## 3.')
  expect(d.data.sophistication_shifts).toEqual([])
  expect(d.rev.hidden).toEqual(['shift'])
  d = secDel('org', d, 'themes').doc as OrgDoc
  expect(d.data.topic_watch).toEqual({})
  expect(d.md).not.toContain('## 5.')
  d = secDel('org', d, 'hand').doc as OrgDoc
  expect(d.rev.hidden).toEqual(['shift', 'themes', 'hand'])
  // the evidence stays
  expect(secDel('org', doc, 'post').doc).toBe(doc)
  expect(secDel('org', doc, 'five').doc).toMatchObject({ snap: { items: [], at: 'keep me' }, rev: { hidden: ['five'] } })
})

test('an ads brief: its rows, then removing and editing them; the last hook stays', () => {
  const doc: AdsDoc = {
    cb: cbOf({
      differentiation_angle: 'Proof you can check',
      winning_hooks: JSON.stringify(['Your week back', { pattern: 'Proof first', text: 'Proof first' }]),
      copy_formula: 'Problem -> Proof -> Offer',
      winning_offers: [{ type: 'Free review', price_point: '0', notes: 'A call' }, 'Paid audit'],
      core_pain_points: ['Paperwork'],
      objection_themes: ['AI mistakes'],
      cross_niche_sources: [{ niche: 'Dental', pattern: 'Before and after' }],
      source_ad_ids: ['a1', 'a2'],
    }),
    snap: snapOf(JSON.stringify({ items: [{ text: 'Proof', why: '', tag: 'Hook' }] })),
    rev: { hidden: [], removed: [] },
  }
  expect(adsRows(doc, 'hook').map((r) => r.t)).toEqual(['Your week back', 'Proof first'])
  expect(adsRows(doc, 'formula')[0].t).toBe('Problem → Proof → Offer')
  expect(adsRows(doc, 'offer').map((r) => [r.h, r.meta])).toEqual([
    ['Free review', 'Price shown: 0'],
    ['Paid audit', ''],
  ])
  expect(adsRows(doc, 'cross')[0].t).toBe('Dental · Before and after')
  const ads = [
    { key: 'a1', adv: 'Northwind', hook: 'Proof', days: 30, status: 'Still running', target: 'a1' },
    { key: 'a2', adv: '', hook: 'Week', days: null, status: '', target: 'a2' },
  ]
  expect(adsRows(doc, 'ad', ads).map((r) => r.h)).toEqual(['P1 · Northwind', 'P2 · Advertiser'])

  let d = rowEdit('ads', doc, 'hook', 1, adsRows(doc, 'hook')[1], { t: 'Proof in a week' }).doc as AdsDoc
  expect(d.cb.winning_hooks).toEqual(['Your week back', { pattern: 'Proof in a week', text: 'Proof in a week', hook: 'Proof in a week' }])
  d = rowEdit('ads', d, 'offer', 1, adsRows(d, 'offer')[1], { h: 'Paid audit', price: '', t: 'Two hours' }).doc as AdsDoc
  expect(d.cb.winning_offers).toEqual([{ type: 'Free review', price_point: '0', notes: 'A call' }, { type: 'Paid audit', price_point: null, notes: 'Two hours' }])
  d = rowDel('ads', d, 'hook', 0).doc as AdsDoc
  expect(rowDel('ads', d, 'hook', 0).err).toBe('Keep at least one hook. Every ad opens with one.')
  d = rowDel('ads', d, 'ad', 0, 'a1').doc as AdsDoc
  expect(d.cb.source_ad_ids).toEqual(['a2'])
  expect(adsRows(d, 'ad', ads).map((r) => r.h)).toEqual(['P1 · Advertiser'])
  d = secDel('ads', d, 'pain').doc as AdsDoc
  expect([d.cb.core_pain_points, d.cb.objection_themes, d.rev.hidden]).toEqual([[], [], ['pain']])
  // the creative structure stays
  expect(secDel('ads', d, 'arch').doc).toBe(d)
  expect(doc.cb.winning_hooks).toEqual(['Your week back', { pattern: 'Proof first', text: 'Proof first' }])
})

test('the change summary, the saved review, and a layout as it is saved', () => {
  expect(
    sumOf([
      { v: 'removed', w: 'post', n: '' },
      { v: 'removed', w: 'post', n: '' },
      { v: 'removed', w: 'shift', n: '' },
      { v: 'removed', w: 'section', n: 'Notable developments' },
      { v: 'removed', w: 'section', n: 'What changed' },
      { v: 'edited', w: 'finding', n: '' },
      { v: 'edited', w: 'angle', n: '' },
    ]),
  ).toBe('Removed 2 posts and 1 shift. Took out Notable developments and What changed. Edited 1 finding and the short version.')
  const first = reviewNew({ by: 'a@x', at: 't1', changes: 'Removed 1 post.', note: '', rev: { hidden: [], removed: ['u'] }, prev: {}, original: { content_md: 'agent' } })
  expect(first).toEqual({ by: 'a@x', at: 't1', changes: 'Removed 1 post.', note: '', hidden: [], removed: ['u'], original: { content_md: 'agent' }, history: [{ by: 'a@x', at: 't1', changes: 'Removed 1 post.' }] })
  // a later edit keeps the agent's version from the first
  const again = reviewNew({ by: 'b@x', at: 't2', changes: 'Edited 1 finding.', note: 'n', rev: { hidden: ['hand'], removed: [] }, prev: first, original: { content_md: 'edited' } })
  expect(again.original).toEqual({ content_md: 'agent' })
  expect(again.history).toHaveLength(2)

  const saved = cleanLayout('org', { order: ['review', 'hand', 'five', 'nope', 'shift', 'x_reg'], off: ['ev', 'hand', 'x_reg'], opt: { five: { n: '4', why: 'nope' }, ev: { n: 'all' }, nope: { n: '1' } } })
  expect(saved).toEqual({
    order: ['rec', 'five', 'hand', 'shift', 'x_reg', 'short', 'dev', 'themes', 'ev', 'review'],
    off: ['hand', 'x_reg'],
    opt: { five: { n: '4' }, ev: { n: 'all' } },
  })
  expect(layoutOf({ org: saved }, 'org')).toEqual({ ...saved, opt: { five: { n: '4' }, ev: { n: 'all' } } })
})
