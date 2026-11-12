import { expect, test } from '@playwright/test'
import {
  type Content, type Signup, adUrl, adsApproved, approvalOf, approvedStatus, contentFrom, csvName, csvOf, dash, dayOf, fieldKeys, goLiveProblem, goText,
  goUrl, holes, hubspotOf, kindName, leftNote, leftOut, linkFor, nums, okSlug, packageName, pageCode, pageFrom, pageOf, previewHref, slugFree, slugOf,
  suFrom, suRows,
} from '../../src/lib/pipeline/landing'
import { DRAFT_CONTENT, LIVE_CONTENT, LP, PK, landingRows } from './landing-fixtures'

// The Landing pages rules without a browser: a campaign as a page, what holds a page from going live, the editor's
// boxes read back, the address, each ad's code and links, where a campaign stands, the numbers and the sign-ups' CSV.

const rows = landingRows()
const pkg = (id: string) => rows.funnel_packages.find((p) => p.id === id) as Record<string, unknown>
const page = (id: string) => pageOf(rows.landing_pages.find((p) => p.id === id) as Record<string, unknown>)

const su = (o: Partial<Signup>): Signup => ({
  id: 's', pageId: LP.live, slug: 'onboarding-audit', name: '', email: '', company: '', jobTitle: '', phone: '', code: '',
  utm: { source: '', medium: '', campaign: '' }, hubspotId: '', hubspotError: '', leadAdded: false, createdAt: new Date().toISOString(), leadHref: '', ...o,
})

test('a landing_pages row as the page uses it', () => {
  const p = page(LP.live)
  expect(p).toMatchObject({ slug: 'onboarding-audit', status: 'live', kind: 'book_call', sourceId: PK.book, addToPipeline: true })
  expect(p.ads.map((a) => a.code)).toEqual(['PK7Q2-A1', 'PK7Q2-A2'])
  // a page with no campaign has no source; JSON kept as text reads the same
  expect(page(LP.paused).sourceId).toBe('')
  const odd = pageOf({ id: 'x', status: 'archived', kind: 'quiz', content: JSON.stringify({ headline: 'Hi' }), ads: JSON.stringify([{ code: 'P1-A1' }]), add_to_pipeline: null })
  expect(odd).toMatchObject({ status: 'draft', kind: 'landing', content: { headline: 'Hi' }, addToPipeline: true })
  expect(odd.ads[0]).toEqual({ code: 'P1-A1', n: 1, hook: '', headline: '' })
  expect(kindName('newsletter_signup')).toBe('Newsletter sign-up')
  expect(kindName('quiz')).toBe('Page')
})

test('a Funnel Builder package as a page: its main step, the step after sign-up, the details and the ads', () => {
  const b = pageFrom(pkg(PK.fresh), 'UTC')
  expect(b.kind).toBe('download')
  expect(b.title).toBe('AI readiness checklist')
  // the dash rule (v116): a dash between words becomes a comma
  expect(b.content.headline).toBe('The AI readiness checklist, for advisory firms')
  expect(b.content.bullets).toEqual(['Where AI saves time', 'What to keep human'])
  expect(b.content.fields).toEqual(['name', 'email', 'company'])
  // a question with no answer is left out
  expect(b.content.faq).toEqual([{ q: 'Is it free?', a: 'Yes.' }])
  expect(b.content.cta).toBe('Send it to me')
  expect(b.content.questions).toEqual([])
  expect(b.content.thanks).toEqual({ headline: 'Here it is.', body: 'The checklist is ready.', cta: 'Get the checklist', url: 'https://example.org/checklist.pdf' })
  expect(b.flags).toEqual(['Check the checklist link works'])
  // ads with nothing to say are left out; a primary text stands in for a hook
  expect(b.ads).toEqual([
    { n: 1, hook: 'Is your firm ready for AI?', headline: 'Free checklist' },
    { n: 2, hook: 'Twelve questions before you buy.', headline: '' },
  ])
})

test('a book-a-call campaign as a page: its landing page, survey, booking link and hooks', () => {
  const b = pageFrom(
    {
      run_id: 'lt-9', funnel_type: null, created_at: '2026-11-03T10:00:00Z',
      setup: JSON.stringify({ booking: { url: 'https://calendly.com/x/20min.' } }),
      landing_page: JSON.stringify({ headline: 'Talk to us', benefit_bullets: ['Fast', 'Clear'], offer_block: 'Free for advisors', sections: ['Plain text section'] }),
      survey: JSON.stringify({ questions: [{ question: 'Firm size?', options: ['Small', '', 'Large'] }, { question: '' }, { label: 'Timeline?' }] }),
      booking_page: JSON.stringify({ headline: 'Pick a time', reassurance_subhead: 'No pressure.' }),
      ad_variations: JSON.stringify({ hook_variations: ['Hook one', '', 'Hook two'] }),
    },
    'UTC',
  )
  expect(b.kind).toBe('book_call')
  // no title: the kind and the day it was made
  expect(b.title).toMatch(/^Book a call · 3 Nov/)
  expect(b.content.bullets).toEqual(['Fast', 'Clear'])
  expect(b.content.sections).toEqual([{ title: '', body: 'Plain text section' }, { title: '', body: 'Free for advisors' }])
  expect(b.content.questions).toEqual([
    { key: 'q1', label: 'Firm size?', options: ['Small', 'Large'] },
    { key: 'q3', label: 'Timeline?', options: [] },
  ])
  expect(b.content.fields).toEqual(['name', 'email', 'company', 'job_title'])
  expect(b.content.cta).toBe('Book my call')
  // a trailing full stop is not part of the link
  expect(b.content.thanks).toEqual({ headline: 'Pick a time', body: 'No pressure.', cta: '', url: 'https://calendly.com/x/20min' })
  expect(b.ads.map((a) => a.hook)).toEqual(['Hook one', 'Hook two'])
})

test('where the link after sign-up comes from, by kind', () => {
  expect(linkFor('book_call', { details: 'Checkout link: https://pay.example.org/x' }, {})).toBe('https://pay.example.org/x')
  expect(linkFor('book_call', {}, { 'Calendly link': 'https://calendly.com/y' })).toBe('https://calendly.com/y')
  expect(linkFor('webinar', {}, { 'Registration link': 'https://zoom.example.org/r' })).toBe('https://zoom.example.org/r')
  expect(linkFor('newsletter_signup', {}, { 'Sign-up link': 'not a link' })).toBe('')
  expect(linkFor('landing', {}, { 'Page link': 'https://example.org/next' })).toBe('https://example.org/next')
  // the campaign's own fields read by their labels; the email is always asked
  expect(fieldKeys(['Mobile number', { label: 'Your role' }, 'Organisation'], 'landing')).toEqual(['email', 'company', 'job_title', 'phone'])
  expect(fieldKeys([], 'newsletter_signup')).toEqual(['name', 'email'])
})

test('what holds a page from going live, named by its box', () => {
  expect(holes(DRAFT_CONTENT as Content)).toEqual(['[ADD date and time] (When)'])
  const c: Content = {
    headline: 'Hi [ADD name]',
    bullets: ['[FILL IN proof]', '[FILL IN proof]'],
    thanks: { url: '[ADD link]' },
    questions: [
      { key: 'q1', label: 'Budget [ADD range]?', options: [] },
      { key: 'q2', label: 'Off [ADD x]', options: [], off: true },
    ],
  }
  // each hole once; a question that is off holds nothing
  expect(holes(c)).toEqual([
    '[ADD name] (Headline)',
    '[FILL IN proof] (Points)',
    '[ADD link] (Button link)',
    '[ADD range] (a qualifying question: untick it or fix it in the campaign)',
  ])
  expect(holes(LIVE_CONTENT as Content)).toEqual([])
})

test('the checks before a page goes live, in order', () => {
  const base: Content = { headline: 'H', cta: 'Go', thanks: { url: 'https://x.example.org' } }
  expect(goLiveProblem({ ...base, headline: 'H [ADD]' }, 'landing', true)).toBe('Fill in [ADD] (Headline) before it goes live.')
  expect(goLiveProblem({ ...base, headline: '' }, 'landing', true)).toBe('Add a headline before it goes live.')
  expect(goLiveProblem({ ...base, cta: '' }, 'landing', true)).toBe('Add the button text before it goes live.')
  expect(goLiveProblem({ ...base, thanks: {} }, 'book_call', true)).toBe('Add your booking link under After they sign up, so people can pick a time.')
  expect(goLiveProblem({ ...base, thanks: {} }, 'download', true)).toBe('Add the link to the file under After they sign up, so people get it.')
  expect(goLiveProblem({ ...base, thanks: {} }, 'webinar', true)).toBe('')
  expect(goLiveProblem({ ...base, thanks: { url: 'http://x.example.org' } }, 'landing', true)).toBe('The button link after sign-up needs to start with https://')
  expect(goLiveProblem({ ...base, flags: ['Check it'] }, 'landing', false)).toBe('Tick "I checked these" first.')
  expect(goLiveProblem({ ...base, flags: ['Check it'] }, 'landing', true)).toBe('')
})

test("the editor's boxes read back: other keys kept, boxes cut, questions only switched, dashes tidied", () => {
  const stored = DRAFT_CONTENT as Content
  const out = contentFrom(stored, {
    headline: '  New headline — today ',
    subheadline: 'Sub',
    who: 'Firms',
    // the When and Who presents boxes not shown: their stored values stay
    proof: 'One\n\n Two \n',
    bullets: Array.from({ length: 12 }, (_, i) => 'Point ' + i).join('\n'),
    sections: [
      { title: 'Kept', body: 'Body' },
      { title: 'Heading only', body: '' },
    ],
    faq: [
      { q: 'Q', a: 'A' },
      { q: 'Half', a: '' },
    ],
    fields: ['phone', 'nonsense'],
    off: ['q1'],
    cta: 'Join',
    thanks: { headline: 'T', body: 'B', cta: '', url: 'https://x.example.org' },
  })
  expect(out.headline).toBe('New headline, today')
  expect(out.when).toBe(DRAFT_CONTENT.when)
  expect(out.presenter).toBe('Jamie Host')
  expect(out.proof).toEqual(['One', 'Two'])
  expect(out.bullets).toHaveLength(10)
  expect(out.sections).toEqual([{ title: 'Kept', body: 'Body' }])
  expect(out.faq).toEqual([{ q: 'Q', a: 'A' }])
  expect(out.fields).toEqual(['email', 'phone'])
  expect(out.flags).toEqual(DRAFT_CONTENT.flags)
  // the campaign's questions with only their switch changed
  const withQs = contentFrom(LIVE_CONTENT as Content, { ...emptyBoxes(), off: ['q2', 'made-up'] })
  expect(withQs.questions).toEqual([
    { key: 'q1', label: 'How many advisors?', options: ['1-5', '6-20', '21+'], off: false },
    { key: 'q2', label: 'What slows onboarding most?', options: [], off: true },
  ])
  // a range keeps its hyphen
  expect(dash('11am – 12pm, Tuesday — Pacific')).toBe('11am-12pm, Tuesday, Pacific')
  expect(leftOut([{ title: 'Heading only', body: '' }, { title: '', body: '' }], [{ q: 'Q', a: '' }, { q: '', a: '' }])).toBe(2)
  expect(leftNote(0)).toBe('')
  expect(leftNote(1)).toBe(' One unfinished section or question was left out.')
  expect(leftNote(3)).toBe(' 3 unfinished sections or questions were left out.')
})

function emptyBoxes() {
  return { headline: 'H', subheadline: '', who: '', bullets: '', sections: [], faq: [], fields: [], off: [], cta: 'Go', thanks: { headline: '', body: '', cta: '', url: '' } }
}

test('the address: from the name, free of others, and what it takes', () => {
  expect(slugOf('AI Readiness — Café Guide!')).toBe('ai-readiness-cafe-guide')
  expect(slugOf('Hi')).toBe('page-hi')
  expect(slugOf('')).toBe('page')
  expect(slugOf('x'.repeat(80))).toHaveLength(48)
  expect(slugFree('ai-guide', ['ai-guide', 'ai-guide-2'])).toBe('ai-guide-3')
  expect(slugFree('ai-guide', [])).toBe('ai-guide')
  expect(okSlug('ab')).toBe(false)
  expect(okSlug('good-one')).toBe(true)
  expect(okSlug('Bad-One')).toBe(false)
  expect(okSlug('double--dash')).toBe(false)
  expect(okSlug('a'.repeat(61))).toBe(false)
  let i = 0
  const seq = [0, 0.999, 0.5, 0.25]
  expect(pageCode(() => seq[i++])).toBe('PA9SJ')
  expect(pageCode()).toMatch(/^P[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}$/)
})

test("each ad's link, the public address and where Preview opens", () => {
  expect(goUrl('onboarding-audit')).toBe('https://aiparagon.vercel.app/go/onboarding-audit')
  expect(goText('onboarding-audit')).toBe('aiparagon.vercel.app/go/onboarding-audit')
  expect(adUrl('onboarding-audit', 'PK7Q2-A1', 'meta')).toBe(
    'https://aiparagon.vercel.app/go/onboarding-audit?utm_source=meta&utm_medium=paid&utm_campaign=onboarding-audit&utm_content=PK7Q2-A1',
  )
  expect(adUrl('x-page', 'P1-A2', 'post')).toContain('utm_source=post&utm_medium=organic')
  expect(previewHref({ id: LP.live, slug: 'onboarding-audit', status: 'live' })).toBe('https://aiparagon.vercel.app/go/onboarding-audit?preview=1')
  expect(previewHref({ id: LP.draft, slug: 'ai-in-wealth-webinar', status: 'draft' })).toBe('/preview/landing/' + LP.draft)
  expect(previewHref({ id: LP.paused, slug: 'x', status: 'paused' })).toBe('/preview/landing/' + LP.paused)
})

test('where a campaign stands, and what the picker calls it', () => {
  expect(approvedStatus('launched')).toBe(true)
  expect(approvedStatus('approved')).toBe(true)
  expect(approvedStatus('pending_approval')).toBe(false)
  expect(approvedStatus('approved_pending')).toBe(false)
  expect(approvalOf({ funnel_type: 'webinar', status: 'draft' }, true)).toBe('Sent back')
  expect(approvalOf({ funnel_type: 'webinar', status: 'pending_review' }, true)).toBe('Not approved yet')
  expect(approvalOf({ funnel_type: null, status: 'pending_approval' }, true)).toBe('Approved')
  expect(approvalOf({ funnel_type: null, status: 'draft' }, false)).toBe('Not approved yet')
  expect(adsApproved([{ file: 'a' }, { file: 'b' }], { a: 'approved', b: 'approved' })).toBe(true)
  expect(adsApproved([{ file: 'a' }, { file: 'b' }], { a: 'approved', b: 'rejected' })).toBe(false)
  expect(adsApproved([], {})).toBe(false)
  expect(packageName(pkg(PK.fresh))).toBe('AI readiness checklist')
  expect(packageName(pkg(PK.ads))).toBe('Compliance review call')
  expect(packageName({ funnel_type: 'newsletter_signup' })).toBe('Newsletter sign-up')
  expect(packageName({ funnel_type: null })).toBe('Book a call campaign')
  expect(dayOf('')).toBe('')
})

test('the numbers: visits in 30 days, sign-ups in 30 days and the rate', () => {
  const now = Date.now()
  const views = [
    { pageId: 'a', day: '', code: '', views: 30 },
    { pageId: 'b', day: '', code: '', views: 10 },
  ]
  const list = [su({ pageId: 'a' }), su({ pageId: 'a', createdAt: new Date(now - 40 * 864e5).toISOString() }), su({ pageId: 'b' })]
  expect(nums(views, list, 'a', now)).toEqual({ views: 30, su: 2, su30: 1, conv: 3.3 })
  expect(nums(views, list, null, now)).toEqual({ views: 40, su: 3, su30: 2, conv: 5 })
  expect(nums([], list, 'a', now).conv).toBeNull()
})

test('sign-ups: search, where they came from, HubSpot and the CSV', () => {
  const pages = [page(LP.live)]
  const a = su({ id: '1', name: 'Pat Example', email: 'pat@example.org', code: 'PK7Q2-A1', utm: { source: 'meta', medium: 'paid', campaign: 'onboarding-audit' }, hubspotId: 'h' })
  const b = su({ id: '2', name: 'Casey', company: '=SUM(1)', hubspotError: 'Rate limited' })
  const c = su({ id: '3', name: 'Jo "the" Tester', pageId: 'gone', slug: 'old-page', utm: { source: 'linkedin', medium: '', campaign: '' } })
  expect(suRows([a, b, c], pages, 'onboarding').map((s) => s.id)).toEqual(['1', '2'])
  expect(suRows([a, b, c], pages, 'pk7q2').map((s) => s.id)).toEqual(['1'])
  expect(suRows([a, b, c], pages, '  ').length).toBe(3)
  expect([suFrom(a), suFrom(b), suFrom(c)]).toEqual(['PK7Q2-A1 · meta', 'Direct', 'linkedin'])
  expect([hubspotOf(a), hubspotOf(b), hubspotOf(c)]).toEqual(['Added', 'Not added', 'Waiting'])
  const csv = csvOf([a, b, c], pages).split('\n')
  expect(csv[0]).toBe('When,Name,Email,Company,Job title,Phone,Page,Ad code,Source,Medium,Campaign,HubSpot,In lead pipeline')
  expect(csv[1]).toContain(',Pat Example,pat@example.org,,,,Onboarding audit,PK7Q2-A1,meta,paid,onboarding-audit,Added,No')
  // a formula is kept as text; quotes are doubled; a page that is gone shows its address
  expect(csv[2]).toContain(",Casey,,'=SUM(1),,,Onboarding audit,,,,,Not added,No")
  expect(csv[3]).toContain(',"Jo ""the"" Tester",,,,,old-page,,linkedin,,,,No')
  expect(csvName(Date.parse('2026-11-12T08:00:00Z'))).toBe('sign-ups-2026-11-12.csv')
})
