// Follow this company, from a HubSpot contact (the current dashboard's openE3TrackModal and submitE3Track): the checks
// before a company goes on the watchlist the Intel Tracker and the Ad Strategist read.

export type FollowInput = {
  name: string
  website: string
  meta: string
  x: string
  li: string
  priority: string
  notes: string
}

export type FollowFields = { name: string; website: string; meta: string; x: string; li: string; priority: string; notes: string }

export const PRIORITIES = ['high', 'medium', 'low'] as const

/** A usable page identifier out of whatever is pasted: an Ad Library link, a facebook.com page link, or a raw id. */
export function metaPageIdFrom(v: unknown): string {
  const t = String(v ?? '').trim()
  if (!t) return ''
  const byParam = t.match(/[?&]view_all_page_id=(\d+)/) || t.match(/[?&]page_id=(\d+)/)
  if (byParam) return byParam[1]
  const byUrl = t.match(/facebook\.com\/(?:pg\/)?([^/?#]+)/i)
  if (byUrl && byUrl[1].toLowerCase() !== 'ads') return byUrl[1]
  return t
}

/** The fields to save, or what to fix first, in the current dashboard's words. */
export function followFields(input: Partial<FollowInput>): FollowFields | { error: string } {
  const v = (k: keyof FollowInput) => String(input?.[k] ?? '').trim()
  const name = v('name').slice(0, 200)
  if (!name) return { error: 'A company name is required.' }
  const meta = metaPageIdFrom(v('meta'))
  if (/^<.*>$/.test(meta) || /^page_id$/i.test(meta) || /_here$/i.test(meta)) {
    return { error: 'That is still a placeholder: paste the real Ad Library link, or leave it blank.' }
  }
  const x = v('x').replace(/^@/, '')
  const li = v('li')
    .replace(/^https?:\/\/(www\.)?linkedin\.com\//i, '')
    .replace(/\/+$/, '')
  if (!meta && !x && !li) return { error: 'Add at least one scrape target: Meta page, X handle, or LinkedIn.' }
  const p = v('priority').toLowerCase()
  return {
    name,
    website: v('website'),
    meta,
    x,
    li,
    priority: (PRIORITIES as readonly string[]).includes(p) ? p : 'medium',
    notes: v('notes').slice(0, 2000),
  }
}

/** What the team is told once the company is on the watchlist. */
export function followedText(f: Pick<FollowFields, 'name' | 'meta'>): string {
  return (
    f.name +
    ' is followed now. The Intel Tracker picks them up on its next run' +
    (f.meta ? ', and the Ad Strategist pulls their Meta ads right after it.' : '. No Meta page ID was given, so no ads will be pulled for them.')
  )
}
