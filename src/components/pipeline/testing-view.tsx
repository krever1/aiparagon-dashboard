'use client'

import { type ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, ArrowUpRight, BarChart3, Download, Layers, Plus, RefreshCw, Sparkles, Upload } from 'lucide-react'
import { syncNow, syncStatus } from '@/app/(app)/ad-testing/actions'
import { ErrorNotice, StripTile, Tabs } from '@/components/catalyst/bits'
import { Dialog } from '@/components/ui/dialog'
import { useHydrated } from '@/components/ui/local-date'
import { useNow } from '@/components/ui/clock'
import { toast } from '@/components/ui/toast'
import {
  type Ranked, type Result, type SyncState, TEMPLATE_CSV, clip, eng, int, isRanked, linkOf, lpRows, money, noDash, pct, per, postsByEngagement, rank, roas, say,
  split, srcLine, srcOf, stats, syncLine, times, whatLine, workLine, working,
} from '@/lib/pipeline/ad-testing'
import type { TestingData } from '@/lib/pipeline/ad-testing-load'
import { Empty, Tag, btn, linkCls, primary } from './bits'
import { OUT_TIP, legacy } from './briefs-parts'
import { ImportDialog } from './testing-import'
import { LogDialog, removeResult } from './testing-log'
import { ReadTab, useStrategyRun } from './testing-read'
import { dayShort } from '@/lib/pipeline/strategy'

// The Ad Testing page (NW_PAGES['e3.testing'] with v98, v106, v113, v115 and v116 in the current dashboard): what is
// logged, the six numbers, where the daily numbers come from (Sync now), the Strategy read (the newest read, New read,
// the earlier reads), Results (the landing pages' sign-ups, how the results came in, what is working, the ads and the
// posts) and the Leaderboard. Log a result and Import a CSV open their windows; ?log=1 opens Log a result once (the
// Pipeline Overview's quick start). The tab is the address's: the Strategy read at a bare address, ?tab=results and
// ?tab=board (the old word insights is the Strategy read).

type Tab = 'read' | 'results' | 'board'
const TAB_URL: Record<Tab, string> = { read: '/ad-testing', results: '/ad-testing?tab=results', board: '/ad-testing?tab=board' }
const RIGHT = 'px-3 py-2 text-right tabular-nums'
const TH = 'px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3'

const INFO = {
  resdef: {
    title: 'How these numbers are worked out',
    body: [
      'Click rate is clicks divided by impressions. Engagement is reactions, comments and shares divided by impressions.',
      'Qualified are the leads your team or your CRM marked as a fit. Booked calls are the calls they booked. Won are the ones that became clients, and revenue is what they brought in.',
      'Cost per lead is spend divided by leads. Return is revenue divided by spend. Everything is used exactly as entered or imported.',
    ],
  },
  board: {
    title: 'How the leaderboard ranks ads',
    body: [
      'Once revenue is logged, ads are ranked by return on spend: revenue divided by spend. Without revenue, by what a client won cost, then a booked call, a qualified lead and a lead.',
      'A cheap lead that never books is worth less than a dearer one that does. Give each ad a few days before you judge it.',
    ],
  },
} as const

function Info({ k }: { k: keyof typeof INFO }) {
  const [open, setOpen] = useState(false)
  const I = INFO[k]
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={I.title}
        title={I.title}
        className="ml-1 inline-grid h-[18px] w-[18px] place-items-center rounded-full border border-line-2 align-middle text-[11px] font-semibold text-ink-3 hover:border-accent hover:text-accent-text"
      >
        i
      </button>
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          kicker="How it works"
          title={I.title}
          width={560}
          footer={
            <button type="button" className={primary} onClick={() => setOpen(false)}>
              Got it
            </button>
          }
        >
          {I.body.map((p, i) => (
            <p key={i} className="mb-2.5 text-[14.5px] leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
        </Dialog>
      ) : null}
    </>
  )
}

/** The results file the team fills in, as a download (v106Template). */
function downloadTemplate() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv' }))
  a.download = 'results-template.csv'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 500)
}

export function TestingView({ data }: { data: TestingData }) {
  const router = useRouter()
  const sp = useSearchParams()
  const hydrated = useHydrated()
  const now = useNow(data.now)
  const tz = hydrated ? undefined : 'UTC'
  const want = sp.get('tab')
  const tab: Tab = want === 'board' ? 'board' : want === 'results' ? 'results' : 'read'
  const pick = (t: Tab) => window.history.replaceState(null, '', TAB_URL[t])
  const [log, setLog] = useState<Result | 'new' | null>(null)
  const [imp, setImp] = useState(false)

  // the Pipeline Overview's "Log a result" asks for the form once (?log=1)
  const askedLog = sp.get('log') === '1'
  const [seenLog, setSeenLog] = useState(false)
  if (askedLog && !seenLog) {
    setSeenLog(true)
    setLog('new')
  }
  if (!askedLog && seenLog) setSeenLog(false)
  useEffect(() => {
    if (askedLog) window.history.replaceState(null, '', TAB_URL[tab])
  }, [askedLog, tab])

  // where the daily numbers come from, asked once the page is on screen (v113AdsLoad)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [syncing, setSyncing] = useState(false)
  useEffect(() => {
    let live = true
    syncStatus()
      .catch((): SyncState => ({ st: 'err', meta: {}, linkedin: {}, msg: 'Could not reach the dashboard.' }))
      .then((s) => {
        if (live) setSync(s)
      })
    return () => {
      live = false
    }
  }, [])
  const doSync = async () => {
    if (syncing) return
    setSyncing(true)
    const r = await syncNow().catch(() => ({ ok: false as const, error: 'Could not sync just now' }))
    setSyncing(false)
    if (!r.ok) return toast(r.error, 'warn')
    toast(r.rows ? r.rows + (r.rows === 1 ? ' ad' : ' ads') + ' updated' : 'Nothing new to sync')
    setSync(await syncStatus().catch(() => sync))
  }

  const T = split(data.results)
  const S = stats(data.results)
  const line = sync ? syncLine(sync, now) : null
  const readAt = data.reads[0]?.createdAt ?? ''
  // a strategy read being made is checked on any tab; the one that lands is put on screen
  const [selId, setSelId] = useState('')
  const run = useStrategyRun(data, now, () => setSelId(''))
  const reading = run.state?.st === 'running'

  return (
    <div data-testid="testing-page">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ink-2" data-testid="testing-status" aria-label="Where it stands">
          {reading ? (
            <li className="flex items-center gap-2">
              <i aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-info" />
              A strategy read is running
            </li>
          ) : null}
          <li className="flex items-center gap-2">
            <i aria-hidden="true" className={`h-2 w-2 rounded-full ${readAt ? 'bg-good' : 'bg-warn'}`} />
            {readAt ? 'Strategy read ' + dayShort(readAt, now, tz) : 'No strategy read yet'}
          </li>
          <li className="flex items-center gap-2">
            <i aria-hidden="true" className={`h-2 w-2 rounded-full ${data.error ? 'bg-bad' : T.all.length ? 'bg-good' : 'bg-warn'}`} />
            {data.error ? 'Could not load results' : T.all.length ? T.all.length + (T.all.length === 1 ? ' result logged' : ' results logged') : 'No results logged yet'}
          </li>
        </ul>
        <ul className="flex flex-wrap gap-2" aria-label="What Ad Testing does">
          {(
            [
              [BarChart3, 'Log post and ad results'],
              [Layers, 'Ranks what works'],
              [Sparkles, 'Suggests what to make next'],
            ] as const
          ).map(([Ic, t]) => (
            <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[13px] font-semibold text-ink-2">
              <Ic size={14} aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={btn + ' px-3 py-2 text-[14px]'} onClick={() => setImp(true)}>
            <Upload size={15} aria-hidden="true" />
            Import a CSV
          </button>
          <button type="button" className={primary + ' px-3.5 py-2 text-[14px]'} onClick={() => setLog('new')}>
            <Plus size={15} aria-hidden="true" />
            Log a result
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" data-testid="testing-strip">
        {S.map((s) => (
          <StripTile key={s.label} n={s.n} label={s.label} onClick={() => pick(s.tab)} />
        ))}
      </div>

      {line ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-panel px-3.5 py-2.5 text-[14px] text-ink-2" data-testid="sync-line">
          <span className="flex min-w-0 items-center gap-2">
            <BarChart3 size={15} aria-hidden="true" className="shrink-0 text-ink-3" />
            {line.text}
          </span>
          {line.connected ? (
            <button type="button" className={btn} disabled={syncing} onClick={() => void doSync()}>
              <RefreshCw size={14} aria-hidden="true" />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          ) : (
            <a href={legacy('integrations')} title={OUT_TIP} className={linkCls}>
              Connect on Integrations
            </a>
          )}
        </div>
      ) : null}

      <Tabs
        label="Ad Testing"
        tabs={[
          { key: 'read', label: 'Strategy read' },
          { key: 'results', label: 'Results', count: T.all.length || '' },
          { key: 'board', label: 'Leaderboard' },
        ]}
        active={tab}
        onPick={pick}
      />

      <div role="tabpanel">
        {tab === 'read' ? (
          <ReadTab
            data={data}
            now={now}
            tz={tz}
            onResults={() => pick('results')}
            state={run.state}
            onStarted={run.started}
            selId={selId}
            onSel={setSelId}
          />
        ) : tab === 'results' ? (
          <ResultsTab data={data} tz={tz} onLog={() => setLog('new')} onEdit={(r) => setLog(r)} onImport={() => setImp(true)} />
        ) : (
          <BoardTab results={T.all} tz={tz} onLog={() => setLog('new')} />
        )}
      </div>

      {imp ? <ImportDialog now={now} onClose={() => setImp(false)} onTemplate={downloadTemplate} /> : null}
      {log ? (
        <LogDialog
          key={log === 'new' ? 'new' : log.id}
          result={log === 'new' ? null : log}
          onClose={() => setLog(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  )
}

/** A result's name, its link, the line under it, a note, and Edit and Delete for one logged here (nwTsWhat). */
function What({ r, tz, acts, onEdit }: { r: Result; tz: string | undefined; acts?: boolean; onEdit?: (r: Result) => void }) {
  const href = linkOf(r)
  return (
    <div className="grid min-w-0 gap-0.5">
      <span>
        <b className="font-semibold text-ink">{clip(noDash(r.title), 90)}</b>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Open it" className="ml-1 inline-flex align-middle text-ink-3 hover:text-accent-text">
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : null}
      </span>
      <span className="text-[12.5px] text-ink-3">{whatLine(r, tz)}</span>
      {r.notes ? <span className="text-[12.5px] text-ink-3">{clip(r.notes, 120)}</span> : null}
      {acts && srcOf(r) !== 'api' ? (
        <span className="mt-0.5 flex gap-3">
          <button type="button" className="text-[12.5px] font-semibold text-accent-text hover:underline" onClick={() => onEdit?.(r)}>
            Edit
          </button>
          <button
            type="button"
            className="text-[12.5px] font-semibold text-bad hover:underline"
            aria-label={'Delete the result for ' + clip(r.title, 40)}
            onClick={() => void removeResult(r)}
          >
            Delete
          </button>
        </span>
      ) : null}
    </div>
  )
}

function Table({ cols, rows, label, minW = 760 }: { cols: string[]; rows: { key: string; cells: ReactNode[]; lead?: boolean }[]; label: string; minW?: number }) {
  return (
    <div className="relative overflow-x-auto rounded-md border border-line bg-panel">
      <table className="w-full text-[13.5px]" style={{ minWidth: minW }} aria-label={label}>
        <thead>
          <tr className="border-b border-line text-left">
            {cols.map((c, i) => (
              <th key={c} scope="col" className={TH + (i ? ' text-right' : '')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`border-b border-line align-top last:border-0 ${r.lead ? 'bg-accent-soft/50' : ''}`} data-testid="result-row">
              {r.cells.map((c, i) => (
                <td key={i} className={i ? RIGHT + ' text-ink-2' : 'max-w-[380px] px-3 py-2'}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SecTitle({ title, count, extra }: { title: string; count?: number; extra?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex flex-wrap items-baseline gap-x-2">
      <h2 className="font-display text-[20px] font-semibold text-ink">
        {title}
        {count !== undefined ? <span className="ml-1.5 text-[14px] font-normal text-ink-3">{count}</span> : null}
      </h2>
      {extra}
    </div>
  )
}

function ResultsTab({
  data,
  tz,
  onLog,
  onEdit,
  onImport,
}: {
  data: TestingData
  tz: string | undefined
  onLog: () => void
  onEdit: (r: Result) => void
  onImport: () => void
}) {
  const T = split(data.results)
  const W = working(T.ads)
  return (
    <>
      <LpCard data={data} />
      {data.error ? <ErrorNotice>Could not load results: {data.error}</ErrorNotice> : null}
      {!T.all.length ? (
        <Empty
          icon={<BarChart3 size={30} aria-hidden="true" />}
          title="No results logged yet"
          text="After a post or ad has run for a few days, log its reach, clicks and leads. The strategy read and leaderboard use these numbers as you enter them."
          action={
            <div className="grid justify-items-center gap-2">
              <span className="flex flex-wrap justify-center gap-2">
                <button type="button" className={primary} onClick={onLog}>
                  <Plus size={15} aria-hidden="true" />
                  Log a result
                </button>
                <button type="button" className={btn} onClick={onImport}>
                  <Upload size={15} aria-hidden="true" />
                  Import a CSV
                </button>
              </span>
              <button type="button" className={linkCls} onClick={downloadTemplate}>
                Download the template
              </button>
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-ink-3" data-testid="results-src">
              {srcLine(T.all)}
            </span>
            <span className="grow" />
            <button type="button" className={linkCls} onClick={downloadTemplate}>
              <Download size={14} aria-hidden="true" />
              Download the template
            </button>
          </div>
          {W ? (
            <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="working">
              <div className="grid gap-4 min-[761px]:grid-cols-2">
                {(
                  [
                    ['Working', W.good, 'Nothing clearly ahead yet.'],
                    ['Not working yet', W.bad, 'Nothing clearly behind.'],
                  ] as const
                ).map(([k, list, none]) => (
                  <div key={k} data-testid={k === 'Working' ? 'working-good' : 'working-bad'}>
                    <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">{k}</p>
                    {list.length ? (
                      <ul className="grid gap-1.5">
                        {list.map((x) => (
                          <li key={x.r.id} className="text-[14px]">
                            <b className="font-semibold text-ink">{clip(x.r.title || 'Untitled ad', 70)}</b>{' '}
                            <span className="text-[13px] text-ink-3">{workLine(x)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13.5px] text-ink-2">{none}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[13px] text-ink-3">
                By cost per lead against the middle of your ads, or by return once revenue is logged. The strategy read turns this into what to keep, change and
                test next. Nothing changes your ads on its own.
              </p>
            </section>
          ) : null}
          {T.ads.length ? (
            <>
              <SecTitle title="Ads" count={T.ads.length} extra={<Info k="resdef" />} />
              <Table
                label="Ads"
                minW={980}
                cols={['Ad', 'Spend', 'Click rate', 'Leads', 'Qualified', 'Booked calls', 'Won', 'Revenue', 'Cost per lead', 'Return']}
                rows={T.ads.map((r) => ({
                  key: r.id,
                  cells: [
                    <What key="w" r={r} tz={tz} acts onEdit={onEdit} />,
                    money(r.spend),
                    pct(r.clicks, r.impressions),
                    int(r.leads),
                    int(r.qualified),
                    int(r.bookings),
                    int(r.won),
                    money(r.revenue),
                    per(r.spend, r.leads),
                    <b key="x" className="text-ink">
                      {times(roas(r))}
                    </b>,
                  ],
                }))}
              />
            </>
          ) : null}
          {T.posts.length ? (
            <>
              <SecTitle title="Organic posts" count={T.posts.length} />
              <Table
                label="Organic posts"
                cols={['Post', 'Impressions', 'Reactions', 'Comments', 'Shares', 'Clicks', 'Engagement']}
                rows={T.posts.map((r) => {
                  const e = eng(r)
                  return {
                    key: r.id,
                    cells: [
                      <What key="w" r={r} tz={tz} acts onEdit={onEdit} />,
                      int(r.impressions),
                      int(r.reactions),
                      int(r.comments),
                      int(r.shares),
                      int(r.clicks),
                      <b key="e" className="text-ink">
                        {e !== null ? pct(e, r.impressions) : '–'}
                      </b>,
                    ],
                  }
                })}
              />
            </>
          ) : null}
        </>
      )}
    </>
  )
}

/** The landing pages' sign-ups by ad, with the spend matched by the code in the ad's name (v115AdTestHtml). */
function LpCard({ data }: { data: TestingData }) {
  const L = data.lp
  const head = (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
      <h2 className="font-display text-[20px] font-semibold text-ink">Sign-ups from your landing pages</h2>
      {L.pages.length ? <span className="text-[13px] text-ink-3">Last 30 days · spend matched by the code in the ad’s name</span> : null}
    </div>
  )
  if (L.error) {
    return (
      <section className="mb-4 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="lp-card">
        {head}
        <p className="text-[14px] text-bad">Could not load the landing pages: {L.error}</p>
      </section>
    )
  }
  if (!L.pages.length) {
    return (
      <section className="mb-4 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="lp-card">
        {head}
        <p className="text-[14px] text-ink-2">Put a landing page live and each ad gets a link and a code. Sign-ups and cost per sign-up show up here.</p>
        <Link href="/landing-pages?new=1" className={btn + ' mt-3'}>
          Put a page live
        </Link>
      </section>
    )
  }
  const rows = lpRows(L.pages, L.su, L.views, split(data.results).ads, data.now)
  return (
    <section className="mb-4 grid grid-cols-[minmax(0,1fr)] rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="lp-card">
      {head}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]" aria-label="Sign-ups from your landing pages">
          <thead>
            <tr className="border-b border-line text-left">
              {['Ad', 'Page', 'Visits', 'Sign-ups', 'Sign up', 'Spend', 'Per sign-up'].map((c, i) => (
                <th key={c} scope="col" className={TH + (i > 1 ? ' text-right' : '')}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0" data-testid="lp-row">
                <td className="px-3 py-2">
                  {r.code ? <Tag gold>{r.code}</Tag> : null} <span className="text-ink">{clip(r.hook, 70)}</span>
                </td>
                <td className="px-3 py-2 text-ink-2">{r.page}</td>
                <td className={RIGHT}>{r.visits}</td>
                <td className={RIGHT}>{r.signups}</td>
                <td className={RIGHT}>{r.visits ? Math.round((r.signups / r.visits) * 1000) / 10 + '%' : ''}</td>
                <td className={RIGHT}>{r.spend ? money(r.spend) : ''}</td>
                <td className={RIGHT}>{r.spend && r.signups ? money(r.spend / r.signups) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 border-t border-line pt-2">
        <Link href="/landing-pages" className={linkCls}>
          Landing pages
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

/** The leaderboard (nwTsBoardHtml): the leading ad, cost per lead as bars, every ad ranked, and the posts by engagement. */
function BoardTab({ results, tz, onLog }: { results: Result[]; tz: string | undefined; onLog: () => void }) {
  const T = split(results)
  const ads = rank(T.ads)
  const posts = postsByEngagement(T.posts)
  const ranked = ads.filter(isRanked)
  if (!ranked.length && !posts.length) {
    return (
      <Empty
        icon={<Layers size={30} aria-hidden="true" />}
        title="Nothing to rank yet"
        text="Log results with spend and leads and each ad is ranked by what a lead, a booked call or a client cost. Add revenue and it is ranked by return."
        action={
          <button type="button" className={btn} onClick={onLog}>
            <Plus size={15} aria-hidden="true" />
            Log a result
          </button>
        }
      />
    )
  }
  const lead: Ranked | undefined = ranked[0]
  const cpl = ads.filter((r) => r.cpl !== null).sort((a, b) => a.cpl! - b.cpl!)
  const max = Math.max(...cpl.map((r) => r.cpl!)) || 1
  return (
    <>
      {lead ? (
        <section className="rounded-lg border border-accent/40 bg-accent-soft/60 p-4" data-testid="leading">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">Leading now</p>
          <b className="mt-1 block text-[16px] font-semibold text-ink">{clip(noDash(lead.title), 110)}</b>
          <span className="text-[14px] text-ink-2">
            {[say(lead), lead.platform, lead.roas === null && lead.spend !== null ? money(lead.spend) + ' spent' : ''].filter(Boolean).join(' · ')}
          </span>
        </section>
      ) : null}
      {lead && cpl.length > 1 ? (
        <section className="mt-4 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="cpl-bars">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <h2 className="font-display text-[20px] font-semibold text-ink">Cost per lead</h2>
            <span className="text-[13px] text-ink-3">lower is better</span>
          </div>
          <ul className="grid gap-2">
            {cpl.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)] items-center gap-1 min-[641px]:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] min-[641px]:gap-3"
                title={r.title + ': ' + money(r.cpl) + ' per lead, ' + int(r.leads) + ' leads'}
              >
                <span className="truncate text-[13.5px] text-ink">{clip(noDash(r.title), 60)}</span>
                <span className="h-2.5 rounded-full bg-sunk" role="img" aria-label={money(r.cpl) + ' per lead'}>
                  <i className="block h-full rounded-full bg-accent" style={{ width: Math.max(3, Math.round((r.cpl! / max) * 100)) + '%' }} />
                </span>
                <b className="text-right text-[13.5px] tabular-nums text-ink">{money(r.cpl)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {ranked.length ? (
        <>
          <SecTitle title="Ads, ranked" extra={<Info k="board" />} />
          <Table
            label="Ads, ranked"
            minW={860}
            cols={['Ad', 'Spend', 'Leads', 'Booked calls', 'Won', 'Revenue', 'Cost per booked call', 'Return']}
            rows={ads.map((r, i) => ({
              key: r.id,
              lead: r === lead,
              cells: [
                <span key="w" className="flex gap-2">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunk text-[12px] font-semibold text-ink-2">{i + 1}</span>
                  <What r={r} tz={tz} />
                </span>,
                money(r.spend),
                int(r.leads),
                int(r.bookings),
                int(r.won),
                money(r.revenue),
                r.cpb !== null ? money(r.cpb) : '–',
                <b key="x" className="text-ink">
                  {times(r.roas)}
                </b>,
              ],
            }))}
          />
          <p className="mt-2 text-[13px] text-ink-3">
            Ranked by return on spend once revenue is logged, then by what a client won, a booked call, a qualified lead and a lead cost.
          </p>
        </>
      ) : null}
      {posts.length ? (
        <>
          <SecTitle title="Posts, by engagement" extra={<span className="text-[13px] text-ink-3">reactions, comments and shares over impressions</span>} />
          <Table
            label="Posts, by engagement"
            minW={600}
            cols={['Post', 'Impressions', 'Clicks', 'Engagement']}
            rows={posts.map((r, i) => ({
              key: r.id,
              cells: [
                <span key="w" className="flex gap-2">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunk text-[12px] font-semibold text-ink-2">{i + 1}</span>
                  <What r={r} tz={tz} />
                </span>,
                int(r.impressions),
                int(r.clicks),
                <b key="e" className="text-ink">
                  {pct(eng(r), r.impressions)}
                </b>,
              ],
            }))}
          />
        </>
      ) : null}
    </>
  )
}

