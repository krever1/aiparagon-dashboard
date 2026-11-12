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
    action: 'comment',
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
    // no leads and no comments here (the stand-in's own leads would wait on their next document); their tests seed them
    e1_leads: [] as Record<string, unknown>[],
    dashboard_comments: [] as Record<string, unknown>[],
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

/** A comment's id (dashboard_comments ids are uuids). */
export const CM = (n: number) => `73000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/**
 * Leads and comments for Approvals. Lee is in Assessment with his prospect brief and consultation guide: he waits on the
 * assessment report. Wes is a weak fit, Dana has her client review brief, and Max's consultation guide is being
 * written, so none of them waits. Two open comments (one on Lee's consultation guide, one on a brief; one saved with
 * resolved left empty) and a resolved one.
 */
export function catalystRows(now = Date.now()) {
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const doc = (n: number, run: string, agent: string, name: string, age: number, data: Record<string, unknown> = {}) => ({
    id: `74000000-0000-4000-8000-${String(n).padStart(12, '0')}`, run_id: run, agent, output_type: 'json', title: name, created_at: ago(age),
    content_md: '', data: { prospectName: name, ...data },
  })
  return {
    e1_leads: [
      { email: 'lee.ready@example.com', prospect_name: 'Lee Ready', company_name: 'Ready Example LLC', fit_rating: 'Strong', stage: 'assessment', updated_at: ago(H) },
      { email: 'wes.weak@example.com', prospect_name: 'Wes Weak', company_name: 'Weak Example Co', fit_rating: 'Weak', updated_at: ago(2 * H) },
      { email: 'dana.done@example.com', prospect_name: 'Dana Done', company_name: 'Done Example Group', fit_rating: 'Moderate', stage: 'review', updated_at: ago(3 * H) },
      { email: 'max.busy@example.com', prospect_name: 'Max Busy', company_name: 'Busy Example Partners', fit_rating: 'Strong', stage: 'consultation', updated_at: ago(4 * H) },
    ],
    agent_outputs: [
      doc(1, 'lee.ready@example.com', 'lead_research', 'Lee Ready', 3 * D),
      doc(2, 'lee.ready@example.com', 'interview_script', 'Lee Ready', 2 * D),
      doc(3, 'dana.done@example.com', 'meeting_prep', 'Dana Done', D, { stage: 'review', stage_name: 'Client review', doc_name: 'Client review brief' }),
      doc(4, 'max.busy@example.com', 'lead_research', 'Max Busy', 2 * D),
    ],
    ai_settings: [
      { key: 'catalyst_runs', value: { 'max.busy@example.com': { s: 'consultation', t0: ago(5 * 60e3), seen: 0, by: 'someone@aiparagonconsulting.com' } } },
    ],
    dashboard_comments: [
      {
        id: CM(1), target_key: 'e1:lee.ready@example.com:interview_script', author: 'Erin Example', body: 'Ask about the custodian move before the call.',
        created_at: ago(2 * H), resolved: false, resolved_by: null, parent_id: null,
      },
      {
        id: CM(2), target_key: 'brief:agent1_2026-11-08_0700', author: 'robin@example.com', body: 'Can we drop the fee posts?',
        created_at: ago(D), resolved: null, resolved_by: null, parent_id: null,
      },
      {
        id: CM(3), target_key: 'funnel:agent3_2026-11-05_0900:tab5', author: 'Sam Sample', body: 'The landing page headline is too long.',
        created_at: ago(2 * D), resolved: true, resolved_by: 'Sam Sample', parent_id: null,
      },
    ] as Record<string, unknown>[],
  }
}
