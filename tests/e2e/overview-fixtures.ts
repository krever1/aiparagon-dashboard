// Made-up rows for the Pipeline Overview: Approvals' briefs, replies, campaigns, drafts and failed requests (the same
// rows as its own tests), the snapshot of the newest organic brief, the agents' runs, results, a strategy read, the ads
// and posts kept, and what the agents know about the team. Times count back from now.

import { fixtures } from '../stub/fixtures.mjs'
import { approvalRows, campaignRows } from './approvals-fixtures'

const H = 36e5
const D = 864e5

export function overviewRows(now = Date.now()) {
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const a = approvalRows(now)
  const c = campaignRows(now)
  const run = (n: number, agent: string, status: string, age: number) => ({
    id: 'run-' + n, run_id: agent + '_' + n, agent, status, started_at: ago(age + 10 * 60e3), finished_at: status === 'running' ? null : ago(age),
  })
  return {
    agent_outputs: [
      ...a.agent_outputs,
      // the five notes of the newest organic brief
      {
        id: '64000000-0000-4000-8000-000000000001', agent: 'intel_tracker', output_type: 'snapshot', run_id: 'intel_run_new', created_at: ago(2 * D - H),
        snapshot: JSON.stringify({
          items: [
            { text: 'Onboarding is the theme', why: 'Three firms you follow posted about slow onboarding', tag: 'Client experience' },
            { text: 'Fee talk is up', why: 'Two posts compared flat fees', tag: 'Pricing' },
            { text: 'Checklists get saved', why: 'Practical lists drew the most saves' },
          ],
        }),
      },
      ...c.campaigns,
      ...c.drafts,
      { id: '64000000-0000-4000-8000-000000000002', agent: 'strategy_insights', output_type: 'strategy_insights', run_id: 'si-1', created_at: ago(3 * D), data: {} },
    ],
    creative_briefs: a.creative_briefs,
    engagement_drafts: a.engagement_drafts,
    agent_feedback: c.adFeedback,
    content_requests: c.content_requests,
    funnel_packages: c.funnel_packages,
    e1_leads: a.e1_leads,
    dashboard_comments: a.dashboard_comments,
    runs: [
      run(1, 'low_ticket_content', 'running', 5 * 60e3),
      run(2, 'content_generation', 'error', 1 * D),
      run(3, 'intel_tracker', 'success', 2 * D),
      run(4, 'content_generation', 'success', 3 * D),
      // twelve and a half days: clear of a day boundary while the page reads the clock by the minute
      run(5, 'ad_strategist', 'success', 12 * D + 12 * H),
    ],
    content_results: [1, 2, 3].map((n) => ({ id: 'res-' + n, kind: 'post', created_at: ago(n * D) })),
    ad_records: [1, 2, 3, 4, 5].map((n) => ({ id: n, advertiser_name: 'Advertiser ' + n })),
    intel_items: [1, 2].map((n) => ({ id: 'ii-' + n, run_id: 'intel_run_new' })),
    brand_voice: [
      { id: 'bv-1', tone: ['Clear', 'Warm'], summary: 'We explain AI plainly.\nSecond line.', about: '', mission: 'Help advisors grow', values_text: '', created_at: ago(5 * D) },
    ],
    company_profile: [{ id: 1, industry: 'Wealth management consulting', target_market: '' }],
    ai_settings: [
      ...fixtures().ai_settings,
      { key: 'brand_context', value: JSON.stringify({ offer: 'AI readiness review', differentiator: '' }) },
      { key: 'intel_follow', value: { topics: ['AI governance', 'Client onboarding', 'Fees', 'Succession'], tech: [], industries: [] } },
    ],
    competitors: [
      { id: '92000000-0000-4000-8000-000000000001', name: 'Northwind Advisors', status: 'approved', created_at: ago(30 * D) },
      { id: '92000000-0000-4000-8000-000000000002', name: 'Acme Wealth', status: 'approved', created_at: ago(20 * D) },
      { id: '92000000-0000-4000-8000-000000000003', name: 'Gone Firm', status: 'denied', created_at: ago(10 * D) },
    ],
  }
}
