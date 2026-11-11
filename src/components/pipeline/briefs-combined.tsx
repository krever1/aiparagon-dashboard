'use client'

import { useState } from 'react'
import { ArrowUpRight, Check, ChevronRight, FileText, PenLine, Rocket } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'
import { dayText, useHydrated } from '@/components/ui/local-date'
import { agoText } from '@/lib/catalyst/calls'
import { PILL, comboCards, decLine } from '@/lib/pipeline/briefs'
import type { Creative } from '@/lib/pipeline/briefs-load'
import { FORMATS, tidy } from '@/lib/touchpoint/approvals'
import { Pill, btn, linkCls, primary } from './bits'
import { type BCtx, OUT_TIP, legacy } from './briefs-parts'

// The Combined tab (nwBrComboHtml): six cards built from both briefs (the newest approved one of each, else the newest)
// and the company profile, then the creative briefs Content Transformation wrote from the team's own material, each
// with Approve and Request changes.

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function ComboView({ ctx }: { ctx: BCtx }) {
  const c = ctx.data.combo
  const [open, setOpen] = useState<string | null>(null)
  if (!c) return null
  const { tz } = ctx
  const cards = comboCards({ ...c.input, day: (iso) => dayText(iso, tz) })
  const using = [
    c.org ? 'the organic brief of ' + dayText(c.org.createdAt, tz) + (c.org.ok ? ' (approved)' : ' (not approved yet)') : '',
    c.ads ? 'the ads brief of ' + dayText(c.ads.createdAt, tz) + (c.ads.ok ? ' (approved)' : ' (not approved yet)') : '',
  ].filter(Boolean)
  const cr = open ? c.creatives.find((x) => x.id === open) : undefined

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {c.profileError ? <p className="text-[13.5px] text-bad">Could not read all of the company profile: {c.profileError}</p> : null}
      <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-3" data-testid="combo-cards">
        {cards.map((k) => (
          <div key={k.k} className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="combo-card">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{k.label}</p>
            {k.value ? <b className="text-[15px] font-semibold leading-snug text-ink">{k.value}</b> : <span className="text-[15px] text-ink-3">Not set yet</span>}
            {k.value && k.source ? (
              <small className="text-[12.5px] text-ink-3">{k.source}</small>
            ) : !k.value && k.add ? (
              <a href={legacy('company-profile')} title={OUT_TIP} className={linkCls + ' text-[13px]'}>
                Add it
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-4 shadow-card">
        {c.ads ? (
          <a href={legacy('marketing-generation')} title={OUT_TIP} className={primary}>
            <Rocket size={15} aria-hidden="true" />
            Make ads from this
          </a>
        ) : (
          <button type="button" className={primary} disabled>
            <Rocket size={15} aria-hidden="true" />
            Make ads from this
          </button>
        )}
        <p className="min-w-0 grow basis-[300px] text-[13.5px] text-ink-2" data-testid="combo-using">
          Built from both briefs and your company profile. It updates when either brief is approved.
          {using.length ? ' Using ' + using.join(' and ') + '.' : ''}
        </p>
      </div>

      {c.creatives.length ? (
        <section className="rounded-lg border border-line bg-panel p-5 shadow-card" data-testid="creatives">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">From your content</p>
              <h3 className="mt-1 font-display text-[19px] font-semibold text-ink">Creative briefs</h3>
            </div>
            <span className="text-[13px] text-ink-3">Each joins your source with both briefs. Review it with its draft.</span>
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
            {c.creatives.map((x) => {
              const [tone, word] = PILL[x.state]
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => setOpen(x.id)} className="flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-sunk" data-testid="creative">
                    <FileText size={17} aria-hidden="true" className="shrink-0 text-ink-2" />
                    <span className="min-w-0 grow">
                      <b className="block truncate text-[14.5px] text-ink">{tidy(x.title)}</b>
                      <small className="block truncate text-[12.5px] text-ink-3">
                        {[FORMATS[x.format] || x.format, 'from ' + (x.from || 'your content'), dayText(x.createdAt, tz)].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    <Pill tone={tone}>{word}</Pill>
                    <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {cr ? <CreativeDrawer ctx={ctx} c={cr} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

const lines = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => tidy(str(x))).filter(Boolean) : str(v).trim() ? [tidy(v)] : [])

/** A creative brief: what it took from the team's source and the market, and the draft it goes with (nwBrCreativeOpen). */
function CreativeDrawer({ ctx, c, onClose }: { ctx: BCtx; c: Creative; onClose: () => void }) {
  const hydrated = useHydrated()
  const b = c.brief
  const [tone, word] = PILL[c.state]
  const parts: [string, string[]][] = [
    ['Your substance', lines(b.substance)],
    ['Market packaging', lines(b.packaging)],
    ['Strategic decisions', lines(b.strategic)],
    ['Claims and where they come from', lines(b.claims)],
  ]
  const asked = tidy(b.requested_outputs)
  return (
    <Drawer
      open
      onClose={onClose}
      label="creative-drawer"
      eyebrow={'Creative brief · ' + dayText(c.createdAt, ctx.tz)}
      title={tidy(c.title)}
      meta={
        <>
          <Pill tone={tone}>{word}</Pill>
          <span className="text-[12.5px] text-ink-3">{(FORMATS[c.format] || c.format || 'Draft') + ' · from ' + (c.from || 'your content')}</span>
        </>
      }
      footer={
        <>
          {c.outputId ? (
            <a href={legacy('content-transformation')} title={OUT_TIP} className={btn}>
              See the draft
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ) : null}
          <span className="grow" />
          <button
            type="button"
            className={btn}
            onClick={() => {
              onClose()
              ctx.askChanges('creative', c.id, 'Creative brief · ' + dayText(c.createdAt, ctx.tz))
            }}
          >
            <PenLine size={15} aria-hidden="true" />
            Request changes
          </button>
          {c.state !== 'ok' ? (
            <button
              type="button"
              className={primary}
              disabled={ctx.busy === c.id}
              onClick={() =>
                void ctx.approve('creative', c.id).then((ok) => {
                  if (ok) onClose()
                })
              }
            >
              <Check size={15} aria-hidden="true" />
              {ctx.busy === c.id ? 'Approving…' : 'Approve'}
            </button>
          ) : null}
        </>
      }
    >
      {parts.map(([h, items]) =>
        items.length ? (
          <section key={h} className="mt-5">
            <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{h}</h4>
            <ul className="list-disc pl-5 text-[14px] text-ink-2">
              {items.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {asked ? (
        <section className="mt-5">
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Asked for</h4>
          <p className="text-[14px] text-ink-2">{asked}</p>
        </section>
      ) : null}
      <p className="mt-5 text-[13px] text-ink-3" data-testid="creative-decision">
        {decLine(c.decision, 'The draft is written alongside this brief. Review both before anything is published.', (iso) => (hydrated ? agoText(iso) : dayText(iso, 'UTC')))}
      </p>
    </Drawer>
  )
}
