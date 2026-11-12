'use client'

import { useSyncExternalStore } from 'react'
import { agoText } from '@/lib/catalyst/calls'

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

/** "Tue, Nov 4 · 5:00 PM", with the year in place of the weekday when it is not this year (a Fathom call, apFtWhen). */
export function callWhenText(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return ''
  const year = (x: Date) => x.toLocaleDateString('en-US', { year: 'numeric', timeZone })
  const same = year(d) === year(new Date())
  const day = d.toLocaleDateString(
    'en-US',
    same ? { weekday: 'short', month: 'short', day: 'numeric', timeZone } : { month: 'short', day: 'numeric', year: 'numeric', timeZone },
  )
  return day + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

export function LocalCallWhen({ iso }: { iso: string | null | undefined }) {
  const hydrated = useHydrated()
  const text = callWhenText(iso, hydrated ? undefined : 'UTC')
  return text ? <time dateTime={iso ?? undefined}>{text}</time> : null
}

/** "Nov 4, 2026", always with the year (apCxDay). */
export function usDateText(iso: string | null | undefined, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone })
}

/** "Nov 12, 2026" from a due date ("2026-11-12"), without moving it a day in another time zone. */
export function dueText(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return v
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** "Nov 4, 2026" in the viewer's own time zone (apCxDay), UTC while the server draws it. */
export function LocalUsDate({ iso }: { iso: string | null | undefined }) {
  const hydrated = useHydrated()
  const text = usDateText(iso, hydrated ? undefined : 'UTC')
  return text ? <time dateTime={iso ?? undefined}>{text}</time> : null
}

/** "3h ago" in the browser (the current dashboard's apAgo); the day while the server draws the page. */
export function Ago({ iso }: { iso: string | null | undefined }) {
  const hydrated = useHydrated()
  if (!iso) return null
  return <time dateTime={iso}>{hydrated ? agoText(iso) : usDateText(iso, 'UTC')}</time>
}
