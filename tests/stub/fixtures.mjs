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
      { key: 'call_types', updated_by: 'qa.teammate@aiparagonconsulting.com', updated_at: '2026-10-20T10:00:00Z', value: ['Partner call'] },
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
    call_meta: [
      // Robin's intro call is filed under Prospect research; Pat's call was set aside
      { call_id: '9002', lead_email: 'robin.sample@example.com', lead_stage: 'research', meeting_type: 'sales', created_at: '2026-10-21T10:00:00Z' },
      { call_id: '9004', lead_email: PAT, lead_stage: 'none', created_at: '2026-10-31T10:00:00Z' },
    ],
    // Robin's discovery consultation has its post-call actions (the AI picked the call type); the team sync has none
    call_outputs: [
      {
        id: '40000000-0000-4000-8000-000000000001', call_id: '9001', call_title: 'Discovery consultation with Robin', meeting_type: 'discovery',
        meeting_type_guess: true, status: 'done', source: 'auto', created_by: 'qa.teammate@aiparagonconsulting.com', created_at: '2026-11-04T18:00:00Z',
        summary: ['Onboarding paperwork takes most of their week', 'They want one workflow automated first'],
        tasks: [
          { id: 't1', text: 'Send the onboarding checklist', owner: 'QA Teammate', due: '2026-11-12', why: 'They asked for it', done: false },
          { id: 't2', text: 'Book the assessment', owner: 'Robin Sample', due: '', why: '', done: true },
        ],
        deliverable: { title: 'Discovery recap: Sample Peak Partners', markdown: '## What we heard\n- Paperwork is the bottleneck\n- **Two advisors** do intake' },
        follow_up: { subject: 'Thanks for the call, Robin', body: 'Hi Robin,\n\nThanks for the time today.' },
      },
    ],
    catalyst_sources: [
      {
        id: '30000000-0000-4000-8000-000000000001', kind: 'discovery_template', file_name: 'Our discovery questions.docx', active: true,
        sections: ['Opening', 'Questions'], created_at: '2026-10-01T10:00:00Z',
      },
    ],
    agent_feedback: [],
  }
}

const TEAM = { name: 'QA Teammate', email: 'qa.teammate@aiparagonconsulting.com' }

/** Fathom's newest calls, as Dashboard · Fathom Proxy lists them (made up). */
export function fathomCalls() {
  return [
    {
      id: 9001, title: 'Discovery consultation with Robin', start: '2026-11-04T17:00:00Z', end: '2026-11-04T17:45:00Z', recorded_by: TEAM,
      invitees: [TEAM, { name: 'Robin Sample', email: 'robin.sample@example.com', external: true }],
      share_url: 'https://fathom.video/share/robinDiscovery01', url: 'https://fathom.video/calls/9001',
      summary: '## Key takeaways:\n- Paperwork takes most of the week\n    - Two advisors do intake\n[Paperwork comes up](https://fathom.video/share/robinDiscovery01?timestamp=125.5)\n\n## Next steps\n1. Send the checklist',
      actions: [
        { text: 'Send Robin the onboarding checklist', who: 'QA Teammate', t: '12:05', done: false, link: 'https://fathom.video/share/robinDiscovery01?timestamp=725' },
        { text: 'Share the case study', who: 'QA Teammate', t: '', done: true, link: '' },
      ],
    },
    {
      id: 9004, title: 'Catch-up with Pat', start: '2026-10-30T16:00:00Z', end: '2026-10-30T16:20:00Z', recorded_by: TEAM,
      invitees: [TEAM, { name: 'Pat Example', email: PAT, external: true }],
      share_url: 'https://fathom.video/share/patTeamOnly0001',
    },
    { id: 9003, title: 'Team sync', start: '2026-10-25T16:00:00Z', end: '2026-10-25T16:30:00Z', recorded_by: TEAM, invitees: [TEAM] },
    {
      id: 9002, title: 'Intro call with Robin', start: '2026-10-20T16:00:00Z', end: '2026-10-20T16:30:00Z', recorded_by: TEAM,
      invitees: [TEAM, { name: 'Robin Sample', email: 'robin.sample@example.com', external: true }],
    },
  ]
}

/** What each call's transcript says. */
export function fathomTranscripts() {
  return {
    9001: [
      { speaker: 'Robin Sample', t: '00:01', text: 'We spend hours on onboarding paperwork.' },
      { speaker: 'QA Teammate', t: '00:12', text: 'What would you stop doing first?' },
    ],
    9002: [{ speaker: 'Robin Sample', t: '00:01', text: 'We heard about you from a friend.' }],
    9003: [{ speaker: 'QA Teammate', t: '00:01', text: 'Team things.' }],
    9004: [{ speaker: 'Pat Example', t: '00:01', text: 'Just checking in.' }],
  }
}

/** The emails logged in HubSpot for each lead (Dashboard · HubSpot Emails Proxy), newest first. */
export function hubspotEmails() {
  return {
    'robin.sample@example.com': [
      { id: 'e1', at: '2026-11-05T15:00:00Z', incoming: true, subject: 'Notes from our call', from: 'robin.sample@example.com', to: [TEAM.email], text: 'Thanks for the call. The paperwork is the worst part.' },
      { id: 'e2', at: '2026-11-03T15:00:00Z', incoming: false, subject: 'Agenda', from: TEAM.email, to: ['robin.sample@example.com'], text: 'Here is the agenda for Tuesday.' },
    ],
    [PAT]: [1, 2, 3, 4].map((n) => ({
      id: 'p' + n, at: `2026-11-0${n}T15:00:00Z`, incoming: n % 2 === 0, subject: 'Follow-up ' + n,
      from: n % 2 === 0 ? PAT : TEAM.email, to: n % 2 === 0 ? [TEAM.email] : [PAT], text: 'Email number ' + n + '.',
    })).reverse(),
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

/** Fathom's older calls, the second page of its list (cursor 'page2'). */
export function fathomOlderCalls() {
  return [
    {
      id: 8001, title: 'Partner intro with Northwind', start: '2026-09-15T15:00:00Z', end: '2026-09-15T15:50:00Z', recorded_by: TEAM,
      invitees: [TEAM, { name: 'Nia North', email: 'nia@northwind-advisors.co.uk', external: true }],
    },
  ]
}
