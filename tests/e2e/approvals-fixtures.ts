// Made-up rows for Approvals: an organic brief, an ads brief and replies the Intel Tracker drafted, from made-up firms
// at example addresses. Times count back from now, so a week and 14 days hold whatever day the tests run.

const H = 36e5
const D = 864e5

/** A reply's id (the page only writes replies whose id is a uuid). */
export const RID = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const INTEL_MD = [
  '# Intel brief',
  '',
  '## TL;DR',
  '- **Onboarding is the theme:** Three firms you follow posted about slow client onboarding this week.',
  '- **Fee talk** is up again: two posts on [flat fees](https://example.com/fees).',
  '',
  '## What they posted',
  '- Not part of the TL;DR',
].join('\n')

export function reply(n: number, competitor: string, age: number, now = Date.now(), extra: Record<string, unknown> = {}) {
  return {
    id: RID(n),
    competitor_name: competitor,
    platform: 'linkedin',
    action: 'reply',
    status: 'pending',
    draft: `Thanks for sharing this, ${competitor}. We see the same with onboarding.`,
    source_url: `https://www.linkedin.com/feed/update/urn:li:activity:${7000000000000000000 + n}`,
    created_at: new Date(now - age).toISOString(),
    ...extra,
  }
}

export function approvalRows(now = Date.now()) {
  const ago = (ms: number) => new Date(now - ms).toISOString()
  return {
    agent_outputs: [
      {
        id: '60000000-0000-4000-8000-000000000001', agent: 'intel_tracker', output_type: 'intel_brief', run_id: 'intel_run_new',
        created_at: ago(2 * D), content_md: INTEL_MD, data: { n_items: 12 },
      },
      {
        id: '60000000-0000-4000-8000-000000000002', agent: 'intel_tracker', output_type: 'intel_brief', run_id: 'intel_run_old',
        created_at: ago(9 * D), content_md: '## TL;DR\n- An older brief', data: { n_items: 3 },
      },
    ],
    creative_briefs: [
      {
        id: '61000000-0000-4000-8000-000000000001', run_id: 'ads_run_new', created_at: ago(20 * D + 2 * H),
        winning_hooks: JSON.stringify(['Onboarding should take days, not weeks', 'One workflow, automated first']),
        core_pain_points: JSON.stringify(['Paperwork eats the advisors’ week']),
      },
    ],
    engagement_drafts: [
      reply(1, 'Northwind Advisors', 1 * H, now),
      reply(2, 'Sample Peak Partners', 3 * H, now, { action: 'quote_post', platform: 'X', source_url: 'javascript:alert(1)' }),
      reply(3, 'Example Ridge Advisors', 5 * H, now),
      reply(4, 'Acme Wealth', 1 * D, now),
      reply(5, 'Contoso Planning', 2 * D, now),
      reply(6, 'Fabrikam Capital', 3 * D, now),
      reply(7, 'Old Mill Advisors', 9 * D, now),
      reply(8, 'Harbor Example Group', 12 * D, now),
      // approved already: not waiting
      reply(9, 'Already Done LLC', 2 * H, now, { status: 'approved' }),
    ],
    agent_feedback: [] as Record<string, unknown>[],
  }
}
