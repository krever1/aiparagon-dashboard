'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Eye, Lock, PenLine, Trash2, Undo2 } from 'lucide-react'
import { restoreBrief, saveAdsEdit, saveOrgEdit } from '@/app/(app)/briefs/edit-actions'
import { toast } from '@/components/ui/toast'
import {
  type AdsDoc, type Change, type Doc, ED_SECS, FORM, type LogEntry, type OrgDoc, ROWS_TEXT, type Row, adsRows, orgDataOf, orgRows, revOf, rowDel, rowEdit, secDel, sumOf,
} from '@/lib/pipeline/brief-edit'
import { type AdFive, type AdsBriefRow, type Kind, adsParts, devsOf, fiveItems, orgEvidence, orgGlance, shiftsOf, topicWatch } from '@/lib/pipeline/briefs'
import type { AdsTab, OrgTab } from '@/lib/pipeline/briefs-load'
import { briefThemes, platLabel, rankPosts } from '@/lib/pipeline/intel'
import { adFallback, clip, orgFallback, tidy, tldr } from '@/lib/touchpoint/approvals'
import { btn, ghost, inputCls, linkCls, primary } from './bits'

// The brief editor (v111EdStart, v111EdHtml, v111EdSide, v111EdSave and v111Restore): an organic or ads brief's
// sections and rows, each row edited or removed, whole sections taken out, Undo back to the brief as it was opened, a
// note for the record, Preview, and Save, which keeps the agent's own version. The editing state is the page's, so the
// brief stays open between Edit and Preview, and on another tab.

const OFF = 'Could not reach the dashboard. Try again in a minute.'
const WEB = /^https?:\/\//i

export type EditState = {
  kind: Kind
  run: string
  cur: Doc
  hist: Doc[]
  log: LogEntry[]
  open: { k: string; i: number } | null
  note: string
  err: string
  busy: boolean
  view: 'edit' | 'preview'
}

export type Ed = {
  st: EditState | null
  /** whether this brief is the one being edited */
  on: (kind: Kind, run: string) => boolean
  start: (kind: Kind, run: string, base: Doc) => void
  act: (c: Change) => void
  undo: () => void
  setOpen: (o: { k: string; i: number } | null) => void
  setNote: (n: string) => void
  setView: (v: 'edit' | 'preview') => void
  /** close the editor, asking first when there are changes; false when the teammate kept them */
  quit: (question?: string) => boolean
  /** close it without asking (the brief was put back) */
  drop: (run: string) => void
  save: () => Promise<void>
}

/** The brief a teammate opens in the editor, as stored, with the review in force. */
export const orgBase = (o: OrgTab): OrgDoc => ({ md: o.md.replace(/\r/g, ''), data: orgDataOf(o.d), snap: o.snap, rev: revOf(o.review) })
export const adsBase = (b: AdsTab): AdsDoc => ({ cb: b.cb, snap: b.snap, rev: revOf(b.review) })

export function useEditor(): Ed {
  const [st, setSt] = useState<EditState | null>(null)
  const ref = useRef(st)
  useEffect(() => {
    ref.current = st
  }, [st])
  const patch = (p: Partial<EditState>) => setSt((s) => (s ? { ...s, ...p } : s))
  const undo = () => setSt((s) => (s && s.hist.length ? { ...s, cur: s.hist[s.hist.length - 1], hist: s.hist.slice(0, -1), log: s.log.slice(0, -1), open: null, err: '' } : s))
  const top = () => window.scrollTo({ top: 0 })
  return {
    st,
    on: (kind, run) => !!st && st.kind === kind && st.run === run,
    start: (kind, run, base) => {
      const s = ref.current
      if (s && s.run === run && s.kind === kind) return patch({ view: 'edit' })
      if (s && s.log.length && !window.confirm('You have changes on another brief that are not saved. Drop them?')) return
      setSt({ kind, run, cur: base, hist: [], log: [], open: null, note: '', err: '', busy: false, view: 'edit' })
      top()
    },
    act: (c) => {
      if (c.err) return patch({ err: c.err })
      const log = c.log
      if (!log) return
      setSt((s) => (s ? { ...s, hist: [...s.hist, s.cur], log: [...s.log, log], cur: c.doc, open: null, err: '' } : s))
      if (c.toast) toast(c.toast, 'ok', { label: 'Undo', run: undo })
    },
    undo,
    setOpen: (open) => patch({ open, err: '' }),
    setNote: (note) => patch({ note }),
    setView: (view) => {
      patch({ view, open: null })
      top()
    },
    quit: (question = 'Drop your changes to this brief?') => {
      const s = ref.current
      if (s?.log.length && !window.confirm(question)) return false
      setSt(null)
      return true
    },
    drop: (run) => setSt((s) => (s && s.run === run ? null : s)),
    save: async () => {
      const s = ref.current
      if (!s || !s.log.length || s.busy) return
      patch({ busy: true, err: '' })
      const changes = sumOf(s.log)
      const fail = () => ({ ok: false as const, error: OFF })
      const r =
        s.kind === 'org'
          ? await saveOrgEdit({ run: s.run, md: (s.cur as OrgDoc).md, data: (s.cur as OrgDoc).data, snap: s.cur.snap, rev: s.cur.rev, changes, note: s.note }).catch(fail)
          : await saveAdsEdit({ run: s.run, cb: (s.cur as AdsDoc).cb, snap: s.cur.snap, rev: s.cur.rev, changes, note: s.note }).catch(fail)
      if (!r.ok) return patch({ busy: false, err: r.error, view: 'edit' })
      setSt(null)
      top()
      toast(r.toast)
    },
  }
}

/** The record bar's side while a brief is edited (v111EdSide): Edit or Preview, the count, Undo, Discard and Save. */
export function EditSide({ ed }: { ed: Ed }) {
  const s = ed.st
  if (!s) return null
  const n = s.log.length
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="edit-side">
      <div role="group" aria-label="Editing view" className="inline-flex overflow-hidden rounded-sm border border-line">
        {(['edit', 'preview'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={s.view === v}
            onClick={() => ed.setView(v)}
            className={`px-2.5 py-1.5 text-[13px] font-semibold ${v === 'preview' ? 'border-l border-line ' : ''}${s.view === v ? 'bg-sunk text-ink' : 'text-ink-3 hover:text-ink'}`}
          >
            {v === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>
      <span aria-live="polite" className="text-[13px] text-ink-3" data-testid="edit-count">
        {n ? n + (n === 1 ? ' change' : ' changes') : 'No changes yet'}
      </span>
      <button type="button" className={ghost} disabled={!n} onClick={ed.undo}>
        <Undo2 size={15} aria-hidden="true" />
        Undo
      </button>
      <button type="button" className={btn} onClick={() => ed.quit()}>
        Discard
      </button>
      <button type="button" className={primary} disabled={!n || s.busy} onClick={() => void ed.save()}>
        {s.busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

/** Put back the agent's own version (v111Restore), from the record bar's edited line. */
export function PutBack({ kind, run, onDone }: { kind: Kind; run: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className={linkCls + ' text-[13px]'}
      disabled={busy}
      onClick={async () => {
        if (!window.confirm('Put back the agent’s own version of this brief? The edits are dropped.')) return
        setBusy(true)
        const r = await restoreBrief({ kind, run }).catch(() => ({ ok: false as const, error: OFF }))
        setBusy(false)
        if (!r.ok) return toast(r.error, 'warn')
        onDone()
        toast(r.toast)
      }}
    >
      {busy ? 'Putting it back…' : 'Put back the agent’s version'}
    </button>
  )
}

/** The posts an organic brief lists, for its evidence section in the editor. */
export const editPosts = (o: OrgTab, doc: OrgDoc) =>
  orgEvidence(doc.data, o.posts).map((e) => ({ url: e.url, who: e.who || platLabel(e.platform), topic: e.topic, type: e.type, eng: e.eng, postId: e.postId }))

/** The ads an ads brief lists, for its evidence section in the editor: an ad's key is its id, else its link. */
export const editAds = (b: AdsTab) =>
  b.evidence
    .map((e) => ({
      key: e.ad?.id || e.url,
      adv: e.adv,
      hook: e.hook,
      days: e.days,
      status: e.status,
      target: e.ad ? '/ad-strategist?ad=' + encodeURIComponent(e.ad.id) : WEB.test(e.url) ? e.url : '',
    }))
    .filter((a) => a.key)

/** The editor itself (v111EdHtml): the head card, then a card per section with its rows. */
export function BriefEditor({
  ed,
  posts = [],
  ads = [],
  onNoteOnly,
  onOpen,
}: {
  ed: Ed
  posts?: ReturnType<typeof editPosts>
  ads?: ReturnType<typeof editAds>
  onNoteOnly: () => void
  /** a post's or an ad's Open */
  onOpen: (target: string) => void
}) {
  const s = ed.st
  if (!s) return null
  const kind = s.kind
  const rowsOf = (k: string): Row[] => (kind === 'org' ? orgRows(s.cur as OrgDoc, k, posts) : adsRows(s.cur as AdsDoc, k, ads))
  const removedN = s.cur.rev.removed.length
  const word = kind === 'org' ? 'post' : 'ad'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5" data-testid="brief-editor">
      <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="edit-head">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-sunk text-ink-2">
            <PenLine size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Editing this brief</h2>
            <p className="text-[13.5px] text-ink-2">
              Change or remove anything that is off.{' '}
              {kind === 'org' ? 'Removing a post flags the findings that quoted it.' : 'Removing an ad takes it out of the evidence.'} Drafts read the brief as you save it,
              and the agent’s own version is kept.
            </p>
          </div>
        </div>
        <label className="mt-3 grid gap-1 text-[13.5px] font-semibold text-ink">
          <span>
            Note for the record <small className="font-normal text-ink-3">optional</small>
          </span>
          <textarea
            rows={2}
            className={inputCls}
            value={s.note}
            maxLength={1000}
            placeholder={kind === 'org' ? 'e.g. Leave job posts out. Governance should lead.' : 'e.g. Leave out ads for unrelated products. Lead with proof.'}
            onChange={(e) => ed.setNote(e.target.value)}
          />
        </label>
        {s.err ? (
          <p role="alert" className="mt-3 rounded-sm bg-bad-soft px-3 py-2 text-[13.5px] font-semibold text-bad">
            {s.err}
          </p>
        ) : null}
        <p className="mt-3 text-[13px] text-ink-3">
          {removedN ? removedN + ' ' + word + (removedN === 1 ? '' : 's') + ' taken out of this brief so far. ' : ''}
          Want the agent to do it differently next time?{' '}
          <button type="button" className={linkCls + ' text-[13px]'} onClick={onNoteOnly}>
            Leave a note instead
          </button>{' '}
          On AI settings a note can become a rule the agent follows.
        </p>
      </section>

      {ED_SECS[kind]
        .filter((sec) => sec.lock || !s.cur.rev.hidden.includes(sec.k))
        .map((sec) => (
          <section key={sec.k} className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="edit-sec" data-k={sec.k} aria-label={sec.title}>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{sec.kicker ?? 'Section'}</p>
                <h3 className="font-display text-[18px] font-semibold text-ink">{sec.title}</h3>
              </div>
              {sec.lock ? (
                <span title={sec.lock[1]} className="inline-flex items-center gap-1 rounded-full bg-sunk px-2.5 py-1 text-[12.5px] font-semibold text-ink-3">
                  <Lock size={13} aria-hidden="true" />
                  {sec.lock[0]}
                </span>
              ) : (
                <button type="button" className={ghost} aria-label={'Remove section ' + sec.title} onClick={() => ed.act(secDel(kind, s.cur, sec.k))}>
                  <Trash2 size={15} aria-hidden="true" />
                  Remove section
                </button>
              )}
            </div>
            {sec.note ? <p className="text-[13.5px] text-ink-3">{sec.note}</p> : null}
            {sec.rows.map((rk) => {
              const rows = rowsOf(rk)
              const [kick, empty] = ROWS_TEXT[rk] ?? ['', 'Nothing left in this section.']
              return (
                <div key={rk} className={sec.rows.length > 1 ? 'mt-3' : 'mt-1'}>
                  {kick && sec.rows.length > 1 ? <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">{kick}</p> : null}
                  {rows.length ? (
                    <ol className="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid={'rows-' + rk}>
                      {rows.map((row, i) =>
                        s.open && s.open.k === rk && s.open.i === i ? (
                          <li key={i} className="rounded-md border border-line-2 bg-panel p-3">
                            <RowForm ed={ed} rk={rk} i={i} row={row} />
                          </li>
                        ) : (
                          <RowItem
                            key={i}
                            row={row}
                            canEdit={rk in FORM}
                            canDel={rk !== 'angle' && rk !== 'formula' && (rk !== 'post' || !!row.url) && (rk !== 'ad' || !!row.fields.key)}
                            onEdit={() => ed.setOpen({ k: rk, i })}
                            onDel={() => ed.act(rowDel(kind, s.cur, rk, i, rk === 'post' ? row.url : rk === 'ad' ? row.fields.key : ''))}
                            onOpen={row.target ? () => onOpen(row.target!) : undefined}
                          />
                        ),
                      )}
                    </ol>
                  ) : (
                    <p className="text-[13.5px] text-ink-3">{empty}</p>
                  )}
                </div>
              )
            })}
          </section>
        ))}
    </div>
  )
}

function RowItem({ row, canEdit, canDel, onEdit, onDel, onOpen }: { row: Row; canEdit: boolean; canDel: boolean; onEdit: () => void; onDel: () => void; onOpen?: () => void }) {
  const name = row.h || clip(row.t, 60)
  return (
    <li className={`flex flex-wrap items-start gap-3 rounded-md px-3 py-2.5 ${row.flag ? 'border-l-[3px] border-warn bg-warn-soft' : 'bg-sunk'}`} data-testid="edit-row">
      <div className="min-w-0 grow basis-[260px]">
        {row.h ? <b className="block text-[14px] text-ink">{row.h}</b> : null}
        {row.t ? <p className="text-[13.5px] text-ink-2">{row.t}</p> : null}
        {row.meta ? <small className="block text-[12.5px] text-ink-3">{row.meta}</small> : null}
        {row.flag ? (
          <p className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-warn">
            <AlertTriangle size={13} aria-hidden="true" />
            The post behind it was removed. Edit or remove this.
          </p>
        ) : null}
      </div>
      <span className="flex flex-wrap gap-1">
        {onOpen ? (
          <button type="button" className={ghost} aria-label={'Open ' + name} onClick={onOpen}>
            <Eye size={14} aria-hidden="true" />
            Open
          </button>
        ) : null}
        {canEdit ? (
          <button type="button" className={ghost} aria-label={'Edit ' + name} onClick={onEdit}>
            <PenLine size={14} aria-hidden="true" />
            Edit
          </button>
        ) : null}
        {canDel ? (
          <button type="button" className={ghost} aria-label={'Remove ' + name} onClick={onDel}>
            <Trash2 size={14} aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </span>
    </li>
  )
}

function RowForm({ ed, rk, i, row }: { ed: Ed; rk: string; i: number; row: Row }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries((FORM[rk] ?? []).map(([n]) => [n, row.fields[n] ?? ''])))
  const box = useRef<HTMLFormElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, textarea')?.focus()
  }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const s = ed.st
    if (!s) return
    const c = rowEdit(s.kind, s.cur, rk, i, row, vals)
    if (c.same) return ed.setOpen(null)
    ed.act(c)
  }
  return (
    <form ref={box} onSubmit={submit} className="grid gap-2" data-testid="edit-form">
      {(FORM[rk] ?? []).map(([n, label, long]) => (
        <label key={n} className="grid gap-1 text-[13px] font-semibold text-ink">
          {label}
          {long ? (
            <textarea rows={3} className={inputCls} value={vals[n]} onChange={(e) => setVals((v) => ({ ...v, [n]: e.target.value }))} />
          ) : (
            <input className={inputCls} value={vals[n]} onChange={(e) => setVals((v) => ({ ...v, [n]: e.target.value }))} />
          )}
        </label>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary}>
          Keep this change
        </button>
        <button type="button" className={btn} onClick={() => ed.setOpen(null)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------- Preview: the brief as the edits leave it ----------

const reviewFrom = (was: OrgTab['review'], rev: Doc['rev']) => ({ by: was?.by ?? '', at: was?.at ?? '', original: was?.original ?? false, hidden: rev.hidden, removed: rev.removed })

/** The organic brief as the edits leave it, for the page to draw as it draws a brief. */
export function orgPreview(o: OrgTab, doc: OrgDoc): OrgTab {
  const gone = new Set(doc.rev.removed)
  const kept = o.posts.filter((p) => !gone.has(p.url))
  const items = fiveItems(doc.snap, orgFallback(doc.md), doc.rev.hidden.includes('five'))
  return {
    ...o,
    d: doc.data,
    md: doc.md,
    snap: doc.snap,
    review: reviewFrom(o.review, doc.rev),
    five: items.map((x) => ({ text: x.text, why: x.why, tag: x.tag, ids: rankPosts(x, kept) })),
    short: tldr(doc.md).map((x) => ({ title: tidy(x.title), text: clip(x.text, 380) })),
    shifts: shiftsOf(doc.md, doc.data),
    devs: devsOf(doc.md),
    themes: briefThemes(doc.data.top_themes).slice(0, 8),
    watch: topicWatch(doc.data),
    evidence: orgEvidence(doc.data, o.posts),
    glance: orgGlance(doc.data),
  }
}

/** The ads brief as the edits leave it. */
export function adsPreview(b: AdsTab, doc: AdsDoc): AdsTab {
  const gone = new Set(doc.rev.removed)
  const parts = adsParts(doc.cb as unknown as AdsBriefRow)
  const five: AdFive[] = fiveItems(doc.snap, adFallback(doc.cb), doc.rev.hidden.includes('five')).map((x) => {
    const was = b.five.find((f) => f.text === tidy(x.text))
    return { text: tidy(x.text), why: tidy(x.why), tag: x.tag, ads: was?.ads ?? null, all: was?.all ?? false }
  })
  return {
    ...b,
    cb: doc.cb,
    snap: doc.snap,
    review: reviewFrom(b.review, doc.rev),
    parts,
    five,
    // each hook keeps where it was seen, by its words
    hookSrc: parts.hooks.map((h) => {
      const j = b.parts.hooks.indexOf(h)
      return j >= 0 ? (b.hookSrc[j] ?? null) : null
    }),
    evidence: b.evidence
      .filter((e) => !(e.ad && (gone.has(e.ad.id) || gone.has(e.ad.url))) && !(e.url && gone.has(e.url)))
      .map((e, i) => ({ ...e, rec: 'P' + (i + 1) })),
  }
}
