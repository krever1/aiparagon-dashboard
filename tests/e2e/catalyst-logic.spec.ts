import { expect, test } from '@playwright/test'
import { docs, fathomCalls, fixtures } from '../stub/fixtures.mjs'
import { findLead, leadId } from '../../src/lib/catalyst/lead-id'
import {
  type LeadRow, type OutRow, buildLeads, docCount, docIds, docOf, derivedStage, mergeLeads, relink, stageOf,
} from '../../src/lib/catalyst/leads'
import {
  STAGES, cleanName, firmSizeLabel, firmTypeLabel, fitTone, labelCase, namesFromSetting, runLabel, stagesNamed,
} from '../../src/lib/catalyst/stages'
import { jsonStruct, mdClean, mdStruct, parseDocText, parseSaved, pdfToMd } from '../../src/lib/catalyst/doc-format'
import { followFields, followedText, metaPageIdFrom } from '../../src/lib/catalyst/follow'
import {
  type CallMeta, type CallOutput, agoText, callRow, catButtons, cleanTags, companyOf, crmBody, emptyLine, filterRows, folderChoices, folderOf,
  hoursText, newTypeProblem, normCall, normMeta, normOutput, peopleOf, shareToken, slackText, tasksText, typeShort, withLine,
} from '../../src/lib/catalyst/calls'
import { hsName } from '../../src/lib/catalyst/names'
import {
  baseFields, composeNote, crmLine, customBody, mailBlock, planFor, prepBody, researchBody, runOf, runsFromSetting, setupOf,
} from '../../src/lib/catalyst/plan'

// Catalyst's rules, checked without a browser: which rows make a lead, which document is a stage's, where a lead sits,
// and how a document is read. The rows are the stand-in's made-up ones (tests/stub/fixtures.mjs).

const F = fixtures() as unknown as { e1_leads: LeadRow[]; agent_outputs: OutRow[] }
const stage = (key: string) => STAGES.find((s) => s.key === key)!
const built = () => buildLeads(F.e1_leads, F.agent_outputs)
const byName = (name: string) => built().leads.find((l) => l.prospect_name === name)!

test('rows of the same person merge into one lead; the real rows win over the anonymized one', () => {
  const { leads } = built()
  expect(leads.map((l) => l.prospect_name)).toEqual(['Pat Example', 'Robin Sample', 'Lee Client', 'Sam Synth', 'Jordan Merge', 'Casey Review'])
  const j = byName('Jordan Merge')
  expect(j.email).toBe('jordan@example.com')
  expect(j.emails).toEqual(['jordan@example.com', 'contact@deltaadvisory.com', 'jordan.old@example.com'])
  expect(j.company_name).toBe('Merge Works')
  expect(j.fit_rating).toBe('Strong') // from the older real row, not the anonymized row's Weak
  expect(j.anonEmail).toBe('contact@deltaadvisory.com')
  expect(j.anonCompany).toBe('Delta Advisory')
  expect(j.updated_at).toBe('2026-11-01T10:00:00Z')
})

test('a lead with documents and no e1_leads row is made up from its newest document', () => {
  const s = byName('Sam Synth')
  expect(s.email).toBe('sam.synth@example.com')
  expect(s.company_name).toBe('Synth Partners')
  expect(s.synthesized).toBe(true)
  expect(byName('Pat Example').synthesized).toBe(false)
})

test('documents saved under the placeholder email go back to the lead with the same name', () => {
  const outs = relink(F.e1_leads, F.agent_outputs)
  for (const id of ['10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005']) {
    const o = outs.find((x) => x.id === id)!
    expect(o.run_id).toBe('pat.example@example.com')
    expect(o.held_as).toBe('contact@deltaadvisory.com')
  }
  // the input is left as it was
  expect(F.agent_outputs.find((x) => x.id === '10000000-0000-4000-8000-000000000005')!.run_id).toBe('contact@deltaadvisory.com')
  // a placeholder document whose name matches no lead stays where it was
  const stray: OutRow = { id: 'x', run_id: 'contact@deltaadvisory.com', agent: 'growth_plan', created_at: '2026-10-01T00:00:00Z', data: { prospectName: 'Nobody Known', companyName: 'Delta Advisory' } }
  expect(relink(F.e1_leads, [stray])[0].run_id).toBe('contact@deltaadvisory.com')
})

test('where each lead sits: the stage the team moved it to, else the furthest stage with a document', () => {
  const { leads, outs } = built()
  const where = Object.fromEntries(leads.map((l) => [l.prospect_name, stageOf(l, outs)]))
  expect(where).toEqual({
    'Pat Example': 'proposal', 'Robin Sample': 'consultation', 'Lee Client': 'onboarding', 'Sam Synth': 'research',
    'Jordan Merge': 'research', 'Casey Review': 'review',
  })
  // a saved stage wins over documents; a stage that is not one of the six falls back to the documents
  const pat = byName('Pat Example')
  expect(stageOf({ ...pat, stage: 'consultation' }, outs)).toBe('consultation')
  expect(stageOf({ ...pat, stage: 'kickoff' }, outs)).toBe('proposal')
  expect(derivedStage({ ...pat, emails: ['nobody@example.com'], email: 'nobody@example.com' }, outs)).toBe('research')
})

test('which document is a stage’s: newest row of its agent, meeting prep by its stage, else a link on the lead', () => {
  const { outs } = built()
  const lee = byName('Lee Client')
  expect(docOf(lee, stage('onboarding'), outs)?.out?.id).toBe('10000000-0000-4000-8000-000000000007')
  expect(docOf(lee, stage('review'), outs)).toBeNull()
  const robin = byName('Robin Sample')
  expect(docOf(robin, stage('research'), outs)).toEqual({ at: 0, out: null })
  // newest wins
  const pat = byName('Pat Example')
  const newer: OutRow = { id: 'newer', run_id: 'pat.example@example.com', agent: 'interview_script', created_at: '2026-10-30T00:00:00Z', data: {} }
  expect(docOf(pat, stage('consultation'), [...outs, newer])?.out?.id).toBe('newer')
  expect(docCount(pat, outs)).toBe(5)
  expect(docCount(robin, outs)).toBe(1)
  expect(docIds(pat, outs)).toEqual({
    researchDocId: 'docPatResearch0000000000001', interviewDocId: 'docPatInterview000000000001', anonymizedDocId: 'docPatAssessment00000000001',
  })
})

test('a merge orders by the newest row and keeps a lead with only an email', () => {
  const rows: LeadRow[] = [
    { email: 'a@example.com', updated_at: '2026-01-01T00:00:00Z' },
    { email: 'b@example.com', prospect_name: '  Bea   Two ', updated_at: '2026-03-01T00:00:00Z' },
    { email: 'b2@example.com', prospect_name: 'bea two', company_name: 'Two Co', updated_at: '2026-02-01T00:00:00Z' },
  ]
  const m = mergeLeads(rows)
  expect(m.map((l) => l.email)).toEqual(['b@example.com', 'a@example.com'])
  expect(m[0].company_name).toBe('Two Co')
  expect(m[0].emails).toEqual(['b@example.com', 'b2@example.com'])
})

test('a lead’s address: its name and a code from any of its emails, never the email itself', () => {
  const { leads } = built()
  const j = byName('Jordan Merge')
  const id = leadId(j)
  expect(id).toMatch(/^jordan-merge-[0-9a-f]{10}$/)
  expect(id).not.toContain('@')
  expect(findLead(leads, id)?.prospect_name).toBe('Jordan Merge')
  // the older row's email finds the same lead, whatever the name part says
  expect(findLead(leads, 'anything-' + leadId({ prospect_name: '', email: 'jordan.old@example.com' }).slice(-10))?.prospect_name).toBe('Jordan Merge')
  expect(findLead(leads, 'nobody-0000000000')).toBeNull()
  expect(findLead(leads, 'no-code-here')).toBeNull()
  expect(leadId({ prospect_name: 'Zoë Ålund & Co.', email: 'z@example.com' })).toMatch(/^zoe-alund-co-[0-9a-f]{10}$/)
  expect(leadId({ prospect_name: '', email: 'z@example.com' })).toMatch(/^lead-[0-9a-f]{10}$/)
})

test('the stages: team names, run buttons, firm words and the fit colour', () => {
  expect(STAGES.map((s) => s.key)).toEqual(['research', 'consultation', 'assessment', 'proposal', 'onboarding', 'review'])
  expect(STAGES.map(runLabel)).toEqual([
    'Run prospect brief', 'Run consultation guide', 'Run assessment', 'Run proposal', 'Run onboarding plan', 'Run review brief',
  ])
  const names = namesFromSetting({ consultation: { name: '  Kickoff   call ', by: 'x', at: 'y' }, review: { name: '' }, bogus: { name: 'x' } })
  expect(names).toEqual({ consultation: 'Kickoff call' })
  expect(namesFromSetting(JSON.stringify({ assessment: { name: 'Deep dive' } }))).toEqual({ assessment: 'Deep dive' })
  expect(namesFromSetting('not json')).toEqual({})
  expect(stagesNamed(names).map((s) => s.name)).toEqual(['Prospect research', 'Kickoff call', 'Assessment', 'Proposal', 'Onboarding', 'Client review'])
  expect(cleanName('x'.repeat(60))).toHaveLength(40)
  expect(firmTypeLabel('ria')).toBe('RIA')
  expect(firmTypeLabel('family_office')).toBe('Family office')
  expect(firmTypeLabel('other_company')).toBe('Other company')
  expect(firmSizeLabel('10m-50m')).toBe('$10M to $50M AUM')
  expect(firmSizeLabel('under-10m')).toBe('Under $10M AUM')
  expect(firmSizeLabel('1b')).toBe('$1B AUM')
  expect(labelCase('landing_page')).toBe('Landing page')
  expect(labelCase('ai-referral')).toBe('AI referral')
  expect([fitTone('Strong fit'), fitTone('Weak'), fitTone('Disqualified'), fitTone('High'), fitTone('')]).toEqual(['good', 'bad', 'bad', 'warn', null])
})

test('a markdown document reads as a title, key facts, an intro and parts with their points', () => {
  const md = String((fixtures() as unknown as { agent_outputs: OutRow[] }).agent_outputs[0].content_md)
  const s = mdStruct(md)
  expect(s.title).toBe('Pre-meeting prospect brief: Pat Example')
  expect(s.facts).toEqual([
    ['Firm', 'Example Ridge Advisors'],
    ['Prepared by', 'Catalyst'],
  ])
  expect(s.intro).toBe('A made-up brief for the tests.')
  expect(s.secs.map((x) => [x.h, x.points])).toEqual([
    ['Who they are', 2],
    ['What to ask', 3],
    ['Watch for', 0],
  ])
  // numbered headings lose their numbers; ### is used when there is no ##; no headings at all is one part
  expect(mdStruct('# T\n\n### 1. One\nx\n### 2) Two\ny').secs.map((x) => x.h)).toEqual(['One', 'Two'])
  expect(mdStruct('Just text.').secs).toEqual([{ h: 'Document', body: 'Just text.', points: 0 }])
  expect(mdClean('a\\nb\n______\nc')).toBe('a\nb\n\n---\n\nc')
})

test('a JSON document reads as facts and parts; a Google Doc export of it is still JSON', () => {
  const text = (docs() as unknown as Record<string, { text: string }>).docPatAssessment00000000001.text
  const src = parseDocText(text)
  expect(src.json).toBeTruthy()
  const s = jsonStruct(src.json as Record<string, unknown>)
  expect(s.title).toBe('Assessment report')
  expect(s.facts).toEqual([
    ['Prepared for', 'Delta Advisory'],
    ['Meeting', 'Discovery consultation'],
  ])
  expect(s.secs.map((x) => [x.h, x.flag, x.kind])).toEqual([
    ['Where they are', false, 'obj'],
    ['Risks', true, 'obj'],
    ['Next steps', false, 'val'],
  ])
  expect(src.md).toContain('## Where they are')
  // Google's markdown export escapes characters; it is read back as JSON
  expect(parseDocText('\\{"title": "X", "a\\_b": 1\\}').json).toEqual({ title: 'X', a_b: 1 })
  // saved markdown stays as written; saved JSON is read as JSON
  expect(parseSaved('# Hi\\_there').json).toBeUndefined()
  expect(parseSaved('# Hi\\_there').md).toBe('# Hi\\_there')
  expect(parseSaved('{"title":"J"}').json).toEqual({ title: 'J' })
})

test('PDF text: lines in capitals read as headings', () => {
  expect(pdfToMd('PROPOSAL PRESENTATION\nSome text.\nWHAT WE WILL DO:\nMore.\nOK\nNot A Heading Line')).toBe(
    '\n## PROPOSAL PRESENTATION\n\nSome text.\n\n## WHAT WE WILL DO\n\nMore.\nOK\nNot A Heading Line',
  )
})

// ---------- running a stage (src/lib/catalyst/plan.ts) ----------

test('what each stage reads by default, and the team’s choices over it', () => {
  expect(setupOf('research', null)).toEqual({ type: 'sales', calls: false, crm: true, questions: null, emails: false, charts: null })
  expect(setupOf('assessment', null)).toEqual({ type: '', calls: true, crm: false, questions: false, emails: true, charts: null })
  expect(setupOf('proposal', null)).toEqual({ type: 'proposal', calls: true, crm: false, questions: null, emails: true, charts: true })
  const saved = { assessment: { calls: false, crm: true, questions: true, emails: false, type: 'Deep dive' }, research: { calls: true, crm: false, emails: true } }
  expect(setupOf('assessment', saved)).toEqual({ type: 'Deep dive', calls: false, crm: true, questions: true, emails: false, charts: null })
  // the prospect brief never reads calls or emails and always the CRM record, whatever is saved
  expect(setupOf('research', saved)).toEqual({ type: 'sales', calls: false, crm: true, questions: null, emails: false, charts: null })
  expect(setupOf('onboarding', { onboarding: { charts: false } }).charts).toBe(false)
})

test('what a stage needs: the proposal works from the assessment, the others ask for notes', () => {
  const none = { docs: {}, ids: { research: false, interview: false, anonymized: false } }
  expect(planFor(none, 'research')).toEqual({ doneAt: null, blocked: '', need: '', notes: false })
  expect(planFor(none, 'consultation').need).toBe('prospect brief')
  expect(planFor(none, 'assessment').need).toBe('consultation guide')
  expect(planFor({ ...none, ids: { research: false, interview: true, anonymized: false } }, 'assessment').need).toBe('prospect brief')
  expect(planFor(none, 'proposal').blocked).toBe('The proposal works from the assessment report, and this lead has none yet. Run the assessment first.')
  expect(planFor(none, 'onboarding').need).toBe('documents')
  expect(planFor({ docs: { research: 5 }, ids: none.ids }, 'review').need).toBe('')
  const all = { docs: { research: 0, proposal: 1700000000000 }, ids: { research: true, interview: true, anonymized: true } }
  expect(planFor(all, 'proposal')).toEqual({ doneAt: 1700000000000, blocked: '', need: '', notes: true })
  expect(planFor(all, 'research').doneAt).toBe(0)
})

test('the notes a run sends: the team’s notes, the CRM record, the emails, then the calls, within 44,000 characters', () => {
  const names = { assessment: 'Deep dive' }
  expect(composeNote({ typed: '  just this  ', crm: null, calls: [], emails: [], names })).toBe('just this')
  const crm = { email: 'r@example.com', first_name: 'Robin', last_name: 'Sample', company: 'Sample Peak', lifecycle_stage: 'lead', website: 'example.com' }
  expect(crmLine(crm)).toBe('Robin Sample · Sample Peak · lifecycle stage: lead · website: example.com')
  const note = composeNote({
    typed: 'We met.',
    crm,
    calls: [
      { id: '1', start: '2026-11-04T17:00:00Z', title: 'Kickoff', stage: 'assessment', text: 'A: hello' },
      { id: '2', start: '2026-11-01T17:00:00Z', title: '', stage: 'none', text: 'B: hi' },
      { id: '3', start: '2026-10-01T17:00:00Z', title: 'No text', stage: '', text: '' },
    ],
    emails: [{ at: '2026-11-05T15:00:00Z', incoming: true, subject: 'Notes', from: 'r@example.com', to: ['us@example.com'], text: 'Thanks.' }],
    names,
  })
  expect(note).toBe(
    'NOTES FROM THE TEAM\nWe met.\n\nTHE CRM RECORD (HubSpot)\nRobin Sample · Sample Peak · lifecycle stage: lead · website: example.com\n\n' +
      'EMAILS WITH THE CLIENT (HubSpot, newest first)\n\nEmail on Nov 5, 2026 from r@example.com to us@example.com: Notes\nThanks.\n\n' +
      'WHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\nCall on Nov 4, 2026: Kickoff (filed under Deep dive)\nA: hello\n\nCall on Nov 1, 2026: untitled\nB: hi',
  )
  // a long transcript is cut so the whole stays within the budget, and says so
  const long = composeNote({ typed: 'x', crm: null, calls: [{ id: '1', start: '2026-11-04T17:00:00Z', title: 'Long', stage: '', text: 'y'.repeat(60_000) }], emails: [], names })
  expect(long.length).toBeLessThanOrEqual(44_000)
  expect(long.endsWith('\n[the rest of this call is left out]')).toBe(true)
  // an email is cut at 3,000 characters, and all the emails stay within 8,000
  const mails = Array.from({ length: 5 }, (_, i) => ({ at: '2026-11-0' + (i + 1) + 'T10:00:00Z', incoming: false, subject: 'S' + i, from: '', to: ['a@example.com'], text: 'z'.repeat(5_000) }))
  const block = mailBlock(mails)
  expect(block.length).toBeLessThanOrEqual(8_000 + 60)
  expect(block.split('[the rest of this email is left out]').length - 1).toBeGreaterThanOrEqual(2)
  expect(mailBlock([{ ...mails[0], text: '   ' }])).toBe('')
})

test('the requests: the prospect brief, the custom run’s three stages and Meeting Prep', () => {
  const l = { email: 'pat@example.com', prospect_name: 'Pat  Van Example', prospect_title: 'Partner', company_name: 'Ridge', firm_type: 'ria', firm_size: '10m-50m' }
  expect(baseFields(l)).toEqual({
    firstName: 'Pat', lastName: 'Van Example', prospectName: 'Pat  Van Example', prospectTitle: 'Partner', firmName: 'Ridge', companyName: 'Ridge',
    companyUrl: '', website: '', emailAddress: 'pat@example.com', email: 'pat@example.com', phone: '', firmType: 'ria', firmSize: '10m-50m',
  })
  const r = researchBody(l)
  expect(r).toMatchObject({ hearAboutUs: 'Dashboard run', whatBringsYouHere: '', aiInterests: [], only: true, stage: 'research' })
  expect(r).not.toHaveProperty('entry')
  expect(r).not.toHaveProperty('transcript')
  const ids = { researchDocId: 'r1', interviewDocId: 'i1', anonymizedDocId: 'a1' }
  expect(customBody(l, 'consultation', 'notes', ids)).toMatchObject({ entry: 'interview_script', transcript: 'notes', extraDoc: '', from: 'board', only: true, stage: 'consultation', ...ids })
  expect(customBody(l, 'assessment', '', ids).entry).toBe('anonymizer')
  expect(customBody(l, 'proposal', '', ids).entry).toBe('growth_plan')
  expect(prepBody(l, ['pat@example.com', 'old@example.com'], 'review', { review: 'Quarterly review' }, 'n')).toEqual({
    leadEmail: 'pat@example.com', email: 'pat@example.com', emails: ['pat@example.com', 'old@example.com'], prospectName: 'Pat  Van Example',
    prospectTitle: 'Partner', companyName: 'Ridge', firmType: 'ria', firmSize: '10m-50m', stage: 'review', stageName: 'Quarterly review',
    docName: 'Client review brief', transcript: 'n', from: 'board',
  })
})

test('a run in progress: until its document lands, for 45 minutes at most', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')
  const runs = runsFromSetting({
    'a@example.com': { s: 'assessment', t0: '2026-11-09T11:30:00Z', seen: 100 },
    'old@example.com': { s: 'research', t0: '2026-11-09T11:10:00Z', seen: 0 },
    'bad@example.com': { s: 'nope', t0: '2026-11-09T11:50:00Z', seen: 0 },
  })
  expect(Object.keys(runs)).toEqual(['a@example.com', 'old@example.com'])
  const lead = { emails: ['x@example.com', 'a@example.com'], docs: {} }
  expect(runOf(lead, runs, now)).toEqual({ s: 'assessment', t0: '2026-11-09T11:30:00Z' })
  expect(runOf({ ...lead, docs: { assessment: 100 } }, runs, now)).not.toBeNull()
  expect(runOf({ ...lead, docs: { assessment: 101 } }, runs, now)).toBeNull()
  expect(runOf({ emails: ['old@example.com'], docs: {} }, runs, now)).toBeNull()
  expect(runOf({ emails: ['nobody@example.com'], docs: {} }, runs, now)).toBeNull()
})

test('a HubSpot contact’s name: first and last, never the last name twice', () => {
  expect(hsName('Pat', 'Example')).toBe('Pat Example')
  expect(hsName('Jane Doe', 'Doe')).toBe('Jane Doe')
  expect(hsName('Kim', 'kim')).toBe('Kim')
  expect(hsName('', 'Solo')).toBe('Solo')
  expect(hsName('Only', null)).toBe('Only')
  expect(hsName(null, undefined)).toBe('')
})

test('Follow: the Meta page id comes out of whatever is pasted, and the checks say what to fix', () => {
  expect(metaPageIdFrom('https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=123456789&media_type=all')).toBe('123456789')
  expect(metaPageIdFrom('https://facebook.com/somepage?ref=1')).toBe('somepage')
  expect(metaPageIdFrom('https://www.facebook.com/pg/otherpage/posts')).toBe('otherpage')
  expect(metaPageIdFrom('https://www.facebook.com/ads/library/?q=x')).toBe('https://www.facebook.com/ads/library/?q=x')
  expect(metaPageIdFrom(' 987654 ')).toBe('987654')
  expect(metaPageIdFrom('')).toBe('')

  const base = { name: 'Acme', website: '', meta: '', x: '', li: '', priority: 'medium', notes: '' }
  expect(followFields({ ...base, name: '  ' })).toEqual({ error: 'A company name is required.' })
  expect(followFields(base)).toEqual({ error: 'Add at least one scrape target: Meta page, X handle, or LinkedIn.' })
  for (const meta of ['<page_id>', 'page_id', 'your_page_id_here']) {
    expect(followFields({ ...base, meta })).toEqual({ error: 'That is still a placeholder: paste the real Ad Library link, or leave it blank.' })
  }
  expect(followFields({ ...base, x: '@acme', li: 'https://www.linkedin.com/company/acme/', priority: 'urgent' })).toEqual({
    name: 'Acme', website: '', meta: '', x: 'acme', li: 'company/acme', priority: 'medium', notes: '',
  })
  expect(followFields({ ...base, li: 'in/jane-doe', priority: 'HIGH' })).toMatchObject({ li: 'in/jane-doe', priority: 'high' })
  expect(followedText({ name: 'Acme', meta: '1' })).toBe(
    'Acme is followed now. The Intel Tracker picks them up on its next run, and the Ad Strategist pulls their Meta ads right after it.',
  )
  expect(followedText({ name: 'Acme', meta: '' })).toBe(
    'Acme is followed now. The Intel Tracker picks them up on its next run. No Meta page ID was given, so no ads will be pulled for them.',
  )
})

// ---------- Calls ----------

const FC = () => fathomCalls().map(normCall)
const FX = () => fixtures() as unknown as { call_meta: Record<string, unknown>[]; call_outputs: Record<string, unknown>[] }
const metaOf = (id: string): CallMeta | null => {
  const r = FX().call_meta.find((m) => String(m.call_id) === id)
  return r ? normMeta(r) : null
}
const outOf = (id: string): CallOutput | null => {
  const r = FX().call_outputs.find((m) => String(m.call_id) === id)
  return r ? normOutput(r) : null
}
const callRows = () => FC().map((c) => callRow(c, metaOf(c.id), outOf(c.id)))

test('a call’s client folder: the folder set, the client, the lead’s company, the guests’ company, else the team or no client yet', () => {
  const [robin, pat, team] = FC()
  const m = (x: Partial<CallMeta>): CallMeta => ({ ...normMeta({ call_id: robin.id }), ...x })
  expect(folderOf(robin, m({ folder: 'Ops', client: 'Acme' }), null, 'Lead Co')).toBe('Ops')
  expect(folderOf(robin, m({ client: 'Acme' }), null, 'Lead Co')).toBe('Acme')
  expect(folderOf(robin, null, null, 'Lead Co')).toBe('Lead Co')
  expect(folderOf(robin, null, null)).toBe('Example') // robin.sample@example.com
  expect(folderOf(pat, null, null)).toBe('Example')
  expect(folderOf(team, null, null)).toBe('AI Paragon (internal)')
  expect(folderOf(team, m({ meeting_type: 'demo' }), null)).toBe('No client yet') // a client call with no client on the invite
  expect(folderOf(team, null, normOutput({ call_id: team.id, meeting_type: 'sales' }))).toBe('No client yet')
  expect(folderOf(team, m({ guests: [{ name: 'Gail Mail', email: 'gail@gmail.com', external: true }] }), null)).toBe('Gail Mail')
  expect(companyOf('nia@northwind-advisors.co.uk')).toBe('Northwind Advisors')
  expect(companyOf('a@mail.acme.com')).toBe('Acme')
  expect(companyOf('a@outlook.com')).toBe('')
  expect(companyOf('nobody')).toBe('')
})

test('the people on a call, the type buttons, the filters and the empty lines', () => {
  const [robin] = FC()
  expect(peopleOf(robin, null).map((p) => p.name)).toEqual(['QA Teammate', 'Robin Sample'])
  expect(withLine(peopleOf(robin, null))).toBe('With Robin Sample, QA Teammate')
  expect(withLine([])).toBe('No people listed')
  const rows = callRows()
  expect(rows.map((r) => [r.call.id, r.type, r.cat, r.client])).toEqual([
    ['9001', 'discovery', 'sales', true],
    ['9004', '', 'none', true],
    ['9003', '', 'none', false],
    ['9002', 'sales', 'sales', true],
  ])
  expect(catButtons(rows, 'all')).toEqual([
    { key: '', label: 'All', n: 4 },
    { key: 'demo', label: 'Client demos', n: 0 },
    { key: 'sales', label: 'Sales', n: 2 },
    { key: 'dev', label: 'Internal development', n: 0 },
    { key: 'none', label: 'No type yet', n: 2 },
  ])
  const mine = callRow(FC()[2], normMeta({ call_id: '9003', meeting_type: 'Podcast' }), null)
  expect(catButtons([mine], 'all').map((b) => b.label)).toEqual(['All', 'Client demos', 'Sales', 'Internal development', 'Podcast'])
  const f = { q: '', folder: '', tag: '', cat: '' }
  expect(filterRows(rows, 'ext', f).map((r) => r.call.id)).toEqual(['9001', '9004', '9002'])
  expect(filterRows(rows, 'all', { ...f, q: 'robin sample' }).map((r) => r.call.id)).toEqual(['9001', '9002'])
  expect(filterRows(rows, 'all', { ...f, cat: 'sales' }).map((r) => r.call.id)).toEqual(['9001', '9002'])
  expect(folderChoices(rows, [normMeta({ call_id: 'x', folder: 'Zed' })])).toEqual(['AI Paragon (internal)', 'Example', 'Zed'])
  expect(emptyLine(rows, 'all', { ...f, cat: 'demo' })).toEqual({ text: 'Nothing under Client demos here yet.', clear: 'cat' })
  expect(emptyLine(rows, 'all', { ...f, folder: 'Zed' })).toEqual({ text: 'No calls match these filters.', clear: 'filters' })
  expect(emptyLine(rows, 'all', { ...f, q: 'zzz' }).text).toBe('No calls match that search.')
  expect(emptyLine([], 'ext', f).text).toBe('No calls with outside guests loaded yet.')
  expect(emptyLine([], 'all', f).text).toBe('No calls yet. Record one in Fathom and refresh.')
  expect(typeShort('interview')).toBe('Interview')
  expect(typeShort('Partner call')).toBe('Partner call')
  expect(hoursText(0)).toBe('0')
  expect(hoursText(125)).toBe('2.1')
  expect(hoursText(900)).toBe('15')
  expect(shareToken(FC()[0])).toBe('robinDiscovery01')
  expect(shareToken({ shareUrl: 'https://evil.example/share/robinDiscovery01' })).toBe('')
})

test('tags, a new type’s name, and what goes to Slack and HubSpot', () => {
  expect(cleanTags('#Onboarding, weekly review,, ops, ops')).toEqual(['onboarding', 'weekly-review', 'ops'])
  expect(cleanTags(Array.from({ length: 20 }, (_, i) => 't' + i).join(','))).toHaveLength(12)
  expect(newTypeProblem('a')).toBe('Give it a name, two letters or more.')
  expect(newTypeProblem('Pod<cast>')).toBe('Use letters, numbers and spaces.')
  expect(newTypeProblem('Client Demo')).toBe('That type is already in the list.')
  expect(newTypeProblem('internal development')).toBe('That type is already in the list.')
  expect(newTypeProblem('no type yet')).toBe('That type is already in the list.')
  expect(newTypeProblem('Partner call')).toBe('')

  const o = outOf('9001')!
  expect(o.tasks.map((t) => t.id)).toEqual(['t1', 't2'])
  expect(tasksText(o.tasks, false)).toBe('- [ ] Send the onboarding checklist (QA Teammate, due 2026-11-12)\n- [x] Book the assessment (Robin Sample)')
  expect(tasksText(o.tasks, true)).toBe('- [ ] Send the onboarding checklist (QA Teammate, due 2026-11-12)')
  expect(slackText({ title: 'Call', day: 'Nov 4, 2026', type: 'discovery', out: o, link: 'https://fathom.video/share/x' })).toBe(
    '*Call* · Nov 4, 2026 · Discovery\n\n*Summary*\n• Onboarding paperwork takes most of their week\n• They want one workflow automated first\n\n' +
      '*Next steps*\n• Send the onboarding checklist (QA Teammate, due 2026-11-12)\n\n<https://fathom.video/share/x|Recording in Fathom>',
  )
  const meta = normMeta({ call_id: '9001', folder: 'Sample', tags: ['a', 'b'], description: 'Notes here' })
  expect(crmBody({ type: 'discovery', meta, out: null, ftSummary: 'See [this](https://x.example) moment', link: '' })).toBe(
    'Call type: Discovery\nFolder: Sample\nTags: #a #b\n\nNotes: Notes here\n\nFathom summary:\nSee this moment\n\nLogged from the AI Paragon dashboard.',
  )
  expect(agoText('2026-11-10T11:40:00Z', Date.parse('2026-11-10T12:00:00Z'))).toBe('just now')
  expect(agoText('2026-11-10T11:30:00Z', Date.parse('2026-11-10T12:00:00Z'))).toBe('1h ago') // half an hour rounds up, as the current dashboard does
  expect(agoText('2026-11-10T06:00:00Z', Date.parse('2026-11-10T12:00:00Z'))).toBe('6h ago')
  expect(agoText('2026-11-01T12:00:00Z', Date.parse('2026-11-10T12:00:00Z'))).toBe('9d ago')
  expect(agoText('', 0)).toBe('')
})
