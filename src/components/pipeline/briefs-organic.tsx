'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ArrowUpRight, ChevronDown, Info, PenLine, Radar, Repeat } from 'lucide-react'
import { undoItems } from '@/app/(app)/approvals/actions'
import { ReplyWindow, WhyWindow } from '@/components/approvals/reply-window'
import { Drawer } from '@/components/ui/drawer'
import { dateText, dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type Kind, ADDED, RAIL, devsShown, fiveHeading, optOf } from '@/lib/pipeline/briefs'
import type { OrgTab } from '@/lib/pipeline/briefs-load'
import { fmtN, platLabel, themeKey, themeLabel } from '@/lib/pipeline/intel'
import type { PostView, ReplyView } from '@/lib/pipeline/intel-load'
import { Empty, Ring, Tag, ValPill, btn, linkCls, primary } from './bits'
import { AddedSec, type BCtx, EditedLine, Glance, type MetaItem, OUT_TIP, Rail, RecordBar, ReviewCard, Sec, legacy } from './briefs-parts'
import { spanText } from './dates'
import { InfoButton } from './intel-info'
import { PostPanel, repliesFor } from './intel-posts'
import { IndustryDialog } from './intel-following'

// The Organic tab (nwBrOrgHtml as v110 and v111 left it): the record bar, the five things with the posts behind each,
// the short version, what changed, notable developments, themes and topic watch, the content handoff, the posts behind
// the brief, and the review. The team's layout picks which sections show, in what order and how many of each; a post
// opens in the Intel Tracker's post panel.

const KIND: Kind = 'org'
/** A link a brief gives that may be opened: a web address only. */
const WEB = /^https?:\/\//i
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)

export function OrgTabView({ ctx }: { ctx: BCtx }) {
  const o = ctx.data.org
  if (!o) {
    return (
      <Empty
        icon={<Radar size={30} aria-hidden="true" />}
        title="No organic brief yet"
        text="The Intel Tracker writes one each time it runs."
        action={
          <Link href="/intel-tracker" className={btn}>
            Open the Intel Tracker
          </Link>
        }
      />
    )
  }
  return <OrgBrief key={o.runId} ctx={ctx} o={o} />
}

function OrgBrief({ ctx, o }: { ctx: BCtx; o: OrgTab }) {
  const router = useRouter()
  const { tz, data } = ctx
  const L = data.layout.org
  const hidden = new Set(o.review?.hidden ?? [])
  const show = (k: string) => !L.off.includes(k) && !hidden.has(k)
  const [post, setPost] = useState<string | null>(null)
  const [five, setFive] = useState<number | null>(null)
  const [reply, setReply] = useState<ReplyView | null>(null)
  const [why, setWhy] = useState<ReplyView | null>(null)
  const [industry, setIndustry] = useState(false)

  const byId = useMemo(() => new Map(o.posts.map((p) => [p.id, p])), [o.posts])
  const byUrl = useMemo(() => new Map(o.posts.filter((p) => p.url).map((p) => [p.url, p])), [o.posts])
  const recOf = (url: string) => o.evidence.find((e) => e.url && e.url === url)?.rec ?? ''
  const day = dayText(o.createdAt, tz)
  const title = 'Organic brief · ' + day

  const fiveN = Number(optOf(L, KIND, 'five', 'n')) || 5
  const fiveWhy = optOf(L, KIND, 'five', 'why') === 'full'
  const fives = show('five') ? o.five.slice(0, fiveN) : []
  const main = L.order.filter((k) => k !== 'rec' && k !== 'five' && k !== 'review' && show(k))

  // a post the brief points at: its panel when the run kept it, else its own page
  const openUrl = (url: string) => {
    const p = byUrl.get(url)
    if (p) setPost(p.id)
    else if (WEB.test(url)) window.open(url, '_blank', 'noopener')
  }

  const sections: { id: string; label: string; node: React.ReactNode }[] = []
  for (const k of main) {
    const node =
      k === 'short' ? (
        <Short key={k} o={o} />
      ) : k === 'shift' ? (
        o.shifts.length ? (
          <Shifts key={k} o={o} n={optOf(L, KIND, 'shift', 'n')} recOf={recOf} onPost={(url) => openUrl(url)} />
        ) : null
      ) : k === 'dev' ? (
        o.devs.length ? (
          <Devs key={k} o={o} per={optOf(L, KIND, 'dev', 'n')} />
        ) : null
      ) : k === 'themes' ? (
        o.themes.length || (o.watch.length && optOf(L, KIND, 'themes', 'tw') === 'on') ? (
          <Themes key={k} o={o} watch={optOf(L, KIND, 'themes', 'tw') === 'on'} />
        ) : null
      ) : k === 'hand' ? (
        <Handoff key={k} />
      ) : k === 'ev' ? (
        o.evidence.length ? (
          <Evidence key={k} o={o} n={optOf(L, KIND, 'ev', 'n')} onRow={(url, postId) => (postId ? setPost(postId) : WEB.test(url) ? window.open(url, '_blank', 'noopener') : null)} />
        ) : null
      ) : k in ADDED.org ? (
        <AddedSec key={k} id={k} name={ADDED.org[k]} />
      ) : null
    if (node) sections.push({ id: k, label: RAIL.org[k] ?? ADDED.org[k] ?? k, node })
  }
  const versions = o.versions.map((v, i) => ({
    run: v.runId,
    label: dayText(v.createdAt, tz) + (v.custom ? ' · custom run' : '') + (i === 0 ? ' · newest' : '') + (v.edited ? ' · edited' : ''),
  }))
  const meta: (MetaItem | null)[] = [
    { label: 'Published', value: dateText(o.createdAt, tz) },
    o.window ? { label: 'Period', value: spanText(o.window.a, o.window.z, tz) } : null,
    { label: 'Agent', value: 'Intel Tracker' + (o.custom ? ', custom run' : '') },
    { label: 'For', value: 'Thought leadership, newsletters, email' },
    o.industry
      ? {
          label: 'Industry',
          value: (
            <>
              {o.industry}{' '}
              <button type="button" onClick={() => setIndustry(true)} className={linkCls + ' text-[13px]'}>
                Change
              </button>
            </>
          ),
        }
      : null,
  ]

  const rail = [...(fives.length ? [{ id: 'five', label: RAIL.org.five }] : []), ...sections.map((s) => ({ id: s.id, label: s.label })), { id: 'review', label: RAIL.org.review }]
  const p = post ? byId.get(post) : undefined

  return (
    <>
      <RecordBar
        ctx={ctx}
        kind={KIND}
        title={title}
        meta={meta.filter((m): m is MetaItem => !!m && m.value !== '')}
        versions={versions}
        run={o.runId}
        state={o.state}
        editedLine={o.review ? <EditedLine by={o.review.by} at={o.review.at} original={o.review.original} tz={tz} /> : null}
      />
      <p className="mb-4 flex items-start gap-2 rounded-md border border-info/20 bg-info-soft px-3 py-2.5 text-[14px] text-ink-2">
        <Info size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
        <span>
          <b className="text-ink">Evidence note.</b> Engagement counts are observed on the source posts. Themes and angles are the agent’s reading. Check any outside
          figure before you quote it.
        </span>
      </p>
      {o.postsError ? <p className="mb-4 text-[13.5px] text-bad">Could not read this run’s posts: {o.postsError}</p> : null}

      {fives.length ? (
        <section id="br-five" className="mb-4 scroll-mt-24" data-testid="brief-five" aria-label={fiveHeading(fives.length)}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[22px] font-semibold text-ink">{fiveHeading(fives.length)}</h2>
            <span className="text-[13px] text-ink-3">Select one for what the agent saw and its sources</span>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-5">
            {fives.map((f, i) => (
              <button key={i} type="button" onClick={() => setFive(i)} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-panel p-3.5 text-left shadow-card hover:border-line-2">
                <span className="text-[12px] font-semibold text-ink-3">{i + 1}</span>
                {f.tag ? <Tag gold>{f.tag}</Tag> : null}
                <b className="text-[14.5px] font-semibold leading-snug text-ink">{f.text}</b>
                {fiveWhy && f.why ? <small className="text-[13px] text-ink-2">{f.why}</small> : null}
                <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[13px] font-semibold text-accent-text">
                  {f.ids.length ? plural(f.ids.length, 'source') : 'Read across the run'}
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 min-[1081px]:grid-cols-[minmax(0,1fr)_270px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          {sections.map((s) => s.node)}
          <ReviewCard ctx={ctx} kind={KIND} run={o.runId} title={title} state={o.state} decision={o.decision} />
        </div>
        <div className="max-[1080px]:order-first">
          <Rail
            items={rail}
            glance={
              <Glance
                testid="brief-glance"
                title="Evidence at a glance"
                rows={o.glance}
                note="Engagement is counted on the source posts. It does not measure your own content."
              />
            }
          />
        </div>
      </div>

      {five !== null && fives[five] ? (
        <OrgFiveDrawer
          o={o}
          n={five}
          tz={tz}
          recOf={recOf}
          onClose={() => setFive(null)}
          onPost={(id) => {
            setFive(null)
            setPost(id)
          }}
        />
      ) : null}
      {p ? (
        <PostPanel
          p={p}
          runAt={o.runAt}
          feeds={o.five.filter((x) => x.ids.includes(p.id))}
          reps={repliesFor(p, o.replies)}
          L={o.limits}
          tz={tz}
          briefHref={null}
          onTheme={(k) => router.push('/intel-tracker?run=' + encodeURIComponent(o.runId) + '&theme=' + encodeURIComponent(k))}
          onReply={setReply}
          onClose={() => setPost(null)}
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
              run: () => void undoItems(done).then((r) => (r.ok ? toast('Undone. It is waiting again.') : toast('Could not undo that: ' + r.error, 'warn'))),
            })
          }}
        />
      ) : null}
      {why ? <WhyWindow reply={why} onClose={() => setWhy(null)} /> : null}
      {industry ? <IndustryDialog industry={data.profile.industry || o.industry} market={data.profile.targetMarket} onClose={() => setIndustry(false)} followLink /> : null}
    </>
  )
}

/** The short version: the brief's TL;DR, a line each. */
function Short({ o }: { o: OrgTab }) {
  return (
    <Sec id="short" kicker="The short version · 1 minute">
      {o.short.length ? (
        <div className="grid gap-2 text-[14.5px] leading-relaxed text-ink-2">
          {o.short.map((x, i) => (
            <p key={i}>
              {x.title ? <b className="text-ink">{/[.!?]$/.test(x.title) ? x.title : x.title + '.'} </b> : null}
              {x.text}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-ink-3">This brief has no short version. The five things above sum it up.</p>
      )}
    </Sec>
  )
}

/** What changed: how the market talks now, each shift with its evidence (the first one open). */
function Shifts({ o, n, recOf, onPost }: { o: OrgTab; n: string; recOf: (url: string) => string; onPost: (url: string) => void }) {
  const [all, setAll] = useState(false)
  const lim = n === 'all' ? o.shifts.length : Number(n) || 6
  const shown = all ? o.shifts : o.shifts.slice(0, lim)
  return (
    <Sec id="shift" kicker="What changed" title="How the market talks now, with the evidence">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {shown.map((s, i) => (
          <details key={i} open={i === 0} className="group rounded-md border border-line" data-testid="shift">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
              <span className="text-[12.5px] font-semibold text-ink-3">{i + 1}</span>
              <b className="min-w-0 grow text-[14.5px] font-semibold text-ink">{s.title}</b>
              <Tag gold>Inferred use</Tag>
              <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
            <dl className="grid gap-2 border-t border-line px-3 py-3 text-[14px]">
              {s.obs ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Observed</dt>
                  <dd className="text-ink-2">
                    {s.obs}
                    {s.who ? <span className="text-ink-3"> · {s.who}</span> : null}
                  </dd>
                </div>
              ) : null}
              {s.interp ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Interpretation</dt>
                  <dd className="text-ink-2">{s.interp}</dd>
                </div>
              ) : null}
              {s.use ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">How to use it</dt>
                  <dd className="text-ink-2">{s.use}</dd>
                </div>
              ) : null}
              {s.url ? (
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Evidence</dt>
                  <dd>
                    <button type="button" onClick={() => onPost(s.url)} className="rounded-sm bg-sunk px-2 py-0.5 text-[13px] font-semibold text-ink-2 hover:bg-accent-soft hover:text-accent-text">
                      {recOf(s.url) || 'Open the post'}
                    </button>
                  </dd>
                </div>
              ) : null}
            </dl>
          </details>
        ))}
      </div>
      {o.shifts.length > lim ? (
        <button type="button" className={linkCls + ' mt-3'} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : 'Show all ' + o.shifts.length}
        </button>
      ) : null}
    </Sec>
  )
}

/** Notable developments: a few of each group, worth a closer look. */
function Devs({ o, per }: { o: OrgTab; per: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? o.devs : devsShown(o.devs, per === 'all' ? 'all' : Number(per) || 2)
  const more = o.devs.length > shown.length || (all && o.devs.length > 4)
  return (
    <Sec id="dev" kicker="Notable developments" title="Worth a closer look">
      <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2">
        {shown.map((d, i) => (
          <article key={i} className="rounded-md border border-line p-3" data-testid="dev">
            <small className="block text-[12px] text-ink-3">{d.cat || 'Development'}</small>
            <b className="block text-[14.5px] font-semibold text-ink">{d.title || d.who}</b>
            {d.text ? <p className="mt-1 text-[14px] text-ink-2">{clipTo(d.text, 240)}</p> : null}
            {d.why ? (
              <p className="mt-1 text-[13px] text-ink-3">
                <b>Why it matters:</b> {clipTo(d.why, 220)}
              </p>
            ) : null}
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className={linkCls + ' mt-2 text-[13px]'}>
                {d.title && d.who ? d.who : 'Open the source'}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : null}
          </article>
        ))}
      </div>
      {more ? (
        <button type="button" className={linkCls + ' mt-3'} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : 'Show all ' + o.devs.length}
        </button>
      ) : null}
    </Sec>
  )
}

const clipTo = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t)

/** Themes: posts per theme, each opening the Intel Tracker on it; and the topics the team watches. */
function Themes({ o, watch }: { o: OrgTab; watch: boolean }) {
  const top = Math.max(1, ...o.themes.map((t) => t.n))
  return (
    <Sec id="themes" kicker="Themes · posts per theme">
      {o.themes.length ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1" data-testid="brief-themes">
            {o.themes.map((t) => (
              <Link
                key={t.k}
                href={'/intel-tracker?run=' + encodeURIComponent(o.runId) + '&theme=' + encodeURIComponent(themeKey(t.l))}
                className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-[14px] text-ink hover:bg-sunk"
              >
                <span className="truncate">{t.l}</span>
                <span className="h-2 overflow-hidden rounded-full bg-sunk">
                  <i className="block h-full rounded-full bg-accent" style={{ width: Math.round((t.n / top) * 100) + '%' }} />
                </span>
                <b className="text-right tabular-nums text-ink-2">{t.n}</b>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-ink-3">Select a theme to see its posts in the Intel Tracker.</p>
        </>
      ) : null}
      {watch && o.watch.length ? (
        <div className={o.themes.length ? 'mt-4' : ''}>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Topic watch</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {o.watch.map((w) => (
              <details key={w.key} className="group rounded-md border border-line">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
                  <b className="text-[14px] text-ink">{themeLabel(w.key)}</b>
                  <span className="text-[13px] text-ink-3">{plural(w.n, 'post')}</span>
                  <ChevronDown size={15} aria-hidden="true" className="ml-auto text-ink-3 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="grid gap-1.5 border-t border-line px-3 py-2 text-[13.5px] text-ink-2">
                  {w.items.map((x, i) => (
                    <li key={i}>
                      {x.url ? (
                        <a href={x.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text hover:underline">
                          {x.who}
                        </a>
                      ) : (
                        <b className="text-ink">{x.who}</b>
                      )}
                      : {x.text}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </Sec>
  )
}

/** The content handoff: how the signals feed posts, newsletters and emails, and what stays yours. */
function Handoff() {
  return (
    <Sec id="hand" kicker="For content generation" title="Use these signals to frame your own content">
      <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2">
        <div className="rounded-md bg-sunk p-3">
          <b className="block text-[14.5px] text-ink">Thought leadership</b>
          <p className="mt-1 text-[14px] text-ink-2">Open with the buyer question behind one of the five things, and answer it from your own framework or a real example.</p>
        </div>
        <div className="rounded-md bg-sunk p-3">
          <b className="block text-[14.5px] text-ink">Newsletter or email</b>
          <p className="mt-1 text-[14px] text-ink-2">
            Build one issue around one finding: the problem, your explanation and a practical next step. The five things can become a five-issue series.
          </p>
        </div>
      </div>
      <p className="mt-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[14px] text-ink-2">
        <b className="text-ink">Source of truth:</b> your articles, interviews, podcasts and answers supply the stories, claims, proof and voice. This brief only guides
        the topic and the framing.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
          <PenLine size={15} aria-hidden="true" />
          Write a post
        </a>
        <a href={legacy('marketing-generation')} title={OUT_TIP} className={btn}>
          Write a newsletter
        </a>
        <a href={legacy('content-transformation')} title={OUT_TIP} className={btn}>
          <Repeat size={15} aria-hidden="true" />
          Start from your own material
        </a>
      </div>
    </Sec>
  )
}

/** The posts behind the brief: a row each, sortable by engagement, ten at a time. */
function Evidence({ o, n, onRow }: { o: OrgTab; n: string; onRow: (url: string, postId: string) => void }) {
  const [sort, setSort] = useState<'none' | 'desc' | 'asc'>('none')
  const [all, setAll] = useState(n === 'all')
  const rows = useMemo(() => {
    if (sort === 'none') return o.evidence
    const v = (x: { eng: number | null }) => (x.eng === null ? -1 : x.eng)
    return o.evidence.slice().sort((a, b) => (sort === 'desc' ? v(b) - v(a) : v(a) - v(b)))
  }, [o.evidence, sort])
  const shown = all ? rows : rows.slice(0, 10)
  return (
    <Sec id="ev" kicker="Evidence register" title="Posts behind this brief">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-[13.5px]" data-testid="brief-evidence">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[11%]" />
            <col className="w-[31%]" />
            <col className="w-[14%]" />
            <col className="w-[28%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left text-[12px] uppercase tracking-[0.06em] text-ink-3">
              <th scope="col" className="py-2 pr-2 font-semibold">
                Record
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Type
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Topic in short
              </th>
              <th scope="col" aria-sort={sort === 'desc' ? 'descending' : sort === 'asc' ? 'ascending' : 'none'} className="py-2 pr-2 text-right font-semibold">
                <button type="button" onClick={() => setSort((s) => (s === 'desc' ? 'asc' : 'desc'))} className="uppercase hover:text-ink">
                  Engagement{sort === 'desc' ? ' ↓' : sort === 'asc' ? ' ↑' : ''}
                </button>
                <InfoButton k="eng" L={o.limits} />
              </th>
              <th scope="col" className="py-2 font-semibold">
                Why it matters
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const go = r.postId || (WEB.test(r.url) ? r.url : '')
              return (
                <tr
                  key={r.rec}
                  id={'nwBr' + r.rec}
                  onClick={go ? () => onRow(r.url, r.postId) : undefined}
                  className={`border-b border-line align-top last:border-0 ${go ? 'cursor-pointer hover:bg-sunk/60' : ''}`}
                  data-testid="ev-row"
                >
                  <td className="py-2 pr-2">
                    {go ? (
                      <button type="button" onClick={(e) => (e.stopPropagation(), onRow(r.url, r.postId))} className="font-semibold text-ink hover:underline">
                        {r.rec}
                      </button>
                    ) : (
                      <b>{r.rec}</b>
                    )}
                    <small className="block truncate text-[12px] text-ink-3">{r.who || platLabel(r.platform)}</small>
                  </td>
                  <td className="py-2 pr-2 text-ink-2">{r.type || platLabel(r.platform)}</td>
                  <td className="py-2 pr-2 text-ink">{clipTo(r.topic, 90)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-ink-2">{r.eng === null ? <span className="text-ink-3">n/a</span> : fmtN(r.eng)}</td>
                  <td className="py-2 text-ink-2" title={r.why}>
                    {clipTo(r.why, 96)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 10 ? (
        <button type="button" className={linkCls + ' mt-3'} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : 'Show all ' + rows.length}
        </button>
      ) : null}
      <p className="mt-3 text-[13px] text-ink-3">
        The findings are the agent’s reading of these posts. Treat claims and numbers in them as unverified until you check the originals.{' '}
        <Link href={'/intel-tracker?run=' + encodeURIComponent(o.runId)} className={linkCls + ' text-[13px]'}>
          See every post from this run, and why each one is in the brief or left out
        </Link>
      </p>
    </Sec>
  )
}

/** A five thing and the posts behind it (nwBrOrgFiveOpen). */
function OrgFiveDrawer({
  o,
  n,
  tz,
  recOf,
  onClose,
  onPost,
}: {
  o: OrgTab
  n: number
  tz: string | undefined
  recOf: (url: string) => string
  onClose: () => void
  onPost: (id: string) => void
}) {
  const f = o.five[n]
  const posts = f.ids.map((id) => o.posts.find((p) => p.id === id)).filter((p): p is PostView => !!p)
  return (
    <Drawer
      open
      onClose={onClose}
      label="brief-five-drawer"
      eyebrow={'Intel Tracker · ' + dayText(o.createdAt, tz) + ' brief'}
      title={f.text}
      meta={f.tag ? <Tag gold>{f.tag}</Tag> : undefined}
      footer={
        <>
          {posts.length ? (
            <Link href={'/intel-tracker?run=' + encodeURIComponent(o.runId) + '&five=' + n} className={btn}>
              See them in the Intel Tracker
            </Link>
          ) : null}
          <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
            <PenLine size={15} aria-hidden="true" />
            Write a post with this
          </a>
        </>
      }
    >
      {f.why ? (
        <section className="mt-5">
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">What the agent saw</h4>
          <p className="text-[14px] text-ink-2">{f.why}</p>
        </section>
      ) : null}
      <section className="mt-5">
        <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Sources</h4>
        {posts.length ? (
          <>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {posts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPost(p.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-sunk">
                    {p.score !== null ? <Ring score={p.score} val={p.val} size={34} /> : <ValPill val={p.val} />}
                    <span className="min-w-0">
                      <b className="block truncate text-[14px] text-ink">{p.head}</b>
                      <small className="block truncate text-[12.5px] text-ink-3">
                        {[recOf(p.url), p.who, p.contentFormat, dayText(p.publishedAt, tz), p.eng !== null ? fmtN(p.eng) + ' engagement' : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-ink-3">Matched on the topic, the wording and any numbers in the point. These are the closest posts, not a full list.</p>
          </>
        ) : (
          <p className="text-[14px] text-ink-3">No single post matches this point closely. It is drawn from across the posts read in this run.</p>
        )}
      </section>
    </Drawer>
  )
}
