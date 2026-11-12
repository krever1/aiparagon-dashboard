// Made-up rows for the Landing pages tests: a live book-a-call page with two ads, a draft webinar page whose
// campaign was sent back, a paused download page with no campaign; four campaigns for the picker (one with no page,
// one approved by its ads); visits and sign-ups. Dates count back from now, so the 30 days hold on any day.

const D = 864e5
const H = 36e5
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const dayAgo = (n: number) => new Date(Date.now() - n * D).toISOString().slice(0, 10)

export const LP = {
  live: 'a1000000-0000-4000-8000-000000000001',
  draft: 'a1000000-0000-4000-8000-000000000002',
  paused: 'a1000000-0000-4000-8000-000000000003',
}
export const PK = {
  book: 'b2000000-0000-4000-8000-000000000001',
  web: 'b2000000-0000-4000-8000-000000000002',
  fresh: 'b2000000-0000-4000-8000-000000000003',
  ads: 'b2000000-0000-4000-8000-000000000004',
}

export const LIVE_CONTENT = {
  headline: 'Get your onboarding audit',
  subheadline: 'A 20-minute call to find where onboarding stalls.',
  who: 'Growth-stage RIAs',
  bullets: ['Where the week goes', 'What to automate first'],
  sections: [{ title: 'How it works', body: 'We look at your forms.\n\nThen we map the steps.' }],
  faq: [{ q: 'How long is the call?', a: '20 minutes.' }],
  proof: [],
  cta: 'Book my call',
  fields: ['name', 'email', 'company', 'job_title'],
  questions: [
    { key: 'q1', label: 'How many advisors?', options: ['1-5', '6-20', '21+'] },
    { key: 'q2', label: 'What slows onboarding most?', options: [] },
  ],
  thanks: { headline: 'Thanks. Pick a time that works.', body: 'We read your answers before the call.', cta: 'Pick a time', url: 'https://calendly.com/example/audit' },
  flags: ['Check the claim about two weeks'],
}

export const DRAFT_CONTENT = {
  headline: 'AI in wealth management',
  subheadline: 'A live session for advisory firms.',
  when: '[ADD date and time]',
  presenter: 'Jamie Host',
  who: '',
  bullets: ['What works today', 'What to leave alone'],
  sections: [{ title: 'Agenda', body: 'Where firms start.\n\nWhat it costs.' }],
  faq: [],
  proof: ['Run with 40 firms'],
  cta: 'Save my seat',
  fields: ['name', 'email', 'company'],
  questions: [],
  thanks: { headline: 'You are registered.', body: 'We will email you the details.', cta: '', url: '' },
  flags: ['Confirm the presenter can make it'],
}

export function landingRows() {
  return {
    landing_pages: [
      {
        id: LP.paused, slug: 'ai-readiness-checklist', title: 'AI readiness guide', status: 'paused', kind: 'download', source_type: null, source_id: null, source_run: null,
        content: {
          headline: 'The AI readiness guide', subheadline: '', bullets: [], cta: 'Send it to me', fields: ['name', 'email'],
          thanks: { headline: 'Here it is.', body: 'Get it with the button below.', cta: 'Get the guide', url: 'https://example.org/guide.pdf' },
        },
        ads: [{ code: 'PABCD-A1', n: 1, hook: 'Ready for AI?', headline: '' }],
        add_to_pipeline: false, created_by: 'pat@aiparagonconsulting.com', created_at: ago(30 * D), updated_at: ago(3 * D), published_at: ago(20 * D),
      },
      {
        id: LP.live, slug: 'onboarding-audit', title: 'Onboarding audit', status: 'live', kind: 'book_call', source_type: 'funnel_package', source_id: PK.book, source_run: 'lt-run-1',
        content: LIVE_CONTENT,
        ads: [
          { code: 'PK7Q2-A1', n: 1, hook: 'Stop losing a week to paperwork', headline: '' },
          { code: 'PK7Q2-A2', n: 2, hook: 'Your first workflow, automated', headline: '' },
        ],
        add_to_pipeline: true, created_at: ago(14 * D), updated_at: ago(1 * D), published_at: ago(10 * D),
      },
      {
        id: LP.draft, slug: 'ai-in-wealth-webinar', title: 'AI in wealth webinar', status: 'draft', kind: 'webinar', source_type: 'funnel_package', source_id: PK.web, source_run: 'fb-run-1',
        content: DRAFT_CONTENT, ads: [], add_to_pipeline: true, created_at: ago(15 * D), updated_at: ago(2 * D), published_at: null,
      },
    ],
    funnel_packages: [
      {
        id: PK.book, run_id: 'lt-run-1', funnel_type: null, status: 'pending_approval', created_at: ago(12 * D),
        setup: JSON.stringify({ title: 'Onboarding audit', booking: { url: 'https://calendly.com/example/audit' } }),
        ad_variations: JSON.stringify({ hook_variations: ['Stop losing a week to paperwork', 'Your first workflow, automated'] }),
      },
      { id: PK.web, run_id: 'fb-run-1', funnel_type: 'webinar', status: 'draft', created_at: ago(15 * D), setup: { title: 'AI in wealth webinar' }, steps: [] },
      {
        id: PK.fresh, run_id: 'fb-run-2', funnel_type: 'download', status: 'pending_review', created_at: ago(1 * D),
        setup: { title: 'AI readiness checklist', details: { 'File link': 'https://example.org/checklist.pdf' }, review_flags: ['Check the checklist link works'] },
        steps: [
          {
            key: 'optin_page', kind: 'page', title: 'Opt-in page',
            content: {
              headline: 'The AI readiness checklist — for advisory firms', subheadline: 'Twelve questions to ask before you buy a tool.',
              bullets: ['Where AI saves time', { text: 'What to keep human' }], fields: ['Name', 'Email', 'Firm'], faq: [{ q: 'Is it free?', a: 'Yes.' }, { q: 'No answer' }], cta: 'Send it to me',
            },
          },
          { key: 'thank_you_page', kind: 'page', title: 'Thank you', content: { headline: 'Here it is.', body: 'The checklist is ready.', cta: 'Get the checklist' } },
        ],
        ad_variations: { variants: [{ hook: 'Is your firm ready for AI?', headline: 'Free checklist' }, { primary_text: 'Twelve questions before you buy.' }, { headline: '' }] },
      },
      { id: PK.ads, run_id: 'lt-run-2', funnel_type: null, status: 'pending_approval', created_at: ago(2 * D), setup: JSON.stringify({ title: 'Compliance review call' }) },
    ],
    agent_outputs: [
      { id: 9101, agent: 'low_ticket_content', output_type: 'campaign', run_id: 'lt-run-1', created_at: ago(12 * D), data: JSON.stringify({ ad_images: [{ file: 'lt1-a.png' }] }) },
      { id: 9102, agent: 'low_ticket_content', output_type: 'campaign', run_id: 'lt-run-2', created_at: ago(2 * D), data: JSON.stringify({ ad_images: [{ file: 'lt2-a.png' }, { file: 'lt2-b.png' }] }) },
    ],
    agent_feedback: [
      { id: 9201, agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: 'lt2-a.png', action: 'approved', created_at: ago(1 * D) },
      { id: 9202, agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: 'lt2-b.png', action: 'approved', created_at: ago(1 * D) },
    ],
    lp_views: [
      { page_id: LP.live, day: dayAgo(1), ad_code: 'PK7Q2-A1', views: 30 },
      { page_id: LP.live, day: dayAgo(2), ad_code: '', views: 10 },
      // older than 30 days: not read
      { page_id: LP.live, day: dayAgo(40), ad_code: '', views: 500 },
      { page_id: LP.paused, day: dayAgo(5), ad_code: '', views: 5 },
    ],
    lp_signups: [
      {
        id: 'su-1', page_id: LP.live, slug: 'onboarding-audit', name: 'Pat Example', email: 'pat@example.org', company: 'Example Advisors', job_title: 'COO', phone: '',
        ad_code: 'PK7Q2-A1', utm: { source: 'meta', medium: 'paid', campaign: 'onboarding-audit', content: 'PK7Q2-A1' }, hubspot_id: 'hs-1', hubspot_error: null, lead_added: true, created_at: ago(2 * H),
      },
      {
        id: 'su-2', page_id: LP.live, slug: 'onboarding-audit', name: 'Casey Sample', email: 'casey@example.org', company: '=HYPERLINK("x")', job_title: '', phone: '+1 555 0100',
        ad_code: '', utm: {}, hubspot_id: null, hubspot_error: 'Rate limited', lead_added: false, created_at: ago(1 * D),
      },
      {
        id: 'su-3', page_id: LP.paused, slug: 'ai-readiness-checklist', name: 'Jordan Test', email: 'jordan@example.org', company: '', job_title: '', phone: '',
        ad_code: '', utm: { source: 'linkedin' }, hubspot_id: null, hubspot_error: null, lead_added: false, created_at: ago(40 * D),
      },
    ],
    company_profile: [{ id: 1, business_name: 'AI Paragon Consulting Group', industry: 'AI consulting', updated_at: ago(D) }],
  }
}
