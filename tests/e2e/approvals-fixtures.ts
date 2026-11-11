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

/** Where the made-up ad images live: the stand-in's address, which the browser tests answer with a tiny picture. */
export const IMG = 'http://127.0.0.1:54399/storage/v1/object/public/creatives/'
export const RUN1 = 'agent3_2026-11-08_1000'
export const RUN2 = 'agent3_2026-11-05_0900'
export const RUN3 = 'agent3_2026-11-02_0800'
export const RUN4 = 'agent3_2026-10-30_0800'
export const file = (run: string, v: string) => `onboarding-audit-${run}-${v}.png`
export const RQ = (n: number) => `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const DR = (n: number) => `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/**
 * Part B's rows: campaigns of book a call and low-ticket (agent_outputs, data kept as a JSON string, as the live rows
 * are), their packages' hooks and their images' decisions, content requests and content drafts.
 */
export function campaignRows(now = Date.now()) {
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const img = (run: string, v: string, label: string) => ({ file: file(run, v), url: IMG + file(run, v), label, variant: v.toUpperCase() })
  const camp = (n: number, run: string, age: number, data: Record<string, unknown>) => ({
    id: `62000000-0000-4000-8000-${String(n).padStart(12, '0')}`, agent: 'low_ticket_content', output_type: 'campaign', run_id: run,
    created_at: ago(age), data: JSON.stringify(data),
  })
  const fb = (n: number, target: string, action: string, age: number, type = 'ad_image_variant') => ({
    id: `63000000-0000-4000-8000-${String(n).padStart(12, '0')}`, agent: 'low_ticket_content', target_type: type, target_id: target, action,
    feedback: '', author: 'someone@aiparagonconsulting.com', created_at: ago(age),
  })
  return {
    campaigns: [
      // an earlier row of the newest campaign: only the newest row of a run counts
      camp(1, RUN1, 3 * D + H, { offer_name: 'Old draft of the audit', ad_images: [img(RUN1, 'z', 'Gone')] }),
      camp(2, RUN1, 3 * D, {
        offer_name: 'Onboarding Audit',
        ad_images: [img(RUN1, 'a', 'Checklist'), img(RUN1, 'b', 'Bold headline'), img(RUN1, 'c', 'Calm photo'), { label: 'No file yet' }],
      }),
      camp(3, RUN2, 6 * D, { ad_images: [img(RUN2, 'a', 'Scorecard layout'), { ...img(RUN2, 'b', 'Minimal headline'), url: 'javascript:alert(1)' }] }),
      camp(4, RUN3, 9 * D, { offer_name: 'Decided', ad_images: [img(RUN3, 'a', 'Approved already')] }),
      // a fourth campaign: only the three newest are read
      camp(5, RUN4, 12 * D, { offer_name: 'Too old', ad_images: [img(RUN4, 'a', 'Not shown')] }),
    ],
    funnel_packages: [
      { id: 'pk-2', run_id: RUN2, status: 'pending_approval', created_at: ago(6 * D), ad_variations: JSON.stringify({ hook_variations: [{ hook: 'Onboarding in days, not weeks' }] }) },
      { id: 'pk-1', run_id: RUN1, status: 'pending_approval', created_at: ago(3 * D), ad_variations: JSON.stringify({ hook_variations: ['Stop losing a week to paperwork', '', 'Your first workflow, automated'] }) },
    ],
    adFeedback: [
      fb(1, file(RUN1, 'a'), 'approved', 2 * D),
      // turned down, then undone: waiting again
      fb(2, file(RUN1, 'b'), 'rejected', 2 * D),
      fb(3, file(RUN1, 'b'), 'reopened', 1 * D),
      fb(4, file(RUN3, 'a'), 'approved', 8 * D),
      { ...fb(5, DR(3), 'ready', 1 * D, 'draft_review'), agent: 'content_generation' },
    ],
    content_requests: [
      { id: RQ(1), title: 'LinkedIn post from the webinar', status: 'error', error: 'The transcript could not be read.', created_at: ago(4 * H) },
      { id: RQ(2), title: 'Newsletter from the report', status: 'done', error: null, created_at: ago(5 * H) },
      { id: RQ(3), title: null, status: 'error', error: null, created_at: ago(2 * D) },
    ],
    drafts: [
      {
        id: DR(1), agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-1', title: 'Draft title', created_at: ago(6 * H),
        data: JSON.stringify({ title: 'Draft title', brief: { title: 'Why onboarding stalls' }, format: 'thought_leadership', hooks: [{ text: 'Most firms lose a week to onboarding.' }] }),
      },
      {
        id: DR(2), agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-2', title: null, created_at: ago(1 * D),
        data: { format: 'report', body: 'Onboarding takes too long. '.repeat(20) },
      },
      {
        id: DR(3), agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-3', title: 'Marked ready', created_at: ago(2 * D),
        data: { title: 'Marked ready', format: 'email' },
      },
    ],
  }
}
