'use client'

import { useState } from 'react'
import { useNow } from '@/components/ui/clock'
import { useHydrated } from '@/components/ui/local-date'
import { type CallRow, ftGuests, minutesOf } from '@/lib/catalyst/calls'

// Calls' Calendar tab (v144Cal): a month at a time, weeks from Monday, today marked, each day with how many recordings it
// has and the first ones. A click on a day lists that day's calls beside the month, and a call opens on the All tab.
// Older months read older pages from Fathom (Load older calls) as they are asked for. Days are the viewer's own, so the
// month is drawn once the page is in the browser.

const pad = (n: number) => String(n).padStart(2, '0')
/** "2026-11-25", in the viewer's time zone. */
export const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
const dayOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : ymd(d)
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const btn = 'rounded-sm border border-line bg-panel px-2.5 py-1 text-[13px] font-semibold text-ink hover:border-line-2 disabled:opacity-50'

/** The oldest day among the calls. */
export const oldestDay = (rows: { call: { start: string } }[]) =>
  rows.reduce((o, r) => {
    const k = dayOf(r.call.start)
    return k && (!o || k < o) ? k : o
  }, '')

export function CallsCalendar({
  rows,
  more,
  onMore,
  onOpen,
}: {
  /** every call loaded, newest first */
  rows: CallRow[]
  /** older calls are still in Fathom */
  more: boolean
  /** read older pages until the calls reach back to that day (at most six pages) */
  onMore: (until: string) => Promise<void>
  onOpen: (id: string) => void
}) {
  const hydrated = useHydrated()
  if (!hydrated) {
    return (
      <p role="status" className="rounded-lg border border-line bg-panel p-4 text-[14px] text-ink-3">
        Loading the calendar…
      </p>
    )
  }
  return <Month rows={rows} more={more} onMore={onMore} onOpen={onOpen} />
}

function Month({ rows, more, onMore, onOpen }: { rows: CallRow[]; more: boolean; onMore: (until: string) => Promise<void>; onOpen: (id: string) => void }) {
  const now = new Date(useNow(0))
  const [cal, setCal] = useState<{ y: number; m: number; day: string | null }>(() => {
    const s = rows[0] ? new Date(rows[0].call.start) : now
    const d = Number.isNaN(s.getTime()) ? now : s
    return { y: d.getFullYear(), m: d.getMonth(), day: null }
  })
  const [busy, setBusy] = useState(false)

  const byDay: Record<string, CallRow[]> = {}
  for (const r of rows) {
    const k = dayOf(r.call.start)
    if (k) (byDay[k] ??= []).push(r)
  }
  for (const k of Object.keys(byDay)) byDay[k].sort((a, b) => a.call.start.localeCompare(b.call.start))
  const first = new Date(cal.y, cal.m, 1)
  const days = new Date(cal.y, cal.m + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const today = ymd(now)
  const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthStart = ymd(first)
  const ym = monthStart.slice(0, 7)
  const oldest = oldestDay(rows)
  const showMore = more && (!oldest || oldest > monthStart)
  const inMonth = Object.keys(byDay).filter((k) => k.slice(0, 7) === ym).sort()
  const n = inMonth.reduce((a, k) => a + byDay[k].length, 0)
  // the day picked: the one asked for in this month, else today when it has calls, else the last day with calls
  const day = cal.day && cal.day.slice(0, 7) === ym ? cal.day : inMonth.includes(today) ? today : (inMonth[inMonth.length - 1] ?? '')
  const lastMonth = cal.y > now.getFullYear() || (cal.y === now.getFullYear() && cal.m >= now.getMonth())

  const go = (step: number) => {
    let m = cal.m + step
    let y = cal.y
    if (m < 0) {
      m = 11
      y--
    }
    if (m > 11) {
      m = 0
      y++
    }
    setCal({ y, m, day: null })
  }
  const loadMore = async () => {
    setBusy(true)
    await onMore(monthStart)
    setBusy(false)
  }

  const cells: React.ReactNode[] = []
  for (let i = 0; i < lead; i++) cells.push(<div key={'pad' + i} aria-hidden="true" />)
  for (let d = 1; d <= days; d++) {
    const date = new Date(cal.y, cal.m, d)
    const k = ymd(date)
    const L = byDay[k] ?? []
    const on = k === day
    const aria = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (L.length ? ', ' + L.length + ' call' + (L.length === 1 ? '' : 's') : ', no calls')
    cells.push(
      <button
        key={k}
        type="button"
        data-d={k}
        aria-label={aria}
        aria-pressed={on}
        tabIndex={L.length ? undefined : -1}
        onClick={() => setCal((c) => ({ ...c, day: k }))}
        className={`flex min-h-[52px] flex-col gap-[3px] overflow-hidden rounded-md border bg-panel p-1 text-left sm:min-h-[84px] sm:p-1.5 ${
          on ? 'border-action shadow-[0_0_0_2px_rgba(201,162,39,.45)]' : 'border-line'
        } ${L.length ? 'cursor-pointer hover:border-accent' : 'cursor-default'}`}
      >
        <span className={`self-start text-[12.5px] font-semibold ${k === today ? 'rounded-full bg-action px-1.5 text-action-ink' : 'text-ink'}`}>{d}</span>
        {L.slice(0, 2).map((r) => (
          <span key={r.call.id} className={`hidden truncate rounded-[4px] px-1 py-px text-[11.5px] leading-snug text-ink sm:block ${r.call.external ? 'bg-accent-soft' : 'bg-info-soft'}`}>
            {timeOf(r.call.start) + ' ' + r.title}
          </span>
        ))}
        {L.length > 2 ? <span className="hidden text-[11px] text-ink-3 sm:block">+{L.length - 2} more</span> : null}
        {L.length ? <span aria-hidden="true" className="mt-auto h-1.5 w-1.5 rounded-full bg-accent sm:hidden" /> : null}
      </button>,
    )
  }
  const dayRows = day ? (byDay[day] ?? []) : []
  const dayHead = day ? new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[1001px]:grid-cols-[minmax(0,1fr)_300px]" data-testid="calls-calendar">
      <div className="min-w-0">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <button type="button" className={btn} aria-label="Previous month" onClick={() => go(-1)}>
            ‹
          </button>
          <h3 className="min-w-[150px] text-center font-display text-[18px] font-semibold text-ink">{label}</h3>
          <button type="button" className={btn} aria-label="Next month" disabled={lastMonth} onClick={() => go(1)}>
            ›
          </button>
          <span className="ml-auto text-[12.5px] text-ink-3" data-testid="cal-count">
            {n} call{n === 1 ? '' : 's'}
          </span>
          <button type="button" className={btn} onClick={() => setCal({ y: now.getFullYear(), m: now.getMonth(), day: today })}>
            Today
          </button>
        </div>
        {showMore ? (
          <p className="mb-2 text-[13px] text-ink-3">
            Older calls are still in Fathom.{' '}
            <button type="button" disabled={busy} onClick={loadMore} className="font-semibold text-accent-text hover:underline disabled:opacity-60">
              {busy ? 'Loading…' : 'Load older calls'}
            </button>
          </p>
        ) : null}
        <div className="grid grid-cols-7 gap-1" aria-hidden="true">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
            <span key={w} className="px-1.5 pb-1 text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
              {w}
            </span>
          ))}
        </div>
        <div role="group" aria-label={label} className="grid grid-cols-7 gap-1">
          {cells}
        </div>
      </div>
      <aside aria-live="polite" className="rounded-lg border border-line bg-panel p-3 min-[1001px]:sticky min-[1001px]:top-[72px]" data-testid="cal-day">
        {day ? (
          <>
            <h4 className="mb-2 text-[14px] font-semibold text-ink">{dayHead}</h4>
            {dayRows.length ? (
              <ul className="grid gap-1.5">
                {dayRows.map((r) => {
                  const g = ftGuests(r.call)
                  const m = minutesOf(r.call)
                  return (
                    <li key={r.call.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(r.call.id)}
                        className="flex w-full flex-col gap-0.5 rounded-md border border-line bg-panel px-2.5 py-2 text-left hover:border-accent"
                      >
                        <b className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-ink">
                          {r.title}
                          {r.call.external ? <span className="rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-text">Client</span> : null}
                        </b>
                        <small className="text-[12px] text-ink-3">{timeOf(r.call.start) + (m ? ' · ' + m + ' min' : '') + ' · ' + r.folder}</small>
                        {g.length ? (
                          <small className="text-[12px] text-ink-3">
                            {g
                              .slice(0, 3)
                              .map((i) => i.name || i.email)
                              .join(', ') + (g.length > 3 ? ' +' + (g.length - 3) : '')}
                          </small>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-[13.5px] text-ink-3">No recordings that day.</p>
            )}
          </>
        ) : (
          <p className="text-[13.5px] text-ink-3">Pick a day with calls to see its recordings.</p>
        )}
      </aside>
    </div>
  )
}
