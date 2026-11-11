'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, ChevronRight, FileText, MessageSquare, Play, Radar } from 'lucide-react'
import { undoItems } from '@/app/(app)/approvals/actions'
import { ReplyWindow, WhyWindow } from '@/components/approvals/reply-window'
import { ErrorNotice, Tabs } from '@/components/catalyst/bits'
import { Ago, dayText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import type { IntelData, ReplyView } from '@/lib/pipeline/intel-load'
import { whenText } from '@/lib/touchpoint/today'
import { primary, selectCls } from './bits'
import { spanText } from './dates'
import { FollowingTab } from './intel-following'
import { FiveDrawer, PostDrawer, PostsTab } from './intel-posts'
import { RunDialog } from './intel-run'
import { LibraryTab, RepliesTab, TakeawaysTab } from './intel-tabs'

// The Intel Tracker (v108 and the rounds after it): the run on screen with its posts, the replies the tracker drafted,
// the five things and themes, every run, and who and what it follows. The run is the address's (?run=), read on the
// server; the tab and the filters are the address's too (?tab= ?val= ?theme= ?cap= ?five=), kept in the browser.

export type Tab = 'posts' | 'replies' | 'takeaways' | 'library' | 'follow'
const TABS: readonly (readonly [Tab, string])[] = [
  ['posts', 'Posts'],
  ['replies', 'Replies'],
  ['takeaways', 'Takeaways & themes'],
  ['library', 'Run library'],
  ['follow', 'Following'],
]
/** The tab an address word asks for; the older "queue" is Replies. */
export function tabOf(v: string | null): Tab {
  const t = v === 'queue' ? 'replies' : v
  return TABS.find((x) => x[0] === t)?.[0] ?? 'posts'
}

export type Filters = {
  val: 'all' | 'high' | 'medium' | 'low'
  theme: string
  cap: '' | 'in' | 'out'
  /** the five thing whose closest posts are shown (V108.src) */
  src: number | null
  q: string
  sort: 'value' | 'eng' | 'new'
  view: 'cards' | 'list'
  more: number
}

export type Ctx = {
  data: IntelData
  /** UTC while the server draws the page, the viewer's own zone after */
  tz: string | undefined
  f: Filters
  setF: (p: Partial<Filters>) => void
  goTab: (t: Tab, p?: Partial<Filters>) => void
  openPost: (id: string) => void
  openFive: (n: number) => void
  openReply: (r: ReplyView) => void
  /** another run, with the tab and filters it opens on */
  pickRun: (run: string, tab?: Tab, p?: Partial<Filters>) => void
}

const VALS = ['all', 'high', 'medium', 'low'] as const

function filtersFrom(p: URLSearchParams): Filters {
  const val = VALS.find((v) => v === p.get('val')) ?? 'all'
  const cap = p.get('cap') === 'in' || p.get('cap') === 'out' ? (p.get('cap') as 'in' | 'out') : ''
  const five = Number(p.get('five'))
  return { val, theme: p.get('theme') ?? '', cap, src: p.get('five') !== null && five >= 0 && five < 5 ? Math.floor(five) : null, q: '', sort: 'value', view: 'cards', more: 12 }
}

/** The address for a run, a tab and its filters. The newest run needs no name, so a bare address follows new runs. */
function addressOf(run: string, latest: string, tab: Tab, f: Partial<Filters>): string {
  const u = new URLSearchParams()
  if (run && run !== latest) u.set('run', run)
  if (tab !== 'posts') u.set('tab', tab)
  if (tab === 'posts') {
    if (f.val && f.val !== 'all') u.set('val', f.val)
    if (f.theme) u.set('theme', f.theme)
    if (f.cap) u.set('cap', f.cap)
    if (f.src !== null && f.src !== undefined) u.set('five', String(f.src))
  }
  const q = u.toString()
  return '/intel-tracker' + (q ? '?' + q : '')
}

export function IntelView({ data }: { data: IntelData }) {
  const params = useSearchParams()
  const router = useRouter()
  const hydrated = useHydrated()
  const tz = hydrated ? undefined : 'UTC'
  const [tab, setTab] = useState<Tab>(() => tabOf(params.get('tab')))
  const [f, setFilters] = useState<Filters>(() => filtersFrom(params))
  const [post, setPost] = useState<string | null>(null)
  const [five, setFive] = useState<number | null>(null)
  const [reply, setReply] = useState<ReplyView | null>(null)
  const [why, setWhy] = useState<ReplyView | null>(null)
  const [runOpen, setRunOpen] = useState(false)

  // the tab and the filters live in the address, without a new history entry
  useEffect(() => {
    const want = addressOf(data.run, data.latest, tab, f)
    if (window.location.pathname + window.location.search !== want) window.history.replaceState(window.history.state, '', want)
  }, [data.run, data.latest, tab, f])

  const setF = (p: Partial<Filters>) => setFilters((x) => ({ ...x, ...p }))
  const goTab = (t: Tab, p?: Partial<Filters>) => {
    setTab(t)
    // another tab drops the five thing's posts (nwIntelGoTab)
    setFilters((x) => ({ ...x, ...(t !== 'posts' ? { src: null } : {}), ...(p ?? {}) }))
  }
  const pickRun = (run: string, t: Tab = tab, p: Partial<Filters> = {}) => {
    setPost(null)
    setFive(null)
    router.replace(addressOf(run, data.latest, t, { val: f.val, cap: f.cap, ...p }), { scroll: false })
  }
  const ctx: Ctx = { data, tz, f, setF, goTab, openPost: setPost, openFive: setFive, openReply: setReply, pickRun }

  const runs = data.runs
  const last = runs[0]
  const S = data.schedule
  const at = (run: string) => runs.find((r) => r.runId === run)?.at ?? ''
  const status: { tone: 'good' | 'bad' | 'info' | ''; node: React.ReactNode }[] = []
  if (data.pending.length) {
    status.push({
      tone: 'info',
      node: (
        <>
          A run started <Ago iso={new Date(data.pending[0].t).toISOString()} />
        </>
      ),
    })
  }
  if (last) status.push({ tone: last.ok ? 'good' : 'bad', node: (S.cadence === 'daily' ? 'Daily' : 'Weekly') + ' · last ran ' + whenText(last.at, tz) + (last.ok ? '' : ' and did not finish') })
  if (data.next) status.push({ tone: '', node: 'Next run ' + whenText(new Date(data.next).toISOString(), tz) })
  const w = data.brief?.window
  if (w) {
    status.push({
      tone: '',
      node: (data.run === last?.runId ? 'This run covers ' : 'The run of ' + dayText(at(data.run), tz) + ' covers ') + spanText(w.a, w.z, tz),
    })
  }
  const F = data.follow.counts
  const st = data.stats
  const stats: { n: number; label: string; go: () => void; key: string }[] = [
    { key: 'read', n: st.read, label: 'posts read', go: () => goTab('posts', { cap: '', val: 'all', src: null }) },
    ...(st.inb !== null ? [{ key: 'inb', n: st.inb, label: 'in the brief', go: () => goTab('posts', { cap: 'in', val: 'all', src: null }) }] : []),
    { key: 'high', n: st.high, label: 'high value', go: () => goTab('posts', { cap: '', val: 'high', src: null }) },
    { key: 'reps', n: st.reps, label: (st.reps === 1 ? 'reply' : 'replies') + ' drafted', go: () => goTab('replies') },
    { key: 'themes', n: st.themes, label: st.themes === 1 ? 'theme' : 'themes', go: () => goTab('takeaways') },
  ]
  const counts: Record<Tab, number | string> = {
    posts: data.posts.length,
    replies: data.replies.length,
    takeaways: '',
    library: runs.length,
    follow: F ? F.all : '',
  }

  return (
    <div data-testid="intel">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="intel-status">
        {status.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-[14px] text-ink-2">
            {s.tone ? (
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${s.tone === 'good' ? 'bg-good' : s.tone === 'bad' ? 'bg-bad' : 'animate-pulse bg-info'}`}
              />
            ) : null}
            {s.node}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {runs.length ? (
            <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-2">
              Run
              <select className={selectCls} aria-label="Pick a run" value={data.run} onChange={(e) => pickRun(e.target.value)}>
                {runs.slice(0, 30).map((r, i) => (
                  <option key={r.runId} value={r.runId}>
                    {dayText(r.at, tz) + (i === 0 ? ' · latest' : '')}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className={primary + ' px-3.5 py-2 text-[14px]'} onClick={() => setRunOpen(true)}>
            <Play size={16} aria-hidden="true" />
            Run now
          </button>
        </div>
      </div>

      <ul className="mb-4 flex flex-wrap gap-1.5" aria-label="What it does">
        {(
          [
            [Radar, 'Reads ' + (F ? F.people + F.companies + ' accounts and ' + F.topics + ' topics' : 'who and what you follow') + (S.cadence === 'daily' ? ' daily' : ' weekly')],
            [BarChart3, 'Rates every post'],
            [MessageSquare, 'Drafts replies for you'],
            [FileText, 'Feeds the organic brief'],
          ] as const
        ).map(([I, label]) => (
          <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12.5px] text-ink-2">
            <I size={13} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>

      <div className="mb-5 flex flex-wrap gap-2" data-testid="intel-stats">
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

      {data.error ? <ErrorNotice>Could not read everything the tracker found: {data.error}</ErrorNotice> : null}

      <Tabs
        label="Intel Tracker"
        tabs={TABS.map(([k, label]) => ({ key: k, label, count: counts[k] }))}
        active={tab}
        onPick={(t) => goTab(t)}
      />

      <div role="tabpanel" data-testid="intel-panel">
        {tab === 'posts' ? (
          <PostsTab ctx={ctx} />
        ) : tab === 'replies' ? (
          <RepliesTab ctx={ctx} />
        ) : tab === 'takeaways' ? (
          <TakeawaysTab ctx={ctx} />
        ) : tab === 'library' ? (
          <LibraryTab ctx={ctx} />
        ) : (
          <FollowingTab ctx={ctx} />
        )}
      </div>

      {post ? <PostDrawer ctx={ctx} id={post} onClose={() => setPost(null)} /> : null}
      {five !== null ? (
        <FiveDrawer
          ctx={ctx}
          n={five}
          onClose={() => setFive(null)}
          onPost={(id) => {
            setFive(null)
            setPost(id)
          }}
        />
      ) : null}
      {reply ? (
        <ReplyWindow
          reply={reply}
          onClose={() => setReply(null)}
          onReject={() => {
            setWhy(reply)
            setReply(null)
          }}
          onApproved={(done) => {
            setReply(null)
            toast('Approved', 'ok', {
              label: 'Undo',
              run: () =>
                void undoItems(done).then((r) =>
                  r.ok ? toast('Undone. It is waiting again.') : toast('Could not undo that: ' + r.error, 'warn'),
                ),
            })
          }}
        />
      ) : null}
      {why ? <WhyWindow reply={why} onClose={() => setWhy(null)} /> : null}
      {runOpen ? <RunDialog onClose={() => setRunOpen(false)} /> : null}
    </div>
  )
}
