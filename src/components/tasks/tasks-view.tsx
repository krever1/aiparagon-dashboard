'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import { setCallType, tickTask } from '@/app/(app)/calls/actions'
import { EditDetails, NewTypeDialog, TypeOptions } from '@/components/calls/call-dialogs'
import { ErrorNotice } from '@/components/catalyst/bits'
import { LocalUsDate, dueText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type CallRow, type FtCall, type Task, catLabel, folderChoices, isOutside, tagChoices, typeLabel, withLine } from '@/lib/catalyst/calls'
import { type TaskCard, openOf, shownCat, taskButtons, taskFolders } from '@/lib/catalyst/tasks'
import type { TasksData } from '@/lib/catalyst/tasks-load'

// Tasks' post-call to-dos (apTkHtml as v121 redefined it): the next steps written after each recorded call, filed by
// client. Tick them off, set each call's type, change its people and client, or open the call on Calls. The type button
// picked is the address's (?type=), as on Calls.

const ghost = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2'

/** Edit details needs a call: a call Fathom did not list is what its post-call actions say (apCxEdit). */
function rowOf(c: TaskCard): CallRow {
  const call: FtCall = c.call ?? {
    id: c.id, title: c.out.call_title || 'Call', start: c.out.call_start, end: '', shareUrl: '', url: '', recordedBy: null, invitees: [], summary: '', actions: [],
    sharedWith: '', external: false,
  }
  return { call, title: c.title, meta: c.meta, out: c.out, type: c.type, cat: c.cat, folder: c.folder, client: false, hay: '' }
}

export function TasksView({ data }: { data: TasksData }) {
  const sp = useSearchParams()
  const picked = shownCat(data.cards, sp.get('type') ?? '')
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [newTypeFor, setNewTypeFor] = useState<string | null>(null)
  const [typeBusy, setTypeBusy] = useState<string | null>(null)

  const setType = useCallback((key: string) => {
    const u = new URL(window.location.href)
    if (key) u.searchParams.set('type', key)
    else u.searchParams.delete('type')
    window.history.replaceState(null, '', u.pathname + u.search)
  }, [])

  const tasksOf = (c: TaskCard): Task[] => c.out.tasks.map((t) => (`${c.out.id}:${t.id}` in ticks ? { ...t, done: ticks[`${c.out.id}:${t.id}`] } : t))

  const tick = async (c: TaskCard, t: Task, done: boolean) => {
    const k = `${c.out.id}:${t.id}`
    setTicks((x) => ({ ...x, [k]: done }))
    const r = await tickTask(c.out.id, t.id, done).catch(() => ({ ok: false as const, error: 'Could not save that tick: the dashboard could not be reached.' }))
    if (!r.ok) {
      setTicks((x) => ({ ...x, [k]: !done }))
      toast(r.error, 'warn')
    }
  }

  const saveType = async (id: string, v: string) => {
    setTypeBusy(id)
    const r = await setCallType(id, v).catch(() => ({ ok: false as const, error: 'Could not save the call type: the dashboard could not be reached.' }))
    setTypeBusy(null)
    toast(r.ok ? r.toast : r.error, r.ok ? 'ok' : 'warn')
  }

  const buttons = taskButtons(data.cards)
  const shown = data.cards.filter((c) => !picked || c.cat === picked)
  const open = shown.reduce((n, c) => n + openOf(tasksOf(c)), 0)
  const editingCard = editing ? data.cards.find((c) => c.id === editing) : null

  let body: React.ReactNode
  if (data.error) {
    body = <ErrorNotice>Could not read the post-call to-dos: {data.error}</ErrorNotice>
  } else if (!data.cards.length) {
    body = (
      <p className="text-[14.5px] text-ink-3" data-testid="tasks-empty">
        None yet. They come from your{' '}
        <Link href="/calls" className="font-semibold text-accent-text hover:underline">
          calls
        </Link>
        .
      </p>
    )
  } else if (!shown.length) {
    body = (
      <p className="text-[14.5px] text-ink-3" data-testid="tasks-empty">
        Nothing under {catLabel(picked)} yet.{' '}
        <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => setType('')}>
          Show all
        </button>
      </p>
    )
  } else {
    body = (
      <div className="grid gap-3">
        {taskFolders(shown).map((f) => {
          const isShut = !!shut[f.folder]
          const left = f.cards.reduce((n, c) => n + openOf(tasksOf(c)), 0)
          return (
            <section key={f.folder} className="rounded-md border border-line" data-testid="task-folder">
              <button
                type="button"
                aria-expanded={!isShut}
                onClick={() => setShut((x) => ({ ...x, [f.folder]: !isShut }))}
                className="flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left hover:bg-sunk/60"
              >
                <Folder size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
                <b className="min-w-0 truncate text-[15px] font-semibold text-ink">{f.folder}</b>
                <small className="shrink-0 whitespace-nowrap text-[13px] text-ink-3">
                  {f.cards.length} call{f.cards.length === 1 ? '' : 's'} · {left} open
                </small>
                {isShut ? (
                  <ChevronRight size={16} aria-hidden="true" className="ml-auto shrink-0 text-ink-3" />
                ) : (
                  <ChevronDown size={16} aria-hidden="true" className="ml-auto shrink-0 text-ink-3" />
                )}
              </button>
              {isShut ? null : (
                <div className="grid gap-3 px-3.5 pb-3.5">
                  {f.cards.map((c) => (
                    <TaskCallCard
                      key={c.id}
                      card={c}
                      tasks={tasksOf(c)}
                      custom={data.types}
                      typeBusy={typeBusy === c.id}
                      onType={(v) => (v === '__new' ? setNewTypeFor(c.id) : saveType(c.id, v))}
                      onEdit={() => setEditing(c.id)}
                      onTick={(t, done) => tick(c, t, done)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-card sm:p-5" aria-labelledby="tk-h" data-testid="todos">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">From your calls</p>
          <h2
            id="tk-h"
            className="font-display text-[22px] font-semibold leading-tight text-ink"
            title="Next steps written after each recorded call, filed by client. Tick them off, set each call’s type, or open the call."
          >
            Post-call to-dos
          </h2>
        </div>
        <span className="rounded-full bg-sunk px-2.5 py-1 text-[13px] font-semibold text-ink-2" data-testid="open-count">
          {open} open
        </span>
      </div>

      {data.cards.length && !data.error ? (
        <div role="toolbar" aria-label="Show calls by type" className="mb-4 flex flex-wrap gap-1.5">
          {buttons.map((b) => (
            <button
              key={b.key || 'all'}
              type="button"
              aria-pressed={picked === b.key}
              onClick={() => setType(b.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13.5px] font-semibold ${
                picked === b.key ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'
              }`}
            >
              {b.label} <span className="text-[12px] font-normal opacity-75">{b.n}</span>
            </button>
          ))}
        </div>
      ) : null}

      {body}

      {editingCard ? (
        <EditDetails
          row={rowOf(editingCard)}
          folders={folderChoices(data.cards, data.metas)}
          tags={tagChoices(data.metas)}
          custom={data.types}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {newTypeFor ? (
        <NewTypeDialog
          onDone={(name) => {
            const id = newTypeFor
            setNewTypeFor(null)
            if (name) void saveType(id, name)
          }}
        />
      ) : null}
    </section>
  )
}

function TaskCallCard({
  card,
  tasks,
  custom,
  typeBusy,
  onType,
  onEdit,
  onTick,
}: {
  card: TaskCard
  tasks: Task[]
  custom: string[]
  typeBusy: boolean
  onType: (v: string) => void
  onEdit: () => void
  onTick: (t: Task, done: boolean) => void
}) {
  const set = card.meta?.meeting_type ?? ''
  const people = card.people
  const named = people.some((p) => p.name || p.email)
  const asana = card.out.asana
  return (
    <article className="rounded-md border border-line bg-panel p-3.5" aria-label={card.title} data-testid="task-card" data-id={card.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-[15.5px] font-semibold text-ink">
          {card.title}{' '}
          <small className="text-[13px] font-normal text-ink-3">
            {openOf(tasks)} of {tasks.length} open
          </small>
        </h3>
        <Link href={`/calls?call=${encodeURIComponent(card.id)}&seg=post`} className={ghost}>
          Open call
        </Link>
      </div>
      {card.out.call_start || asana ? (
        <p className="mt-0.5 text-[13px] text-ink-3">
          {card.out.call_start ? <LocalUsDate iso={card.out.call_start} /> : null}
          {asana ? (
            <>
              {card.out.call_start ? ' · ' : ''}
              <span className="text-good">in Asana{asana.project_name ? ' · ' + asana.project_name : ''}</span>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-sunk/60 px-3 py-2">
        <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          <span className="whitespace-nowrap">Call type</span>
          <select
            aria-label="Call type"
            value={set}
            disabled={typeBusy}
            onChange={(e) => onType(e.target.value)}
            className="h-8 max-w-full rounded-sm border border-line bg-panel px-2 text-[13.5px] font-normal text-ink"
          >
            <option value="">{!set && card.type ? 'AI pick: ' + typeLabel(card.type) : 'No type yet'}</option>
            <TypeOptions current={set} custom={custom} />
            <option value="__new">+ New type…</option>
          </select>
        </label>
        <span className="text-[13.5px] text-ink-2" title={people.map((p) => (p.name || p.email) + (isOutside(p) ? ' (client side)' : '')).join(', ')}>
          {withLine(people)}
        </span>
        <button type="button" className="text-[13.5px] font-semibold text-accent-text hover:underline" onClick={onEdit}>
          {named ? 'Edit people and client' : 'Add people'}
        </button>
      </div>

      <ul className="mt-2.5 space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <label className="flex gap-2.5 text-[14px] text-ink">
              <input type="checkbox" checked={t.done} onChange={(e) => onTick(t, e.target.checked)} className="mt-1" />
              <span className="min-w-0">
                <span className={t.done ? 'text-ink-3 line-through' : ''}>{t.text}</span>
                {t.owner || t.due || t.why ? (
                  <small className="block text-[12.5px] text-ink-3">{[t.owner, t.due ? 'due ' + dueText(t.due) : '', t.why].filter(Boolean).join(' · ')}</small>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </article>
  )
}
