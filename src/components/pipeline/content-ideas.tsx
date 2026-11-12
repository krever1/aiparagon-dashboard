'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, BookOpen, ChevronDown, Lightbulb, PenLine, Plus, Radar, Repeat, Trash2, Upload } from 'lucide-react'
import { addIdea, deleteIdea } from '@/app/(app)/content-transformation/actions'
import { ErrorNotice } from '@/components/catalyst/bits'
import { dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { labelCase, openNotes, shelfOf } from '@/lib/pipeline/content'
import type { ContentData } from '@/lib/pipeline/content-load'
import { Empty, Tag, btn, ghost, inputCls, primary } from './bits'
import { PieceEditor, type PieceOpen } from './content-dialogs'
import { OUT_TIP, legacy } from './content-view'

// The Ideas tab (nwCtIdeasHtml as v110 left it): the newest organic brief's five things to draft from, the team's own
// ideas (idea_notes: add, delete), and what the team has given the engine (the library's pieces, which open in the piece
// editor, and the material of earlier requests). Draft this, Use and Add a piece start a draft on New draft, which is
// still in the current dashboard.

export function IdeasTab({ data, tz }: { data: ContentData; tz: string | undefined }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <BriefIdeas data={data} tz={tz} />
      <YourIdeas data={data} tz={tz} />
      <Pieces data={data} tz={tz} />
    </div>
  )
}

/** Draft this, Use and Add a piece: New draft, in the current dashboard. */
function DraftOut({ label = 'Draft this', icon = <PenLine size={14} aria-hidden="true" />, cls = primary }: { label?: string; icon?: React.ReactNode; cls?: string }) {
  return (
    <a href={legacy('content-transformation')} title={OUT_TIP} className={cls}>
      {icon}
      {label}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  )
}

function BriefIdeas({ data, tz }: { data: ContentData; tz: string | undefined }) {
  const b = data.brief
  return (
    <section aria-labelledby="ideas-brief" data-testid="ideas-brief">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ideas-brief" className="font-display text-[20px] font-semibold text-ink">
          Ideas from the organic brief
        </h2>
        <span className="text-[13px] text-ink-3">{b ? 'From the brief of ' + dayText(b.createdAt, tz) + ' · pick one to start a draft' : 'Pick one to start a draft'}</span>
      </div>
      {data.errors.brief ? <ErrorNotice>Could not load the organic brief: {data.errors.brief}</ErrorNotice> : null}
      {b ? (
        b.items.length ? (
          <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2 min-[1081px]:grid-cols-3">
            {b.items.map((it, i) => (
              <article key={i} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="brief-idea">
                {it.tag ? (
                  <span>
                    <Tag gold>{labelCase(it.tag)}</Tag>
                  </span>
                ) : null}
                <p className="text-[15px] font-semibold leading-snug text-ink">{it.text}</p>
                {it.why ? <p className="text-[13.5px] text-ink-2">{it.why}</p> : null}
                <div className="mt-auto pt-2">
                  <DraftOut />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={<Lightbulb size={30} aria-hidden="true" />}
            title="No ideas in the newest organic brief"
            text="It has no short notes to start from. The full brief is in Market Intelligence Briefs."
          />
        )
      ) : data.errors.brief ? null : (
        <Empty
          icon={<Radar size={30} aria-hidden="true" />}
          title="No organic brief yet"
          text="Once the Intel Tracker runs, the strongest things it found show up here as ideas to draft."
          action={
            <Link href="/intel-tracker" className={btn}>
              Open the Intel Tracker
            </Link>
          }
        />
      )}
    </section>
  )
}

function YourIdeas({ data, tz }: { data: ContentData; tz: string | undefined }) {
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const notes = openNotes(data.notes)
  const save = async () => {
    if (!note.trim()) return document.getElementById('idea-note')?.focus()
    setBusy('save')
    const r = await addIdea({ note, tags }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    setBusy(null)
    if (!r.ok) return toast(r.error, 'warn')
    setAdding(false)
    setNote('')
    setTags('')
    toast('Idea saved')
  }
  const del = async (id: string) => {
    if (!window.confirm('Delete this idea?')) return
    setBusy(id)
    const r = await deleteIdea(id).catch(() => ({ ok: false as const, error: 'Could not delete: the dashboard could not be reached' }))
    setBusy(null)
    if (!r.ok) return toast(r.error, 'warn')
    toast('Idea deleted')
  }
  return (
    <section className="rounded-lg border border-line bg-panel p-5 shadow-card" aria-labelledby="ideas-yours" data-testid="ideas-yours">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="ideas-yours" className="font-display text-[18px] font-semibold text-ink">
            Your ideas
          </h3>
          <p className="text-[13.5px] text-ink-2">A thought, a client question or a story you want to tell. Draft from it when you are ready.</p>
        </div>
        <button
          type="button"
          className={btn}
          onClick={() => {
            setAdding(true)
            window.setTimeout(() => document.getElementById('idea-note')?.focus(), 0)
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add an idea
        </button>
      </div>
      {data.errors.ideas ? <ErrorNotice>Could not load your ideas: {data.errors.ideas}</ErrorNotice> : null}
      {adding ? (
        <div className="mt-3 grid gap-2" data-testid="idea-add">
          <label className="sr-only" htmlFor="idea-note">
            Your idea
          </label>
          <textarea
            id="idea-note"
            className={inputCls}
            rows={2}
            maxLength={1500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Most firms buy the AI tool before they name who owns the workflow."
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="idea-tags">
              Tags
            </label>
            <input
              id="idea-tags"
              className={inputCls + ' min-w-[200px] flex-1'}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags, comma separated (optional)"
            />
            <button type="button" className={ghost} onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className={primary} disabled={busy === 'save'} onClick={() => void save()}>
              {busy === 'save' ? 'Saving…' : 'Save idea'}
            </button>
          </div>
        </div>
      ) : null}
      {notes.length ? (
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
          {notes.map((n) => (
            <li key={n.id} className="flex min-w-0 flex-wrap items-start gap-3 rounded-md px-2.5 py-2.5 hover:bg-sunk" data-testid="idea-row">
              <Lightbulb size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
              <div className="min-w-0 grow basis-[240px]">
                <p className="break-words text-[14.5px] text-ink">{n.note}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  {n.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                  <span className="text-[12.5px] text-ink-3">{dayText(n.createdAt, tz) + (n.createdBy ? ' · ' + n.createdBy.split('@')[0] : '')}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" className={ghost} aria-label="Delete this idea" disabled={busy === n.id} onClick={() => void del(n.id)}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
                <DraftOut />
              </div>
            </li>
          ))}
        </ul>
      ) : adding || data.errors.ideas ? null : (
        <p className="mt-3 text-[13.5px] text-ink-3">No saved ideas yet.</p>
      )}
    </section>
  )
}

function Pieces({ data, tz }: { data: ContentData; tz: string | undefined }) {
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<PieceOpen | null>(null)
  const P = shelfOf(data.pieces, data.reqs, (iso) => dayText(iso, tz))
  const shown = all ? P.slice(0, 60) : P.slice(0, 6)
  return (
    <section className="rounded-lg border border-line bg-panel p-5 shadow-card" aria-labelledby="ideas-pieces" data-testid="ideas-pieces">
      <div className="flex flex-wrap items-start gap-3">
        <BookOpen size={18} aria-hidden="true" className="mt-1 shrink-0 text-ink-2" />
        <div className="min-w-0 grow basis-[240px]">
          <h3 id="ideas-pieces" className="font-display text-[18px] font-semibold text-ink">
            Your published pieces
          </h3>
          <p className="text-[13.5px] text-ink-2">
            {P.length ? 'What you have given the engine so far. Use one to start a new draft.' : 'None on file yet. Add articles, webinars or transcripts to repurpose later.'}
          </p>
        </div>
        <DraftOut label="Add a piece" icon={<Upload size={14} aria-hidden="true" />} cls={btn} />
      </div>
      {data.errors.pieces ? <ErrorNotice>Could not load the library: {data.errors.pieces}</ErrorNotice> : null}
      {P.length ? (
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
          {shown.map((x) => {
            const piece = x.k === 'piece' ? data.pieces.find((p) => p.id === x.id) : undefined
            return (
              <li key={x.k + ':' + x.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-md px-2.5 py-2.5 hover:bg-sunk" data-testid="piece-row">
                <div className="min-w-0 grow basis-[240px]">
                  <b className="block truncate text-[14.5px] font-semibold text-ink">{x.title}</b>
                  <span className="block truncate text-[12.5px] text-ink-3">{x.sub}</span>
                  {x.tags.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {x.tags.slice(0, 6).map((t) => (
                        <Tag key={t}>{'#' + t}</Tag>
                      ))}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {piece ? (
                    <button type="button" className={ghost} onClick={() => setOpen({ piece, fromDraft: false })}>
                      <PenLine size={14} aria-hidden="true" />
                      Edit
                    </button>
                  ) : null}
                  <DraftOut label="Use" icon={<Repeat size={14} aria-hidden="true" />} cls={btn} />
                </div>
              </li>
            )
          })}
          {P.length > 6 && !all ? (
            <li>
              <button type="button" onClick={() => setAll(true)} className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[13.5px] font-semibold text-ink-2 hover:bg-sunk">
                <span>Show all {P.length}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {open ? <PieceEditor open={open} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}
