'use client'

import type { ReactNode } from 'react'
import { ArrowUpRight, Check, CheckSquare, Megaphone, PenLine, Radar, Square } from 'lucide-react'
import { dayText, useHydrated } from '@/components/ui/local-date'
import { agoText } from '@/lib/catalyst/calls'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'
import { legacyUrl, pageBySlug } from '@/lib/nav'
import { CHECKS, type DecRow, HELPER, type Kind, PILL, decLine } from '@/lib/pipeline/briefs'
import type { BriefsData } from '@/lib/pipeline/briefs-load'
import { Pill, btn, linkCls, primary, selectCls } from './bits'
import { toggleCheck, useChecks } from './briefs-checks'

// The parts the briefs page's Organic and Ads tabs share: the record bar, a section, the rail and its numbers, and the
// review card with its checks.

export const OUT_TIP = 'Opens in the current dashboard'
export const legacy = (slug: string) => legacyUrl(LEGACY_DASHBOARD_URL, pageBySlug(slug))

export type DecideKind = 'organic' | 'ads' | 'creative'

export type BCtx = {
  data: BriefsData
  /** UTC while the server draws the page, the viewer's own zone after */
  tz: string | undefined
  /** approve a brief; true when it was saved */
  approve: (kind: DecideKind, id: string) => Promise<boolean>
  /** ask for changes: opens the window that asks what should change */
  askChanges: (kind: DecideKind, id: string, title: string) => void
  /** the brief being approved, while it saves */
  busy: string | null
  /** another version of the brief on screen */
  goVersion: (run: string) => void
}

// ---------- shared parts of the Organic and Ads tabs ----------

export type MetaItem = { label: string; value: ReactNode }

/** A brief's record bar (nwBrBar): what it is, when and for what, its versions, its state, Approve and Edit. */
export function RecordBar({
  ctx,
  kind,
  title,
  meta,
  versions,
  run,
  state,
  editedLine,
}: {
  ctx: BCtx
  kind: Kind
  title: string
  meta: MetaItem[]
  versions: { run: string; label: string }[]
  run: string
  state: 'ok' | 'changes' | 'pending'
  editedLine: ReactNode
}) {
  const I = kind === 'org' ? Radar : Megaphone
  const [tone, word] = PILL[state]
  return (
    <section className="mb-4 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="brief-bar">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sunk text-ink-2">
        <I size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0 grow basis-[320px]">
        <b className="block text-[16px] font-semibold text-ink">{title}</b>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2" data-testid="brief-meta">
          {meta.map((m) => (
            <span key={m.label}>
              <b className="text-ink">{m.label}</b> {m.value}
            </span>
          ))}
          {editedLine}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {versions.length > 1 ? (
          <select aria-label="Version" className={selectCls} value={run} onChange={(e) => ctx.goVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v.run} value={v.run}>
                {v.label}
              </option>
            ))}
          </select>
        ) : null}
        <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-sm border border-line">
          <span aria-pressed="true" role="button" aria-disabled="true" className="bg-sunk px-2.5 py-1.5 text-[13px] font-semibold text-ink">
            Brief
          </span>
          <a href={legacy('briefs')} title={OUT_TIP} className="border-l border-line px-2.5 py-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink">
            Structure
          </a>
        </div>
        <Pill tone={tone}>{word}</Pill>
        {state !== 'ok' ? (
          <button type="button" className={primary} disabled={ctx.busy === run} onClick={() => void ctx.approve(kind === 'org' ? 'organic' : 'ads', run)}>
            <Check size={15} aria-hidden="true" />
            {ctx.busy === run ? 'Approving…' : 'Approve brief'}
          </button>
        ) : null}
        <a href={legacy('briefs')} title={OUT_TIP} className={btn}>
          <PenLine size={15} aria-hidden="true" />
          Edit
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

/** The line a saved review adds to the record bar: who edited the brief, and putting the agent's version back. */
export function EditedLine({ by, at, original, tz }: { by: string; at: string; original: boolean; tz: string | undefined }) {
  if (!by) return null
  return (
    <span>
      <PenLine size={13} aria-hidden="true" className="mr-1 inline align-[-2px]" />
      <b className="text-ink">Edited</b> by {by.split('@')[0]} {dayText(at, tz)}
      {original ? (
        <>
          {' · '}
          <a href={legacy('briefs')} title={OUT_TIP} className={linkCls + ' text-[13px]'}>
            Put back the agent’s version
          </a>
        </>
      ) : null}
    </span>
  )
}

/** A section of a brief (nwBrSec): a kicker, a title, something on the right, and its body. */
export function Sec({ id, kicker, title, extra, children }: { id: string; kicker: string; title?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section id={'br-' + id} data-testid={'sec-' + id} className="scroll-mt-24 rounded-lg border border-line bg-panel p-5 shadow-card" aria-label={title || kicker}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{kicker}</p>
          {title ? <h3 className="mt-1 font-display text-[19px] font-semibold leading-snug text-ink">{title}</h3> : null}
        </div>
        {extra}
      </div>
      {children}
    </section>
  )
}

/** A section a team added to the layout: it is counted in the current dashboard for now. */
export function AddedSec({ id, name }: { id: string; name: string }) {
  return (
    <Sec id={id} kicker="Added section" title={name}>
      <p className="text-[14px] text-ink-2">
        Your layout adds this section. It is counted in the current dashboard for now.{' '}
        <a href={legacy('briefs')} title={OUT_TIP} className={linkCls + ' text-[14px]'}>
          Open it there
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </p>
    </Sec>
  )
}

/** The rail: the sections in page order, then the brief's numbers at a glance. */
export function Rail({ items, glance }: { items: { id: string; label: string }[]; glance: ReactNode }) {
  const jump = (id: string) => document.getElementById('br-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <aside className="grid content-start gap-4 min-[1081px]:sticky min-[1081px]:top-20">
      <section className="rounded-lg border border-line bg-panel p-4 shadow-card">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">In this brief</p>
        <nav aria-label="In this brief" className="flex flex-wrap gap-1.5 min-[1081px]:grid min-[1081px]:gap-0.5">
          {items.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => jump(x.id)}
              className="rounded-full border border-line px-3 py-1 text-left text-[13.5px] text-ink-2 hover:border-line-2 hover:text-ink min-[1081px]:rounded-md min-[1081px]:border-0 min-[1081px]:px-2.5 min-[1081px]:py-1.5 min-[1081px]:hover:bg-sunk"
            >
              {x.label}
            </button>
          ))}
        </nav>
      </section>
      {glance}
    </aside>
  )
}

/** The numbers at a glance, each with what it means. */
export function Glance({ title, rows, note, testid }: { title: string; rows: { value: string; label: string; note: string; text?: boolean }[]; note: string; testid: string }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid={testid}>
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{title}</p>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {rows.map((r) => (
          <li key={r.label}>
            <span className={r.text ? 'text-[16px] font-semibold text-ink' : 'font-display text-[24px] font-medium leading-none tabular-nums text-ink'}>{r.value}</span>{' '}
            <b className="text-[13.5px] font-semibold text-ink-2">{r.label}</b>
            <small className="block text-[12.5px] text-ink-3">{r.note}</small>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-3">{note}</p>
    </section>
  )
}

/** The review card (nwBrReview): three checks kept in this browser, Approve, Request changes and who decided. */
export function ReviewCard({ ctx, kind, run, title, state, decision }: { ctx: BCtx; kind: Kind; run: string; title: string; state: 'ok' | 'changes' | 'pending'; decision: DecRow | null }) {
  const key = kind + ':' + run
  const checks = useChecks(key)
  const hydrated = useHydrated()
  const done = checks.filter(Boolean).length
  return (
    <Sec id="review" kicker="Human review" title="Before this brief shapes a draft">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5" data-testid="brief-review">
        {CHECKS[kind].map(([t, s], i) => (
          <button
            key={t}
            type="button"
            role="checkbox"
            aria-checked={checks[i]}
            onClick={() => toggleCheck(key, i)}
            className="flex items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-sunk"
          >
            {checks[i] ? <CheckSquare size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-good" /> : <Square size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />}
            <span>
              <b className="block text-[14.5px] font-semibold text-ink">{t}</b>
              <small className="block text-[13px] text-ink-3">{s}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-[13px] text-ink-3">{done} of 3 checks done</span>
        <span className="grow" />
        {state !== 'ok' ? (
          <button type="button" className={primary} disabled={ctx.busy === run} onClick={() => void ctx.approve(kind === 'org' ? 'organic' : 'ads', run)}>
            <Check size={15} aria-hidden="true" />
            {ctx.busy === run ? 'Approving…' : 'Approve brief'}
          </button>
        ) : null}
        <button type="button" className={btn} onClick={() => ctx.askChanges(kind === 'org' ? 'organic' : 'ads', run, title)}>
          <PenLine size={15} aria-hidden="true" />
          Request changes
        </button>
      </div>
      <p className="mt-2 text-[13px] text-ink-3" data-testid="brief-decision">
        {decLine(decision, HELPER[kind], (iso) => (hydrated ? agoText(iso) : dayText(iso, 'UTC')))}
      </p>
    </Sec>
  )
}

