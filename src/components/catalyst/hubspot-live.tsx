'use client'

import { useEffect, useState } from 'react'
import { type HubspotLiveResult, hubspotLive } from '@/app/(app)/lead-pipeline/actions'
import { useNow } from '@/components/ui/clock'
import { safeUrl } from '@/lib/catalyst/view'

// A lead's HubSpot tab, read live (v144HsLoad, v144HsHtml): when the tab opens it asks HubSpot for the contact and shows
// what HubSpot has right now. Refresh asks again. When HubSpot can't be read the box says why and the synced copy stays
// below it. A read is kept a minute.

const LIFE: Record<string, string> = {
  subscriber: 'Subscriber',
  lead: 'Lead',
  marketingqualifiedlead: 'Marketing qualified lead',
  salesqualifiedlead: 'Sales qualified lead',
  opportunity: 'Opportunity',
  customer: 'Customer',
  evangelist: 'Evangelist',
  other: 'Other',
}
const kept = new Map<string, { r: HubspotLiveResult; t: number }>()

/** "Nov 3", with the year when it is not this year (v144HsDate). */
export function hsDate(v: string, now: number): string {
  if (!v) return ''
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v)
  if (!n) return ''
  const d = new Date(n)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' as const }) })
}
/** "Organic search" from ORGANIC_SEARCH (v144HsWord). */
export const hsWord = (v: string) =>
  String(v || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
/** "just now", "a minute ago", "5 minutes ago", "2 h ago" (nwAgoMin). */
const agoMin = (iso: string, now: number) => {
  const m = Math.round((now - (Date.parse(iso) || now)) / 60000)
  return m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? m + ' minutes ago' : Math.round(m / 60) + ' h ago'
}

export function HubspotLive({ email }: { email: string }) {
  const e = email.trim().toLowerCase()
  const now = useNow(0)
  // a read per Refresh: the first uses a read kept from the last minute
  const [nonce, setNonce] = useState(0)
  const [got, setGot] = useState<{ k: string; r: HubspotLiveResult } | null>(null)
  const k = e + ':' + nonce
  useEffect(() => {
    let live = true
    const had = kept.get(e)
    const p: Promise<HubspotLiveResult> =
      had && nonce === 0 && had.r.ok && Date.now() - had.t < 60_000
        ? Promise.resolve(had.r)
        : hubspotLive(e)
            .catch(() => ({ ok: false as const, error: 'HubSpot could not be reached.' }))
            .then((x) => {
              kept.set(e, { r: x, t: Date.now() })
              return x
            })
    p.then((x) => {
      if (live) setGot({ k, r: x })
    })
    return () => {
      live = false
    }
  }, [e, nonce, k])
  const r = got?.k === k ? got.r : null
  const load = () => setNonce((n) => n + 1)

  const head = (
    <div className="mb-2 flex flex-wrap items-center gap-2.5">
      <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] ${r && !r.ok ? 'text-bad' : 'text-good'}`}>
        <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${r && !r.ok ? 'bg-bad' : 'bg-good'}`} />
        Live from HubSpot
      </span>
      {r?.ok ? <small className="text-[12px] text-ink-3">read {now ? agoMin(r.at, now) : 'just now'}</small> : null}
      {r ? (
        <button
          type="button"
          onClick={load}
          className="ml-auto rounded-sm border border-line bg-panel px-3 py-1 text-[13px] font-semibold text-ink hover:border-line-2"
        >
          Refresh
        </button>
      ) : null}
    </div>
  )
  const box = (bad: boolean, children: React.ReactNode) => (
    <div className={`mb-4 rounded-md border px-3.5 py-3 ${bad ? 'border-bad/30 bg-bad-soft/40' : 'border-line bg-panel'}`} data-testid="hubspot-live" role={r ? undefined : 'status'}>
      {head}
      {children}
    </div>
  )
  if (!r) return box(false, <p className="text-[13.5px] text-ink-3">Reading HubSpot…</p>)
  if (!r.ok) return box(true, <p className="text-[13.5px] text-ink">{r.error} The details below are the last copy the sync made.</p>)
  if (!r.found) return box(false, <p className="text-[13.5px] text-ink">HubSpot has no contact with {e}. Add them in HubSpot, or check the email on the lead.</p>)
  const c = r.contact
  const site = c.website ? (/^https?:/i.test(c.website) ? c.website : 'https://' + c.website) : ''
  const t = now
  const rows: [string, string][] = [
    ['name', [c.firstname, c.lastname].filter(Boolean).join(' ')],
    ['email', c.email],
    ['company', c.company],
    ['title', c.jobtitle],
    ['phone', c.phone],
    ['mobile', c.mobilephone],
  ]
  const after: [string, string][] = [
    ['location', [c.city, c.state, c.country].filter(Boolean).join(', ')],
    ['lifecycle', LIFE[c.lifecyclestage] || hsWord(c.lifecyclestage)],
    ['lead status', hsWord(c.hs_lead_status)],
    ['source', hsWord(c.hs_analytics_source)],
    ['notes', c.num_notes],
    ['deals', c.num_associated_deals],
    ['last contacted', hsDate(c.notes_last_contacted, t)],
    ['next activity', hsDate(c.notes_next_activity_date, t)],
    ['last email sent', hsDate(c.hs_email_last_send_date, t)],
    ['last reply', hsDate(c.hs_email_last_reply_date, t)],
    ['in HubSpot since', hsDate(c.createdate, t)],
    ['changed in HubSpot', hsDate(c.lastmodifieddate, t)],
  ]
  const kv = (k: string, v: React.ReactNode) => (
    <div key={k} className="rounded-sm bg-sunk px-3 py-1.5">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{k}</dt>
      <dd className="font-semibold text-ink">{v}</dd>
    </div>
  )
  return box(
    false,
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {rows.filter(([, v]) => !!v).map(([k, v]) => kv(k, v))}
      {site && safeUrl(site)
        ? kv(
            'website',
            <a href={safeUrl(site)} target="_blank" rel="noopener noreferrer" className="text-info hover:underline">
              {c.website} ↗
            </a>,
          )
        : null}
      {after.filter(([, v]) => !!v).map(([k, v]) => kv(k, v))}
    </dl>,
  )
}
