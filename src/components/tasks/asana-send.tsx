'use client'

import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type AsanaMade, asanaMarkCall, asanaTeamCreate, asanaTeamStart } from '@/app/(app)/tasks/asana-actions'
import { Dialog } from '@/components/ui/dialog'
import { usDateText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import {
  type AsanaPerson, type AsanaProject, AsanaAuthError, asanaApi, asanaDisconnect, asanaRead, asanaStore, hasAsanaToken, looksLikeToken, subscribeAsana,
  tokenCreate, tokenSetup,
} from '@/lib/asana-browser'
import type { Task } from '@/lib/catalyst/calls'

// Send to Asana (v143's apCxAsana and apCxAsanaSend, v151Asana and v151AsanaSend for the client workspace): the project
// (the one used last), an assignee from the Asana workspace, and each picked row's name, due date and description, then
// a task each, one at a time. It goes with the Asana token saved in this browser when there is one (straight to Asana,
// as the current dashboard does), else through the team's connection in n8n. With neither, the window shows Connect Asana
// in 3 steps (v143AsSteps) and carries on once connected. A stop halfway says how many went, and Send the rest sends only
// the others, as Send to Notion does. `AsanaDialog` is the window both use; `AsanaSend` is Tasks' (a call's tasks).

const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary = 'rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
const field = 'w-full min-w-0 rounded-sm border border-line bg-panel px-2.5 py-1.5 text-[14px] text-ink focus:border-accent focus:outline-none'
const link = 'font-semibold text-accent-text underline decoration-accent/40 hover:decoration-accent'

/** Whether this browser has an Asana token (false while the server draws the page). */
export function useAsanaToken(): boolean {
  return useSyncExternalStore(subscribeAsana, hasAsanaToken, () => false)
}

/** Forgets this browser's token once the teammate says so (v143AsDisconnect). */
export function disconnectAsana(): boolean {
  if (!window.confirm('Disconnect Asana in this browser? Tasks already sent stay in Asana.')) return false
  asanaDisconnect()
  toast('Asana disconnected in this browser.')
  return true
}

/** Connect Asana in 3 steps (v143AsSteps, v143AsWire): a token checked with Asana, kept in this browser only. */
export function AsanaSteps({ onConnected }: { onConnected: () => void }) {
  const [tok, setTok] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  const go = async () => {
    const t = tok.trim()
    setErr('')
    if (!looksLikeToken(t)) return setErr('That does not look like an Asana token. Copy it again from app.asana.com/0/my-apps.')
    setBusy(true)
    try {
      const me = await asanaApi<{ name?: string; email?: string; workspaces?: { gid: string }[] }>('/users/me?opt_fields=name,email,workspaces.name', { token: t })
      asanaStore('token', t)
      const ws = me.workspaces ?? []
      if (!asanaRead('workspace') && ws[0]) asanaStore('workspace', ws[0].gid)
      toast('Asana connected as ' + (me.name || me.email || 'you') + '.')
      onConnected()
    } catch (e) {
      setErr(e instanceof AsanaAuthError ? 'Asana didn’t accept that token. Copy it again from app.asana.com/0/my-apps.' : 'Couldn’t reach Asana: ' + (e instanceof Error ? e.message : String(e)))
      setBusy(false)
    }
  }

  const steps: [string, ReactNode][] = [
    [
      'Create a personal access token',
      <>
        Open{' '}
        <a href="https://app.asana.com/0/my-apps" target="_blank" rel="noopener noreferrer" className={link}>
          app.asana.com/0/my-apps
        </a>{' '}
        → “Personal access tokens” → “Create new token”. Name it “AI Paragon Dashboard” and copy it.
      </>,
    ],
    ['Paste the token below', 'It is saved in this browser only, and is what the dashboard uses to reach your Asana.'],
    ['Connect', 'The dashboard checks the token with Asana, then carries on with what you were doing.'],
  ]
  return (
    <div data-testid="asana-steps">
      <ol className="grid gap-2.5">
        {steps.map(([b, s], i) => (
          <li key={b} className="flex gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-action text-[12px] font-semibold text-action-ink">{i + 1}</span>
            <div className="min-w-0">
              <b className="block text-[14px] font-semibold text-ink">{b}</b>
              <small className="block text-[13px] text-ink-3 [overflow-wrap:anywhere]">{s}</small>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={input}
          type="password"
          autoComplete="off"
          value={tok}
          onChange={(e) => setTok(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void go()
            }
          }}
          placeholder="Paste your Asana token (starts with 1/ or 2/)…"
          aria-label="Asana personal access token"
          className={field + ' h-10 flex-1 basis-[220px]'}
        />
        <button type="button" className={primary} disabled={busy} onClick={go}>
          {busy ? 'Checking…' : 'Connect'}
        </button>
      </div>
      <p role="status" aria-live="polite" data-testid="asana-connect-err" className="mt-1.5 text-[13.5px] text-bad empty:hidden">
        {err}
      </p>
    </div>
  )
}

/** Connect Asana on its own (v143AsConnect): Tasks' Asana card. */
export function AsanaConnectDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Connect Asana in 3 steps"
      width={620}
      footer={
        <button type="button" className={ghost} onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="mb-3 text-[14px] text-ink-2">Send post-call tasks and client files to Asana from the dashboard.</p>
      <AsanaSteps onConnected={onClose} />
    </Dialog>
  )
}

type Load =
  | { kind: 'loading' }
  | { kind: 'connect'; refused: boolean }
  | { kind: 'error'; error: string }
  | { kind: 'empty'; workspace: string }
  | { kind: 'ready'; via: 'token' | 'team'; workspace: string; projects: AsanaProject[]; users: AsanaPerson[] }

export type AsanaRow = {
  id: string
  /** the task's name in Asana */
  title: string
  /** the name can be changed in the window (the workspace's items) */
  editable?: boolean
  /** what the row says in the window, when its name is not editable */
  label?: ReactNode
  notes: string
  due: string
  on: boolean
}

/** What went: each row sent (by id) with its task, the project, and whether that was everything. */
export type AsanaSentInfo = { made: (AsanaMade & { id: string })[]; project: string; projectName: string; all: boolean; append: boolean }

type Out = { ok: true; made: AsanaMade } | { ok: false; connect: boolean; error: string }

/** The team's connection, or this browser's token, for the window (apAs projects, v143AsUsers). */
async function setup(): Promise<Load> {
  if (hasAsanaToken()) {
    try {
      const s = await tokenSetup()
      if (!s.projects.length) return { kind: 'empty', workspace: s.workspace }
      return { kind: 'ready', via: 'token', ...s }
    } catch (e) {
      if (e instanceof AsanaAuthError) {
        asanaStore('token', '')
        return { kind: 'connect', refused: true }
      }
      return { kind: 'error', error: e instanceof Error ? e.message : String(e) }
    }
  }
  const r = await asanaTeamStart().catch(() => ({ ok: false as const, connect: false, error: 'Asana could not be reached: the dashboard could not be reached.' }))
  if (!r.ok) return r.connect ? { kind: 'connect', refused: false } : { kind: 'error', error: r.error }
  return { kind: 'ready', via: 'team', workspace: r.workspace, projects: r.projects, users: r.users }
}

/**
 * The Send to Asana window. `onSent` is told what went when everything went, and when a stop halfway left some sent
 * (`append` once this window already saved some, so the record adds to it).
 */
export function AsanaDialog({
  title,
  intro,
  rows,
  nothing,
  onSent,
  doneToast,
  onClose,
}: {
  title: string
  intro: ReactNode
  rows: AsanaRow[]
  /** said when nothing is ticked */
  nothing: string
  onSent: (info: AsanaSentInfo) => Promise<void> | void
  doneToast: (n: number, project: string) => string
  onClose: () => void
}) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [tries, setTries] = useState(0)
  const [project, setProject] = useState('')
  const [user, setUser] = useState('')
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.id, r.on])))
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.title])))
  const [dues, setDues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : ''])))
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.notes])))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [rest, setRest] = useState(false)
  // how many went in this window, and whether some were saved already (Send the rest adds to that record)
  const sent = useRef({ n: 0, saved: false })

  useEffect(() => {
    let live = true
    setup().then((l) => {
      if (!live) return
      setLoad(l)
      if (l.kind === 'ready') {
        const last = asanaRead('project')
        setProject(l.projects.some((p) => p.gid === last) ? last : l.projects[0]!.gid)
        const u = asanaRead('user')
        setUser(l.users.some((x) => x.gid === u) ? u : '')
      }
    })
    return () => {
      live = false
    }
  }, [tries])
  const again = () => {
    setLoad({ kind: 'loading' })
    setTries((n) => n + 1)
  }

  const send = async () => {
    if (load.kind !== 'ready') return
    setErr('')
    if (!project) return setErr('Pick a project first.')
    const picked = rows.filter((r) => on[r.id] && (names[r.id] ?? '').trim())
    if (!picked.length) return setErr(nothing)
    const projectName = load.projects.find((p) => p.gid === project)?.name ?? 'Asana'
    const assignee = load.users.some((u) => u.gid === user) ? user : ''
    const done: (AsanaMade & { id: string })[] = []
    const info = (all: boolean): AsanaSentInfo => ({ made: done, project, projectName, all, append: sent.current.saved })
    const keep = () => {
      asanaStore('project', project)
      if (assignee) asanaStore('user', assignee)
    }
    for (const r of picked) {
      setBusy('Sending ' + (done.length + 1) + ' of ' + picked.length + '…')
      const task = { text: (names[r.id] ?? '').trim().slice(0, 300), notes: (notes[r.id] ?? '').trim(), due: dues[r.id] ?? '', assignee }
      let out: Out
      if (load.via === 'token') {
        try {
          out = { ok: true, made: await tokenCreate(project, task) }
        } catch (e) {
          const auth = e instanceof AsanaAuthError
          if (auth) asanaStore('token', '')
          out = { ok: false, connect: auth, error: e instanceof Error ? e.message : String(e) }
        }
      } else {
        out = await asanaTeamCreate(project, task).catch(() => ({ ok: false as const, connect: false, error: 'the dashboard could not be reached.' }))
      }
      if (!out.ok) {
        const n = done.length
        setBusy('')
        if (n) {
          keep()
          sent.current.n += n
          await Promise.resolve(onSent(info(false))).catch(() => null)
          sent.current.saved = true
          setOn((x) => ({ ...x, ...Object.fromEntries(done.map((d) => [d.id, false])) }))
          setRest(true)
        }
        const msg = out.connect ? 'Asana didn’t accept the saved token.' : out.error
        setErr((n ? n + ' sent, then Asana stopped: ' : '') + msg + (n ? ' Send the rest picks up from there.' : ''))
        if (out.connect) setLoad({ kind: 'connect', refused: load.via === 'token' })
        return
      }
      done.push({ ...out.made, id: r.id })
    }
    keep()
    sent.current.n += done.length
    await Promise.resolve(onSent(info(true))).catch(() => null)
    setBusy('')
    onClose()
    toast(doneToast(sent.current.n, projectName))
  }

  let body: ReactNode
  let footer: ReactNode = (
    <button type="button" className={ghost} onClick={onClose}>
      Close
    </button>
  )
  if (load.kind === 'loading') {
    body = (
      <p role="status" className="text-[14px] text-ink-3">
        Loading your Asana projects…
      </p>
    )
  } else if (load.kind === 'connect') {
    body = (
      <div className="grid gap-3">
        {err ? (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-[13.5px] text-ink" data-testid="asana-err">
            {err}
          </p>
        ) : null}
        <p className="text-[14px] text-ink-2">{load.refused ? 'Asana didn’t accept the saved token. Connect again:' : 'Connect Asana once to send tasks there.'}</p>
        <AsanaSteps onConnected={again} />
      </div>
    )
  } else if (load.kind === 'error') {
    body = (
      <div className="rounded-md border border-line bg-sunk/60 px-3.5 py-3" data-testid="asana-off">
        <b className="block text-[14.5px] text-ink">Asana did not answer</b>
        <p className="mt-0.5 text-[14px] text-ink-2">{load.error || 'Try again in a minute.'}</p>
      </div>
    )
    footer = (
      <>
        <button type="button" className={ghost} onClick={onClose}>
          Close
        </button>
        <button type="button" className={primary} onClick={again}>
          Try again
        </button>
      </>
    )
  } else if (load.kind === 'empty') {
    body = <p className="text-[14px] text-ink-2">No projects in {load.workspace || 'your Asana workspace'} yet. Make one in Asana, then try again.</p>
    footer = (
      <>
        <button type="button" className={ghost} onClick={onClose}>
          Close
        </button>
        <button type="button" className={primary} onClick={again}>
          Try again
        </button>
      </>
    )
  } else {
    const via = load.via
    body = (
      <div className="grid gap-3">
        <p className="text-[14px] text-ink-2">{intro}</p>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <label className="block min-w-0">
            <span className="mb-1 block text-[13px] font-semibold text-ink-2">Project</span>
            <select value={project} onChange={(e) => setProject(e.target.value)} className={field + ' h-10'}>
              {load.projects.map((p) => (
                <option key={p.gid} value={p.gid}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[13px] font-semibold text-ink-2">
              Assignee <small className="font-normal text-ink-3">(optional)</small>
            </span>
            <select value={user} disabled={!load.users.length} onChange={(e) => setUser(e.target.value)} className={field + ' h-10 disabled:opacity-60'}>
              <option value="">Unassigned</option>
              {load.users.map((u) => (
                <option key={u.gid} value={u.gid}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {load.users.length ? null : (
          <p className="text-[13px] text-ink-3">{via === 'token' ? 'No people found in this Asana workspace.' : 'No people found in the team’s Asana workspace.'}</p>
        )}
        <p className="text-[12.5px] text-ink-3" data-testid="asana-via">
          {via === 'token' ? (
            <>
              Sending with the Asana token saved in this browser.{' '}
              <button
                type="button"
                className={link}
                onClick={() => {
                  if (disconnectAsana()) again()
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            'Sending through the team’s Asana connection in n8n.'
          )}
        </p>
        <div className="grid gap-2.5" data-testid="asana-rows">
          {rows.map((r) => {
            const nm = names[r.id] ?? ''
            const what = r.editable ? r.title : nm
            return (
              <div key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-md border border-line p-2.5 max-[560px]:grid-cols-[auto_minmax(0,1fr)]">
                <input type="checkbox" className="shrink-0" aria-label={'Send “' + what + '”'} checked={!!on[r.id]} onChange={(e) => setOn((x) => ({ ...x, [r.id]: e.target.checked }))} />
                {r.editable ? (
                  <input
                    type="text"
                    maxLength={300}
                    aria-label={'Task name for ' + r.title}
                    value={nm}
                    onChange={(e) => setNames((x) => ({ ...x, [r.id]: e.target.value }))}
                    className={field}
                  />
                ) : (
                  <span className="min-w-0 text-[14px] text-ink [overflow-wrap:anywhere]">{r.label ?? nm}</span>
                )}
                <input
                  type="date"
                  aria-label={'Due date for “' + what + '”'}
                  value={dues[r.id] ?? ''}
                  onChange={(e) => setDues((x) => ({ ...x, [r.id]: e.target.value }))}
                  className={field + ' w-auto max-[560px]:col-start-2 max-[560px]:w-full'}
                />
                <textarea
                  rows={4}
                  aria-label={'Description for “' + what + '”'}
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes((x) => ({ ...x, [r.id]: e.target.value }))}
                  className={field + ' col-span-3 resize-y text-[13px] max-[560px]:col-span-2'}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
    footer = (
      <>
        <span role="status" aria-live="polite" data-testid="asana-err" className="mr-auto min-w-0 text-[13.5px] text-bad [overflow-wrap:anywhere]">
          {err}
        </span>
        <button type="button" className={ghost} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={primary} disabled={!!busy} onClick={send}>
          {busy || (rest ? 'Send the rest' : 'Send to Asana')}
        </button>
      </>
    )
  }

  return (
    <Dialog open onClose={onClose} title={title} width={720} footer={footer}>
      {body}
    </Dialog>
  )
}

/** A task's description (apCxAsanaSend's noteOf): the call, the owner, why, the recording. */
export function taskNotes(t: Pick<Task, 'owner' | 'why'>, call: string, start: string, recording: string): string {
  return [
    'From the call “' + (call || 'the call') + '”' + (start ? ' on ' + usDateText(start) : ''),
    t.owner ? 'Owner: ' + t.owner : '',
    t.why ? 'Why: ' + t.why : '',
    recording ? 'Recording: ' + recording : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Tasks' Send to Asana: a call's tasks; what went is kept on the call's post-call actions. */
export function AsanaSend({
  outputId,
  call,
  start,
  recording,
  tasks,
  only,
  onDone,
  onClose,
}: {
  /** the call's post-call actions (call_outputs.id) */
  outputId: string
  call: string
  start: string
  recording: string
  tasks: Task[]
  /** the tasks picked (Select), else the open ones */
  only: string[]
  onDone: () => void
  onClose: () => void
}) {
  return (
    <AsanaDialog
      title="Send tasks to Asana"
      intro="Each ticked task becomes an Asana task in the project you pick."
      rows={tasks
        .filter((t) => t.text)
        .map((t) => ({
          id: t.id,
          title: t.text,
          on: only.length ? only.includes(t.id) : !t.done,
          due: t.due,
          notes: taskNotes(t, call, start, recording),
        }))}
      nothing="Tick at least one task."
      onSent={async (x) => {
        const r = await asanaMarkCall(
          outputId,
          x.project,
          x.projectName,
          x.made.map(({ gid, name, url }) => ({ gid, name, url })),
          x.append,
        ).catch(() => ({ ok: false as const, error: 'Could not save that they went to Asana: the dashboard could not be reached.' }))
        if (!r.ok) toast(r.error, 'warn')
        if (x.all) onDone()
      }}
      doneToast={(n, p) => n + ' task' + (n === 1 ? '' : 's') + ' sent to ' + p + '.'}
      onClose={onClose}
    />
  )
}

/** Tasks' Asana card: whether this browser has its own Asana connection, with Connect or Disconnect. */
export function AsanaCard({ legacy }: { legacy: string }) {
  const has = useAsanaToken()
  const [connect, setConnect] = useState(false)
  return (
    <section className="mt-5 max-w-[720px] rounded-lg border border-line bg-panel p-4 shadow-card sm:p-5" aria-labelledby="asana-h" data-testid="asana">
      <h2 id="asana-h" className="font-display text-[20px] font-semibold text-ink">
        Asana
      </h2>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2" data-testid="asana-state">
        {has
          ? 'Connected in this browser with your personal token. Send to Asana on a call (Select) uses it.'
          : 'Send to Asana on a call (Select) uses the team’s Asana connection in n8n. Or connect your own Asana with a personal token, saved in this browser only.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {has ? (
          <button type="button" className={ghost} onClick={() => disconnectAsana()}>
            Disconnect
          </button>
        ) : (
          <button type="button" className={primary} onClick={() => setConnect(true)}>
            Connect Asana
          </button>
        )}
        <a href={legacy} className="text-[13.5px] font-semibold text-accent-text hover:underline">
          Your open Asana tasks are still in the current dashboard
        </a>
      </div>
      {connect ? <AsanaConnectDialog onClose={() => setConnect(false)} /> : null}
    </section>
  )
}
