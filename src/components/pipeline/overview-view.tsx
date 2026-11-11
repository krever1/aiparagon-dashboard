'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, FlaskConical, PenLine, Plus, Radar, Repeat, Rocket, X } from 'lucide-react'
import { useSkips } from '@/components/approvals/skips'
import { Icon } from '@/components/icon'
import { Card, Empty, NeedsYou, OUT_TIP, Runs, linkBtn, out } from '@/components/today/cards'
import { TourButton } from '@/components/today/tour'
import { useNow } from '@/components/ui/clock'
import { Dialog } from '@/components/ui/dialog'
import { dayText, useHydrated } from '@/components/ui/local-date'
import type { IconName } from '@/lib/nav'
import { safeUrl } from '@/lib/touchpoint/approvals'
import type { OverviewData } from '@/lib/pipeline/overview-load'
import { W, W_NAME, type WKey, agentTiles, campStatus, moved, voiceLine } from '@/lib/pipeline/overview'
import { hello, needLine, plural, todayText, waiting, whenText } from '@/lib/touchpoint/today'
import { Pill, Tag } from './bits'
import { hideCard, resetCards, setOrder, showCard, useCards } from './widget-store'

// The Pipeline Overview (NW_PAGES['e3.overview'], nwOverviewHtml as v107 to v115 left it): the hello line, what needs
// you, quick starts, the six agents, this week's lead from the organic brief, the newest campaign, what the agents know
// about the team, the newest thought leadership draft and the newest runs. Customize moves or hides cards, in this
// browser only.

const btnSm = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2'
const btnPri = 'inline-flex items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover'
const DOT = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' } as const

/** A link to an action on a page still in the current dashboard. */
function Out({ slug, className, children }: { slug: string; className: string; children: React.ReactNode }) {
  return (
    <a href={out(slug)} title={OUT_TIP} className={className}>
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  )
}

export function OverviewView({ data, name }: { data: OverviewData; name: string }) {
  const hydrated = useHydrated()
  const skips = useSkips()
  const cards = useCards()
  const [cust, setCust] = useState(false)
  const [how, setHow] = useState(false)
  const now = useNow(data.now)
  const tz = hydrated ? undefined : 'UTC'
  const d = new Date(now)
  const hour = hydrated ? d.getHours() : d.getUTCHours()

  const items = waiting(data.approvals.items, skips)
  const replies = data.approvals.items.filter((x) => x.kind === 'reply' && !x.stale).length
  const briefsWaiting = data.approvals.items.filter((x) => x.kind === 'brief').length
  const shown = cards.order.filter((k) => !cards.hidden.includes(k))

  const controls = (k: WKey) => {
    if (!cust) return undefined
    const i = cards.order.indexOf(k)
    const ctl = 'grid h-7 w-7 place-items-center rounded-sm border border-line bg-panel text-ink-2 hover:border-line-2 hover:text-ink disabled:opacity-40'
    const go = (dir: -1 | 1) => {
      const o = moved(cards.order, k, dir)
      if (o) setOrder(o)
    }
    return (
      <div className="-mt-1 mb-2 flex justify-end gap-1" data-testid="card-controls">
        <button type="button" className={ctl} title="Move earlier" aria-label={'Move ' + W_NAME[k] + ' earlier'} disabled={i <= 0} onClick={() => go(-1)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" className={ctl} title="Move later" aria-label={'Move ' + W_NAME[k] + ' later'} disabled={i >= cards.order.length - 1} onClick={() => go(1)}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className={ctl} title="Hide" aria-label={'Hide ' + W_NAME[k]} onClick={() => hideCard(k)}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  const card = (k: WKey) => {
    const c = controls(k)
    switch (k) {
      case 'needs':
        return <NeedsYou key={k} items={items} error={data.approvals.error} controls={c} />
      case 'quick':
        return <QuickStart key={k} controls={c} />
      case 'agents':
        return <Agents key={k} data={data} replies={replies} briefsWaiting={briefsWaiting} tz={tz} now={now} controls={c} onHow={() => setHow(true)} />
      case 'lead':
        return <LeadCard key={k} data={data} tz={tz} controls={c} />
      case 'camp':
        return <CampCard key={k} data={data} tz={tz} controls={c} />
      case 'voice':
        return <VoiceCard key={k} data={data} controls={c} />
      case 'tl':
        return <DraftCard key={k} data={data} tz={tz} controls={c} />
      case 'runs':
        return <Runs key={k} runs={data.runs} error={data.runsError} tz={tz} controls={c} />
    }
  }

  return (
    <div data-testid="overview">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text" data-testid="overview-date">
            Pipeline · Overview · {todayText(d, tz)}
          </p>
          <h1 className="mt-1 break-words font-display text-[34px] font-semibold leading-tight text-ink sm:text-[38px]">{hello(hour, name)}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2" data-testid="overview-need">
            {needLine(items.length) + (data.intelRun?.at ? ' The Intel Tracker last ran ' + whenText(data.intelRun.at, tz) + '.' : '')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TourButton />
          <button type="button" aria-pressed={cust} onClick={() => setCust((v) => !v)} className={btnSm + ' py-2'}>
            {cust ? 'Done' : 'Customize'}
          </button>
        </div>
      </header>

      {cust ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-sunk px-4 py-3 text-[14px] text-ink-2" data-testid="customize-hint">
          <span>Move cards earlier or later, or hide the ones you do not use.</span>
          {cards.hidden.length ? (
            <span className="flex flex-wrap items-center gap-1.5">
              Hidden:
              {cards.hidden.map((k) => (
                <button key={k} type="button" onClick={() => showCard(k)} className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-0.5 text-[13px] font-semibold text-ink hover:border-line-2">
                  <Plus size={14} aria-hidden="true" />
                  {W_NAME[k]}
                </button>
              ))}
            </span>
          ) : null}
          <button type="button" onClick={resetCards} className={linkBtn + ' ml-auto'}>
            Reset
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-3">{shown.map(card)}</div>

      <HowDialog open={how} onClose={() => setHow(false)} briefsWaiting={briefsWaiting} />
    </div>
  )
}

function QuickStart({ controls }: { controls?: React.ReactNode }) {
  const q: { icon: typeof Rocket; label: string; sub: string; slug: string }[] = [
    { icon: Rocket, label: 'Make an ad campaign', sub: 'Marketing Generation', slug: 'marketing-generation' },
    { icon: Repeat, label: 'Turn content into a post', sub: 'Content Transformation', slug: 'content-transformation' },
    { icon: FlaskConical, label: 'Log a result', sub: 'Ad Testing', slug: 'ad-testing' },
  ]
  return (
    <Card w={W.quick} title="Quick start" testid="quick-start" controls={controls}>
      <div className="grid gap-2 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-1">
        {q.map((x) => (
          <a key={x.label} href={out(x.slug)} title={OUT_TIP} className="flex min-w-0 items-center gap-3 rounded-md bg-sunk p-3 text-left text-ink hover:bg-line/60">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-panel text-ink-2">
              <x.icon size={19} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] font-semibold">{x.label}</b>
              <small className="block text-[12.5px] text-ink-3">{x.sub}</small>
            </span>
            <ArrowUpRight size={15} aria-hidden="true" className="ml-auto shrink-0 text-ink-3" />
          </a>
        ))}
      </div>
    </Card>
  )
}

const TILE_ICON: Record<string, IconName> = {
  'intel-tracker': 'radar',
  'ad-strategist': 'megaphone',
  briefs: 'file-text',
  'content-transformation': 'repeat',
  'marketing-generation': 'rocket',
  'ad-testing': 'flask',
}

function Agents({
  data,
  replies,
  briefsWaiting,
  tz,
  now,
  controls,
  onHow,
}: {
  data: OverviewData
  replies: number
  briefsWaiting: number
  tz: string | undefined
  now: number
  controls?: React.ReactNode
  onHow: () => void
}) {
  const tiles = agentTiles({ ...data.tiles, replies, briefsWaiting }, { day: (iso) => dayText(iso, tz), when: (iso) => whenText(iso, tz) }, now)
  const how = (
    <button type="button" onClick={onHow} className={linkBtn}>
      How it fits together
      <ArrowRight size={15} aria-hidden="true" />
    </button>
  )
  return (
    <Card w={W.agents} title="Agents · open any section" testid="agents" aside={how} controls={controls}>
      {data.tilesError ? <p className="mb-3 text-[13px] text-bad">Could not read everything: {data.tilesError}</p> : null}
      <div className="grid grid-cols-1 gap-2 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.slug}
            href={'/' + t.slug}
            title={t.why || undefined}
            data-testid="agent-tile"
            className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-panel p-3.5 text-left hover:border-line-2 hover:bg-sunk"
          >
            <span className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-sunk text-ink-2">
                <Icon name={TILE_ICON[t.slug] ?? 'overview'} size={17} />
              </span>
              <span className="min-w-0 grow truncate text-[14px] font-semibold text-ink">{t.name}</span>
              {t.dot ? <i aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[t.dot]}`} data-dot={t.dot} /> : null}
            </span>
            <span className="font-display text-[28px] font-medium leading-none tabular-nums text-ink">
              {t.n}
              <small className="ml-1.5 font-sans text-[13px] font-normal text-ink-3">{t.u}</small>
            </span>
            <span className="text-[13.5px] text-ink-2">{t.l}</span>
            <span className="text-[12.5px] text-ink-3">{t.s}</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

function LeadCard({ data, tz, controls }: { data: OverviewData; tz: string | undefined; controls?: React.ReactNode }) {
  const [i, setI] = useState(0)
  const L = data.lead
  if (!L || !L.items.length) {
    return (
      <Card w={W.lead} title="This week’s lead" testid="lead" controls={controls}>
        {data.leadError ? <p className="mb-2 text-[13px] text-bad">Could not read the organic brief: {data.leadError}</p> : null}
        <Empty
          icon={Radar}
          title="No organic brief yet"
          text="The Intel Tracker writes one each time it runs."
          action={
            <Link href="/intel-tracker" className={btnSm + ' mt-2'}>
              Open the Intel Tracker
            </Link>
          }
        />
      </Card>
    )
  }
  const n = Math.min(i, L.items.length - 1)
  const it = L.items[n]
  return (
    <Card w={W.lead} title="This week’s lead" testid="lead" controls={controls}>
      {it.tag ? <Tag gold>{it.tag}</Tag> : null}
      <h3 className="mt-2 font-display text-[19px] font-semibold leading-snug text-ink">{it.text}</h3>
      {it.why ? <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{it.why}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="The five notes" className="flex gap-1">
          {L.items.map((x, j) => (
            <button
              key={j}
              type="button"
              aria-pressed={j === n}
              title={x.text}
              onClick={() => setI(j)}
              className={`grid h-7 w-7 place-items-center rounded-full border text-[12.5px] font-semibold ${j === n ? 'border-action bg-action text-action-ink' : 'border-line bg-panel text-ink-2 hover:border-line-2'}`}
            >
              {j + 1}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-ink-3">From the brief of {dayText(L.createdAt, tz)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <Out slug="content-transformation" className={btnPri}>
          Write a post
        </Out>
        <Link href="/briefs?tab=organic" className={btnSm}>
          Open the brief
        </Link>
      </div>
    </Card>
  )
}

function CampCard({ data, tz, controls }: { data: OverviewData; tz: string | undefined; controls?: React.ReactNode }) {
  const c = data.camp
  if (!c) {
    return (
      <Card w={W.camp} title="Latest campaign" testid="camp" controls={controls}>
        {data.campError ? <p className="mb-2 text-[13px] text-bad">Could not read the campaigns: {data.campError}</p> : null}
        <Empty
          icon={Rocket}
          title="No campaign yet"
          text="Marketing Generation writes ads, a survey, a landing page and a booking page from the ads brief."
          action={
            <Out slug="marketing-generation" className={btnSm + ' mt-2'}>
              Make one
            </Out>
          }
        />
      </Card>
    )
  }
  const imgs = c.images.filter((i) => safeUrl(i.url)).slice(0, 3)
  const st = campStatus(c.images, c.fb)
  return (
    <Card w={W.camp} title="Latest campaign" testid="camp" controls={controls}>
      {data.campError ? <p className="mb-2 text-[13px] text-bad">Could not read every decision: {data.campError}</p> : null}
      {imgs.length ? (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {imgs.map((im, j) => (
            // eslint-disable-next-line @next/next/no-img-element -- an ad's image, from wherever the campaign kept it
            <img key={j} src={im.url} alt={im.label || 'Ad image'} loading="lazy" className="aspect-square w-full rounded-sm border border-line object-cover" />
          ))}
        </div>
      ) : null}
      <b className="block text-[15px] font-semibold text-ink">{c.offer}</b>
      <span className="block text-[13px] text-ink-3">{dayText(c.createdAt, tz) + (c.mode ? ' · ' + c.mode : '')}</span>
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        <Pill tone={st.tone}>{st.text}</Pill>
        <span className="grow" />
        <Out slug="marketing-generation" className={btnSm}>
          Open
        </Out>
      </div>
    </Card>
  )
}

function VoiceCard({ data, controls }: { data: OverviewData; controls?: React.ReactNode }) {
  const I = data.voice
  if (!I) {
    return (
      <Card w={W.voice} title="Voice and context" testid="voice" controls={controls}>
        <p className="text-[14px] text-bad">Could not read what the agents know about you: {data.voiceError}</p>
      </Card>
    )
  }
  const n = I.filter((x) => x.v.trim()).length
  const missing = n < I.length
  const pct = I.length ? Math.round((n / I.length) * 100) : 0
  return (
    <Card w={W.voice} title="Voice and context" testid="voice" controls={controls}>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[34px] font-medium leading-none tabular-nums text-ink">{n}</span>
        <span className="text-[14px] text-ink-2">of {I.length} set</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
        <i className="block h-full rounded-full bg-accent" style={{ width: pct + '%' }} />
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{voiceLine(I)}</p>
      <div className="mt-4 border-t border-line pt-4">
        <Out slug="company-profile" className={missing ? btnPri : btnSm}>
          {missing ? 'Finish setup' : 'Open the company profile'}
        </Out>
      </div>
    </Card>
  )
}

function DraftCard({ data, tz, controls }: { data: OverviewData; tz: string | undefined; controls?: React.ReactNode }) {
  const o = data.draft
  if (!o) {
    return (
      <Card w={W.tl} title="Latest thought leadership" testid="tl" controls={controls}>
        {data.draftError ? <p className="mb-2 text-[13px] text-bad">Could not read the drafts: {data.draftError}</p> : null}
        <Empty
          icon={PenLine}
          title="No drafts yet"
          text="Turn an article, a podcast or a new idea into a post in your voice."
          action={
            <Out slug="content-transformation" className={btnSm + ' mt-2'}>
              Start one
            </Out>
          }
        />
      </Card>
    )
  }
  return (
    <Card w={W.tl} title="Latest thought leadership" testid="tl" controls={controls}>
      <b className="block text-[15px] font-semibold text-ink">{o.title}</b>
      <span className="block text-[13px] text-ink-3">{o.format + ' · ' + dayText(o.createdAt, tz)}</span>
      {o.text ? <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-ink-2">{o.text}</p> : null}
      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        {o.ready ? <Pill tone="good">Ready</Pill> : <Pill tone="warn">To check</Pill>}
        <span className="grow" />
        <Out slug="content-transformation" className={btnSm}>
          Open
        </Out>
      </div>
    </Card>
  )
}

/** How the pieces connect, in one window (nwHowOpen). */
function HowDialog({ open, onClose, briefsWaiting }: { open: boolean; onClose: () => void; briefsWaiting: number }) {
  const steps: { icon: IconName; t: string; s: string; href: string; label: string }[] = [
    {
      icon: 'building',
      t: 'Your substance and voice',
      s: 'The company profile: voice, offers, personas, proof and guardrails. Every draft reads it.',
      href: '/company-profile',
      label: 'Company profile',
    },
    {
      icon: 'radar',
      t: 'Two agents read the market',
      s: 'The Intel Tracker reads posts from the people and topics you follow. The Ad Strategist studies the ads that keep running.',
      href: '/intel-tracker',
      label: 'Intel Tracker',
    },
    {
      icon: 'file-text',
      t: 'The briefs hand it over',
      s: briefsWaiting
        ? 'Both agents write a brief. ' + plural(briefsWaiting, 'brief') + ' waiting for your review.'
        : 'Both agents write a brief, and you approve it before it shapes a draft.',
      href: '/briefs',
      label: 'Briefs',
    },
    {
      icon: 'repeat',
      t: 'You create from both',
      s: 'Content Transformation starts from your own material. Marketing Generation starts from the briefs.',
      href: '/content-transformation',
      label: 'Content Transformation',
    },
    { icon: 'inbox', t: 'Nothing goes out without you', s: 'Briefs, ads and replies wait in Approvals until a person approves them.', href: '/approvals', label: 'Approvals' },
    {
      icon: 'flask',
      t: 'Results shape the next round',
      s: 'Log what ran in Ad Testing. The strategy read ranks what worked for the next drafts.',
      href: '/ad-testing',
      label: 'Ad Testing',
    },
  ]
  return (
    <Dialog open={open} onClose={onClose} kicker="Pipeline · Content and ads" title="How it fits together" width={680}>
      <ol className="grid gap-3" data-testid="how-steps">
        {steps.map((x, j) => (
          <li key={x.t} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3 min-[641px]:flex-nowrap">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunk font-display text-[15px] font-semibold text-ink">{j + 1}</span>
            <div className="min-w-0 grow">
              <b className="block text-[14.5px] font-semibold text-ink">{x.t}</b>
              <span className="block text-[13.5px] leading-relaxed text-ink-2">{x.s}</span>
            </div>
            <Link href={x.href} onClick={onClose} className={btnSm + ' shrink-0'}>
              <Icon name={x.icon} size={15} />
              {x.label}
            </Link>
          </li>
        ))}
      </ol>
    </Dialog>
  )
}
