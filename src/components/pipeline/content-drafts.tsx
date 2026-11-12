'use client'

import { type Dispatch, type SetStateAction, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, Clock, Copy, Download, Info, Mail, Megaphone, Newspaper, PenLine, Plus } from 'lucide-react'
import { retryRequest, markReady } from '@/app/(app)/content-transformation/actions'
import { ErrorNotice } from '@/components/catalyst/bits'
import { Ago, dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import {
  CHECKS, type Draft, type Prog, asksOf, bodyOf, checkLine, draftFile, draftLine, draftText, hookLabel, hookWord, hooksText, madeFrom, madeOf,
  plural, progRows, readyOf, sourceLine,
} from '@/lib/pipeline/content'
import type { ContentData } from '@/lib/pipeline/content-load'
import { Empty, Pill, btn, ghost, primary } from './bits'
import { AskChange, InfoButton, PieceEditor, type PieceOpen } from './content-dialogs'
import { OUT_TIP, legacy, tabUrl } from './content-view'

// The Drafts tab (nwCtDraftsPaint, nwProgHtml, nwDraftRows and apCfDraftsRender with its wrappers, as v97, v100, v113
// and v126 left them): the requests still being written or that did not finish (with Try again), the drafts made from
// the team's own material, and the picked one's review under the list: the hooks, the draft as it would read, where each
// part came from, Copy and Download, Edit and save to library, the four checks and Mark ready, What should change?, and
// How this draft was made.

type Props = {
  data: ContentData
  asked: string | null
  now: number
  tz: string | undefined
  kicks: Record<string, string>
  setKicks: Dispatch<SetStateAction<Record<string, string>>>
  checks: Record<string, boolean[]>
  setChecks: Dispatch<SetStateAction<Record<string, boolean[]>>>
  onNew: () => void
}

export function DraftsTab({ data, asked, now, tz, kicks, setKicks, checks, setChecks, onNew }: Props) {
  const mine = data.reqs.filter((r) => r.sourceType !== 'brief')
  const prog = progRows(mine, now, kicks, (iso) => dayText(iso, tz))
  // a read that failed says so above whatever did load
  const notice = data.errors.drafts ? <ErrorNotice>Could not load the drafts: {data.errors.drafts}</ErrorNotice> : null
  if (!data.drafts.length) {
    return prog.length || notice ? (
      <>
        {notice}
        <ProgList rows={prog} setKicks={setKicks} />
      </>
    ) : (
      <Empty
        icon={<PenLine size={30} aria-hidden="true" />}
        title="No drafts yet"
        text="Drafts you generate show up here and wait in Approvals."
        action={
          <button type="button" className={primary} onClick={onNew}>
            <Plus size={15} aria-hidden="true" />
            New draft
          </button>
        }
      />
    )
  }
  const sel = data.drafts.find((d) => d.id === asked) ?? data.drafts[0]
  const missing = asked && asked !== sel.id ? (data.briefIds.includes(asked) ? 'brief' : 'gone') : null
  const pick = (id: string) => window.history.replaceState(null, '', tabUrl('drafts', id))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {notice}
      {missing === 'brief' ? (
        <p className="rounded-md border border-line bg-panel px-4 py-3 text-[14px] text-ink-2" data-testid="draft-elsewhere">
          That draft was made from the briefs, so it is on Marketing Generation, in the current dashboard.{' '}
          <a href={legacy('marketing-generation')} title={OUT_TIP} className="font-semibold text-accent-text hover:underline">
            Open Marketing Generation
          </a>
        </p>
      ) : missing === 'gone' ? (
        <p className="rounded-md border border-line bg-panel px-4 py-3 text-[14px] text-ink-2" data-testid="draft-elsewhere">
          That draft is not on file any more. Here is the newest one.
        </p>
      ) : null}
      <ProgList rows={prog} setKicks={setKicks} />
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-lg border border-line bg-panel p-1.5 shadow-card" aria-label="Drafts" data-testid="draft-list">
        {data.drafts.map((d) => {
          const on = d.id === sel.id
          const Ic = d.format === 'ad' ? Megaphone : d.format === 'email' ? Mail : d.format === 'newsletter' ? Newspaper : PenLine
          return (
            <li key={d.id}>
              <button
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => pick(d.id)}
                className={`flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2.5 text-left ${on ? 'bg-accent-soft' : 'hover:bg-sunk'}`}
                data-testid="draft-row"
              >
                <Ic size={18} aria-hidden="true" className="shrink-0 text-ink-2" />
                <span className="min-w-0 grow">
                  <b className="block truncate text-[14.5px] font-semibold text-ink">{d.title}</b>
                  <small className="block truncate text-[12.5px] text-ink-3">{draftLine(d, dayText(d.createdAt, tz))}</small>
                </span>
                {readyOf(d.id, data.revs) ? <Pill tone="good">Ready</Pill> : <Pill tone="warn">Needs review</Pill>}
                <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
              </button>
            </li>
          )
        })}
      </ul>
      <DraftReview key={sel.id} d={sel} data={data} checks={checks} setChecks={setChecks} tz={tz} />
    </div>
  )
}

/** The requests still being written, and the ones that did not finish or were not picked up (nwProgHtml). */
function ProgList({ rows, setKicks }: { rows: Prog[]; setKicks: Dispatch<SetStateAction<Record<string, string>>> }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!rows.length) return null
  const again = async (id: string) => {
    setBusy(id)
    const r = await retryRequest(id).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(null)
    if (!r.ok) return toast(r.error, 'warn')
    if (r.started) {
      setKicks((k) => {
        const n = { ...k }
        delete n[id]
        return n
      })
      toast('Draft started. It usually takes about a minute.')
    } else {
      setKicks((k) => ({ ...k, [id]: r.error ?? 'network error' }))
      toast('Saved, but the workflow did not start (' + (r.error ?? 'network error') + '). Try again from Drafts.', 'warn')
    }
  }
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-lg border border-line bg-panel p-1.5 shadow-card" aria-label="Being written" data-testid="draft-progress">
      {rows.map((p) => (
        <li key={p.req.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-md px-3 py-2.5" data-testid="progress-row">
          {p.tone === 'bad' ? (
            <AlertTriangle size={18} aria-hidden="true" className="shrink-0 text-bad" />
          ) : (
            <Clock size={18} aria-hidden="true" className="shrink-0 text-ink-2" />
          )}
          <span className="min-w-0 grow basis-[220px]">
            <b className="block truncate text-[14.5px] font-semibold text-ink">{p.req.title || 'Untitled'}</b>
            <small className={`block text-[12.5px] ${p.tone === 'bad' || p.line.startsWith('The workflow') ? 'text-bad' : 'text-ink-3'}`}>{p.line}</small>
          </span>
          <Pill tone={p.tone}>{p.pill}</Pill>
          {p.retry ? (
            <button type="button" className={btn} disabled={busy === p.req.id} onClick={() => void again(p.req.id)}>
              {busy === p.req.id ? 'Starting…' : 'Try again'}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** A button that copies, and says so on itself for a moment (apCfCopyText). */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={btn}
      onClick={() => {
        const ok = () => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1400)
        }
        navigator.clipboard.writeText(text).then(ok, ok)
      }}
    >
      <Copy size={14} aria-hidden="true" />
      {done ? '✓ Copied' : label}
    </button>
  )
}

function download(d: Draft) {
  const f = draftFile(d)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([f.text], { type: 'text/plain' }))
  a.download = f.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function DraftReview({
  d,
  data,
  checks,
  setChecks,
  tz,
}: {
  d: Draft
  data: ContentData
  checks: Record<string, boolean[]>
  setChecks: Dispatch<SetStateAction<Record<string, boolean[]>>>
  tz: string | undefined
}) {
  const [hi, setHi] = useState(0)
  const [trace, setTrace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [piece, setPiece] = useState<PieceOpen | null>(null)
  const req = data.reqs.find((r) => r.id === d.requestId)
  const rev = readyOf(d.id, data.revs)
  const asks = asksOf(d.id, data.revs)
  const chk = checks[d.id] ?? CHECKS.map(() => !!rev)
  const left = rev ? 0 : chk.filter((x) => !x).length
  const h = Math.min(hi, Math.max(0, d.hooks.length - 1))
  const word = hookWord(d.format)
  const body = bodyOf(d.body)
  const saved = data.pieces.find((p) => p.sourceDraftId === d.id)
  const src = sourceLine(d, req?.title ?? '')

  const ready = async () => {
    setBusy(true)
    const r = await markReady(d.id).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return toast(r.error, 'warn')
    toast('Marked ready. Nothing was published.')
  }

  return (
    <section aria-label={'Review: ' + d.title} data-testid="draft-review">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1081px]:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 rounded-lg border border-line bg-panel p-5 shadow-card" data-testid="draft-article">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3" data-testid="draft-made-from">
              {madeFrom(d)}
            </span>
            {rev ? <Pill tone="good">Ready</Pill> : <Pill tone="warn">Needs review</Pill>}
          </div>
          <h2 className="mt-1.5 break-words font-display text-[24px] font-semibold leading-tight text-ink">{d.title}</h2>
          <p className="mt-1 text-[14px] text-ink-2" data-testid="draft-source">
            {src ? src + ' · ' : ''}
            <a href={'/briefs?tab=combined&creative=' + encodeURIComponent(d.requestId)} className="font-semibold text-accent-text hover:underline">
              See the creative brief
            </a>
          </p>

          {d.hooks.length ? (
            <div role="group" aria-label={word + 's'} className="mt-4 flex flex-wrap gap-1.5" data-testid="draft-hooks">
              {d.hooks.map((x, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={i === h}
                  onClick={() => setHi(i)}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${i === h ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'}`}
                >
                  {hookLabel(d, i)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 rounded-md border border-line bg-bg p-4" data-testid="draft-paper">
            {d.hooks[h] ? <p className="mb-3 text-[16px] font-semibold leading-snug text-ink" data-testid="draft-hook">{d.hooks[h].text}</p> : null}
            <div className="grid gap-2.5 text-[15px] leading-relaxed text-ink" data-testid="draft-body">
              {body.paras.map((p, i) => (
                <p key={i} className="whitespace-pre-wrap break-words">
                  {p}
                </p>
              ))}
              {body.cards.length ? (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2 min-[641px]:grid-cols-2" data-testid="draft-cards">
                    {body.cards.map((c, i) => (
                      <div key={i} className="min-w-0 rounded-md border border-line bg-panel p-3" data-testid="draft-card">
                        <b className="block text-[14px] font-semibold text-ink">{c.h}</b>
                        {c.lines.map((l, k) => (
                          <p key={k} className={`mt-1 break-words text-[13.5px] ${l.note ? 'text-ink-3' : 'text-ink-2'}`}>
                            {l.text}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="flex items-start gap-1.5 text-[12.5px] text-ink-3">
                    <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                    These are written cards. Making the real file (slides or a cut video) comes later. For now, copy the cards into Gamma, PowerPoint or
                    your video editor.
                  </p>
                </>
              ) : null}
            </div>
            {d.cta ? <p className="mt-3 text-[15px] font-semibold text-accent-text">{d.cta} →</p> : null}
            {d.headline ? (
              <p className="mt-2 text-[13.5px] text-ink-2">
                {d.format === 'ad' ? 'Link headline: ' : 'Preview: '}
                {d.headline}
              </p>
            ) : null}
            {d.hashtags.length ? <p className="mt-2 text-[13.5px] text-info">{d.hashtags.join(' ')}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[12.5px] text-ink-3" data-testid="draft-foot">
              <span>Body · from your source</span>
              <span>{word}s · inferred market patterns</span>
              <span>Claims · {d.flags.length ? d.flags.length + ' to check' : 'none flagged'}</span>
              <button type="button" aria-expanded={trace} onClick={() => setTrace((t) => !t)} className="font-semibold text-accent-text hover:underline">
                Where each part came from
              </button>
            </div>
            {trace ? (
              <div className="mt-2 grid gap-1 text-[13px] text-ink-2" data-testid="draft-trace">
                {d.trace.body ? (
                  <p>
                    <b>Body:</b> {d.trace.body}
                  </p>
                ) : null}
                {d.trace.hooks ? (
                  <p>
                    <b>{word}s:</b> {d.trace.hooks}
                  </p>
                ) : null}
                {d.trace.claims ? (
                  <p>
                    <b>Claims:</b> {d.trace.claims}
                  </p>
                ) : null}
                {!d.trace.body && !d.trace.hooks && !d.trace.claims ? <p>The draft did not record where its parts came from.</p> : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2" data-testid="draft-actions">
            <button
              type="button"
              className={primary}
              onClick={() => setPiece(saved ? { piece: saved, fromDraft: false } : { draft: d, hi: h })}
            >
              <PenLine size={14} aria-hidden="true" />
              {saved ? 'Open saved piece' : 'Edit and save to library'}
            </button>
            <CopyButton text={draftText(d, h)} label="Copy this version" />
            {d.hooks.length > 1 ? <CopyButton text={hooksText(d)} label={'Copy all ' + word.toLowerCase() + 's'} /> : null}
            <button type="button" className={btn} onClick={() => download(d)}>
              <Download size={14} aria-hidden="true" />
              Download .txt
            </button>
          </div>
        </article>

        <aside className="min-w-0 rounded-lg border border-line bg-panel p-5 shadow-card" aria-label="Review" data-testid="draft-checks">
          <h3 className="flex items-center gap-2 font-display text-[19px] font-semibold text-ink">
            Ready for review?
            <InfoButton k="rev" />
          </h3>
          <div className="mt-3 grid gap-2.5">
            {CHECKS.map((t, i) => (
              <label key={i} className="flex items-start gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-action)]"
                  checked={rev ? true : !!chk[i]}
                  disabled={!!rev}
                  onChange={(e) =>
                    setChecks((c) => {
                      const cur = c[d.id] ?? CHECKS.map(() => false)
                      const n = cur.slice()
                      n[i] = e.target.checked
                      return { ...c, [d.id]: n }
                    })
                  }
                />
                <span>{t}</span>
              </label>
            ))}
          </div>
          {d.flags.length ? (
            <div className="mt-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13.5px] text-ink" data-testid="draft-flags">
              <b className="block">The agent flagged {plural(d.flags.length, 'thing')} to check</b>
              <ul className="mt-1 list-disc pl-5">
                {d.flags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-3 text-[13.5px] text-ink-2" role="status" data-testid="review-line">
            {rev ? (
              <>
                Marked ready by {(rev.author || 'someone').split('@')[0]} <Ago iso={rev.createdAt} />. Nothing was published.
              </>
            ) : (
              checkLine(left)
            )}
          </p>
          {rev ? null : (
            <button type="button" className={primary + ' mt-3'} disabled={left > 0 || busy} onClick={() => void ready()}>
              <Check size={15} aria-hidden="true" />
              {busy ? 'Saving…' : 'Mark ready'}
            </button>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <AskChange d={d} />
            {asks.length ? (
              <a
                href={legacy('ai-settings')}
                title="See them on AI settings, under From your feedback"
                className="text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink-2"
                data-testid="draft-asks"
              >
                {plural(asks.length, 'change')} asked
              </a>
            ) : null}
          </div>
        </aside>
      </div>

      <MadeOf d={d} data={data} tz={tz} />
      {piece ? <PieceEditor open={piece} onClose={() => setPiece(null)} /> : null}
    </section>
  )
}

/** How this draft was made (e9MadeD, folded behind Show as v100 left it): the team's source, the two briefs, the house settings. */
function MadeOf({ d, data, tz }: { d: Draft; data: ContentData; tz: string | undefined }) {
  const [open, setOpen] = useState(false)
  const req = data.reqs.find((r) => r.id === d.requestId)
  const m = madeOf(d, req, (k, run) => {
    const iso = (k === 'org' ? data.briefDays.org : data.briefDays.ads)[run]
    return iso ? dayText(iso, tz) : ''
  })
  const card = 'flex min-w-0 flex-col gap-1.5 rounded-md border p-3.5'
  const li = (items: string[]) =>
    items.length ? (
      <ul className="list-disc pl-5 text-[13.5px] text-ink-2">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    ) : null
  return (
    <section className="mt-4 rounded-lg border border-line bg-panel p-5 shadow-card" data-testid="draft-made">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">How this draft was made</p>
          <h3 className="mt-1 font-display text-[18px] font-semibold text-ink">{m.heading}</h3>
          {open ? <p className="mt-1 text-[14px] text-ink-2">{m.lead}</p> : null}
        </div>
        <button type="button" className={ghost} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open ? (
        <>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2.5 min-[761px]:grid-cols-3">
            <div className={card + ' border-line bg-sunk'} data-testid="made-you">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">From you</span>
              <b className="text-[14.5px] text-ink">{m.you.title}</b>
              <p className="text-[13.5px] text-ink-2">{m.you.text}</p>
              {li(m.you.items)}
            </div>
            <div className={card + ' border-line bg-panel'} data-testid="made-org">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">Organic brief{m.org.led ? ' · led' : ''}</span>
              {m.org.day ? <b className="text-[14.5px] text-ink">{m.org.day}</b> : null}
              <p className="text-[13.5px] text-ink-2">{m.org.text}</p>
              {li(m.org.items)}
            </div>
            <div className={card + ' border-line bg-panel'} data-testid="made-ads">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">Ad brief{m.ads.led ? ' · led' : ''}</span>
              {m.ads.day ? <b className="text-[14.5px] text-ink">{m.ads.day}</b> : null}
              <p className="text-[13.5px] text-ink-2">{m.ads.text}</p>
              {li(m.ads.items)}
            </div>
            <div className={card + ' border-line bg-panel min-[761px]:col-span-3'} data-testid="made-house">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">House settings it followed</span>
              <p className="text-[13.5px] text-ink-2">{m.house}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]" data-testid="made-rule">
            <b className="text-ink">Brief used for drafts:</b>
            <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-text">Newest approved, else newest</span>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-ink-3" title="Not switched on">
              Newest only
            </span>
            <span className="rounded-full border border-line px-2.5 py-0.5 text-ink-3" title="Not switched on">
              Several briefs combined
            </span>
            <InfoButton k="pick" />
          </div>
        </>
      ) : null}
    </section>
  )
}

