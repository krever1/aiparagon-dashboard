'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ArrowUpRight, ChevronDown, LayoutTemplate, MessageSquare, Repeat, Rocket, User, Users } from 'lucide-react'
import { useSkips } from '@/components/approvals/skips'
import { CallQuestion } from '@/components/catalyst/call-question'
import { Icon } from '@/components/icon'
import { dayText, usDayText, useHydrated } from '@/components/ui/local-date'
import { type CallItem, type CrmItem, type InboxItem, itemText } from '@/lib/catalyst/inbox'
import { stageOfKey, stagesNamed } from '@/lib/catalyst/stages'
import { PRODUCTS, type ProductKey } from '@/lib/nav'
import { ATLAS_LINE, CANVAS_LINE, agoWords, catalystLine, hello, needLine, pipelineLine, todayText, touchLine, waiting } from '@/lib/touchpoint/today'
import type { TodayData } from '@/lib/touchpoint/today-load'
import { CrmQuestion } from './crm-question'
import { Card, Empty, NeedsYou, OUT_TIP, Runs, linkBtn, out, row } from './cards'
import { TourButton } from './tour'

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
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text" data-testid="today-date">
            Touchpoint · {todayText(d, tz)}
          </p>
          <h1 className="mt-1 break-words font-display text-[34px] font-semibold leading-tight text-ink sm:text-[38px]">{hello(hour, name)}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2" data-testid="today-need">
            {needLine(items.length + data.inbox.items.length)}
          </p>
        </div>
        <TourButton />
      </header>

      <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-3">
        {data.inbox.items.length ? <CatalystCard data={data} tz={tz} /> : null}
        <NeedsYou items={items} error={data.approvals.error} />
        <QuickStart />
        <Workspace data={data} waitingN={items.length} briefs={briefs} />
        <Runs runs={data.runs} error={data.runsError} tz={tz} />
        <Signups data={data} now={t} hydrated={hydrated} />
      </div>
    </div>
  )
}

const SHOWN = 4

/** Catalyst · Before your next meetings (v137TodayCard): new clients from HubSpot and new transcripts, each with its question. */
function CatalystCard({ data, tz }: { data: TodayData; tz: string | undefined }) {
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<InboxItem | null>(null)
  const items = data.inbox.items
  const shown = all ? items : items.slice(0, SHOWN)
  const stages = stagesNamed(data.names)
  const callLead = open?.kind === 'call' ? data.inbox.leads.find((l) => l.id === (open as CallItem).leadId) : null
  return (
    <Card w={3} title="Catalyst · Before your next meetings" testid="catalyst-inbox">
      <ul className="grid gap-1">
        {shown.map((x) => {
          const t = itemText(x, data.names, x.kind === 'call' ? usDayText(x.at, tz) : '')
          return (
            <li key={x.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-2.5 py-2 hover:bg-sunk/60" data-testid="inbox-item" data-key={x.key}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sunk text-ink-2">
                {x.kind === 'crm' ? <User size={17} aria-hidden="true" /> : <MessageSquare size={17} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-[1_1_240px]">
                <b className="block text-[14.5px] font-semibold text-ink">{t.t}</b>
                <small className="block text-[13px] text-ink-3">{t.s}</small>
              </span>
              <button
                type="button"
                onClick={() => setOpen(x)}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover"
              >
                {t.b}
              </button>
            </li>
          )
        })}
      </ul>
      {items.length > SHOWN ? (
        <div className="mt-2 border-t border-line pt-2">
          <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className={linkBtn}>
            {all ? 'Show fewer' : `Show ${items.length - SHOWN} more`}
            <ChevronDown size={15} aria-hidden="true" className={all ? 'rotate-180' : ''} />
          </button>
        </div>
      ) : null}
      {open?.kind === 'crm' ? <CrmQuestion item={open as CrmItem} research={stageOfKey('research', data.names)} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'call' && callLead ? (
        <CallQuestion
          lead={callLead}
          stages={stages}
          call={{ id: open.id, title: open.title, start: open.start, minutes: open.minutes, stage: '' }}
          onClose={() => setOpen(null)}
          onDone={() => {}}
        />
      ) : null}
    </Card>
  )
}

function QuickStart() {
  const q: { icon: typeof Users; label: string; sub: string; href: string; outside?: boolean }[] = [
    { icon: Users, label: 'Run Catalyst for a lead', sub: 'Catalyst · Lead pipeline', href: '/lead-pipeline?run=new' },
    { icon: Rocket, label: 'Make an ad campaign', sub: 'Pipeline · Marketing Generation', href: out('marketing-generation'), outside: true },
    { icon: Repeat, label: 'Turn content into a post', sub: 'Pipeline · Content Transformation', href: out('content-transformation'), outside: true },
    { icon: LayoutTemplate, label: 'Put a landing page live', sub: 'Pipeline · Landing pages', href: '/landing-pages?new=1' },
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

function Signups({ data, now, hydrated }: { data: TodayData; now: number; hydrated: boolean }) {
  const all = (
    <div className="mt-3 border-t border-line pt-3">
      <Link href="/landing-pages?tab=signups" className={linkBtn}>
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
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {data.signups.map((s) => (
          <li key={s.id}>
            <Link href="/landing-pages?tab=signups" className={row} title={s.page || undefined} data-testid="signup">
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

