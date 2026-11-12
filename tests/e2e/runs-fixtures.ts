// Made-up rows for Runs & uploads, on top of the Ad Strategist's (tests/e2e/ads-fixtures.ts: two uploads, an ads brief
// built from uploads, a set of ad copy): a newer ads brief built from uploads, two campaigns (one from that brief, one
// from the scheduled brief, which this page leaves out), a scheduled and a custom Intel Tracker brief with who started
// each, and a custom Intel run still reading. Dates count back from now.

import { A, RUN1, adsRows, ago, ymd } from './ads-fixtures'

const j = (v: unknown) => JSON.stringify(v)
const ME = 'qa.teammate@aiparagonconsulting.com'

/** A newer ads brief built from the uploads (the newest one, which Send to Marketing Generation uses). */
export const CUSTOM2 = `agent2_custom_${ymd(3)}_0900`
export const INTEL1 = `agent1_${ymd(1)}_0600`
export const INTELC = `agent1_custom_${ymd(6)}_1100`
export const PENDING = 'agent1_custom_pending'

export const INTEL_MD = [
  '# Competitor Intelligence Brief',
  '',
  '**TL;DR**',
  '- **Proof wins:** Advisors who show results get the replies.',
  '- **Fees:** Clients ask about fees first.',
  '- Onboarding is the new battleground.',
  '- A fourth point the row leaves out.',
  '',
  '## 1. Detail',
  'Northwind posted twice about onboarding checklists.',
].join('\n')

export function runsRows() {
  const a = adsRows()
  return {
    ...a,
    agent_outputs: [
      ...a.agent_outputs,
      {
        id: 'ro-1',
        agent: 'ad_strategist',
        output_type: 'creative_brief',
        run_id: CUSTOM2,
        title: 'Creative Brief — ' + ymd(3),
        created_at: ago(3),
        content_md: '# Creative Brief\nProof you can check in a week.',
        data: j({ winning_hooks: ['Your week back', { pattern: 'Proof first' }], source_ad_ids: [A(7), A(8)], requested_by: ME }),
        snapshot: null,
      },
      {
        id: 'ro-2',
        agent: 'low_ticket_content',
        output_type: 'funnel_package',
        run_id: 'lt_custom_1',
        title: 'Funnel package — Paperwork review',
        created_at: ago(2.5),
        content_md: '',
        data: j({ source_brief_run: CUSTOM2, ad_images: [{ url: 'https://cdn.example.com/ad-1.png' }, { url: 'https://cdn.example.com/ad-2.png' }] }),
        snapshot: null,
      },
      {
        id: 'ro-3',
        agent: 'low_ticket_content',
        output_type: 'funnel_package',
        run_id: 'lt_sched_1',
        title: 'A campaign from the scheduled brief',
        created_at: ago(20),
        content_md: '',
        data: j({ source_brief_run: RUN1, ad_images: [] }),
        snapshot: null,
      },
      {
        id: 'ro-4',
        agent: 'intel_tracker',
        output_type: 'intel_brief',
        run_id: INTEL1,
        title: 'Competitor Intelligence Brief — ' + ymd(1),
        created_at: ago(1.2),
        content_md: INTEL_MD,
        data: j({}),
        snapshot: null,
      },
      {
        id: 'ro-5',
        agent: 'intel_tracker',
        output_type: 'intel_brief',
        run_id: INTELC,
        title: 'Competitor Intelligence Brief (custom run)',
        created_at: ago(6),
        content_md: '# Custom brief\n\nNothing summed up.',
        data: j({ run_source: 'custom', custom_names: ['Northwind Advisors', 'Example Ridge Advisors'] }),
        snapshot: null,
      },
    ],
    runs: [
      ...a.runs,
      { run_id: INTEL1, agent: 'intel_tracker', run_date: ymd(1), started_at: ago(1.3), finished_at: ago(1.2), status: 'success', stats: j({}), source: 'scheduled', requested_by: null, input: null },
      {
        run_id: INTELC,
        agent: 'intel_tracker',
        run_date: ymd(6),
        started_at: ago(6.1),
        finished_at: ago(6),
        status: 'success',
        stats: j({}),
        source: 'custom',
        requested_by: ME,
        input: j({ names: ['Northwind Advisors', 'Example Ridge Advisors'] }),
      },
    ],
    ai_settings: [
      ...a.ai_settings,
      { key: 'intel_runs', value: { runs: [{ run_id: PENDING, names: ['Fabrikam Insights'], t: Date.now() - 5 * 60_000, by: ME, cascade: false }] }, updated_by: ME, updated_at: ago(0) },
    ],
  }
}
