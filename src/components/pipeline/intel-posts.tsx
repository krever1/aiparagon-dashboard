'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, BarChart3, ChevronDown, Info, LayoutGrid, List, PenLine, Radar, Search } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'
import { dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { legacyUrl, pageBySlug } from '@/lib/nav'
import { FACTORS, type Five, type IntelItem, fmtN, longDay, platLabel, themeCounts, themeKey, themeLabel } from '@/lib/pipeline/intel'
import type { PostView, ReplyView } from '@/lib/pipeline/intel-load'
import { Avatar, Chip, Empty, Pill, Ring, Tag, ValPill, btn, inputCls, linkCls, primary, selectCls } from './bits'
import { InfoButton, type Limits, ScoreHow } from './intel-info'
import type { Ctx, Filters } from './intel-view'

// The Posts tab (nwIntelPostsHtml): every post the run read, as cards or a list, by value, theme, the brief it went
// into, and words; a post in full in a side panel (nwPostOpen); a five thing with the posts closest to it (nwFiveOpen).

const OUT_TIP = 'Opens in the current dashboard'
const legacy = (slug: string) => legacyUrl(LEGACY_DASHBOARD_URL, pageBySlug(slug))

/** In the brief (gold) or Not used, with why on hover. */
function CapTag({ p }: { p: PostView }) {
  if (p.cap !== 'in' && p.cap !== 'out') return null
  return (
    <Tag gold={p.cap === 'in'} title={p.short || undefined}>
      {p.cap === 'in' ? 'In the brief' : 'Not used'}
    </Tag>
  )
}

const n1 = (n: number | null, one: string, many: string) => fmtN(n) + ' ' + (Number(n) === 1 ? one : many)

/** The post as its platform shows it (nwPostEmbed). */
function Embed({ p, tz, onOpen }: { p: IntelItem; tz: string | undefined; onOpen?: () => void }) {
  const meta = [p.source === 'api_pull' ? 'Following' : 'Found by topic search', p.contentFormat, dayText(p.publishedAt, tz)].filter(Boolean).join(' · ')
  const counts = [
    p.likes !== null ? n1(p.likes, 'reaction', 'reactions') : '',
    p.comments !== null ? n1(p.comments, 'comment', 'comments') : '',
    p.shares !== null ? n1(p.shares, 'repost', 'reposts') : '',
  ].filter(Boolean)
  const body = (
    <>
      <span className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Post summary</span>
      <span className="mt-0.5 block text-[14px] leading-relaxed text-ink">{p.summary || p.headline}</span>
    </>
  )
  return (
    <div className="rounded-md border border-line bg-sunk/50 p-3">
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar name={p.who} />
        <span className="min-w-0 grow">
          <b className="block truncate text-[13.5px] text-ink">
            {p.who}
            {p.authorTitle ? <small className="font-normal text-ink-3"> · {p.authorTitle}</small> : null}
          </b>
          <small className="block truncate text-[12.5px] text-ink-3">{meta}</small>
        </span>
        <span className="shrink-0 text-[12.5px] text-ink-3">{platLabel(p.platform)}</span>
      </div>
      {onOpen ? (
        <button type="button" className="block w-full text-left" onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div>{body}</div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        {counts.length ? counts.map((c) => <span key={c}>{c}</span>) : <span>Engagement {p.eng ?? 0}</span>}
        {p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className={linkCls + ' ml-auto text-[12.5px]'}>
            View on {platLabel(p.platform)}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

/** The five parts as small bars (nwFactorsHtml). */
function Factors({ parts }: { parts: Record<string, number> }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {FACTORS.map((f) => {
        const v = parts[f.key]
        const has = v !== undefined && v !== null && Number.isFinite(v)
        return (
          <span key={f.key} className="min-w-0" title={f.label + ': ' + f.desc}>
            <span className="block truncate text-[11px] text-ink-3">{f.label.replace(/^(Buyer|Content|Source) /, '')}</span>
            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-line">
              <i className="block h-full rounded-full bg-accent" style={{ width: (has ? Math.max(0, Math.min(100, v)) : 0) + '%' }} />
            </span>
            <b className="text-[11.5px] text-ink-2">{has ? v : '–'}</b>
          </span>
        )
      })}
    </div>
  )
}

/** Why the score, else what is working, else why it matters (nwPostWhy). */
function Why({ p }: { p: IntelItem }) {
  if (p.scoreWhy)
    return (
      <p className="text-[13.5px] text-ink-2">
        <b>Why this score.</b> {p.scoreWhy}
      </p>
    )
  if (p.working)
    return (
      <p className="text-[13.5px] text-ink-2">
        <b>{p.val === 'low' ? 'Why it is low value.' : 'What is working.'}</b> {p.working}
      </p>
    )
  if (p.signal)
    return (
      <p className="text-[13.5px] text-ink-2">
        <b>Why it matters.</b> {clip220(p.signal)}
      </p>
    )
  return null
}
const clip220 = (s: string) => (s.length > 220 ? s.slice(0, 219).replace(/\s+\S*$/, '') + '…' : s)

function PostCard({ p, ctx }: { p: PostView; ctx: Ctx }) {
  const open = () => ctx.openPost(p.id)
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="post" data-id={p.id}>
      <div className="flex items-start gap-3">
        {p.score !== null ? (
          <button type="button" onClick={open} title="See the score" className="shrink-0">
            <Ring score={p.score} val={p.val} size={46} />
          </button>
        ) : null}
        <div className="min-w-0">
          <button type="button" onClick={open} className="text-left text-[15px] font-semibold leading-snug text-ink hover:underline">
            {p.head}
          </button>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <ValPill val={p.val} />
            <span className="text-[12.5px] text-ink-3">{fmtN(p.eng ?? 0)} engagement</span>
            <CapTag p={p} />
          </span>
        </div>
      </div>
      <Embed p={p} tz={ctx.tz} onOpen={open} />
      {p.parts ? <Factors parts={p.parts} /> : null}
      <Why p={p} />
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        {p.themes.length ? (
          p.themes.slice(0, 3).map((t) => (
            <button key={t} type="button" onClick={() => ctx.setF({ theme: themeKey(t), more: 12 })} className="rounded-sm bg-sunk px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-2 hover:bg-accent-soft hover:text-accent-text">
              {themeLabel(t)}
            </button>
          ))
        ) : (
          <span className="text-[12.5px] text-ink-3">No tracked theme</span>
        )}
        <button type="button" onClick={open} className={btn + ' ml-auto'}>
          <BarChart3 size={15} aria-hidden="true" />
          Full analysis
        </button>
      </div>
    </article>
  )
}

function capCell(p: PostView, tz: string | undefined) {
  if (p.cap === 'wait') return <span className="text-ink-3">…</span>
  if (p.cap === 'none') return <span className="text-ink-3">No brief</span>
  if (p.cap === 'out') return <span className="text-ink-3">Not used</span>
  return <span className="font-semibold text-good">{p.full?.brief ? longDay(p.full.brief.createdAt, tz) : ''}</span>
}

export function PostsTab({ ctx }: { ctx: Ctx }) {
  const { data, f, setF, tz } = ctx
  const [how, setHow] = useState(false)
  const items = data.posts
  const L = { read: data.schedule.read, keep: data.schedule.keep }
  const themes = themeCounts(items)
  const src = f.src !== null ? (data.five[f.src] ?? null) : null
  let list = items.slice()
  if (src) list = list.filter((i) => src.ids.includes(i.id))
  const cnt = { all: list.length, high: 0, medium: 0, low: 0 }
  for (const i of list) if (i.val) cnt[i.val]++
  if (f.val !== 'all') list = list.filter((i) => i.val === f.val)
  if (f.theme) list = list.filter((i) => i.themes.some((t) => themeKey(t) === f.theme))
  if (f.cap) list = list.filter((i) => (f.cap === 'in' ? i.cap === 'in' || i.cap === 'run' : i.cap === 'out'))
  if (f.q) {
    const q = f.q.toLowerCase()
    list = list.filter((i) => [i.head, i.summary, i.working, i.signal, i.who, i.themes.join(' ')].join(' ').toLowerCase().includes(q))
  }
  const rank = { high: 3, medium: 2, low: 1, '': 0 }
  list.sort(
    f.sort === 'eng'
      ? (a, b) => (b.eng ?? 0) - (a.eng ?? 0)
      : f.sort === 'new'
        ? (a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)
        : (a, b) => (b.score ?? -1) - (a.score ?? -1) || rank[b.val] - rank[a.val] || (b.eng ?? 0) - (a.eng ?? 0),
  )
  const shown = list.slice(0, f.more)
  const hasScore = items.some((i) => i.score !== null)
  const filtered = !!(f.theme || f.val !== 'all' || src || f.cap || f.q)
  const set = (p: Partial<Filters>) => setF({ ...p, more: 12 })

  if (!items.length) {
    if (data.itemsError) return <Empty icon={<Radar size={30} aria-hidden="true" />} title="Could not load this run" text={data.itemsError} />
    if (data.stats.read > 0) {
      return (
        <Empty
          icon={<Radar size={30} aria-hidden="true" />}
          title="The posts from this run are not stored"
          text={data.brief ? 'Its brief still has what the tracker found.' : 'Pick another run, or press Run now.'}
          action={
            data.brief ? (
              <button type="button" className={btn} onClick={() => ctx.goTab('takeaways')}>
                See the takeaways
              </button>
            ) : undefined
          }
        />
      )
    }
    return <Empty icon={<Radar size={30} aria-hidden="true" />} title="No posts in this run" text="Pick another run, or press Run now." />
  }

  return (
    <div data-testid="posts">
      {src ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-info-soft px-3 py-2 text-[14px] text-ink-2" data-testid="posts-src">
          <Info size={17} aria-hidden="true" className="text-info" />
          <span>
            Showing the {src.ids.length === 1 ? '1 post' : src.ids.length + ' posts'} closest to <b>{src.text}</b>.
          </span>
          <button type="button" className={linkCls + ' ml-auto'} onClick={() => set({ src: null })}>
            Show all posts
          </button>
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="posts-toolbar">
        <label className="relative inline-flex min-w-[200px] items-center">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-ink-3" />
          <input type="search" placeholder="Search posts" aria-label="Search posts" value={f.q} onChange={(e) => set({ q: e.target.value })} className={inputCls + ' py-1.5 pl-8 text-[13.5px]'} />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Value">
          {(
            [
              ['all', 'All'],
              ['high', 'High value'],
              ['medium', 'Medium'],
              ['low', 'Low value'],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} on={f.val === k} count={cnt[k]} onClick={() => set({ val: k })}>
              {l}
            </Chip>
          ))}
        </div>
        <select className={selectCls} aria-label="Theme" value={f.theme} onChange={(e) => set({ theme: e.target.value })}>
          <option value="">All themes</option>
          {themes.slice(0, 12).map((t) => (
            <option key={t.k} value={t.k}>
              {t.l} ({t.n})
            </option>
          ))}
        </select>
        {data.brief && data.capKnown ? (
          <select className={selectCls} aria-label="Captured in" value={f.cap} onChange={(e) => set({ cap: e.target.value as Filters['cap'] })}>
            <option value="">Captured in: all</option>
            <option value="in">{longDay(data.brief.createdAt, tz)}</option>
            <option value="out">Not used</option>
          </select>
        ) : null}
        <select className={selectCls} aria-label="Sort" value={f.sort} onChange={(e) => setF({ sort: e.target.value as Filters['sort'] })}>
          <option value="value">{hasScore ? 'Highest score' : 'Highest value'}</option>
          <option value="eng">Most engagement</option>
          <option value="new">Newest</option>
        </select>
        <span className="grow" />
        <button type="button" className={linkCls} onClick={() => setHow(true)}>
          <Info size={16} aria-hidden="true" />
          How ratings work
        </button>
        <span className="inline-flex rounded-sm border border-line" role="group" aria-label="View">
          <button type="button" aria-pressed={f.view === 'list'} title="List" onClick={() => setF({ view: 'list' })} className={`grid h-8 w-8 place-items-center ${f.view === 'list' ? 'bg-sunk text-ink' : 'text-ink-3'}`}>
            <List size={17} aria-hidden="true" />
          </button>
          <button type="button" aria-pressed={f.view === 'cards'} title="Cards" onClick={() => setF({ view: 'cards' })} className={`grid h-8 w-8 place-items-center ${f.view === 'cards' ? 'bg-sunk text-ink' : 'text-ink-3'}`}>
            <LayoutGrid size={17} aria-hidden="true" />
          </button>
        </span>
      </div>

      {!shown.length ? (
        <Empty
          icon={<Search size={30} aria-hidden="true" />}
          title="Nothing matches"
          text="Try another value or theme."
          action={
            <button type="button" className={btn} onClick={() => set({ val: 'all', theme: '', cap: '', q: '', src: null })}>
              Clear filters
            </button>
          }
        />
      ) : f.view === 'list' ? (
        <div className="relative overflow-x-auto rounded-lg border border-line bg-panel shadow-card">
          <table className="w-full min-w-[820px] text-left text-[13.5px]">
            <thead className="border-b border-line text-[12px] uppercase tracking-[0.06em] text-ink-3">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">Post</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Found by</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Value</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Engagement</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Themes</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Captured in
                  <InfoButton k="ocap" L={L} />
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-sunk/60" onClick={() => ctx.openPost(p.id)} data-testid="post-row">
                  <td className="px-3 py-2.5">
                    <b className="block font-semibold text-ink">{p.head}</b>
                    <span className="block text-[12.5px] text-ink-3">{p.who}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {p.source === 'api_pull' ? 'Following' : 'Topic search'}
                    <span className="block text-[12.5px] text-ink-3">{p.contentFormat}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      {p.score !== null ? <b className="text-ink">{p.score}</b> : null}
                      <ValPill val={p.val} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">{fmtN(p.eng ?? 0)}</td>
                  <td className="px-3 py-2.5">{p.themes.slice(0, 2).map(themeLabel).join(', ')}</td>
                  <td className="px-3 py-2.5">{capCell(p, tz)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{dayText(p.publishedAt, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[761px]:grid-cols-2 min-[1281px]:grid-cols-3">
          {shown.map((p) => (
            <PostCard key={p.id} p={p} ctx={ctx} />
          ))}
        </div>
      )}
      {list.length > shown.length ? (
        <button type="button" className={btn + ' mt-4'} onClick={() => setF({ more: f.more + 12 })}>
          Show {Math.min(12, list.length - shown.length)} more of {list.length}
        </button>
      ) : null}
      <p className="mt-3 text-[13px] text-ink-3" data-testid="posts-foot">
        {(filtered ? 'Showing ' + list.length + ' of ' : '') + (items.length === 1 ? '1 post' : items.length + ' posts') + ' read in this run.'}
        {hasScore ? '' : ' Each post is rated High, Medium or Low by the tracker.'}
      </p>
      {how ? <ScoreHow scored={hasScore} L={L} onClose={() => setHow(false)} /> : null}
    </div>
  )
}

function Sec({ h, children }: { h: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{h}</h4>
      {children}
    </section>
  )
}

/** A post in full (nwPostOpen): its score and parts, the analysis, why it is in the brief, its themes and replies. */
export function PostDrawer({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const { data, tz } = ctx
  const p = data.posts.find((x) => x.id === id)
  if (!p) return null
  return (
    <PostPanel
      p={p}
      runAt={data.runs.find((r) => r.runId === p.runId)?.at ?? ''}
      feeds={data.five.filter((x) => x.ids.includes(p.id))}
      reps={repliesFor(p, data.replies)}
      L={{ read: data.schedule.read, keep: data.schedule.keep }}
      tz={tz}
      briefHref={'/briefs?run=' + encodeURIComponent(p.runId)}
      onTheme={(k) => ctx.goTab('posts', { theme: k, more: 12 })}
      onReply={ctx.openReply}
      onClose={onClose}
    />
  )
}

/** A post's drafted replies: by the post's id, else by its link. */
export const repliesFor = (p: PostView, replies: ReplyView[]) =>
  replies.filter((d) => (d.itemId && d.itemId === p.id) || (d.sourceUrl && p.url && d.sourceUrl === p.url))

export type PostPanelProps = {
  p: PostView
  /** when its run finished */
  runAt: string
  /** the five things it feeds */
  feeds: Five[]
  reps: ReplyView[]
  /** the tracker's read and keep counts, for How posts are picked */
  L: Limits
  tz: string | undefined
  /** where Open the brief goes, when the post went into one */
  briefHref: string | null
  /** a theme chip: its posts */
  onTheme: (key: string) => void
  onReply: (r: ReplyView) => void
  onClose: () => void
}

/** A post in full (nwPostOpen): its score and factors, why it is in the brief or not, its takeaways and replies. */
export function PostPanel({ p, runAt, feeds, reps, L, tz, briefHref, onTheme, onReply, onClose }: PostPanelProps) {
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t)
      toast('Copied')
    } catch {
      toast('Could not copy here', 'warn')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      label="post-drawer"
      eyebrow={'Post · ' + dayText(runAt, tz) + ' run'}
      title={p.head}
      meta={
        <>
          <ValPill val={p.val} />
          <span className="text-[12.5px] text-ink-3">{fmtN(p.eng ?? 0)} engagement</span>
          <CapTag p={p} />
        </>
      }
      footer={
        <>
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className={btn}>
              View on {platLabel(p.platform)}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          ) : null}
          <a href={legacy('content-transformation')} title={OUT_TIP} className={primary}>
            <PenLine size={15} aria-hidden="true" />
            Write a post on this
          </a>
        </>
      }
    >
      <Embed p={p} tz={tz} />
      <Sec h="Value">
        {p.score !== null ? (
          <>
            <div className="flex items-center gap-3">
              <Ring score={p.score} val={p.val} size={64} />
              <div>
                <ValPill val={p.val} />
                <p className="mt-1 text-[13px] text-ink-3">{p.score} out of 100, weighted from five factors. High value is 70 or more.</p>
              </div>
            </div>
            {p.parts ? (
              <div className="mt-3 grid gap-2" data-testid="factors">
                {FACTORS.map((f) => {
                  const v = p.parts![f.key]
                  const has = v !== undefined && Number.isFinite(v)
                  return (
                    <div key={f.key}>
                      <div className="flex items-baseline gap-2 text-[13px]">
                        <b className="text-ink">{f.label}</b>
                        <span className="text-ink-3">{f.weight}% of score</span>
                        <span className="ml-auto font-semibold text-ink-2">{has ? ((v * f.weight) / 100).toFixed(1) + ' pts' : '–'}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 grow overflow-hidden rounded-full bg-line">
                          <i className="block h-full rounded-full bg-accent" style={{ width: (has ? v : 0) + '%' }} />
                        </span>
                        <b className="w-7 text-right text-[12.5px] text-ink-2">{has ? v : '–'}</b>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <ValPill val={p.val} />
            <p className="text-[13px] text-ink-3">
              Rated by the tracker for your buyers. {p.val === 'high' ? 'Worth acting on.' : p.val === 'medium' ? 'Useful context.' : 'Mostly off-topic for your buyers.'}
            </p>
          </div>
        )}
      </Sec>
      {p.scoreWhy || p.signal || p.working ? (
        <Sec h="Analysis">
          {p.scoreWhy ? <p className="mb-2 text-[14px] text-ink-2">{p.scoreWhy}</p> : null}
          {p.signal ? <p className="mb-2 text-[14px] text-ink-2">{p.signal}</p> : null}
          {p.working ? (
            <p className="text-[14px] text-ink-3">
              <b>What is working:</b> {p.working}
            </p>
          ) : null}
        </Sec>
      ) : null}
      {p.full ? (
        <section className="mt-5 rounded-md border border-line bg-sunk/50 p-3" data-testid="post-cap">
          <b className="text-[14px] text-ink">
            {p.full.head}
            <InfoButton k="opick" L={L} />
          </b>
          <ul className="mt-2 grid gap-1.5 text-[13.5px] text-ink-2">
            {p.full.lines.map((x) => (
              <li key={x.label}>
                <b className="text-ink">{x.label}:</b> {x.text}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-ink-3">
            {p.full.foot}{' '}
            {p.full.brief && briefHref ? (
              <Link href={briefHref} className={linkCls + ' text-[13px]'}>
                Open the brief
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </p>
        </section>
      ) : null}
      {p.themes.length ? (
        <Sec h="Themes">
          <div className="flex flex-wrap gap-1.5">
            {p.themes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onClose()
                  onTheme(themeKey(t))
                }}
                className="rounded-sm bg-sunk px-1.5 py-0.5 text-[12px] font-semibold text-ink-2 hover:bg-accent-soft hover:text-accent-text"
              >
                {themeLabel(t)}
              </button>
            ))}
          </div>
        </Sec>
      ) : null}
      {p.shift && p.shiftNote ? (
        <Sec h="A shift in language">
          <p className="border-l-2 border-accent pl-3 text-[14px] italic text-ink-2">{p.shiftNote}</p>
        </Sec>
      ) : null}
      {feeds.length ? (
        <Sec h="Feeds these takeaways">
          <ul className="grid gap-1.5 text-[14px] text-ink-2">
            {feeds.map((x) => (
              <li key={x.text}>
                {x.tag ? <Tag gold>{x.tag}</Tag> : null} {x.text}
              </li>
            ))}
          </ul>
        </Sec>
      ) : null}
      {reps.length || (p.opportunity && !/^none$/i.test(p.opportunity)) ? (
        <Sec h="Drafted reply">
          {reps.length ? (
            reps.map((d) => (
              <div key={d.id} className="mb-2 rounded-md border border-line p-3">
                <p className="text-[14px] text-ink">{d.draft}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Pill tone={d.status === 'approved' ? 'good' : d.status === 'rejected' ? 'bad' : 'warn'}>
                    {d.status === 'approved' ? 'Approved' : d.status === 'rejected' ? 'Rejected' : 'Waiting'}
                  </Pill>
                  <span className="grow" />
                  <button type="button" className={btn} onClick={() => void copy(d.draft)}>
                    Copy
                  </button>
                  {d.status === 'pending' ? (
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        onClose()
                        onReply(d)
                      }}
                    >
                      Edit and approve
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="text-[14px] text-ink-3">{p.opportunity}</p>
          )}
        </Sec>
      ) : null}
      {p.rawText ? (
        <details className="group mt-5 rounded-md border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[14px] font-semibold text-ink">
            Read the full post
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="whitespace-pre-line border-t border-line px-3 py-2 text-[14px] text-ink-2">{p.rawText}</div>
        </details>
      ) : null}
    </Drawer>
  )
}

/** A five thing and the posts closest to it (nwFiveOpen). */
export function FiveDrawer({ ctx, n, onClose, onPost }: { ctx: Ctx; n: number; onClose: () => void; onPost: (id: string) => void }) {
  const { data, tz } = ctx
  const f = data.five[n]
  if (!f) return null
  const runAt = data.runs.find((r) => r.runId === data.run)?.at ?? ''
  const posts = f.ids.map((id) => data.posts.find((p) => p.id === id)).filter((p): p is PostView => !!p)
  return (
    <Drawer
      open
      onClose={onClose}
      label="five-drawer"
      eyebrow={'Intel Tracker · ' + dayText(runAt, tz) + ' run'}
      title={f.text}
      meta={f.tag ? <Tag gold>{f.tag}</Tag> : undefined}
      footer={
        <>
          {posts.length ? (
            <button
              type="button"
              className={btn}
              onClick={() => {
                onClose()
                ctx.goTab('posts', { src: n, val: 'all', theme: '', more: 12 })
              }}
            >
              See them in Posts
            </button>
          ) : null}
          <a href={legacy('content-transformation')} title={OUT_TIP} className={primary}>
            <PenLine size={15} aria-hidden="true" />
            Write a post with this
          </a>
        </>
      }
    >
      {f.why ? (
        <Sec h="What the tracker saw">
          <p className="text-[14px] text-ink-2">{f.why}</p>
        </Sec>
      ) : null}
      <Sec h="Sources">
        {posts.length ? (
          <>
            <ul className="grid gap-1">
              {posts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPost(p.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-sunk">
                    {p.score !== null ? <Ring score={p.score} val={p.val} size={34} /> : <ValPill val={p.val} />}
                    <span className="min-w-0">
                      <b className="block truncate text-[14px] text-ink">{p.head}</b>
                      <small className="block truncate text-[12.5px] text-ink-3">
                        {[p.who, p.contentFormat, dayText(p.publishedAt, tz), fmtN(p.eng ?? 0) + ' engagement'].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-ink-3">
              Matched on the topic, the wording and any numbers in the point. The tracker writes each point from everything it read, so these are the
              closest posts, not a full list.
            </p>
          </>
        ) : (
          <p className="text-[14px] text-ink-3">
            No single post matches this point closely. It is drawn from across the {data.posts.length} posts read in this run.
          </p>
        )}
      </Sec>
    </Drawer>
  )
}

