'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronRight, Folder, X } from 'lucide-react'
import { removeTask, restoreTask, setCallType, tickTask } from '@/app/(app)/calls/actions'
import { EditDetails, NewTypeDialog, TypeOptions } from '@/components/calls/call-dialogs'
import { FoldersTypes } from '@/components/calls/folders-types'
import { TypeNamesProvider } from '@/components/calls/names'
import { ErrorNotice } from '@/components/catalyst/bits'
import { LocalUsDate, dueText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import {
  type CallRow, type FtCall, type Task, type TypeNames, callsByFolder, catLabel, filedFolder, folderChoices, isOutside, keptAfterDelete, leadOf, tagChoices,
  typeLabel, withLine,
} from '@/lib/catalyst/calls'
import { NotionSend } from './notion-send'
import { type TaskCard, openOf, shownCat, taskButtons, taskFolders } from '@/lib/catalyst/tasks'
import type { TasksData } from '@/lib/catalyst/tasks-load'

// Tasks' post-call to-dos (apTkHtml as v121 redefined it): the next steps written after each recorded call, filed by
// client. Tick them off, set each call's type, change its people and client, or open the call on Calls. The type button
// picked is the address's (?type=), as on Calls. Since v143 each call folds up (kept in this browser) and each task has ×,
// which takes it off the call's list for the whole team, with Undo.

// ---------- which calls are folded up, in this browser (localStorage `ap.tk.shut`, {call id: 1}, as v143 keeps it) ----------

const SHUT_KEY = 'ap.tk.shut'
const NONE: Record<string, number> = {}
const shutListeners = new Set<() => void>()
let shutCache: { raw: string | null; val: Record<string, number> } = { raw: null, val: NONE }
let shutMem: Record<string, number> = {}

function readShut(): Record<string, number> {
  let raw: string | null
  try {
    raw = localStorage.getItem(SHUT_KEY)
  } catch {
    return shutMem
  }
  if (raw === shutCache.raw) return shutCache.val
  let val: Record<string, number> = {}
  try {
    const p = JSON.parse(raw || '{}')
    if (p && typeof p === 'object' && !Array.isArray(p)) val = p
  } catch {
    // a broken entry folds nothing
  }
  shutCache = { raw, val }
  return val
}

function setShut(id: string, shut: boolean) {
  const next = { ...readShut() }
  if (shut) next[id] = 1
  else delete next[id]
  shutMem = next
  try {
    localStorage.setItem(SHUT_KEY, JSON.stringify(next))
  } catch {
    // kept for this page only
  }
  for (const l of shutListeners) l()
}

function subscribeShut(l: () => void) {
  shutListeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === SHUT_KEY) l()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    shutListeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

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
  const [shut, setFolderShut] = useState<Record<string, boolean>>({})
  const callShut = useSyncExternalStore(subscribeShut, readShut, () => NONE)
  // tasks removed here, hidden until the page's data comes back without them (a new read clears the list)
  const [removed, setRemoved] = useState<{ data: TasksData; keys: string[] }>({ data, keys: [] })
  const gone = removed.data === data ? removed.keys : []
  const [editing, setEditing] = useState<string | null>(null)
  const [newTypeFor, setNewTypeFor] = useState<string | null>(null)
  const [typeBusy, setTypeBusy] = useState<string | null>(null)
  const [manage, setManage] = useState(false)
  // Select (v143 and v144): the calls picking tasks, and the tasks picked on each
  const [picking, setPicking] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<Record<string, Record<string, boolean>>>({})
  const [notion, setNotion] = useState<{ card: TaskCard; only: string[] } | null>(null)

  const setType = useCallback((key: string) => {
    const u = new URL(window.location.href)
    if (key) u.searchParams.set('type', key)
    else u.searchParams.delete('type')
    window.history.replaceState(null, '', u.pathname + u.search)
  }, [])

  const tasksOf = (c: TaskCard): Task[] =>
    c.out.tasks
      .filter((t) => !gone.includes(`${c.out.id}:${t.id}`))
      .map((t) => (`${c.out.id}:${t.id}` in ticks ? { ...t, done: ticks[`${c.out.id}:${t.id}`] } : t))

  // a removed task leaves the call's list for the whole team; Undo puts it back where it was (v143TkDel)
  const remove = async (c: TaskCard, t: Task) => {
    const k = `${c.out.id}:${t.id}`
    setRemoved((x) => ({ data, keys: [...(x.data === data ? x.keys : []), k] }))
    const r = await removeTask(c.out.id, t.id).catch(() => ({ ok: false as const, error: 'Could not remove that task: the dashboard could not be reached.' }))
    if (!r.ok) {
      setRemoved((x) => ({ ...x, keys: x.keys.filter((y) => y !== k) }))
      toast(r.error, 'warn')
      return
    }
    toast('Task removed: ' + t.text.slice(0, 60), 'ok', {
      label: 'Undo',
      run: () => {
        void restoreTask(c.out.id, r.task, r.at)
          .catch(() => ({ ok: false as const, error: 'Could not put it back: the dashboard could not be reached.' }))
          .then((u) => {
            if (!u.ok) toast(u.error, 'warn')
          })
      },
    })
  }

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

  const buttons = taskButtons(data.cards, data.names)
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
        Nothing under {catLabel(picked, data.names)} yet.{' '}
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
                onClick={() => setFolderShut((x) => ({ ...x, [f.folder]: !isShut }))}
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
                      names={data.names}
                      typeBusy={typeBusy === c.id}
                      onType={(v) => (v === '__new' ? setNewTypeFor(c.id) : saveType(c.id, v))}
                      onEdit={() => setEditing(c.id)}
                      onTick={(t, done) => tick(c, t, done)}
                      onRemove={(t) => void remove(c, t)}
                      shut={!!callShut[c.id]}
                      onFold={() => setShut(c.id, !callShut[c.id])}
                      picking={!!picking[c.id]}
                      picked={sel[c.id] ?? {}}
                      onPicking={() => {
                        const on = !picking[c.id]
                        setPicking((x) => ({ ...x, [c.id]: on }))
                        if (on && callShut[c.id]) setShut(c.id, false)
                      }}
                      onPick={(ids, v) => setSel((x) => ({ ...x, [c.id]: { ...(x[c.id] ?? {}), ...Object.fromEntries(ids.map((id) => [id, v])) } }))}
                      onNotion={() => setNotion({ card: c, only: Object.keys(sel[c.id] ?? {}).filter((k) => sel[c.id]?.[k]) })}
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

  // Folders and types (v144): every call the page knows, by its folder
  const knownRows = data.known.map((c) => {
    const m = data.meta[c.id] ?? null
    return { folder: filedFolder(c, m, data.outputs[c.id] ?? null, data.filing, leadOf(c, m, data.leads)?.company ?? '') }
  })
  const allFolders = folderChoices(knownRows, data.metas, data.teamFolders)

  return (
    <TypeNamesProvider value={data.names}>
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
        <span className="flex flex-wrap items-center gap-2.5">
          <button type="button" className={ghost} onClick={() => setManage(true)}>
            Folders and types
          </button>
          <span className="rounded-full bg-sunk px-2.5 py-1 text-[13px] font-semibold text-ink-2" data-testid="open-count">
            {open} open
          </span>
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
          folders={folderChoices(data.cards, data.metas, data.teamFolders)}
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
      {manage ? (
        <FoldersTypes
          folders={allFolders}
          folderCalls={callsByFolder(data.known, data.meta, data.outputs, data.leads, data.filing)}
          custom={data.types}
          kept={(del) => keptAfterDelete(data.known, data.meta, data.outputs, data.leads, data.filing, del)}
          onClose={() => setManage(false)}
        />
      ) : null}
      {notion ? (
        <NotionSend
          callId={notion.card.id}
          call={notion.card.call?.title || notion.card.out.call_title || 'the call'}
          start={notion.card.call?.start || notion.card.out.call_start}
          tasks={tasksOf(notion.card)}
          only={notion.only}
          onClose={() => setNotion(null)}
        />
      ) : null}
    </section>
    </TypeNamesProvider>
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
  onRemove,
  shut,
  onFold,
  names,
  picking,
  picked,
  onPicking,
  onPick,
  onNotion,
}: {
  card: TaskCard
  tasks: Task[]
  custom: string[]
  names: TypeNames
  /** Select: picking tasks to send, and the ones picked */
  picking: boolean
  picked: Record<string, boolean>
  onPicking: () => void
  onPick: (ids: string[], on: boolean) => void
  onNotion: () => void
  typeBusy: boolean
  onType: (v: string) => void
  onEdit: () => void
  onTick: (t: Task, done: boolean) => void
  onRemove: (t: Task) => void
  /** its task list folded up (v143) */
  shut: boolean
  onFold: () => void
}) {
  const set = card.meta?.meeting_type ?? ''
  const people = card.people
  const named = people.some((p) => p.name || p.email)
  const asana = card.out.asana
  return (
    <article className="rounded-md border border-line bg-panel p-3.5" aria-label={card.title} data-testid="task-card" data-id={card.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex min-w-0 flex-wrap items-center gap-x-1 text-[15.5px] font-semibold text-ink">
          <button
            type="button"
            aria-expanded={!shut}
            aria-controls={'tk-' + card.id}
            aria-label={(shut ? 'Show' : 'Hide') + ' this call’s tasks'}
            onClick={onFold}
            className="-ml-1 mr-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] text-ink-3 hover:bg-sunk hover:text-ink"
          >
            <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={'transition-transform ' + (shut ? '-rotate-90' : '')} />
          </button>
          {card.title}{' '}
          <small className="text-[13px] font-normal text-ink-3">
            {openOf(tasks)} of {tasks.length} open
          </small>
        </h3>
        <span className="flex flex-wrap gap-2">
          <button type="button" className={ghost} aria-pressed={picking} onClick={onPicking}>
            Select
          </button>
          <Link href={`/calls?call=${encodeURIComponent(card.id)}&seg=post`} className={ghost}>
            Open call
          </Link>
        </span>
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
            <option value="">{!set && card.type ? 'AI pick: ' + typeLabel(card.type, names) : 'No type yet'}</option>
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

      <ul id={'tk-' + card.id} hidden={shut} className="mt-2.5 space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="group relative flex gap-2.5 pr-8" data-testid="task">
            {picking ? (
              <input
                type="checkbox"
                className="mt-1 accent-[var(--color-accent)]"
                aria-label={'Pick “' + (t.text || 'this task') + '”'}
                checked={!!picked[t.id]}
                onChange={(e) => onPick([t.id], e.target.checked)}
              />
            ) : null}
            <label className="flex min-w-0 gap-2.5 text-[14px] text-ink">
              <input type="checkbox" checked={t.done} onChange={(e) => onTick(t, e.target.checked)} className="mt-1" />
              <span className="min-w-0">
                <span className={t.done ? 'text-ink-3 line-through' : ''}>{t.text}</span>
                {t.owner || t.due || t.why ? (
                  <small className="block text-[12.5px] text-ink-3">{[t.owner, t.due ? 'due ' + dueText(t.due) : '', t.why].filter(Boolean).join(' · ')}</small>
                ) : null}
              </span>
            </label>
            <button
              type="button"
              title="Remove this task"
              aria-label={'Remove “' + (t.text || 'this task') + '”'}
              onClick={() => onRemove(t)}
              className="absolute right-0 top-0 grid h-7 w-7 place-items-center rounded-[7px] text-ink-3 opacity-0 transition-opacity hover:bg-bad-soft hover:text-bad focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-70"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {picking && !shut ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md bg-sunk/70 px-3 py-2" data-testid="pick-bar">
          <b className="mr-auto text-[13.5px] font-semibold text-ink">
            {(() => {
              const n = tasks.filter((t) => picked[t.id]).length
              return n ? n + ' picked' : 'Pick the tasks to send'
            })()}
          </b>
          <button type="button" className={ghost} onClick={() => onPick(tasks.map((t) => t.id), true)}>
            All
          </button>
          <button type="button" className={ghost} onClick={() => onPick(tasks.map((t) => t.id), false)}>
            None
          </button>
          <button type="button" className={ghost} onClick={onNotion}>
            Send to Notion
          </button>
          <button type="button" className={ghost} onClick={onPicking}>
            Done
          </button>
        </div>
      ) : null}
    </article>
  )
}
