'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Clock, Copy, FileText, History, Info, Lightbulb, Megaphone, PenLine, Rocket, Search, Upload } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'
import { dateText, dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type CopySet, type SortKey, bandOf, filterAds, sortAds, topAds, uploadsOverview, variantText, whyShort } from '@/lib/pipeline/ad-strategist'
import { runDateOf } from '@/lib/pipeline/ads'
import { ageDays, fiveHeading } from '@/lib/pipeline/briefs'
import { briefHref } from '@/lib/touchpoint/approvals'
import { whenText } from '@/lib/touchpoint/today'
import { Chip, Empty, Pill, Ring, Tag, btn, ghost, inputCls, linkCls, primary, selectCls } from './bits'
import { OUT_TIP, legacy } from './briefs-parts'
import { AdCard, LiveTag, clean, clip, isWeb, plural } from './ads-cards'
import { AdInfoButton } from './ads-info'
import type { ACtx } from './ads-view'

// The Ad Strategist's tabs (nwAdsTopHtml, nwAdsAllHtml, nwAdsSwipeHtml with v113's overview, nwAdsTakeHtml with its
// drawer, nwAdsLibHtml). The upload window, building a brief from uploads, ad copy and Marketing Generation are still in
// the current dashboard, so their buttons open it there.

const grid = 'grid grid-cols-1 gap-3.5 min-[641px]:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]'

function RunNowButton({ ctx }: { ctx: ACtx }) {
  return (
    <button type="button" className={primary} onClick={ctx.openRun}>
      Run now
    </button>
  )
}

// ---------- Top ----------

export function TopTab({ ctx }: { ctx: ACtx }) {
  const n = ctx.top
  const list = topAds(ctx.data.pool, n)
  if (!list.length) {
    return (
      <Empty
        icon={<Megaphone size={30} aria-hidden="true" />}
        title="No scored ads yet"
        text="The agent scores the ads it pulls from the Ad Library. Run it, or upload ads."
        action={<RunNowButton ctx={ctx} />}
      />
    )
  }
  // the usual three, plus the team's own number from Settings when it is another (the old page pressed none then)
  const saved = Math.max(3, Math.min(10, ctx.data.schedule.top))
  const opts = Array.from(new Set([5, 8, 10, saved])).sort((a, b) => a - b)
  return (
    <div data-testid="top">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-line bg-panel p-1" role="group" aria-label="How many to show">
          {opts.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === n}
              onClick={() => ctx.setTop(k)}
              className={`rounded-sm px-3 py-1 text-[13.5px] font-semibold ${k === n ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-sunk'}`}
            >
              Top {k}
            </button>
          ))}
        </div>
        <button type="button" className={linkCls} onClick={ctx.openHow}>
          <Info size={15} aria-hidden="true" />
          How the score works
        </button>
      </div>
      <div className={grid}>
        {list.map((a) => (
          <AdCard key={a.id} a={a} ctx={ctx} />
        ))}
      </div>
      <p className="mt-4 text-[13px] text-ink-3">
        Ranked by score, then days running. At most two per advertiser. Running time shows the ad was still paid for, not that it made sales.
      </p>
    </div>
  )
}

// ---------- All ads ----------

const COLS: readonly { k: SortKey | null; label: string; right?: boolean; info?: 'adscore' | 'acap' }[] = [
  { k: 'ad', label: 'Ad' },
  { k: null, label: 'Source' },
  { k: 'days', label: 'Days running', right: true },
  { k: 'status', label: 'Status' },
  { k: 'score', label: 'Score', right: true, info: 'adscore' },
  { k: 'run', label: 'Found in' },
  { k: 'cap', label: 'Captured in', info: 'acap' },
  { k: null, label: 'View' },
]

export function AllTab({ ctx }: { ctx: ACtx }) {
  const { data, f, setF, caps, tz } = ctx
  const P = data.pool
  const advs = useMemo(() => Array.from(new Set(P.map((a) => a.adv))).sort((a, b) => a.localeCompare(b)), [P])
  const inds = useMemo(() => Array.from(new Set(P.map((a) => a.industry).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [P])
  const runs = useMemo(() => {
    // newest first, by when the run finished, else the day in its name (nwAdRunDate)
    const at = (r: string) => data.runs.find((x) => x.runId === r)?.at || runDateOf(r) || ''
    return Array.from(new Set(P.map((a) => a.runId).filter(Boolean))).sort((a, b) => at(b).localeCompare(at(a)))
  }, [P, data.runs])
  if (!P.length) {
    return (
      <Empty
        icon={<Megaphone size={30} aria-hidden="true" />}
        title="No ads yet"
        text="Run the Ad Strategist, or upload ads, and every ad it reads shows here."
        action={<RunNowButton ctx={ctx} />}
      />
    )
  }
  const list = sortAds(filterAds(P, f, caps), f.sort, f.dir, caps)
  const shown = list.slice(0, f.more)
  const filtered = f.st !== 'all' || !!f.adv || !!f.ind || !!f.run || !!f.cap || !!f.q.trim()
  const sortBy = (k: SortKey) => (f.sort === k ? setF({ dir: f.dir === 1 ? -1 : 1 }) : setF({ sort: k, dir: k === 'ad' ? 1 : -1 }))
  const day = (iso: string) => dayText(iso, tz)
  return (
    <div data-testid="all">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] grow basis-[220px]">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            className={inputCls + ' py-1.5 pl-9 text-[14px]'}
            placeholder="Search ads"
            aria-label="Search ads"
            value={f.q}
            onChange={(e) => setF({ q: e.target.value, more: 20 })}
          />
        </label>
        <Chip on={f.st === 'all'} onClick={() => setF({ st: 'all', more: 20 })} count={P.length}>
          All
        </Chip>
        <Chip on={f.st === 'live'} onClick={() => setF({ st: 'live', more: 20 })} count={P.filter((a) => a.act && !a.up).length}>
          Still running
        </Chip>
        <Chip on={f.st === 'up'} onClick={() => setF({ st: 'up', more: 20 })} count={P.filter((a) => a.up || a.sw).length}>
          Uploaded
        </Chip>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className={selectCls} aria-label="Advertiser" value={f.adv} onChange={(e) => setF({ adv: e.target.value, more: 20 })}>
          <option value="">All advertisers</option>
          {advs.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        {inds.length ? (
          <select className={selectCls} aria-label="Industry" value={f.ind} onChange={(e) => setF({ ind: e.target.value, more: 20 })}>
            <option value="">All industries</option>
            {inds.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        ) : null}
        <select className={selectCls} aria-label="Found in" value={f.run} onChange={(e) => setF({ run: e.target.value, more: 20 })}>
          <option value="">Found in: every run</option>
          {runs.map((r) => (
            <option key={r} value={r}>
              {ctx.runLabel(r)}
            </option>
          ))}
        </select>
        <select className={selectCls} aria-label="Captured in" value={f.cap} onChange={(e) => setF({ cap: e.target.value as '' | 'in' | 'out', more: 20 })}>
          <option value="">Captured in: any</option>
          <option value="in">In a brief</option>
          <option value="out">Not used</option>
        </select>
        <span className="ml-auto inline-flex items-center text-[13px] text-ink-3">
          How ads are picked
          <AdInfoButton k="adpick" S={data.schedule} />
        </span>
      </div>

      {list.length ? (
        <>
          <div className="relative overflow-x-auto rounded-lg border border-line bg-panel shadow-card">
            <table className="w-full min-w-[960px] text-[13.5px]" data-testid="ads-table">
              <thead className="text-[12px] uppercase tracking-[0.06em] text-ink-3">
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.label}
                      scope="col"
                      aria-sort={c.k && f.sort === c.k ? (f.dir === 1 ? 'ascending' : 'descending') : undefined}
                      className={`px-3 py-2.5 font-semibold ${c.right ? 'text-right' : 'text-left'}`}
                    >
                      <span className={`inline-flex items-center ${c.right ? 'justify-end' : ''}`}>
                        {c.k ? (
                          <button type="button" className="uppercase hover:text-ink" onClick={() => sortBy(c.k as SortKey)}>
                            {c.label}
                            {f.sort === c.k ? (f.dir === 1 ? ' ↑' : ' ↓') : ''}
                          </button>
                        ) : (
                          c.label
                        )}
                        {c.info ? <AdInfoButton k={c.info} S={data.schedule} /> : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => {
                  const c = caps[a.id]
                  const why = c ? whyShort(a, c, day) : ''
                  const url = isWeb(a.url) ? a.url : isWeb(a.dest) ? a.dest : ''
                  const label = ctx.runLabel(a.runId)
                  return (
                    <tr key={a.id} className="cursor-pointer border-t border-line hover:bg-sunk" onClick={() => ctx.openAd(a.id)} data-testid="ad-row">
                      <td className="max-w-[38ch] px-3 py-2.5 align-top">
                        <button type="button" className="text-left font-semibold text-ink hover:underline" onClick={(e) => (e.stopPropagation(), ctx.openAd(a.id))}>
                          {clip(clean(a.title), 90)}
                        </button>
                        <small className="block text-[12.5px] text-ink-3">{a.adv + (a.industry ? ' · ' + a.industry : '')}</small>
                        {why ? (
                          <small className={`block text-[12.5px] ${c?.st === 'in' ? 'font-semibold text-accent-text' : 'text-ink-3'}`} title={why}>
                            {why}
                          </small>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top">{a.up ? <Tag gold>Uploaded</Tag> : a.sw ? <Tag gold>From Notion</Tag> : <Tag>Ad Library</Tag>}</td>
                      <td className="px-3 py-2.5 text-right align-top">
                        {!a.up && a.days !== null ? <b className="text-ink">{a.days}</b> : <span className="text-ink-3">None yet</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {a.up ? (
                          <span className="text-ink-3">Uploaded</span>
                        ) : a.sw ? (
                          <span className="flex flex-wrap gap-1">
                            <Tag gold>From Notion</Tag>
                            {!a.inBrief ? <Pill>Left out of briefs</Pill> : null}
                          </span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            <LiveTag a={a} tz={tz} />
                            {!a.inBrief ? <Pill>Left out of briefs</Pill> : null}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        {a.score !== null ? <b className="text-ink">{a.score}</b> : <span className="text-ink-3">{a.pend ? 'Not read' : 'None'}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top text-ink-2" title={label}>
                        {label.replace(/, \d{1,2}:\d{2}\s?[AP]M$/i, '')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top">
                        {c?.st === 'in' ? (
                          <Tag gold>
                            {dateText(c.list[0].B.createdAt, tz)}
                            {c.list.length > 1 ? <small className="ml-1 text-[11px] opacity-80">+{c.list.length - 1}</small> : null}
                          </Tag>
                        ) : (
                          <span className="text-ink-3">Not used</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className={linkCls + ' text-[13px]'} onClick={(e) => e.stopPropagation()}>
                            {/facebook\.com\/ads\/library/i.test(url) ? 'Ad Library' : 'Open'}
                            <ArrowUpRight size={13} aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="text-ink-3">–</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {list.length > shown.length ? (
            <button type="button" className={btn + ' mt-3'} onClick={() => setF({ more: f.more + 20 })}>
              Show {Math.min(20, list.length - shown.length)} more of {list.length}
            </button>
          ) : null}
          <p className="mt-3 text-[13px] text-ink-3">
            {filtered ? 'Showing ' + list.length + ' of ' + plural(P.length, 'ad') + '. ' : ''}
            Select a column to sort by it. Ad Library links open the ad in the Meta Ad Library. Live means the Ad Library showed it running in the last 8 days.
          </p>
        </>
      ) : (
        <Empty
          icon={<Search size={30} aria-hidden="true" />}
          title="Nothing matches"
          text="Try another filter."
          action={
            <button type="button" className={btn} onClick={() => setF({ st: 'all', adv: '', ind: '', run: '', cap: '', q: '', more: 20 })}>
              Clear filters
            </button>
          }
        />
      )}
    </div>
  )
}

// ---------- Uploads ----------

export function UploadsTab({ ctx }: { ctx: ACtx }) {
  const { data } = ctx
  const ups = data.pool.filter((a) => a.up || a.sw).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const O = uploadsOverview(data.pool, (a) => ctx.fitOf(a)?.score ?? null)
  const anyRead = ups.some((a) => !a.pend)
  return (
    <div data-testid="uploads">
      {ups.length ? (
        <section className="mb-5 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="uploads-overview">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">Your uploads</p>
              <h3 className="font-display text-[19px] font-semibold text-ink">What they show</h3>
            </div>
            <span className="text-[13px] text-ink-3">
              {plural(O.total, 'upload') + ' · ' + O.inNext + ' in the next ads brief' + (O.avgFit !== null ? ' · average fit ' + O.avgFit : '')}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[761px]:grid-cols-3">
            <div>
              <b className="mb-1.5 block text-[13px] text-ink">Patterns they share</b>
              {O.patterns.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {O.patterns.map((p) => (
                    <Tag key={p.label}>{p.label + (p.n > 1 ? ' · ' + p.n : '')}</Tag>
                  ))}
                </span>
              ) : (
                <p className="text-[13.5px] text-ink-3">None read yet.</p>
              )}
            </div>
            <div>
              <b className="mb-1.5 block text-[13px] text-ink">Key takeaways</b>
              {O.takeaways.length ? (
                <ul className="grid gap-1.5">
                  {O.takeaways.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="text-left text-[13.5px] text-accent-text hover:underline" onClick={() => ctx.openAd(t.id)}>
                        {clip(t.text, 150)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-ink-3">None read yet.</p>
              )}
            </div>
            <div>
              <b className="mb-1.5 block text-[13px] text-ink">Offers they make</b>
              {O.offers.length ? (
                <ul className="grid list-disc gap-1 pl-4 text-[13.5px] text-ink-2">
                  {O.offers.map((o) => (
                    <li key={o}>{clip(o, 110)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-ink-3">None read yet.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="min-w-0 grow basis-[320px] text-[14px] text-ink-2">
          Ads your team uploaded or saved. Each one is read for its hook, offer and format, then goes into the next ads brief unless you switch it off on the ad.
        </p>
        {anyRead ? (
          <span className="flex flex-wrap gap-2">
            <a href={legacy('ad-strategist')} title={OUT_TIP} className={btn}>
              <FileText size={14} aria-hidden="true" />
              Build a brief from these
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href={legacy('ad-strategist')} title={OUT_TIP} className={btn}>
              <PenLine size={14} aria-hidden="true" />
              Write ad copy
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </span>
        ) : null}
      </div>

      <div className={grid}>
        {ups.map((a) => (
          <AdCard key={a.id} a={a} ctx={ctx} />
        ))}
        <a
          href={legacy('ad-strategist')}
          title={OUT_TIP}
          className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line p-4 text-center text-ink-2 hover:border-accent hover:text-accent-text"
        >
          <Upload size={26} aria-hidden="true" />
          <b className="text-[15px]">Upload competitor ads</b>
          <small className="text-[13px] text-ink-3">Screenshots, PNG or JPG · opens in the current dashboard</small>
        </a>
      </div>

      {data.copySets.length ? <CopySets sets={data.copySets} tz={ctx.tz} /> : null}
    </div>
  )
}

/** The ad copy written from the uploads (apCopySets): searchable, ten a page, each opening in place. */
function CopySets({ sets, tz }: { sets: CopySet[]; tz: string | undefined }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const t = q.trim().toLowerCase()
  const hits = t
    ? sets.filter((s) => [s.title, s.platform, s.notes, ...s.takeaways, ...s.variants.flatMap((v) => [v.hook, v.primary, v.headline])].join(' ').toLowerCase().includes(t))
    : sets
  const pages = Math.max(1, Math.ceil(hits.length / 10))
  const p = Math.min(page, pages - 1)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied')
    } catch {
      toast('Could not copy here', 'warn')
    }
  }
  return (
    <section className="mt-6" data-testid="copy-sets">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">Ad copy</p>
      <h3 className="mb-3 font-display text-[20px] font-semibold text-ink">Written from your uploads</h3>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className={inputCls + ' max-w-[320px] py-1.5 text-[14px]'}
          placeholder="Search copy…"
          aria-label="Search copy"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
        />
        <span className="text-[13px] text-ink-3">
          {hits.length} of {sets.length}
        </span>
      </div>
      <ul className="grid gap-2">
        {hits.slice(p * 10, p * 10 + 10).map((s) => (
          <li key={s.id}>
            <details className="group rounded-md border border-line bg-panel" data-testid="copy-set">
              <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-3 py-2.5">
                <span className="min-w-0">
                  <b className="block text-[14.5px] text-ink">{s.title}</b>
                  <small className="text-[12.5px] text-ink-3">
                    {[plural(s.variants.length, 'variant'), s.platform, s.sources ? 'learned from ' + plural(s.sources, 'ad') : ''].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <span className="text-[12.5px] text-ink-3">{dateText(s.createdAt, tz)}</span>
              </summary>
              <div className="grid gap-3 border-t border-line px-3 py-3">
                {s.takeaways.length ? (
                  <div>
                    <b className="mb-1 block text-[13px] text-ink">Key takeaways</b>
                    <ul className="grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">
                      {s.takeaways.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {s.variants.map((v, i) => (
                  <div key={i} className="rounded-md border border-line p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <b className="text-[13.5px] text-ink">Variant {String.fromCharCode(65 + (i % 26))}</b>
                      {v.angle ? <Tag gold>{v.angle}</Tag> : null}
                      <button type="button" className={ghost + ' ml-auto'} onClick={() => void copy(variantText(v))}>
                        <Copy size={13} aria-hidden="true" />
                        Copy
                      </button>
                    </div>
                    {v.hook ? <p className="mb-1 text-[14px] font-semibold text-ink">{v.hook}</p> : null}
                    {v.primary ? <p className="mb-1.5 whitespace-pre-line text-[13.5px] text-ink-2">{v.primary}</p> : null}
                    <dl className="grid gap-0.5 text-[13px] text-ink-2">
                      {(
                        [
                          ['Headline', v.headline],
                          ['CTA', v.cta],
                          ['Image', v.image],
                          ['Pattern used', v.pattern],
                        ] as const
                      )
                        .filter(([, x]) => x)
                        .map(([k, x]) => (
                          <div key={k}>
                            <dt className="inline font-semibold text-ink">{k}: </dt>
                            <dd className="inline">{x}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                ))}
                {s.notes ? (
                  <p className="text-[13.5px] text-ink-2">
                    <b className="text-ink">How the guidelines shaped it:</b> {s.notes}
                  </p>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className={btn} disabled={p === 0} onClick={() => setPage(p - 1)}>
            ‹ Back
          </button>
          <span className="text-[13px] text-ink-3">
            Page {p + 1} of {pages}
          </span>
          <button type="button" className={btn} disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
            Next ›
          </button>
        </div>
      ) : null}
    </section>
  )
}

// ---------- Takeaways ----------

export function TakeawaysTab({ ctx }: { ctx: ACtx }) {
  const { data, tz } = ctx
  const T = data.take
  if (!T) {
    return (
      <Empty
        icon={<Lightbulb size={30} aria-hidden="true" />}
        title="No ads brief yet"
        text="Run the Ad Strategist, or build a brief from the ads you upload."
        action={<RunNowButton ctx={ctx} />}
      />
    )
  }
  const age = ageDays(T.createdAt, ctx.now)
  const items = T.five
  return (
    <div data-testid="takeaways">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[22px] font-semibold text-ink">{items.length ? fiveHeading(items.length) : 'What is working'}</h2>
          <p className="text-[13.5px] text-ink-3">
            From the ads brief of {dayText(T.createdAt, tz)}
            {items.length ? ' · select one for its sources' : ''}
          </p>
        </div>
        {data.briefs.length > 1 ? (
          <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-2">
            <span className="max-[640px]:sr-only">Brief</span>
            <select className={selectCls} aria-label="Pick an ads brief" value={T.runId} onChange={(e) => ctx.pickBrief(e.target.value)}>
              {data.briefs.map((b, i) => (
                <option key={b.runId} value={b.runId}>
                  {ctx.runLabel(b.runId) + (i === 0 ? ' · newest' : '')}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {age > 21 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[14px] text-ink-2" data-testid="take-stale">
          <Clock size={17} aria-hidden="true" className="shrink-0 text-warn" />
          <span className="min-w-0 grow">
            <b className="text-ink">This brief is {age} days old.</b> Refresh it before the next paid draft leans on it.
          </span>
          <RunNowButton ctx={ctx} />
        </div>
      ) : null}
      {items.length ? (
        <div className="mb-5 grid grid-cols-1 gap-3 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-5" data-testid="five">
          {items.map((it, i) => {
            const n = it.ads?.length ?? 0
            return (
              <button
                key={i}
                type="button"
                onClick={() => ctx.openFive(i)}
                className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-3.5 text-left shadow-card hover:border-accent"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink-3">{i + 1}</span>
                  {it.tag ? <Tag gold>{it.tag}</Tag> : null}
                </span>
                <b className="text-[14.5px] leading-snug text-ink">{it.text}</b>
                {it.why ? <span className="text-[13px] leading-snug text-ink-3">{it.why}</span> : null}
                <span className={linkCls + ' mt-auto pt-1 text-[13px]'}>{n ? plural(n, 'source') : 'Read across the ads'} →</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mb-5">
          <Empty icon={<Lightbulb size={30} aria-hidden="true" />} title="No takeaways in this brief" text="They come with the ads brief the agent writes." />
        </div>
      )}
      {T.angle ? (
        <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="short-version">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">The short version</p>
          <p className="my-2 font-display text-[21px] font-semibold leading-snug text-ink">{T.angle}</p>
          <div className="flex flex-wrap gap-2">
            <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
              <Rocket size={15} aria-hidden="true" />
              Make ads from this
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <Link href={briefHref(T.runId, 'ads')} className={btn}>
              Open the ads brief
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}

/** One of the five things with the ads behind it (nwAdFiveOpen). */
export function FiveDrawer({ ctx, n, onClose, onAd }: { ctx: ACtx; n: number; onClose: () => void; onAd: (id: string) => void }) {
  const T = ctx.data.take!
  const it = T.five[n]
  if (!it) return null
  const ads = it.ads ?? []
  return (
    <Drawer
      open
      onClose={onClose}
      label="five-drawer"
      eyebrow={'Ad Strategist · ' + dayText(T.createdAt, ctx.tz) + ' brief'}
      title={it.text}
      meta={it.tag ? <Tag gold>{it.tag}</Tag> : null}
      footer={
        <>
          <Link href={briefHref(T.runId, 'ads')} className={btn}>
            Open the ads brief
          </Link>
          <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
            <Rocket size={15} aria-hidden="true" />
            Make ads with this
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </>
      }
    >
      {it.why ? (
        <section className="mb-4">
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">What the agent saw</h3>
          <p className="text-[14.5px] leading-relaxed text-ink-2">{it.why}</p>
        </section>
      ) : null}
      <section>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Sources</h3>
        {ads.length ? (
          <>
            <ul className="grid gap-2">
              {ads.map((x) => {
                const a = ctx.byId.get(x.id)
                const body = (
                  <>
                    {x.lib && x.score !== null ? <Ring score={x.score} val={bandOf(x.score)} size={34} /> : <Tag gold>{x.up || x.sw ? 'Uploaded' : 'Ad'}</Tag>}
                    <span className="min-w-0">
                      <b className="block text-[14px] text-ink">{clip(clean(x.title), 90)}</b>
                      <small className="text-[12.5px] text-ink-3">
                        {[x.adv, x.lib && x.days !== null ? plural(x.days, 'day') + ' running' : '', x.lib && x.act ? 'still running' : ''].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                  </>
                )
                return (
                  <li key={x.id || x.url}>
                    {a ? (
                      <button type="button" onClick={() => onAd(a.id)} className="flex w-full items-center gap-3 rounded-md border border-line p-2.5 text-left hover:border-accent">
                        {body}
                      </button>
                    ) : isWeb(x.url) ? (
                      <a href={x.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-md border border-line p-2.5 hover:border-accent">
                        {body}
                      </a>
                    ) : (
                      <span className="flex items-center gap-3 rounded-md border border-line p-2.5">{body}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-[13px] text-ink-3">
              {it.all
                ? 'This brief was built from these hand-picked ads.'
                : 'Matched on the wording, the offer and the ads the brief lists. These are the closest ads, not a full list.'}
            </p>
          </>
        ) : (
          <p className="text-[14px] text-ink-2">No single ad matches this point closely. It is drawn from across the ads behind the brief.</p>
        )}
      </section>
    </Drawer>
  )
}

// ---------- Run library ----------

export function LibraryTab({ ctx }: { ctx: ACtx }) {
  const { data, tz } = ctx
  const L = data.library
  if (!L.length) return <Empty icon={<History size={30} aria-hidden="true" />} title="No runs yet" text="Runs show up here as they finish." />
  const onScreen = data.take?.runId ?? ''
  return (
    <div className="grid grid-cols-1 gap-4 min-[761px]:grid-cols-2 min-[1281px]:grid-cols-3" data-testid="library">
      {L.map((r, i) => (
        <section
          key={r.runId}
          className={`flex flex-col gap-2 rounded-lg border bg-panel p-4 shadow-card ${r.runId === onScreen ? 'border-accent' : 'border-line'}`}
          data-testid="run-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{r.custom ? 'Built from uploads' : 'Ad Library run'}</p>
              <b className="block text-[15px] text-ink">{whenText(r.at, tz)}</b>
              {r.rule ? <span className="block text-[13px] text-ink-3">{r.rule}</span> : null}
            </div>
            <span className="flex flex-wrap gap-1.5">
              {i === 0 ? <Tag gold>Latest</Tag> : r.runId === onScreen ? <Tag gold>On screen</Tag> : null}
              {r.running ? <Pill tone="info">Running</Pill> : r.ok ? null : <Pill tone="bad">Did not finish</Pill>}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-[13px] text-ink-3">
            {r.newAds > 0 ? (
              <span>
                <b className="mr-1 font-display text-[18px] text-ink">{r.newAds}</b>new ads
              </span>
            ) : null}
            {r.behind !== null && r.behind > 0 ? (
              <span>
                <b className="mr-1 font-display text-[18px] text-ink">{r.behind}</b>behind the brief
              </span>
            ) : null}
            {r.advertisers !== null ? (
              <span>
                <b className="mr-1 font-display text-[18px] text-ink">{r.advertisers}</b>
                {r.advertisers === 1 ? 'advertiser' : 'advertisers'}
              </span>
            ) : null}
            {r.confidence !== null ? (
              <span>
                <b className="mr-1 font-display text-[18px] text-ink">{r.confidence.toFixed(2)}</b>confidence
              </span>
            ) : null}
          </div>
          {r.lead ? (
            <p className="text-[13.5px] text-ink-2">
              <b>Lead finding:</b> {r.lead}
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {r.hasBrief ? (
              <button
                type="button"
                className={btn}
                onClick={() => (r.runId === onScreen ? ctx.goTab('takeaways') : ctx.pickBrief(r.runId))}
              >
                Open takeaways
              </button>
            ) : null}
            {r.newAds > 0 ? (
              <button type="button" className={btn} onClick={() => ctx.goTab('all', { st: 'all', adv: '', cap: '', run: r.runId })}>
                Its ads
              </button>
            ) : null}
            {r.hasBrief ? (
              <Link href={briefHref(r.runId, 'ads')} className={ghost}>
                Brief
              </Link>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  )
}
