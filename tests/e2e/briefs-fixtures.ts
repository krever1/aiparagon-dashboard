// Made-up rows for the Market Intelligence Briefs: two organic briefs (the newest in the live markdown format with its
// posts, an older custom run someone edited), two ads briefs (the newest built from ads named by id, an older one that
// lists its ads in its markdown), a creative brief from a content request, and a company profile with a persona, an
// offer and approved proof. People and firms are invented; links point at example addresses. Several columns hold
// JSON as text, as they do live. Times count back from now.

import { fixtures } from '../stub/fixtures.mjs'

const H = 36e5
const D = 864e5
const j = (v: unknown) => JSON.stringify(v)

export const ORG1 = 'agent1_2026-11-09_1400'
export const ORG2 = 'agent1_2026-11-02_1400'
export const ADS1 = 'agent2_2026-11-09_1412'
export const ADS2 = 'agent2_2026-10-10_0900'
export const P = (n: number) => `94000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const W = (n: number) => `95000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const CR = '96000000-0000-4000-8000-000000000001'
export const POST = (n: number) => `https://www.linkedin.com/posts/example-post-${n}`
export const LIB = (n: number) => `https://www.facebook.com/ads/library/?id=10000${n}`

export const ORG_MD = [
  '# Organic brief · 9 Nov 2026',
  '',
  '## 1. TL;DR · the short version',
  '- **Proof beats promises:** Advisors ask for evidence of results before they book a call.',
  '- **Onboarding in days:** Firms now promise client onboarding in days, not weeks.',
  '',
  '## 2. Signal snapshot',
  'Six posts read.',
  '',
  '## 3. What changed',
  '**Shift: From promises to proof**',
  '- Advisors now lead with client results, not features.',
  `- **Evidence:** [Northwind Advisors](${POST(1)}): A post on client results drew 340 reactions.`,
  '- **For our content:** Lead with one real result per post.',
  '',
  '**Shift: Onboarding speed is the new differentiator**',
  '- Firms compete on how fast a client is set up.',
  `- **Evidence:** [Example Ridge Advisors](${POST(9)}): Onboarding in days, not weeks.`,
  '- **For our content:** Show your onboarding checklist.',
  '',
  '## 4. Notable developments',
  '**Thought leadership**',
  `**A governance checklist** · [Contoso Planning](${POST(3)}): Security steps before using AI tools. *Why it matters:* Buyers ask about governance first.`,
  '**Product news**',
  '**New AI notetaker** · [Fabrikam Insights](https://example.com/notetaker): A notetaker built for advisors. *Why it matters:* Shows where tooling is heading.',
  '- Nothing this period.',
  '',
  '## 5. Topic watch · Security · Governance · AI adoption',
  'See the data.',
].join('\n')

export const ADS2_MD = [
  '# Ads brief',
  '',
  '**Evidence:** 2 proven + 1 emerging',
  '',
  '## 8. Ads behind this brief',
  '1. **Harbor Example Group** - PROVEN · active · 64d · score 0.71',
  '"Your first workflow, automated in a week"',
  LIB(4),
  '2. **Old Mill Advisors** - EMERGING · ended · uploaded · swipe_file',
  '"Stop losing a week to paperwork"',
  LIB(5),
  '',
  '## 9. Notes',
].join('\n')

function post(n: number, o: Record<string, unknown>) {
  return {
    id: P(n),
    run_id: ORG1,
    platform: 'linkedin',
    url: POST(n),
    published_at: `2026-11-0${n + 2}T10:00:00Z`,
    source: 'api_pull',
    type: 'post',
    competitor_id: null,
    author_name: null,
    author_company: null,
    sophistication_shift: false,
    raw_text: null,
    created_at: '2026-11-09T14:05:00Z',
    ...o,
  }
}

const parts = (a: number, b: number, c: number, d: number, e: number) => j({ relevance: a, engagement: b, timeliness: c, opportunity: d, credibility: e })

export function briefRows(now = Date.now()) {
  const ago = (ms: number) => new Date(now - ms).toISOString()
  return {
    agent_outputs: [
      {
        id: '97000000-0000-4000-8000-000000000001', run_id: ORG1, agent: 'intel_tracker', output_type: 'intel_brief', title: 'Organic brief', created_at: ago(2 * D), content_md: ORG_MD,
        data: j({
          n_items: 48, n_high_value: 5, n_kept: 3, keep: 3, read: 50, n_engagement_drafts: 1, n_irrelevant_filtered: 6, n_low_engagement_filtered: 4,
          run_type: 'weekly', run_source: 'schedule', industry: 'AI consulting for wealth management firms',
          window_start: '2026-11-02 14:00 UTC', window_end: '2026-11-09 14:00 UTC',
          items: [
            { url: POST(1), competitor: 'Northwind Advisors', headline: 'Show the proof, not the promise', engagement_total: 340, format: 'Opinion post', working: 'Concrete client results.' },
            { url: POST(2), competitor: 'Example Ridge Advisors', engagement_total: 120, summary: 'How one firm moved onboarding from weeks to days', signal: 'Speed sells.' },
            { url: POST(3), author_name: 'Contoso Planning', engagement_total: null, type: 'how_to' },
          ],
          top_themes: [{ theme: 'client-experience', count: 4 }, { theme: 'ai-adoption', count: 2 }, { theme: 'other', count: 9 }],
          topic_watch: { security: [{ url: POST(3), competitor: 'Contoso Planning', summary: 'A security checklist for advisors' }], governance: [] },
        }),
      },
      {
        id: '97000000-0000-4000-8000-000000000002', run_id: ORG1, agent: 'intel_tracker', output_type: 'snapshot', created_at: ago(2 * D - H),
        snapshot: j({
          items: [
            { text: 'Proof beats promises', why: 'Northwind shows client results with numbers', tag: 'Client experience' },
            { text: 'Onboarding in days', why: 'Firms now promise onboarding in days, not weeks' },
            { text: 'Governance checklists spread', why: 'Security steps before AI tools' },
          ],
        }),
      },
      {
        id: '97000000-0000-4000-8000-000000000003', run_id: ORG2, agent: 'intel_tracker', output_type: 'intel_brief', title: 'Organic brief', created_at: ago(9 * D),
        content_md: '## TL;DR\n- **Fee talk is up:** Flat fees came up in four posts.\n\n## 4. Notable developments\n**Pricing**\n**Flat fees** · [Acme Wealth](https://example.com/fees): Four posts on flat fees.',
        data: j({
          n_items: 30, n_high_value: 2, run_source: 'custom',
          review: { by: 'erin@example.com', at: ago(8 * D), hidden: ['dev'], removed: [], original: { md: 'before' } },
        }),
      },
      // the ads brief's markdown with its list of ads (the older one), and the newest one's
      { id: '97000000-0000-4000-8000-000000000004', run_id: ADS2, agent: 'ad_strategist', output_type: 'creative_brief', created_at: ago(32 * D), content_md: ADS2_MD, data: j({}) },
      {
        id: '97000000-0000-4000-8000-000000000005', run_id: ADS1, agent: 'ad_strategist', output_type: 'creative_brief', created_at: ago(2 * D), content_md: '# Ads brief\n\n**Evidence:** 9 proven + 4 emerging',
        data: j({}), snapshot: j({
          items: [
            { text: 'Proof-first openings keep running', why: 'Results in the first line', tag: 'Hook' },
            { text: 'Free readiness reviews', why: 'A free review as the first step', tag: 'Offer' },
          ],
          hook_sources: [{ key: 'your clients want proof', ads: [LIB(1)], who: ['Northwind Advisors'], note: '' }],
        }),
      },
    ],
    intel_items: [
      post(1, { author_name: 'Northwind Advisors', headline: 'Show the proof, not the promise', summary: 'Northwind shares client results.', working: 'Concrete client results.', score: 82, score_parts: parts(90, 80, 70, 85, 75), themes: j(['client-experience']), observed_engagement: j({ likes: 300, comments: 30, shares: 10 }), engagement_total: 340, content_format: 'Opinion post' }),
      post(2, { author_name: 'Example Ridge Advisors', headline: 'Onboarding in days, not weeks', summary: 'Onboarding from weeks to days.', score: 71, score_parts: parts(80, 60, 70, 75, 60), themes: j(['client-experience']), observed_engagement: j({ likes: 100, comments: 15, shares: 5 }), engagement_total: 120, content_format: 'Case study' }),
      post(3, { author_company: 'Contoso Planning', headline: 'A governance checklist for advisors', summary: 'Security and governance steps before using AI tools.', score: 58, score_parts: parts(70, 40, 60, 55, 50), themes: j(['governance']), observed_engagement: j({}), engagement_total: null, content_format: 'How-to guide' }),
    ],
    engagement_drafts: [
      { id: '98000000-0000-4000-8000-000000000001', run_id: ORG1, intel_item_id: P(1), competitor_name: 'Northwind Advisors', platform: 'linkedin', action: 'comment', source_url: POST(1), draft: 'Proof wins. We see it too.', status: 'pending', created_at: ago(2 * D) },
    ],
    competitors: [{ id: '92000000-0000-4000-8000-000000000001', name: 'Northwind Advisors', status: 'approved', created_at: ago(30 * D) }],
    runs: [
      { id: 'run-o1', run_id: ORG1, agent: 'intel_tracker', status: 'success', started_at: ago(2 * D + 10 * 60e3), finished_at: ago(2 * D) },
      { id: 'run-a1', run_id: ADS1, agent: 'ad_strategist', status: 'success', started_at: ago(2 * D + 5 * 60e3), finished_at: ago(2 * D) },
      { id: 'run-a2', run_id: ADS2, agent: 'ad_strategist', status: 'success', started_at: ago(32 * D + 5 * 60e3), finished_at: ago(32 * D) },
    ],
    creative_briefs: [
      {
        id: '99000000-0000-4000-8000-000000000001', run_id: ADS1, created_at: ago(2 * D), run_date: '2026-11-09', source_intel_run: ORG1,
        source_ad_ids: [W(1), W(2), W(3)],
        winning_hooks: j(['Your clients want proof, not promises', { pattern: 'Onboarding in days, not weeks' }, 'One workflow, automated first']),
        winning_offers: j([{ type: 'Free readiness review', price_point: '$0', notes: 'A 30-minute call with a scorecard.' }, 'Paid audit']),
        core_pain_points: j(['Paperwork eats the advisors’ week', 'Clients wait weeks to be onboarded']),
        objection_themes: j(['We tried AI and it made mistakes']),
        cross_niche_sources: j(['Accounting firms lead with a free health check', { pattern: 'Dental clinics show before and after' }]),
        copy_formula: 'Problem -> Proof -> Offer',
        differentiation_angle: 'Most firms sell features; the firm’s angle is “proof you can check in a week”. It’s not about tools.',
        sophistication_level: 'medium', confidence: 0.62,
      },
      {
        id: '99000000-0000-4000-8000-000000000002', run_id: ADS2, created_at: ago(32 * D), run_date: '2026-10-10', source_intel_run: ORG2, source_ad_ids: null,
        winning_hooks: j(['Stop losing a week to paperwork']), winning_offers: j([]), core_pain_points: j([]), objection_themes: j([]), cross_niche_sources: j([]),
        copy_formula: null, differentiation_angle: null, sophistication_level: 'high', confidence: 0.55,
      },
    ],
    winner_creatives: [
      { id: W(1), advertiser_name: 'Northwind Advisors', hook: 'Your clients want proof, not promises', body: 'See the results.', cta: 'Book now', offer_inferred: 'Free readiness review', ad_library_url: LIB(1), days_running: 60, is_active: true, performance_score: 0.81, source: 'meta_ad_library', run_id: ADS1 },
      { id: W(2), advertiser_name: 'Example Ridge Advisors', hook: 'Onboarding in days, not weeks', body: 'Our checklist.', cta: 'Learn more', offer_inferred: 'Onboarding audit', ad_library_url: '', uploaded_by: 'someone@aiparagonconsulting.com', source: 'upload', run_id: ADS1 },
      { id: W(3), advertiser_name: 'Example Retail', hook: '{{product.name}}', body: '{{product.brand}}', cta: 'Shop now', offer_inferred: '', ad_library_url: LIB(3), days_running: 12, is_active: false, last_seen: ago(40 * D), performance_score: 0.3, source: 'meta_ad_library', run_id: ADS1 },
      { id: W(4), advertiser_name: 'Harbor Example Group', hook: 'Your first workflow, automated in a week', body: 'Start small.', cta: 'Book a call', offer_inferred: 'Workflow sprint', ad_library_url: LIB(4), days_running: 64, is_active: true, performance_score: 0.71, source: 'meta_ad_library', run_id: ADS2 },
      { id: W(5), advertiser_name: 'Old Mill Advisors', hook: 'Stop losing a week to paperwork', body: 'We fix it.', cta: '', offer_inferred: 'Paperwork review', ad_library_url: LIB(5), days_running: 20, is_active: false, source: 'swipe_file', run_id: ADS2 },
    ],
    ad_records: [
      { id: 'ar-4', advertiser_name: 'Harbor Example Group', hook: 'Your first workflow, automated in a week', cta: 'Book a call', ad_library_url: LIB(4), days_running: 64, is_active: true, run_id: ADS2, performance_score: 0.71 },
      { id: 'ar-5', advertiser_name: 'Old Mill Advisors', hook: 'Stop losing a week to paperwork', cta: '', ad_library_url: LIB(5), days_running: 20, is_active: false, run_id: ADS2, uploaded_by: 'someone@aiparagonconsulting.com', performance_score: 0.4 },
    ],
    agent_feedback: [] as Record<string, unknown>[],
    content_requests: [
      {
        id: CR, created_at: ago(5 * H), title: 'Newsletter from the webinar', format: 'newsletter', status: 'done', output_id: '9a000000-0000-4000-8000-000000000001',
        brief: j({ title: 'Why onboarding stalls', substance: ['Our three-step onboarding', 'A client story'], packaging: 'Lead with the delay buyers feel', claims: ['5 days on average, from our own records'], requested_outputs: 'One newsletter issue' }),
      },
      { id: '96000000-0000-4000-8000-000000000002', created_at: ago(6 * H), title: 'Not done', format: 'email', status: 'error', brief: j({ title: 'Failed' }) },
    ],
    client_personas: [
      { id: 'pe-1', name: 'Ops lead', role: 'Head of Operations', firm: 'Example Advisory Group', is_default: false, archived: false, created_at: ago(20 * D) },
      { id: 'pe-0', name: 'Archived', role: 'Gone', firm: 'Gone', is_default: true, archived: true, created_at: ago(30 * D) },
    ],
    offers: [{ id: 'of-1', name: 'Readiness Review', price: 500, price_label: '$500', action: null, is_default: true, archived: false, created_at: ago(10 * D) }],
    client_proof: [
      { id: 'pf-0', name: 'Old', claim: 'Expired', source: 'Our records', status: 'approved', expires_on: '2020-01-01', archived: false, created_at: ago(40 * D) },
      { id: 'pf-1', name: 'Example Case', claim: 'Cut onboarding to 5 days', source: 'Client records', status: 'approved', expires_on: null, archived: false, created_at: ago(20 * D) },
    ],
    company_profile: [{ id: 1, industry: 'AI consulting for wealth management firms', target_market: 'Growth-stage RIAs; independent firms' }],
    ai_settings: [...fixtures().ai_settings] as Record<string, unknown>[],
  }
}
