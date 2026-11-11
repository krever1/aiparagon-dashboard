// Made-up rows for the Intel Tracker: three runs (the newest with six posts and two replies, one whose posts are not
// stored, one that did not finish), the organic briefs behind two of them, and who and what it follows. People and firms
// are invented, links point at example addresses. Several columns are JSON kept as text, as they are live.

import { fixtures } from '../stub/fixtures.mjs'

const j = (v: unknown) => JSON.stringify(v)
export const RUN_A = 'agent1_2026-11-09_1400'
export const RUN_B = 'agent1_2026-11-02_1400'
export const RUN_C = 'agent1_2026-10-26_1300'
export const P = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const R = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const C = (n: number) => `92000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const U = (n: number) => `https://www.linkedin.com/posts/example-post-${n}`

export const BRIEF_MD = [
  '# Organic brief',
  '',
  '## TL;DR',
  '- **Proof beats promises:** Northwind’s post on client results drew 340 reactions as advisors ask for evidence of results.',
  '- **Onboarding in days:** Firms now promise client onboarding in days, not weeks, and show the checklist.',
  '- **Governance checklists spread:** Security and governance checklists for advisors are shared widely.',
  '- **Step by step AI guides:** How-to guides on AI adoption for advisors keep their readers.',
  '',
  '## 1. Evidence',
  `- Quoted: [Northwind Advisors](${U(1)})`,
].join('\n')

const parts = (relevance: number, engagement: number, timeliness: number, opportunity: number, credibility: number) =>
  j({ relevance, engagement, timeliness, opportunity, credibility })

function post(n: number, o: Record<string, unknown>) {
  return {
    id: P(n),
    run_id: RUN_A,
    platform: 'linkedin',
    url: U(n),
    published_at: `2026-11-0${Math.min(n + 2, 9)}T10:00:00Z`,
    source: 'api_pull',
    type: 'post',
    competitor_id: null,
    author_name: null,
    author_title: null,
    author_company: null,
    sophistication_shift: false,
    sophistication_note: null,
    engagement_opportunity: null,
    raw_text: null,
    score_why: null,
    ad_context_value: null,
    engagement_score: 0.5,
    created_at: '2026-11-09T14:05:00Z',
    ...o,
  }
}

export function intelRows() {
  return {
    runs: [
      {
        id: 'run-a', run_id: RUN_A, agent: 'intel_tracker', status: 'success', started_at: '2026-11-09T14:00:00Z', finished_at: '2026-11-09T14:08:00Z',
        run_date: '2026-11-09', stats: j({ items: 6, high_value: 2, drafts: 2 }),
      },
      {
        id: 'run-b', run_id: RUN_B, agent: 'intel_tracker', status: 'success', started_at: '2026-11-02T14:00:00Z', finished_at: '2026-11-02T14:09:00Z',
        run_date: '2026-11-02', stats: j({ items: 4, high_value: 1, drafts: 0 }),
      },
      { id: 'run-c', run_id: RUN_C, agent: 'intel_tracker', status: 'error', started_at: '2026-10-26T13:00:00Z', finished_at: null, run_date: '2026-10-26', stats: j({}) },
      // another agent's run is not the tracker's
      { id: 'run-x', run_id: 'agent2_2026-11-09_1700', agent: 'ad_strategist', status: 'success', started_at: '2026-11-09T17:00:00Z', finished_at: '2026-11-09T17:05:00Z', stats: j({}) },
    ],
    agent_outputs: [
      {
        id: '93000000-0000-4000-8000-000000000001', run_id: RUN_A, agent: 'intel_tracker', output_type: 'intel_brief', title: 'Organic brief',
        created_at: '2026-11-09T14:08:00Z', content_md: BRIEF_MD,
        data: j({
          n_items: 6, n_high_value: 2, n_engagement_drafts: 2, keep: 3, read: 50, run_type: 'weekly', run_source: 'schedule',
          window_start: '2026-11-02 14:00 UTC', window_end: '2026-11-09 14:00 UTC',
          items: [{ url: U(1), competitor: 'Northwind Advisors' }, { url: U(2) }, { url: U(3) }],
          high_value_items: [{ url: U(1), signal: 'Clients ask for proof of results – before they book a call' }],
          sophistication_shifts: [{ url: U(2), note: 'Firms now promise onboarding in days, not weeks', competitor: 'Example Ridge Advisors' }],
          engagement_drafts: [{ url: U(1) }],
          topic_watch: { security: [{ url: U(3), competitor: 'Contoso Planning', summary: 'A security checklist for advisors' }] },
          top_themes: [{ theme: 'ai-adoption', count: 3 }, { theme: 'client-experience', count: 3 }, { theme: 'governance', count: 1 }],
          focus: { themes: ['ai-adoption', 'client-experience', 'governance'], categories: ['opinion', 'educational', 'case_studies'] },
        }),
      },
      {
        id: '93000000-0000-4000-8000-000000000002', run_id: RUN_B, agent: 'intel_tracker', output_type: 'intel_brief', title: 'Organic brief',
        created_at: '2026-11-02T14:09:00Z', content_md: '## TL;DR\n- **Fee talk is up:** Flat fees came up in four posts.',
        data: j({
          n_items: 4, n_high_value: 1, run_type: 'weekly', window_start: '2026-10-26 14:00 UTC', window_end: '2026-11-02 14:00 UTC',
          top_themes: [{ theme: 'value-and-results', count: 3 }, { theme: 'ai-adoption', count: 1 }],
        }),
        snapshot: j({ items: [{ text: 'Flat fees are the talk of the week', why: 'Four posts compared flat and asset-based fees', tag: 'Pricing' }] }),
      },
    ],
    intel_items: [
      post(1, {
        author_name: 'Northwind Advisors', author_title: 'Wealth partners', headline: 'Show the proof, not the promise',
        summary: 'Northwind shares client results and the evidence behind them.', working: 'Concrete client results with numbers.',
        signal: 'Advisors want proof before they book a call', score: 82, score_parts: parts(90, 80, 70, 85, 75),
        score_why: 'On topic for advisors and backed by numbers.', themes: j(['ai-adoption', 'client-experience']),
        observed_engagement: j({ likes: 300, comments: 30, shares: 10 }), engagement_total: 340, content_format: 'Opinion post',
        engagement_opportunity: 'Reply with one of your own results.', raw_text: 'Line one of the post.\nLine two of the post.',
      }),
      post(2, {
        author_name: 'Example Ridge Advisors', headline: 'Onboarding in days, not weeks', summary: 'How one firm moved client onboarding from weeks to days.',
        working: 'A checklist anyone can copy.', score: 71, score_parts: parts(80, 60, 70, 75, 60), themes: j(['client-experience']),
        observed_engagement: j({ likes: 100, comments: 15, shares: 5 }), engagement_total: 120, content_format: 'Case study',
        sophistication_shift: true, sophistication_note: 'Firms now promise onboarding in days, not weeks',
      }),
      post(3, {
        author_company: 'Contoso Planning', headline: 'A governance checklist for advisors', summary: 'Security and governance steps before using AI tools.',
        working: 'Practical and saved by many.', score: 58, score_parts: parts(70, 40, 60, 55, 50), themes: j(['governance', 'other']),
        observed_engagement: j({ likes: 50, comments: 8, shares: 2 }), engagement_total: 60, content_format: 'How-to guide', source: 'keyword_search',
      }),
      post(4, {
        competitor_id: C(2), headline: 'We are hiring', summary: 'A hiring post for an operations role.', working: 'Off-topic for advisors: a hiring post.',
        score: 40, score_parts: parts(20, 90, 50, 30, 50), themes: j(['hiring']), observed_engagement: j({ likes: 850, comments: 40, shares: 10 }),
        engagement_total: 900, content_format: 'News',
      }),
      post(5, {
        platform: 'web', url: 'https://example.com/ai-guide', author_name: 'Fabrikam Insights', headline: 'An AI adoption guide for advisors',
        summary: 'Step by step AI adoption for small advisory firms.', working: 'Clear steps.', score: 66, score_parts: parts(85, 0, 60, 80, 70),
        themes: j(['ai-adoption']), observed_engagement: j({}), engagement_total: null, content_format: 'How-to guide', source: 'keyword_search',
      }),
      post(6, {
        author_name: 'Pat Voice', headline: 'Rules are coming', summary: 'A take on new regulation for advisors.', working: 'Strong opinion.',
        score: 50, score_parts: parts(55, 40, 60, 50, 45), themes: j(['regulation']), observed_engagement: j({ likes: 20, comments: 5, shares: 0 }),
        engagement_total: 25, content_format: 'Opinion post',
      }),
    ],
    engagement_drafts: [
      {
        id: R(1), run_id: RUN_A, intel_item_id: P(1), competitor_name: 'Northwind Advisors', platform: 'linkedin', action: 'comment', source_url: U(1),
        draft: 'Proof wins. We see the same with our clients.', status: 'pending', created_at: '2026-11-09T14:07:00Z',
      },
      {
        id: R(2), run_id: RUN_A, intel_item_id: P(2), competitor_name: 'Example Ridge Advisors', platform: 'linkedin', action: 'quote_post', source_url: U(2),
        draft: 'Days, not weeks: this is the bar now.', status: 'approved', created_at: '2026-11-09T14:06:00Z',
      },
    ],
    competitors: [
      { id: C(1), name: 'Northwind Advisors', handle_linkedin: 'company/northwind-advisors', status: 'approved', follow_kind: 'company', follow_for: 'both', added_by: 'qa.teammate@aiparagonconsulting.com', created_at: '2026-10-01T10:00:00Z' },
      { id: C(2), name: 'Acme Wealth', website: 'acme.example', status: 'approved', follow_kind: null, follow_for: null, created_at: '2026-10-02T10:00:00Z' },
      { id: C(3), name: 'Pat Voice', handle_linkedin: 'in/pat-voice', status: 'approved', follow_for: 'both', created_at: '2026-10-03T10:00:00Z' },
      { id: C(4), name: 'Ads Only Co', meta_page_id: '12345', status: 'approved', follow_for: 'ads', created_at: '2026-10-04T10:00:00Z' },
      { id: C(5), name: 'Stopped Firm', handle_linkedin: 'company/stopped-firm', status: 'denied', created_at: '2026-10-05T10:00:00Z' },
    ],
    ai_settings: [
      ...fixtures().ai_settings,
      { key: 'agent_runs', value: { intel: { cadence: 'weekly', day: 'mon', time: '06:00', tz: 'America/Los_Angeles', read: 50, keep: 3 } } },
      { key: 'intel_follow', value: { topics: ['AI governance'], tech: ['Microsoft Copilot'], industries: [] } },
      { key: 'intel_keywords', value: ['AI governance', 'Microsoft Copilot'] },
      { key: 'ad_industries', value: { 'northwind advisors': 'Wealth management' } },
    ],
    company_profile: [{ id: 1, industry: 'AI consulting for wealth management firms', target_market: 'Growth-stage RIAs and independent advisory firms' }],
  }
}
