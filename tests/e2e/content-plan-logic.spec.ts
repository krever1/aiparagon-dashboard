import { expect, test } from '@playwright/test'
import { type Ctx, type Form, baseParts, blankForm, buildRequest, formFrom, offerOf, personaOf, planKeyOf, previewOf, tplOf } from '../../src/lib/pipeline/content-new'
import {
  addStep, builtinSteps, isTplKey, moveStep, planFrom, planKey, planSections, removeStep, samePlan, savedPlan, setStep, stepSum, teamSteps,
} from '../../src/lib/pipeline/content-plan'
import { FM, formRows } from './content-fixtures'

// New draft's plan, without a browser: its key, the parts it starts from (the template's, or a paid ad's own shape),
// the team's default, the edits, what is saved for the team and what is sent. The fixtures are made up.

const R = formRows()
const ctx = (o: Partial<Ctx> = {}): Ctx => ({
  email: 'qa.teammate@aiparagonconsulting.com',
  personas: R.client_personas.filter((p) => !p.archived).map(personaOf),
  offers: R.offers.map(offerOf),
  templates: R.doc_templates.filter((t) => t.active).map(tplOf),
  voice: null,
  leaveOut: [],
  asks: [],
  now: Date.parse('2026-11-12T12:00:00Z'),
  ...o,
})
const TEXT = 'Most firms lose a week to onboarding. '.repeat(10).trim()
const form = (o: Partial<Form> = {}): Form => ({ ...blankForm(), src: 'paste', text: TEXT, ...o })
type Row = Record<string, unknown>
const sent = (f: Form) => {
  const b = buildRequest(f, ctx())
  if (!b.ok) throw new Error(b.error)
  return (b.row.template as Row).sections
}

test('the key: the kind of post, a paid ad’s shape, and a structure picked', () => {
  expect(planKey('thought_leadership', 'thought_leadership', 'opinion', '')).toBe('piece:thought_leadership')
  expect(planKey('thought_leadership', 'social_proof', 'case_studies', 'builtin:story')).toBe('piece:social_proof:tpl:builtin:story')
  expect(planKey('adcopy', 'ad', 'ad_image', '')).toBe('piece:ad')
  expect(planKey('adcopy', 'ad', 'ad_text', '')).toBe('piece:ad')
  expect(planKey('adcopy', 'ad', 'ad_carousel', '')).toBe('piece:ad_carousel')
  expect(isTplKey('piece:ad:tpl:ad:pain')).toBe(true)
  expect(isTplKey('piece:ad')).toBe(false)
  expect(planKeyOf(form(), ctx())).toBe('piece:thought_leadership')
  expect(planKeyOf(form({ kind: 'newsletter', cat: { newsletter: 'articles' } }), ctx())).toBe('piece:article')
  // a structure the kind no longer offers is not part of the key
  expect(planKeyOf(form({ struct: FM.story }), ctx())).toBe('piece:thought_leadership:tpl:' + FM.story)
  expect(planKeyOf(form({ kind: 'adcopy', struct: FM.story }), ctx())).toBe('piece:ad')
})

test('the parts it starts from: the kind’s shape, a structure picked, a saved template, a paid ad’s own shape', () => {
  expect(baseParts(form(), ctx()).sections.map((s) => s.title)).toEqual(['The common belief', 'What we see', 'Why it matters'])
  expect(baseParts(form({ struct: 'builtin:steps' }), ctx()).sections.map((s) => s.title)).toEqual(['Why it matters', 'The steps', 'Where to start'])
  const t = baseParts(form({ struct: FM.story }), ctx())
  expect(t.template).toBe('Client story')
  expect(t.sections.length).toBeGreaterThan(0)
  expect(baseParts(form({ kind: 'adcopy' }), ctx()).sections.map((s) => s.title)).toEqual(['Follow the ads brief'])
  expect(baseParts(form({ kind: 'adcopy', cat: { adcopy: 'ad_carousel' } }), ctx()).sections.map((s) => s.title)).toEqual([
    'Slide 1: the hook',
    'Slides 2 to 5: the points',
    'Last slide: the ask',
  ])
  const steps = builtinSteps([
    { title: 'One', guidance: 'First.' },
    { title: '  ', guidance: 'No title.' },
    { title: 'Three', guidance: '' },
  ])
  expect(steps).toEqual([
    { key: 'part_1', name: 'One', note: 'First.', added: false },
    { key: 'part_3', name: 'Three', note: '', added: false },
  ])
})

test('the team’s default: kept by key, never for a structure picked, read the way the current dashboard saves it', () => {
  const plans = {
    'piece:thought_leadership': { steps: [{ key: 'part_1', kind: 'part', name: 'Hook', does: '', note: 'One line.', q: [], added: false }], by: 'sam@aiparagonconsulting.com', at: '2026-11-01' },
    'piece:ad': { steps: [] },
  }
  expect(teamSteps(plans, 'piece:thought_leadership')).toEqual({
    steps: [{ key: 'part_1', name: 'Hook', note: 'One line.', added: false }],
    by: 'sam@aiparagonconsulting.com',
    at: '2026-11-01',
  })
  expect(teamSteps(plans, 'piece:ad')).toBeNull()
  expect(teamSteps(plans, 'piece:thought_leadership:tpl:builtin:story')).toBeNull()
  expect(teamSteps(null, 'piece:email')).toBeNull()
  expect(savedPlan([{ key: 'part_4', name: 'Close', note: 'Ask once.', added: true }], 'qa@x', 'now')).toEqual({
    steps: [{ key: 'part_4', kind: 'part', name: 'Close', does: '', note: 'Ask once.', q: [], added: true }],
    by: 'qa@x',
    at: 'now',
  })
})

test('the edits: add, move, remove, rename, and what changed', () => {
  let s = builtinSteps([
    { title: 'A', guidance: '' },
    { title: 'B', guidance: 'b' },
  ])
  const base = s
  s = addStep(s)
  expect(s[2]).toEqual({ key: 'part_3', name: 'New part', note: '', added: true })
  expect(addStep(removeStep(s, 0))[2].key).toBe('part_4')
  s = moveStep(s, 2, -1)
  expect(s.map((x) => x.name)).toEqual(['A', 'New part', 'B'])
  expect(moveStep(s, 0, -1)).toBe(s)
  expect(moveStep(s, 2, 1)).toBe(s)
  s = setStep(s, 1, { name: 'Middle'.padEnd(100, '!'), note: 'n' })
  expect(s[1].name).toHaveLength(80)
  expect(samePlan(base, base.map((x) => ({ ...x })))).toBe(true)
  expect(samePlan(base, s)).toBe(false)
  expect(samePlan(base, setStep(base, 0, { note: 'x' }))).toBe(false)
  let many = base
  for (let i = 0; i < 20; i++) many = addStep(many)
  expect(many).toHaveLength(12)
  expect(stepSum({ key: 'k', name: 'n', note: '', added: false })).toBe('Nothing set for this part yet')
  expect(stepSum({ key: 'k', name: 'n', note: 'word '.repeat(30), added: false }).endsWith('…')).toBe(true)
})

test('what is sent: the plan’s parts are the template’s sections, for the kind and structure it was made for', () => {
  const steps = [
    { key: 'part_1', name: '  The hook  ', note: '  One line.  ', added: false },
    { key: 'part_2', name: '', note: 'untitled', added: false },
    { key: 'part_3', name: 'The close', note: 'x'.repeat(700), added: true },
  ]
  expect(planSections(steps)).toEqual([
    { title: 'The hook', guidance: 'One line.' },
    { title: 'The close', guidance: 'x'.repeat(400) },
  ])
  expect(sent(form({ plan: { key: 'piece:thought_leadership', steps } }))).toEqual(planSections(steps))
  // a plan for another kind, or none, leaves the template's own parts
  expect(sent(form({ plan: { key: 'piece:email', steps } })) as Row[]).toHaveLength(3)
  expect((sent(form()) as Row[]).map((s) => s.title)).toEqual(['The common belief', 'What we see', 'Why it matters'])
  // every part taken out: no parts, as the plan said
  expect(sent(form({ plan: { key: 'piece:thought_leadership', steps: [] } }))).toEqual([])
  // a carousel ad sends the plan too (the old page put its own shape over the plan)
  const car = form({ kind: 'adcopy', cat: { adcopy: 'ad_carousel' }, plan: { key: 'piece:ad_carousel', steps: steps.slice(0, 1) } })
  expect(sent(car)).toEqual([{ title: 'The hook', guidance: 'One line.' }])
  // the browser's plan is checked
  expect(formFrom({ plan: { key: 'piece:thought_leadership', steps: Array(20).fill({ name: 'x' }) } }).plan?.steps).toHaveLength(12)
  expect(formFrom({ plan: { key: 'drop table', steps: [] } }).plan).toBeNull()
  expect(planFrom({ key: 'piece:ad:tpl:ad:pain', steps: [{ key: 'part_1', name: 'A', note: 'b' }] })).toEqual({
    key: 'piece:ad:tpl:ad:pain',
    steps: [{ key: 'part_1', name: 'A', note: 'b', added: false }],
  })
  // the preview shows what is sent
  const pv = previewOf(form({ plan: { key: 'piece:thought_leadership', steps } }), { ...ctx(), org: { use: null, newest: null }, ads: { use: null, newest: null }, orgItems: [] }, (x) => x)
  expect('sections' in pv.structure && pv.structure.sections.map((s) => s.title)).toEqual(['The hook', 'The close'])
  const none = previewOf(form({ plan: { key: 'piece:thought_leadership', steps: [] } }), { ...ctx(), org: { use: null, newest: null }, ads: { use: null, newest: null }, orgItems: [] }, (x) => x)
  expect(none.structure).toEqual({ none: 'No set parts. The writer picks a shape from your answers.' })
})
