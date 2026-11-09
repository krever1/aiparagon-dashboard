import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { STAGES } from '../../src/lib/catalyst/stages'
import { TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'

// Catalyst: the Lead pipeline (board and list), the Overview and a lead's page, on the stand-in's made-up leads
// (tests/stub/fixtures.mjs: Pat Example in Proposal, Robin Sample moved to "Kickoff call", Lee Client in Onboarding,
// Sam Synth with no e1_leads row, Jordan Merge from three rows, Casey Review in Client review).

test.use({ timezoneId: 'UTC' })

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const ROBIN = leadId({ prospect_name: 'Robin Sample', email: 'robin.sample@example.com' })
const LEE = leadId({ prospect_name: 'Lee Client', email: 'lee.client@example.com' })
const CASEY = leadId({ prospect_name: 'Casey Review', email: 'casey.review@example.com' })
const SAM = leadId({ prospect_name: 'Sam Synth', email: 'sam.synth@example.com' })

const card = (page: Page, stage: string, name: string) => page.locator(`[data-s="${stage}"] [data-lead^="${name}-"]`)
const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
const scrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

async function postsTo(path: string) {
  return (await stubCalls()).filter((c) => c.method === 'POST' && c.path === path)
}

test.describe('the Lead pipeline', () => {
  test('the board: six columns by stage with the team’s names, each lead in its stage', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    await expect(h1(page)).toHaveText('Lead pipeline')
    await expect(page.getByText('Every prospect and client, by meeting stage, with the prep for each meeting.')).toBeVisible()
    await expect(page.getByText('Move a lead to the stage it is in. Catalyst writes that stage’s prep, and asks before it runs anything.')).toBeVisible()
    await expect(page.locator('[role="group"][data-s] > div:first-child b')).toHaveText([
      'Prospect research', 'Kickoff call', 'Assessment', 'Proposal', 'Onboarding', 'Client review',
    ])
    for (const name of ['Prospect research, 2 leads', 'Kickoff call, 1 lead', 'Assessment, 0 leads', 'Proposal, 1 lead', 'Onboarding, 1 lead', 'Client review, 1 lead']) {
      await expect(page.getByRole('group', { name })).toBeVisible()
    }
    await expect(page.locator('[data-s="research"] [data-lead]')).toHaveCount(2)
    await expect(page.locator('[data-s="research"] [data-lead] b')).toHaveText(['Sam Synth', 'Jordan Merge'])
    await expect(card(page, 'consultation', 'robin-sample')).toBeVisible()
    await expect(card(page, 'proposal', 'pat-example')).toBeVisible()
    await expect(card(page, 'onboarding', 'lee-client')).toBeVisible()
    await expect(card(page, 'review', 'casey-review')).toBeVisible()
    await expect(page.locator('[data-s="assessment"]')).toContainText('No leads here')

    const pat = card(page, 'proposal', 'pat-example')
    await expect(pat).toContainText('Example Ridge Advisors · RIA')
    await expect(pat).toContainText('5 Nov')
    await expect(pat).toContainText('Strong')
    await expect(pat).toHaveAttribute('aria-label', 'Pat Example, Proposal, Proposal presentation ready. Open the lead')
    await expect(card(page, 'consultation', 'robin-sample')).toHaveAttribute('aria-label', 'Robin Sample, Kickoff call. Open the lead')
    // a merged lead shows once, with the real rows' company and fit
    await expect(page.locator('[data-lead^="jordan-merge-"]')).toHaveCount(1)
    await expect(card(page, 'research', 'jordan-merge')).toContainText('Merge Works · Advisory firm')
    await expect(card(page, 'research', 'jordan-merge')).toContainText('Strong')
    await expect(page.getByTestId('board-count')).toHaveText('6 leads')
  })

  test('a card offers only its own stage’s document: ready opens the lead on it, Run comes with the next update', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    const pat = card(page, 'proposal', 'pat-example')
    const ready = pat.getByRole('link', { name: 'Proposal ready' })
    await expect(ready).toHaveAttribute('title', 'Open the proposal presentation')
    await expect(ready).toHaveAttribute('href', `/lead-pipeline/${PAT}?tab=proposal`)
    await expect(pat).not.toContainText('Onboarding')
    await expect(card(page, 'onboarding', 'lee-client').getByRole('link', { name: 'Onboarding plan ready' })).toHaveAttribute('href', `/lead-pipeline/${LEE}?tab=onboarding`)
    await expect(card(page, 'research', 'sam-synth').getByRole('link', { name: 'Prospect brief ready' })).toBeVisible()
    for (const [stage, name, run] of [
      ['consultation', 'robin-sample', 'Run consultation guide'],
      ['research', 'jordan-merge', 'Run prospect brief'],
      ['review', 'casey-review', 'Run review brief'],
    ]) {
      await expect(card(page, stage, name).getByRole('button', { name: run })).toBeDisabled()
    }
    await ready.click()
    await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${PAT}\\?tab=proposal$`))
    await expect(h1(page)).toHaveText('Pat Example')
    await expect(page.getByRole('tab', { name: '✓ Proposal' })).toHaveAttribute('aria-selected', 'true')
  })

  test('board search filters by name, company or email', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    const search = page.getByRole('searchbox', { name: 'Search leads' })
    const count = page.getByTestId('board-count')
    await search.fill('merge')
    await expect(count).toHaveText('1 of 6 shown')
    await expect(page.locator('[data-lead]')).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Prospect research, 1 lead' })).toBeVisible()
    await search.fill('SAMPLE PEAK')
    await expect(page.locator('[data-lead]')).toHaveCount(1)
    await expect(card(page, 'consultation', 'robin-sample')).toBeVisible()
    await search.fill('casey.review@')
    await expect(card(page, 'review', 'casey-review')).toBeVisible()
    await search.fill('nobody at all')
    await expect(count).toHaveText('0 of 6 shown')
    await search.fill('')
    await expect(count).toHaveText('6 leads')
    await expect(page.locator('[data-lead]')).toHaveCount(6)
  })

  test('a card opens its lead, by a click or the Enter key', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    await card(page, 'consultation', 'robin-sample').click({ position: { x: 12, y: 12 } })
    await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${ROBIN}$`))
    await expect(h1(page)).toHaveText('Robin Sample')
    await page.goBack()
    await card(page, 'review', 'casey-review').focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${CASEY}$`))
    await expect(h1(page)).toHaveText('Casey Review')
  })

  test('the strip and the tabs: their counts, and each opens its view, with the address following', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    await expect(page.getByRole('tab')).toHaveText([
      'Board', 'All 6', 'Prospect research 2', 'Kickoff call 1', 'Assessment 0', 'Proposal 1', 'Onboarding 1', 'Client review 1',
    ])
    await expect(page.getByRole('tab', { name: 'Board', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: '4 In the sales stages' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '4 In the sales stages' })).toHaveAttribute('title', 'research to proposal')

    await page.getByRole('button', { name: '2 Clients' }).click()
    await expect(page).toHaveURL(/\/lead-pipeline\?tab=onboarding$/)
    await expect(page.getByRole('tab', { name: 'Onboarding 1' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: /In onboarding, prep: onboarding plan/ })).toBeVisible()
    await page.getByRole('button', { name: '6 Leads' }).click()
    await expect(page).toHaveURL(/\/lead-pipeline\?tab=all$/)
    await page.getByRole('button', { name: '2 Strong fit' }).click()
    await expect(page).toHaveURL(/\/lead-pipeline\?tab=all$/)
    await page.getByRole('button', { name: '4 In the sales stages' }).click()
    await expect(page).toHaveURL(/\/lead-pipeline$/)
    await expect(page.getByRole('group', { name: 'Proposal, 1 lead' })).toBeVisible()

    // an address with a tab opens it; Clients goes to Client review when nobody is onboarding
    await page.goto('/lead-pipeline?tab=review')
    await expect(page.getByRole('tab', { name: 'Client review 1' })).toHaveAttribute('aria-selected', 'true')
    const f = fixtures() as { e1_leads: Record<string, unknown>[] }
    await stubSeed({ e1_leads: f.e1_leads.map((l) => (l.email === 'lee.client@example.com' ? { ...l, stage: 'review' } : l)) })
    await page.goto('/lead-pipeline')
    await page.getByRole('button', { name: '2 Clients' }).click()
    await expect(page).toHaveURL(/\/lead-pipeline\?tab=review$/)
  })

  test('the sidebar’s Lead pipeline and Overview go back to their first view, whatever tab was open', async ({ page }) => {
    await signIn(page, '/lead-pipeline?tab=all')
    await expect(page.getByRole('tab', { name: 'All 6' })).toHaveAttribute('aria-selected', 'true')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Lead pipeline' }).click()
    await expect(page).toHaveURL(/\/lead-pipeline$/)
    await expect(page.getByRole('tab', { name: 'Board', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('group', { name: 'Proposal, 1 lead' })).toBeVisible()

    await page.goto('/engine-1?tab=documents')
    await expect(page.getByRole('heading', { name: 'Stage completion' })).toBeVisible()
    await nav.getByRole('link', { name: 'Overview' }).click()
    await expect(page).toHaveURL(/\/engine-1$/)
    await expect(page.getByRole('heading', { name: 'Six meetings, prep for each' })).toBeVisible()
    // Back returns to the tab the address had
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Stage completion' })).toBeVisible()
  })

  test('the list: All and each stage’s tab, its heading, the Fit column and the empty states', async ({ page }) => {
    await signIn(page, '/lead-pipeline?tab=all')
    const all = page.getByRole('region', { name: 'Every prospect in Catalyst' })
    await expect(all.locator('tbody tr')).toHaveCount(6)
    await expect(all).toContainText('6 shown')
    await expect(all.locator('tbody tr td:first-child b')).toHaveText(['Pat Example', 'Robin Sample', 'Lee Client', 'Sam Synth', 'Jordan Merge', 'Casey Review'])
    const pat = all.locator(`tr[data-lead="${PAT}"]`)
    await expect(pat).toContainText('Example Ridge Advisors')
    await expect(pat).toContainText('ria')
    await expect(pat).toContainText('Proposal')
    await expect(pat).toContainText('5 documents')
    await expect(pat).toContainText('Strong')
    await expect(pat).toContainText('5 Nov 2026')
    const jordan = all.locator('tr[data-lead^="jordan-merge-"]')
    await expect(jordan.getByText('🕶 contact@deltaadvisory.com')).toHaveAttribute(
      'title',
      'Anonymized identity used by agents 3–5: Delta Advisory · contact@deltaadvisory.com',
    )
    await expect(all.getByRole('columnheader', { name: 'Fit' })).toBeVisible()

    await page.getByRole('tab', { name: 'Kickoff call 1' }).click()
    await expect(page).toHaveURL(/\?tab=consultation$/)
    const kick = page.getByRole('region', { name: 'In kickoff call, prep: consultation guide' })
    await expect(kick.locator('tbody tr')).toHaveCount(1)
    await expect(kick).toContainText('Robin Sample')
    await expect(kick).toContainText('1 document')

    await page.getByRole('tab', { name: 'Client review 1' }).click()
    const review = page.getByRole('region', { name: 'In client review, prep: client review brief' })
    await expect(review.getByRole('columnheader', { name: 'Fit' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Assessment 0' }).click()
    const empty = page.getByRole('region', { name: 'In assessment, prep: assessment report' })
    await expect(empty).toContainText('No leads here')
    await expect(empty).toContainText('0 shown')

    // the list's search stays across its tabs
    await page.getByRole('tab', { name: 'All 6' }).click()
    await page.getByRole('searchbox', { name: 'Search the list' }).fill('zzz')
    await expect(page.getByText('No leads match this search.')).toBeVisible()
    await page.getByRole('tab', { name: 'Prospect research 2' }).click()
    await expect(page.getByRole('searchbox', { name: 'Search the list' })).toHaveValue('zzz')
    await page.getByRole('searchbox', { name: 'Search the list' }).fill('sam')
    await expect(page.getByRole('region', { name: /In prospect research/ }).locator('tbody tr')).toHaveCount(1)

    // Full view and a row both open the lead
    await page.getByRole('tab', { name: 'All 6' }).click()
    await page.getByRole('searchbox', { name: 'Search the list' }).fill('')
    await all.locator(`tr[data-lead="${ROBIN}"]`).getByRole('link', { name: 'Full view' }).click()
    await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${ROBIN}$`))
    await page.goto('/lead-pipeline?tab=all')
    await page.locator(`tr[data-lead="${LEE}"] td`).first().click()
    await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${LEE}$`))
  })

  test('rename stages: saved for the whole team, used everywhere, the usual names back', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    await page.getByRole('button', { name: 'Rename stages' }).click()
    const dlg = page.getByRole('dialog', { name: 'Rename the stages' })
    await expect(dlg).toBeVisible()
    await expect(dlg.getByText('Catalyst · Lead pipeline')).toBeVisible()
    await expect(dlg.getByLabel('1. Prospect research')).toHaveValue('Prospect research')
    await expect(dlg.getByLabel('2. Discovery consultation')).toHaveValue('Kickoff call')
    await expect(dlg.getByLabel('2. Discovery consultation')).toHaveAttribute('maxlength', '40')
    await expect(dlg).toContainText('Writes the assessment report')

    // unchanged: closes, writes nothing
    await dlg.getByRole('button', { name: 'Save names' }).click()
    await expect(dlg).toBeHidden()
    expect(await postsTo('/rest/v1/ai_settings')).toHaveLength(0)
    // Cancel and Esc write nothing
    await page.getByRole('button', { name: 'Rename stages' }).click()
    await dlg.getByLabel('3. Assessment').fill('Never saved')
    await dlg.getByRole('button', { name: 'Cancel' }).click()
    await expect(dlg).toBeHidden()
    await page.getByRole('button', { name: 'Rename stages' }).click()
    await expect(dlg.getByLabel('3. Assessment')).toHaveValue('Assessment')
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
    expect(await postsTo('/rest/v1/ai_settings')).toHaveLength(0)

    await page.getByRole('button', { name: 'Rename stages' }).click()
    await dlg.getByLabel('3. Assessment').fill('  Deep   dive ')
    await dlg.getByRole('button', { name: 'Save names' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByTestId('toasts')).toContainText('Saved. The whole team sees the new names.')
    await expect(page.getByRole('group', { name: 'Deep dive, 0 leads' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Deep dive 0' })).toBeVisible()
    let row = (await stubRows<{ key: string; value: Record<string, { name: string; by: string; at: string }>; updated_by: string }>('ai_settings')).find((r) => r.key === 'catalyst_stages')!
    expect(row.updated_by).toBe(TEAM.email)
    expect(Object.fromEntries(STAGES.map((s) => [s.key, row.value[s.key].name]))).toEqual({
      research: '', consultation: 'Kickoff call', assessment: 'Deep dive', proposal: '', onboarding: '', review: '',
    })
    for (const s of STAGES) {
      expect(row.value[s.key].by).toBe(TEAM.email)
      expect(Date.parse(row.value[s.key].at)).toBeGreaterThan(0)
    }

    // the Overview and a lead's page use the names too
    await page.goto('/engine-1')
    await expect(page.locator('li[data-s="assessment"]')).toContainText('Deep dive')
    await page.goto(`/lead-pipeline/${ROBIN}`)
    await expect(page.getByText('Stage: Kickoff call · Consultation guide not written yet')).toBeVisible()

    await page.goto('/lead-pipeline')
    await page.getByRole('button', { name: 'Rename stages' }).click()
    await dlg.getByRole('button', { name: 'Use the usual names' }).click()
    await expect(dlg.getByLabel('2. Discovery consultation')).toHaveValue('Discovery consultation')
    await dlg.getByRole('button', { name: 'Save names' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByRole('group', { name: 'Discovery consultation, 1 lead' })).toBeVisible()
    row = (await stubRows<{ key: string; value: Record<string, { name: string }> }>('ai_settings')).find((r) => r.key === 'catalyst_stages')! as typeof row
    expect(STAGES.map((s) => row.value[s.key].name)).toEqual(['', '', '', '', '', ''])
  })

  test('reads are fresh: a lead moved elsewhere shows in its new stage on the next visit', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    await expect(card(page, 'review', 'casey-review')).toBeVisible()
    const f = fixtures() as { e1_leads: Record<string, unknown>[] }
    await stubSeed({ e1_leads: f.e1_leads.map((l) => (l.email === 'casey.review@example.com' ? { ...l, stage: 'assessment' } : l)) })
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Overview' }).click()
    await expect(h1(page)).toHaveText('Overview')
    await nav.getByRole('link', { name: 'Lead pipeline' }).click()
    await expect(card(page, 'assessment', 'casey-review')).toBeVisible()
    await expect(card(page, 'review', 'casey-review')).toHaveCount(0)
  })

  test('every read goes out as the signed-in teammate', async ({ page }) => {
    await signIn(page, '/lead-pipeline')
    await expect(card(page, 'proposal', 'pat-example')).toBeVisible()
    // the stand-in turns away any read without the person's session, so the board showing at all proves the point
    const reads = (await stubCalls()).filter((c) => c.method === 'GET' && c.path.startsWith('/rest/v1/'))
    expect(new Set(reads.map((c) => c.path))).toEqual(new Set(['/rest/v1/agent_outputs', '/rest/v1/ai_settings', '/rest/v1/e1_leads']))
    // the board never reads the documents' text
    for (const c of reads.filter((x) => x.path === '/rest/v1/agent_outputs')) expect(decodeURIComponent(c.query)).not.toContain('content_md')
  })
})

test.describe('the Catalyst Overview', () => {
  test('six meetings with their leads, the newest leads and how far each stage got', async ({ page }) => {
    await signIn(page, '/engine-1')
    await expect(h1(page)).toHaveText('Overview')
    await expect(page).toHaveTitle('Catalyst overview · AI Paragon')
    await expect(page.getByText('Prep for every meeting, from the first research to the client review.')).toBeVisible()
    await expect(page.getByText('From the first research to the client review', { exact: true })).toHaveAttribute(
      'title',
      'A client moves through six meetings. Catalyst writes the prep for each one when the client gets there, from everything before it, and your team reviews it first.',
    )
    await expect(page.getByText('Every prospect lives in the lead pipeline.')).toBeVisible()
    await expect(page.getByRole('button', { name: '6 Stages' })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['6 Leads', '2 Strong fit', '2 Clients']) await expect(page.getByRole('button', { name })).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Six meetings, prep for each' })).toBeVisible()
    const cards = page.locator('li[data-s]')
    await expect(cards).toHaveCount(6)
    await expect(cards.locator('b')).toHaveText([
      'Pre-meeting prospect brief', 'Consultation guide', 'Assessment report', 'Proposal presentation', 'Onboarding plan', 'Client review brief',
    ])
    await expect(page.locator('li[data-s="research"]')).toContainText('2 leads in this stage')
    await expect(page.locator('li[data-s="consultation"]')).toContainText('Kickoff call')
    await expect(page.locator('li[data-s="consultation"]')).toContainText('1 lead in this stage')
    await expect(page.locator('li[data-s="assessment"]')).toContainText('0 leads in this stage')
    await expect(page.locator('li[data-s="consultation"]')).toHaveAttribute(
      'title',
      'Writes the questions for the discovery consultation, from the brief and the first meeting. Works from the prospect brief and what was said in the first meeting.',
    )

    await page.getByRole('tab', { name: 'Recent leads 6' }).click()
    await expect(page).toHaveURL(/\/engine-1\?tab=leads$/)
    const recent = page.getByRole('region', { name: /Recent leads/ })
    await expect(recent.getByRole('listitem')).toHaveCount(6)
    await expect(recent.getByRole('listitem').first()).toContainText('Pat Example · Example Ridge Advisors')
    await expect(recent.getByRole('listitem').first()).toContainText('pat.example@example.com · Proposal · updated 5 Nov 2026')
    await expect(recent.getByRole('link', { name: 'View all →' })).toHaveAttribute('href', '/lead-pipeline?tab=all')

    await page.getByRole('tab', { name: 'Documents' }).click()
    const bars = page.locator('section li[data-s]')
    await expect(bars).toHaveText([/Prospect brief\s*3\/6/, /Consultation guide\s*1\/6/, /Assessment\s*1\/6/, /Proposal\s*1\/6/, /Onboarding plan\s*1\/6/, /Review brief\s*0\/6/])

    await page.getByRole('button', { name: '2 Clients' }).click()
    await expect(page.getByRole('tab', { name: 'Recent leads 6' })).toHaveAttribute('aria-selected', 'true')
    await recent.getByRole('link', { name: /Lee Client/ }).click()
    await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${LEE}$`))

    await page.goto('/engine-1')
    await page.getByRole('link', { name: 'Open', exact: true }).click()
    await expect(page).toHaveURL(/\/lead-pipeline$/)
  })
})

test.describe('a lead’s page', () => {
  test('who it is, its stage, the strip and its tabs, opening on its stage', async ({ page }) => {
    await signIn(page, `/lead-pipeline/${PAT}`)
    await expect(h1(page)).toHaveText('Pat Example')
    await expect(page).toHaveTitle('Lead pipeline · AI Paragon')
    await expect(page.getByText('Catalyst · Lead pipeline', { exact: true })).toBeVisible()
    await expect(page.getByText('Example Ridge Advisors · Managing Partner · pat.example@example.com')).toBeVisible()
    await expect(page.getByText('Stage: Proposal · Proposal presentation ready')).toHaveAttribute(
      'title',
      'RIA · $10M to $50M AUM · Source: Landing page · AI readiness High · Strong fit',
    )
    await expect(page.getByRole('tab')).toHaveText([
      '✓ Prospect brief', '✓ Consultation guide', '✓ Assessment', '✓ Follow-up guide', '✓ Proposal', 'Files 8', 'HubSpot',
    ])
    await expect(page.getByRole('tab', { name: '✓ Proposal' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: /5\. Proposal presentation/ })).toBeVisible()
    const doc = page.getByTestId('doc-card')
    await expect(doc).toContainText('Produced 16 Oct 2026 · PDF · Google Doc')
    await expect(doc.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', 'https://drive.google.com/file/d/pdfPatGrowth00000000000001/view')
    await expect(doc.getByRole('link', { name: 'Open Google Doc' })).toHaveAttribute('href', 'https://docs.google.com/document/d/docPatGrowthEmpty0000000001/edit')
    await expect(doc.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('target', '_blank')

    await expect(page.getByRole('button', { name: 'Proposal Stage' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '8 Files' }).click()
    await expect(page).toHaveURL(new RegExp(`/lead-pipeline/${PAT}\\?tab=files$`))
    await page.getByRole('button', { name: '5 Documents' }).click()
    await expect(page.getByRole('tab', { name: '✓ Prospect brief' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: '✓ Consultation guide' }).click()
    await expect(page.getByTestId('doc-card').getByText('status: sent')).toBeVisible()
    await page.getByRole('tab', { name: '✓ Assessment' }).click()
    await expect(page.getByTestId('doc-card').getByText('call: 2026-10-11')).toBeVisible()

    await page.getByRole('link', { name: 'Lead pipeline', exact: true }).last().click()
    await expect(page).toHaveURL(/\/lead-pipeline$/)

    // a lead that has no follow-up guide has no tab for it; a stage with no document says so
    await page.goto(`/lead-pipeline/${ROBIN}`)
    await expect(page.getByRole('tab')).toHaveText(['✓ Prospect brief', 'Consultation guide', 'Assessment', 'Proposal', 'Files 1', 'HubSpot'])
    await expect(page.getByRole('tab', { name: 'Consultation guide' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('This stage hasn’t produced output for this lead yet.')).toBeVisible()
    await expect(page.getByText('not run yet')).toBeVisible()
    await page.getByRole('tab', { name: '✓ Prospect brief' }).click()
    await expect(page.getByTestId('doc-card')).toContainText('Document on file · PDF')
    await expect(page.getByTestId('doc-card').getByRole('link', { name: 'Open Google Doc' })).toHaveCount(0)
  })

  test('Read here: the saved text as parts or as full text, and nothing in it runs', async ({ page }) => {
    await signIn(page, `/lead-pipeline/${PAT}?tab=research`)
    const read = page.getByRole('button', { name: 'Read here ▾' })
    await read.click()
    await expect(page.getByRole('button', { name: 'Hide ▴' })).toHaveAttribute('aria-expanded', 'true')
    const reader = page.getByTestId('doc-reader')
    await expect(reader.getByRole('heading', { name: 'Pre-meeting prospect brief: Pat Example' })).toBeVisible()
    await expect(reader).toContainText('Example Ridge Advisors')
    await expect(reader).toContainText('Prepared by')
    await expect(reader.locator('details > summary b')).toHaveText(['Who they are', 'What to ask', 'Watch for'])
    await expect(reader.locator('details[data-j="1"] summary')).toContainText('3 points')
    await expect(reader.getByRole('button', { name: 'What to ask' })).toBeVisible()

    // the made-up brief carries an <img onerror>, a <script> and a javascript: link; none of it may run or link
    await expect(reader.locator('img, script')).toHaveCount(0)
    await expect(reader).not.toContainText('onerror')
    await expect(reader.getByRole('link', { name: 'a bad link' })).toHaveCount(0)
    await expect(reader.getByRole('link', { name: 'a good one' })).toHaveAttribute('href', 'https://example.com/about')
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()

    await reader.getByRole('button', { name: 'Full text' }).click()
    await expect(reader.getByRole('heading', { level: 1, name: 'Pre-meeting prospect brief: Pat Example' })).toBeVisible()
    await expect(reader.locator('details')).toHaveCount(0)
    await expect(reader.getByRole('listitem')).toHaveText(['An advisory firm with a small team', 'Founded by Pat Example', 'How do they onboard clients?', 'Where does the time go?', 'What did they try before?'])
    // the choice is remembered in this browser
    await page.reload()
    await page.getByRole('button', { name: 'Read here ▾' }).click()
    await expect(page.getByTestId('doc-reader').getByRole('button', { name: 'Full text' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Hide ▴' }).click()
    await expect(page.getByTestId('doc-reader')).toHaveCount(0)
    // saved text is shown as it is: nothing asked n8n
    expect(await postsTo('/webhook/doc-reader')).toHaveLength(0)
  })

  test('Read here without saved text: the Google Doc through the Doc Reader, the PDF when the Doc is empty, and its errors', async ({ page }) => {
    await signIn(page, `/lead-pipeline/${PAT}?tab=assessment`)
    await page.getByRole('button', { name: 'Read here ▾' }).click()
    const reader = page.getByTestId('doc-reader')
    await expect(reader).toContainText('Read from the Google Doc.')
    await expect(reader.getByRole('heading', { name: 'Assessment report' })).toBeVisible()
    await expect(reader).toContainText('Prepared for')
    await expect(reader.locator('details > summary b')).toHaveText(['Where they are', 'Risks', 'Next steps'])
    await expect(reader.locator('details[data-j="1"]')).toContainText('Client data in spreadsheets')
    const asked = await postsTo('/webhook/doc-reader')
    expect(asked).toHaveLength(1)
    expect(asked[0].body.id).toBe('docPatAssessment00000000001')
    expect(String(asked[0].body.auth)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)

    // the proposal presentation's Google Doc is empty, so its PDF is read
    await page.getByRole('tab', { name: '✓ Proposal' }).click()
    await page.getByRole('button', { name: 'Read here ▾' }).click()
    await expect(page.getByTestId('doc-reader')).toContainText('Read from the PDF.')
    await expect(page.getByTestId('doc-reader').locator('details > summary b')).toHaveText(['PROPOSAL PRESENTATION', 'WHAT WE WILL DO'])
    expect((await postsTo('/webhook/doc-reader')).map((c) => c.body.id)).toEqual([
      'docPatAssessment00000000001', 'docPatGrowthEmpty0000000001', 'pdfPatGrowth00000000000001',
    ])

    // a document Google will not give
    await page.getByRole('tab', { name: '✓ Follow-up guide' }).click()
    await page.getByRole('button', { name: 'Read here ▾' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'private' })).toHaveText(
      'Google says this document is private. Use Open PDF or Open Google Doc instead.',
    )

    // the workflow switched off, then a caller n8n turns away
    await stubHook('doc-reader', 404, { message: 'not registered' })
    await page.goto(`/lead-pipeline/${ROBIN}?tab=research`)
    await page.getByRole('button', { name: 'Read here ▾' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'n8n' })).toHaveText(
      'The Document workflow in n8n is switched off. Turn on “Dashboard · Doc Reader” in n8n. Use Open PDF or Open Google Doc instead.',
    )
    await stubHook('doc-reader', 200, { code: 'unauthorized', message: 'no' })
    await page.reload()
    await page.getByRole('button', { name: 'Read here ▾' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'n8n' })).toHaveText(
      'n8n turned the request away. Sign in again and try once more. Use Open PDF or Open Google Doc instead.',
    )
  })

  test('the onboarding plan reads inline; a stage with no prep yet says so', async ({ page }) => {
    await signIn(page, `/lead-pipeline/${LEE}`)
    await expect(page.getByRole('tab')).toHaveText(['Prospect brief', 'Consultation guide', 'Assessment', 'Proposal', '✓ Onboarding plan', 'Files 0', 'HubSpot'])
    await expect(page.getByRole('tab', { name: '✓ Onboarding plan' })).toHaveAttribute('aria-selected', 'true')
    const prep = page.getByTestId('prep-card')
    await expect(prep).toContainText('Onboarding plan: Lee Client')
    await expect(prep).toContainText('For the onboarding meeting · produced 3 Nov 2026')
    const read = prep.getByRole('button', { name: 'Read inline ▾' })
    await expect(read).toHaveAttribute('aria-expanded', 'false')
    await read.click()
    const text = page.getByTestId('prep-text')
    await expect(text).toBeVisible()
    expect((await text.boundingBox())!.height).toBeGreaterThan(60)
    await expect(text).toContainText('A pilot with two advisors')
    await expect(prep.getByRole('button', { name: 'Hide ▴' })).toHaveAttribute('aria-expanded', 'true')
    await prep.getByRole('button', { name: 'Hide ▴' }).click()
    await expect(text).toHaveCount(0)

    await page.goto(`/lead-pipeline/${CASEY}`)
    await expect(page.getByRole('tab', { name: 'Client review brief' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: /Onboarding plan/ })).toHaveCount(0)
    await expect(page.getByText('This lead is in Client review, and its prep has not been written yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Run review brief' })).toBeDisabled()
  })

  test('Files and HubSpot', async ({ page }) => {
    await signIn(page, `/lead-pipeline/${PAT}?tab=files`)
    const groups = page.locator('#files ~ div p')
    await expect(page.getByRole('heading', { name: /^Files/ })).toContainText('8')
    await expect(groups.filter({ hasText: /^📁/ })).toHaveText([
      '📁 Prospect brief 1', '📁 Consultation guide 1', '📁 Assessment 1', '📁 Follow-up guide 1', '📁 Proposal 3', '📁 General 1',
    ])
    await expect(page.getByRole('link', { name: 'Proposal presentation (PDF)' })).toHaveAttribute('href', 'https://drive.google.com/file/d/pdfPatGrowth00000000000001/view')
    await expect(page.getByRole('link', { name: 'Gamma slide notes (Google Doc)' })).toHaveAttribute('href', 'https://docs.google.com/document/d/docPatGamma000000000000001/edit')
    await expect(page.getByRole('link', { name: 'Assessment report (Google Doc)' })).toHaveAttribute('href', 'https://docs.google.com/document/d/docPatAssessment00000000001/edit')
    const upload = page.getByRole('listitem').filter({ hasText: 'Intake notes.docx' })
    await expect(upload.getByRole('link', { name: 'Intake notes.docx' })).toHaveAttribute('href', 'https://example.com/files/intake-notes.docx')
    await expect(upload).toContainText('From the first call')
    await expect(upload).toContainText('upload · qa.teammate@aiparagonconsulting.com')
    await expect(upload).toContainText('✦ searchable')
    await expect(upload).toContainText('uploaded 6 Oct 2026')
    const search = page.getByRole('searchbox', { name: 'Search files' })
    await search.fill('intake')
    await expect(groups.filter({ hasText: /^📁/ })).toHaveText(['📁 General 1'])
    await search.fill('gamma')
    await expect(groups.filter({ hasText: /^📁/ })).toHaveText(['📁 Proposal 1'])
    await search.fill('zzz')
    await expect(page.getByText('No files match that search.')).toBeVisible()

    await page.getByRole('tab', { name: 'HubSpot' }).click()
    const hs = page.getByRole('region', { name: /HubSpot/ })
    await expect(hs).toContainText('synced 5 Nov · 06:00')
    for (const t of ['Pat Example', 'Example Ridge Advisors', 'Managing Partner', '555-0100', 'lead', 'NEW']) await expect(hs).toContainText(t)
    await expect(hs.getByRole('link', { name: 'example.com ↗' })).toHaveAttribute('href', 'https://example.com')
    await expect(hs.getByRole('link', { name: 'Open in HubSpot ↗' })).toHaveAttribute('href', 'https://app.hubspot.com/contacts')

    await page.goto(`/lead-pipeline/${SAM}?tab=files`)
    await expect(page.getByText('No files yet for this lead.')).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Search files' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'HubSpot' }).click()
    await expect(page.getByText('No HubSpot contact synced for this email yet.')).toBeVisible()
  })

  test('any of a lead’s emails opens it; an unknown lead says so; signed out goes to sign-in first', async ({ page, browser }) => {
    await signIn(page, '/today')
    await page.goto('/lead-pipeline/anything-' + leadId({ prospect_name: '', email: 'jordan.old@example.com' }).slice(-10))
    await expect(h1(page)).toHaveText('Jordan Merge')
    await page.goto('/lead-pipeline/nobody-0000000000')
    await expect(h1(page)).toHaveText('Lead not found')
    await page.getByRole('link', { name: 'Open the lead pipeline' }).click()
    await expect(page).toHaveURL(/\/lead-pipeline$/)

    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    const fresh = await ctx.newPage()
    await serveLogo(fresh)
    await fresh.goto(`/lead-pipeline/${PAT}?tab=files`)
    await expect(fresh).toHaveURL(/\/login\?next=/)
    await signIn(fresh, `/lead-pipeline/${PAT}?tab=files`)
    await expect(fresh.getByRole('tab', { name: 'Files 8' })).toHaveAttribute('aria-selected', 'true')
    await ctx.close()
  })
})

test.describe('time zones', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })

  test('dates show in the viewer’s own time zone, with no hydration error', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && /hydrat/i.test(m.text())) errors.push(m.text())
    })
    await signIn(page, `/lead-pipeline/${PAT}?tab=hubspot`)
    // synced 06:00 UTC on 5 Nov is 22:00 on 4 Nov in Los Angeles
    await expect(page.getByRole('region', { name: /HubSpot/ })).toContainText('synced 4 Nov · 22:00')
    await page.goto('/lead-pipeline')
    await expect(card(page, 'proposal', 'pat-example')).toContainText('5 Nov')
    expect(errors).toEqual([])
  })
})

test.describe('phone and tablet widths', () => {
  test('a phone: no sideways scroll, the board in one column', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, '/lead-pipeline')
    const cols = page.locator('[role="group"][data-s]')
    await expect(cols).toHaveCount(6)
    const xs = await cols.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
    expect(new Set(xs).size).toBe(1)
    expect(await scrollsSideways(page)).toBe(false)
    await page.goto('/lead-pipeline?tab=all')
    await expect(page.locator('tbody tr')).toHaveCount(6)
    expect(await scrollsSideways(page)).toBe(false)
    for (const path of ['/engine-1', `/lead-pipeline/${PAT}`, `/lead-pipeline/${PAT}?tab=files`, `/lead-pipeline/${PAT}?tab=hubspot`]) {
      await page.goto(path)
      await expect(h1(page)).toBeVisible()
      expect(await scrollsSideways(page), path).toBe(false)
    }
    await page.goto(`/lead-pipeline/${PAT}?tab=assessment`)
    await page.getByRole('button', { name: 'Read here ▾' }).click()
    await expect(page.getByTestId('doc-reader')).toBeVisible()
    expect(await scrollsSideways(page)).toBe(false)
  })

  test('a tablet: the board in three columns', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await signIn(page, '/lead-pipeline')
    const cols = page.locator('[role="group"][data-s]')
    await expect(cols).toHaveCount(6)
    const box = await cols.evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().top)]))
    expect(new Set(box.map((b) => b[0])).size).toBe(3)
    expect(box[3][0]).toBe(box[0][0])
    expect(box[3][1]).toBeGreaterThan(box[0][1])
    expect(await scrollsSideways(page)).toBe(false)
  })
})
