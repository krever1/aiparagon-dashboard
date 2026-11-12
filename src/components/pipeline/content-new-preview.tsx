'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Dialog } from '@/components/ui/dialog'
import { dayText } from '@/components/ui/local-date'
import { type Form, type PreviewCtx, KINDS, briefWarn, previewOf } from '@/lib/pipeline/content-new'
import { briefHref, tidy } from '@/lib/touchpoint/approvals'
import { btn, primary } from './bits'

// See everything it will use (v97PlanPreview), drawn from the same pieces the request is built from: what is being made,
// the substance (the material or the idea), who it is for and what next, what the team asked for (the answers, what it
// must use, notes, what was asked on earlier drafts, what the briefs leave out), the brief it leads with, the voice and
// the structure, then a warning about the brief when there is one. Nothing is written until Generate.

const kicker = 'text-[12px] font-semibold uppercase tracking-wide text-ink-3'

export function PlanPreview({
  f,
  ctx,
  tz,
  ready,
  onClose,
  onGenerate,
}: {
  f: Form
  ctx: PreviewCtx
  tz: string | undefined
  ready: boolean
  onClose: () => void
  onGenerate: () => void
}) {
  const short = (iso: string) => dayText(iso, tz).replace(/ \d{4}$/, '')
  const P = previewOf(f, ctx, short)
  const paid = f.kind === 'adcopy'
  const pick = paid ? ctx.ads : ctx.org
  const warn = briefWarn(pick, paid, ctx.now, short)
  const run = pick.use?.runId ?? pick.newest?.runId
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Content Transformation"
      title="Draft plan preview"
      width={760}
      footer={
        <>
          <button type="button" className={btn} onClick={onClose}>
            Back to the form
          </button>
          <button type="button" className={primary} disabled={!ready} onClick={onGenerate}>
            Generate draft →
          </button>
        </>
      }
    >
      <p className="text-[14px] text-ink-2">What the generator will use. Nothing is written until you press Generate.</p>
      <div className="mt-4 grid gap-4" data-testid="plan-preview">
        <Sec k="What you are making">
          <p className="text-[16px] font-semibold text-ink">{P.making.big}</p>
          <p className="text-[13.5px] text-ink-2">{P.making.d}</p>
        </Sec>
        <Sec k="Substance from you">
          {P.substance.misses.map((m) => (
            <p key={m} className="text-[13.5px] font-semibold text-warn">
              {m}
            </p>
          ))}
          <Rows rows={P.substance.rows} />
          {P.substance.quote ? <blockquote className="mt-1 border-l-2 border-line pl-3 text-[13.5px] italic text-ink-2">{P.substance.quote}</blockquote> : null}
        </Sec>
        <Sec k="Who it is for, and what next">
          <Rows rows={P.who} />
        </Sec>
        {P.asked.length ? (
          <Sec k="What you asked for">
            <Rows rows={P.asked} />
          </Sec>
        ) : null}
        <Sec k="Market signals">
          {P.signals.lead ? (
            <p className="text-[13.5px] text-ink">
              <b className="font-semibold">{paid ? 'Ad findings lead:' : 'Organic signals lead:'}</b> {P.signals.lead}
            </p>
          ) : (
            <p className="text-[13.5px] font-semibold text-warn">{P.signals.miss}</p>
          )}
          {P.signals.items.length ? (
            <ol className="mt-1 grid list-decimal gap-1 pl-5 text-[13.5px] text-ink">
              {P.signals.items.map((x, i) => (
                <li key={i}>
                  {tidy(x.text)}
                  {x.why ? <small className="block text-[12.5px] text-ink-3">{tidy(x.why)}</small> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {P.signals.support ? <p className="text-[13px] text-ink-2">{P.signals.support}</p> : null}
        </Sec>
        <Sec k="Voice">
          <p className="text-[13.5px] text-ink">{P.voice}</p>
        </Sec>
        <Sec k="Structure">
          {'none' in P.structure ? (
            <p className="text-[13.5px] text-ink">{P.structure.none}</p>
          ) : (
            <>
              <p className="text-[13.5px] font-semibold text-ink">{P.structure.name || KINDS[f.kind].t}</p>
              <ol className="mt-1 grid list-decimal gap-1 pl-5 text-[13.5px] text-ink">
                {P.structure.sections.map((s, i) => (
                  <li key={i}>
                    {s.title}
                    {s.guidance ? <small className="block text-[12.5px] text-ink-3">{s.guidance}</small> : null}
                  </li>
                ))}
              </ol>
              {P.structure.rules ? <p className="mt-1 text-[13px] text-ink-2">{P.structure.rules}</p> : null}
            </>
          )}
        </Sec>
      </div>
      {warn ? (
        <div className="mt-4 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13.5px]" data-testid="brief-warn">
          <p className="text-ink">{warn.text}</p>
          {warn.link === 'brief' && run ? (
            <Link href={briefHref(run, paid ? 'ads' : 'organic')} className="font-semibold text-accent-text hover:underline" onClick={onClose}>
              Review it →
            </Link>
          ) : (
            <Link href={paid ? '/ad-strategist' : '/intel-tracker'} className="font-semibold text-accent-text hover:underline" onClick={onClose}>
              Open the {paid ? 'Ad Strategist' : 'Intel Tracker'} →
            </Link>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}

function Sec({ k, children }: { k: string; children: ReactNode }) {
  return (
    <section className="grid gap-1 border-b border-line pb-3 last:border-0">
      <span className={kicker}>{k}</span>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: (readonly [string, string])[] }) {
  return (
    <>
      {rows.map(([l, v]) => (
        <p key={l} className="text-[13.5px] text-ink">
          <b className="font-semibold">{l}:</b> {v}
        </p>
      ))}
    </>
  )
}
