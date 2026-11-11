'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, History, Lightbulb, MessageSquare, PenLine, Repeat2 } from 'lucide-react'
import { dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { legacyUrl, pageBySlug } from '@/lib/nav'
import { briefThemes, themeCounts } from '@/lib/pipeline/intel'
import { whenText } from '@/lib/touchpoint/today'
import { Avatar, Chip, Empty, Pill, Tag, btn, ghost, linkCls, primary } from './bits'
import { spanText } from './dates'
import type { Ctx } from './intel-view'

// The Intel Tracker's other tabs: the replies it drafted (nwIntelRepliesHtml), the five things and themes
// (nwIntelTakeHtml) and every run (nwIntelLibHtml).

const OUT_TIP = 'Opens in the current dashboard'
const legacy = (slug: string) => legacyUrl(LEGACY_DASHBOARD_URL, pageBySlug(slug))
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s)

// ---------- Replies ----------

type RF = 'all' | 'pending' | 'approved' | 'rejected'

export function RepliesTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const [rf, setRf] = useState<RF>('all')
  const [more, setMore] = useState(20)
  const R = data.replies
  const cnt: Record<RF, number> = { all: R.length, pending: 0, approved: 0, rejected: 0 }
  for (const d of R) if (d.status in cnt) cnt[d.status as RF]++
  const list = rf === 'all' ? R : R.filter((d) => d.status === rf)
  const shown = list.slice(0, more)
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t)
      toast('Copied')
    } catch {
      toast('Could not copy here', 'warn')
    }
  }
  return (
    <div data-testid="replies">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {(
            [
              ['all', 'All'],
              ['pending', 'Waiting'],
              ['approved', 'Approved'],
              ['rejected', 'Rejected'],
            ] as const
          ).map(([k, l]) => (
            <Chip
              key={k}
              on={rf === k}
              count={cnt[k]}
              onClick={() => {
                setRf(k)
                setMore(20)
              }}
            >
              {l}
            </Chip>
          ))}
        </div>
        <span className="grow" />
        <span className="text-[13px] text-ink-3">Drafted by the tracker on the posts it read. Nothing is posted for you.</span>
      </div>
      {shown.length ? (
        <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-card">
          {shown.map((d) => {
            const post = data.posts.find((p) => (d.itemId && p.id === d.itemId) || (d.sourceUrl && p.url === d.sourceUrl)) ?? null
            const who = d.competitor || post?.who || 'a post'
            return (
              <div key={d.id} className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 last:border-0" data-testid="reply" data-id={d.id}>
                <Avatar name={who} />
                <div className="min-w-0 grow basis-[320px]">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-[14px] text-ink">{(d.action === 'quote_post' ? 'Quote post on ' : 'Comment on ') + who + (/s$/.test(who) ? '’' : '’s') + ' post'}</b>
                    <Pill tone={d.status === 'approved' ? 'good' : d.status === 'rejected' ? 'bad' : 'warn'}>
                      {d.status === 'approved' ? 'Approved' : d.status === 'rejected' ? 'Rejected' : 'Waiting'}
                    </Pill>
                  </span>
                  <p className="mt-1 text-[14px] text-ink-2">{d.draft}</p>
                  {post ? (
                    <button type="button" onClick={() => ctx.openPost(post.id)} className="mt-1 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
                      <ArrowRight size={14} aria-hidden="true" />
                      <span>
                        Replying to: <b>{post.head}</b>
                      </span>
                    </button>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <button type="button" className={ghost} onClick={() => void copy(d.draft)}>
                    Copy
                  </button>
                  {/^https?:\/\//i.test(d.sourceUrl) ? (
                    <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className={btn}>
                      Open post
                    </a>
                  ) : null}
                  {d.status === 'pending' ? (
                    <button type="button" className={primary} onClick={() => ctx.openReply(d)}>
                      Review
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
          {list.length > shown.length ? (
            <button type="button" onClick={() => setMore(more + 20)} className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-[13.5px] font-semibold text-ink-2 hover:bg-sunk">
              Show more of {list.length}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : (
        <Empty icon={<MessageSquare size={30} aria-hidden="true" />} title="No replies here" text="The tracker drafts replies on the posts worth answering." />
      )}
    </div>
  )
}

// ---------- Takeaways and themes ----------

export function FiveCards({ ctx, onOpen }: { ctx: Ctx; onOpen: (n: number) => void }) {
  const { data } = ctx
  return (
    <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-5" data-testid="five">
      {data.five.map((f, n) => (
        <button key={n} type="button" onClick={() => onOpen(n)} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4 text-left shadow-card hover:border-line-2">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-ink-3">{n + 1}</span>
            {f.tag ? <Tag gold>{f.tag}</Tag> : null}
          </span>
          <b className="text-[14.5px] leading-snug text-ink">{f.text}</b>
          {f.why ? <span className="text-[13px] text-ink-3">{f.why}</span> : null}
          <span className={linkCls + ' mt-auto text-[13px]'}>
            {f.ids.length ? (f.ids.length === 1 ? '1 source' : f.ids.length + ' sources') : 'Read across the run'}
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  )
}

export function TakeawaysTab({ ctx }: { ctx: Ctx }) {
  const { data, tz } = ctx
  const items = data.posts
  const fromBrief = !items.length
  const themes = (fromBrief ? (data.brief?.topThemes ?? briefThemes([])) : themeCounts(items)).slice(0, 8)
  const max = themes.length ? themes[0].n || 1 : 1
  const b = data.brief
  return (
    <div data-testid="takeaways">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-[22px] font-semibold text-ink">Five things working</h2>
        <span className="text-[13px] text-ink-3">{b ? 'From the brief of ' + dayText(b.createdAt, tz) + ' · select one for its sources' : 'No brief for this run yet'}</span>
      </div>
      {data.five.length ? (
        <FiveCards ctx={ctx} onOpen={ctx.openFive} />
      ) : (
        <Empty icon={<Lightbulb size={30} aria-hidden="true" />} title="No takeaways for this run" text="They come with the organic brief the tracker writes." />
      )}
      <div className="mt-5 grid grid-cols-1 gap-4 min-[961px]:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="themes">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-[18px] font-semibold text-ink">Themes</h3>
            <span className="text-[13px] text-ink-3">{fromBrief ? 'posts per theme, as the brief counted them' : 'posts per theme, of ' + items.length + ' read'}</span>
          </div>
          {themes.length ? (
            <>
              <div className="grid gap-1">
                {themes.map((t) => {
                  const inner = (
                    <>
                      <span className="w-[38%] min-w-0 shrink-0 truncate text-[13.5px] text-ink">{t.l}</span>
                      <span className="h-2 grow overflow-hidden rounded-full bg-line">
                        <i className="block h-full rounded-full bg-accent" style={{ width: Math.round((t.n / max) * 100) + '%' }} />
                      </span>
                      <b className="w-8 text-right text-[13px] text-ink-2">{t.n}</b>
                    </>
                  )
                  return fromBrief ? (
                    <div key={t.k} className="flex items-center gap-2 px-2 py-1.5">
                      {inner}
                    </div>
                  ) : (
                    <button key={t.k} type="button" onClick={() => ctx.goTab('posts', { theme: t.k, more: 12, src: null })} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sunk">
                      {inner}
                      <ChevronRight size={16} aria-hidden="true" className="text-ink-3" />
                    </button>
                  )
                })}
              </div>
              {fromBrief ? null : <p className="mt-2 text-[13px] text-ink-3">Select a theme to see its posts.</p>}
            </>
          ) : (
            <p className="text-[14px] text-ink-3">No themes in this run.</p>
          )}
        </section>
        <section className="rounded-lg border border-line bg-panel p-4 shadow-card">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">Use it</p>
          <h3 className="mt-1 font-display text-[18px] font-semibold text-ink">
            {b ? 'These takeaways built the organic brief of ' + dayText(b.createdAt, tz) + '.' : 'Takeaways land with the organic brief.'}
          </h3>
          <p className="mt-1 text-[14px] text-ink-2">Approved briefs shape every new post, newsletter and email.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.five.length ? (
              <a href={legacy('content-transformation')} title={OUT_TIP} className={primary}>
                <PenLine size={15} aria-hidden="true" />
                Write a post
              </a>
            ) : null}
            {b ? (
              <Link href={'/briefs?run=' + encodeURIComponent(b.runId)} className={btn}>
                Open the brief
              </Link>
            ) : null}
          </div>
          {b?.shifts.length ? (
            <>
              <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Shifts in language</p>
              <div className="mt-1 grid gap-1">
                {b.shifts.map((s, i) => {
                  const p = items.find((x) => x.url && x.url === s.url)
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!p}
                      onClick={() => p && ctx.openPost(p.id)}
                      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left enabled:hover:bg-sunk disabled:cursor-default"
                    >
                      <Repeat2 size={17} aria-hidden="true" className="shrink-0 text-ink-3" />
                      <span className="min-w-0 grow">
                        <b className="block text-[13.5px] text-ink">{clip(s.note, 110)}</b>
                        <span className="block text-[12.5px] text-ink-3">Language shift{s.competitor ? ' · ' + s.competitor : ''}</span>
                      </span>
                      {p ? <ChevronRight size={16} aria-hidden="true" className="text-ink-3" /> : null}
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}

// ---------- Run library ----------

export function LibraryTab({ ctx }: { ctx: Ctx }) {
  const { data, tz } = ctx
  const L = data.library
  if (!L.length) return <Empty icon={<History size={30} aria-hidden="true" />} title="No runs yet" text="Runs show up here as they finish." />
  const A = data.across
  return (
    <div data-testid="library">
      <div className="grid grid-cols-1 gap-4 min-[761px]:grid-cols-2 min-[1281px]:grid-cols-3">
        {L.map((r, i) => {
          const cur = r.runId === data.run
          return (
            <section key={r.runId} className={`flex flex-col gap-2 rounded-lg border bg-panel p-4 shadow-card ${cur ? 'border-accent' : 'border-line'}`} data-testid="run-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{r.kind}</p>
                  <b className="block text-[15px] text-ink">{whenText(r.at, tz)}</b>
                  {r.window ? <span className="block text-[13px] text-ink-3">Covers {spanText(r.window.a, r.window.z, tz)}</span> : null}
                </div>
                <span className="flex flex-wrap gap-1.5">
                  {i === 0 ? <Tag gold>Latest</Tag> : cur ? <Tag gold>On screen</Tag> : null}
                  {r.ok ? null : <Pill tone="bad">Did not finish</Pill>}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-[13px] text-ink-3">
                {r.read !== null ? (
                  <span>
                    <b className="mr-1 font-display text-[18px] text-ink">{r.read}</b>read
                  </span>
                ) : null}
                {r.hv !== null ? (
                  <span>
                    <b className="mr-1 font-display text-[18px] text-ink">{r.hv}</b>high value
                  </span>
                ) : null}
                {r.rp !== null ? (
                  <span>
                    <b className="mr-1 font-display text-[18px] text-ink">{r.rp}</b>
                    {r.rp === 1 ? 'reply' : 'replies'}
                  </span>
                ) : null}
              </div>
              {r.themes.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {r.themes.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              ) : null}
              {r.lead ? (
                <p className="text-[13.5px] text-ink-2">
                  <b>Lead finding:</b> {r.lead}
                </p>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <button type="button" className={btn} onClick={() => (cur ? ctx.goTab('takeaways') : ctx.pickRun(r.runId, 'posts'))}>
                  {cur ? 'Open takeaways' : 'Open this run'}
                </button>
                {r.hasBrief ? (
                  <Link href={'/briefs?run=' + encodeURIComponent(r.runId)} className={ghost}>
                    Brief
                  </Link>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>
      {A ? (
        <section className="mt-5 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="across">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-[18px] font-semibold text-ink">Themes across runs</h3>
            <span className="text-[13px] text-ink-3">share of the posts in each brief</span>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13.5px]">
              <thead className="text-[12px] uppercase tracking-[0.06em] text-ink-3">
                <tr>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">
                    Theme
                  </th>
                  {A.runs.map((r) => (
                    <th key={r.runId} scope="col" className="px-2 py-2 text-right font-semibold">
                      {dayText(r.at, tz)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {A.rows.map((row) => (
                  <tr key={row.k} className="border-t border-line">
                    <td className="px-2 py-1.5 text-ink">{row.l}</td>
                    {row.cells.map((v, j) => (
                      <td key={j} className="px-2 py-1.5 text-right">
                        {v === null ? (
                          <span className="text-ink-3">–</span>
                        ) : (
                          <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => ctx.pickRun(A.runs[j].runId, 'posts', { theme: row.k })}>
                            {v}%
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
