// Made-up rows for the Ad Testing tests: four ads (one with revenue, one synced from Meta whose title holds a landing
// page ad's code, one logged by hand with the same code and no leads, one imported from a file), three posts (one with
// a link, one with a link that is not a web address, one with no impressions), a landing page with its visits and
// sign-ups, two strategy reads (a daily one with codes in its text, an older one asked for, kept as text) and what the
// next read reads, what is remembered and the house rules made from it, and the pieces a result can belong to. Dates
// count back from now.

const D = 864e5
const H = 36e5
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
export const dayAgo = (n: number) => new Date(Date.now() - n * D).toISOString().slice(0, 10)

export const R = {
  r1: 'c1000000-0000-4000-8000-000000000001',
  synced: 'c1000000-0000-4000-8000-000000000002',
  r3: 'c1000000-0000-4000-8000-000000000003',
  r4: 'c1000000-0000-4000-8000-000000000004',
  p1: 'c1000000-0000-4000-8000-000000000011',
  p2: 'c1000000-0000-4000-8000-000000000012',
  p3: 'c1000000-0000-4000-8000-000000000013',
}

const base = { platform: null, url: null, posted_on: null, period_start: null, period_end: null, notes: null, attribution: 'manual', source: null, external_id: null }
const zero = { impressions: null, reactions: null, comments: null, shares: null, clicks: null, spend: null, leads: null, qualified: null, bookings: null, won: null, revenue: null }

export function testingRows() {
  return {
    content_results: [
      {
        ...base, ...zero, id: R.r1, kind: 'ad', title: 'Stop losing a week to paperwork', platform: 'Meta ads', posted_on: dayAgo(5), created_at: ago(5 * D),
        spend: 300, impressions: 12000, clicks: 240, leads: 10, qualified: 4, bookings: 3, won: 1, revenue: 4500, notes: 'Most leads were COOs',
        source_run_id: 'lt-run-1', variant_file: 'lt1-a.png', created_by: 'pat@aiparagonconsulting.com',
      },
      {
        ...base, ...zero, id: R.synced, kind: 'ad', title: 'PK7Q2-A1 Onboarding audit — Meta', platform: 'Meta ads', period_start: dayAgo(10), period_end: dayAgo(1),
        created_at: ago(1 * D), spend: 120, impressions: 5000, clicks: 80, leads: 2, attribution: 'api', source: 'meta', external_id: 'ext-1',
      },
      {
        ...base, ...zero, id: R.r3, kind: 'ad', title: 'PK7Q2-A1 retarget, logged by hand', platform: 'Meta ads', posted_on: dayAgo(3), created_at: ago(3 * D),
        spend: 999, impressions: 900, clicks: 9, leads: 0,
      },
      {
        ...base, ...zero, id: R.r4, kind: 'ad', title: 'Your first workflow, automated', platform: 'LinkedIn ads', posted_on: dayAgo(8), created_at: ago(8 * D),
        spend: 200, impressions: 3000, clicks: 30, leads: 4, attribution: 'csv',
      },
      {
        ...base, ...zero, id: R.p1, kind: 'post', title: 'Why onboarding stalls — a field note', platform: 'LinkedIn', posted_on: dayAgo(6), created_at: ago(6 * D),
        impressions: 4000, reactions: 120, comments: 30, shares: 10, clicks: 50, url: 'https://www.linkedin.com/posts/example-1',
      },
      {
        ...base, ...zero, id: R.p2, kind: 'post', title: 'The 3-step intake', platform: 'Instagram', created_at: ago(2 * D),
        impressions: 1000, reactions: 5, comments: 0, shares: 0, clicks: 3, url: 'javascript:alert(1)',
      },
      { ...base, ...zero, id: R.p3, kind: 'post', title: 'Newsletter #12', platform: 'Newsletter', created_at: ago(4 * D), clicks: 40 },
    ],
    agent_outputs: [
      {
        id: 'sr-1', agent: 'strategy_insights', output_type: 'strategy_insights', run_id: 'insights_daily', title: 'Strategy read', created_at: ago(2 * D),
        data: {
          daily: true, requested_by: 'Daily read', focus: '', review_flags: [],
          refs: {
            OB: { kind: 'brief', which: 'organic', run_id: 'agent1_run_9', label: 'Organic brief · 2026-11-09' },
            AB: { kind: 'brief', which: 'paid', run_id: 'agent2_run_9', label: 'Advertisement brief · 2026-11-08' },
            C1: { kind: 'campaign', id: 'lt-1', run_id: 'lt-run-1', label: 'Campaign · 2026-11-06 · Onboarding Audit' },
            R1: { kind: 'result', label: 'Post · Why onboarding stalls' },
          },
          insights: {
            headline: 'Lead with the onboarding audit',
            summary: 'Posts about onboarding got the most saves [R1], and the audit campaign is still running [C1].',
            vision_fit: { read: 'It fits the offer [AB].', gaps: ['No proof from a client yet [ZZ].'] },
            missing: ['Log the results of the audit ads.', 'Save two ideas.'],
            recommendations: [
              { title: 'Post the audit checklist', why: 'It got the most saves [R1].', angle: 'Show the three steps.', evidence: ['[OB]', '[R1]'], start: 'source', format: 'thought_leadership', priority: 'now' },
              { title: 'Run a second audit ad', why: '', angle: '', evidence: ['[C1]'], start: 'marketing', format: 'ad', priority: 'next' },
            ],
            double_down: ['Keep the audit hook [C1].', 'Post on Tuesdays.'],
            change_or_stop: ['Stop the long intro.'],
            content_mix: 'Two posts a week and one ad.',
          },
        },
      },
      {
        id: 'sr-2', agent: 'strategy_insights', output_type: 'strategy_insights', run_id: 'insights_asked', title: 'Strategy read', created_at: ago(9 * D),
        data: JSON.stringify({
          requested_by: 'pat@aiparagonconsulting.com', focus: 'What should we post next month?', review_flags: ['Two results were logged without dates.'],
          refs: {},
          insights: { headline: 'Book more diagnostic calls', summary: '', vision_fit: {}, missing: ['Log your first results.'], recommendations: [], double_down: [], change_or_stop: [] },
        }),
      },
      { id: 'ob-1', agent: 'intel_tracker', output_type: 'intel_brief', run_id: 'agent1_run_9', title: 'Organic brief', created_at: ago(3 * D), data: {} },
      { id: 'dr-1', agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-1', title: 'Why onboarding stalls', created_at: ago(3 * D), data: {} },
      {
        id: 'lt-1', agent: 'low_ticket_content', output_type: 'funnel_package', run_id: 'lt-run-1', created_at: ago(6 * D),
        data: JSON.stringify({ offer_name: 'Onboarding Audit', ad_images: [{ file: 'lt1-a.png' }, { file: 'lt1-b.png' }] }),
      },
    ],
    funnel_packages: [
      { id: 'pk-1', run_id: 'lt-run-1', status: 'pending_approval', created_at: ago(6 * D), ad_variations: JSON.stringify({ hook_variations: ['Stop losing a week to paperwork', 'Your first workflow, automated'] }) },
    ],
    content_pieces: [{ id: 'cp-1', title: 'Onboarding checklist — library', updated_at: ago(D) }],
    landing_pages: [
      {
        id: 'lp-1', slug: 'onboarding-audit', title: 'Onboarding audit', status: 'live', kind: 'book_call', published_at: ago(10 * D), updated_at: ago(D),
        ads: [
          { code: 'PK7Q2-A1', n: 1, hook: 'Stop losing a week to paperwork', headline: '' },
          { code: 'PK7Q2-A2', n: 2, hook: 'Your first workflow, automated', headline: '' },
        ],
      },
      { id: 'lp-2', slug: 'never-live', title: 'Never live', status: 'draft', kind: 'landing', published_at: null, updated_at: ago(D), ads: [{ code: 'PZZZZ-A1', n: 1, hook: 'Not shown' }] },
    ],
    lp_views: [
      { page_id: 'lp-1', day: dayAgo(1), ad_code: 'PK7Q2-A1', views: 30 },
      { page_id: 'lp-1', day: dayAgo(2), ad_code: '', views: 10 },
    ],
    lp_signups: [
      { id: 'su-1', page_id: 'lp-1', ad_code: 'PK7Q2-A1', created_at: ago(1 * H) },
      { id: 'su-2', page_id: 'lp-1', ad_code: 'PK7Q2-A1', created_at: ago(1 * D) },
      { id: 'su-3', page_id: 'lp-1', ad_code: '', created_at: ago(2 * D) },
      // older than 30 days: not counted
      { id: 'su-4', page_id: 'lp-1', ad_code: 'PK7Q2-A1', created_at: ago(40 * D) },
    ],
    creative_briefs: [{ id: 'cb-1', run_id: 'agent2_run_9', created_at: ago(4 * D) }],
    brand_voice: [{ id: 'bv-1', created_at: ago(10 * D) }],
    idea_notes: [
      { id: 'in-1', status: null },
      { id: 'in-2', status: 'used' },
    ],
    ai_settings: [
      {
        key: 'e3_prefs',
        value: { read_id: 'sr-1', memory: [{ id: 'read:sr-1:dd:1', text: 'Double down: Post on Tuesdays.', at: ago(D), by: 'pat@aiparagonconsulting.com' }] },
      },
    ],
    ai_rules: [
      { id: 'rule-mem-1', rule: 'The team asked to remember: Double down: Post on Tuesdays.', category: 'Other', applies_to: ['content_generation'], active: true, source: 'profile:memory', created_by: 'pat@aiparagonconsulting.com' },
      { id: 'rule-man-1', rule: 'Never promise results.', category: 'Compliance', applies_to: ['all'], active: true, source: 'manual', created_by: 'pat@aiparagonconsulting.com' },
    ],
  }
}
