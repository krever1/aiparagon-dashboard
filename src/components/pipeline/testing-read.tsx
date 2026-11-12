'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, History, Sparkles } from 'lucide-react'
import { checkRead, rememberLine, startRead } from '@/app/(app)/ad-testing/read-actions'
import { ErrorNotice } from '@/components/catalyst/bits'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import type { TestingData } from '@/lib/pipeline/ad-testing-load'
import {
  type Go, type MemKind, type Outcome, type Read, type Rec, type Ref, type RunState, INFO_INS, PRIORITY, SLOW_TEXT, type Run, chips, clipWord, dayShort, evidenceOf, formatName, gapsOf,
  hasMore, makeIn, memId, parts, readLine, refGo, refLabel, runState, sharpenOf, startedAgo,
} from '@/lib/pipeline/strategy'
import { Empty, Tag, btn, inputCls, primary } from './bits'
import { OUT_TIP, legacy } from './briefs-parts'

// The Strategy read tab (nwTsReadHtml as v107 left it, with v98's run, v106's Remember and v113's daily read): the read
// on screen, a read being made or what became of it, what the next read reads with New read, and the earlier reads.
// A read started here is kept for the team (ai_settings strategy_runs), so a teammate's shows as running too; the page
// checks for it every 5 seconds for five minutes, then every 30 seconds while it says it is taking longer.

const PAGE_NAME: Record<string, string> = { 'marketing-generation': 'Marketing Generation', 'content-transformation': 'Content Transformation' }
const chipCls = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-semibold'

function InfoButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={INFO_INS.title}
        title={INFO_INS.title}
        className="ml-1 inline-grid h-[18px] w-[18px] place-items-center rounded-full border border-line-2 align-middle text-[11px] font-semibold text-ink-3 hover:border-accent hover:text-accent-text"
      >
        i
      </button>
      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          kicker="How it works"
          title={INFO_INS.title}
          width={560}
          footer={
            <button type="button" className={primary} onClick={() => setOpen(false)}>
              Got it
            </button>
          }
        >
          {INFO_INS.body.map((p, i) => (
            <p key={i} className="mb-2.5 text-[14.5px] leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
        </Dialog>
      ) : null}
    </>
  )
}

/** A source of the read where it opens: the briefs here, Results on this page, anything else in the current dashboard. */
function GoTo({ go, onResults, className, title, children }: { go: Go; onResults: () => void; className: string; title?: string; children: ReactNode }) {
  if ('href' in go)
    return (
      <Link href={go.href} className={className} title={title}>
        {children}
      </Link>
    )
  if ('legacy' in go)
    return (
      <a href={legacy(go.legacy)} className={className} title={title ? title + ' · ' + OUT_TIP : OUT_TIP}>
        {children}
      </a>
    )
  return (
    <button type="button" className={className} title={title} onClick={onResults}>
      {children}
    </button>
  )
}

/** A text from the read, its codes as chips naming what it read (v98Txt). */
function Txt({ s, refs }: { s: string; refs: Record<string, Ref> }) {
  return (
    <>
      {parts(s, refs).map((p, i) =>
        'text' in p ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span key={i} title={p.label} className="ml-1 inline-flex rounded-sm bg-accent-soft px-1.5 py-px align-baseline text-[12px] font-semibold text-accent-text" data-testid="ref-chip">
            {p.short}
          </span>
        ),
      )}
    </>
  )
}

function Col({ kicker, tone, children }: { kicker: string; tone?: 'good' | 'warn'; children: ReactNode }) {
  const border = tone === 'good' ? 'border-l-good' : tone === 'warn' ? 'border-l-warn' : 'border-l-line-2'
  return (
    <div className={`min-w-0 rounded-md border border-line border-l-[3px] ${border} bg-panel p-3.5`}>
      <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{kicker}</div>
      <div className="grid gap-2 text-[14.5px] leading-relaxed text-ink-2">{children}</div>
    </div>
  )
}

const Faint = ({ children }: { children: ReactNode }) => <p className="text-[14px] text-ink-3">{children}</p>

function List({ items, refs, after }: { items: string[]; refs: Record<string, Ref>; after?: (i: number) => ReactNode }) {
  return (
    <ul className="grid list-disc gap-1.5 pl-5">
      {items.map((x, i) => (
        <li key={i}>
          <Txt s={x} refs={refs} />
          {after ? after(i) : null}
        </li>
      ))}
    </ul>
  )
}

function RecItem({ r, i, refs, onResults }: { r: Rec; i: number; refs: Record<string, Ref>; onResults: () => void }) {
  const ev = evidenceOf(r, refs)
  const where = makeIn(r)
  const more = r.why || r.angle || ev.length
  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-line py-3 last:border-0" data-testid="read-rec">
      <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunk text-[12.5px] font-semibold text-ink-2">
        {i + 1}
      </span>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span className="text-[15px] font-semibold text-ink">{r.title}</span>
        <span className="flex flex-wrap gap-1.5">
          {r.priority ? <Tag gold={r.priority === 'now'}>{PRIORITY[r.priority] || r.priority}</Tag> : null}
          <Tag>{formatName(r.format)}</Tag>
        </span>
        {more ? (
          <details className="group">
            <summary className="w-fit cursor-pointer list-none text-[13.5px] font-semibold text-accent-text hover:underline">
              Why
              <ChevronDown size={14} aria-hidden="true" className="ml-0.5 inline transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-1.5 grid gap-1.5 text-[14px] leading-relaxed text-ink-2">
              {r.why ? (
                <p>
                  <Txt s={r.why} refs={refs} />
                </p>
              ) : null}
              {r.angle ? (
                <p>
                  <b className="font-semibold text-ink">The angle:</b> <Txt s={r.angle} refs={refs} />
                </p>
              ) : null}
              {ev.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {ev.map((e) => (
                    <GoTo key={e.code} go={refGo(e.ref)} onResults={onResults} className={chipCls + ' border-line bg-panel text-ink-2 hover:border-accent hover:text-accent-text'}>
                      {refLabel(e.ref)}
                    </GoTo>
                  ))}
                </span>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
      <a href={legacy(where)} className={btn} title={'Opens ' + PAGE_NAME[where] + ' in the current dashboard'}>
        Create
        <ArrowRight size={14} aria-hidden="true" />
      </a>
    </li>
  )
}

/** Remember on a line of Double down or Change or stop (v106Remember). */
function RememberButton({ on, saving, onClick }: { on: boolean; saving: boolean; onClick: () => void }) {
  return (
    <>
      {' '}
      <button
        type="button"
        disabled={on || saving}
        onClick={onClick}
        className={`ml-1 inline-flex rounded-full border px-2 py-0.5 align-baseline text-[12px] font-semibold ${
          on ? 'border-good/40 bg-good-soft text-good' : 'border-line text-ink-2 hover:border-accent hover:text-accent-text'
        } disabled:cursor-default`}
        data-testid="remember"
      >
        {on ? 'Remembered' : saving ? 'Saving…' : 'Remember'}
      </button>
    </>
  )
}

function ReadCard({
  r,
  now,
  tz,
  remembered,
  onRemember,
  saving,
  onResults,
}: {
  r: Read
  now: number
  tz: string | undefined
  remembered: Set<string>
  onRemember: (k: MemKind, i: number) => void
  saving: string
  onResults: () => void
}) {
  const gaps = gapsOf(r)
  const sharpen = sharpenOf(r)
  const rem = (k: MemKind) =>
    function After(i: number) {
      const id = memId(r.id, k, i)
      return <RememberButton on={remembered.has(id)} saving={saving === id} onClick={() => onRemember(k, i)} />
    }
  return (
    <article className="mb-4 rounded-lg border border-line bg-panel p-5 shadow-card" data-testid="read-card">
      <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3" data-testid="read-line">
        {readLine(r, now, tz)}
      </div>
      <h2 className="font-display text-[24px] font-semibold leading-tight text-ink">{r.headline || r.title}</h2>
      {r.focus ? (
        <p className="mt-1.5 text-[14.5px] text-ink-2">
          <b className="font-semibold text-ink">You asked:</b> {r.focus}
        </p>
      ) : null}
      {r.flags.length ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-[14px] text-ink" role="note">
          <AlertTriangle size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          <span>{r.flags.join(' ')}</span>
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 min-[900px]:grid-cols-3">
        <Col kicker="Why">
          {r.summary ? (
            <p>
              <Txt s={r.summary} refs={r.refs} />
            </p>
          ) : (
            <Faint>Not given.</Faint>
          )}
        </Col>
        <Col kicker="Fits your offer">
          {r.visionRead ? (
            <p>
              <Txt s={r.visionRead} refs={r.refs} />
            </p>
          ) : (
            <Faint>Not given.</Faint>
          )}
        </Col>
        <Col kicker="Gaps">{gaps.length ? <List items={gaps} refs={r.refs} /> : <Faint>None found.</Faint>}</Col>
      </div>
      {r.recs.length ? (
        <div className="mt-5">
          <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Make next</div>
          <ol className="grid" aria-label="Make next">
            {r.recs.map((x, i) => (
              <RecItem key={i} r={x} i={i} refs={r.refs} onResults={onResults} />
            ))}
          </ol>
        </div>
      ) : null}
      {hasMore(r) ? (
        <details className="group mt-4 rounded-md border border-line" data-testid="read-more">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-[14px] font-semibold text-ink">
            More from this read
            <ChevronDown size={17} aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-line p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[761px]:grid-cols-2">
              <Col kicker="Double down" tone="good">
                {r.doubleDown.length ? <List items={r.doubleDown} refs={r.refs} after={rem('dd')} /> : <Faint>Nothing yet.</Faint>}
              </Col>
              <Col kicker="Change or stop" tone="warn">
                {r.changeOrStop.length ? <List items={r.changeOrStop} refs={r.refs} after={rem('cs')} /> : <Faint>Nothing yet.</Faint>}
              </Col>
            </div>
            {r.contentMix ? (
              <Col kicker="Content mix">
                <p>
                  <Txt s={r.contentMix} refs={r.refs} />
                </p>
              </Col>
            ) : null}
            {sharpen.length ? (
              <Col kicker="To sharpen the next read">
                <List items={sharpen} refs={r.refs} />
              </Col>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  )
}

/**
 * Where a read started from the dashboard stands, checked by the page on any tab (v98InsPoll): every 5 seconds while
 * it runs, then every 30 while it is taking longer. A read started here counts before the page's data has it; what the
 * checks found counts until the data says so too. `onReady` hears of a read that landed.
 */
export function useStrategyRun(data: TestingData, now: number, onReady: () => void) {
  const [mine, setMine] = useState<Run | null>(null)
  const [seen, setSeen] = useState<Outcome[]>([])
  const runs = mine && !data.runs.some((r) => r.runId === mine.runId) ? [...data.runs, mine] : data.runs
  const outcomes = [...data.outcomes, ...seen.filter((o) => !data.outcomes.some((x) => x.runId === o.runId))]
  const state = runState(runs, outcomes, now)
  const running = state?.st === 'running'
  const watching = running || state?.st === 'slow' ? state.run.runId : ''
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  })
  useEffect(() => {
    if (!watching) return
    let live = true
    const t = setInterval(
      () => {
        checkRead(watching)
          .then((x) => {
            if (!live || x.state === 'wait') return
            setSeen((s) => [...s.filter((o) => o.runId !== watching), { runId: watching, ok: x.state === 'ok', error: x.state === 'err' ? x.error : '' }])
            if (x.state === 'ok') {
              ready.current()
              toast('The strategy read is ready.')
            }
          })
          .catch(() => {})
      },
      running ? 5000 : 30000,
    )
    return () => {
      live = false
      clearInterval(t)
    }
  }, [watching, running])
  return { state, started: setMine }
}

export function ReadTab({
  data,
  now,
  tz,
  onResults,
  state,
  onStarted,
  selId,
  onSel,
}: {
  data: TestingData
  now: number
  tz: string | undefined
  onResults: () => void
  state: RunState
  onStarted: (run: Run) => void
  /** the read on screen, by its id; none means the newest */
  selId: string
  onSel: (id: string) => void
}) {
  const [focus, setFocus] = useState('')
  const [starting, setStarting] = useState(false)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState('')
  const [rememberedNow, setRememberedNow] = useState<string[]>([])
  const cardRef = useRef<HTMLDivElement>(null)
  const running = state?.st === 'running'

  const start = async () => {
    if (starting || running) return
    setStarting(true)
    setErr('')
    const x = await startRead({ focus }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setStarting(false)
    if (!x.ok) return setErr(x.error)
    onStarted(x.run)
    setFocus('')
  }

  const remember = async (r: Read, k: MemKind, i: number) => {
    const id = memId(r.id, k, i)
    if (saving) return
    setSaving(id)
    const x = await rememberLine({ readId: r.id, k, i }).catch(() => ({ ok: false as const, error: 'Not saved: could not reach the dashboard.' }))
    setSaving('')
    if (!x.ok) return toast(x.error, 'warn')
    setRememberedNow((s) => [...s, id])
    toast('Remembered. New drafts and campaigns use it. It is listed in the client profile.')
  }

  const H = data.reads
  const found = H.findIndex((r) => r.id === selId)
  const at = found >= 0 ? found : 0
  const row = H[at] ?? null
  const remembered = new Set([...data.remembered, ...rememberedNow])
  const show = (i: number) => {
    onSel(i ? (H[i]?.id ?? '') : '')
    cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)]" data-testid="read-tab">
      {running ? (
        <div className="mb-4 grid gap-2 rounded-md border border-line bg-panel px-4 py-3 text-[14px] text-ink-2" role="status" data-testid="read-running">
          <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
            <i className="block h-full w-[55%] animate-pulse rounded-full bg-accent" />
          </div>
          <span>Reading your content and results. Started {startedAgo(state.run.t, now)}. About a minute.</span>
        </div>
      ) : null}
      {state?.st === 'slow' ? <ErrorNotice>{SLOW_TEXT}</ErrorNotice> : null}
      {state?.st === 'failed' ? <ErrorNotice>{state.error}</ErrorNotice> : null}
      {err ? <ErrorNotice>{err}</ErrorNotice> : null}
      {data.readsError ? <ErrorNotice>Could not load the strategy reads: {data.readsError}</ErrorNotice> : null}

      <div ref={cardRef} className="scroll-mt-4">
        {row ? (
          <ReadCard
            r={row}
            now={now}
            tz={tz}
            remembered={remembered}
            saving={saving}
            onRemember={(k, i) => void remember(row, k, i)}
            onResults={onResults}
          />
        ) : !running && !data.readsError ? (
          <Empty
            icon={<Sparkles size={30} aria-hidden="true" />}
            title="No strategy read yet"
            text="Press New read below. It reads your briefs, voice, campaigns, drafts and results, then suggests what to make next."
          />
        ) : null}
      </div>

      <section className="mb-4 rounded-lg border border-line bg-panel p-4" data-testid="read-ask">
        <div className="mb-2 flex items-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          What it read
          <InfoButton />
        </div>
        {data.info ? (
          <ul className="mb-3 flex flex-wrap gap-2" aria-label="What it read" data-testid="read-chips">
            {chips(data.info, now, tz).map((c) => (
              <li key={c.label}>
                <GoTo
                  go={c.go}
                  onResults={onResults}
                  className={chipCls + (c.ok ? ' border-line bg-panel text-ink-2 hover:border-accent hover:text-accent-text' : ' border-warn/50 bg-warn-soft text-ink hover:border-warn')}
                >
                  {c.label} <b className="font-semibold text-ink">{c.value}</b>
                </GoTo>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-[13.5px] text-ink-3">Could not check what it reads.</p>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <label htmlFor="read-focus" className="sr-only">
            Anything to focus on?
          </label>
          <input
            id="read-focus"
            className={inputCls + ' min-w-0 flex-[1_1_260px]'}
            maxLength={400}
            autoComplete="off"
            placeholder="Anything to focus on? e.g. What should we post next month to book more diagnostic calls?"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
          <button type="submit" className={primary} disabled={running || starting}>
            <Sparkles size={15} aria-hidden="true" />
            {running ? 'Reading…' : starting ? 'Starting…' : 'New read'}
          </button>
        </form>
        <p className="mt-2 text-[13px] text-ink-3" data-testid="read-eta">
          {running ? 'Started ' + startedAgo(state.run.t, now) + '. You can leave this page.' : 'About a minute. It reads your briefs, voice, campaigns, drafts and results.'}
        </p>
      </section>

      {H.length > 1 ? (
        <details className="group rounded-lg border border-line bg-panel" data-testid="read-history">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14.5px] font-semibold text-ink">
            <History size={17} aria-hidden="true" className="text-ink-3" />
            Earlier reads
            <span className="rounded-full bg-sunk px-2 text-[12.5px] font-semibold text-ink-2">{H.length - 1}</span>
            <ChevronDown size={16} aria-hidden="true" className="ml-auto text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="border-t border-line">
            {H.map((r, i) => (
              <li key={r.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => show(i)}
                  aria-current={i === at ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunk ${i === at ? 'bg-accent-soft/40' : ''}`}
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <b className="truncate text-[14px] font-semibold text-ink">{clipWord(r.headline || r.title, 120)}</b>
                    <span className="text-[12.5px] text-ink-3">
                      {dayShort(r.createdAt, now, tz) + (r.daily ? ' · Daily read' : r.requestedBy ? ' · asked by ' + r.requestedBy.split('@')[0] : '')}
                    </span>
                  </span>
                  {i === at ? (
                    <span className="shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-[12px] font-semibold text-info">On screen</span>
                  ) : (
                    <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
