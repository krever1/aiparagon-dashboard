// The Landing pages rules (v115, with v116, v120, v121 and v123 in the current dashboard): a funnel's package or a
// book-a-call campaign as a page (its words, the form, after sign-up, its ads), the page's address, what holds it from
// going live, the checks before it does, each ad's code and links, the numbers, and the sign-ups with their CSV. Pure:
// the server, the page and the tests all use it.

import { PUBLIC_SITE } from '@/lib/config'
import { arr, json } from './intel'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

export const KINDS = { book_call: 'Book a call', webinar: 'Webinar', download: 'Download', newsletter_signup: 'Newsletter sign-up', landing: 'Landing page' } as const
export type Kind = keyof typeof KINDS
export const isKind = (k: unknown): k is Kind => typeof k === 'string' && k in KINDS
export const kindName = (k: unknown) => (isKind(k) ? KINDS[k] : 'Page')

/** The form's fields, in the order the page shows them. */
export const FIELDS = [
  ['name', 'Full name'],
  ['email', 'Work email'],
  ['company', 'Company'],
  ['job_title', 'Job title'],
  ['phone', 'Phone'],
] as const
export type FieldKey = (typeof FIELDS)[number][0]
const FIELD_KEYS: readonly string[] = FIELDS.map((f) => f[0])
const DEF_FIELDS: Record<Kind, FieldKey[]> = {
  book_call: ['name', 'email', 'company', 'job_title'],
  webinar: ['name', 'email', 'company'],
  download: ['name', 'email'],
  newsletter_signup: ['name', 'email'],
  landing: ['name', 'email', 'company'],
}
const CTA: Record<Kind, string> = { book_call: 'Book my call', webinar: 'Save my seat', download: 'Send it to me', newsletter_signup: 'Subscribe', landing: 'Get in touch' }
const THANKS: Record<Kind, readonly [string, string]> = {
  book_call: ['Thanks. Pick a time that works.', 'We read your answers before the call, so it starts with your firm.'],
  webinar: ['You are registered.', 'We will email you the details and a reminder before it starts.'],
  download: ['Here it is.', 'Get it with the button below.'],
  newsletter_signup: ['You are in.', 'The next issue comes to your inbox.'],
  landing: ['Thanks. We will be in touch.', 'Someone from our team will reach out shortly.'],
}
/** The Funnel Builder's kinds as Marketing Generation names them (V113_FUNNELS), for a package with no title. */
const FUNNEL_NAMES: Record<string, string> = { webinar: 'Webinar or masterclass', download: 'Resource download', newsletter_signup: 'Newsletter sign-up', landing: 'Landing page' }

// ---------- the page's content ----------

export type Question = { key: string; label: string; options: string[]; off?: boolean }
export type Content = {
  headline?: string
  subheadline?: string
  who?: string
  when?: string
  presenter?: string
  how_often?: string
  bullets?: string[]
  sections?: { title: string; body: string }[]
  faq?: { q: string; a: string }[]
  proof?: string[]
  cta?: string
  fields?: string[]
  questions?: Question[]
  thanks?: { headline?: string; body?: string; cta?: string; url?: string }
  flags?: string[]
  [k: string]: unknown
}
export type Ad = { code: string; n: number; hook: string; headline: string }
export type Status = 'draft' | 'live' | 'paused'
export type Page = {
  id: string
  slug: string
  title: string
  status: Status
  kind: Kind
  sourceId: string
  content: Content
  ads: Ad[]
  addToPipeline: boolean
  createdAt: string
  updatedAt: string
  publishedAt: string
}

/** A landing_pages row as the page uses it. */
export function pageOf(r: Record<string, unknown>): Page {
  const st = str(r.status)
  return {
    id: str(r.id),
    slug: str(r.slug),
    title: str(r.title),
    status: st === 'live' || st === 'paused' ? st : 'draft',
    kind: isKind(r.kind) ? r.kind : 'landing',
    sourceId: str(r.source_type) === 'funnel_package' ? str(r.source_id) : '',
    content: json(r.content) as Content,
    ads: arr(r.ads)
      .map((a) => json(a))
      .map((a, i) => ({ code: str(a.code), n: Number(a.n) || i + 1, hook: str(a.hook), headline: str(a.headline) })),
    addToPipeline: r.add_to_pipeline !== false,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    publishedAt: str(r.published_at),
  }
}

/** v116: a range like 11am–12pm or 20–30 keeps a hyphen; any other dash becomes a comma. */
export function dash<T>(v: T): T {
  if (typeof v === 'string') return v.replace(/(\d(?:\s?[ap]\.?m\.?)?)\s*[—–]\s*(?=\d)/gi, '$1-').replace(/\s*[—–]\s*/g, ', ') as T
  if (Array.isArray(v)) return v.map(dash) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dash(x)])) as T
  return v
}

const PH = () => /\[(?:ADD|FILL IN)[^\]]*\]/gi

/**
 * What still holds a page from going live (v115Holes, as v116 left it): every [ADD…] or [FILL IN…] in a box the editor
 * shows, named by its box, and in a qualifying question that is on.
 */
export function holes(c: Content): string[] {
  const out: string[] = []
  const th = c.thanks ?? {}
  const walk = (v: unknown, where: string) => {
    if (typeof v === 'string') {
      for (const m of v.match(PH()) ?? []) {
        const t = m + ' (' + where + ')'
        if (!out.includes(t)) out.push(t)
      }
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, where))
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, where))
  }
  const boxes: [unknown, string][] = [
    [c.headline, 'Headline'],
    [c.subheadline, 'Under the headline'],
    [c.when, 'When'],
    [c.presenter, 'Who presents'],
    [c.how_often, 'How often'],
    [c.who, 'Who it is for'],
    [c.bullets, 'Points'],
    [c.sections, 'Sections'],
    [c.faq, 'Questions people ask'],
    [c.proof, 'Proof'],
    [c.cta, 'Button'],
    [th.headline, 'After sign-up headline'],
    [th.body, 'After sign-up text'],
    [th.cta, 'After sign-up button'],
    [th.url, 'Button link'],
  ]
  for (const [v, where] of boxes) walk(v, where)
  for (const q of arr(c.questions)) {
    const o = json(q)
    if (Object.keys(o).length && !o.off) walk([o.label, o.options], 'a qualifying question: untick it or fix it in the campaign')
  }
  return out
}

// ---------- the address ----------

export const SLUG_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const okSlug = (s: string) => SLUG_RULE.test(s) && s.length >= 3 && s.length <= 60

/** A page's address from its name (v115Slug): lowercase words with single dashes, at most 48 characters. */
export function slugOf(t: string): string {
  let s = String(t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  if (s.length < 3) s = ('page-' + s).replace(/-+$/, '') || 'page'
  return s
}

/** The address, or the first of "-2", "-3"… that no other page uses (v115SlugFree). */
export function slugFree(base: string, taken: string[]): string {
  let s = base
  let i = 2
  while (taken.includes(s)) s = base.slice(0, 44).replace(/-+$/, '') + '-' + i++
  return s
}

/** A page's code, made once (v115Code): P and four letters or digits that cannot be misread. Ad n is "<code>-A<n>". */
export function pageCode(rand: () => number = Math.random): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = 'P'
  for (let i = 0; i < 4; i++) s += A[Math.floor(rand() * A.length)]
  return s
}

// ---------- a package as a page (v115LpFrom) ----------

/** The form's fields from the campaign's own list, else the kind's usual ones; the email is always asked. */
export function fieldKeys(list: unknown, kind: Kind): FieldKey[] {
  const out: string[] = []
  for (const x of arr(list)) {
    const o = json(x)
    const s = String(typeof x === 'string' ? x : o.label || o.name || o.key || '').toLowerCase()
    const k = /mail/.test(s)
      ? 'email'
      : /phone|mobile/.test(s)
        ? 'phone'
        : /title|role|position/.test(s)
          ? 'job_title'
          : /company|firm|organi[sz]ation|business/.test(s)
            ? 'company'
            : /name/.test(s)
              ? 'name'
              : null
    if (k && !out.includes(k)) out.push(k)
  }
  if (!out.length) for (const k of DEF_FIELDS[kind]) if (!out.includes(k)) out.push(k)
  if (!out.includes('email')) out.push('email')
  return FIELD_KEYS.filter((k) => out.includes(k)) as FieldKey[]
}

/**
 * v116 (v121 for a landing page that books calls): the link after sign-up, from where Marketing Generation saved it:
 * the booking link (setup.booking), or the campaign detail of that kind, saved by its label.
 */
export function linkFor(kind: Kind, S: Record<string, unknown>, det: Record<string, unknown>): string {
  const ok = (u: unknown) => {
    const v = str(u).replace(/[.,;)]+$/, '')
    return /^https?:\/\/\S+$/i.test(v) ? v : ''
  }
  const said = (label: string) => {
    const m = new RegExp(label + ':\\s*(https?:\\/\\/\\S+)', 'i').exec(typeof S.details === 'string' ? S.details : '')
    return m ? m[1] : ''
  }
  const by: Record<Kind, unknown[]> = {
    book_call: [json(S.booking).url, det['Booking link'], det['Calendly link'], S.booking_url, said('Checkout link'), det['Checkout link']],
    webinar: [det['Registration link']],
    download: [det['File link'], det['Link to the resource']],
    newsletter_signup: [det['Sign-up link']],
    landing: [det['Booking link'], det['Page link']],
  }
  return by[kind].map(ok).find(Boolean) ?? ''
}

/** A date as the current dashboard words it ("6 Nov", with the year when it is not this one). */
export function dayOf(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  const tz = timeZone || undefined
  const year = (x: Date) => x.toLocaleDateString('en-GB', { year: 'numeric', timeZone: tz })
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: tz }
  if (year(d) !== year(new Date())) opts.year = 'numeric'
  return d.toLocaleDateString('en-GB', opts)
}

export type Built = { kind: Kind; title: string; content: Content; ads: Omit<Ad, 'code'>[]; flags: string[] }

/** A funnel's package (or a book-a-call campaign) as a page: the main step, the step after sign-up, the ads. */
export function pageFrom(pkg: Record<string, unknown>, timeZone?: string): Built {
  const kind: Kind = isKind(pkg.funnel_type) ? pkg.funnel_type : 'book_call'
  const S = json(pkg.setup)
  const det = json(S.details)
  const steps = arr(pkg.steps).map(json)
  const step = (k: string) => {
    const s = steps.find((x) => x.key === k)
    return s ? json(s.content) : null
  }
  const MAIN: Partial<Record<Kind, string>> = { webinar: 'registration_page', download: 'optin_page', newsletter_signup: 'signup_page', landing: 'landing_page' }
  const AFTER: Partial<Record<Kind, string>> = { webinar: 'confirmation_page', download: 'thank_you_page' }
  const mainStep = MAIN[kind] ? step(MAIN[kind]) : null
  const main = mainStep && Object.keys(mainStep).length ? mainStep : json(pkg.landing_page)
  const afterStep = AFTER[kind] ? step(AFTER[kind]) : null
  const after = afterStep && Object.keys(afterStep).length ? afterStep : kind === 'book_call' ? json(pkg.booking_page) : {}
  const list = (v: unknown) =>
    arr(v)
      .map((x) => (typeof x === 'string' ? x : str(json(x).text || json(x).claim || json(x).title)))
      .map(str)
      .filter(Boolean)
  const sections = arr(main.sections)
    .map((s) => (s && typeof s === 'object' ? { title: str(json(s).title), body: str(json(s).body) } : { title: '', body: str(s) }))
    .filter((s) => s.title || s.body)
  if (main.offer_block) sections.push({ title: '', body: str(main.offer_block) })
  const faq = arr(main.faq)
    .map((f) => ({ q: str(json(f).q || json(f).question), a: str(json(f).a || json(f).answer) }))
    .filter((f) => f.q && f.a)
  const sv = json(pkg.survey)
  const questions =
    kind === 'book_call'
      ? arr(sv.questions)
          .map((q, i) => ({
            key: 'q' + (i + 1),
            label: str(json(q).question || json(q).label),
            options: arr(json(q).options).map(str).filter(Boolean).slice(0, 8),
          }))
          .filter((q) => q.label)
          .slice(0, 6)
      : []
  const content: Content = dash({
    headline: str(main.headline),
    subheadline: str(main.subheadline),
    who: str(main.who),
    when: str(main.when || det['Date and time'] || det.When || det.Date),
    presenter: str(main.presenter || det.Presenter),
    how_often: str(main.how_often || det['How often']),
    bullets: list(main.bullets).concat(list(main.benefit_bullets)).slice(0, 8),
    sections: sections.slice(0, 8),
    faq: faq.slice(0, 8),
    proof: list(main.proof).slice(0, 6),
    cta: str(main.cta || S.cta) || CTA[kind],
    fields: fieldKeys(main.fields, kind),
    questions,
    thanks: {
      headline: str(after.headline) || THANKS[kind][0],
      body: str(after.body || after.reassurance_subhead || after.confirmation_microcopy) || THANKS[kind][1],
      cta: str(after.cta || after.primary_action),
      url: linkFor(kind, S, det),
    },
  })
  // v116: the Funnel Builder's ads (variants or a list) or the Low-Ticket Agent's hooks (hook_variations, plain lines)
  const av = pkg.ad_variations
  const avo = json(av)
  const raw = Array.isArray(av) ? av : Array.isArray(avo.variants) ? avo.variants : Array.isArray(avo.hook_variations) ? avo.hook_variations : arr(av)
  const ads = raw
    .map((a) => (typeof a === 'string' ? { hook: a } : json(a)))
    .filter((a) => str(a.hook || a.headline || a.primary_text))
    .slice(0, 6)
    .map((a, i) => ({ n: i + 1, hook: str(a.hook || a.headline || a.primary_text).slice(0, 160), headline: str(a.headline).slice(0, 80) }))
  const title = str(S.title || det.Title || det['The resource'] || det['Newsletter name']) || (kind === 'book_call' ? 'Book a call' : KINDS[kind]) + ' · ' + dayOf(str(pkg.created_at), timeZone)
  return { kind, title: title.slice(0, 120), content, ads, flags: arr(S.review_flags).map(str).filter(Boolean) }
}

// ---------- the campaign behind a page (v120) ----------

/** A package's status that counts as approved: launched, or approved and not pending. */
export const approvedStatus = (st: unknown) => {
  const s = str(st)
  return s === 'launched' || (/approved/i.test(s) && !/pending/i.test(s))
}

/** What the picker calls a package (v113FunName for the Funnel Builder's; else the campaign's title). */
export function packageName(pkg: Record<string, unknown>): string {
  const S = json(pkg.setup)
  const det = json(S.details)
  if (pkg.funnel_type) return str(S.title || det.Title || det['The resource'] || det['Newsletter name']) || FUNNEL_NAMES[str(pkg.funnel_type)] || 'Funnel'
  return str(S.title) || 'Book a call campaign'
}

export type Approval = 'Approved' | 'Sent back' | 'Not approved yet'

/**
 * Where a campaign stands (v120Pill): approved by its status, or (a book-a-call campaign) every ad image approved; a
 * Funnel Builder package sent back for changes is a draft again.
 */
export function approvalOf(pkg: { funnel_type: unknown; status: unknown }, adsAllApproved: boolean): Approval {
  if (approvedStatus(pkg.status) || (!pkg.funnel_type && adsAllApproved)) return 'Approved'
  return pkg.funnel_type && str(pkg.status) === 'draft' ? 'Sent back' : 'Not approved yet'
}

/** A book-a-call campaign's ad images all approved (v97CampStatus): each image's newest decision. */
export function adsApproved(images: unknown, decisions: Record<string, string>): boolean {
  const files = arr(images)
    .map(json)
    .map((i) => str(i.file))
    .filter(Boolean)
  return files.length > 0 && files.every((f) => decisions[f] === 'approved')
}

// ---------- the editor ----------

/** The editor's boxes as the client sends them; a box the editor does not show is left out. */
export type EditInput = {
  headline: string
  subheadline: string
  who: string
  when?: string
  presenter?: string
  how_often?: string
  proof?: string
  bullets: string
  sections: { title: string; body: string }[]
  faq: { q: string; a: string }[]
  fields: string[]
  /** the qualifying questions switched off, by key */
  off: string[]
  cta: string
  thanks: { headline: string; body: string; cta: string; url: string }
}

/**
 * The page's content from the editor (v115EdRead): its other keys kept (the review flags), each box cut to what the
 * page shows, the qualifying questions the campaign wrote with only their switch changed, every dash tidied.
 */
export function contentFrom(stored: Content, x: EditInput): Content {
  const lines = (v: unknown, n: number) =>
    String(v ?? '')
      .split('\n')
      .map(str)
      .filter(Boolean)
      .slice(0, n)
  const c: Content = { ...stored }
  c.headline = str(x.headline)
  c.subheadline = str(x.subheadline)
  c.who = str(x.who)
  if (x.when !== undefined) c.when = str(x.when)
  if (x.presenter !== undefined) c.presenter = str(x.presenter)
  if (x.how_often !== undefined) c.how_often = str(x.how_often)
  if (x.proof !== undefined) c.proof = lines(x.proof, 8)
  c.bullets = lines(x.bullets, 10)
  c.sections = arr(x.sections)
    .map((s) => ({ title: str(json(s).title), body: str(json(s).body) }))
    .filter((s) => s.body)
    .slice(0, 10)
  c.faq = arr(x.faq)
    .map((f) => ({ q: str(json(f).q), a: str(json(f).a) }))
    .filter((f) => f.q && f.a)
    .slice(0, 10)
  const asked = arr(x.fields).map(str)
  c.fields = FIELD_KEYS.filter((k) => k === 'email' || asked.includes(k))
  const off = new Set(arr(x.off).map(str))
  c.questions = arr(stored.questions)
    .map(json)
    .filter((q) => str(q.key))
    .map((q) => ({ ...(q as Question), off: off.has(str(q.key)) }))
  c.cta = str(x.cta)
  const th = json(x.thanks)
  c.thanks = { headline: str(th.headline), body: str(th.body), cta: str(th.cta), url: str(th.url) }
  return dash(c)
}

/** v116: sections with a heading and no text, and questions with only one half, are left out on Save. */
export function leftOut(sections: { title: string; body: string }[], faq: { q: string; a: string }[]): number {
  let n = 0
  for (const s of sections) if (str(s.title) && !str(s.body)) n++
  for (const f of faq) if (!!str(f.q) !== !!str(f.a)) n++
  return n
}

export const leftNote = (n: number) => (n ? (n === 1 ? ' One unfinished section or question was left out.' : ' ' + n + ' unfinished sections or questions were left out.') : '')

/** The checks before a page goes live, or stays live (v115LpSave), in order: the first that fails, or ''. */
export function goLiveProblem(c: Content, kind: Kind, checked: boolean): string {
  const h = holes(c)
  if (h.length) return 'Fill in ' + h.join(', ') + ' before it goes live.'
  if (!str(c.headline)) return 'Add a headline before it goes live.'
  if (!str(c.cta)) return 'Add the button text before it goes live.'
  const url = str(c.thanks?.url)
  if (!url && kind === 'book_call') return 'Add your booking link under After they sign up, so people can pick a time.'
  if (!url && kind === 'download') return 'Add the link to the file under After they sign up, so people get it.'
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) return 'The button link after sign-up needs to start with https://'
  if (arr(c.flags).length && !checked) return 'Tick "I checked these" first.'
  return ''
}

export const SLUG_WORDS = 'The address takes 3 to 60 lowercase letters, numbers and single dashes.'
export const SLUG_TAKEN = 'Another page already uses that address.'

// ---------- links ----------

/** The public page's address, and how the page writes it ("aiparagon.vercel.app/go/<page>"). */
export const PUBLIC_HOST = PUBLIC_SITE.replace(/^https?:\/\//, '')
export const goUrl = (slug: string) => PUBLIC_SITE + '/go/' + encodeURIComponent(slug)
export const goText = (slug: string) => PUBLIC_HOST + '/go/' + slug

/** An ad's link where it runs (v115AdUrl): the page, with the utm tags that tell Ad Testing which ad brought a visit. */
export function adUrl(slug: string, code: string, src: 'meta' | 'linkedin' | 'post'): string {
  const q =
    'utm_source=' +
    src +
    '&utm_medium=' +
    (src === 'post' ? 'organic' : 'paid') +
    '&utm_campaign=' +
    encodeURIComponent(slug) +
    '&utm_content=' +
    encodeURIComponent(code)
  return goUrl(slug) + '?' + q
}

/**
 * Where Preview opens: a live page as visitors see it (the public page, which shows a live page to anyone), any other
 * page drawn here from its row, since the public page shows a draft only to the current dashboard's own sign-in.
 */
export const previewHref = (p: Pick<Page, 'id' | 'slug' | 'status'>) => (p.status === 'live' ? goUrl(p.slug) + '?preview=1' : '/preview/landing/' + encodeURIComponent(p.id))

// ---------- the numbers ----------

export type View = { pageId: string; day: string; code: string; views: number }
export type Signup = {
  id: string
  pageId: string
  slug: string
  name: string
  email: string
  company: string
  jobTitle: string
  phone: string
  code: string
  utm: { source: string; medium: string; campaign: string }
  hubspotId: string
  hubspotError: string
  leadAdded: boolean
  createdAt: string
  /** the lead's page here, when the sign-up was added to the pipeline */
  leadHref: string
}

/** Visits and sign-ups of one page (or every page) (v115LpNums): visits over 30 days, sign-ups loaded and in 30 days. */
export function nums(views: View[], su: Signup[], id: string | null, now: number) {
  const since = now - 30 * 864e5
  const v = views.filter((x) => !id || x.pageId === id).reduce((s, x) => s + (Number(x.views) || 0), 0)
  const mine = su.filter((s) => !id || s.pageId === id)
  const su30 = mine.filter((s) => Date.parse(s.createdAt) >= since).length
  return { views: v, su: mine.length, su30, conv: v ? Math.round((su30 / v) * 1000) / 10 : null }
}

export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)

// ---------- sign-ups ----------

/** The sign-ups a search keeps (v115SuRows): name, email, company, job title, ad code or page. */
export function suRows(su: Signup[], pages: Page[], q: string): Signup[] {
  const t = q.trim().toLowerCase()
  if (!t) return su
  return su.filter((s) => {
    const pg = pages.find((p) => p.id === s.pageId)
    return [s.name, s.email, s.company, s.jobTitle, s.code, pg?.title].join(' ').toLowerCase().includes(t)
  })
}

export const suFrom = (s: Signup) => [s.code, s.utm.source].filter(Boolean).join(' · ') || 'Direct'
export const hubspotOf = (s: Signup) => (s.hubspotId ? 'Added' : s.hubspotError ? 'Not added' : 'Waiting')

/** The sign-ups as a CSV (v115SuCsv); a cell a spreadsheet would run as a formula starts with a quote mark. */
export function csvOf(rows: Signup[], pages: Page[]): string {
  const cell = (v0: unknown) => {
    let v = v0 === null || v0 === undefined ? '' : String(v0)
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
  }
  const head = ['When', 'Name', 'Email', 'Company', 'Job title', 'Phone', 'Page', 'Ad code', 'Source', 'Medium', 'Campaign', 'HubSpot', 'In lead pipeline']
  const lines = rows.map((s) => {
    const pg = pages.find((p) => p.id === s.pageId)
    return [
      s.createdAt,
      s.name,
      s.email,
      s.company,
      s.jobTitle,
      s.phone,
      pg ? pg.title : s.slug,
      s.code,
      s.utm.source,
      s.utm.medium,
      s.utm.campaign,
      s.hubspotId ? 'Added' : s.hubspotError ? 'Not added' : '',
      s.leadAdded ? 'Yes' : 'No',
    ]
      .map(cell)
      .join(',')
  })
  return [head.join(','), ...lines].join('\n')
}

export const csvName = (now: number) => 'sign-ups-' + new Date(now).toISOString().slice(0, 10) + '.csv'
