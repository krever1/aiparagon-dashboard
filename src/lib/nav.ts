// Every page of the internal dashboard, grouped the way the sidebar shows them (the products, then Settings and the
// account page). Plain data, so the tests read it too. A page's `slug` is its address in this app; `legacy` is its
// address word in the current dashboard (aiparagon.vercel.app/dashboard/<legacy>), where it lives until it is ported.

export type IconName =
  | 'house' | 'lightbulb' | 'pen' | 'funnel' | 'globe' | 'sliders' | 'user-circle'
  | 'sun' | 'inbox' | 'circle-check' | 'overview' | 'users' | 'user' | 'message' | 'layers' | 'radar'
  | 'megaphone' | 'file-text' | 'repeat' | 'rocket' | 'panels' | 'flask' | 'history' | 'book' | 'folder'
  | 'building' | 'copy' | 'plug' | 'sparkles' | 'scroll'

export type ProductKey = 'touchpoint' | 'catalyst' | 'canvas' | 'pipeline' | 'atlas' | 'settings' | 'account'

export type PageDef = {
  slug: string
  /** what the sidebar calls it */
  label: string
  /** the page heading and the browser tab */
  title: string
  icon: IconName
  product: ProductKey
  /** its address word in the current dashboard */
  legacy: string
}

export type ProductDef = {
  key: ProductKey
  name: string
  sub: string
  icon: IconName
  pages: PageDef[]
}

const page = (product: ProductKey, slug: string, label: string, icon: IconName, title = label, legacy = slug): PageDef =>
  ({ slug, label, title, icon, product, legacy })

export const PRODUCTS: ProductDef[] = [
  {
    key: 'touchpoint', name: 'Touchpoint', sub: 'Home and tasks', icon: 'house',
    pages: [
      page('touchpoint', 'today', 'Today', 'sun'),
      page('touchpoint', 'approvals', 'Approvals', 'inbox'),
      page('touchpoint', 'tasks', 'Tasks', 'circle-check'),
    ],
  },
  {
    key: 'catalyst', name: 'Catalyst', sub: 'Clients and meetings', icon: 'lightbulb',
    pages: [
      page('catalyst', 'engine-1', 'Overview', 'overview', 'Catalyst overview'),
      page('catalyst', 'lead-pipeline', 'Lead pipeline', 'users'),
      page('catalyst', 'hubspot', 'HubSpot contacts', 'user'),
      page('catalyst', 'calls', 'Calls', 'message'),
    ],
  },
  {
    key: 'canvas', name: 'Canvas', sub: 'Client deliverables', icon: 'pen',
    pages: [page('canvas', 'deliverables', 'Deliverables', 'layers')],
  },
  {
    key: 'pipeline', name: 'Pipeline', sub: 'Content and ads', icon: 'funnel',
    pages: [
      page('pipeline', 'engine-3', 'Overview', 'overview', 'Pipeline overview'),
      page('pipeline', 'intel-tracker', 'Intel Tracker', 'radar'),
      page('pipeline', 'ad-strategist', 'Ad Strategist', 'megaphone'),
      page('pipeline', 'briefs', 'Market Intelligence Briefs', 'file-text'),
      page('pipeline', 'content-transformation', 'Content Transformation', 'repeat'),
      page('pipeline', 'marketing-generation', 'Marketing Generation', 'rocket'),
      page('pipeline', 'landing-pages', 'Landing pages', 'panels'),
      page('pipeline', 'ad-testing', 'Ad Testing', 'flask'),
      page('pipeline', 'runs', 'Runs & uploads', 'history'),
    ],
  },
  {
    key: 'atlas', name: 'Atlas', sub: 'Knowledge and files', icon: 'globe',
    pages: [
      page('atlas', 'knowledge-base', 'Knowledge base', 'book'),
      page('atlas', 'files', 'Files', 'folder'),
      page('atlas', 'company-profile', 'Company profile', 'building'),
      page('atlas', 'templates', 'Templates', 'copy'),
    ],
  },
]

export const SETTINGS: ProductDef = {
  key: 'settings', name: 'Settings', sub: 'Integrations and AI', icon: 'sliders',
  pages: [
    page('settings', 'integrations', 'Integrations', 'plug'),
    page('settings', 'ai-settings', 'AI settings', 'sparkles'),
    page('settings', 'audit-log', 'Audit log', 'scroll'),
  ],
}

export const ACCOUNT: ProductDef = {
  key: 'account', name: 'Account', sub: 'Your account', icon: 'user-circle',
  pages: [page('account', 'account', 'Your account', 'user-circle')],
}

export const GROUPS: ProductDef[] = [...PRODUCTS, SETTINGS, ACCOUNT]
export const PAGES: PageDef[] = GROUPS.flatMap((g) => g.pages)

/** The page an address shows, or null. */
export function pageForPath(pathname: string): PageDef | null {
  const slug = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? ''
  return PAGES.find((p) => p.slug === slug) ?? null
}

export function productOf(key: ProductKey): ProductDef {
  return GROUPS.find((g) => g.key === key) ?? PRODUCTS[0]
}

export function pageBySlug(slug: string): PageDef {
  const p = PAGES.find((x) => x.slug === slug)
  if (!p) throw new Error('No dashboard page with the address ' + slug)
  return p
}

/** Where a page lives in the current dashboard. */
export function legacyUrl(base: string, p: PageDef): string {
  return base.replace(/\/+$/, '') + '/' + p.legacy
}

/** A path after sign-in may only point inside this app. */
export function safeNext(next: string | null | undefined, fallback = '/today'): string {
  const n = String(next ?? '')
  if (!n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\') || n.startsWith('/login') || n.startsWith('/auth/')) return fallback
  return n
}

/** Pages that have moved to this app; every other page shows a card that opens it in the current dashboard. */
export const PORTED: ReadonlySet<string> = new Set(['today', 'approvals', 'tasks', 'engine-1', 'lead-pipeline', 'hubspot', 'calls', 'intel-tracker', 'ad-strategist', 'engine-3', 'briefs', 'runs', 'landing-pages', 'ad-testing', 'content-transformation'])

/** A page's heading when it is not its title (the browser tab says "Catalyst overview", the page "Overview"). */
export const HEADINGS: Readonly<Record<string, string>> = { 'engine-1': 'Overview' }
