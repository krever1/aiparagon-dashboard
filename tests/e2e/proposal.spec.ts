import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { LEGACY, TEAM, serveLogo, signIn, stubCalls, stubHook, stubReset, stubRows, stubSeed } from './helpers'

// The client proposal on a lead's Proposal tab (the current dashboard's v132 and v138): the card, the question and the
// run, the document as the client sees it (brand, chips, markers, charts), edits in place, Save as PDF and What should
// change?, on the stand-in's made-up Pat Example (assessment done, no proposal yet).

test.use({ timezoneId: 'UTC' })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const ROBIN = leadId({ prospect_name: 'Robin Sample', email: 'robin.sample@example.com' })
const F = () => fixtures() as unknown as Record<string, Record<string, unknown>[]>
const toasts = (page: Page) => page.getByTestId('toasts')
const card = (page: Page) => page.getByTestId('proposal-card')

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
  // the brand's fonts come from Google Fonts, which the tests cannot reach: answer with an empty style sheet
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stub */' }))
})

const PROPOSAL_ID = '50000000-0000-4000-8000-000000000001'
function proposalRow(extra: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    run_id: 'pat.example@example.com',
    agent: 'client_proposal',
    output_type: 'client_proposal',
    title: 'Proposal and Scope of Work · Example Ridge Advisors',
    created_at: '2026-11-06T15:00:00Z',
    content_md: '# Proposal for Example Ridge',
    data: {
      doc: {
        title: 'Proposal for Example Ridge',
        subtitle: 'Intake, automated first',
        kicker: 'Proposal and Scope of Work',
        client: 'Example Ridge Advisors',
        prepared_for: 'Pat Example',
        prepared_by: 'AI Paragon',
        date: 'November 6, 2026',
        sections: [
          { title: 'Where you are', body: 'Paperwork takes **most** of the week.\n\nThe fee is [FILL IN: fee] and the start is [TO CONFIRM: date].', sources: ['call', 'assessment', 'call', 'nope'] },
          // written as the editor writes it back, so a save with no change finds nothing changed
          { title: 'The plan', body: '1. Map intake\n2. Automate one step\n\n### Who does what\n\n- We build it\n- You review it', sources: ['template', 'consultation'] },
        ],
        visuals: [
          { type: 'timeline', title: 'The first weeks', after: 'the plan', unit: 'week', items: [{ label: 'Kickoff', start: 1, end: 2 }, { label: 'Build', start: 3, end: 6 }] },
          { type: 'bars', title: 'Hours a week', after: 'Nowhere', unit: 'hrs', items: [{ label: 'Paperwork now', value: 20 }, { label: 'After', value: 5 }] },
        ],
      },
      brand: { colors: { primary: '0b6e4f', accent: '#C9A227' }, fonts: { heading: 'Montserrat', body: 'Georgia' }, logo_url: 'https://www.aiparagonconsulting.com/logo.png', found: ['logo'] },
      call: { id: '', title: '', date: '2026-11-04T17:00:00Z' },
      sources: [{ key: 'call', label: 'the call on Nov 4' }, { key: 'assessment', label: 'the assessment' }],
      prospectName: 'Pat Example',
      status: 'success',
    },
    ...extra,
  }
}

test('the card: once the assessment is done, Write the client proposal; no card before it', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=proposal`)
  await expect(card(page)).toContainText('Client proposal')
  await expect(card(page)).toContainText(
    'The proposal the client receives, from the meetings and the assessment. Add a past proposal in Templates and it follows its sections and branding. It is written after the proposal presentation.',
  )
  await expect(card(page).getByRole('button', { name: 'Write the client proposal' })).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'Read here ▾' })).toHaveCount(0)

  // with a proposal template in use, the line names it
  await stubSeed({
    catalyst_sources: [
      ...F().catalyst_sources,
      { id: '30000000-0000-4000-8000-000000000002', kind: 'proposal_template', file_name: 'Our proposal.docx', active: true, sections: ['Intro', 'Scope'], brand: { found: ['colors'] }, created_at: '2026-10-02T10:00:00Z' },
    ],
  })
  await page.reload()
  await expect(card(page)).toContainText('from the meetings and the assessment, in the sections and branding of Our proposal.docx. It is written after')

  await page.goto(`/lead-pipeline/${ROBIN}?tab=proposal`)
  await expect(page.getByRole('heading', { level: 2, name: '5. Proposal presentation' })).toBeVisible()
  await expect(card(page)).toHaveCount(0)
})

test('Write the client proposal: what it reads, then the run with the meetings’ notes; it lands and opens', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=proposal`)
  await card(page).getByRole('button', { name: 'Write the client proposal' }).click()
  const dlg = page.getByRole('dialog', { name: 'Write the client proposal for Pat Example?' })
  await expect(dlg).toContainText('Catalyst · Pat Example')
  const uses = dlg.getByTestId('uses')
  await expect(uses.locator('p').first()).toHaveText('Using 1 past document and 4 emails')
  await expect(uses.locator('li')).toHaveText([
    '–No proposal template yet, so a standard layout. Add one in Templates.',
    '✓Discovery call questions: Our discovery questions.docx',
    '–No recorded call with this lead, so the documents on file.',
    '✓The email on Nov 4 from Pat Example: Follow-up 4',
    '✓The email on Nov 3 to Pat Example: Follow-up 3',
    '✓The email on Nov 2 from Pat Example: Follow-up 2',
    '✓and 1 more email',
    '✓The assessment of Oct 12',
    '✓The consultation guide',
    '✓The prospect brief',
  ])
  await expect(dlg).toContainText('Nothing goes to the client: you review it first.')
  await dlg.getByRole('button', { name: 'Write it' }).click()
  await expect(toasts(page)).toContainText('Writing the client proposal. It shows here when it is ready.')

  const sent = (await stubCalls()).filter((c) => c.method === 'POST' && c.path === '/webhook/catalyst-proposal')
  expect(sent).toHaveLength(1)
  const body = sent[0].body as { leadEmail: string; call: { id: string; title: string; date: string; transcript: string }; auth: string }
  expect(body.leadEmail).toBe('pat.example@example.com')
  expect(body.call).toMatchObject({ id: '', title: '', date: '' })
  expect(body.call.transcript.startsWith('EMAILS WITH THE CLIENT (HubSpot, newest first)')).toBe(true)
  expect(body.call.transcript).not.toContain('NOTES FROM THE TEAM')
  expect(body.call.transcript).toContain('Email number 4.')
  expect(body.auth).toBeTruthy()
  // the calls it read are not filed (only the board's runs file them)
  expect((await stubRows('call_meta')).length).toBe(F().call_meta.length)

  // the run shows for the whole team until the proposal lands
  const runs = (await stubRows<{ key: string; value: Record<string, { t0: string; by: string }> }>('ai_settings')).find((r) => r.key === 'catalyst_proposal_runs')
  expect(Object.keys(runs!.value)).toEqual(['pat.example@example.com'])
  expect(runs!.value['pat.example@example.com'].by).toBe(TEAM.email)
  await page.clock.install()
  await page.reload()
  await expect(card(page).getByTestId('proposal-writing')).toContainText('Writing the client proposal…')
  await expect(card(page).getByTestId('proposal-writing')).toContainText('Using 1 past document and 4 emails')
  await expect(card(page).getByRole('button', { name: /Write/ })).toHaveCount(0)
  await expect(page.locator('html[data-proposal-watch="on"]')).toHaveCount(1)

  // n8n saves the proposal; the page finds it on its next check, 8 seconds on, and opens it
  await stubSeed({ agent_outputs: [...F().agent_outputs, proposalRow({ created_at: new Date().toISOString() })] })
  await page.clock.fastForward(8_500)
  await expect(toasts(page)).toContainText('The client proposal is ready.')
  await expect(page.getByTestId('proposal-doc')).toBeVisible()
  await expect(page).toHaveURL(/read=proposal/)
  await expect(card(page).getByTestId('proposal-writing')).toHaveCount(0)
  await expect(card(page).getByRole('button', { name: 'Write it again' })).toBeVisible()
})

test('a proposal that could not start says why, and nothing is kept as running', async ({ page }) => {
  await stubHook('catalyst-proposal', 404, { code: 404, message: 'The requested webhook is not registered.' })
  await signIn(page, `/lead-pipeline/${PAT}?tab=proposal`)
  await card(page).getByRole('button', { name: 'Write the client proposal' }).click()
  const dlg = page.getByRole('dialog', { name: 'Write the client proposal for Pat Example?' })
  await dlg.getByRole('button', { name: 'Write it' }).click()
  await expect(dlg.getByTestId('proposal-msg')).toHaveText(
    'Could not start it: The Client Proposal workflow in n8n is switched off. Turn on “Catalyst · Client Proposal” in n8n.',
  )
  expect((await stubRows<{ key: string }>('ai_settings')).some((r) => r.key === 'catalyst_proposal_runs')).toBe(false)
})

test('a run that takes over 15 minutes stops showing, and the page says so', async ({ page }) => {
  const t0 = new Date(Date.now() - 14.5 * 60_000).toISOString()
  await stubSeed({ ai_settings: [...F().ai_settings, { key: 'catalyst_proposal_runs', value: { 'pat.example@example.com': { t0, uses: [] } } }] })
  await page.clock.install()
  await signIn(page, `/lead-pipeline/${PAT}?tab=proposal`)
  await expect(card(page).getByTestId('proposal-writing')).toBeVisible()
  await expect(page.locator('html[data-proposal-watch="on"]')).toHaveCount(1)
  await page.clock.fastForward(45_000)
  await expect(toasts(page)).toContainText('The client proposal is taking longer than usual. Check back in a few minutes.')
})

test('the proposal as the client sees it: brand, chips, markers and charts under their sections', async ({ page }) => {
  await stubSeed({ agent_outputs: [...F().agent_outputs, proposalRow()] })
  await signIn(page, `/lead-pipeline/${PAT}?tab=proposal`)
  await expect(card(page)).toContainText('Proposal and Scope of Work · Example Ridge Advisors')
  await expect(card(page)).toContainText('Written 6 Nov 2026 · from the call on Nov 4, the assessment')
  await card(page).getByRole('button', { name: 'Read here ▾' }).click()
  await expect(page).toHaveURL(/read=proposal/)
  const doc = page.getByTestId('proposal-doc')
  await expect(doc.locator('.prop-cover .kick')).toHaveText('Proposal and Scope of Work')
  await expect(doc.locator('h1.cv-t')).toHaveText('Proposal for Example Ridge')
  await expect(doc.locator('.cv-s')).toHaveText('Intake, automated first')
  await expect(doc.locator('.prop-cover .meta')).toHaveText('Prepared forPat ExamplePrepared byAI ParagonDateNovember 6, 2026')
  await expect(doc.locator('.prop-cover .foot')).toHaveText('Confidential. Prepared for Example Ridge Advisors.')
  await expect(doc.locator('.prop-cover img.lg')).toHaveAttribute('alt', 'AI Paragon')
  // the brand: its main color, the accent, and its heading font from Google Fonts
  expect(await doc.evaluate((el) => getComputedStyle(el).getPropertyValue('--b1').trim())).toBe('#0B6E4F')
  expect(await doc.evaluate((el) => getComputedStyle(el).getPropertyValue('--b2').trim())).toBe('#C9A227')
  await expect(page.locator('head link[href^="https://fonts.googleapis.com/css2?family=Montserrat"]')).toHaveCount(2)
  await expect(page.locator('head link[href*="family=Georgia"]')).toHaveCount(0)

  const secs = doc.locator('.prop-sec')
  await expect(secs.locator('.no')).toHaveText(['01', '02'])
  await expect(secs.nth(0).locator('.src span')).toHaveText(['From the call on Nov 4', 'From the assessment'])
  await expect(secs.nth(1).locator('.src span')).toHaveText(['Structure from your template', 'From the consultation guide'])
  await expect(secs.nth(0).locator('.bd strong')).toHaveText('most')
  await expect(secs.nth(0).locator('.prop-fill')).toHaveText(['[FILL IN: fee]', '[TO CONFIRM: date]'])
  await expect(secs.nth(1).locator('.bd ol li')).toHaveText(['Map intake', 'Automate one step'])
  await expect(secs.nth(1).locator('.bd h3')).toHaveText('Who does what')
  // the timeline under the section it names; the bars, naming none, under the last section
  await expect(secs.nth(0).locator('figure')).toHaveCount(0)
  await expect(secs.nth(1).locator('figure figcaption')).toHaveText(['The first weeks', 'Hours a week'])
  const tl = secs.nth(1).locator('figure[data-chart="timeline"]')
  await expect(tl.locator('svg rect')).toHaveCount(2)
  await expect(tl.locator('svg rect').first()).toHaveAttribute('fill', '#0B6E4F')
  await expect(tl.locator('table tbody tr')).toHaveText(['KickoffWeeks 1 to 2', 'BuildWeeks 3 to 6'])
  await expect(secs.nth(1).locator('figure[data-chart="bars"] table thead th')).toHaveText(['Item', 'Hrs'])
  await expect(doc.locator('.prop-pfoot')).toHaveText('AI ParagonProposal and Scope of Work · Example Ridge Advisors')

  // on a phone the table stands in for the drawing, and the page does not scroll sideways
  await page.setViewportSize({ width: 390, height: 800 })
  await expect(tl.locator('svg')).toBeHidden()
  await expect(tl.locator('table')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await page.setViewportSize({ width: 1280, height: 900 })

  // the document stays open across a reload while the address says so; Hide closes it
  await page.reload()
  await expect(page.getByTestId('proposal-doc')).toBeVisible()
  await card(page).getByRole('button', { name: 'Hide ▴' }).click()
  await expect(page.getByTestId('proposal-doc')).toHaveCount(0)
  await expect(page).not.toHaveURL(/read=proposal/)
})

test('edit in place: Save keeps the change and the agent’s version; Cancel and an unchanged Save change nothing', async ({ page }) => {
  await stubSeed({ agent_outputs: [...F().agent_outputs, proposalRow()] })
  await signIn(page, `/lead-pipeline/${PAT}?tab=proposal&read=proposal`)
  const doc = page.getByTestId('proposal-doc')
  const bar = page.getByTestId('proposal-bar')
  await expect(bar).toContainText('Change anything in place. Save as PDF prints what you see.')

  // Cancel puts back what was there
  await bar.getByRole('button', { name: '✎ Edit' }).click()
  await expect(doc.locator('h1.cv-t')).toHaveAttribute('contenteditable', 'true')
  await expect(bar).toContainText('Click any heading or paragraph to change it.')
  await doc.locator('h1.cv-t').fill('Something else')
  await bar.getByRole('button', { name: 'Cancel' }).click()
  await expect(doc.locator('h1.cv-t')).toHaveText('Proposal for Example Ridge')
  await expect(doc.locator('h1.cv-t')).not.toHaveAttribute('contenteditable', 'true')

  // Save with nothing changed
  await bar.getByRole('button', { name: '✎ Edit' }).click()
  await bar.getByRole('button', { name: 'Save changes' }).click()
  await expect(toasts(page)).toContainText('Nothing changed.')
  expect((await stubRows<Record<string, unknown>>('agent_outputs')).find((r) => r.id === PROPOSAL_ID)?.edited_by_human).toBeUndefined()

  // a real edit: the title, a section's heading (its chart follows it) and a paragraph
  await bar.getByRole('button', { name: '✎ Edit' }).click()
  await doc.locator('h1.cv-t').fill('Proposal for Example Ridge Advisors')
  await doc.locator('.prop-sec').nth(1).locator('h2.t').fill('The roadmap')
  await doc.locator('.prop-sec').nth(0).locator('.bd p').first().fill('Paperwork takes half the week.')
  await bar.getByRole('button', { name: 'Save changes' }).click()
  await expect(toasts(page)).toContainText('Saved. Save as PDF prints this version.')
  const row = (await stubRows<Record<string, unknown>>('agent_outputs')).find((r) => r.id === PROPOSAL_ID)!
  const data = row.data as { doc: { title: string; sections: { title: string; body: string }[]; visuals: { after: string }[] }; edited: { by: string; at: string }; status: string }
  expect(data.doc.title).toBe('Proposal for Example Ridge Advisors')
  expect(data.doc.sections.map((s) => s.title)).toEqual(['Where you are', 'The roadmap'])
  expect(data.doc.sections[0].body).toBe('Paperwork takes half the week.\n\nThe fee is [FILL IN: fee] and the start is [TO CONFIRM: date].')
  expect(data.doc.sections[1].body).toBe('1. Map intake\n2. Automate one step\n\n### Who does what\n\n- We build it\n- You review it')
  expect(data.doc.visuals[0].after).toBe('The roadmap')
  expect(data.edited.by).toBe(TEAM.email)
  expect(data.status).toBe('success')
  expect(row.edited_by_human).toBe(true)
  expect(String(row.content_md)).toContain('# Proposal for Example Ridge Advisors')
  expect(String(row.content_md)).toContain('## The roadmap\n\n1. Map intake')
  expect(String(row.content_md)).toContain('Chart: The first weeks. Kickoff (weeks 1 to 2); Build (weeks 3 to 6).')
  const snap = row.snapshot as { doc: { title: string }; content_md: string; written_at: string }
  expect(snap.doc.title).toBe('Proposal for Example Ridge')
  expect(snap.written_at).toBe('2026-11-06T15:00:00Z')
  await expect(doc.locator('h1.cv-t')).toHaveText('Proposal for Example Ridge Advisors')
  await expect(doc.locator('.prop-sec').nth(1).locator('figure[data-chart="timeline"]')).toBeVisible()
  await expect(bar).toContainText(/Edited \d+ \w+ 2026 by qa\.teammate\. Save as PDF prints this version\./)
  await expect(card(page)).toContainText('· edited')

  // a second save keeps the agent's version from the first
  await bar.getByRole('button', { name: '✎ Edit' }).click()
  await doc.locator('.cv-s').fill('A new subtitle')
  await bar.getByRole('button', { name: 'Save changes' }).click()
  await expect(bar.getByRole('button', { name: '✎ Edit' })).toBeVisible()
  const saved = async () => (await stubRows<Record<string, unknown>>('agent_outputs')).find((r) => r.id === PROPOSAL_ID)!
  await expect.poll(async () => ((await saved()).data as { doc: { subtitle: string } }).doc.subtitle).toBe('A new subtitle')
  expect(((await saved()).snapshot as { doc: { title: string } }).doc.title).toBe('Proposal for Example Ridge')
})

test('Save as PDF prints the saved document alone, with its title; What should change? asks about the proposal', async ({ page }) => {
  // the print window is a page of its own: answer its Google Fonts requests too
  await page.context().route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stub */' }))
  await stubSeed({ agent_outputs: [...F().agent_outputs, proposalRow()] })
  await signIn(page, `/lead-pipeline/${PAT}?tab=proposal`)
  await page.evaluate(() => {
    ;(window as unknown as { __apPrint: (w: Window) => void }).__apPrint = (w) => {
      ;(window as unknown as { __printed: unknown }).__printed = {
        title: w.document.title,
        h1: w.document.querySelector('h1.cv-t')?.textContent,
        sections: w.document.querySelectorAll('.prop-sec').length,
        charts: w.document.querySelectorAll('figure.chart-fig').length,
        print: [...w.document.querySelectorAll('style')].some((s) => (s.textContent ?? '').includes('@page{size:letter')),
      }
    }
  })
  const popup = page.waitForEvent('popup')
  await card(page).getByRole('button', { name: 'Save as PDF' }).click()
  await popup
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: unknown }).__printed)).toEqual({
    title: 'Proposal and Scope of Work · Example Ridge Advisors',
    h1: 'Proposal for Example Ridge',
    sections: 2,
    charts: 2,
    print: true,
  })

  await card(page).getByRole('button', { name: 'What should change?' }).click()
  const dlg = page.getByRole('dialog', { name: 'What should change in the client proposal?' })
  await dlg.getByRole('textbox').fill('Lead with the timeline, and keep the fee section short.')
  await dlg.getByRole('button', { name: 'Save the reason' }).click()
  await expect(toasts(page)).toContainText('Saved. Make it a rule on AI settings.')
  const fb = await stubRows<Record<string, unknown>>('agent_feedback')
  expect(fb).toEqual([
    expect.objectContaining({
      agent: 'client_proposal', target_type: 'e1_document', target_id: 'pat.example@example.com:client_proposal', action: 'changes',
      feedback: 'Lead with the timeline, and keep the fee section short.', author: TEAM.email,
    }),
  ])
  await expect(card(page).getByRole('link', { name: '1 change asked' })).toHaveAttribute('href', LEGACY + '/ai-settings')
})
