// Today's rules (v115TodayHtml as v137 left it, with nwOvNeeds, nwOvRuns, v115OvSignups and v115ProdLine): the hello
// line, the products' status lines, the recent runs and the sign-ups' times. Pure: the page and the tests both use it.

import { type Item, KINDS, type Kind, kindLabel } from './approvals'

export const plural = (n: number, one: string, many?: string) => n + ' ' + (n === 1 ? one : (many ?? one + 's'))

/** Good morning before noon, good afternoon until six, good evening after (by the viewer's clock). */
export const greeting = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')

/** The first word of a name, capitalized (nwFirstName): "QA Teammate" is QA, "kser.v@…" is Kser. */
export function firstName(name: string): string {
  const n = String(name ?? '').trim().split(/[\s@._]/)[0] ?? ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}

export const hello = (hour: number, name: string) => greeting(hour) + (firstName(name) ? ', ' + firstName(name) : '') + '.'

/** "3 things need you." (the hello line counts what waits on Approvals and Catalyst's new clients and transcripts). */
export const needLine = (n: number) => (n ? (n === 1 ? '1 thing needs you.' : n + ' things need you.') : 'Nothing needs you right now.')

/** "Wednesday 11 November" (nwToday), in the viewer's time zone once the page is in the browser. */
export const todayText = (d: Date, timeZone?: string) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone })

/** What waits for a person: not skipped in this browser, not a reply older than a week (nwApprovalItems). */
export const waiting = (items: Item[], skips: Record<string, unknown>) => items.filter((x) => !skips[x.key] && !x.stale)

/** Needs you's chips: each kind with something waiting, in the tabs' order. */
export function needChips(items: Item[]): { kind: Kind; word: string; label: string }[] {
  return KINDS.map(([k, , word]) => ({ k, word, n: items.filter((x) => x.kind === k).length }))
    .filter((c) => c.n > 0)
    .map((c) => ({ kind: c.k, word: c.word, label: kindLabel(c.k, c.n) }))
}

// ---------- the products' lines (v115ProdLine) ----------

export const touchLine = (n: number) => (n ? plural(n, 'thing') + ' waiting for you' : 'Nothing waiting for you')

/** "12 leads · 9 waiting on a next stage": leads not a weak fit that are short of the last meeting stage. */
export const catalystLine = (leads: number, next: number) => plural(leads, 'lead') + (next ? ' · ' + next + ' waiting on a next stage' : '')

/** "2 briefs to review · 1 live landing page"; the pages are left out when they could not be read. */
export function pipelineLine(briefs: number, live: number | null): string {
  return [briefs ? kindLabel('brief', briefs) + ' to review' : 'No briefs waiting', live === null ? '' : plural(live, 'live landing page')]
    .filter(Boolean)
    .join(' · ')
}

export const CANVAS_LINE = 'Lead documents and call write-ups'
export const ATLAS_LINE = 'Knowledge base, files, company profile and templates'

// ---------- recent runs (nwOvRuns) ----------

export type RunRow = { agent: string; status: string; at: string }

const AGENT_NAMES: Record<string, string> = {
  intel_tracker: 'Intel Tracker',
  ad_strategist: 'Ad Strategist',
  low_ticket_content: 'Marketing Generation',
  content_generation: 'Content Transformation',
}
export const agentName = (agent: string) => AGENT_NAMES[agent] ?? (String(agent || 'Agent').replace(/_/g, ' ') || 'Agent')
export const runIcon = (agent: string): 'megaphone' | 'radar' | 'rocket' => (agent === 'ad_strategist' ? 'megaphone' : agent === 'intel_tracker' ? 'radar' : 'rocket')

/** Done, Running or Failed, as the current dashboard reads a run's status (nwRunOk). */
export function runState(status: string): 'done' | 'running' | 'failed' {
  const s = String(status ?? '')
  if (/^(success|done|ok|completed)$/i.test(s)) return 'done'
  return /running|started|queued/i.test(s) ? 'running' : 'failed'
}

/** "Wed 11 Nov, 2:05 PM" (nwWhen), with the year when it is not this year. */
export function whenText(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  const year = (x: Date) => x.toLocaleDateString('en-GB', { year: 'numeric', timeZone })
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone }
  if (year(d) !== year(new Date())) opts.year = 'numeric'
  return (
    d.toLocaleDateString('en-GB', { weekday: 'short', timeZone }) +
    ' ' +
    d.toLocaleDateString('en-GB', opts) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
  )
}

// ---------- sign-ups ----------

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago" (v113Ago). */
export function agoWords(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const m = Math.round((now - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return plural(m, 'minute') + ' ago'
  if (m < 1440) return plural(Math.round(m / 60), 'hour') + ' ago'
  if (m < 2880) return 'yesterday'
  return Math.round(m / 1440) + ' days ago'
}

/** Take the tour (NW_TOUR): the current dashboard's first three steps (the first as v115 left it), and a fourth that is
 * true here (the old one spoke of Ask, Ctrl K, G shortcuts and Customize, which this dashboard does not have). */
export const TOUR: readonly { t: string; p: string }[] = [
  {
    t: 'Five products, one sidebar',
    p: 'Touchpoint is home: today, approvals and tasks. Catalyst holds leads, contacts and calls (Engine 1), Canvas the client deliverables, Pipeline the content and ads (Engine 3), Atlas the knowledge and files. Click a name to open its pages.',
  },
  {
    t: 'One place for every approval',
    p: 'Briefs, ads and the replies the tracker drafts all wait in Approvals. Approve one at a time, or select several and approve them together. Undo is one click.',
  },
  {
    t: 'Two ways to create',
    p: 'Content Transformation starts from your own material. Marketing Generation starts from the briefs. Both show what they will use before you generate.',
  },
  {
    t: 'Some pages are still moving over',
    p: 'A page that has not moved here yet opens a card that links to it in the current dashboard. Both work on the same leads, briefs and approvals. The current dashboard has its own sign-in, so it may ask you to sign in there too.',
  },
]
