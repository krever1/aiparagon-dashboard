import { expect, test } from '@playwright/test'
import {
  type CatalystConfig, backInPlace, configFrom, editProblem, lines, meetingTypes, prepExtras, stageRecs, teamStages,
} from '../../src/lib/catalyst/setup'
import { composeNote, planFor, prepBody, runOf, runsFromSetting, setupKeyOf, setupOf, withWorkspace } from '../../src/lib/catalyst/plan'
import { derivedStage, docOf, type Lead, type OutRow, stageOf } from '../../src/lib/catalyst/leads'
import { nextStageKey } from '../../src/lib/catalyst/stages'
import { type LeadView, countByStage, leadTab, pipelineTab } from '../../src/lib/catalyst/view'
import { type WsMeta, extOf, folded, isSource, wsCalls, wsFiles, wsFolders, wsMetaOf, wsShown } from '../../src/lib/catalyst/workspace'
import { leadWaits, reviewAgent, reviewKey } from '../../src/lib/touchpoint/approvals'

// Meeting Types and Client Stages (v145, v146) and the client workspace, checked without a browser. The settings are
// made up, in the shapes the current dashboard saves (ai_settings catalyst_meeting_types, catalyst_client_stages,
// catalyst_ws).

const MT = {
  order: ['mt-strat01', 'mt-gone001'],
  items: {
    'mt-strat01': {
      name: 'Strategy session', doc: 'Strategy session brief', desc: 'Plan the quarter.', sections: ['Goals', 'Risks', 'Asks'], kb: 'We sell in quarters.',
      kbFiles: ['g1', 'g2'],
    },
    'mt-gone001': { name: 'Old meeting', doc: 'Old prep', deleted: true },
    review: { hidden: true, desc: 'Check in with the client.' },
    onboarding: { kb: 'Onboard in two weeks.' },
  },
}
const CS = {
  order: ['research', 'consultation', 'cs-strat01', 'assessment', 'proposal', 'review', 'cs-plain01'],
  removed: ['onboarding', 'research'],
  items: {
    'cs-strat01': { name: 'Strategy', type: 'mt-strat01', desc: 'The quarterly plan.', deliverables: ['Signed plan'], tasks: ['Book the room'] },
    'cs-plain01': { name: 'Holding', type: '' },
    'cs-dead001': { name: 'Deleted one', deleted: true },
    proposal: { template: 'Intro\nScope\n- Price', inputs: 'Signed NDA' },
  },
}
const cfg: CatalystConfig = configFrom({ consultation: 'Kickoff call' }, MT, JSON.stringify(CS))

test('the stages: the team’s order and names, removed ones out (never Prospect research), the team’s own in', () => {
  const S = teamStages(cfg)
  expect(S.map((s) => s.key)).toEqual(['research', 'consultation', 'cs-strat01', 'assessment', 'proposal', 'review', 'cs-plain01'])
  expect(S.map((s) => s.name)).toEqual(['Prospect research', 'Kickoff call', 'Strategy', 'Assessment', 'Proposal', 'Client review', 'Holding'])
  const strat = S[2]
  expect(strat).toMatchObject({ custom: true, mt: 'mt-strat01', norun: false, agent: 'meeting_prep', doc: 'Strategy session brief', short: 'Strategy session brief' })
  expect(strat.what).toBe('the strategy session brief')
  expect(strat.role).toBe('The quarterly plan.')
  expect(S[6]).toMatchObject({ custom: true, mt: '', norun: true, agent: '', doc: '' })
  expect(S[1]).toMatchObject({ base: 'consultation', custom: false, mt: 'consultation', agent: 'interview_script' })
  // Edit stages lists the removed ones too
  const all = stageRecs(cfg, true)
  expect(all.filter((r) => r.removed).map((r) => r.key)).toEqual(['onboarding'])
  expect(all.find((r) => r.key === 'proposal')).toMatchObject({ template: 'Intro\nScope\n- Price', inputs: 'Signed NDA', desc: S[4].role })
  // nothing saved: the six as before
  expect(teamStages(configFrom({}, null, null)).map((s) => s.key)).toEqual(['research', 'consultation', 'assessment', 'proposal', 'onboarding', 'review'])
  // a stage missing from the saved order goes at the end
  expect(teamStages(configFrom({}, null, { order: ['review', 'research'] })).map((s) => s.key)).toEqual([
    'review', 'research', 'consultation', 'assessment', 'proposal', 'onboarding',
  ])
})

test('the meeting types: built in (named as their stage), then the team’s own; hidden ones only when asked', () => {
  expect(meetingTypes(cfg).map((t) => t.key)).toEqual(['research', 'consultation', 'assessment', 'proposal', 'onboarding', 'mt-strat01'])
  const all = meetingTypes(cfg, true)
  expect(all.map((t) => t.key)).toEqual(['research', 'consultation', 'assessment', 'proposal', 'onboarding', 'review', 'mt-strat01'])
  expect(all[1]).toMatchObject({ name: 'Kickoff call', doc: 'Consultation guide', custom: false })
  expect(all[5]).toMatchObject({ hidden: true, desc: 'Check in with the client.', sections: expect.arrayContaining(['What to decide in this meeting']) })
  expect(all[6]).toMatchObject({ custom: true, name: 'Strategy session', sections: ['Goals', 'Risks', 'Asks'], kbFiles: ['g1', 'g2'] })
})

test('a run: sections and purpose for Meeting Prep, the setup of the stage’s meeting type, the plan', () => {
  const S = teamStages(cfg)
  const strat = S[2]
  expect(prepExtras(cfg, strat)).toEqual({ sections: ['Goals', 'Risks', 'Asks'], purpose: 'The quarterly plan. Plan the quarter' })
  // a built-in stage: its own output template (two lines or more); its description is what the meeting is for
  const review = S.find((s) => s.key === 'review')!
  expect(prepExtras(cfg, review)).toEqual({ purpose: 'Prepares the client review: what was planned, what happened since, what to decide next' })
  const body = prepBody({ email: 'a@example.com', prospect_name: 'Ann' }, ['a@example.com'], strat, 'note', prepExtras(cfg, strat))
  expect(body).toMatchObject({ stage: 'cs-strat01', stageName: 'Strategy', docName: 'Strategy session brief', sections: ['Goals', 'Risks', 'Asks'] })
  expect(setupKeyOf(strat)).toBe('mt-strat01')
  expect(setupOf('mt-strat01', null)).toEqual({ type: '', calls: true, crm: true, questions: null, emails: true, charts: null })
  expect(setupOf('mt-strat01', { 'mt-strat01': { calls: false, emails: false } })).toMatchObject({ calls: false, crm: true, emails: false })
  const none = { docs: {}, ids: { research: false, interview: false, anonymized: false } }
  expect(planFor(none, strat)).toEqual({ doneAt: null, blocked: '', need: 'documents', notes: true })
  expect(planFor({ ...none, docs: { research: 1 } }, strat).need).toBe('')
  expect(planFor(none, S[6]).blocked).toBe('This stage runs nothing yet. Pick a meeting type in its setup (click its name on the board).')
  expect(lines('- One\n2) Two\n\n* Three')).toEqual(['One', 'Two', 'Three'])
})

test('where a lead sits: on the board, else the first stage; documents of the team’s own stages count', () => {
  const S = teamStages(cfg)
  const outs: OutRow[] = [
    { id: '1', run_id: 'a@example.com', agent: 'lead_research', created_at: '2026-11-01T10:00:00Z' },
    { id: '2', run_id: 'a@example.com', agent: 'meeting_prep', created_at: '2026-11-03T10:00:00Z', data: { stage: 'cs-strat01' } },
  ]
  const lead = { email: 'a@example.com', emails: ['a@example.com'], prospect_name: 'Ann' } as Lead
  expect(derivedStage(lead, outs, S)).toBe('cs-strat01')
  // a stage removed from the board is not where it sits
  expect(stageOf({ ...lead, stage: 'onboarding' }, outs, S)).toBe('cs-strat01')
  expect(stageOf({ ...lead, stage: 'cs-plain01' }, outs, S)).toBe('cs-plain01')
  expect(docOf(lead, S[2], outs)?.at).toBe(Date.parse('2026-11-03T10:00:00Z'))
  const v = { stored: null, derived: 'cs-strat01', run: null } as unknown as LeadView
  expect(countByStage([v], S)['cs-strat01']).toBe(1)
  expect(nextStageKey(S, 'consultation')).toBe('cs-strat01')
  expect(nextStageKey(S, 'cs-plain01')).toBe('cs-plain01')
  expect(pipelineTab('cs-strat01', S)).toBe('cs-strat01')
  expect(pipelineTab('onboarding', S)).toBe('board')
  expect(leadTab('cs-strat01')).toBe('cs-strat01')
  // a run of a stage that is no longer on the board is not running
  const runs = runsFromSetting({ 'a@example.com': { s: 'onboarding', t0: new Date().toISOString(), seen: 0 }, 'b@example.com': { s: 'cs-strat01', t0: new Date().toISOString(), seen: 0 } })
  expect(Object.keys(runs)).toEqual(['a@example.com', 'b@example.com'])
  expect(runOf({ emails: ['a@example.com'], docs: {} }, runs, Date.now(), S)).toBeNull()
  expect(runOf({ emails: ['b@example.com'], docs: {} }, runs, Date.now(), S)?.s).toBe('cs-strat01')
  // Approvals: a stage of the team's own has the meeting prep's review key; one that runs nothing waits on nothing
  expect(reviewAgent('cs-strat01')).toBe('meeting_prep')
  expect(reviewKey('A@example.com', 'cs-strat01')).toBe('a@example.com:meeting_prep:cs-strat01')
  const plain = { id: 'p', email: 'p@example.com', emails: ['p@example.com'], name: 'P', company: '', fit: '', run: null, stored: 'cs-plain01', derived: 'research', docs: {} }
  expect(leadWaits([plain as unknown as LeadView], [], S)).toEqual([])
  expect(leadWaits([{ ...plain, stored: 'cs-strat01' } as unknown as LeadView], [], S).map((w) => w.stage)).toEqual(['cs-strat01'])
})

test('Edit stages: the checks, and a stage brought back to its usual place', () => {
  expect(editProblem([])).toBe('Keep at least one stage.')
  expect(editProblem([{ key: 'research', name: ' ' }])).toBe('Every stage needs a name.')
  expect(editProblem([{ key: 'research', name: 'A' }, { key: 'review', name: 'a' }])).toBe('Two stages have the same name.')
  expect(editProblem([{ key: 'review', name: 'A' }])).toBe('Prospect research stays: new leads start there.')
  expect(editProblem([{ key: 'research', name: 'A' }])).toBe('')
  expect(backInPlace(['research', 'consultation', 'cs-x', 'assessment', 'review'], 'proposal')).toEqual(['research', 'consultation', 'cs-x', 'assessment', 'proposal', 'review'])
  expect(backInPlace(['research', 'consultation'], 'review')).toEqual(['research', 'consultation', 'review'])
})

test('the notes: the knowledge base after the team’s notes, the workspace’s sources at the end, 8,000 at most', () => {
  const S = teamStages(cfg)
  const ws = [
    { name: 'Contract', text: 'c'.repeat(5000), kind: 'file' as const, at: '', desc: 'Signed' },
    { name: 'Call 2', text: 'Ann: we are ready.', kind: 'transcript' as const, at: '', desc: '' },
  ]
  const note = composeNote({ typed: 'Typed.\n\nKNOWLEDGE BASE CONTEXT FOR STRATEGY SESSION\nWe sell in quarters.', crm: null, calls: [], emails: [], stages: S, workspace: ws })
  expect(note).toBe(
    'Typed.\n\nKNOWLEDGE BASE CONTEXT FOR STRATEGY SESSION\nWe sell in quarters.\n\nFILES AND TRANSCRIPTS ADDED TO THE CLIENT WORKSPACE\nFile: Contract (Signed)\n' +
      'c'.repeat(3000) +
      '\n\nTranscript: Call 2\nAnn: we are ready.',
  )
  expect(withWorkspace('', [])).toBe('')
  const many = Array.from({ length: 5 }, (_, i) => ({ name: 'F' + i, text: 'x'.repeat(3000), kind: 'file' as const, at: '', desc: '' }))
  const out = withWorkspace('', many)
  expect(out.split('File: ').length - 1).toBe(3)
  expect(out.length).toBeLessThan(8_200)
  // a call filed under a stage of the team's own says so
  expect(composeNote({ typed: '', crm: null, calls: [{ id: '1', start: '2026-11-04T10:00:00Z', title: 'Plan', stage: 'cs-strat01', text: 'hi' }], emails: [], stages: S })).toContain(
    'Call on Nov 4, 2026: Plan (filed under Strategy)',
  )
})

test('the workspace: folders, items, a move that holds while the call stays filed, a folder gone, the filters', () => {
  const S = teamStages(cfg)
  const all = {
    'pat@example.com': {
      folders: [{ id: 'wf-abc123', name: 'Contracts' }],
      items: {
        'a:lead_research': { name: 'Brief', star: true },
        'f:u1': { folder: 'wf-abc123', desc: 'Kept', source: true },
        'f:u2': { folder: 'wf-gone00' },
        'f:u3': { source: false },
        'c:c1': { folder: 'wf-abc123', stage: 'cs-strat01', name: 'Planning call' },
        'c:c2': { folder: 'wf-abc123', stage: '' },
      },
    },
  }
  const meta: WsMeta = wsMetaOf(all, 'Pat@Example.com')
  expect(meta.folders).toEqual([{ id: 'wf-abc123', name: 'Contracts' }])
  expect(wsFolders(S, meta).map((f) => f.name)).toEqual([...S.map((s) => s.name), 'Contracts'])
  const files = wsFiles({
    docs: [
      { agent: 'lead_research', label: 'Pre-meeting prospect brief', done: true, at: '2026-11-01', url: '', documentId: 'd1', gammaDocUrl: '' },
      { agent: 'discovery_call', label: 'Follow-up guide', done: true, at: '2026-11-02', url: 'https://x.example.com/f.pdf', documentId: '', gammaDocUrl: '' },
      { agent: 'growth_plan', label: 'Proposal presentation', done: false, at: null, url: '', documentId: '', gammaDocUrl: '' },
    ],
    prep: [{ key: 'cs-strat01', at: '2026-11-05' }],
    uploads: [
      { id: 'u1', name: 'nda.pdf', url: 'https://s.example.com/nda.pdf', stage: 'manual', note: 'old note', by: 'Kim', at: '2026-11-03', category: '', indexed: true, hs: false },
      { id: 'u2', name: 'scope', url: '', stage: 'anonymizer', note: '', by: '', at: '2026-11-04', category: '', indexed: false, hs: true },
      { id: 'u3', name: 'call.txt', url: '', stage: 'manual', note: '', by: '', at: '2026-11-06', category: 'transcript', indexed: true, hs: false },
      { id: 'u4', name: 'call2.txt', url: '', stage: 'manual', note: '', by: '', at: '2026-11-07', category: 'transcript', indexed: true, hs: false },
    ],
    stages: S,
    meta,
  })
  const by = Object.fromEntries(files.map((i) => [i.key, i]))
  expect(by['a:lead_research']).toMatchObject({ name: 'Brief', star: true, folder: 'research', fm: [{ l: 'Google Doc' }] })
  expect(by['a:discovery_call']).toMatchObject({ folder: '', fm: [{ l: 'PDF', u: 'https://x.example.com/f.pdf' }] })
  expect(by['a:growth_plan']).toBeUndefined()
  expect(by['p:cs-strat01']).toMatchObject({ name: 'Strategy session brief', folder: 'cs-strat01', fm: [{ l: 'Read', tab: 'cs-strat01' }] })
  expect(by['f:u1']).toMatchObject({ kind: 'upload', folder: 'wf-abc123', desc: 'Kept', source: true, fm: [{ l: 'PDF' }] })
  // a folder that is gone is To organize (v146); a file's stage folder from its agent
  expect(by['f:u2']).toMatchObject({ folder: '', source: false, hs: true, fm: [{ l: 'FILE' }] })
  expect(by['f:u3']).toMatchObject({ kind: 'transcript', source: false })
  expect(by['f:u4']).toMatchObject({ kind: 'transcript', source: true, fm: [{ l: 'Transcript' }] })
  expect(extOf('a.docx')).toBe('DOCX')
  expect(isSource(undefined, 'transcript')).toBe(true)
  expect(isSource({ source: true }, '')).toBe(true)
  expect(folded([{ folder: 'x' }], [])).toEqual([{ folder: '' }])

  const calls = wsCalls({
    calls: [
      { id: 'c1', title: 'Plan', start: '2026-11-08', minutes: 30, stage: 'cs-strat01', who: 'Pat', summary: 'Agreed.' },
      // filed elsewhere since the move: the filing wins
      { id: 'c2', title: 'Kickoff', start: '2026-11-02', minutes: 20, stage: 'consultation', who: '', summary: '' },
      { id: 'c3', title: '', start: '2026-11-01', minutes: 0, stage: 'none', who: '', summary: '' },
    ],
    files,
    stages: S,
    meta,
  })
  expect(calls.map((c) => [c.key, c.name, c.folder, c.src])).toEqual([
    ['c:c1', 'Planning call', 'wf-abc123', 'Fathom'],
    ['f:u4', 'call2.txt', '', 'Uploaded'],
    ['f:u3', 'call.txt', '', 'Uploaded'],
    ['c:c2', 'Kickoff', 'consultation', 'Fathom'],
    ['c:c3', 'Call', '', 'Fathom'],
  ])
  const F = wsFolders(S, meta)
  expect(wsShown(files, { folder: 'star', q: '', type: '', sort: 'new' }, F).map((i) => i.key)).toEqual(['a:lead_research'])
  expect(wsShown(files, { folder: 'org', q: '', type: '', sort: 'new' }, F).map((i) => i.key)).toEqual(['f:u4', 'f:u3', 'f:u2', 'a:discovery_call'])
  expect(wsShown(files, { folder: 'all', q: 'contracts', type: '', sort: 'new' }, F).map((i) => i.key)).toEqual(['f:u1'])
  expect(wsShown(files, { folder: 'all', q: '', type: 'transcript', sort: 'az' }, F).map((i) => i.key)).toEqual(['f:u3', 'f:u4'])
  expect(wsShown(files, { folder: 'all', q: '', type: 'pdf', sort: 'old' }, F).map((i) => i.key)).toEqual(['a:discovery_call', 'f:u1'])
})
