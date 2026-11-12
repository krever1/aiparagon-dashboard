// Made-up rows for the Content Transformation tests: seven requests (a LinkedIn post written from an article, a story
// still being read, one that failed, one queued and not picked up, one made from the briefs, a newsletter from a new
// idea, a presentation deck), the drafts Content from Source wrote for them (the newest kept as text, as some live rows
// are), their reviews (one marked ready, two changes asked), the library (a piece kept from the ad draft, one of the
// team's own, one archived), the team's ideas (two open, one used) and the newest organic brief with its snapshot.
// Dates count back from now; every id the page writes is a uuid, as in the project.

const D = 864e5
const H = 36e5
const M = 60_000
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const u = (n: string) => '00000000-0000-4000-8000-' + n.padStart(12, '0')
export const RQ = { post: u('a1'), story: u('a2'), failed: u('a3'), stale: u('a4'), brief: u('a5'), idea: u('a6'), deck: u('a7'), ad: u('a8') }
export const DR = { post: u('d1'), ad: u('d2'), idea: u('d3'), brief: u('d4'), deck: u('d5') }
export const PC = { kept: u('c1'), own: u('c2'), archived: u('c3') }
export const NT = { open: u('e1'), used: u('e2'), plain: u('e3') }
export const INTEL_RUN = 'intel_run_c'
export const AD_RUN = 'agent2_run_c'

const req = (o: Record<string, unknown>): Record<string, unknown> => ({
  requested_by: 'pat@aiparagonconsulting.com',
  start_mode: 'source',
  format: 'thought_leadership',
  content_type: null,
  source_type: 'article',
  status: 'done',
  error: null,
  output_id: null,
  extraction: null,
  brief: null,
  ...o,
})

export const POST_BRIEF = {
  title: 'Why onboarding stalls',
  primary_signal: 'intel_tracker',
  supporting_signal: 'ad_strategist',
  substance: ['Our three-step intake cuts a week from onboarding', 'A client story: the filing that waited ten days', 'The checklist we hand every new client'],
  packaging: ['Lead with the week buyers lose', 'Name the cost before the fix'],
  strategic: ['Proof first, offer second', 'One call to action'],
  claims: ['Five days on average, from our own records'],
  requested_outputs: 'One LinkedIn post',
  intel_run: INTEL_RUN,
  intel_approved: true,
  ad_run: AD_RUN,
  ad_brief_id: 'cb-1',
  ad_approved: false,
}

export function contentRows() {
  const postData = {
    request_id: RQ.post,
    format: 'thought_leadership',
    content_type: 'thought_leadership',
    start_mode: 'source',
    source_type: 'article',
    title: 'Why onboarding stalls',
    hooks: [
      { label: 'Hook A', text: 'Most firms lose a week to onboarding.' },
      { label: 'Hook B', text: 'The week nobody budgets for.' },
      { label: 'Hook C', text: 'Your new clients wait ten days. Here is why.' },
    ],
    body: 'Most firms treat onboarding as paperwork.\nIt is the first promise you keep, or break.\n\nWe cut it to three steps: one call, one form, one checklist.',
    cta: 'Book a 20-minute intake review',
    headline: '',
    hashtags: ['#onboarding', '#operations'],
    trace: { body: 'The webinar, minutes 12 to 20', hooks: 'Patterns from the organic brief', claims: 'Five days: our own records' },
    review_flags: ['Check the five-day figure against this quarter', 'Get the client’s OK to tell the filing story'],
    brief: POST_BRIEF,
    extraction: { working_title: 'Onboarding', core_ideas: ['a', 'b', 'c'], stories: [{ title: 'Filing', gist: 'x' }, { title: 'Kickoff', gist: 'y' }], frameworks: [{ name: '3 steps', steps: ['a'] }], data_points: [], quotes: ['q'] },
    desired_action: null,
    house: { rules: 2, template: 'LinkedIn post', kb_docs: 1, context: 0, content_type: 'thought_leadership', feedback: 2 },
  }
  return {
    content_requests: [
      req({ id: RQ.post, title: 'The onboarding webinar', output_id: DR.post, created_at: ago(3 * H), updated_at: ago(3 * H), brief: POST_BRIEF }),
      req({ id: RQ.story, title: 'Client story: Halvern', status: 'extracting', format: 'newsletter', content_type: 'newsletter', created_at: ago(2 * M), updated_at: ago(1 * M) }),
      req({ id: RQ.failed, title: 'Podcast episode 14', status: 'error', error: 'The transcript could not be read.', source_type: 'podcast', created_at: ago(5 * H), updated_at: ago(5 * H) }),
      req({ id: RQ.stale, title: 'Year-end checklist', status: 'queued', format: 'email', created_at: ago(7 * M), updated_at: ago(7 * M) }),
      req({ id: RQ.brief, title: 'From the organic brief of 9 Nov', start_mode: 'idea', source_type: 'brief', output_id: DR.brief, created_at: ago(6 * H), updated_at: ago(6 * H) }),
      req({ id: RQ.idea, title: 'Most firms buy the tool first', start_mode: 'idea', source_type: null, format: 'newsletter', output_id: DR.idea, created_at: ago(1 * D), updated_at: ago(1 * D) }),
      req({ id: RQ.deck, title: 'Q4 client update', format: 'thought_leadership', content_type: 'deck', source_type: 'report', output_id: DR.deck, created_at: ago(2 * D), updated_at: ago(2 * D) }),
      req({ id: RQ.ad, title: 'The onboarding webinar', format: 'ad', output_id: DR.ad, created_at: ago(4 * D), updated_at: ago(4 * D) }),
    ],
    agent_outputs: [
      // the newest draft, kept as text the way some live rows are
      { id: DR.post, agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-post', title: 'Draft title', created_at: ago(3 * H), data: JSON.stringify(postData) },
      {
        id: DR.brief, agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-brief', title: 'From the briefs', created_at: ago(6 * H),
        data: { request_id: RQ.brief, format: 'thought_leadership', start_mode: 'idea', source_type: 'brief', title: 'From the briefs', hooks: [{ label: 'Hook A', text: 'A hook' }], body: 'A body.' },
      },
      {
        id: DR.idea, agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-idea', title: 'Buy the owner first', created_at: ago(1 * D),
        data: {
          request_id: RQ.idea, format: 'newsletter', content_type: 'newsletter', start_mode: 'idea', source_type: null, title: 'Buy the owner first',
          hooks: [{ label: 'Subject A', text: 'Who owns the workflow?' }, { label: '', text: 'Before you buy the tool' }],
          body: 'Most firms buy the AI tool before they name who owns the workflow.', cta: 'Reply with your workflow', headline: 'Name the owner first',
          hashtags: [], trace: {}, review_flags: [], brief: { primary_signal: 'intel_tracker', substance: [], packaging: [], strategic: [] }, house: { rules: 0, template: null, kb_docs: 0 },
        },
      },
      {
        id: DR.deck, agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-deck', title: 'Q4 in four slides', created_at: ago(2 * D),
        data: {
          request_id: RQ.deck, format: 'thought_leadership', content_type: 'deck', start_mode: 'source', source_type: 'report', title: 'Q4 in four slides',
          hooks: [{ label: 'Title A', text: 'Q4 in four slides' }],
          body: 'Use these for the client call.\nSlide 1: Where we started\nThree clients waiting on paperwork.\nNotes: keep it short.\nSlide 2: What changed\nOne form instead of five.',
          cta: '', headline: '', hashtags: [], trace: {}, review_flags: [], brief: { primary_signal: 'ad_strategist', substance: [], packaging: [], strategic: [] },
          house: { rules: 1, template: null, kb_docs: 0, content_type: 'deck' },
        },
      },
      {
        id: DR.ad, agent: 'content_generation', output_type: 'content_draft', run_id: 'cg-ad', title: 'Your week back', created_at: ago(4 * D),
        data: {
          request_id: RQ.ad, format: 'ad', start_mode: 'source', source_type: 'article', title: 'Your week back',
          hooks: [{ label: 'Hook A', text: 'Get your week back.' }, { label: 'Hook B', text: 'Onboarding in days.' }],
          body: 'One call, one form, one checklist.', cta: 'Book a call', headline: 'Onboarding in days, not weeks', hashtags: [], trace: {}, review_flags: [],
          brief: { primary_signal: 'ad_strategist', substance: [], packaging: [], strategic: ['Proof first'], ad_run: AD_RUN, ad_approved: true },
          house: { rules: 2, template: null, kb_docs: 0 },
        },
      },
      // the newest organic brief, and its snapshot on the run's other row
      {
        id: 'ib-1', agent: 'intel_tracker', output_type: 'intel_brief', run_id: INTEL_RUN, title: 'Organic brief', created_at: ago(2 * D), data: { n_items: 6 },
        content_md: '# Organic brief\n\n## TL;DR\n- **Fee talk is up:** Advisors post about fees more than last month.\n- **Proof beats promises:** Posts with a client number get twice the replies.',
      },
      {
        id: 'ib-snap', agent: 'intel_tracker', output_type: 'snapshot', run_id: INTEL_RUN, title: 'Snapshot', created_at: ago(2 * D),
        snapshot: {
          items: [
            { text: 'Fee talk is up', why: 'Advisors post about fees more than last month', tag: 'pricing' },
            { text: 'Proof beats promises', why: 'Posts with a client number get twice the replies', tag: 'social_proof' },
            { text: 'Onboarding is the new sales pitch', why: '', tag: '' },
          ],
        },
      },
    ],
    creative_briefs: [{ id: 'cb-1', run_id: AD_RUN, created_at: ago(3 * D), winning_hooks: ['Your week back'], core_pain_points: ['Slow onboarding'] }],
    agent_feedback: [
      { id: 'fb-ready', agent: 'content_generation', target_type: 'draft_review', target_id: DR.ad, action: 'ready', feedback: '{"checked":[]}', author: 'pat@aiparagonconsulting.com', created_at: ago(3 * D) },
      { id: 'fb-ch1', agent: 'content_generation', target_type: 'draft_review', target_id: DR.post, action: 'changes', feedback: 'LinkedIn post: too long.', author: 'pat@aiparagonconsulting.com', created_at: ago(2 * H) },
      { id: 'fb-ch2', agent: 'content_generation', target_type: 'draft_review', target_id: DR.post, action: 'changes', feedback: 'LinkedIn post: weak hook.', author: 'sam@aiparagonconsulting.com', created_at: ago(1 * H) },
    ],
    content_pieces: [
      {
        id: PC.kept, title: 'Your week back', format: 'ad', status: 'ready', hooks: ['Get your week back.', 'Onboarding in days.'], body: 'One call, one form, one checklist.', cta: 'Book a call',
        headline: 'Onboarding in days, not weeks', tags: ['onboarding'], notes: 'Ran on LinkedIn in October', source_draft_id: DR.ad, source_request_id: RQ.ad,
        created_by: 'pat@aiparagonconsulting.com', updated_by: 'pat@aiparagonconsulting.com', created_at: ago(3 * D), updated_at: ago(3 * D),
      },
      {
        id: PC.own, title: 'The three-step intake', format: 'newsletter', status: 'draft', hooks: [], body: 'Step one: one call.', cta: '', headline: '', tags: ['intake', 'ops'], notes: '',
        source_draft_id: null, source_request_id: null, created_by: 'sam@aiparagonconsulting.com', updated_by: 'sam@aiparagonconsulting.com', created_at: ago(5 * D), updated_at: ago(5 * D),
      },
      {
        id: PC.archived, title: 'An old piece', format: 'email', status: 'archived', hooks: [], body: 'Old.', cta: '', headline: '', tags: [], notes: '',
        source_draft_id: null, source_request_id: null, created_by: null, updated_by: null, created_at: ago(9 * D), updated_at: ago(9 * D),
      },
    ],
    idea_notes: [
      { id: NT.open, note: 'Most firms buy the AI tool before they name who owns the workflow.', tags: ['ai', 'ops'], status: 'open', created_by: 'pat@aiparagonconsulting.com', created_at: ago(1 * D), updated_at: ago(1 * D) },
      { id: NT.used, note: 'An idea already drafted', tags: [], status: 'used', created_by: 'pat@aiparagonconsulting.com', created_at: ago(2 * D), updated_at: ago(2 * D) },
      { id: NT.plain, note: 'Ask clients what the first week felt like.', tags: [], status: null, created_by: null, created_at: ago(3 * D), updated_at: ago(3 * D) },
    ],
  }
}
