import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { TEAM, serveLogo, signIn, stubCalls, stubReset, stubRows, stubSeed } from './helpers'

// Meeting Types and Client Stages (the current dashboard's v145, with v146's fixes): the board's columns are the team's
// client stages (Edit stages, a stage's setup on its name), the Overview's Meeting Types (a type's setup, the team's own),
// a stage of the team's own running its meeting type through Meeting Prep with its sections, purpose and knowledge
// base, a stage that runs nothing, and a lead's stage checklist. Made-up leads from tests/stub/fixtures.mjs.

test.use({ timezoneId: 'UTC', viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

const PREP = '/webhook/catalyst-meeting-prep'
const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const CASEY = leadId({ prospect_name: 'Casey Review', email: 'casey.review@example.com' })
const card = (page: Page, stage: string, name: string) => page.locator(`[data-s="${stage}"] [data-lead^="${name}-"]`)
const toasts = (page: Page) => page.getByTestId('toasts')
const heads = (page: Page) => page.locator('[role="group"][data-s] > div:first-child button')
const F = () => fixtures() as unknown as { e1_leads: Record<string, unknown>[]; ai_settings: Record<string, unknown>[] }

async function setting<T = Record<string, unknown>>(key: string): Promise<T | undefined> {
  return (await stubRows<{ key: string; value: T }>('ai_settings')).find((r) => r.key === key)?.value
}
async function posts(path: string) {
  return (await stubCalls()).filter((c) => c.method === 'POST' && c.path === path)
}
/** The team's settings, made up: a meeting type and a stage of its own, and a stage that runs nothing. */
async function seedOwn(extra: Record<string, unknown>[] = []) {
  await stubSeed({
    ai_settings: [
      ...F().ai_settings.filter((r) => !extra.some((x) => x.key === r.key)),
      {
        key: 'catalyst_meeting_types',
        value: {
          order: ['mt-strat01'],
          items: {
            'mt-strat01': {
              name: 'Strategy session', doc: 'Strategy session brief', desc: 'Plan the next quarter.', sections: ['Goals', 'Risks', 'Asks'],
              kb: 'We plan in quarters.', kbFiles: ['g-1'],
            },
          },
        },
      },
      {
        key: 'catalyst_client_stages',
        value: {
          order: ['research', 'consultation', 'assessment', 'proposal', 'cs-strat01', 'onboarding', 'review', 'cs-hold01'],
          items: {
            'cs-strat01': { name: 'Strategy', type: 'mt-strat01', desc: 'The quarterly plan', inputs: 'Last quarter’s numbers', deliverables: ['Signed plan'], tasks: ['Book the room'] },
            'cs-hold01': { name: 'On hold', type: '' },
          },
        },
      },
      ...extra,
    ],
    guide_files: [
      { id: 'g-1', file_name: 'Our planning playbook.pdf', file_text: 'Plan in quarters, review monthly.', in_kb: true, created_at: '2026-11-01T10:00:00Z' },
      { id: 'g-2', file_name: 'Pricing sheet.pdf', file_text: 'Prices.', in_kb: true, created_at: '2026-11-02T10:00:00Z' },
    ],
  })
}

test('the board is Client Stages: a stage’s name opens its setup, which is saved for the team', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await expect(page.getByRole('tab', { name: 'Client Stages', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Click a stage’s name to set it up.')).toBeVisible()
  await page.getByRole('button', { name: 'Set up the Proposal stage' }).click()
  const dlg = page.getByRole('dialog', { name: 'Proposal' })
  await expect(dlg.getByText('Catalyst · Client stage')).toBeVisible()
  await expect(dlg.getByText('Proposal presentation (built in)')).toBeVisible()
  await expect(dlg.getByLabel('Description')).toHaveValue('Writes the proposal presentation from the assessment, then the client proposal from everything before it.')
  // a built-in stage that is not meeting prep has no output template of its own
  await expect(dlg.getByLabel('Output template')).toHaveCount(0)
  await dlg.getByLabel('Inputs required').fill('Signed NDA, the budget')
  await dlg.getByLabel('Before this stage').fill('Send the assessment')
  await dlg.getByLabel('Deliverables').fill('- Proposal deck\n2) Scope of work')
  await dlg.getByLabel('Workflow tasks').fill('Book the call')
  await dlg.getByLabel('Name').fill('Kickoff call')
  await dlg.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dlg.getByTestId('setup-msg')).toHaveText('There is already a stage called Kickoff call.')
  await dlg.getByLabel('Name').fill('Offer')
  await dlg.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Offer saved.')
  await expect(heads(page)).toHaveText(['Prospect research', 'Kickoff call', 'Assessment', 'Offer', 'Onboarding', 'Client review'])

  const cs = (await setting<{ items: Record<string, Record<string, unknown>> }>('catalyst_client_stages'))!
  expect(cs.items.proposal).toMatchObject({
    inputs: 'Signed NDA, the budget', before: 'Send the assessment', deliverables: ['Proposal deck', 'Scope of work'], tasks: ['Book the call'], by: TEAM.email,
  })
  expect(cs.items.proposal).not.toHaveProperty('name')
  const names = (await setting<Record<string, { name: string; by: string }>>('catalyst_stages'))!
  expect(names.proposal).toMatchObject({ name: 'Offer', by: TEAM.email })
  expect(names.consultation.name).toBe('Kickoff call')

  // the question before a run says what to have ready
  await page.locator('[data-lead^="robin-sample-"]').dragTo(page.locator('[role="group"][data-s="proposal"]'), { sourcePosition: { x: 20, y: 14 } })
  const q = page.getByRole('dialog', { name: 'Move Robin Sample to Offer?' })
  await expect(q.getByTestId('stage-needs')).toHaveText(
    'Have these ready Signed NDA, the budgetBefore this stage Send the assessmentDeliverables Proposal deck · Scope of workWorkflow tasks Book the call',
  )
})

test('Edit stages: add, rename and reorder; Prospect research stays; delete moves its leads; a stage comes back in its place', async ({ page }) => {
  await signIn(page, '/lead-pipeline')
  await page.getByRole('button', { name: 'Edit stages' }).click()
  const dlg = page.getByRole('dialog', { name: 'Client stages' })
  const rows = dlg.getByTestId('stage-rows').locator('li')
  await expect(rows).toHaveCount(6)
  await expect(rows.first()).toContainText('Always kept')
  await expect(rows.first().getByRole('button', { name: /Delete/ })).toHaveCount(0)
  await expect(rows.nth(1)).toContainText('Built in · Consultation guide')

  await dlg.getByLabel('New stage name').fill('Assessment')
  await dlg.getByRole('button', { name: 'Add stage' }).click()
  await expect(dlg.getByTestId('setup-msg')).toHaveText('There is already a stage called Assessment.')
  await dlg.getByLabel('New stage name').fill('Strategy session')
  await dlg.getByRole('button', { name: 'Add stage' }).click()
  await expect(dlg.getByTestId('setup-msg')).toHaveText('Added. Save changes to keep it.')
  await expect(rows.nth(6)).toContainText('New · runs nothing yet')
  // a delete with changes not saved yet says to save first (v146)
  await rows.nth(5).getByRole('button', { name: 'Delete Client review' }).click()
  await expect(dlg.getByTestId('setup-msg')).toHaveText('Save your changes first, then delete a stage.')
  await dlg.getByLabel('Stage name: Assessment').fill('Deep dive')
  await rows.nth(6).getByRole('button', { name: 'Move Strategy session up' }).click()
  await dlg.getByRole('button', { name: 'Save changes' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Client stages saved.')
  await expect(heads(page)).toHaveText(['Prospect research', 'Kickoff call', 'Deep dive', 'Proposal', 'Onboarding', 'Strategy session', 'Client review'])
  const cs = (await setting<{ order: string[]; items: Record<string, { name: string; type: string; c: string }>; removed: string[] }>('catalyst_client_stages'))!
  const own = cs.order[5]
  expect(own).toMatch(/^cs-[a-z0-9]{6}$/)
  expect(cs.order).toEqual(['research', 'consultation', 'assessment', 'proposal', 'onboarding', own, 'review'])
  expect(cs.items[own]).toMatchObject({ name: 'Strategy session', type: '', by: TEAM.email })
  expect(cs.items[own].c).toMatch(/^#/)
  expect(cs.removed).toEqual([])
  expect((await setting<Record<string, { name: string }>>('catalyst_stages'))!.assessment.name).toBe('Deep dive')
  // the tabs follow the team's stages
  await expect(page.getByRole('tab', { name: 'Strategy session 0' })).toBeVisible()

  // delete Client review: Casey goes to the stage picked
  await page.getByRole('button', { name: 'Edit stages' }).click()
  await dlg.getByRole('button', { name: 'Delete Client review' }).click()
  const del = page.getByRole('dialog', { name: 'Delete Client review?' })
  await expect(del).toContainText('1 lead is in Client review. Move it to:')
  await expect(del).toContainText('A built-in stage can be brought back later under Removed stages.')
  await del.getByLabel('Move its leads to').selectOption({ label: 'Onboarding' })
  await del.getByRole('button', { name: 'Delete the stage' }).click()
  await expect(toasts(page)).toContainText('Stage deleted.')
  expect((await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === 'casey.review@example.com')!.stage).toBe('onboarding')
  expect((await setting<{ removed: string[]; order: string[] }>('catalyst_client_stages'))!.removed).toEqual(['review'])
  await expect(page.locator('[role="group"][data-s="review"]')).toHaveCount(0)
  await expect(card(page, 'onboarding', 'casey-review')).toBeVisible()

  // Removed stages: Bring back puts it before the next built-in stage still there (here: the end)
  await expect(dlg.getByText('Removed stages')).toBeVisible()
  await dlg.getByText('Removed stages').click()
  await dlg.locator('li[data-k="review"]').getByRole('button', { name: 'Bring back' }).click()
  await expect(toasts(page)).toContainText('Stage brought back.')
  await expect(heads(page)).toHaveText(['Prospect research', 'Kickoff call', 'Deep dive', 'Proposal', 'Onboarding', 'Strategy session', 'Client review'])
  expect((await setting<{ removed: string[] }>('catalyst_client_stages'))!.removed).toEqual([])
  await page.keyboard.press('Escape')

  // Use the usual names
  await page.getByRole('button', { name: 'Edit stages' }).click()
  await dlg.getByRole('button', { name: 'Use the usual names' }).click()
  await expect(dlg.getByLabel('Stage name: Discovery consultation')).toHaveValue('Discovery consultation')
  await dlg.getByRole('button', { name: 'Save changes' }).click()
  await expect(heads(page)).toHaveText(['Prospect research', 'Discovery consultation', 'Assessment', 'Proposal', 'Onboarding', 'Strategy session', 'Client review'])
  // a stage that runs nothing: no Run on its cards, and a drop there is just a move, with no question
  await page.locator('[data-lead^="jordan-merge-"]').dragTo(page.locator(`[role="group"][data-s="${own}"]`), { sourcePosition: { x: 20, y: 14 } })
  await expect(toasts(page)).toContainText('Moved to Strategy session.')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(card(page, own, 'jordan-merge').getByRole('button')).toHaveCount(0)
  expect((await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === 'jordan@example.com')!.stage).toBe(own)
})

test('v146: an older save that removed Prospect research is ignored, and a lead in a stage gone sits by its documents', async ({ page }) => {
  await stubSeed({
    ai_settings: [...F().ai_settings, { key: 'catalyst_client_stages', value: { order: ['consultation', 'research'], removed: ['research', 'review'] } }],
  })
  await signIn(page, '/lead-pipeline')
  await expect(heads(page)).toHaveText(['Kickoff call', 'Prospect research', 'Assessment', 'Proposal', 'Onboarding'])
  // Casey's saved stage (Client review) is not on the board: Casey sits by its documents (none: Prospect research)
  await expect(card(page, 'research', 'casey-review')).toBeVisible()
  await page.goto(`/lead-pipeline/${CASEY}`)
  await expect(page.getByText('Stage: Prospect research · Pre-meeting prospect brief not written yet')).toBeVisible()
})

test('Meeting Types: a new one of the team’s own, picked in a stage of its own, runs through Meeting Prep with its sections, purpose and knowledge base', async ({ page }) => {
  await seedOwn()
  await signIn(page, '/engine-1')
  await expect(page.getByRole('button', { name: '7 Meeting types' })).toHaveAttribute('aria-pressed', 'true')
  const strat = page.locator('li[data-mt="mt-strat01"]')
  await expect(strat).toContainText('Strategy session · yours')
  await expect(strat).toContainText('Strategy session brief')
  await expect(strat).toContainText('In Strategy')
  await expect(strat).toContainText('0 leads in this stage')

  // a new type: its checks, then saved for the team
  await page.getByRole('button', { name: /New meeting type/ }).click()
  const dlg = page.getByRole('dialog', { name: 'New meeting type' })
  await expect(dlg.getByTestId('kb-files').locator('label')).toHaveText(['Pricing sheet.pdf', 'Our planning playbook.pdf'])
  await dlg.getByLabel('Meeting name').fill('Quarterly review')
  await dlg.getByRole('button', { name: 'Add meeting type' }).click()
  await expect(dlg.getByTestId('setup-msg')).toHaveText('Say what it writes, e.g. Quarterly review brief.')
  await dlg.getByLabel('Meeting name').fill('Strategy session')
  await dlg.getByLabel('What it writes').fill('QBR brief')
  await dlg.getByRole('button', { name: 'Add meeting type' }).click()
  await expect(dlg.getByTestId('setup-msg')).toHaveText('There is already a meeting type called Strategy session.')
  await dlg.getByLabel('Meeting name').fill('Quarterly review')
  await dlg.getByLabel('Output template').fill('Wins\nMisses\nNext quarter')
  await dlg.getByLabel('Emails in HubSpot').uncheck()
  await dlg.getByLabel('Knowledge base context').fill('Bring the numbers.')
  await dlg.getByLabel('Pricing sheet.pdf').check()
  await dlg.getByRole('button', { name: 'Add meeting type' }).click()
  await expect(dlg).toBeHidden()
  await expect(toasts(page)).toContainText('Quarterly review added. Pick it in a client stage’s setup to run it.')
  const mt = (await setting<{ order: string[]; items: Record<string, Record<string, unknown>> }>('catalyst_meeting_types'))!
  const qk = mt.order[1]
  expect(mt.order).toEqual(['mt-strat01', qk])
  expect(mt.items[qk]).toMatchObject({ name: 'Quarterly review', doc: 'QBR brief', sections: ['Wins', 'Misses', 'Next quarter'], kb: 'Bring the numbers.', kbFiles: ['g-2'], by: TEAM.email })
  expect((await setting<Record<string, Record<string, unknown>>>('catalyst_stage_setup'))![qk]).toMatchObject({ calls: true, crm: true, emails: false })

  // a built-in type is named as its stage: a name another stage has is refused (v146); Hide it
  await page.locator('li[data-mt="assessment"]').getByRole('button').click()
  const at = page.getByRole('dialog', { name: 'Assessment' })
  await expect(at.getByLabel('What it writes')).toBeDisabled()
  await at.getByLabel('Meeting name').fill('Strategy')
  await at.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(at.getByTestId('setup-msg')).toHaveText('There is already a client stage called Strategy. Renaming this meeting renames its stage too.')
  await at.getByRole('button', { name: 'Hide it' }).click()
  await expect(toasts(page)).toContainText('Hidden from the list. Its stage still runs it.')
  await expect(page.locator('li[data-mt="assessment"]')).toContainText('Assessment · hidden')
  await expect(page.getByRole('button', { name: '7 Meeting types' })).toBeVisible()

  // the stage of the team's own: its meeting type, the knowledge base file not on the list kept (v146)
  await page.goto('/lead-pipeline')
  await page.getByRole('button', { name: 'Set up the Strategy stage' }).click()
  const st = page.getByRole('dialog', { name: 'Strategy' })
  await expect(st.getByLabel('Meeting type it runs')).toHaveValue('mt-strat01')
  await expect(st.getByLabel('Output template')).toBeVisible()
  await st.getByRole('button', { name: 'Cancel' }).click()

  // a run: Pat moved to Strategy, the question says what to have ready, the run goes to Meeting Prep
  await page.locator('[data-lead^="pat-example-"]').dragTo(page.locator('[role="group"][data-s="cs-strat01"]'), { sourcePosition: { x: 20, y: 14 } })
  const q = page.getByRole('dialog', { name: 'Move Pat Example to Strategy?' })
  await expect(q.getByTestId('stage-needs')).toContainText('Have these ready Last quarter’s numbers')
  await expect(q.getByText('In Strategy, Catalyst writes the strategy session brief. Only that runs, and nothing goes to the client.')).toBeVisible()
  await expect(q.getByTestId('reads').locator('li').first()).toHaveText('✓ Template: the meeting type’s sections (3)')
  await expect(q.getByTestId('reads')).toContainText('Every document so far, your house rules and its knowledge base context')
  await q.getByRole('textbox').fill('They want a plan for Q1.')
  await q.getByRole('button', { name: 'Move and run it' }).click()
  await expect(toasts(page)).toContainText('Started. Strategy session brief shows up on the card when it is done.')
  const sent = (await posts(PREP))[0].body
  expect(sent).toMatchObject({
    stage: 'cs-strat01', stageName: 'Strategy', docName: 'Strategy session brief', sections: ['Goals', 'Risks', 'Asks'],
    purpose: 'The quarterly plan. Plan the next quarter', leadEmail: 'pat.example@example.com', from: 'board',
  })
  expect(String(sent.transcript)).toContain(
    'NOTES FROM THE TEAM\nThey want a plan for Q1.\n\nKNOWLEDGE BASE CONTEXT FOR STRATEGY SESSION\nWe plan in quarters.\n\nOur planning playbook.pdf:\nPlan in quarters, review monthly.',
  )
  expect((await stubRows<Record<string, unknown>>('e1_leads')).find((r) => r.email === 'pat.example@example.com')!.stage).toBe('cs-strat01')
  await expect(card(page, 'cs-strat01', 'pat-example')).toContainText('Writing the strategy session brief')

  // a type of the team's own can be deleted: the stage that ran it runs nothing
  await page.goto('/engine-1')
  await page.locator('li[data-mt="mt-strat01"]').getByRole('button').click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('dialog', { name: 'Strategy session' }).getByRole('button', { name: 'Delete' }).click()
  await expect(toasts(page)).toContainText('Meeting type deleted.')
  expect((await setting<{ items: Record<string, { deleted?: boolean }> }>('catalyst_meeting_types'))!.items['mt-strat01'].deleted).toBe(true)
  expect((await setting<{ items: Record<string, { type: string }> }>('catalyst_client_stages'))!.items['cs-strat01'].type).toBe('')
})

test('a lead’s page: its stage’s checklist, ticked for the team; the prep tab of a stage of the team’s own', async ({ page }) => {
  await seedOwn()
  await stubSeed({ e1_leads: F().e1_leads.map((l) => (l.email === 'pat.example@example.com' ? { ...l, stage: 'cs-strat01' } : l)) })
  await signIn(page, `/lead-pipeline/${PAT}`)
  await expect(page.getByText('Stage: Strategy · Strategy session brief not written yet')).toBeVisible()
  const box = page.getByTestId('stage-checklist')
  await expect(box.getByRole('heading', { level: 2 })).toContainText('This stage: Strategy')
  await expect(box).toContainText('The quarterly plan')
  await expect(box).toContainText('Inputs required Last quarter’s numbers')
  await box.getByLabel('Signed plan').check()
  await expect
    .poll(async () => (await setting<Record<string, Record<string, Record<string, boolean>>>>('catalyst_stage_ticks'))?.['pat.example@example.com'])
    .toEqual({ 'cs-strat01': { 'd:0': true } })
  await page.reload()
  await expect(page.getByTestId('stage-checklist').getByLabel('Signed plan')).toBeChecked()
  await expect(page.getByTestId('stage-checklist').getByLabel('Book the room')).not.toBeChecked()
  // the prep tab of the team's own stage, open on arrival
  await expect(page.getByRole('tab', { name: 'Strategy session brief' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: /^Strategy session brief/ })).toBeVisible()
  // the checklist's Stage setup opens the stage's window
  await box.getByRole('button', { name: 'Stage setup' }).click()
  await expect(page.getByRole('dialog', { name: 'Strategy' })).toBeVisible()
})

test('windows keep a long name inside them on a phone (v146)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await seedOwn([
    {
      key: 'catalyst_stages',
      value: { proposal: { name: 'Averyveryverylongstagenamewithnospacesatalltoseewhathappens' } },
    },
  ])
  await signIn(page, '/lead-pipeline')
  await page.getByRole('button', { name: /Set up the Averyvery/ }).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg).toBeVisible()
  const over = await page.evaluate(() => {
    const d = document.querySelector('dialog[open]') as HTMLElement
    return d.scrollWidth - d.clientWidth
  })
  expect(over).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
