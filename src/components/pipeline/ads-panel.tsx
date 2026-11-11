'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, PenLine, Plus, Repeat } from 'lucide-react'
import { setInBrief, setScore } from '@/app/(app)/ad-strategist/actions'
import { Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { dateText, dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type AdView, type CapEntry, FX, bandOf, partsSum, pickText, whyShort } from '@/lib/pipeline/ad-strategist'
import { briefHref } from '@/lib/touchpoint/approvals'
import { Pill, Ring, Tag, btn, ghost, inputCls, linkCls, primary } from './bits'
import { OUT_TIP, legacy } from './briefs-parts'
import { AdPreview, LiveTag, clean, clip, isWeb, plural } from './ads-cards'
import { AdInfoButton } from './ads-info'
import type { ACtx } from './ads-view'

// An ad in full (nwAdOpen with v113AdDress): its preview, what to take from it, its offer, its score and fit, which
// briefs it went into, its copy and patterns, whether the next ads brief uses it, and its details. Read this ad and
// Utilize this ad copy are still in the current dashboard.

const STAGE: Record<string, string> = { tof: 'Top of funnel', mof: 'Middle of funnel', bof: 'Bottom of funnel' }
const H = 'mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3'

function Sec({ h, children, test }: { h: React.ReactNode; children: React.ReactNode; test?: string }) {
  return (
    <section className="mb-5" data-testid={test}>
      <h3 className={H + ' flex items-center'}>{h}</h3>
      {children}
    </section>
  )
}

export function AdPanel({
  ctx,
  a,
  onClose,
  onFollowing,
  onIndustries,
}: {
  ctx: ACtx
  a: AdView
  onClose: () => void
  onFollowing: () => void
  onIndustries: () => void
}) {
  const { tz, data } = ctx
  const [scoring, setScoring] = useState(false)
  const c = ctx.caps[a.id]
  const fit = ctx.fitOf(a)
  const day = (iso: string) => dayText(iso, tz)

  const meta = (
    <>
      {a.up || a.sw ? (
        <>
          <Tag gold>{(a.sw ? 'From Notion ' : 'Uploaded ') + day(a.createdAt)}</Tag>
        </>
      ) : (
        <>
          <LiveTag a={a} tz={tz} stoppedDay />
          {a.days !== null ? <Tag>{plural(a.days, 'day') + ' running'}</Tag> : null}
        </>
      )}
      {!a.inBrief ? <Pill>Left out of briefs</Pill> : null}
      {a.pend ? <Pill tone="warn">Not read yet</Pill> : null}
    </>
  )

  // what to take from it: the upload's own takeaways, else built from what the agent read (v113AdKeyHtml)
  const keys = a.takeaways.length
    ? a.takeaways.slice(0, 5)
    : [
        !a.dyn && a.hook.trim() ? 'Opens with “' + clip(clean(a.hook), 110) + '”' : '',
        a.offer ? 'Offers ' + clip(clean(a.offer), 120) + (a.price !== null ? (a.price > 0 ? ' (about $' + a.price + ')' : ' (free)') : '') : '',
        a.copyFormula.trim() ? 'Built as ' + clean(a.copyFormula) : '',
        ...a.patterns.slice(0, 3),
      ].filter(Boolean)
  const findings = data.findings[a.id] ?? []

  const url = isWeb(a.url) ? a.url : ''
  return (
    <>
      <Drawer
        open
        onClose={onClose}
        label="ad-panel"
        eyebrow={a.adv + (a.industry ? ' · ' + a.industry : '')}
        title={clip(clean(a.title), 140)}
        meta={meta}
        footer={
          <>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className={btn}>
                View in Meta Ad Library
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : null}
            {a.pend ? (
              <a href={legacy('ad-strategist')} title={OUT_TIP} className={btn}>
                Read this ad
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : null}
            <span className="grow" />
            <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
              <Plus size={15} aria-hidden="true" />
              Utilize this ad copy
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </>
        }
      >
        <div className="mb-5">
          <AdPreview a={a} big />
        </div>

        <section className="mb-5 rounded-md border border-accent/30 bg-accent-soft p-3.5" data-testid="ad-key">
          <h3 className={H}>Key takeaways</h3>
          {keys.length ? (
            <ul className="grid list-disc gap-1 pl-5 text-[14px] text-ink-2">
              {keys.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-2">{a.pend ? 'Not read yet. Use “Read this ad” below.' : 'Nothing read from this ad yet.'}</p>
          )}
          {a.visualHook || a.textOnImage ? (
            <p className="mt-2 text-[12.5px] text-ink-3">
              {[a.visualHook ? 'The image: ' + clip(a.visualHook, 140) : '', a.textOnImage ? 'Text on it: “' + clip(a.textOnImage, 90) + '”' : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          <div className="mt-3">
            <b className="mb-1 block text-[13px] text-ink">How it fits your strategy</b>
            {findings.length ? (
              <>
                <p className="text-[13.5px] text-ink-2">It backs {findings.length === 1 ? 'this finding' : 'these findings'} in the ads brief:</p>
                <ul className="mt-1 grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">
                  {findings.slice(0, 3).map((x, i) => (
                    <li key={i}>
                      {x.text}
                      <span className="text-ink-3"> · {day(x.date)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : fit && fit.hits.length ? (
              <p className="text-[13.5px] text-ink-2">Not behind a brief finding yet. It matches {fit.hits.slice(0, 3).join(', ')}.</p>
            ) : (
              <p className="text-[13.5px] text-ink-3">Not behind a brief finding yet.</p>
            )}
          </div>
        </section>

        {a.dyn ? (
          <blockquote className="mb-5 border-l-4 border-line-2 pl-3 text-[13.5px] text-ink-2">
            A dynamic catalog ad. Meta fills in the product for each viewer, so the Ad Library keeps only the template. Judge it on run time and format, not
            wording.
          </blockquote>
        ) : null}

        {a.offer ? (
          <Sec h="Offer">
            <p className="text-[14.5px] text-ink">
              {clean(a.offer)}
              {/* no price stored says nothing (the old page called it free) */}
              {a.price !== null ? <span className="text-ink-3">{a.price > 0 ? ' · about $' + a.price : ' · free'}</span> : null}
            </p>
          </Sec>
        ) : null}

        <Sec h="Score" test="ad-score">
          {a.lib && a.score !== null && a.parts ? (
            <>
              <div className="mb-3 flex items-center gap-3">
                <Ring score={a.score} val={bandOf(a.score)} size={64} />
                <span>
                  <b className="block text-[15px] text-ink">{a.score} out of 100</b>
                  <span className="text-[13px] text-ink-3">From what the Ad Library shows. A shortlist for you to judge, not a verdict.</span>
                </span>
              </div>
              <ul className="grid gap-2">
                {FX.map((x) => {
                  const v = a.parts![x.k]
                  const note =
                    x.k === 'run'
                      ? a.days !== null
                        ? plural(a.days, 'day') + ' running'
                        : 'Run time unknown'
                      : x.k === 'live'
                        ? a.stale === null
                          ? 'Not known'
                          : a.stale <= 7
                            ? 'Seen running in the last 7 days'
                            : 'Last seen ' + plural(a.stale, 'day') + ' before the pull'
                        : x.k === 'rep'
                          ? a.reps > 1
                            ? 'Same copy in ' + a.reps + ' ads'
                            : 'Copy used once'
                          : v
                            ? 'Shown'
                            : 'Not shown in the Ad Library'
                  return (
                    <li key={x.k} className="rounded-md border border-line p-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13.5px]">
                        <span>
                          <b className="text-ink">{x.label}</b> <span className="text-[12px] text-ink-3">{x.w}% of score</span>
                        </span>
                        <b className="text-ink">{(v * x.w).toFixed(1)} pts</b>
                      </div>
                      <span className="my-1.5 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                        <span className="block h-full rounded-full bg-accent" style={{ width: Math.round(v * 100) + '%' }} />
                      </span>
                      <small className="text-[12.5px] text-ink-3">{note}</small>
                    </li>
                  )
                })}
              </ul>
              {a.overridden ? (
                <p className="mt-2 text-[13px] text-ink-3">The score was set by hand, so it can differ from the parts above.</p>
              ) : Math.abs(partsSum(a.parts) - a.score) > 2 ? (
                <p className="mt-2 text-[13px] text-ink-3">
                  The parts add up to {partsSum(a.parts)}. The agent stored {a.score}, worked out on the day it pulled the ad.
                </p>
              ) : null}
              <button type="button" className={linkCls + ' mt-2'} onClick={() => setScoring(true)}>
                <PenLine size={14} aria-hidden="true" />
                Change the score
              </button>
              {c?.st === 'in' ? (
                <p className="mt-2 text-[13px] text-ink-3">
                  This is today’s score. Each ads brief ranked its ads with its own score on the day it was written, shown below.
                </p>
              ) : null}
            </>
          ) : a.lib ? (
            <p className="mb-2 text-[14px] text-ink-2">Not scored yet.</p>
          ) : null}
          <FitBlock fit={fit} onFollowing={onFollowing} />
        </Sec>

        {c ? (
          <Sec
            h={
              <>
                {c.st === 'in' ? 'Captured in brief' : 'Not in a brief'}
                <AdInfoButton k="adpick" S={data.schedule} />
              </>
            }
            test="ad-cap"
          >
            {c.st === 'in' ? (
              <ul className="grid list-disc gap-1.5 pl-5 text-[14px] text-ink-2">
                {c.list.map((e) => (
                  <li key={e.B.runId}>
                    <b className="text-ink">Advertisement brief of {dateText(e.B.createdAt, tz)}:</b> {pickLong(e)}
                    {e.B.rule ? ' (' + e.B.rule + ')' : ''}.{' '}
                    <Link href={briefHref(e.B.runId, 'ads')} className={linkCls + ' text-[13.5px]'}>
                      Open the brief →
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-2">{whyShort(a, c, day)}.</p>
            )}
          </Sec>
        ) : null}

        {a.hook.trim() || a.body.trim() || a.cta.trim() ? (
          <Sec h="The copy">
            {!a.dyn && a.hook.trim() ? <blockquote className="mb-2 border-l-4 border-accent pl-3 text-[15px] font-semibold text-ink">{a.hook.trim()}</blockquote> : null}
            {a.body.trim() && a.body.trim() !== a.hook.trim() ? (
              <details className="mb-2">
                <summary className="cursor-pointer text-[13.5px] font-semibold text-accent-text">Read the rest</summary>
                <p className="mt-1.5 whitespace-pre-line text-[14px] text-ink-2">{a.body.trim()}</p>
              </details>
            ) : null}
            {a.cta.trim() ? <p className="mb-2 text-[14px] text-ink-2">Call to action: {a.cta.trim()}</p> : null}
            <button
              type="button"
              className={linkCls}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText([a.hook, a.body, a.cta].map((x) => x.trim()).filter(Boolean).join('\n\n'))
                  toast('Copied')
                } catch {
                  toast('Could not copy here', 'warn')
                }
              }}
            >
              <Repeat size={14} aria-hidden="true" />
              Copy the copy
            </button>
          </Sec>
        ) : null}

        {a.patterns.length ? (
          <Sec h="Patterns it uses">
            <span className="flex flex-wrap gap-1.5">
              {a.patterns.slice(0, 8).map((p, i) => (
                <Tag key={i}>{p}</Tag>
              ))}
            </span>
          </Sec>
        ) : null}

        <NextBrief a={a} ctx={ctx} />

        <Sec h="Details" test="ad-details">
          <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[14px]">
            <dt className="text-ink-3">Advertiser</dt>
            <dd className="text-ink">{a.adv}</dd>
            <dt className="text-ink-3">Industry</dt>
            <dd className="text-ink">
              {a.industry || (
                <>
                  <span className="text-ink-3">Not set</span> ·{' '}
                  <button type="button" className={linkCls + ' text-[14px]'} onClick={onIndustries}>
                    Set industries
                  </button>
                </>
              )}
            </dd>
            {a.funnelStage ? (
              <>
                <dt className="text-ink-3">Funnel stage</dt>
                <dd className="text-ink">{STAGE[a.funnelStage.toLowerCase()] ?? a.funnelStage}</dd>
              </>
            ) : null}
            {a.firstSeen ? (
              <>
                <dt className="text-ink-3">Seen</dt>
                <dd className="text-ink">
                  {day(a.firstSeen + 'T12:00:00Z') + (a.lastSeen && a.lastSeen !== a.firstSeen ? ' to ' + day(a.lastSeen + 'T12:00:00Z') : '')}
                </dd>
              </>
            ) : null}
            {a.runId ? (
              <>
                <dt className="text-ink-3">Found in</dt>
                <dd className="text-ink">{ctx.runLabel(a.runId)}</dd>
              </>
            ) : null}
            <dt className="text-ink-3">Source</dt>
            <dd className="text-ink">{a.up ? 'Uploaded by ' + a.uploadedBy.split('@')[0] : a.sw ? 'The Notion swipe file' : 'Meta Ad Library'}</dd>
          </dl>
        </Sec>
      </Drawer>
      {scoring ? <ScoreDialog a={a} onClose={() => setScoring(false)} /> : null}
    </>
  )
}

/** How a brief picked the ad, in full (v99AdWhyFull). */
const pickLong = (e: CapEntry) => (e.B.custom || e.meta === 'hand-picked' ? 'hand-picked by your team when the brief was built from uploads' : pickText(e, false))

/** The fit with what the team follows (v113FitHtml). */
function FitBlock({ fit, onFollowing }: { fit: { score: number; hits: string[] } | null; onFollowing: () => void }) {
  if (!fit) {
    return (
      <p className="mt-3 text-[13.5px] text-ink-2" data-testid="ad-fit">
        No fit score yet. Add topics, industries or accounts on the{' '}
        <button type="button" className={linkCls + ' text-[13.5px]'} onClick={onFollowing}>
          Following tab
        </button>
        , or your market in the company profile.
      </p>
    )
  }
  return (
    <div className="mt-3 flex items-center gap-3" data-testid="ad-fit">
      <Ring score={fit.score} val={bandOf(fit.score)} size={56} />
      <p className="text-[13.5px] text-ink-2">
        <b className="block text-ink">Fit with what you follow: {fit.score} out of 100</b>
        {fit.hits.length ? 'Matches ' + fit.hits.join(', ') + '.' : 'No match with your Following tab or your market yet.'} Scored from the Following tab and
        your company profile.
      </p>
    </div>
  )
}

/** Next ads brief: in or out of it (v113BriefHtml, v113InBrief). */
function NextBrief({ a, ctx }: { a: AdView; ctx: ACtx }) {
  const [want, setWant] = useState<boolean | null>(null)
  const on = want ?? a.inBrief
  const c = ctx.caps[a.id]
  const upl = a.up || a.sw
  const used = c?.st === 'in' ? 'Used in the ads brief' + (c.list.length > 1 ? 's' : '') + ' of ' + c.list.slice(0, 3).map((e) => dateText(e.B.createdAt, ctx.tz)).join(', ') + '. ' : 'Not in a brief yet. '
  const toggle = async (v: boolean) => {
    setWant(v)
    const r = await setInBrief({ id: a.id, on: v }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setWant(null)
    if (r.ok) toast(r.toast)
    else toast(r.error, 'warn')
  }
  return (
    <Sec h="Next ads brief" test="ad-next">
      <label className="flex items-start gap-2.5 text-[14px] text-ink">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-accent)]" checked={on} disabled={want !== null} onChange={(e) => void toggle(e.target.checked)} />
        <span>{upl ? 'Use this upload in the next ads brief' : 'Use this ad in the next ads brief'}</span>
      </label>
      <p className="mt-1.5 text-[13px] text-ink-3">
        {used}
        {on
          ? upl
            ? 'It goes into the next ones, however old it is.'
            : 'The Ad Strategist decides if it makes the short list.'
          : 'Left out of the next ones until you switch this back on.'}
      </p>
    </Sec>
  )
}

/** Change the score (editScore): 0 to 100, kept on the ad in place of the agent's. */
function ScoreDialog({ a, onClose }: { a: AdView; onClose: () => void }) {
  const [v, setV] = useState(String(a.score ?? 50))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    box.current?.focus()
    box.current?.select()
  }, [])
  const n = Number(v)
  const save = async () => {
    setErr('')
    if (v.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) return setErr('Give a score from 0 to 100.')
    setBusy(true)
    const r = await setScore({ id: a.id, score: n }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Ad Strategist"
      title="Set the score"
      width={480}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save score'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-ink-2">Your score is saved on this ad, in place of the agent’s.</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label="Score from 0 to 100"
          value={Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50}
          onChange={(e) => setV(e.target.value)}
          className="min-w-0 grow accent-[var(--color-accent)]"
        />
        <input
          ref={box}
          type="number"
          min={0}
          max={100}
          step={1}
          aria-label="Score"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
          className={inputCls + ' w-24'}
        />
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-ink-3">
        <span>0 · irrelevant</span>
        <span>100 · top signal</span>
      </div>
      {err ? (
        <p role="alert" className="mt-3 rounded-sm bg-bad-soft px-3 py-2 text-[13.5px] text-bad">
          {err}
        </p>
      ) : null}
    </Dialog>
  )
}
