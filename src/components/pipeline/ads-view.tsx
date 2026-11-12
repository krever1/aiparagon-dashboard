'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Check, ChevronRight, FileText, Megaphone, Play, Sparkles, Upload } from 'lucide-react'
import { suggestIndustries } from '@/app/(app)/ad-strategist/actions'
import { ErrorNotice, Tabs } from '@/components/catalyst/bits'
import { useNow } from '@/components/ui/clock'
import { Ago, dayText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import {
  type AdFilters, type AdTab, type AdView, type Cap, type SortKey, AD_TABS, NO_FILTERS, adTabOf, advertisers, capOfAd, fitOf, forAds, industryLine,
  industryOf, runPrefix, topN,
} from '@/lib/pipeline/ad-strategist'
import { runDateOf } from '@/lib/pipeline/ads'
import type { AdsData } from '@/lib/pipeline/ads-load'
import { uploadNames } from '@/lib/pipeline/uploads'
import { btn, ghost, primary } from './bits'
import { AdPanel } from './ads-panel'
import { FollowingTab, IndustriesDialog } from './ads-following'
import { ScoreHow } from './ads-info'
import { RunNowDialog } from './ads-run'
import { BriefWindow } from './brief-window'
import { CopyWindow } from './copy-window'
import { UploadWindow } from './upload-window'
import { AllTab, FiveDrawer, LibraryTab, TakeawaysTab, TopTab, UploadsTab } from './ads-tabs'

// The Ad Strategist (NW_PAGES['e3.ads'] as v109, v111 and v113 left it): the top ads, every ad with which brief it went
// into, the team's uploads, the five things of an ads brief, the runs, and who and what it follows. The tab, the open
// ad, the brief on the Takeaways tab and the All ads filters are the address's (?tab= ?ad= ?brief= ?st= ?adv= ?ind=
// ?run= ?cap= ?sort=); search starts afresh.

export type AllF = AdFilters & { sort: SortKey; dir: 1 | -1; more: number }

export type ACtx = {
  data: AdsData
  /** UTC while the server draws the page, the viewer's own zone after */
  tz: string | undefined
  now: number
  caps: Record<string, Cap>
  fitOf: (a: AdView) => { score: number; hits: string[] } | null
  byId: Map<string, AdView>
  f: AllF
  setF: (p: Partial<AllF>) => void
  goTab: (t: AdTab, p?: Partial<AllF>) => void
  openAd: (id: string) => void
  openFive: (n: number) => void
  /** another ads brief on the Takeaways tab (read on the server) */
  pickBrief: (run: string) => void
  openRun: () => void
  /** the upload window, building a brief from the uploads, and writing ad copy from them */
  openUpload: () => void
  openBrief: () => void
  openCopy: () => void
  openInd: () => void
  openHow: () => void
  runLabel: (run: string) => string
  top: number
  setTop: (n: number) => void
  ind: { busy: boolean; msg: string; missing: string[]; suggest: () => void }
}

const STS = ['all', 'live', 'up'] as const
const SORTS: readonly SortKey[] = ['ad', 'days', 'status', 'score', 'run', 'cap']

function filtersFrom(p: Pick<URLSearchParams, 'get'>): AllF {
  const st = STS.find((s) => s === p.get('st')) ?? 'all'
  const cap = p.get('cap') === 'in' || p.get('cap') === 'out' ? (p.get('cap') as 'in' | 'out') : ''
  const sort = SORTS.find((s) => s === p.get('sort')) ?? 'score'
  return { ...NO_FILTERS, st, cap, adv: p.get('adv') ?? '', ind: p.get('ind') ?? '', run: p.get('run') ?? '', sort, dir: sort === 'ad' ? 1 : -1, more: 20 }
}

/** The address for a tab, the open ad, the Takeaways brief and the All ads filters. The newest brief needs no name. */
function addressOf(tab: AdTab, ad: string | null, brief: string, newest: string, f: AllF): string {
  const u = new URLSearchParams()
  if (tab !== 'top') u.set('tab', tab)
  if (brief && brief !== newest) u.set('brief', brief)
  if (tab === 'all') {
    if (f.st !== 'all') u.set('st', f.st)
    if (f.adv) u.set('adv', f.adv)
    if (f.ind) u.set('ind', f.ind)
    if (f.run) u.set('run', f.run)
    if (f.cap) u.set('cap', f.cap)
    if (f.sort !== 'score') u.set('sort', f.sort)
  }
  if (ad) u.set('ad', ad)
  const q = u.toString()
  return '/ad-strategist' + (q ? '?' + q : '')
}

export function AdsView({ data }: { data: AdsData }) {
  const params = useSearchParams()
  const router = useRouter()
  const hydrated = useHydrated()
  const tz = hydrated ? undefined : 'UTC'
  const now = useNow(data.now)
  const [tab, setTab] = useState<AdTab>(() => adTabOf(params.get('tab')))
  // a run with no ads among those read shows the ads in a brief instead (nwBrAdsOf)
  const fromAddress = (p: Pick<URLSearchParams, 'get'>): AllF => {
    const x = filtersFrom(p)
    return x.run && !data.pool.some((a) => a.runId === x.run) ? { ...x, run: '', cap: 'in' } : x
  }
  const [f, setFilters] = useState<AllF>(() => fromAddress(params))
  const [adId, setAdId] = useState<string | null>(() => params.get('ad'))
  const [five, setFive] = useState<number | null>(null)
  const [top, setTop] = useState(0)
  const [runOpen, setRunOpen] = useState(false)
  const [win, setWin] = useState<'' | 'upload' | 'brief' | 'copy'>('')
  const [indOpen, setIndOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [indBusy, setIndBusy] = useState(false)
  const [indMsg, setIndMsg] = useState('')

  const newest = data.briefs[0]?.runId ?? ''
  const brief = data.take?.runId ?? ''

  // Next.js keeps the last pages alive (React Activity), so a link back here brings this page back as it was. An
  // address that asks for something else (a tab, a run, an ad) wins; a bare one keeps the page as it was, as the old
  // dashboard kept its tab and filters for the session.
  const sp = params.toString()
  const [seenSp, setSeenSp] = useState(sp)
  if (sp !== seenSp) {
    setSeenSp(sp)
    if (sp && '/ad-strategist?' + sp !== addressOf(tab, adId, brief, newest, f)) {
      setTab(adTabOf(params.get('tab')))
      setFilters(fromAddress(params))
      setAdId(params.get('ad'))
      setFive(null)
    }
  }
  const every = useMemo(() => (data.extra ? [...data.pool, data.extra] : data.pool), [data.pool, data.extra])
  const byId = useMemo(() => new Map(every.map((a) => [a.id, a])), [every])
  const caps = useMemo(() => Object.fromEntries(every.map((a) => [a.id, capOfAd(a, data.cap)])), [every, data.cap])
  const fit = useCallback((a: AdView) => fitOf(a, data.fit), [data.fit])
  const missing = useMemo(() => advertisers(data.pool).filter((n) => !industryOf(data.ind, n)), [data.pool, data.ind])
  // whose ad it is, suggested from the accounts followed and the advertisers already seen
  const suggestNames = useMemo(() => uploadNames(data.follows.map((c) => c.name), advertisers(data.pool)), [data.follows, data.pool])

  // the tab, the open ad and the filters live in the address, without a new history entry
  useEffect(() => {
    const want = addressOf(tab, adId, brief, newest, f)
    if (window.location.pathname + window.location.search !== want) window.history.replaceState(null, '', want)
    // sp: a page refresh from an action can put back the address the page had when the action started
  }, [tab, adId, brief, newest, f, sp])

  // an ad asked for in the address that is not among the ads read
  const lost = adId && !byId.has(adId)
  useEffect(() => {
    if (lost) toast('Could not find that ad. It may have been removed.', 'warn')
  }, [lost])

  const suggest = useCallback(
    async (reopen = false) => {
      setIndBusy(true)
      setIndMsg('')
      const r = await suggestIndustries().catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
      setIndBusy(false)
      setIndMsg(r.ok ? r.message : r.error)
      if (reopen) setIndOpen(true)
    },
    [],
  )

  // once per browser tab, as the old page did once per page load: the agent works out the industries nobody set
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current || !missing.length) return
    asked.current = true
    try {
      if (window.sessionStorage.getItem('ap.ads.indAuto')) return
      window.sessionStorage.setItem('ap.ads.indAuto', '1')
    } catch {
      return
    }
    void Promise.resolve().then(() => suggest())
  }, [missing.length, suggest])

  const setF = (p: Partial<AllF>) => setFilters((x) => ({ ...x, ...p }))
  const goTab = (t: AdTab, p?: Partial<AllF>) => {
    setTab(t)
    // a filter from a number or a run starts the list afresh, search included (the old page kept the search)
    if (p) setFilters((x) => ({ ...x, ind: '', q: '', more: 20, ...p }))
  }
  const pickBrief = (run: string) => {
    setFive(null)
    router.replace(addressOf('takeaways', null, run, newest, f), { scroll: false })
  }

  const runLabel = (run: string) => {
    if (!run) return ''
    const at = data.runs.find((r) => r.runId === run)?.at || runDateOf(run)
    if (!at) return run
    const day = dayText(at, tz)
    const same = data.runs.some((r) => r.runId !== run && dayText(r.at, tz) === day)
    const time = new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    return runPrefix(run) + day + (same ? ', ' + time : '')
  }

  const ctx: ACtx = {
    data,
    tz,
    now,
    caps,
    fitOf: fit,
    byId,
    f,
    setF,
    goTab,
    openAd: setAdId,
    openFive: setFive,
    pickBrief,
    openRun: () => setRunOpen(true),
    openUpload: () => setWin('upload'),
    openBrief: () => setWin('brief'),
    openCopy: () => setWin('copy'),
    openInd: () => setIndOpen(true),
    openHow: () => setHowOpen(true),
    runLabel,
    top: topN(top || null, data.schedule.top),
    setTop,
    ind: { busy: indBusy, msg: indMsg, missing, suggest: () => void suggest() },
  }

  const P = data.pool
  const ups = P.filter((a) => a.up || a.sw).length
  const advs = new Set(P.map((a) => a.adv.toLowerCase())).size
  const inBrief = P.filter((a) => caps[a.id]?.st === 'in').length
  const forAdsN = data.follows.filter((c) => c.status !== 'denied' && forAds(c)).length

  // the header's status: a run started from here, the last run, and when it runs (nwAdsHead)
  const last = data.runs[0]
  const status: { tone: 'good' | 'warn' | 'bad' | 'info' | ''; node: ReactNode }[] = []
  if (data.pending) {
    status.push({
      tone: 'info',
      node: (
        <>
          A run started <Ago iso={new Date(data.pending.t).toISOString()} />
        </>
      ),
    })
  }
  if (last) {
    const d = Math.floor((now - (Date.parse(last.at) || now)) / 864e5)
    const rel = d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'
    status.push({
      tone: last.running ? 'info' : !last.ok ? 'bad' : d > 21 ? 'warn' : 'good',
      node: 'Last run ' + dayText(last.at, tz) + ', ' + rel + (last.running ? ', still running' : last.ok ? '' : ' and did not finish'),
    })
  } else status.push({ tone: 'warn', node: 'No runs yet' })
  status.push({ tone: '', node: data.schedule.afterIntel ? 'Runs after each Intel Tracker run' : 'Runs on its own schedule' })

  const stats: { key: string; n: number; label: string; go: () => void }[] = P.length || !data.poolError
    ? [
        { key: 'all', n: P.length, label: 'ads tracked', go: () => goTab('all', { st: 'all', run: '', adv: '', cap: '' }) },
        { key: 'in', n: inBrief, label: 'in a brief', go: () => goTab('all', { st: 'all', run: '', adv: '', cap: 'in' }) },
        { key: 'live', n: P.filter((a) => a.act && !a.up).length, label: 'still running', go: () => goTab('all', { st: 'live', run: '', adv: '', cap: '' }) },
        { key: 'up', n: ups, label: 'uploaded by your team', go: () => goTab('uploads') },
        { key: 'adv', n: advs, label: advs === 1 ? 'advertiser' : 'advertisers', go: () => goTab('all', { st: 'all', run: '', adv: '', cap: '' }) },
      ]
    : []

  const counts: Record<AdTab, number | string> = {
    top: '',
    all: P.length,
    uploads: ups,
    takeaways: '',
    library: data.runs.length,
    following: data.followsError ? '' : forAdsN,
  }
  const open = adId ? byId.get(adId) : undefined

  return (
    <div data-testid="ads">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="ads-status">
        {status.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-[14px] text-ink-2">
            {s.tone ? (
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  s.tone === 'good' ? 'bg-good' : s.tone === 'bad' ? 'bg-bad' : s.tone === 'warn' ? 'bg-warn' : 'animate-pulse bg-info'
                }`}
              />
            ) : null}
            {s.node}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={btn + ' px-3.5 py-2 text-[14px]'} onClick={() => setWin('upload')}>
            <Upload size={16} aria-hidden="true" />
            Upload ads
          </button>
          <button type="button" className={primary + ' px-3.5 py-2 text-[14px]'} onClick={() => setRunOpen(true)}>
            <Play size={16} aria-hidden="true" />
            Run now
          </button>
        </div>
      </div>

      <ul className="mb-4 flex flex-wrap gap-1.5" aria-label="What it does">
        {(
          [
            [Megaphone, 'Finds long-running competitor ads'],
            [Upload, 'Reads ads you upload'],
            [FileText, 'Feeds the ads brief'],
          ] as const
        ).map(([I, label]) => (
          <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12.5px] text-ink-2">
            <I size={13} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>

      {stats.length ? (
        <div className="mb-5 flex flex-wrap gap-2" data-testid="ads-stats">
          {stats.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={s.go}
              className="inline-flex items-baseline gap-1.5 rounded-md border border-line bg-panel px-3.5 py-2 text-left text-[13.5px] text-ink-2 hover:border-line-2"
            >
              <b className="font-display text-[20px] font-semibold text-ink">{s.n}</b>
              {s.label}
              <ChevronRight size={14} aria-hidden="true" className="self-center text-ink-3" />
            </button>
          ))}
        </div>
      ) : null}

      {data.poolError ? <ErrorNotice>Could not load the ads: {data.poolError}</ErrorNotice> : null}

      {(tab === 'top' || tab === 'all') && P.length ? <IndBanner ctx={ctx} /> : null}

      <Tabs
        label="Ad Strategist"
        tabs={AD_TABS.map(([k, label]) => ({ key: k, label: k === 'top' ? 'Top ' + ctx.top : label, count: counts[k] }))}
        active={tab}
        onPick={(t) => goTab(t)}
      />

      <div role="tabpanel" data-testid="ads-panel">
        {tab === 'top' ? (
          <TopTab ctx={ctx} />
        ) : tab === 'all' ? (
          <AllTab ctx={ctx} />
        ) : tab === 'uploads' ? (
          <UploadsTab ctx={ctx} />
        ) : tab === 'takeaways' ? (
          <TakeawaysTab ctx={ctx} />
        ) : tab === 'library' ? (
          <LibraryTab ctx={ctx} />
        ) : (
          <FollowingTab ctx={ctx} />
        )}
      </div>

      {open ? (
        <AdPanel
          key={open.id}
          ctx={ctx}
          a={open}
          onClose={() => setAdId(null)}
          onFollowing={() => {
            setAdId(null)
            goTab('following')
          }}
          onIndustries={() => {
            setAdId(null)
            setIndOpen(true)
          }}
        />
      ) : null}
      {five !== null && data.take ? (
        <FiveDrawer
          ctx={ctx}
          n={five}
          onClose={() => setFive(null)}
          onAd={(id) => {
            setFive(null)
            setAdId(id)
          }}
        />
      ) : null}
      {runOpen ? (
        <RunNowDialog
          ctx={ctx}
          onClose={() => setRunOpen(false)}
          onPick={() => {
            setRunOpen(false)
            setWin('brief')
          }}
        />
      ) : null}
      {win === 'upload' ? (
        <UploadWindow
          names={suggestNames}
          follows={data.follows}
          onClose={() => setWin('')}
          onDone={(id) => {
            setWin('')
            goTab('uploads')
            setAdId(id)
          }}
        />
      ) : null}
      {win === 'brief' ? <BriefWindow onClose={() => setWin('')} /> : null}
      {win === 'copy' ? <CopyWindow onClose={() => setWin('')} /> : null}
      {indOpen ? (
        <IndustriesDialog
          ctx={ctx}
          onClose={() => setIndOpen(false)}
          onSuggest={() => {
            setIndOpen(false)
            void suggest(true)
          }}
        />
      ) : null}
      {howOpen ? <ScoreHow onClose={() => setHowOpen(false)} /> : null}
    </div>
  )
}

/** The industries banner on Top and All ads (v111's nwAdsIndBanner). */
function IndBanner({ ctx }: { ctx: ACtx }) {
  const total = advertisers(ctx.data.pool).length
  const { busy, msg, missing } = ctx.ind
  if (!total) return null
  if (busy) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2.5 text-[14px] text-ink-2" role="status" data-testid="ind-banner">
        <Sparkles size={17} aria-hidden="true" className="shrink-0 animate-pulse text-accent-text" />
        <span>
          <b className="text-ink">Working out industries</b> for {missing.length === 1 ? '1 advertiser' : missing.length + ' advertisers'}…
        </span>
      </div>
    )
  }
  if (!missing.length) {
    if (!/suggested/.test(msg)) return null
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel px-3 py-2.5 text-[14px] text-ink-2" data-testid="ind-banner">
        <Check size={17} aria-hidden="true" className="shrink-0 text-good" />
        <span className="min-w-0 grow">{msg}</span>
        <button type="button" className={btn} onClick={ctx.openInd}>
          Review them
        </button>
      </div>
    )
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[14px] text-ink-2" data-testid="ind-banner">
      <AlertTriangle size={17} aria-hidden="true" className="shrink-0 text-warn" />
      <span className="min-w-0 grow">
        <b className="text-ink">{industryLine(total, missing.length)}</b> {msg || 'The agent can work them out from the ads.'}
      </span>
      <span className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={ctx.ind.suggest}>
          <Sparkles size={14} aria-hidden="true" />
          Suggest them
        </button>
        <button type="button" className={ghost} onClick={ctx.openInd}>
          Set by hand
        </button>
      </span>
    </div>
  )
}
