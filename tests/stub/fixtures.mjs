// The stand-in's starting rows: made-up people at example.com, never real CRM rows. Each test starts from these
// (POST /__reset), and can replace tables with its own rows (POST /__seed).
//
// The leads, and where each sits on the board:
// - Pat Example: no stage saved, every older document (the follow-up guide and the proposal were saved under the
//   anonymizer's placeholder email and are linked back by name), so Proposal. Has a HubSpot contact and an upload.
// - Robin Sample: moved to Discovery consultation (renamed "Kickoff call" by the team); its prospect brief is only a
//   link saved on the lead.
// - Lee Client: in Onboarding, with an onboarding plan written.
// - Sam Synth: no e1_leads row, only a prospect brief, so Prospect research (a lead made up from its document).
// - Jordan Merge: two rows of the same person plus an anonymized row, merged into one lead; nothing written yet.
// - Casey Review: moved to Client review, nothing written.

const PAT = 'pat.example@example.com'
const HOLDER = 'contact@deltaadvisory.com'

const RESEARCH_MD = `# Pre-meeting prospect brief: Pat Example

**Firm:** Example Ridge Advisors · **Prepared by:** Catalyst

A made-up brief for the tests.

## Who they are
- An advisory firm with a small team
- Founded by Pat Example

## What to ask
1. How do they onboard clients?
2. Where does the time go?
3. What did they try before?

## Watch for
<img src="x" onerror="window.__xss = 1"> <script>window.__xss = 2</script> [a bad link](javascript:window.__xss=3) and [a good one](https://example.com/about).
`

const INTERVIEW_MD = `# Consultation guide

## Opening
Thank them for the time.

## Questions
- What does a good week look like?
- What would you stop doing first?
`

const ONBOARDING_MD = `# Onboarding plan: Lee Client

## What was agreed
- A pilot with two advisors

## The first weeks
- Week 1: set up
- Week 2: first review
`

export function fixtures() {
  return {
    e1_leads: [
      {
        email: PAT, prospect_name: 'Pat Example', prospect_title: 'Managing Partner', company_name: 'Example Ridge Advisors',
        firm_type: 'ria', firm_size: '10m-50m', lead_source: 'landing_page', fit_rating: 'Strong', ai_readiness: 'High',
        status: 'growth_plan', stage: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-11-05T10:00:00Z',
      },
      {
        email: 'robin.sample@example.com', prospect_name: 'Robin Sample', company_name: 'Sample Peak Partners',
        firm_type: 'other_company', fit_rating: 'Medium', stage: 'consultation',
        lead_research_url: 'https://docs.google.com/document/d/docRobinResearch00000001/edit',
        created_at: '2026-10-02T10:00:00Z', updated_at: '2026-11-04T10:00:00Z',
      },
      {
        email: 'lee.client@example.com', prospect_name: 'Lee Client', company_name: 'Client Harbor Group', firm_type: 'wealth',
        fit_rating: 'Weak', stage: 'onboarding', created_at: '2026-10-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
      },
      {
        email: 'jordan@example.com', prospect_name: 'Jordan Merge', company_name: 'Merge Works', firm_type: 'advisory',
        created_at: '2026-10-20T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
      },
      {
        email: 'jordan.old@example.com', prospect_name: 'Jordan Merge', company_name: 'Merge Works (old)', fit_rating: 'Strong',
        created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-21T10:00:00Z',
      },
      {
        email: HOLDER, prospect_name: 'Jordan Merge', company_name: 'Delta Advisory', fit_rating: 'Weak',
        created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z',
      },
      {
        email: 'casey.review@example.com', prospect_name: 'Casey Review', company_name: 'Review Lane LLC', stage: 'review',
        created_at: '2026-09-01T10:00:00Z', updated_at: '2026-10-30T10:00:00Z',
      },
    ],
    agent_outputs: [
      {
        id: '10000000-0000-4000-8000-000000000001', run_id: PAT, agent: 'lead_research', output_type: 'json',
        title: 'Pre-meeting prospect brief: Pat Example', created_at: '2026-10-05T09:00:00Z', content_md: RESEARCH_MD,
        data: { prospectName: 'Pat Example', companyName: 'Example Ridge Advisors', documentId: 'docPatResearch0000000000001' },
      },
      {
        id: '10000000-0000-4000-8000-000000000002', run_id: PAT, agent: 'interview_script', output_type: 'json',
        title: 'Consultation guide', created_at: '2026-10-08T09:00:00Z', content_md: INTERVIEW_MD,
        data: { prospectName: 'Pat Example', companyName: 'Example Ridge Advisors', documentId: 'docPatInterview000000000001', status: 'sent' },
      },
      {
        id: '10000000-0000-4000-8000-000000000003', run_id: PAT, agent: 'anonymizer', output_type: 'json',
        title: 'Assessment report', created_at: '2026-10-12T09:00:00Z', content_md: '',
        data: { prospectName: 'Pat Example', companyName: 'Delta Advisory', documentId: 'docPatAssessment00000000001', callDate: '2026-10-11' },
      },
      {
        // saved under the placeholder email before Oct 21: linked back to Pat by name
        id: '10000000-0000-4000-8000-000000000004', run_id: HOLDER, agent: 'discovery_call', output_type: 'json',
        title: 'Follow-up guide', created_at: '2026-10-14T09:00:00Z', content_md: '',
        data: { prospectName: 'Pat Example', companyName: 'Delta Advisory', documentId: 'docPatFollowUp0000000000001' },
      },
      {
        id: '10000000-0000-4000-8000-000000000005', run_id: HOLDER, agent: 'growth_plan', output_type: 'json',
        title: 'Proposal presentation', created_at: '2026-10-16T09:00:00Z', content_md: '',
        data: {
          prospectName: 'Pat Example', companyName: 'Delta Advisory', documentId: 'docPatGrowthEmpty0000000001',
          pdfUrl: 'https://drive.google.com/file/d/pdfPatGrowth00000000000001/view', gammaDocUrl: 'https://docs.google.com/document/d/docPatGamma000000000000001/edit',
        },
      },
      {
        id: '10000000-0000-4000-8000-000000000006', run_id: 'sam.synth@example.com', agent: 'lead_research', output_type: 'json',
        title: 'Pre-meeting prospect brief: Sam Synth', created_at: '2026-11-02T09:00:00Z', content_md: '# Brief\n\nShort.',
        data: { prospectName: 'Sam Synth', companyName: 'Synth Partners' },
      },
      {
        id: '10000000-0000-4000-8000-000000000007', run_id: 'lee.client@example.com', agent: 'meeting_prep', output_type: 'json',
        title: 'Onboarding plan: Lee Client', created_at: '2026-11-03T12:00:00Z', content_md: ONBOARDING_MD,
        data: { stage: 'onboarding', stage_name: 'Onboarding', doc_name: 'Onboarding plan', prospectName: 'Lee Client' },
      },
    ],
    ai_settings: [
      {
        key: 'catalyst_stages', updated_by: 'qa.teammate@aiparagonconsulting.com', updated_at: '2026-11-01T10:00:00Z',
        value: { consultation: { name: 'Kickoff call', by: 'qa.teammate@aiparagonconsulting.com', at: '2026-11-01T10:00:00Z' } },
      },
    ],
    hubspot_contacts: [
      {
        email: PAT, first_name: 'Pat', last_name: 'Example', company: 'Example Ridge Advisors', job_title: 'Managing Partner',
        phone: '555-0100', lifecycle_stage: 'lead', lead_status: 'NEW', website: 'example.com', hs_id: '1001',
        synced_at: '2026-11-05T06:00:00Z',
      },
    ],
    lead_files: [
      {
        id: '20000000-0000-4000-8000-000000000001', lead_email: PAT, file_name: 'Intake notes.docx',
        file_url: 'https://example.com/files/intake-notes.docx', file_path: 'pat/intake-notes.docx', stage: 'manual', source: 'upload',
        note: 'From the first call', uploaded_by: 'qa.teammate@aiparagonconsulting.com', indexed_at: '2026-10-06T10:00:00Z',
        created_at: '2026-10-06T09:00:00Z',
      },
    ],
    call_meta: [],
    agent_feedback: [],
  }
}

/** Documents the Doc Reader stand-in can read, by Google Doc or Drive file id. */
export function docs() {
  return {
    docPatAssessment00000000001: {
      kind: 'doc',
      text: JSON.stringify({
        title: 'Assessment report',
        header: { prepared_for: 'Delta Advisory', meeting: 'Discovery consultation' },
        sections: [
          { heading: 'Where they are', content: 'A small team that does most work by hand.' },
          { heading: 'Risks', type: 'flag', items: ['Client data in spreadsheets', 'No written process'] },
        ],
        next_steps: ['Map the intake', 'Pick one workflow to automate'],
      }),
    },
    docPatGrowthEmpty0000000001: { kind: 'doc', text: '' },
    pdfPatGrowth00000000000001: { kind: 'pdf', text: 'PROPOSAL PRESENTATION\nA made-up presenter script.\nWHAT WE WILL DO:\nStart with intake.' },
    docPatFollowUp0000000000001: { ok: false, message: 'Google says this document is private.' },
    docRobinResearch00000001: { kind: 'doc', text: '# Robin brief\n\n## Notes\n- From the link on the lead' },
  }
}
