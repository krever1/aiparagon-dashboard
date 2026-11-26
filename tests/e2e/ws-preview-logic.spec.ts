import { expect, test } from '@playwright/test'
import { STAGES } from '../../src/lib/catalyst/stages'
import { type GuessCtx, type WsItem, activityOf, byLine, guessFolder, logChanges, relatedCall, wsFolders } from '../../src/lib/catalyst/workspace'

// v153's rules without a browser: the change log kept on each workspace item, the folder guess for a call with none,
// the Activity list, the related call and the line under the name. Made-up items only.

const AT = '2026-11-26T10:00:00Z'
const name = (id: string) => ({ proposal: 'Proposal', assessment: 'Assessment', 'wf-deals': 'Deals' })[id] ?? ''

test('logChanges: each change in words, by whom and when; an upload made with its entry is not a change; the last 30', () => {
  const after = logChanges(
    { a: { name: 'Old', star: false }, b: { desc: 'x', source: true }, c: { folder: 'proposal' } },
    {
      a: { name: 'New', star: true, folder: 'wf-deals' },
      b: { desc: '', source: false },
      c: { folder: '' },
      d: { name: 'Upload', folder: '', desc: '', source: true },
      e: { star: true },
    },
    name,
    AT,
    'QA Teammate',
  )
  expect(after.a.log).toEqual([
    { at: AT, by: 'QA Teammate', what: 'Renamed to “New”' },
    { at: AT, by: 'QA Teammate', what: 'Moved to Deals' },
    { at: AT, by: 'QA Teammate', what: 'Starred' },
  ])
  expect(after.b.log?.map((l) => l.what)).toEqual(['Description removed', 'No longer a source for the stage runs'])
  expect(after.c.log?.map((l) => l.what)).toEqual(['Moved to To organize'])
  expect(after.d.log).toBeUndefined()
  expect(after.e.log?.map((l) => l.what)).toEqual(['Starred'])

  const full = Array.from({ length: 30 }, (_, n) => ({ at: AT, by: 'Erica', what: 'old ' + n }))
  const kept = logChanges({ x: { star: true, log: full } }, { x: { star: false, log: full } }, name, AT, 'QA Teammate').x.log!
  expect(kept).toHaveLength(30)
  expect(kept[0].what).toBe('old 1')
  expect(kept[29].what).toBe('Unstarred')
  // nothing changed, nothing logged
  expect(logChanges({ y: { name: 'Same' } }, { y: { name: 'Same' } }, name, AT, 'Q').y.log).toBeUndefined()
})

const folders = wsFolders(STAGES, { folders: [{ id: 'wf-legal', name: 'Contracts and legal' }], items: {} })
const ctx: GuessCtx = {
  folders,
  stages: STAGES,
  setupType: { research: '', consultation: 'interview', assessment: 'discovery', proposal: 'proposal', onboarding: 'onboarding', review: 'checkin' },
  docAt: { research: '2026-10-05T09:00:00Z', consultation: '2026-10-08T09:00:00Z', assessment: null, proposal: '2026-10-16T09:00:00Z', onboarding: null, review: null },
  current: 'proposal',
  typeName: (t) => ({ onboarding: 'Onboarding', checkin: 'Check-in' })[t] ?? t,
  day: (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
}
const c = (name: string, at: string, type = ''): Pick<WsItem, 'kind' | 'name' | 'at' | 'type'> => ({ kind: 'call', name, at, type })

test('guessFolder: the title, then the call type, then the documents written before it, then the client’s stage', () => {
  expect(guessFolder(c('Proposal walkthrough', '2026-11-20T17:00:00Z', 'onboarding'), ctx)).toEqual({ folder: 'proposal', why: 'Its title says “Proposal”' })
  // the longest name that fits wins: "Client review" over a stage's short word
  expect(guessFolder(c('Client review with Pat', '2026-11-20T17:00:00Z'), ctx)).toEqual({ folder: 'review', why: 'Its title says “Client review”' })
  // a stage's short word, and the first word of its name of five letters or more
  expect(guessFolder(c('Walk through the onboarding plan', '2026-11-20T17:00:00Z'), ctx).why).toBe('Its title says “Onboarding plan”')
  expect(guessFolder(c('Prospect intro', '2026-11-20T17:00:00Z'), ctx)).toEqual({ folder: 'research', why: 'Its title says “Prospect”' })
  expect(guessFolder(c('Contracts and legal: the MSA', '2026-11-20T17:00:00Z'), ctx).folder).toBe('wf-legal')
  // words every meeting has never match alone, nor words under five letters
  expect(guessFolder(c('Client call', '2026-11-20T17:00:00Z'), ctx).why).toBe('Held after the Proposal presentation was written (Oct 16, 2026)')
  expect(guessFolder(c('Review', '2026-11-20T17:00:00Z'), ctx).folder).toBe('proposal')
  // the call type is a stage's meeting
  expect(guessFolder(c('Catch-up', '2026-11-22T17:00:00Z', 'checkin'), ctx)).toEqual({ folder: 'review', why: 'Its call type is Check-in: the Client review stage’s meeting' })
  // a type no stage's meeting has goes on to the documents
  expect(guessFolder(c('Catch-up', '2026-10-06T17:00:00Z', 'demo'), ctx)).toEqual({ folder: 'research', why: 'Held after the Pre-meeting prospect brief was written (Oct 5, 2026)' })
  // a document written that same moment counts
  expect(guessFolder(c('Chat', '2026-10-08T09:00:00Z'), ctx).folder).toBe('consultation')
  // before any document, or with no date: the client's stage now
  expect(guessFolder(c('Chat', '2026-09-01T17:00:00Z'), ctx)).toEqual({ folder: 'proposal', why: 'The client is in Proposal now' })
  expect(guessFolder(c('Chat', ''), ctx).why).toBe('The client is in Proposal now')
  // an uploaded transcript has no call type
  expect(guessFolder({ kind: 'transcript', name: 'Catch-up notes', at: '2026-11-22T17:00:00Z', type: 'checkin' }, ctx).folder).toBe('proposal')
})

const item = (p: Partial<WsItem>): WsItem => ({ key: 'k', kind: 'upload', name: 'x', fm: [], folder: '', at: '', by: '', desc: '', star: false, sent: [], ...p })

test('activityOf: what happened to an item, newest first; relatedCall and byLine', () => {
  const up = item({ key: 'f:1', kind: 'upload', at: '2026-10-02T09:00:00Z', by: 'QA Teammate' })
  const ev = activityOf(
    up,
    {
      asana: { at: '2026-11-01T10:00:00Z', by: 'erica@aiparagonconsulting.com', project_name: 'Clients' },
      log: [{ at: '2026-11-26T10:00:00Z', by: 'QA Teammate', what: 'Starred' }],
    },
    { indexedAt: '2026-10-02T09:05:00Z' },
    STAGES,
  )
  expect(ev.map((e) => e.what)).toEqual(['Starred', 'Sent to Asana · Clients', 'Text read for the Ask bot and the stage runs', 'Uploaded by QA Teammate'])
  const call = item({ key: 'c:9', kind: 'call', at: '2026-11-20T17:00:00Z' })
  const cev = activityOf(call, undefined, { filed: { stage: 'proposal', at: '2026-11-21T10:00:00Z', by: 'q@x' }, post: { at: '2026-11-20T18:00:00Z', done: true } }, STAGES)
  expect(cev.map((e) => e.what)).toEqual(['Filed under Proposal', 'Post-call actions written', 'Recorded on Fathom'])
  expect(activityOf(call, undefined, { filed: { stage: 'none', at: '', by: '' }, post: { at: 'x', done: false } }, STAGES).map((e) => e.what)).toEqual(['Recorded on Fathom'])

  const calls = [item({ key: 'c:a', kind: 'call', folder: 'proposal', at: '2026-11-01' }), item({ key: 'c:b', kind: 'call', folder: 'proposal', at: '2026-11-09' })]
  expect(relatedCall(item({ folder: 'proposal' }), calls)?.key).toBe('c:b')
  expect(relatedCall(item({ folder: '' }), calls)).toBeNull()
  expect(relatedCall(item({ kind: 'call', folder: 'proposal' }), calls)).toBeNull()

  expect(byLine(item({ kind: 'call', mins: 27, who: 'Pat', src: 'Fathom' }))).toBe('27 min · Pat · Fathom')
  expect(byLine(item({ kind: 'transcript', by: '' }))).toBe('Uploaded')
  expect(byLine(item({ kind: 'doc', by: 'AI generated' }))).toBe('AI generated')
})
