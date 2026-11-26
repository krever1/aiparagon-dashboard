// Feedback pins (v144Fb*): a note left on any part of a page, saved for the team in dashboard_comments with target_key
// `fb:<view>`, or `fb:<view>:<lead email>` on a lead's page, and where on the page in anchor_text as JSON {sel, label,
// x, y}. The view is the current dashboard's name for the page (apCurrentView), so a pin left in either app is on the
// same page in both. Pure: the shell, Approvals and the tests use it.

import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { PAGES, legacyUrl, pageForPath } from '@/lib/nav'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** Each page's view in the current dashboard (its ROUTE_SLUG, read backwards). */
export const VIEW_OF: Readonly<Record<string, string>> = {
  today: 'today',
  approvals: 'approvals',
  tasks: 'tasks',
  'engine-1': 'e1overview',
  'lead-pipeline': 'e1pipeline',
  hubspot: 'hubspot',
  calls: 'calls',
  deliverables: 'deliverables',
  'engine-3': 'e3overview',
  'intel-tracker': 'e3intel',
  'ad-strategist': 'e3ads',
  briefs: 'e3briefs',
  'content-transformation': 'e3create',
  'marketing-generation': 'e3funnel',
  'landing-pages': 'e3landing',
  'ad-testing': 'e3testing',
  runs: 'e3history',
  'knowledge-base': 'kb',
  files: 'files',
  'company-profile': 'e3client',
  templates: 'templates',
  integrations: 'integrations',
  'ai-settings': 'learning',
  'audit-log': 'audit',
  account: 'profile',
}

/** A lead's own page (/lead-pipeline/<lead>). */
export const LEAD_PATH = /^\/lead-pipeline\/[^/]+\/?$/

/** The page's feedback key: `fb:<view>`, with the lead's email on a lead's page (v144FbKey). */
export function fbKey(pathname: string, leadEmail = ''): string {
  if (LEAD_PATH.test(pathname)) return 'fb:e1pipeline' + (leadEmail ? ':' + leadEmail.trim().toLowerCase() : '')
  const p = pageForPath(pathname)
  return 'fb:' + ((p && VIEW_OF[p.slug]) || 'today')
}

export type FbAnchor = { sel?: string; label?: string; x?: number; y?: number }
export type FbRow = {
  id: string
  target_key: string
  author: string
  body: string
  created_at: string
  resolved: boolean
  resolved_by: string
  anchor: FbAnchor
}

/** anchor_text as JSON, else nothing (v144FbAnchor). */
export function parseAnchor(v: unknown): FbAnchor {
  try {
    const a = typeof v === 'string' ? JSON.parse(v || '{}') : v
    return a && typeof a === 'object' && !Array.isArray(a) ? (a as FbAnchor) : {}
  } catch {
    return {}
  }
}

export function normRow(r: Record<string, unknown>): FbRow {
  return {
    id: str(r.id),
    target_key: str(r.target_key),
    author: str(r.author),
    body: str(r.body),
    created_at: str(r.created_at),
    resolved: r.resolved === true,
    resolved_by: str(r.resolved_by),
    anchor: parseAnchor(r.anchor_text),
  }
}

/** The part of an email before the @, else Someone. */
export const whoOf = (author: string) => str(author).split('@')[0] || 'Someone'

export const openRows = (rows: FbRow[], key?: string) => rows.filter((r) => !r.resolved && (!key || r.target_key === key))

/** Where a key points: the page's name ("Calls", "Pat Example · lead page") and its address here, or in the current
 * dashboard for a page not moved yet (`out`). */
export type FbPlace = { where: string; href: string; out: boolean }

export function fbPlace(key: string, lead: (email: string) => { id: string; name: string } | null, ported: ReadonlySet<string>): FbPlace {
  const p = str(key).split(':')
  const view = p[1] || ''
  const email = p.slice(2).join(':').trim().toLowerCase()
  if (email) {
    const l = lead(email)
    return { where: (l?.name || email) + ' · lead page', href: l ? '/lead-pipeline/' + encodeURIComponent(l.id) : '/lead-pipeline', out: false }
  }
  const slug = Object.keys(VIEW_OF).find((s) => VIEW_OF[s] === view)
  const page = slug ? PAGES.find((x) => x.slug === slug) : null
  if (!page) return { where: view || 'Today', href: '/today', out: false }
  if (!ported.has(page.slug)) return { where: page.title, href: legacyUrl(LEGACY_DASHBOARD_URL, page), out: true }
  return { where: page.title, href: '/' + page.slug, out: false }
}

/** A key's place with the pin asked for: the page opens in feedback mode at that note. */
export function goHref(place: FbPlace, id: string): string {
  if (place.out) return place.href
  return place.href + (place.href.includes('?') ? '&' : '?') + 'fb=' + encodeURIComponent(id)
}

/** The open ones grouped by page, newest page first (v144FbList). */
export function byPage(rows: FbRow[]): { key: string; rows: FbRow[] }[] {
  const out: { key: string; rows: FbRow[] }[] = []
  for (const r of openRows(rows)) {
    const g = out.find((x) => x.key === r.target_key)
    if (g) g.rows.push(r)
    else out.push({ key: r.target_key, rows: [r] })
  }
  return out
}
