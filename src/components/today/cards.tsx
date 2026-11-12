'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, History, Megaphone, Radar, Rocket } from 'lucide-react'
import { ItemIcon } from '@/components/approvals/item-icon'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { legacyUrl, pageBySlug } from '@/lib/nav'
import { type Item, wordOf } from '@/lib/touchpoint/approvals'
import { type RunRow, agentName, needChips, runIcon, runState, whenText } from '@/lib/touchpoint/today'

// The cards Today and the Pipeline Overview share: the card itself, Needs you, Recent runs and an empty state.

// three columns on a wide screen, as the current dashboard has them; between 641 and 1080 wide every card takes the
// whole width (the old page left an empty space beside Quick start and the sign-ups), one column on a phone
const SPAN = { 1: 'min-[641px]:col-span-2 min-[1081px]:col-span-1', 2: 'min-[641px]:col-span-2', 3: 'min-[641px]:col-span-2 min-[1081px]:col-span-3' } as const

export function Card({
  w,
  title,
  aside,
  controls,
  children,
  testid,
}: {
  w: 1 | 2 | 3
  title: string
  aside?: React.ReactNode
  /** the Pipeline Overview's Move earlier, Move later and Hide while it is being customized */
  controls?: React.ReactNode
  children: React.ReactNode
  testid: string
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-panel p-5 shadow-card ${SPAN[w]}`} data-testid={testid} aria-label={title}>
      {controls}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export const out = (slug: string) => legacyUrl(LEGACY_DASHBOARD_URL, pageBySlug(slug))
export const OUT_TIP = 'Opens in the current dashboard'
export const row = 'flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left text-[14.5px] text-ink hover:bg-sunk'
export const linkBtn = 'inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent-text hover:underline'

/** Where a waiting thing opens from Today: a reply in its window on Approvals, anything else where Approvals sends it. */
export function reviewHref(x: Item): string {
  if (x.review.kind === 'reply') return '/approvals?tab=' + wordOf('reply') + '&review=' + encodeURIComponent(x.key)
  return x.review.href
}

export function NeedsYou({ items, error, controls }: { items: Item[]; error: string | null; controls?: React.ReactNode }) {
  const n = items.length
  const err = error ? <p className="mb-3 text-[13px] text-bad">Could not read everything waiting: {error}</p> : null
  if (!n) {
    return (
      <Card w={2} title="Needs you" testid="needs-you" controls={controls}>
        {err}
        <div className="flex items-center gap-3 py-2">
          <CheckCircle2 size={30} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-good" />
          <div>
            <b className="block text-[16px] font-semibold text-ink">You are all caught up</b>
            <span className="text-[14px] text-ink-2">New briefs, ads and replies show up here when the agents finish.</span>
          </div>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <Link href="/approvals" className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-2 text-[14px] font-semibold text-ink hover:border-line-2">
            Open Approvals
          </Link>
        </div>
      </Card>
    )
  }
  return (
    <Card w={2} title="Needs you" testid="needs-you" controls={controls}>
      {err}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <span className="font-display text-[54px] font-medium leading-none tabular-nums text-ink" data-testid="needs-n">
          {n}
        </span>
        <div className="grid gap-2">
          <span className="text-[14.5px] text-ink-2">waiting for you</span>
          <div className="flex flex-wrap gap-1.5">
            {needChips(items).map((c) => (
              <Link
                key={c.kind}
                href={'/approvals?tab=' + c.word}
                className="rounded-full border border-line bg-panel px-3 py-1 text-[13.5px] font-semibold text-ink-2 hover:border-line-2 hover:text-ink"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <h3 className="mb-1.5 mt-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Next up</h3>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5" aria-label="Next up">
        {items.slice(0, 3).map((x) => {
          const tag = x.tags[0] && 'text' in x.tags[0] ? x.tags[0].text : ''
          const outside = x.review.kind === 'link' && x.review.out
          return (
            <li key={x.key}>
              {outside ? (
                <a href={reviewHref(x)} className={row} title={OUT_TIP}>
                  <NextUp x={x} tag={tag} />
                </a>
              ) : (
                <Link href={reviewHref(x)} className={row}>
                  <NextUp x={x} tag={tag} />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <Link href="/approvals" className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2.5 text-[15px] font-semibold text-action-ink shadow-card hover:bg-action-hover">
          Start reviewing
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <span className="text-[13px] text-ink-3">Nothing posts until you approve it.</span>
      </div>
    </Card>
  )
}

export function NextUp({ x, tag }: { x: Item; tag: string }) {
  return (
    <>
      <span className="shrink-0 text-ink-2">
        <ItemIcon icon={x.icon} size={17} />
      </span>
      <span className="min-w-0 grow truncate">{x.title}</span>
      <span className="shrink-0 text-[13px] text-ink-3">{tag}</span>
    </>
  )
}

const RUN_ICON = { megaphone: Megaphone, radar: Radar, rocket: Rocket } as const
const PILL = {
  done: ['bg-good-soft text-good', 'Done'],
  running: ['bg-info-soft text-info', 'Running'],
  failed: ['bg-bad-soft text-bad', 'Failed'],
} as const

export function Runs({ runs, error, tz, controls }: { runs: RunRow[]; error: string | null; tz: string | undefined; controls?: React.ReactNode }) {
  const all = (
    <Link href="/runs" className={linkBtn}>
      All runs
      <ArrowRight size={15} aria-hidden="true" />
    </Link>
  )
  if (error && !runs.length) {
    return (
      <Card w={2} title="Recent runs" testid="runs" aside={all} controls={controls}>
        <p className="text-[14px] text-bad">Could not read the runs: {error}</p>
      </Card>
    )
  }
  if (!runs.length) {
    return (
      <Card w={2} title="Recent runs" testid="runs" controls={controls}>
        <Empty icon={History} title="No runs yet" text="Agent runs show up here as they finish." />
      </Card>
    )
  }
  return (
    <Card w={2} title="Recent runs" testid="runs" aside={all} controls={controls}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {runs.map((r, i) => {
          const I = RUN_ICON[runIcon(r.agent)]
          const [cls, word] = PILL[runState(r.status)]
          return (
            <li key={i}>
              <Link href="/runs" className={row} data-testid="run">
                <I size={17} aria-hidden="true" className="shrink-0 text-ink-2" />
                <span className="min-w-0 grow truncate">{agentName(r.agent)}</span>
                <span className="hidden shrink-0 text-[13px] text-ink-3 min-[641px]:inline">{whenText(r.at, tz)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${cls}`}>{word}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function Empty({ icon: I, title, text, action }: { icon: typeof History; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1 py-4 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-sunk text-ink-3">
        <I size={20} aria-hidden="true" />
      </span>
      <b className="text-[15px] font-semibold text-ink">{title}</b>
      <span className="text-[13.5px] text-ink-3">{text}</span>
      {action}
    </div>
  )
}
