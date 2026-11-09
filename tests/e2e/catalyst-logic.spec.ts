import { expect, test } from '@playwright/test'
import { docs, fixtures } from '../stub/fixtures.mjs'
import { findLead, leadId } from '../../src/lib/catalyst/lead-id'
import {
  type LeadRow, type OutRow, buildLeads, docCount, docIds, docOf, derivedStage, mergeLeads, relink, stageOf,
} from '../../src/lib/catalyst/leads'
import {
  STAGES, cleanName, firmSizeLabel, firmTypeLabel, fitTone, labelCase, namesFromSetting, runLabel, stagesNamed,
} from '../../src/lib/catalyst/stages'
import { jsonStruct, mdClean, mdStruct, parseDocText, parseSaved, pdfToMd } from '../../src/lib/catalyst/doc-format'

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
