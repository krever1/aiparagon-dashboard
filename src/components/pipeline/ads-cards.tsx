'use client'

import { useState } from 'react'
import { dayText } from '@/components/ui/local-date'
import { type AdView, bandOf } from '@/lib/pipeline/ad-strategist'
import { hueOf, initialsOf } from '@/lib/pipeline/intel'
import { Pill, Tag } from './bits'
import type { ACtx } from './ads-view'

// One ad as the Ad Strategist draws it: the feed-post preview (nwAdPrev), its state (nwAdLive, v113AdState), the score
// and fit bars, and the card (nwAdCard with v113's fit bar).

export const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t
}
/** e9Clean: a dash between words becomes a comma, spaces folded. */
export const clean = (s: string) =>
  s
    .replace(/\s+[‒-―]\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)
export const isWeb = (u: string) => /^https?:\/\//i.test(u)

const BAND: Record<string, string> = { high: 'bg-good', medium: 'bg-warn', low: 'bg-ink-3', '': 'bg-ink-3' }

/** The ad as a post in a feed: who ran it, its picture (or its words on a tint), the offer and the button. */
export function AdPreview({ a, big }: { a: AdView; big?: boolean }) {
  const [broken, setBroken] = useState(false)
  const h = hueOf(a.adv)
  const kicker = a.industry || (a.offer ? 'Offer' : '')
  const cta = a.cta.trim() && a.cta.trim().length <= 22 ? a.cta.trim() : 'Learn more'
  return (
    <span className="block overflow-hidden rounded-md border border-line bg-panel text-left" data-testid="ad-preview">
      <span className="flex items-center gap-2 px-3 py-2">
        <span
          aria-hidden="true"
          className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
          style={{ background: `hsl(${h} 45% 90%)`, color: `hsl(${h} 45% 28%)` }}
        >
          {initialsOf(a.adv)}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[13px] text-ink">{a.adv}</b>
          <small className="block text-[11px] text-ink-3">Sponsored</small>
        </span>
      </span>
      <span className={`relative block ${big ? 'aspect-[16/9]' : 'aspect-[16/10]'} overflow-hidden`}>
        {a.img && !broken ? (
          // the ad's own picture, kept by Meta or in Storage
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.img} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <span
            className="flex h-full w-full items-center p-4"
            style={{ background: `linear-gradient(135deg, hsl(${h} 55% 90%), hsl(${(h + 40) % 360} 55% 80%))`, color: `hsl(${h} 45% 22%)` }}
          >
            <span className="line-clamp-4 font-display text-[19px] font-semibold leading-snug">{clip(clean(a.title), 96)}</span>
          </span>
        )}
      </span>
      <span className="flex items-end justify-between gap-3 border-t border-line bg-sunk px-3 py-2">
        <span className="min-w-0">
          {kicker ? <small className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{kicker}</small> : null}
          {a.offer ? <b className="line-clamp-3 text-[13px] leading-snug text-ink">{clip(clean(a.offer), 90)}</b> : null}
        </span>
        <span className="shrink-0 rounded-sm border border-line-2 bg-panel px-2 py-1 text-[11.5px] font-semibold text-ink">{cta}</span>
      </span>
    </span>
  )
}

/** Live, Stopped or Last seen (v113's nwAdLive). */
export function LiveTag({ a, tz, stoppedDay }: { a: AdView; tz: string | undefined; stoppedDay?: boolean }) {
  if (a.live === 'live')
    return (
      <span title="The Ad Library showed it running in the last 8 days">
        <Pill tone="good">Live</Pill>
      </span>
    )
  if (a.live === 'stopped')
    return (
      <span title="Not running when it was last pulled">
        <Pill>{stoppedDay && a.lastSeen ? 'Stopped ' + dayText(a.lastSeen + 'T12:00:00Z', tz) : 'Stopped'}</Pill>
      </span>
    )
  if (a.live === 'unknown') {
    const d = a.lastSeen ? dayText(a.lastSeen + 'T12:00:00Z', tz) : ''
    return (
      <span title={'No pull has checked it since ' + (d || 'it was found')}>
        <Pill>{d ? 'Last seen ' + d : 'Not checked yet'}</Pill>
      </span>
    )
  }
  return null
}

/** The line under a card's preview: how long it ran and whether it still runs, or how it came in. */
export function StateRow({ a, tz }: { a: AdView; tz: string | undefined }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {a.lib ? (
        <>
          <Tag>{a.days !== null ? plural(a.days, 'day') + ' running' : 'Run time unknown'}</Tag>
          <LiveTag a={a} tz={tz} />
        </>
      ) : (
        <>
          {a.pend ? <Pill tone="warn">Not read yet</Pill> : null}
          <Tag gold>{a.sw ? 'From Notion' : 'Uploaded'}</Tag>
        </>
      )}
      {!a.inBrief ? <Pill>Left out of briefs</Pill> : null}
    </span>
  )
}

/** A thin meter with its number (nwAdScoreBar, v113FitBar). */
export function Meter({ label, value, title }: { label: string; value: number; title?: string }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-ink-3" title={title}>
      <span className="w-9 shrink-0">{label}</span>
      <span className="h-1.5 min-w-0 grow overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className={`block h-full rounded-full ${BAND[bandOf(value)]}`} style={{ width: Math.max(2, Math.min(100, value)) + '%' }} />
      </span>
      <b className="w-7 shrink-0 text-right text-[13px] text-ink">{value}</b>
    </span>
  )
}

export function AdCard({ a, ctx }: { a: AdView; ctx: ACtx }) {
  const fit = !a.lib ? ctx.fitOf(a) : null
  return (
    <article className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel p-3 shadow-card" data-testid="ad-card">
      <button type="button" onClick={() => ctx.openAd(a.id)} aria-label={'Open this ad: ' + clip(clean(a.title), 60)} className="block w-full rounded-md text-left hover:opacity-95">
        <AdPreview a={a} />
      </button>
      <StateRow a={a} tz={ctx.tz} />
      {a.lib ? (
        a.score === null ? (
          <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
            <span className="w-9 shrink-0">Score</span>
            <span>Not scored</span>
          </span>
        ) : (
          <Meter label="Score" value={a.score} />
        )
      ) : fit ? (
        <Meter label="Fit" value={fit.score} title={fit.hits.length ? 'Matches ' + fit.hits.join(', ') : 'No match with what you follow yet'} />
      ) : null}
    </article>
  )
}
