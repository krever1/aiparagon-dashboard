// Tasks' made-up rows, for the rules tests and the page tests. The Fathom stand-in lists calls 9001 to 9004
// (tests/stub/fixtures.mjs); calls 7001 to 7005 are not in its list, as an older call or one Fathom did not answer for.
//
// - 9001 Robin's discovery consultation: the AI picked Discovery (Sales); Robin is a lead at Sample Peak Partners.
// - 9003 Team sync: only the team; the AI picked Internal meeting.
// - 9004 Catch-up with Pat: the team set Check-in (Client work); Pat is a lead at Example Ridge Advisors; all done.
// - 7001 Partner sync: the team filed it under Partners and set Other.
// - 7002 Demo for Acme: the team set the client Acme Wealth and Client demo; its tasks were sent to Asana.
// - 7003: no title, the AI picked Internal meeting, nothing saved by the team.
// - 7004 is still being written and 7005 had no next steps: neither shows.

const task = (id: string, text: string, o: Record<string, unknown> = {}) => ({ id, text, owner: '', due: '', why: '', done: false, ...o })

export const TASK_OUTPUTS = [
  {
    id: '41000000-0000-4000-8000-000000000001', call_id: '9001', call_title: 'Discovery consultation with Robin', call_start: '2026-11-04T17:00:00Z',
    meeting_type: 'discovery', meeting_type_guess: true, status: 'done', created_at: '2026-11-04T18:00:00Z',
    tasks: [
      task('t1', 'Send the onboarding checklist', { owner: 'QA Teammate', due: '2026-11-12', why: 'They asked for it' }),
      task('t2', 'Book the assessment', { owner: 'Robin Sample', done: true }),
    ],
  },
  {
    id: '41000000-0000-4000-8000-000000000002', call_id: '9003', call_title: 'Team sync', call_start: '2026-10-25T16:00:00Z', meeting_type: 'internal',
    status: 'done', created_at: '2026-10-25T17:00:00Z',
    tasks: [task('t1', 'Write up the pricing'), task('t2', 'Tidy the call types')],
  },
  {
    id: '41000000-0000-4000-8000-000000000003', call_id: '9004', call_title: 'Catch-up with Pat', call_start: '2026-10-30T16:00:00Z', status: 'done',
    created_at: '2026-10-30T17:00:00Z',
    tasks: [task('t1', 'Send Pat the recap', { done: true })],
  },
  {
    id: '41000000-0000-4000-8000-000000000004', call_id: '7001', call_title: 'Partner sync', call_start: '2026-10-28T15:00:00Z', status: 'done',
    created_at: '2026-10-28T16:00:00Z',
    tasks: [task('t1', 'Share the referral terms')],
  },
  {
    id: '41000000-0000-4000-8000-000000000005', call_id: '7002', call_title: 'Demo for Acme', call_start: '2026-11-02T15:00:00Z', status: 'done',
    created_at: '2026-11-02T16:00:00Z',
    tasks: [task('t1', 'Send the demo recording')],
    asana: { at: '2026-11-03T10:00:00Z', project: '1200', project_name: 'Client onboarding', tasks: 1 },
  },
  {
    id: '41000000-0000-4000-8000-000000000006', call_id: '7003', call_title: '', call_start: '2026-10-15T15:00:00Z', meeting_type: 'internal', status: 'done',
    created_at: '2026-10-15T16:00:00Z',
    tasks: [task('t1', 'Book the next retro')],
  },
  { id: '41000000-0000-4000-8000-000000000007', call_id: '7004', call_title: 'Still writing', status: 'running', created_at: '2026-11-05T10:00:00Z', tasks: [] },
  { id: '41000000-0000-4000-8000-000000000008', call_id: '7005', call_title: 'Nothing to do', status: 'done', created_at: '2026-11-05T11:00:00Z', tasks: [] },
]

export const TASK_METAS = [
  { call_id: '9004', meeting_type: 'checkin', lead_email: 'pat.example@example.com', lead_stage: 'none', created_at: '2026-10-31T10:00:00Z' },
  { call_id: '7001', folder: 'Partners', meeting_type: 'other', created_at: '2026-10-28T17:00:00Z' },
  { call_id: '7002', client: 'Acme Wealth', meeting_type: 'demo', created_at: '2026-11-02T17:00:00Z' },
]

/** The Catalyst leads among the guests (the stand-in's Robin and Pat). */
export const TASK_LEADS = [
  { emails: ['robin.sample@example.com'], company: 'Sample Peak Partners' },
  { emails: ['pat.example@example.com'], company: 'Example Ridge Advisors' },
]
