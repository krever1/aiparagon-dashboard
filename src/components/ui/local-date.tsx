'use client'

import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/**
 * True in the browser once the page has hydrated, false while the server renders. Dates are shown in the viewer's
 * own time zone, as the current dashboard does; the server (UTC) draws them in UTC first, and the browser redraws
 * them in its own zone, with no hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "5 Nov", with the year when it is not this year (the board's cards). */
export function dayText(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return ''
  const year = (x: Date) => x.toLocaleDateString('en-GB', { year: 'numeric', timeZone })
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone }
  if (year(d) !== year(new Date())) opts.year = 'numeric'
  return d.toLocaleDateString('en-GB', opts)
}

/** "5 Nov 2026" (the list's Updated column). */
export function dateText(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone })
}

export function LocalDay({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const hydrated = useHydrated()
  const text = dayText(iso, hydrated ? undefined : 'UTC')
  if (!text) return null
  return (
    <time dateTime={iso ?? undefined} className={className}>
      {text}
    </time>
  )
}

export function LocalDate({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const hydrated = useHydrated()
  const text = dateText(iso, hydrated ? undefined : 'UTC')
  if (!text) return null
  return (
    <time dateTime={iso ?? undefined} className={className}>
      {text}
    </time>
  )
}

/** "15 Oct · 06:00" (when HubSpot last synced a contact). */
export function dateTimeText(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return ''
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
  return day + ' · ' + time
}

export function LocalDateTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const hydrated = useHydrated()
  const text = dateTimeText(iso, hydrated ? undefined : 'UTC')
  if (!text) return null
  return (
    <time dateTime={iso ?? undefined} className={className}>
      {text}
    </time>
  )
}

/** "Nov 4", with the year when it is not this year (the run question's Reads list, as the current dashboard says it). */
export function usDayText(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return ''
  const year = (x: Date) => x.toLocaleDateString('en-US', { year: 'numeric', timeZone })
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone }
  if (year(d) !== year(new Date())) opts.year = 'numeric'
  return d.toLocaleDateString('en-US', opts)
}

export function LocalUsDay({ iso }: { iso: string | null | undefined }) {
  const hydrated = useHydrated()
  const text = usDayText(iso, hydrated ? undefined : 'UTC')
  return text ? <time dateTime={iso ?? undefined}>{text}</time> : null
}
