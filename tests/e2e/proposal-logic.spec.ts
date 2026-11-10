import { expect, test } from '@playwright/test'
import {
  barPath, chartKey, chartText, checkCharts, fmtNum, hex, inkOf, layoutChart, placeCharts, rangeText,
} from '../../src/lib/catalyst/charts'
import {
  applyEdits, brandOf, brandVars, chartsBySection, docMd, fontLinks, fontStack, inline, logoOf, mdBlocks, mdToDoc, pendingProposal, proposalDoc,
  proposalRunsFrom, srcLabels, usesSummary,
} from '../../src/lib/catalyst/proposal'

// Part 4's rules, checked without a browser: the charts a document carries and how they are laid out, and the client
// proposal's saved document, markdown, brand, chips, edits and runs (the current dashboard's v132 and v138).

const tl = (items: unknown[], extra: Record<string, unknown> = {}) => ({ type: 'timeline', title: 'The first weeks', after: 'Plan', unit: 'week', items, ...extra })

test('charts are checked again: two at most, two to twelve items each, numbers that make sense', () => {
  const list = checkCharts([
    tl([{ label: 'Kickoff', start: 1, end: 2 }, { label: '  Build   it ', start: '3', end: '6' }, { label: '', start: 1, end: 2 }, { label: 'Late', start: 2, end: 600 }]),
    { type: 'bars', title: 'Hours', unit: ' hrs ', items: [{ label: 'Saved', value: 1250 }, { label: 'Now', value: '400' }, { label: 'Bad', value: -1 }, { label: 'NaN', value: 'x' }] },
    { type: 'bars', items: [{ label: 'Third', value: 1 }, { label: 'Chart', value: 2 }] },
  ])
  expect(list).toHaveLength(2)
  expect(list[0]).toMatchObject({ type: 'timeline', unit: 'week', items: [{ label: 'Kickoff', start: 1, end: 2 }, { label: 'Build it', start: 3, end: 6 }] })
  expect(list[1]).toMatchObject({ type: 'bars', unit: 'hrs', items: [{ label: 'Saved', value: 1250 }, { label: 'Now', value: 400 }] })
  // the first two are taken before their items are checked: a chart with one good item is dropped, the third never counts
  expect(checkCharts([tl([{ label: 'Only', start: 1, end: 2 }]), { type: 'pie', items: [] }, tl([{ label: 'A', start: 1, end: 1 }, { label: 'B', start: 2, end: 2 }])])).toHaveLength(1)
  expect(checkCharts('not a list')).toEqual([])
  expect(checkCharts([tl([{ label: 'Back', start: 3, end: 2 }, { label: 'Neg', start: -1, end: 2 }])])).toEqual([])
})

test('a chart names its section loosely; a brand color draws marks only when it stands out on white', () => {
  expect(chartKey('  The First—Weeks! ')).toBe('the first weeks')
  expect(hex('1c2647')).toBe('#1C2647')
  expect(hex('#fff')).toBe('')
  expect(inkOf('#1C2647', 'X')).toBe('#1C2647')
  expect(inkOf('#F4E9C8', 'X')).toBe('X')
  expect(inkOf('nope', 'X')).toBe('X')
  expect(fmtNum(1250.555)).toBe('1,250.56')
  expect(rangeText({ unit: 'week' }, { label: 'a', start: 3, end: 3 })).toBe('Week 3')
  expect(rangeText({ unit: 'weeks' }, { label: 'a', start: 1, end: 2 })).toBe('Weeks 1 to 2')
  expect(rangeText({ unit: '' }, { label: 'a', start: 1, end: 2 })).toBe('1 to 2')
})

test('a chart as one line of the markdown, as the proposal workflow writes it', () => {
  const [t, b] = checkCharts([
    tl([{ label: 'Kickoff', start: 1, end: 2 }, { label: 'Review', start: 4, end: 4 }]),
    { type: 'bars', title: '', unit: 'hrs', items: [{ label: 'Saved', value: 1250 }, { label: 'Now', value: 400 }] },
  ])
  expect(chartText(t)).toBe('Chart: The first weeks. Kickoff (weeks 1 to 2); Review (weeks 4).')
  expect(chartText(b)).toBe('Chart: Chart. Saved: 1250 hrs; Now: 400 hrs.')
})

test('a timeline in whole weeks: each item covers its cells, the axis names the unit once', () => {
  const [c] = checkCharts([tl([{ label: 'Kickoff', start: 1, end: 2 }, { label: 'Build', start: 3, end: 6 }])])
  const L = layoutChart(c, '#1C2647', '#1D2433')
  const rects = L.shapes.filter((s) => s.k === 'rect')
  expect(rects).toMatchObject([
    { x: 6, y: 26, w: 196, h: 14, title: 'Kickoff: Weeks 1 to 2' },
    { x: 202, y: 70, w: 392, h: 14, title: 'Build: Weeks 3 to 6' },
  ])
  const axis = L.shapes.filter((s) => s.k === 'label' && s.anchor === 'middle').map((s) => (s.k === 'label' ? s.spans[0].text : ''))
  expect(axis).toEqual(['Week 1', '2', '3', '4', '5', '6'])
  expect(L.H).toBe(114)
  expect(L.head).toEqual(['Phase', 'Weeks'])
  expect(L.rows).toEqual([
    ['Kickoff', 'Weeks 1 to 2'],
    ['Build', 'Weeks 3 to 6'],
  ])
})

test('bars: rounded at the data end, the value after the bar, a long label on two lines', () => {
  expect(barPath(10, 20, 100, 18, 4)).toBe('M10,20H106Q110,20 110,24V34Q110,38 106,38H10Z')
  expect(barPath(10, 20, 0, 18, 4)).toBe('')
  const [c] = checkCharts([
    {
      type: 'bars', title: 'Hours a week', unit: 'hrs',
      items: [{ label: 'Hours spent on onboarding paperwork every single week', value: 1250 }, { label: 'After', value: 0 }],
    },
  ])
  const L = layoutChart(c, '#1C2647', '#1D2433')
  expect(L.shapes.filter((s) => s.k === 'bar')).toHaveLength(1)
  // the label fits on two lines, so it needs no tooltip; one cut short gets its whole label as one
  const lines = L.shapes.filter((s) => s.k === 'lines')
  expect(lines[0]).toMatchObject({ lines: ['Hours spent on onboarding', 'paperwork every single week'], title: '' })
  const [long] = checkCharts([{ type: 'bars', items: [{ label: 'Onboardingpaperworkhoursspenteverysingleweekbyadvisors', value: 3 }, { label: 'B', value: 1 }] }])
  const cut = layoutChart(long, '#1C2647', '#1D2433').shapes.find((s) => s.k === 'lines')
  expect(cut).toMatchObject({ title: 'Onboardingpaperworkhoursspenteverysingleweekbyadvisors' })
  expect(cut?.k === 'lines' && cut.lines.join('')).toBe('Onboardingpaperworkhoursspenteverysingleweekbyadvisors')
  // a second line longer than the room ends in an ellipsis
  const [over] = checkCharts([{ type: 'bars', items: [{ label: 'Ab ' + 'x'.repeat(57), value: 3 }, { label: 'B', value: 1 }] }])
  const o = layoutChart(over, '#1C2647', '#1D2433').shapes.find((s) => s.k === 'lines')
  expect(o?.k === 'lines' && o.lines[0] === 'Ab' && o.lines[1].endsWith('…')).toBe(true)
  expect(L.rows).toEqual([
    ['Hours spent on onboarding paperwork every single week', '1,250 hrs'],
    ['After', '0 hrs'],
  ])
  expect(L.head).toEqual(['Item', 'Hrs'])
})

test('meeting prep: each chart at the end of the section it names, else at the end', () => {
  const md = '# Onboarding plan\n\nIntro.\n\n## What was agreed\n- A pilot\n\n## The first weeks\n- Week 1\n\n```\n## not a heading\n```\n\n## Who does what\n- Us'
  const charts = checkCharts([
    tl([{ label: 'Setup', start: 1, end: 1 }, { label: 'Review', start: 2, end: 2 }], { after: 'the first WEEKS' }),
    { type: 'bars', after: 'Nowhere', items: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] },
  ])
  const parts = placeCharts(md, charts)
  expect(parts.map((p) => p.text.split('\n')[0])).toEqual(['# Onboarding plan', '## What was agreed', '## The first weeks', '## Who does what'])
  expect(parts[2].text).toContain('## not a heading')
  expect(parts.map((p) => p.charts.map((c) => c.type))).toEqual([[], [], ['timeline'], ['bars']])
})

const SAVED = {
  data: {
    doc: {
      title: 'Proposal for Example Ridge', subtitle: 'Scope and terms', kicker: 'Proposal and Scope of Work', client: 'Example Ridge Advisors',
      prepared_for: 'Pat Example', prepared_by: 'AI Paragon', date: 'November 6, 2026',
      sections: [
        { title: 'Where you are', body: 'Paperwork takes **most** of the week.', sources: ['call', 'assessment'] },
        { title: 'The plan', body: '1. Map intake\n2. Automate one step', sources: ['template'] },
      ],
      visuals: [tl([{ label: 'Kickoff', start: 1, end: 2 }, { label: 'Build', start: 3, end: 6 }], { after: 'The plan' })],
    },
  },
  content_md: '# Ignored',
}

test('the saved document: data.doc when it has sections, else the markdown read as one', () => {
  expect(proposalDoc(SAVED).title).toBe('Proposal for Example Ridge')
  expect(proposalDoc({ data: JSON.stringify(SAVED.data), content_md: '' }).sections).toHaveLength(2)
  const md = '# A title\nlost line\n## One\nBody one\n\n## Two\n- a\n# not a title'
  expect(mdToDoc(md)).toEqual({ title: 'A title', sections: [{ title: 'One', body: 'Body one', sources: [] }, { title: 'Two', body: '- a\n# not a title', sources: [] }] })
  expect(proposalDoc({ data: { doc: { title: 'x' } }, content_md: md }).title).toBe('A title')
})

test('the markdown kept with it: the meta line, each section, a chart under the section it names', () => {
  const doc = proposalDoc(SAVED)
  expect(docMd(doc)).toBe(
    [
      '# Proposal for Example Ridge', '', 'Scope and terms', '', 'Prepared for Pat Example · Prepared by AI Paragon · November 6, 2026', '',
      '## Where you are', '', 'Paperwork takes **most** of the week.', '', '## The plan', '', '1. Map intake\n2. Automate one step', '',
      'Chart: The first weeks. Kickoff (weeks 1 to 2); Build (weeks 3 to 6).',
    ].join('\n'),
  )
  // a chart that names no section stays out of the markdown (the page shows it under the last section)
  const lost = { ...doc, visuals: [{ ...(doc.visuals as Record<string, unknown>[])[0], after: 'Nowhere' }] }
  expect(docMd(lost)).not.toContain('Chart:')
  expect([...chartsBySection(lost).keys()]).toEqual([1])
})

test('the brand: its own, else the template’s; colors and fonts made safe for CSS', () => {
  expect(brandOf({ brand: { colors: {} } }, { colors: { primary: '#123456' } })).toEqual({ colors: { primary: '#123456' } })
  expect(brandOf({ brand: { logo_url: 'https://x/logo.png' } }, null)).toEqual({ logo_url: 'https://x/logo.png' })
  expect(brandOf({}, undefined)).toEqual({})
  expect(brandVars({ colors: { primary: '0b6e4f', text: 'nope' }, fonts: { heading: 'Montserrat', body: 'Lora"; } body{x' } })).toEqual({
    '--b1': '#0B6E4F', '--b2': '#0B6E4F', '--bt': '#1D2433', '--bs': 'rgb(231,241,237)',
    '--bh': '"Montserrat","Helvetica Neue",Arial,sans-serif', '--bb': '"Lora  bodyx",Georgia,"Times New Roman",serif',
  })
  expect(fontStack('+mn-lt', 'serif')).toBe('Georgia,"Times New Roman",serif')
  expect(fontLinks({ fonts: { heading: 'Montserrat', body: 'Georgia' } }).map((f) => f.name)).toEqual(['Montserrat'])
  expect(fontLinks({ fonts: { heading: 'Open Sans', body: 'Open Sans' } })[0].urls[0]).toBe('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap')
  expect(fontLinks({ fonts: { heading: 'Bad<Font>' } }).map((f) => f.name)).toEqual(['BadFont'])
  expect(fontLinks({ fonts: { heading: 'Font-Name', body: 'X' } })).toEqual([])
  expect(logoOf({ logo_url: 'http://x/logo.png' })).toBe('')
  expect(logoOf({ logo_url: 'https://x/logo.png' })).toBe('https://x/logo.png')
})

test('the chips above a section: known sources once each, the call named by its date, title or as the meetings', () => {
  const day = () => 'Nov 4'
  expect(srcLabels(['call', 'assessment', 'call', 'nope', 'consultation'], { date: '2026-11-04', title: 'x' }, day)).toEqual([
    'From the call on Nov 4', 'From the assessment', 'From the consultation guide',
  ])
  expect(srcLabels(['call'], { date: '', title: 'Kickoff' }, day)).toEqual(['From the call'])
  expect(srcLabels(['call', 'growth_plan'], { date: '', title: '' }, day)).toEqual(['From the meetings', 'From the proposal presentation'])
})

test('a section’s text: markers, bold and italic only; anything that looks like markup stays text', () => {
  expect(inline('Pay **[FILL IN: fee]** by *Friday* <b>x</b>')).toEqual([
    { k: 'text', text: 'Pay ' },
    { k: 'strong', kids: [{ k: 'fill', kids: [{ k: 'text', text: '[FILL IN: fee]' }] }] },
    { k: 'text', text: ' by ' },
    { k: 'em', kids: [{ k: 'text', text: 'Friday' }] },
    { k: 'text', text: ' <b>x</b>' },
  ])
  expect(inline('[to confirm] start')[0]).toEqual({ k: 'fill', kids: [{ k: 'text', text: '[to confirm]' }] })
  expect(mdBlocks('## Small heading\n* one\n- two\n\n3) first\n4. second\nline a\nline b')).toEqual([
    { k: 'h', kids: [{ k: 'text', text: 'Small heading' }] },
    { k: 'ul', items: [[{ k: 'text', text: 'one' }], [{ k: 'text', text: 'two' }]] },
    { k: 'ol', items: [[{ k: 'text', text: 'first' }], [{ k: 'text', text: 'second' }]] },
    { k: 'p', lines: [[{ k: 'text', text: 'line a' }], [{ k: 'text', text: 'line b' }]] },
  ])
})

test('edits: an empty title keeps the old one, a renamed section keeps its chart', () => {
  const before = proposalDoc(SAVED)
  const after = applyEdits(before, {
    title: '   ',
    subtitle: ' New   subtitle ',
    sections: [
      { title: 'Where you are', body: 'Changed.' },
      { title: 'The   roadmap', body: before.sections[1].body },
    ],
  })
  expect(after.title).toBe('Proposal for Example Ridge')
  expect(after.subtitle).toBe('New subtitle')
  expect(after.sections.map((s) => [s.title, s.body])).toEqual([
    ['Where you are', 'Changed.'],
    ['The roadmap', '1. Map intake\n2. Automate one step'],
  ])
  expect((after.visuals as { after: string }[])[0].after).toBe('The roadmap')
  expect(before.sections[0].body).toBe('Paperwork takes **most** of the week.')
  // no subtitle before: none after
  expect(applyEdits({ ...before, subtitle: '' }, { title: 'x', subtitle: 'y', sections: [] }).subtitle).toBe('')
  // an empty section title keeps the old one
  expect(applyEdits(before, { title: '', subtitle: null, sections: [{ title: ' ', body: 'b' }] }).sections[0].title).toBe('Where you are')
})

test('what a run reads, summed up, and a run kept for the team until its proposal lands or 15 minutes pass', () => {
  expect(usesSummary([])).toBe('Built from')
  expect(
    usesSummary([
      { ok: true, kind: 'doc', text: 'a' },
      { ok: false, kind: 'doc', text: 'b' },
      { ok: true, kind: 'call', text: 'c' },
      { ok: true, kind: 'mail', text: 'd' },
      { ok: true, kind: 'mail', text: 'and 2 more', more: 2 },
    ]),
  ).toBe('Using 1 past document, the call transcript and 3 emails')
  expect(usesSummary([{ ok: true, kind: 'call', text: 'c' }, { ok: true, kind: 'call', text: 'd' }])).toBe('Using 2 call transcripts')
  const t0 = '2026-11-10T10:00:00.000Z'
  const runs = proposalRunsFrom({ 'Pat.Example@example.com': { t0, by: 'qa', uses: [{ ok: true, kind: 'doc', text: 'a' }] }, bad: { t0: 'never' } })
  expect(Object.keys(runs)).toEqual(['pat.example@example.com'])
  const at = Date.parse(t0)
  expect(pendingProposal(runs, ['pat.example@example.com'], null, at + 60_000)).toMatchObject({ t0, by: 'qa' })
  expect(pendingProposal(runs, ['PAT.EXAMPLE@example.com'], '2026-11-10T09:59:57.000Z', at + 60_000)).toBeNull()
  expect(pendingProposal(runs, ['pat.example@example.com'], '2026-11-10T09:59:50.000Z', at + 60_000)).not.toBeNull()
  expect(pendingProposal(runs, ['pat.example@example.com'], null, at + 16 * 60_000)).toBeNull()
  expect(pendingProposal(runs, ['someone@example.com'], null, at)).toBeNull()
})
