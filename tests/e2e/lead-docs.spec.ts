import { type Page, expect, test } from '@playwright/test'
import { fixtures } from '../stub/fixtures.mjs'
import { leadId } from '../../src/lib/catalyst/lead-id'
import { LEGACY, TEAM, serveLogo, signIn, stubReset, stubRows, stubSeed } from './helpers'

// A lead's documents: What should change? on each finished document (v125), and the charts in the onboarding plan and
// the client review brief (v138), on the stand-in's made-up leads.

test.use({ timezoneId: 'UTC' })

const PAT = leadId({ prospect_name: 'Pat Example', email: 'pat.example@example.com' })
const ROBIN = leadId({ prospect_name: 'Robin Sample', email: 'robin.sample@example.com' })
const LEE = leadId({ prospect_name: 'Lee Client', email: 'lee.client@example.com' })
const F = () => fixtures() as unknown as Record<string, Record<string, unknown>[]>
const toasts = (page: Page) => page.getByTestId('toasts')

test.beforeEach(async ({ page }) => {
  await stubReset()
  await serveLogo(page)
})

test('What should change? on a finished document: a sentence or two, saved for AI settings, counted on the card', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${PAT}?tab=research`)
  const docCard = page.getByTestId('doc-card')
  await expect(docCard.getByRole('button', { name: 'What should change?' })).toHaveAttribute(
    'title',
    'Say what should be different next time. On AI settings the reason can become a house rule the Catalyst agents follow.',
  )
  await expect(docCard.getByTestId('asks')).toHaveCount(0)
  await docCard.getByRole('button', { name: 'What should change?' }).click()
  const dlg = page.getByRole('dialog', { name: 'What should change in the prospect brief?' })
  await expect(dlg).toContainText('Catalyst · Pat Example')
  await expect(dlg).toContainText('Say what to add, cut or do differently next time.')
  const box = dlg.getByRole('textbox', { name: /Your reason/ })
  await expect(box).toBeFocused()
  await expect(box).toHaveAttribute('maxlength', '600')

  // too short to become a rule
  await box.fill('  too   short ')
  await dlg.getByRole('button', { name: 'Save the reason' }).click()
  await expect(dlg.getByTestId('change-msg')).toHaveText('Write a sentence or two, so it can become a rule.')
  expect(await stubRows('agent_feedback')).toEqual([])

  await box.fill('Put the firm’s\n\nAUM and team size   first.')
  await dlg.getByRole('button', { name: 'Save the reason' }).click()
  await expect(toasts(page)).toContainText('Saved. Make it a rule on AI settings.')
  await expect(dlg).toHaveCount(0)
  expect(await stubRows('agent_feedback')).toEqual([
    expect.objectContaining({
      agent: 'lead_research', target_type: 'e1_document', target_id: 'pat.example@example.com:lead_research', action: 'changes',
      feedback: 'Put the firm’s AUM and team size first.', author: TEAM.email,
    }),
  ])
  const count = docCard.getByTestId('asks')
  await expect(count).toHaveText('1 change asked')
  await expect(count).toHaveAttribute('href', LEGACY + '/ai-settings')
  await expect(count).toHaveAttribute('title', 'See them on AI settings, under From your feedback')

  // asks from either dashboard count, under any of the lead's emails, on their own document only
  await stubSeed({
    agent_feedback: [
      ...(await stubRows('agent_feedback')),
      { id: 'f2', agent: 'lead_research', target_type: 'e1_document', target_id: 'pat.example@example.com:lead_research', action: 'changes', feedback: 'Shorter intro please.' },
      { id: 'f3', agent: 'growth_plan', target_type: 'e1_document', target_id: 'pat.example@example.com:growth_plan', action: 'changes', feedback: 'Fewer slides overall.' },
      { id: 'f4', agent: 'lead_research', target_type: 'draft_review', target_id: 'pat.example@example.com:lead_research', action: 'changes', feedback: 'Not a document ask.' },
    ],
  })
  await page.reload()
  await expect(docCard.getByTestId('asks')).toHaveText('2 changes asked')
  await page.getByRole('tab', { name: '✓ Proposal' }).click()
  await expect(page.getByTestId('doc-card').getByTestId('asks')).toHaveText('1 change asked')
  await page.getByRole('tab', { name: '✓ Consultation guide' }).click()
  await expect(page.getByTestId('doc-card').getByTestId('asks')).toHaveCount(0)
  await page.getByTestId('doc-card').getByRole('button', { name: 'What should change?' }).click()
  await expect(page.getByRole('dialog', { name: 'What should change in the consultation guide?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  expect(await stubRows('agent_feedback')).toHaveLength(4)
})

test('a document that is only a link saved on the lead has What should change? too; a stage not run has none', async ({ page }) => {
  await signIn(page, `/lead-pipeline/${ROBIN}?tab=research`)
  await expect(page.getByTestId('doc-card')).toContainText('Document on file')
  await expect(page.getByTestId('doc-card').getByRole('button', { name: 'What should change?' })).toBeVisible()
  await page.getByRole('tab', { name: 'Assessment' }).click()
  await expect(page.getByText('This stage hasn’t produced output for this lead yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'What should change?' })).toHaveCount(0)
})

test('the onboarding plan’s charts: at the end of the section each names, else at the end; a table on a phone', async ({ page }) => {
  const outs = F().agent_outputs.map((o) =>
    o.agent === 'meeting_prep'
      ? {
          ...o,
          data: {
            ...(o.data as Record<string, unknown>),
            visuals: [
              { type: 'timeline', title: 'The first weeks', after: 'The first weeks', unit: 'week', items: [{ label: 'Set up', start: 1, end: 1 }, { label: 'First review', start: 2, end: 2 }] },
              { type: 'bars', title: 'Advisors in the pilot', after: 'Somewhere else', items: [{ label: 'Now', value: 2 }, { label: 'Next quarter', value: 6 }] },
              { type: 'bars', title: 'A third chart', items: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] },
            ],
          },
        }
      : o,
  )
  await stubSeed({ agent_outputs: outs })
  await signIn(page, `/lead-pipeline/${LEE}?tab=onboarding`)
  await page.getByRole('button', { name: 'Read inline ▾' }).click()
  const text = page.getByTestId('prep-text')
  await expect(text.locator('figure')).toHaveCount(2)
  // the timeline closes "The first weeks", which is the last section, so both end up there in order
  const parts = text.locator(':scope > div')
  await expect(parts.nth(1).locator('h2')).toHaveText('What was agreed')
  await expect(parts.nth(1).locator('figure')).toHaveCount(0)
  await expect(parts.nth(2).locator('h2')).toHaveText('The first weeks')
  await expect(parts.nth(2).locator('figure figcaption')).toHaveText(['The first weeks', 'Advisors in the pilot'])
  const tl = parts.nth(2).locator('figure[data-chart="timeline"]')
  await expect(tl.locator('svg rect').first()).toHaveAttribute('fill', '#1C2647')
  await expect(tl.locator('table tbody tr')).toHaveText(['Set upWeek 1', 'First reviewWeek 2'])
  await expect(parts.nth(2).locator('figure[data-chart="bars"] table tbody tr')).toHaveText(['Now2', 'Next quarter6'])
  // the text itself is as before
  await expect(text).toContainText('A pilot with two advisors')
  await expect(text).toContainText('Week 2: first review')

  await page.setViewportSize({ width: 390, height: 800 })
  await expect(tl.locator('svg')).toBeHidden()
  await expect(tl.locator('table')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
