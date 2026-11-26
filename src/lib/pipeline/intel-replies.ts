// The Intel Tracker's replies (the current dashboard's v145, with v146's fixes): who each followed account is to the
// firm and whether its posts get replies (competitors.relation, competitors.draft_replies), why a post got a reply
// (engagement_drafts.why), and LinkedIn's Connections.csv read in the browser. Pure functions, for the server and the
// browser.

/** Who an account is to the firm (V145_REL); an empty relation reads as a competitor. */
export const RELATIONS = [
  ['competitor', 'Competitor'],
  ['connection', 'LinkedIn connection'],
  ['prospect', 'Prospect'],
  ['client', 'Client'],
  ['partner', 'Partner'],
  ['peer', 'Someone we follow'],
] as const
export type Relation = (typeof RELATIONS)[number][0]

const REL_WORD: Record<string, string> = {
  competitor: 'a competitor',
  connection: 'one of your LinkedIn connections',
  prospect: 'a prospect',
  client: 'a client',
  partner: 'a partner',
  peer: 'someone you follow',
}

export const isRelation = (v: unknown): v is Relation => RELATIONS.some(([k]) => k === v)
export const relationOf = (v: unknown): Relation => (isRelation(v) ? v : 'competitor')

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/**
 * A LinkedIn profile link in any shape (http or https, a country subdomain, no www, a trailing slash or a query) as one
 * address (v146Li), or '' when it is not a profile link.
 */
export function liUrl(u: unknown): string {
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#\s]+)/i.exec(str(u).trim())
  return m ? 'https://www.linkedin.com/in/' + m[1] : ''
}

/** The profile a saved LinkedIn handle points to, in lower case, whatever its shape (a link, or `in/<name>`). */
export function liKey(h: unknown): string {
  const v = str(h).trim()
  const full = liUrl(v)
  if (full) return full.slice('https://www.linkedin.com/in/'.length).toLowerCase()
  const m = /^in\/([^/?#\s]+)/i.exec(v)
  return m ? m[1].toLowerCase() : ''
}

/** A CSV as rows of cells (quotes and doubled quotes, commas, any line ending), as v145Csv reads it. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

export type Connection = { name: string; url: string; company: string; position: string; on: string }

/**
 * LinkedIn's Connections.csv (v145Conns, v146): a few lines of notes, then First Name, Last Name, URL, Email Address,
 * Company, Position, Connected On. The notes are skipped; only linkedin.com/in/ links count, each as one address, and a
 * person is listed once. Null when the file has no First Name and URL columns.
 */
export function connectionsFrom(text: string): Connection[] | null {
  const rows = csvRows(String(text ?? '').replace(/^﻿/, ''))
  const hi = rows.findIndex((r) => {
    const l = r.map((x) => x.trim().toLowerCase())
    return l.includes('first name') && l.includes('url')
  })
  if (hi < 0) return null
  const H = rows[hi].map((x) => x.trim().toLowerCase())
  const seen = new Set<string>()
  const out: Connection[] = []
  for (const r of rows.slice(hi + 1)) {
    const g = (n: string) => {
      const i = H.indexOf(n)
      return i >= 0 ? str(r[i]).trim() : ''
    }
    const name = (g('first name') + ' ' + g('last name')).replace(/\s+/g, ' ').trim()
    const url = liUrl(g('url'))
    if (!name || !url || seen.has(url.toLowerCase())) continue
    seen.add(url.toLowerCase())
    out.push({ name, url, company: g('company'), position: g('position'), on: g('connected on') })
  }
  return out
}

/** The most connections followed at a time: each one adds about 12 seconds to every run. */
export const IMPORT_MAX = 50

export type WhyInput = {
  /** engagement_drafts.why: how the post was found, the account, its relation, value, engagement, top of the run */
  why: Record<string, unknown>
  /** the post (intel_items), when it can be found */
  item: { source?: string; value?: string; engagement?: number | null; scoreWhy?: string; followed?: boolean } | null
  /** the account it follows, when it can be found (by the post, or by the draft's name for an older draft) */
  account: { name: string; relation: string } | null
}

/**
 * Why this post (v145Why, v146): how it was found, whose it is, its value and engagement, and how replies are picked.
 * Among the run's most engaged only when the run said so.
 */
export function whyLines({ why: w, item, account }: WhyInput): { lines: string[]; note: string } {
  const found = str(w.found)
  const followed = found ? found === 'followed' : !!(item?.followed || account)
  const rel = str(w.relation) || (account ? account.relation || 'competitor' : '')
  const src = found && found !== 'followed' ? found : str(item?.source)
  const how = followed
    ? 'From an account you follow' + (rel ? ', ' + (REL_WORD[rel] || rel) : '')
    : /linkedin/i.test(src)
      ? 'Found by a LinkedIn search for your topics'
      : /web|tavily/i.test(src)
        ? 'Found by a web search for your topics'
        : 'Found by a search for your topics'
  const val = str(w.value) || str(item?.value)
  const engRaw = w.engagement !== undefined && w.engagement !== null ? w.engagement : item?.engagement
  const lines = [how]
  if (val) lines.push('Rated ' + val + ' value' + (val === 'high' ? ': high-value posts always get a reply' : ''))
  if (engRaw !== undefined && engRaw !== null && Number.isFinite(Number(engRaw))) {
    lines.push(Number(engRaw).toLocaleString('en-US') + ' reactions, comments and shares' + (w.top ? ', among the run’s most engaged' : ''))
  }
  if (item?.scoreWhy) lines.push(str(item.scoreWhy).slice(0, 200))
  const note =
    'The Intel Tracker drafts a reply when it rates a post worth answering and the post is among the run’s 10 most engaged or rated high value.' +
    (followed && account ? ' Replies to ' + (account.name || 'this account') + ' can be turned off on Intel Tracker › Following.' : '')
  return { lines, note }
}
