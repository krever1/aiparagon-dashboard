'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Clock, Eye, Megaphone, Rocket } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'
import { dateText, dayText } from '@/components/ui/local-date'
import type { Ad } from '@/lib/pipeline/ads'
import { adClean } from '@/lib/pipeline/ads'
import { type Kind, ADDED, RAIL, TEST_PLAN, ageDays, fiveHeading, optOf } from '@/lib/pipeline/briefs'
import type { AdsTab } from '@/lib/pipeline/briefs-load'
import { valOf } from '@/lib/pipeline/intel'
import { tidy } from '@/lib/touchpoint/approvals'
import { whenText } from '@/lib/touchpoint/today'
import { Empty, Ring, Tag, btn, linkCls, primary } from './bits'
import { AddedSec, type BCtx, EditedLine, Glance, OUT_TIP, Rail, RecordBar, ReviewCard, Sec, legacy } from './briefs-parts'

// The Ads tab (nwBrAdHtml as v110 and v111 left it): the record bar, a note when the brief is old, the five things with
// the ads behind each, the short version, the creative structure with where each hook was seen, offers, pains and
// objections, patterns from other markets, the test plan, the ads behind the brief and the review. An ad opens in the Ad
// Library; its own panel is still on the Ad Strategist in the current dashboard.

const KIND: Kind = 'ads'
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)
const clipTo = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t)
const web = (u: string) => (/^https?:\/\//.test(u) ? u : '')

export function AdsTabView({ ctx }: { ctx: BCtx }) {
  const b = ctx.data.ads
  if (!b) {
    return (
      <Empty
        icon={<Megaphone size={30} aria-hidden="true" />}
        title="No ads brief yet"
        text="Run the Ad Strategist, or build a brief from the ads you upload."
        action={
          <a href={legacy('ad-strategist')} title={OUT_TIP} className={btn}>
            Open the Ad Strategist
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        }
      />
    )
  }
  return <AdsBrief key={b.runId} ctx={ctx} b={b} />
}

function AdsBrief({ ctx, b }: { ctx: BCtx; b: AdsTab }) {
  const { tz, data } = ctx
  const L = data.layout.ads
  const hidden = new Set(b.review?.hidden ?? [])
  const show = (k: string) => !L.off.includes(k) && !hidden.has(k)
  const [five, setFive] = useState<number | null>(null)
  const [hook, setHook] = useState<number | null>(null)
  const P = b.parts
  const day = dayText(b.createdAt, tz)
  const title = 'Ads brief · ' + day
  const age = ageDays(b.createdAt, data.now)

  const fiveN = Number(optOf(L, KIND, 'five', 'n')) || 5
  const fiveWhy = optOf(L, KIND, 'five', 'why') === 'full'
  const fives = show('five') ? b.five.slice(0, fiveN) : []
  const hookN = Number(optOf(L, KIND, 'arch', 'n')) || 8
  const offerN = Number(optOf(L, KIND, 'offer', 'n')) || 6
  const main = L.order.filter((k) => k !== 'rec' && k !== 'five' && k !== 'review' && show(k))

  const sections: { id: string; label: string; node: React.ReactNode }[] = []
  for (const k of main) {
    const node =
      k === 'short' ? (
        <Sec key={k} id="short" kicker="The short version · 1 minute">
          {P.angle ? (
            <>
              <p className="text-[16px] font-semibold leading-snug text-ink">{P.angle}</p>
              {b.intelRun ? <p className="mt-2 text-[13px] text-ink-3">Built with the organic brief of {dayText(b.intelRun.createdAt, tz)}.</p> : null}
            </>
          ) : (
            <p className="text-[14px] text-ink-3">This brief has no angle written up.</p>
          )}
        </Sec>
      ) : k === 'arch' ? (
        P.formula || P.hooks.length ? (
          <Sec key={k} id="arch" kicker="Creative structure" title="One body, several openings to test">
            {P.formula ? (
              <p className="mb-3 text-[14px] text-ink-2">
                <b className="text-ink">Draft skeleton:</b> {P.formula}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-2 min-[641px]:grid-cols-2" data-testid="brief-hooks">
              {P.hooks.slice(0, hookN).map((h, i) => {
                const src = b.hookSrc[i]
                return (
                  <div key={i} className="rounded-md border border-line p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Hook {String.fromCharCode(65 + i)}</p>
                    <p className="mt-1 text-[14.5px] text-ink">{h}</p>
                    {src && src.ads.length ? (
                      <button type="button" onClick={() => setHook(i)} className={linkCls + ' mt-2 text-[13px]'}>
                        <Eye size={14} aria-hidden="true" />
                        {'Seen in ' + src.who.slice(0, 2).join(', ') + (src.who.length > 2 ? ' +' + (src.who.length - 2) : '') + ' · ' + plural(src.ads.length, 'ad')}
                      </button>
                    ) : src ? (
                      <span className="mt-2 block text-[13px] text-ink-3">{src.note || 'Drawn across the ad set, no single ad'}</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[13px] text-ink-3">Each opening uses the same body and gets its own test record. These describe a pattern; the words are yours to write.</p>
          </Sec>
        ) : null
      ) : k === 'offer' ? (
        P.offers.length ? (
          <Sec key={k} id="offer" kicker="Offer observations" title="Offer shapes that keep running">
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {P.offers.slice(0, offerN).map((o, i) => (
                <li key={i} className="rounded-md border border-line p-3">
                  <b className="text-[14.5px] text-ink">{o.type || 'Offer'}</b>
                  {o.price ? <small className="ml-2 text-[12.5px] text-ink-3">{o.price}</small> : null}
                  {o.notes ? <p className="mt-1 text-[14px] text-ink-2">{o.notes}</p> : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-ink-3">Prices are what other advertisers show, not a suggested price for you. Point every ad at a real offer and landing page.</p>
          </Sec>
        ) : null
      ) : k === 'pain' ? (
        P.pains.length || P.objections.length ? (
          <Sec key={k} id="pain" kicker="Message inputs" title="Buyer pains and objections">
            <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2">
              {P.pains.length ? (
                <div>
                  <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Pains</p>
                  <ul className="list-disc pl-5 text-[14px] text-ink-2">
                    {P.pains.slice(0, 8).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {P.objections.length ? (
                <div>
                  <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Likely objections</p>
                  <ul className="list-disc pl-5 text-[14px] text-ink-2">
                    {P.objections.slice(0, 8).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <p className="mt-3 text-[13px] text-ink-3">From the ads and the organic brief, not from your own customer interviews. Use only the pains you can speak to.</p>
          </Sec>
        ) : null
      ) : k === 'cross' ? (
        P.cross.length ? (
          <Sec key={k} id="cross" kicker="Borrowed from other markets" title="Patterns that travel">
            <ul className="list-disc pl-5 text-[14px] text-ink-2">
              {P.cross.slice(0, 6).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Sec>
        ) : null
      ) : k === 'test' ? (
        <Sec key={k} id="test" kicker="Draft test plan" title="What the next campaign should test">
          <div className="grid grid-cols-1 gap-2 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-4">
            {TEST_PLAN.map(([t, s]) => (
              <div key={t} className="rounded-md bg-sunk p-3">
                <b className="block text-[14px] text-ink">{t}</b>
                <p className="mt-1 text-[13.5px] text-ink-2">{s}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
              <Rocket size={15} aria-hidden="true" />
              Make ads from this
            </a>
            <Link href="/ad-testing" className={btn}>
              Open Ad Testing
            </Link>
          </div>
        </Sec>
      ) : k === 'ev' ? (
        <AdEvidence key={k} b={b} />
      ) : k in ADDED.ads ? (
        <AddedSec key={k} id={k} name={ADDED.ads[k]} />
      ) : null
    if (node) sections.push({ id: k, label: RAIL.ads[k] ?? ADDED.ads[k] ?? k, node })
  }

  // two versions on one day are told apart by the time (nwAdRunLabel)
  const versions = b.versions.map((v, i) => {
    const same = b.versions.some((x) => x.runId !== v.runId && dayText(x.at, tz) === dayText(v.at, tz))
    const when = v.at ? (same ? whenText(v.at, tz).replace(/^\w+ /, '') : dayText(v.at, tz)) : v.runId
    return { run: v.runId, label: (/^upload/.test(v.runId) ? 'Uploads · ' : v.custom ? 'From uploads · ' : '') + when + (i === 0 ? ' · newest' : '') }
  })
  const meta = [
    { label: 'Published', value: dateText(b.createdAt, tz) },
    { label: 'Period', value: b.custom ? 'Ads your team picked' : 'Ads running when it pulled them' },
    { label: 'Agent', value: 'Ad Strategist' + (b.custom ? ', from your uploads' : '') },
    { label: 'For', value: 'Paid social ads' },
    ...(b.onFile > 1 ? [{ label: 'On file', value: String(b.onFile) }] : []),
  ]
  const advertisers = new Set(b.evidence.map((r) => r.adv.toLowerCase()).filter(Boolean)).size
  const glance = [
    { value: String(b.evidence.length), label: 'ads', note: 'Behind the patterns' + (advertisers ? ', from ' + plural(advertisers, 'advertiser') : '') },
    ...(b.proven ? [{ value: b.proven.proven + ' + ' + b.proven.emerging, label: 'proven + emerging', note: 'Ran 6 weeks or more, or still running after 2' }] : []),
    ...(b.confidence !== null ? [{ value: b.confidence.toFixed(2), label: 'confidence', note: 'The agent’s own estimate, not a result' }] : []),
    ...(b.level ? [{ value: b.level.charAt(0).toUpperCase() + b.level.slice(1), label: 'market sophistication', note: 'How used to these claims buyers are', text: true }] : []),
  ]
  const rail = [...(fives.length ? [{ id: 'five', label: RAIL.ads.five }] : []), ...sections.map((s) => ({ id: s.id, label: s.label })), { id: 'review', label: RAIL.ads.review }]

  return (
    <>
      <RecordBar
        ctx={ctx}
        kind={KIND}
        title={title}
        meta={meta}
        versions={versions}
        run={b.runId}
        state={b.state}
        editedLine={b.review ? <EditedLine by={b.review.by} at={b.review.at} original={b.review.original} tz={tz} /> : null}
      />
      {age > 21 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[14px] text-ink-2" data-testid="brief-stale">
          <Clock size={17} aria-hidden="true" className="shrink-0 text-warn" />
          <span className="min-w-0 grow">
            <b className="text-ink">Refresh before the next paid draft.</b> This brief is {age} days old. Run time is observed; sales and return are not connected.
          </span>
          <a href={legacy('ad-strategist')} title={OUT_TIP} className={btn}>
            Run the Ad Strategist
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      ) : null}
      {b.adsError ? <p className="mb-4 text-[13.5px] text-bad">Could not read every ad behind this brief: {b.adsError}</p> : null}

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
                  {f.ads && f.ads.length ? plural(f.ads.length, 'source') : 'Read across the ads'}
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
          <ReviewCard ctx={ctx} kind={KIND} run={b.runId} title={title} state={b.state} decision={b.decision} />
        </div>
        <div className="max-[1080px]:order-first">
          <Rail items={rail} glance={<Glance testid="brief-glance" title="Signal quality" rows={glance} note="Running time shows the ad was active when it was pulled, not that it made sales." />} />
        </div>
      </div>

      {five !== null && fives[five] ? <AdsFiveDrawer b={b} n={five} tz={tz} onClose={() => setFive(null)} /> : null}
      {hook !== null && b.hookSrc[hook] ? <HookDrawer text={P.hooks[hook]} ads={b.hookSrc[hook]!.ads} onClose={() => setHook(null)} /> : null}
    </>
  )
}

/** The ads behind the brief: a row each, with how long it had run when the brief was written. */
function AdEvidence({ b }: { b: AdsTab }) {
  return (
    <Sec id="ev" kicker="Evidence register" title="Ads behind these patterns">
      {b.evidence.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-[13.5px]" data-testid="brief-evidence">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[35%]" />
              <col className="w-[13%]" />
              <col className="w-[21%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line text-left text-[12px] uppercase tracking-[0.06em] text-ink-3">
                <th scope="col" className="py-2 pr-2 font-semibold">
                  Record
                </th>
                <th scope="col" className="py-2 pr-2 font-semibold">
                  Opening
                </th>
                <th scope="col" className="py-2 pr-2 font-semibold">
                  Call to action
                </th>
                <th scope="col" className="py-2 pr-2 font-semibold">
                  Observed offer
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Running at capture
                </th>
              </tr>
            </thead>
            <tbody>
              {b.evidence.map((r) => {
                const url = web(r.url)
                const cta = clipTo(tidy(adClean(r.cta)), 24)
                return (
                  <tr key={r.rec} className="border-b border-line align-top last:border-0" data-testid="ev-row">
                    <td className="py-2 pr-2">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">
                          {r.rec}
                        </a>
                      ) : (
                        <b>{r.rec}</b>
                      )}
                      <small className="block truncate text-[12px] text-ink-3">{r.adv}</small>
                    </td>
                    <td className="py-2 pr-2 text-ink">{clipTo(r.hook, 110)}</td>
                    <td className="whitespace-nowrap py-2 pr-2 text-ink-2">{cta || <span className="text-ink-3">n/a</span>}</td>
                    <td className="py-2 pr-2 text-ink-2" title={r.offer || undefined}>
                      {r.offer ? clipTo(r.offer, 64) : <span className="text-ink-3">n/a</span>}
                    </td>
                    <td className="py-2 text-ink-2">
                      {r.days !== null ? <b className="text-ink">{plural(r.days, 'day')}</b> : null}
                      {r.status ? <small className="block text-[12px] text-ink-3">{r.status}</small> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[14px] text-ink-3">This brief did not record which ads it read. Briefs from the next run list them.</p>
      )}
      <p className="mt-3 text-[13px] text-ink-3">
        Run time shows an advertiser kept paying for the ad, not that it brought leads or sales.{' '}
        <a href={legacy('ad-strategist')} title={OUT_TIP} className={linkCls + ' text-[13px]'}>
          See every ad from this run, and why each one was picked or not
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </p>
    </Sec>
  )
}

/** An ad in a list: its score or how it came in, its title and what is known about it. */
function AdRow({ a, extra }: { a: Ad; extra: string[] }) {
  const url = web(a.url)
  const body = (
    <>
      {a.lib && a.score !== null ? <Ring score={a.score} val={valOf(a.score, null)} size={34} /> : <Tag gold={a.up || a.sw}>{a.up || a.sw ? 'Uploaded' : 'Ad'}</Tag>}
      <span className="min-w-0">
        <b className="block truncate text-[14px] text-ink">{clipTo(tidy(a.title), 90)}</b>
        <small className="block truncate text-[12.5px] text-ink-3">{[a.adv, ...extra].filter(Boolean).join(' · ')}</small>
      </span>
    </>
  )
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-sunk">
      {body}
    </a>
  ) : (
    <div className="flex w-full items-center gap-3 rounded-md px-2 py-2">{body}</div>
  )
}

/** An ads five thing and the ads behind it (nwAdFiveOpen). */
function AdsFiveDrawer({ b, n, tz, onClose }: { b: AdsTab; n: number; tz: string | undefined; onClose: () => void }) {
  const f = b.five[n]
  const ads = f.ads ?? []
  return (
    <Drawer
      open
      onClose={onClose}
      label="brief-five-drawer"
      eyebrow={'Ad Strategist · ' + dayText(b.createdAt, tz) + ' brief'}
      title={f.text}
      meta={f.tag ? <Tag gold>{f.tag}</Tag> : undefined}
      footer={
        <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
          <Rocket size={15} aria-hidden="true" />
          Make ads with this
        </a>
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
        {ads.length ? (
          <>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {ads.map((a) => (
                <li key={a.id}>
                  <AdRow a={a} extra={[a.lib && a.days !== null ? plural(a.days, 'day') + ' running' : '', a.lib && a.act ? 'still running' : '']} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-ink-3">
              {f.all ? 'This brief was built from these hand-picked ads.' : 'Matched on the wording, the offer and the ads the brief lists. These are the closest ads, not a full list.'}
            </p>
          </>
        ) : (
          <p className="text-[14px] text-ink-3">No single ad matches this point closely. It is drawn from across the ads behind the brief.</p>
        )}
      </section>
    </Drawer>
  )
}

/** Where a hook pattern came from: the ads behind it (nwBrHookOpen). */
function HookDrawer({ text, ads, onClose }: { text: string; ads: Ad[]; onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} label="hook-drawer" eyebrow="Where this hook pattern came from" title={text}>
      <section className="mt-5">
        <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">The ads behind it</h4>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {ads.map((a) => (
            <li key={a.id}>
              <AdRow a={a} extra={[adClean(a.cta) ? 'Call to action: ' + adClean(a.cta) : '', a.lib && a.days !== null ? plural(a.days, 'day') + ' running' : '']} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-ink-3">The pattern is the Ad Strategist’s reading of these ads, rephrased so nothing is copied.</p>
      </section>
    </Drawer>
  )
}
