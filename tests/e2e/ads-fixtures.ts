// Made-up rows for the Ad Strategist: nine ads (six from the Meta Ad Library, two uploads, one from the swipe file),
// three ads briefs (the newest from the last run, one built from uploads, an old one with no snapshot), the runs, who it
// follows, the searches and filters, the industries and a set of ad copy. Dates count back from now, so whether an ad is
// still running holds on any day. Advertisers and links are invented; ad_records is read through the winner_creatives
// view, as in the project.

import { fixtures } from '../stub/fixtures.mjs'

const j = (v: unknown) => JSON.stringify(v)
const DAY = 864e5
export const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString()
export const ymd = (d: number) => ago(d).slice(0, 10)

export const RUN1 = `agent2_${ymd(2)}_1400`
/** When the newest run finished: a little over two days ago, as the page's clock is to the minute. */
export const RUN1_AT = ago(2.05)
export const RUN2 = `agent2_${ymd(30)}_1300`
export const RUN0 = `agent2_${ymd(40)}_0900`
export const CUSTOM = `agent2_custom_${ymd(10)}_1200`
export const UP1 = `upload_${ymd(5)}`
export const UP2 = `upload_${ymd(1)}`

/** An ad's id: A(1) to A(6) from the Ad Library, A(7) and A(8) uploads, A(9) the swipe file's. */
export const A = (n: number) => `93000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const CO = (n: number) => `94000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const LIB = (n: number) => `https://www.facebook.com/ads/library/?id=20000${n}`

const MD1 = [
  '# Ads brief',
  '',
  '## 1. Summary',
  'Proof-first ads keep running.',
  '',
  '## 8. Ads behind this brief (3 curated · 2 advertisers · best of each advertiser first, running before stopped)',
  '1. **Northwind Advisors** — proven · active · 84d · score 0.82',
  '   "Your clients want proof, not promises"',
  `   ${LIB(1)}`,
  '2. **Example Ridge Advisors** — proven · active · 50d · score 0.71',
  '   "The checklist advisors keep"',
  `   ${LIB(4)}`,
  '3. **Northwind Advisors** — emerging · active · 30d · score 0.60',
  '   "Onboard clients in days, not weeks"',
  `   ${LIB(2)}`,
  '',
  '## 9. Notes',
].join('\n')

const MD0 = ['# Ads brief', '', '## 8. Ads behind this brief (1 curated · 1 advertiser)', '1. **Example Ridge Advisors** — stopped · 12d', '   "Stop losing a week to paperwork"', `   ${LIB(3)}`].join('\n')

function ad(n: number, o: Record<string, unknown>) {
  return {
    id: A(n),
    competitor_id: null,
    platform: 'facebook',
    source: 'meta_ad_library',
    ad_library_url: '',
    format: 'image',
    first_seen: null,
    last_seen: null,
    days_running: null,
    longevity_flag: null,
    impressions_range: null,
    observed_engagement: null,
    performance_score: null,
    hook: '',
    body: '',
    cta: '',
    destination_url: '',
    copy_formula: null,
    offer_inferred: null,
    price_point_inferred: null,
    funnel_stage: null,
    iteration_group: null,
    extracted_patterns: null,
    created_at: ago(2),
    advertiser_name: '',
    self_liquidating: null,
    run_id: RUN1,
    run_date: ymd(2),
    image_url: null,
    score_overridden: false,
    is_active: null,
    stale_days: null,
    upload_analysis: null,
    uploaded_by: null,
    image_urls: null,
    in_brief: true,
    ...o,
  }
}

export function adsRows() {
  const base = fixtures()
  return {
    ad_records: [
      ad(1, {
        advertiser_name: 'Northwind Advisors',
        hook: 'Your clients want proof, not promises',
        body: 'See the results in a week.\nBook a free review.',
        cta: 'Book now',
        offer_inferred: 'Free readiness review',
        price_point_inferred: 0,
        days_running: 84,
        first_seen: ymd(85),
        last_seen: ymd(1),
        performance_score: 0.82,
        ad_library_url: LIB(1),
        destination_url: 'https://northwind.example.com/review',
        iteration_group: 'g1',
        extracted_patterns: j(['Proof first: opens with a client result', 'Scarcity: limited spots']),
        copy_formula: 'Problem -> Proof -> Offer',
        funnel_stage: 'bof',
        impressions_range: '1K-5K',
        created_at: ago(2),
      }),
      ad(2, {
        advertiser_name: 'Northwind Advisors',
        hook: 'Onboard clients in days, not weeks',
        body: 'Our checklist does the paperwork.',
        cta: 'Learn more',
        offer_inferred: 'Onboarding audit',
        days_running: 30,
        first_seen: ymd(31),
        last_seen: ymd(1),
        performance_score: 0.6,
        ad_library_url: LIB(2),
        iteration_group: 'g1',
        created_at: ago(2.1),
      }),
      ad(3, {
        advertiser_name: 'Example Ridge Advisors',
        hook: 'Stop losing a week to paperwork',
        cta: 'Sign up',
        days_running: 12,
        first_seen: ymd(32),
        last_seen: ymd(20),
        performance_score: 0.4,
        ad_library_url: LIB(3),
        run_id: RUN0,
        run_date: ymd(40),
        created_at: ago(40),
      }),
      ad(4, {
        advertiser_name: 'Example Ridge Advisors',
        hook: 'The checklist advisors keep',
        body: 'Download the checklist.',
        cta: 'Download',
        offer_inferred: 'Advisor checklist',
        days_running: 50,
        first_seen: ymd(53),
        last_seen: ymd(3),
        performance_score: 0.71,
        ad_library_url: LIB(4),
        created_at: ago(2.2),
      }),
      ad(5, {
        advertiser_name: 'Example Retail',
        hook: '{{product.name}}',
        body: '{{product.brand}}',
        cta: 'Shop now',
        days_running: 40,
        first_seen: ymd(41),
        last_seen: ymd(1),
        performance_score: 0.5,
        ad_library_url: LIB(5),
        created_at: ago(2.3),
      }),
      ad(6, {
        advertiser_name: 'Harbor Example Group',
        hook: 'Your first workflow, automated in a week',
        cta: 'Book a call',
        offer_inferred: 'Workflow sprint',
        first_seen: ymd(30),
        last_seen: ymd(15),
        ad_library_url: LIB(6),
        in_brief: false,
        created_at: ago(2.4),
      }),
      ad(7, {
        source: 'upload',
        advertiser_name: 'Old Mill Advisors',
        hook: 'Paperwork in an afternoon',
        body: 'We sort your client files for you.',
        cta: 'Get started',
        offer_inferred: 'Paperwork review',
        extracted_patterns: j(['Time saving: a concrete number', 'Proof first: a before and after']),
        upload_analysis: j({
          status: 'done',
          takeaways: ['Opens with the time it saves', 'Shows the checklist on the image'],
          visual: { visual_hook: 'A stack of paper shrinking', text_on_image: 'One afternoon' },
        }),
        uploaded_by: 'qa.teammate@aiparagonconsulting.com',
        destination_url: 'https://oldmill.example.com/review',
        run_id: UP1,
        run_date: ymd(5),
        created_at: ago(5),
      }),
      ad(8, {
        source: 'upload',
        advertiser_name: 'Old Mill Advisors',
        upload_analysis: j({ status: 'pending', pasted_copy: 'Advisors: get your week back.' }),
        uploaded_by: 'someone@aiparagonconsulting.com',
        image_url: 'https://cdn.example.com/upload-8.png',
        run_id: UP2,
        run_date: ymd(1),
        created_at: ago(1),
      }),
      ad(9, {
        source: 'swipe_file',
        advertiser_name: 'Contoso Planning',
        hook: 'Plan your next decade',
        offer_inferred: 'Planning session',
        days_running: 100,
        image_url: 'swipe:contoso-1',
        run_id: RUN0,
        run_date: ymd(40),
        created_at: ago(40.5),
      }),
    ],
    agent_outputs: [
      { id: 'ao-1', agent: 'ad_strategist', output_type: 'creative_brief', run_id: RUN1, created_at: ago(2), content_md: MD1, data: j({}), snapshot: null },
      {
        id: 'ao-2',
        agent: 'ad_strategist',
        output_type: 'snapshot',
        run_id: RUN1,
        created_at: ago(2),
        content_md: null,
        data: null,
        snapshot: j({
          items: [
            { text: 'Proof-first openings keep running', why: 'Northwind’s proof ad ran 84 days and is still live.', tag: 'Hook' },
            { text: 'Checklists pull downloads', why: 'Example Ridge’s checklist ad ran 50 days.', tag: 'Offer' },
          ],
        }),
      },
      { id: 'ao-3', agent: 'ad_strategist', output_type: 'creative_brief', run_id: CUSTOM, created_at: ago(10), content_md: '# Ads brief from uploads', data: j({ custom: true, source_ad_ids: [A(7)] }), snapshot: null },
      { id: 'ao-4', agent: 'ad_strategist', output_type: 'creative_brief', run_id: RUN0, created_at: ago(40), content_md: MD0, data: j({}), snapshot: null },
      {
        id: 'ao-5',
        agent: 'ad_copywriter',
        output_type: 'ad_copy',
        run_id: 'copy-1',
        title: 'Ad copy from Old Mill',
        created_at: ago(4),
        content_md: '',
        data: j({
          platform: 'Facebook',
          source_ads: [A(7)],
          takeaways: ['Lead with the time saved'],
          // a list, as the copy writer sends it; the picture and the pattern under the names it saves them by
          guideline_notes: ['Kept to plain words', 'No promises of results'],
          variants: [
            { angle: 'Time back', hook: 'Get your Fridays back', primary_text: 'We sort the paperwork so you can see clients.', headline: 'Paperwork, sorted', cta: 'Book a call', image_direction: 'A clear desk', pattern_borrowed: 'Time saving' },
            { angle: 'Proof', hook: 'Forty files in an afternoon', primary_text: 'Here is how one firm did it.', headline: 'See how', cta: 'Learn more' },
          ],
        }),
      },
    ],
    creative_briefs: [
      {
        id: 'cb-1',
        run_id: RUN1,
        created_at: ago(2),
        run_date: ymd(2),
        source_intel_run: null,
        source_ad_ids: j([A(1), A(4)]),
        winning_hooks: j(['Your clients want proof, not promises']),
        winning_offers: j([]),
        core_pain_points: j(['Paperwork eats the week']),
        objection_themes: j([]),
        cross_niche_sources: j([]),
        copy_formula: 'Problem -> Proof -> Offer',
        differentiation_angle: 'Show proof the client can check in a week.',
        sophistication_level: 'medium',
        confidence: 0.64,
      },
      {
        id: 'cb-2',
        run_id: CUSTOM,
        created_at: ago(10),
        run_date: ymd(10),
        source_intel_run: null,
        source_ad_ids: j([A(7)]),
        winning_hooks: j(['Paperwork in an afternoon']),
        winning_offers: j([]),
        core_pain_points: j([]),
        objection_themes: j([]),
        cross_niche_sources: j([]),
        copy_formula: null,
        differentiation_angle: null,
        sophistication_level: 'low',
        confidence: 0.5,
      },
      {
        id: 'cb-0',
        run_id: RUN0,
        created_at: ago(40.05),
        run_date: ymd(40),
        source_intel_run: null,
        source_ad_ids: null,
        winning_hooks: j(['Stop losing a week to paperwork']),
        winning_offers: j([]),
        core_pain_points: j([]),
        objection_themes: j([]),
        cross_niche_sources: j([]),
        copy_formula: null,
        differentiation_angle: null,
        sophistication_level: 'high',
        confidence: 0.55,
      },
    ],
    runs: [
      { run_id: RUN1, agent: 'ad_strategist', run_date: ymd(2), started_at: ago(2.06), finished_at: RUN1_AT, status: 'success', stats: j({ curated_ads: 3, advertisers: 2, confidence: 0.6 }) },
      { run_id: RUN2, agent: 'ad_strategist', run_date: ymd(30), started_at: ago(30), finished_at: null, status: 'error', stats: j({}) },
      { run_id: RUN0, agent: 'ad_strategist', run_date: ymd(40), started_at: ago(40.01), finished_at: ago(40), status: 'success', stats: j({ advertisers: 1 }) },
      { run_id: 'agent1_other', agent: 'intel_tracker', run_date: ymd(1), started_at: ago(1), finished_at: ago(1), status: 'success', stats: j({}) },
    ],
    competitors: [
      { id: CO(1), name: 'Northwind Advisors', meta_page_id: 'northwind.advisors', follow_for: 'ads', follow_kind: 'company', status: 'approved', handle_linkedin: '', handle_x: '', website: '', added_by: 'qa.teammate@aiparagonconsulting.com', created_at: ago(60), notes: null },
      { id: CO(2), name: 'Example Ridge Advisors', meta_page_id: '123456789', follow_for: null, follow_kind: 'company', status: 'approved', handle_linkedin: 'company/example-ridge', handle_x: '', website: '', added_by: '', created_at: ago(50), notes: null },
      { id: CO(3), name: 'Fabrikam Insights', meta_page_id: '', follow_for: null, follow_kind: 'person', status: 'approved', handle_linkedin: 'in/fabrikam', handle_x: '', website: '', added_by: '', created_at: ago(40), notes: null },
      { id: CO(4), name: 'Contoso Planning', meta_page_id: 'contoso.planning', follow_for: 'posts', follow_kind: 'company', status: 'approved', handle_linkedin: '', handle_x: '', website: '', added_by: '', created_at: ago(30), notes: null },
      { id: CO(5), name: 'Stopped Example Co', meta_page_id: 'stopped.example', follow_for: 'ads', follow_kind: 'company', status: 'denied', handle_linkedin: '', handle_x: '', website: '', added_by: '', created_at: ago(20), notes: null },
    ],
    company_profile: [{ id: 1, industry: 'AI consulting for wealth management firms', target_market: 'Independent advisors' }],
    agent_feedback: [] as Record<string, unknown>[],
    ai_settings: [
      ...base.ai_settings.filter((r: { key: string }) => !['agent_runs', 'ads_follow', 'ad_industries', 'ad_industries_ai', 'ad_runs'].includes(r.key)),
      { key: 'agent_runs', value: { ads: { top: 6, behind: 24, per_advertiser: 4, after_intel: true } }, updated_by: 'x', updated_at: ago(9) },
      {
        key: 'ads_follow',
        value: { keywords: ['AI automation', 'client onboarding'], industries: ['Wealth management'], types: ['image'], active: 'active', country: 'US' },
        updated_by: 'x',
        updated_at: ago(9),
      },
      { key: 'ad_industries', value: { 'northwind advisors': 'Financial advice' }, updated_by: 'x', updated_at: ago(9) },
      { key: 'ad_industries_ai', value: { 'example ridge advisors': 'Wealth management', 'old mill advisors': 'Paperwork services' }, updated_by: 'x', updated_at: ago(9) },
    ] as Record<string, unknown>[],
  }
}
