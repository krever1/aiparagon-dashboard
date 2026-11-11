'use client'

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, ArrowUpRight, CheckCircle2, History, LayoutTemplate, Megaphone, Radar, Repeat, Rocket, User, Users,
} from 'lucide-react'
import { ItemIcon } from '@/components/approvals/item-icon'
import { useSkips } from '@/components/approvals/skips'
import { Icon } from '@/components/icon'
import { dayText, useHydrated } from '@/components/ui/local-date'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { PRODUCTS, type ProductKey, legacyUrl, pageBySlug } from '@/lib/nav'
import { type Item, wordOf } from '@/lib/touchpoint/approvals'
import {
  ATLAS_LINE, CANVAS_LINE, agentName, agoWords, catalystLine, hello, needChips, needLine, pipelineLine, runIcon, runState, todayText, touchLine, waiting,
  whenText,
} from '@/lib/touchpoint/today'
import type { TodayData } from '@/lib/touchpoint/today-load'

// Today (v115TodayHtml as v137 left it): the hello line, what needs you, quick starts, the five products with their
// pages, the newest runs and sign-ups. The page reads its data again every 10 minutes while it is open, as the current
// dashboard checks for new things.

const REFRESH_MS = 10 * 60_000

// the clock, by the minute, for the greeting and the "3 hours ago" lines (read only once the page is in the browser)
let minute = 0
const clock = (l: () => void) => {
  const t = window.setInterval(l, 30_000)
  return () => window.clearInterval(t)
}
const nowMinute = () => {
  const m = Math.floor(Date.now() / 60_000)
  if (m !== minute) minute = m
  return minute
}

// three columns on a wide screen, as the current dashboard has them; between 641 and 1080 wide every card takes the
// whole width (the old page left an empty space beside Quick start and the sign-ups), one column on a phone
const SPAN = { 1: 'min-[641px]:col-span-2 min-[1081px]:col-span-1', 2: 'min-[641px]:col-span-2', 3: 'min-[641px]:col-span-2 min-[1081px]:col-span-3' } as const

function Card({ w, title, aside, children, testid }: { w: 1 | 2 | 3; title: string; aside?: React.ReactNode; children: React.ReactNode; testid: string }) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-panel p-5 shadow-card ${SPAN[w]}`} data-testid={testid} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

const out = (slug: string) => legacyUrl(LEGACY_DASHBOARD_URL, pageBySlug(slug))
const OUT_TIP = 'Opens in the current dashboard'
const row = 'flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left text-[14.5px] text-ink hover:bg-sunk'
const linkBtn = 'inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent-text hover:underline'

/** Where a waiting thing opens from Today: a reply in its window on Approvals, anything else where Approvals sends it. */
function reviewHref(x: Item): string {
  if (x.review.kind === 'reply') return '/approvals?tab=' + wordOf('reply') + '&review=' + encodeURIComponent(x.key)
  return x.review.href
}

export function TodayView({ data, name }: { data: TodayData; name: string }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const skips = useSkips()
  const clientMinute = useSyncExternalStore(clock, nowMinute, () => 0)
  // the server's clock in UTC while the page hydrates, then the viewer's own
  const t = hydrated && clientMinute ? clientMinute * 60_000 : data.now
  const tz = hydrated ? undefined : 'UTC'
  const d = new Date(t)
  const hour = hydrated ? d.getHours() : d.getUTCHours()

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), REFRESH_MS)
    // marks the page while its timer is set, so a test can wait for it before moving the clock on
    document.documentElement.dataset.todayRefresh = 'on'
    return () => {
      window.clearInterval(id)
      delete document.documentElement.dataset.todayRefresh
    }
  }, [router])

  const items = waiting(data.approvals.items, skips)
  const briefs = data.approvals.items.filter((x) => x.kind === 'brief').length

  return (
    <div data-testid="today">
      <header className="mb-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text" data-testid="today-date">
          Touchpoint · {todayText(d, tz)}
        </p>
        <h1 className="mt-1 break-words font-display text-[34px] font-semibold leading-tight text-ink sm:text-[38px]">{hello(hour, name)}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2" data-testid="today-need">
          {needLine(items.length)}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-3">
        <NeedsYou items={items} error={data.approvals.error} />
        <QuickStart />
        <Workspace data={data} waitingN={items.length} briefs={briefs} />
        <Runs data={data} tz={tz} />
        <Signups data={data} now={t} hydrated={hydrated} />
      </div>
    </div>
  )
}

function NeedsYou({ items, error }: { items: Item[]; error: string | null }) {
  const n = items.length
  const err = error ? <p className="mb-3 text-[13px] text-bad">Could not read everything waiting: {error}</p> : null
  if (!n) {
    return (
      <Card w={2} title="Needs you" testid="needs-you">
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
    <Card w={2} title="Needs you" testid="needs-you">
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
      <ul className="grid gap-0.5" aria-label="Next up">
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

function NextUp({ x, tag }: { x: Item; tag: string }) {
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

function QuickStart() {
  const q: { icon: typeof Users; label: string; sub: string; href: string; outside?: boolean }[] = [
    { icon: Users, label: 'Run Catalyst for a lead', sub: 'Catalyst · Lead pipeline', href: '/lead-pipeline?run=new' },
    { icon: Rocket, label: 'Make an ad campaign', sub: 'Pipeline · Marketing Generation', href: out('marketing-generation'), outside: true },
    { icon: Repeat, label: 'Turn content into a post', sub: 'Pipeline · Content Transformation', href: out('content-transformation'), outside: true },
    { icon: LayoutTemplate, label: 'Put a landing page live', sub: 'Pipeline · Landing pages', href: out('landing-pages'), outside: true },
  ]
  return (
    <Card w={1} title="Quick start" testid="quick-start">
      <div className="grid gap-2 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-1">
        {q.map((x) => (
          <a
            key={x.label}
            href={x.href}
            title={x.outside ? OUT_TIP : undefined}
            className="flex min-w-0 items-center gap-3 rounded-md bg-sunk p-3 text-left text-ink hover:bg-line/60"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-panel text-ink-2">
              <x.icon size={19} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] font-semibold">{x.label}</b>
              <small className="block text-[12.5px] text-ink-3">{x.sub}</small>
            </span>
            {x.outside ? <ArrowUpRight size={15} aria-hidden="true" className="ml-auto shrink-0 text-ink-3" /> : null}
          </a>
        ))}
      </div>
    </Card>
  )
}

function Workspace({ data, waitingN, briefs }: { data: TodayData; waitingN: number; briefs: number }) {
  const line = (k: ProductKey): string => {
    if (k === 'touchpoint') return touchLine(waitingN)
    if (k === 'catalyst') return data.leads ? catalystLine(data.leads.count, data.leads.next) : 'Leads, HubSpot contacts and calls'
    if (k === 'canvas') return CANVAS_LINE
    if (k === 'pipeline') return pipelineLine(briefs, data.live)
    return ATLAS_LINE
  }
  return (
    <Card w={3} title="Your workspace" testid="workspace">
      <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-3 min-[1181px]:grid-cols-5">
        {PRODUCTS.map((p) => (
          <div key={p.key} className="grid min-w-0 content-start gap-2 rounded-md bg-sunk p-3.5" data-testid="product" data-product={p.key}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-panel text-ink-2">
                <Icon name={p.icon} size={17} />
              </span>
              <div className="min-w-0">
                <b className="block text-[14.5px] font-semibold text-ink">{p.name}</b>
                <small className="block text-[12.5px] text-ink-3">{p.sub}</small>
              </div>
            </div>
            <p className="text-[13px] leading-snug text-ink-3" data-testid="product-line">
              {line(p.key)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {p.pages.map((pg) => (
                <Link key={pg.slug} href={'/' + pg.slug} className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[12.5px] font-semibold text-ink-2 hover:border-line-2 hover:text-ink">
                  {pg.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

const RUN_ICON = { megaphone: Megaphone, radar: Radar, rocket: Rocket } as const
const PILL = {
  done: ['bg-good-soft text-good', 'Done'],
  running: ['bg-info-soft text-info', 'Running'],
  failed: ['bg-bad-soft text-bad', 'Failed'],
} as const

function Runs({ data, tz }: { data: TodayData; tz: string | undefined }) {
  const all = (
    <Link href="/runs" className={linkBtn}>
      All runs
      <ArrowRight size={15} aria-hidden="true" />
    </Link>
  )
  if (data.runsError && !data.runs.length) {
    return (
      <Card w={2} title="Recent runs" testid="runs" aside={all}>
        <p className="text-[14px] text-bad">Could not read the runs: {data.runsError}</p>
      </Card>
    )
  }
  if (!data.runs.length) {
    return (
      <Card w={2} title="Recent runs" testid="runs">
        <Empty icon={History} title="No runs yet" text="Agent runs show up here as they finish." />
      </Card>
    )
  }
  return (
    <Card w={2} title="Recent runs" testid="runs" aside={all}>
      <ul className="grid gap-0.5">
        {data.runs.map((r, i) => {
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

function Signups({ data, now, hydrated }: { data: TodayData; now: number; hydrated: boolean }) {
  const all = (
    <div className="mt-3 border-t border-line pt-3">
      <Link href="/landing-pages" className={linkBtn}>
        All sign-ups
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
  )
  if (data.signupsError && !data.signups.length) {
    return (
      <Card w={1} title="Latest sign-ups" testid="signups">
        <p className="text-[14px] text-ink-3">Could not load the sign-ups: {data.signupsError}</p>
      </Card>
    )
  }
  if (!data.signups.length) {
    return (
      <Card w={1} title="Latest sign-ups" testid="signups">
        <Empty
          icon={LayoutTemplate}
          title="No sign-ups yet"
          text="They show up here from your live landing pages."
          action={
            <Link href="/landing-pages" className="mt-2 inline-flex rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2">
              Landing pages
            </Link>
          }
        />
      </Card>
    )
  }
  return (
    <Card w={1} title="Latest sign-ups" testid="signups">
      <ul className="grid gap-0.5">
        {data.signups.map((s) => (
          <li key={s.id}>
            <Link href="/landing-pages" className={row} title={s.page || undefined} data-testid="signup">
              <User size={17} aria-hidden="true" className="shrink-0 text-ink-2" />
              <span className="min-w-0 grow truncate">{s.who}</span>
              <span className="shrink-0 text-[13px] text-ink-3">{hydrated ? agoWords(s.at, now) : dayText(s.at, 'UTC')}</span>
            </Link>
          </li>
        ))}
      </ul>
      {all}
    </Card>
  )
}

function Empty({ icon: I, title, text, action }: { icon: typeof History; title: string; text: string; action?: React.ReactNode }) {
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
