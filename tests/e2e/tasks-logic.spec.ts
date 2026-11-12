import { expect, test } from '@playwright/test'
import { fathomCalls } from '../stub/fixtures.mjs'
import { type CallMeta, type CallOutput, catButtons, catButtonsOf, folderOf, normCall, normMeta, normOutput, peopleOf } from '../../src/lib/catalyst/calls'
import { TASK_CARDS_MAX, openOf, shownCat, taskButtons, taskCards, taskFolders } from '../../src/lib/catalyst/tasks'
import { TASK_LEADS, TASK_METAS, TASK_OUTPUTS } from './tasks-fixtures'

// Tasks' rules, checked without a browser: which calls show, in what order, under which button and folder. The rows
// are made up (tests/e2e/tasks-fixtures.ts); Fathom's list is the stand-in's.

const FC = () => fathomCalls().map(normCall)
const outputs = (rows: Record<string, unknown>[] = TASK_OUTPUTS): Record<string, CallOutput> =>
  Object.fromEntries(rows.map((r) => normOutput(r)).map((o) => [o.call_id, o]))
const metas = (): Record<string, CallMeta> => Object.fromEntries(TASK_METAS.map((r) => normMeta(r)).map((m) => [m.call_id, m]))
const cards = (calls = FC()) => taskCards(outputs(), metas(), calls, TASK_LEADS)
const labels = (b: { label: string; n: number }[]) => b.map((x) => `${x.label} ${x.n}`)

test('the to-dos: written calls with next steps, open ones first, then the newest, 40 at most', () => {
  const c = cards()
  expect(c.map((x) => x.id)).toEqual(['9001', '7002', '7001', '9003', '7003', '9004'])
  expect(c.map((x) => x.title)).toEqual(['Discovery consultation with Robin', 'Demo for Acme', 'Partner sync', 'Team sync', 'Call', 'Catch-up with Pat'])
  expect(c.map((x) => openOf(x.out.tasks))).toEqual([1, 1, 1, 2, 1, 0])
  // a title the team saved wins
  const named = taskCards(outputs(), { ...metas(), '7003': normMeta({ call_id: '7003', title: 'Retro' }) }, FC(), TASK_LEADS)
  expect(named.find((x) => x.id === '7003')!.title).toBe('Retro')

  const many = Array.from({ length: 45 }, (_, i) => ({
    id: 'o' + i, call_id: 'c' + i, status: 'done', created_at: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`,
    tasks: [{ id: 't', text: 'x', done: i % 2 === 0 }],
  }))
  const capped = taskCards(outputs(many), {}, [], [])
  expect(capped).toHaveLength(TASK_CARDS_MAX)
  // every call with something open comes before the ones that are done
  const firstDone = capped.findIndex((x) => openOf(x.out.tasks) === 0)
  expect(capped.slice(firstDone).every((x) => openOf(x.out.tasks) === 0)).toBe(true)
})

test('the type buttons, in the current dashboard’s order', () => {
  expect(labels(taskButtons(cards()))).toEqual(['All 6', 'Client demos 1', 'Sales 1', 'Client work 1', 'Internal development 0', 'Internal meetings 2', 'Other 1'])
  // the same order on Calls, where Client work used to come after Internal development
  expect(catButtonsOf(['internal', 'client', 'demo', 'x:Podcast', 'none', 'other', 'x:Advisory board']).map((b) => b.label)).toEqual([
    'All', 'Client demos', 'Sales', 'Client work', 'Internal development', 'Internal meetings', 'Advisory board', 'Podcast', 'Other', 'No type yet',
  ])
  expect(catButtons([], 'all')).toEqual([
    { key: '', label: 'All', n: 0 },
    { key: 'demo', label: 'Client demos', n: 0 },
    { key: 'sales', label: 'Sales', n: 0 },
    { key: 'dev', label: 'Internal development', n: 0 },
  ])
})

test('a picked kind with nothing in it shows everything again, unless it is one of Erica’s three', () => {
  const c = cards()
  expect(shownCat(c, '')).toBe('')
  expect(shownCat(c, 'other')).toBe('other')
  expect(shownCat(c, 'dev')).toBe('dev')
  expect(shownCat(c, 'none')).toBe('')
  expect(shownCat(c, 'x:Podcast')).toBe('')
})

test('client folders, newest call first, with and without Fathom', () => {
  const view = (cs: ReturnType<typeof cards>) => taskFolders(cs).map((f) => f.folder + ':' + f.cards.map((x) => x.id).join(','))
  expect(view(cards())).toEqual([
    'Sample Peak Partners:9001',
    'Acme Wealth:7002',
    'Example Ridge Advisors:9004',
    'Partners:7001',
    'AI Paragon (internal):9003,7003',
  ])
  // without Fathom: no people, no leads; a client call with no client known is No client yet
  expect(view(cards([]))).toEqual(['No client yet:9001,9004', 'Acme Wealth:7002', 'Partners:7001', 'AI Paragon (internal):9003,7003'])
})

test('the folder and the people of a call Fathom did not list', () => {
  const out = (meeting_type: string) => normOutput({ call_id: 'x', meeting_type })
  expect(folderOf(null, null, out('sales'))).toBe('No client yet')
  expect(folderOf(null, null, out('dev'))).toBe('AI Paragon (internal)')
  expect(folderOf(null, null, out('internal'))).toBe('AI Paragon (internal)')
  expect(folderOf(null, null, out(''))).toBe('No client yet')
  // with people saved on it, it is filed as a listed call is
  const withPeople = normMeta({ call_id: 'x', guests: [{ name: 'Pat Example', email: 'pat@northwind-advisors.example', external: true }] })
  expect(folderOf(null, withPeople, out(''))).toBe('Northwind Advisors')
  expect(peopleOf(null, withPeople).map((p) => p.name)).toEqual(['Pat Example'])
  expect(peopleOf(null, null)).toEqual([])
  const teamOnly = normMeta({ call_id: 'x', guests: [{ name: 'QA Teammate', email: 'qa.teammate@aiparagonconsulting.com' }] })
  expect(folderOf(null, teamOnly, out(''))).toBe('AI Paragon (internal)')
  expect(folderOf(null, teamOnly, out('demo'))).toBe('No client yet')
  // a lead's company names the folder only for a call Fathom listed
  const robin = normMeta({ call_id: 'x', guests: [{ name: 'Robin Sample', email: 'robin.sample@example.com', external: true }] })
  expect(folderOf(null, robin, out(''), 'Sample Peak Partners')).toBe('Example')
  expect(folderOf(FC()[0], robin, out(''), 'Sample Peak Partners')).toBe('Sample Peak Partners')
})

test('the post-call actions keep the call’s title and start, and when its tasks went to Asana', () => {
  const o = normOutput(TASK_OUTPUTS[4])
  expect([o.call_title, o.call_start, o.asana]).toEqual(['Demo for Acme', '2026-11-02T15:00:00Z', { at: '2026-11-03T10:00:00Z', project_name: 'Client onboarding' }])
  expect(normOutput({ asana: { project_name: 'Never sent' } }).asana).toBeNull()
  expect(normOutput({ asana: JSON.stringify({ at: '2026-11-03T10:00:00Z' }) }).asana).toEqual({ at: '2026-11-03T10:00:00Z', project_name: '' })
})
