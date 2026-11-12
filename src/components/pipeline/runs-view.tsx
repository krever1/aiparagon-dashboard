'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowUpRight, ChevronDown, ChevronRight, FileText, Info, Plus, Search } from 'lucide-react'
import { ErrorNotice, StripTile, Tabs } from '@/components/catalyst/bits'
import { useCheckBack } from '@/components/catalyst/check-back'
import { Dialog } from '@/components/ui/dialog'
import { dateText, useHydrated } from '@/components/ui/local-date'
import { useNow } from '@/components/ui/clock'
import type { RunsData } from '@/lib/pipeline/runs-load'
import { type HistKind, type HistRow, HIST_KIND, HIST_TABS, histSearch, histTabOf } from '@/lib/pipeline/uploads'
import { briefHref } from '@/lib/touchpoint/approvals'
import { btn, ghost, inputCls, linkCls, primary } from './bits'
import { OUT_TIP, legacy } from './briefs-parts'
import { ReadAd } from './ads-panel'
import { BriefWindow, SendButton } from './brief-window'
import { CopyBody } from './copy-cards'
import { dismissCampaign, useDismissed } from './campaign-store'
import { RunDialog } from './intel-run'
import { UploadWindow } from './upload-window'

// Runs & uploads (view e3history: apRenderHistory, apHistBody, the Intel runs added by its wrapper): one list, newest
// first, of the ads the team uploaded, the ads briefs built from them, the ad copy written from them, the campaigns
// built from those briefs and every Intel Tracker brief, with the custom Intel runs still under way. The tab is the
// address's (?tab=); search and the open rows start afresh.

type Tab = HistKind | 'all'
const PER = 12

const TAG: Record<HistKind, string> = {
  upload: 'bg-info-soft text-info',
  brief: 'bg-accent-soft text-accent-text',
  copy: 'bg-warn-soft text-warn',
  funnel: 'bg-good-soft text-good',
  intel: 'bg-sunk text-ink-2',
}

const addressOf = (tab: Tab) => '/runs' + (tab === 'all' ? '' : '?tab=' + tab)

export function RunsView({ data }: { data: RunsData }) {
  const params = useSearchParams()
  const hydrated = useHydrated()
  const tz = hydrated ? undefined : 'UTC'
  const [tab, setTab] = useState<Tab>(() => histTabOf(params.get('tab')))
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [win, setWin] = useState<'' | 'upload' | 'brief' | 'intel' | 'how'>('')

  // a link back here asks for a tab (Next.js keeps the page alive between visits); a bare address keeps it as it was
  const sp = params.toString()
  const [seenSp, setSeenSp] = useState(sp)
  if (sp !== seenSp) {
    setSeenSp(sp)
    if (sp && '/runs?' + sp !== addressOf(tab)) {
      setTab(histTabOf(params.get('tab')))
      setPage(0)
      setQ('')
    }
  }
  useEffect(() => {
    const want = addressOf(tab)
    if (window.location.pathname + window.location.search !== want) window.history.replaceState(null, '', want)
    // sp: a page refresh from an action can put back the address the page had when the action started
  }, [tab, sp])

  // while a campaign is written or an Intel run reads, the page checks back for it
  const running = data.campaign?.status === 'running' || data.rows.some((r) => r.pending && r.kind === 'intel')
  useCheckBack(running)

  const pick = (t: Tab) => {
    setTab(t)
    setPage(0)
  }
  const counts: Record<Tab, number> = {
    all: data.rows.length,
    intel: data.counts.intel,
    upload: data.counts.upload,
    brief: data.counts.brief,
    copy: data.counts.copy,
    funnel: data.counts.funnel,
  }
  const kindRows = tab === 'all' ? data.rows : data.rows.filter((r) => r.kind === tab)
  const shown = histSearch(kindRows, q)
  const pages = Math.max(1, Math.ceil(shown.length / PER))
  const p = Math.min(page, pages - 1)
  const slice = shown.slice(p * PER, p * PER + PER)
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div data-testid="runs-page">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={primary + ' px-3.5 py-2 text-[14px]'} onClick={() => setWin('brief')}>
          <FileText size={16} aria-hidden="true" />
          Build ad strategy
        </button>
        <button type="button" className={btn + ' px-3.5 py-2 text-[14px]'} onClick={() => setWin('intel')}>
          New Intel run
        </button>
      </div>

      {hydrated ? <CampaignBanner data={data} tz={tz} /> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[14px] text-ink-2" data-testid="runs-newest">
        {data.newest ? (
          <>
            <span>
              Newest advertisement brief: <b className="text-ink">{dateText(data.newest.at, tz)}</b>
            </span>
            <button type="button" className={ghost + ' px-1.5'} aria-label="Send to Marketing Generation: how it works" title="Send to Marketing Generation" onClick={() => setWin('how')}>
              <Info size={15} aria-hidden="true" />
            </button>
            <span className="grow" />
            <SendButton />
          </>
        ) : (
          <span>No strategy built yet</span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2" data-testid="runs-strip">
        <StripTile n={data.counts.upload} label={data.counts.upload === 1 ? 'ad uploaded' : 'ads uploaded'} tip="Read by the analyzer" active={tab === 'upload'} onClick={() => pick('upload')} />
        <StripTile n={data.counts.brief} label={data.counts.brief === 1 ? 'strategy built' : 'strategies built'} tip="From your uploads" active={tab === 'brief'} onClick={() => pick('brief')} />
        <StripTile n={data.counts.funnel} label={data.counts.funnel === 1 ? 'content run' : 'content runs'} tip="Funnels with ad images" active={tab === 'funnel'} onClick={() => pick('funnel')} />
        <StripTile
          n={data.counts.intel}
          label={data.counts.intel === 1 ? 'Intel run' : 'Intel runs'}
          tip={data.counts.custom + ' custom, ' + (data.counts.intel - data.counts.custom) + ' by the agent'}
          active={tab === 'intel'}
          onClick={() => pick('intel')}
        />
      </div>

      {data.errors.map((e) => (
        <ErrorNotice key={e}>{e}</ErrorNotice>
      ))}

      <div className="flex flex-wrap items-start justify-between gap-x-3">
        <Tabs label="Runs & uploads" tabs={HIST_TABS.map(([k, label]) => ({ key: k, label, count: counts[k] }))} active={tab} onPick={pick} />
        <button type="button" className={btn + ' mb-5'} onClick={() => setWin('upload')}>
          <Plus size={14} aria-hidden="true" />
          Add competitor ads
        </button>
      </div>

      <div role="tabpanel">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 grow basis-[260px]">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              className={inputCls + ' max-w-[420px] py-1.5 pl-8 text-[14px]'}
              placeholder="Search the history…"
              aria-label="Search the history"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(0)
              }}
            />
          </label>
          <span className="text-[13px] text-ink-3" data-testid="runs-count">
            {shown.length} of {kindRows.length}
          </span>
        </div>

        {slice.length ? (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="runs-list">
            {slice.map((r) => (
              <RowItem key={r.id} r={r} tz={tz} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-[14px] text-ink-3" data-testid="runs-empty">
            {q.trim() && kindRows.length ? 'Nothing matches “' + q.trim() + '”.' : 'Nothing here yet. Upload a competitor ad to start.'}
          </p>
        )}

        {pages > 1 ? <Pager p={p} pages={pages} n={shown.length} onPage={setPage} /> : null}
      </div>

      {win === 'upload' ? (
        <UploadWindow
          names={data.names}
          follows={data.follows}
          onClose={() => setWin('')}
          onDone={(id) => {
            setWin('')
            setTab('upload')
            setPage(0)
            setQ('')
            setOpen(new Set(['u:' + id]))
          }}
        />
      ) : null}
      {win === 'brief' ? <BriefWindow onClose={() => setWin('')} /> : null}
      {win === 'intel' ? <RunDialog onClose={() => setWin('')} /> : null}
      {win === 'how' ? (
        <Dialog
          open
          onClose={() => setWin('')}
          kicker="How it works"
          title="Send to Marketing Generation"
          width={520}
          footer={
            <button type="button" className={primary} onClick={() => setWin('')}>
              Got it
            </button>
          }
        >
          <p className="text-[14.5px] text-ink-2">
            Build a strategy from the ads you uploaded, then send it to Marketing Generation. Marketing Generation always builds from the newest advertisement brief.
          </p>
        </Dialog>
      ) : null}
    </div>
  )
}

/** The campaign started from a brief (apLtBanner): being written, written, or not seen after 15 minutes. */
function CampaignBanner({ data, tz }: { data: RunsData; tz: string | undefined }) {
  const now = useNow(data.now)
  const dismissed = useDismissed()
  const c = data.campaign
  if (!c || dismissed === c.run.t) return null
  const from = c.run.brief || 'the newest brief'
  const dismiss = (
    <button type="button" className={ghost} onClick={() => dismissCampaign(c.run.t)}>
      Dismiss
    </button>
  )
  if (c.status === 'running') {
    const min = Math.max(0, Math.floor((now - c.run.t) / 60_000))
    return (
      <div role="status" className="mb-4 rounded-md border border-info/30 bg-info-soft px-3 py-2.5 text-[14px] text-ink-2" data-testid="campaign-banner">
        <b className="text-ink">Marketing Generation running</b> from {from} · started {min ? min + ' min ago' : 'just now'}. The funnel package appears here when it
        finishes.
      </div>
    )
  }
  if (c.status === 'done') {
    return (
      <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-good/30 bg-good-soft px-3 py-2 text-[14px] text-ink-2" data-testid="campaign-banner">
        <span className="min-w-0 grow">
          ✓ <b className="text-ink">Marketing Generation finished</b> · {c.title}
          <small className="ml-1 text-ink-3">{dateText(new Date(c.run.t).toISOString(), tz)}</small>
        </span>
        <a href={legacy('marketing-generation')} title={OUT_TIP} className={btn}>
          Open in Marketing Generation
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
        {dismiss}
      </div>
    )
  }
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[14px] text-bad" data-testid="campaign-banner">
      <span className="min-w-0 grow">No funnel package after 15 minutes from {from}. Check the run in n8n.</span>
      {dismiss}
    </div>
  )
}

function Pager({ p, pages, n, onPage }: { p: number; pages: number; n: number; onPage: (p: number) => void }) {
  // every page when there are 7 or fewer, else the first, the last and the two beside this one
  const nums: (number | '…')[] = []
  for (let i = 0; i < pages; i++) {
    if (pages <= 7 || i === 0 || i === pages - 1 || Math.abs(i - p) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  return (
    <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-3">
      <span className="mr-2">
        {p * PER + 1}–{Math.min(n, p * PER + PER)} of {n}
      </span>
      <button type="button" className={btn} disabled={p === 0} onClick={() => onPage(p - 1)}>
        ‹ Back
      </button>
      {nums.map((x, i) =>
        x === '…' ? (
          <span key={'g' + i}>…</span>
        ) : (
          <button
            key={x}
            type="button"
            aria-current={x === p ? 'page' : undefined}
            className={x === p ? primary + ' px-2.5' : btn + ' px-2.5'}
            onClick={() => onPage(x)}
          >
            {x + 1}
          </button>
        ),
      )}
      <button type="button" className={btn} disabled={p >= pages - 1} onClick={() => onPage(p + 1)}>
        Next ›
      </button>
    </nav>
  )
}

function RowItem({ r, tz, open, onToggle }: { r: HistRow; tz: string | undefined; open: boolean; onToggle: () => void }) {
  return (
    <li className="rounded-md border border-line bg-panel" data-testid="runs-row" data-kind={r.kind}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-sunk/60">
        {open ? <ChevronDown size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" /> : <ChevronRight size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />}
        <span className="min-w-0 grow">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TAG[r.kind]}`}>{r.pending && r.kind === 'intel' ? 'In progress' : HIST_KIND[r.kind]}</span>
            <b className="line-clamp-3 min-w-0 text-[14.5px] text-ink">{r.title}</b>
          </span>
          <small className="mt-0.5 block text-[12.5px] text-ink-3">
            {r.sub}
            {r.pending && r.kind === 'upload' ? ' · not read yet' : ''}
          </small>
        </span>
        <span className="shrink-0 whitespace-nowrap text-[12.5px] text-ink-3">{dateText(r.at, tz)}</span>
      </button>
      {open ? (
        <div className="border-t border-line px-3 py-3" data-testid="runs-body">
          <RowBody r={r} />
        </div>
      ) : null}
    </li>
  )
}

function Thumbs({ urls, label }: { urls: string[]; label: string }) {
  if (!urls.length) return null
  return (
    <ul className="mb-2.5 flex flex-wrap gap-2" aria-label={label}>
      {urls.map((u, i) => (
        <li key={u + i}>
          <a href={u} target="_blank" rel="noopener noreferrer" className="block h-[74px] w-[74px] overflow-hidden rounded-sm border border-line bg-sunk">
            {/* eslint-disable-next-line @next/next/no-img-element -- pictures kept in Storage, any size */}
            <img src={u} alt={label + ' ' + (i + 1)} loading="lazy" className="h-full w-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  )
}

function RowBody({ r }: { r: HistRow }) {
  if (r.upload) {
    const u = r.upload
    return (
      <>
        <Thumbs urls={u.images} label="Screenshot" />
        {u.hook ? (
          <p className="mb-1 text-[14px] text-ink-2">
            <b className="text-ink">Hook:</b> {u.hook}
          </p>
        ) : null}
        {u.takeaways.length ? (
          <p className="mb-2 text-[14px] text-ink-2">
            <b className="text-ink">Takeaways:</b> {u.takeaways.join(' · ')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href={'/ad-strategist?ad=' + u.adId} className={btn}>
            Open the ad
          </Link>
          {r.pending ? <ReadAd id={u.adId} /> : null}
        </div>
      </>
    )
  }
  if (r.brief) {
    const b = r.brief
    return (
      <>
        {b.hooks.length ? (
          <>
            <b className="mb-1 block text-[13.5px] text-ink">Hook patterns</b>
            <ul className="mb-2.5 grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">
              {b.hooks.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href={briefHref(b.runId, 'ads')} className={btn}>
            Open the brief
          </Link>
          <SendButton brief={b.runId} />
        </div>
      </>
    )
  }
  if (r.copy) return <CopyBody takeaways={r.copy.takeaways} variants={r.copy.variants} notes={r.copy.notes} />
  if (r.funnel) {
    return (
      <>
        <Thumbs urls={r.funnel.images} label="Ad image" />
        <a href={legacy('marketing-generation')} title={OUT_TIP} className={btn}>
          Open in Marketing Generation
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </>
    )
  }
  if (r.intel) {
    const i = r.intel
    if (r.pending) {
      return (
        <p className="text-[14px] text-ink-2">
          The tracker is reading {i.names.join(', ') || 'your names'} now. This row turns into the brief when it finishes, usually 5 to 15 minutes.
        </p>
      )
    }
    return (
      <>
        <span className={`mb-2 inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${i.custom ? 'bg-accent-soft text-accent-text' : 'bg-sunk text-ink-2'}`}>
          {i.custom ? 'Custom run' : 'Agent run'}
        </span>
        {i.bullets.length ? (
          <ul className="mb-2.5 grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">
            {i.bullets.map((b, k) => (
              <li key={k}>
                {b.title ? <b className="text-ink">{b.title}: </b> : null}
                {b.text}
              </li>
            ))}
          </ul>
        ) : null}
        <Link href={'/intel-tracker?run=' + encodeURIComponent(i.runId)} className={linkCls}>
          Open in Intel Tracker
        </Link>
      </>
    )
  }
  return null
}
