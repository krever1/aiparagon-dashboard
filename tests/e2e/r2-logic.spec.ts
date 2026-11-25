import { expect, test } from '@playwright/test'
import { stagesNamed } from '../../src/lib/catalyst/stages'
import {
  type CallMeta, type CallOutput, type FilingCtx, type FtCall, IN_FOLDER, NO_CLIENT, asFolder, callsByFolder, catButtonsOf, catLabel, cleanNames, filedFolder,
  folderChoices, keptAfterDelete, matchCall, newTypeProblem, normCall, normMeta, normName, normOutput, typeLabel, typeShort, workDomain,
} from '../../src/lib/catalyst/calls'
import { clientItems, itemText } from '../../src/lib/catalyst/inbox'
import { approvalItems } from '../../src/lib/touchpoint/approvals'
import { byPage, fbKey, fbPlace, goHref, normRow, openRows, parseAnchor } from '../../src/lib/touchpoint/feedback'
import { PORTED } from '../../src/lib/nav'

// The current dashboard's v144, checked without a browser: the team's names for the call types and buttons, filing a
// call by its people, new contacts on calls, and feedback keys and where they point. Made-up people at example.com.

const LEGACY = 'https://aiparagon.vercel.app/dashboard'
const NOW = Date.parse('2026-11-25T12:00:00Z')
const TEAM = { name: 'QA Teammate', email: 'qa.teammate@aiparagonconsulting.com' }
const call = (id: string, guests: { name: string; email: string }[], start = '2026-11-20T15:00:00Z', title = 'A call'): FtCall =>
  normCall({ id, title, start, end: '2026-11-20T15:30:00Z', recorded_by: TEAM, invitees: [TEAM, ...guests.map((g) => ({ ...g, external: true }))] })
const meta = (r: Record<string, unknown>): CallMeta => normMeta(r)
const NONE: FilingCtx = { leads: [], contacts: [], folders: [] }

test('the team’s names: built-in types and buttons keep their keys, empty means the usual name, and a taken name is refused', () => {
  const names = cleanNames({ demo: 'Product demo', 'cat:sales': 'Pipeline', interview: '  ', junk: { a: 1 } })
  expect(names).toEqual({ demo: 'Product demo', 'cat:sales': 'Pipeline' })
  expect(cleanNames('{"dev":"Build time"}')).toEqual({ dev: 'Build time' })
  expect(typeLabel('demo', names)).toBe('Product demo')
  expect(typeLabel('interview', names)).toBe('Interview / prequal')
  expect(typeShort('interview', names)).toBe('Interview')
  expect(typeLabel('Partner call', names)).toBe('Partner call')
  expect(catLabel('sales', names)).toBe('Pipeline')
  expect(catLabel('x:Partner call', names)).toBe('Partner call')
  expect(catButtonsOf(['demo', 'sales', 'x:Partner call'], names).map((b) => b.label)).toEqual(['All', 'Client demos', 'Pipeline', 'Internal development', 'Partner call'])
  expect(newTypeProblem('product demo', names)).toBe('That type is already in the list.')
  expect(newTypeProblem('Pipeline', names)).toBe('That type is already in the list.')
  // the usual name is free once the team renamed it, as in the current dashboard
  expect(newTypeProblem('Client demo', names)).toBe('')
  expect(newTypeProblem('Client demo')).toBe('That type is already in the list.')
})

test('filing a call by its people: a lead’s email, a lead at the same work domain, a HubSpot contact’s company, then a folder the team has', () => {
  const ctx: FilingCtx = {
    leads: [
      { emails: ['robin@peak.example.com'], company: 'Sample Peak Partners', name: 'Robin Sample' },
      { emails: ['solo@gmail.com'], company: '', name: 'Solo Person' },
      { emails: ['contact@deltaadvisory.com'], company: 'Delta Advisory', name: 'Placeholder' },
    ],
    contacts: [{ email: 'cara@harbor.example.org', company: 'Harbor Wealth, LLC' }],
    folders: ['Harbor Wealth', 'Northwind'],
  }
  expect(matchCall(call('1', [{ name: 'Robin Sample', email: 'Robin@peak.example.com' }]), null, ctx)).toEqual({ folder: 'Sample Peak Partners', how: 'lead' })
  // a lead with no company is filed by its name
  expect(matchCall(call('2', [{ name: 'Solo', email: 'solo@gmail.com' }]), null, ctx)).toEqual({ folder: 'Solo Person', how: 'lead' })
  // a colleague of a lead, by the work domain; free mail never counts
  expect(matchCall(call('3', [{ name: 'Ann', email: 'ann@peak.example.com' }]), null, ctx)).toEqual({ folder: 'Sample Peak Partners', how: 'domain' })
  expect(matchCall(call('4', [{ name: 'Gil', email: 'gil@gmail.com' }]), null, ctx)).toBeNull()
  expect(workDomain('gil@gmail.com')).toBe('')
  expect(workDomain(TEAM.email)).toBe('')
  // a HubSpot contact's company takes the team's folder of that name
  expect(matchCall(call('5', [{ name: 'Cara', email: 'cara@harbor.example.org' }]), null, ctx)).toEqual({ folder: 'Harbor Wealth', how: 'contact' })
  expect(normName('The Harbor Wealth Group, LLC')).toBe(normName('harbor wealth'))
  // a folder the team has by the company in the email
  expect(matchCall(call('6', [{ name: 'Nia', email: 'nia@northwind.com' }]), null, ctx)).toEqual({ folder: 'Northwind', how: 'folder' })
  // the anonymizer's placeholder is never a lead to file by
  expect(matchCall(call('7', [{ name: 'X', email: 'contact@deltaadvisory.com' }]), null, ctx)).toBeNull()
  // nobody from outside
  expect(matchCall(call('8', []), null, ctx)).toBeNull()

  // the folder: set on the call first; else the match; else the people's company, as a folder the team has when it is one
  expect(filedFolder(call('1', [{ name: 'R', email: 'robin@peak.example.com' }]), meta({ call_id: '1', folder: 'Kept' }), null, ctx)).toBe('Kept')
  expect(filedFolder(call('5', [{ name: 'C', email: 'cara@harbor.example.org' }]), null, null, ctx)).toBe('Harbor Wealth')
  expect(filedFolder(call('9', [{ name: 'Z', email: 'zed@acme-tools.io' }]), null, null, ctx)).toBe('Acme Tools')
  expect(filedFolder(call('10', []), null, null, ctx)).toBe(IN_FOLDER)
  expect(asFolder('northwind inc', ctx.folders)).toBe('Northwind')
  expect(asFolder('Brand New', ctx.folders)).toBe('Brand New')
  // with nothing known, it is folderOf as before
  expect(filedFolder(call('9', [{ name: 'Z', email: 'zed@acme-tools.io' }]), null, null, NONE)).toBe('Acme Tools')
})

test('calls by folder, the folder list with the team’s own, and what stays under a deleted folder', () => {
  const calls = [call('1', [{ name: 'Ann', email: 'ann@acme.com' }]), call('2', [{ name: 'Bo', email: 'bo@acme.com' }]), call('3', [])]
  const metas: Record<string, CallMeta> = {
    '1': meta({ call_id: '1', folder: 'Acme' }),
    '4': meta({ call_id: '4', folder: 'Old client', guests: [{ name: 'Old', email: 'old@oldco.com', external: true }] }),
  }
  const outs: Record<string, CallOutput> = { '5': normOutput({ id: 'o5', call_id: '5', meeting_type: 'dev', status: 'done' }) }
  const ctx: FilingCtx = { leads: [], contacts: [], folders: ['Acme', 'Old client', 'Empty one'] }
  const by = callsByFolder(calls, metas, outs, [], ctx)
  expect(by).toEqual({ Acme: ['1', '2'], [IN_FOLDER]: ['3', '5'], 'Old client': ['4'] })
  expect(folderChoices([{ folder: 'Acme' }, { folder: NO_CLIENT }], Object.values(metas), ['Empty one'])).toEqual(['Acme', 'Empty one', 'Old client', NO_CLIENT])
  // Acme deleted: call 1 loses its folder, but both are still Acme by their people's company
  expect(keptAfterDelete(calls, metas, outs, [], ctx, ['Acme'])).toBe(2)
  // Old client deleted: its call is filed as Oldco by its people
  expect(keptAfterDelete(calls, metas, outs, [], ctx, ['Old client'])).toBe(0)
  expect(keptAfterDelete(calls, metas, outs, [], ctx, [])).toBe(0)
})

test('new contacts on calls: recent, not filed, someone from outside who matches nothing, not set aside, not a new HubSpot client', () => {
  const ctx: FilingCtx = { leads: [{ emails: ['robin@peak.example.com'], company: 'Sample Peak Partners', name: 'Robin' }], contacts: [], folders: [] }
  const calls = [
    call('1', [{ name: 'Nora New', email: 'nora@newco.com' }, { name: 'Ned', email: 'ned@newco.com' }], '2026-11-24T15:00:00Z', 'Intro'),
    call('2', [{ name: 'Robin', email: 'robin@peak.example.com' }], '2026-11-23T15:00:00Z'),
    call('3', [{ name: 'Old', email: 'old@far.example.com' }], '2026-10-01T15:00:00Z'),
    call('4', [{ name: 'Filed', email: 'filed@x.example.com' }], '2026-11-22T15:00:00Z'),
    call('5', [{ name: 'Aside', email: 'aside@y.example.com' }], '2026-11-22T15:00:00Z'),
    call('6', [{ name: 'Tom', email: 'tom@halvern.example.com' }], '2026-11-21T15:00:00Z'),
    call('7', [], '2026-11-21T15:00:00Z'),
  ]
  const metas = { '4': meta({ call_id: '4', folder: 'X' }) }
  const items = clientItems(calls, metas, ctx, new Set(['tom@halvern.example.com']), { '5': { by: 'a', at: 'b' } }, NOW)
  expect(items.map((x) => x.id)).toEqual(['1'])
  expect(items[0]).toMatchObject({ kind: 'client', key: 'client:1', title: 'Intro', minutes: 0 })
  expect(items[0].people.map((p) => p.email)).toEqual(['nora@newco.com', 'ned@newco.com'])
  expect(itemText(items[0], stagesNamed({}), 'Nov 24')).toEqual({ t: 'New contact on a call: Nora New, Newco on Nov 24', s: 'Create a client record for them?', b: 'Create client' })
})

test('feedback keys use the current dashboard’s views, and each points where it was left', () => {
  expect(fbKey('/calls')).toBe('fb:calls')
  expect(fbKey('/intel-tracker')).toBe('fb:e3intel')
  expect(fbKey('/content-transformation')).toBe('fb:e3create')
  expect(fbKey('/engine-1')).toBe('fb:e1overview')
  expect(fbKey('/lead-pipeline')).toBe('fb:e1pipeline')
  expect(fbKey('/lead-pipeline/pat-example-0123456789', 'Pat.Example@example.com')).toBe('fb:e1pipeline:pat.example@example.com')
  expect(fbKey('/nowhere')).toBe('fb:today')
  const lead = (e: string) => (e === 'pat.example@example.com' ? { id: 'pat-example-0123456789', name: 'Pat Example' } : null)
  expect(fbPlace('fb:calls', lead, PORTED)).toEqual({ where: 'Calls', href: '/calls', out: false })
  expect(fbPlace('fb:e1pipeline:pat.example@example.com', lead, PORTED)).toEqual({ where: 'Pat Example · lead page', href: '/lead-pipeline/pat-example-0123456789', out: false })
  expect(fbPlace('fb:e1pipeline:nobody@example.com', lead, PORTED)).toEqual({ where: 'nobody@example.com · lead page', href: '/lead-pipeline', out: false })
  // a page not moved here opens in the current dashboard
  expect(fbPlace('fb:kb', lead, PORTED)).toEqual({ where: 'Knowledge base', href: LEGACY + '/knowledge-base', out: true })
  expect(goHref(fbPlace('fb:calls', lead, PORTED), 'n1')).toBe('/calls?fb=n1')
  expect(goHref(fbPlace('fb:kb', lead, PORTED), 'n1')).toBe(LEGACY + '/knowledge-base')
  expect(parseAnchor('{"sel":"#main>p","label":"Hi","x":0.5,"y":0.2}')).toEqual({ sel: '#main>p', label: 'Hi', x: 0.5, y: 0.2 })
  expect(parseAnchor('not json')).toEqual({})
  const rows = [
    normRow({ id: 'a', target_key: 'fb:calls', body: 'One', resolved: false }),
    normRow({ id: 'b', target_key: 'fb:tasks', body: 'Two', resolved: true }),
    normRow({ id: 'c', target_key: 'fb:calls', body: 'Three', resolved: null }),
  ]
  expect(openRows(rows, 'fb:calls').map((r) => r.id)).toEqual(['a', 'c'])
  expect(byPage(rows).map((g) => [g.key, g.rows.length])).toEqual([['fb:calls', 2]])
})

test('Approvals lists a feedback note as Feedback from <name>, where it was left, and Go to it', () => {
  const items = approvalItems({
    intel: null,
    ads: null,
    decisions: {},
    snaps: {},
    replies: [],
    comments: [
      { id: '11111111-1111-4111-8111-111111111111', target: 'fb:calls', author: 'erin@example.com', body: 'Bigger player', createdAt: '2026-11-24T10:00:00Z' },
      { id: '22222222-2222-4222-8222-222222222222', target: 'fb:e1pipeline:pat.example@example.com', author: '', body: 'Stage name?', createdAt: '2026-11-23T10:00:00Z' },
      { id: '33333333-3333-4333-8333-333333333333', target: 'fb:kb', author: 'robin@example.com', body: 'Too many tiles', createdAt: '2026-11-22T10:00:00Z' },
    ],
    leadIds: { 'pat.example@example.com': 'pat-example-0123456789' },
    leadNames: { 'pat.example@example.com': 'Pat Example' },
    legacy: LEGACY,
    now: NOW,
  })
  expect(items.map((x) => [x.title, x.tags])).toEqual([
    ['Feedback from erin', [{ text: 'Feedback' }, { text: 'Calls' }]],
    ['Feedback from someone', [{ text: 'Feedback' }, { text: 'Pat Example · lead page' }]],
    ['Feedback from robin', [{ text: 'Feedback' }, { text: 'Knowledge base' }]],
  ])
  expect(items[0]).toMatchObject({ kind: 'comment', approve: true, approveLabel: 'Resolve', review: { kind: 'link', href: '/calls?fb=11111111-1111-4111-8111-111111111111', label: 'Go to it' } })
  expect(items[0].review).not.toHaveProperty('out')
  expect(items[1].review).toMatchObject({ href: '/lead-pipeline/pat-example-0123456789?fb=22222222-2222-4222-8222-222222222222' })
  expect(items[2].review).toMatchObject({ href: LEGACY + '/knowledge-base', out: true })
})
