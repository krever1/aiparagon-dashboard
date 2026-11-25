'use client'

import { useEffect, useState } from 'react'
import { type NotionDb, type NotionSent, notionAdd, notionMark, notionStart } from '@/app/(app)/tasks/actions'
import { Dialog } from '@/components/ui/dialog'
import { usDateText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import type { Task } from '@/lib/catalyst/calls'

// Send tasks to Notion (v144Notion, v144NotionSend): each ticked task becomes an entry in the database picked, named for
// the task and the call, plus a follow-up entry for the call if ticked. A stop halfway says how many went, and Send the
// rest sends only the others.

const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary = 'rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

/** "<task> · <call>", 300 characters at most (v144NtTitle). */
export function entryTitle(text: string, call: string): string {
  const s = text.trim() + (call ? ' · ' + call : '')
  return s.length > 300 ? s.slice(0, 299) + '…' : s
}

/** The steps to share a database with the dashboard (v144NtShareHelp). */
export function ShareHelp() {
  const steps: [string, string][] = [
    ['Open the database in Notion', 'The one the tasks should go to.'],
    ['⋯ → Connections → add the n8n connection', 'That lets the dashboard add entries to it. Nothing else in Notion is shared.'],
    ['Come back and press Check again', 'The database then shows in the list here.'],
  ]
  return (
    <ol className="mt-2 grid gap-2" data-testid="notion-steps">
      {steps.map(([b, s], i) => (
        <li key={b} className="flex gap-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-action text-[12px] font-semibold text-action-ink">{i + 1}</span>
          <div>
            <b className="block text-[14px] font-semibold text-ink">{b}</b>
            <small className="block text-[13px] text-ink-3">{s}</small>
          </div>
        </li>
      ))}
    </ol>
  )
}

type Load = { kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'ready'; dbs: NotionDb[]; pick: string; sent: NotionSent | null }

export function NotionSend({
  callId,
  call,
  start,
  tasks,
  only,
  onClose,
}: {
  callId: string
  /** the call's title as Fathom (or its post-call actions) has it */
  call: string
  start: string
  tasks: Task[]
  /** the tasks picked (Select), else the open ones */
  only: string[]
  onClose: () => void
}) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [tries, setTries] = useState(0)
  const [db, setDb] = useState('')
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(tasks.map((t) => [t.id, only.length ? only.includes(t.id) : !t.done])))
  const [fu, setFu] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [rest, setRest] = useState(false)

  useEffect(() => {
    let live = true
    notionStart(callId)
      .then((r) => {
        if (!live) return
        if (!r.ok) return setLoad({ kind: 'error', error: r.error })
        const sorted = [...r.dbs].sort((a, b) => a.name.localeCompare(b.name))
        setLoad({ kind: 'ready', dbs: sorted, pick: r.pick, sent: r.sent })
        setDb(sorted.some((d) => d.id === r.pick) ? r.pick : (sorted.find((d) => /task/i.test(d.name))?.id ?? ''))
      })
      .catch(() => live && setLoad({ kind: 'error', error: 'Notion could not be read: the dashboard could not be reached.' }))
    return () => {
      live = false
    }
  }, [callId, tries])

  const name = load.kind === 'ready' ? (load.dbs.find((d) => d.id === db)?.name ?? 'Untitled database') : ''
  const callName = call || 'the call'

  const send = async () => {
    setErr('')
    if (!db) return setErr('Pick a database first.')
    const picked = tasks.filter((t) => on[t.id] && t.text)
    if (!picked.length && !fu) return setErr('Tick at least one task, or the follow-up.')
    const titles = picked.map((t) => entryTitle(t.text, callName))
    if (fu) titles.push(entryTitle('Follow-up: ' + callName + (start ? ' (' + usDateText(start) + ')' : ''), ''))
    let n = 0
    for (const t of titles) {
      setBusy('Sending ' + (n + 1) + ' of ' + titles.length + '…')
      const r = await notionAdd(db, t).catch(() => ({ ok: false as const, error: 'no answer' }))
      if (!r.ok) {
        setBusy('')
        setRest(true)
        setErr((n ? n + ' sent, then ' : '') + 'Notion stopped: ' + r.error + (n ? ' Send the rest picks up from there.' : ''))
        if (n) {
          await notionMark(callId, db, name, n).catch(() => null)
          const gone = picked.slice(0, Math.min(n, picked.length)).map((x) => x.id)
          setOn((x) => ({ ...x, ...Object.fromEntries(gone.map((id) => [id, false])) }))
          if (n > picked.length) setFu(false)
        }
        return
      }
      n++
    }
    await notionMark(callId, db, name, n).catch(() => null)
    setBusy('')
    onClose()
    toast(n + ' sent to Notion · ' + name)
  }

  let body: React.ReactNode
  let footer: React.ReactNode
  if (load.kind === 'loading') {
    body = (
      <p role="status" className="text-[14px] text-ink-3">
        Reading your Notion databases…
      </p>
    )
  } else if (load.kind === 'error') {
    body = <p className="text-[14px] text-ink-2">{load.error}</p>
    footer = (
      <button type="button" className={ghost} onClick={onClose}>
        Close
      </button>
    )
  } else if (!load.dbs.length) {
    body = (
      <>
        <p className="text-[14px] text-ink-2">Notion shares no databases with the dashboard yet.</p>
        <ShareHelp />
      </>
    )
    footer = (
      <>
        <button type="button" className={ghost} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className={primary}
          onClick={() => {
            setLoad({ kind: 'loading' })
            setTries((n) => n + 1)
          }}
        >
          Check again
        </button>
      </>
    )
  } else {
    const s = load.sent
    body = (
      <div className="grid gap-3">
        <p className="text-[14px] text-ink-2">Each ticked task becomes an entry in the database you pick, named for the task and the call.</p>
        {s ? (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-ink" data-testid="notion-was">
            Already sent {s.n} to “{s.name || 'Notion'}” on {usDateText(s.at)}
            {s.by ? ' by ' + s.by : ''}. Sending again adds new entries.
          </p>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-ink-2">Database</span>
          <select
            value={db}
            onChange={(e) => setDb(e.target.value)}
            className="h-10 w-full rounded-sm border border-line bg-panel px-3 text-[14.5px] text-ink focus:border-accent focus:outline-none"
          >
            {db ? null : <option value="">Pick a database…</option>}
            {load.dbs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <details className="text-[13px]">
          <summary className="cursor-pointer font-semibold text-accent-text">Database not in the list?</summary>
          <ShareHelp />
        </details>
        <div className="grid gap-1" data-testid="notion-tasks">
          {tasks.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-2 py-1 text-[14px] text-ink">
              <input type="checkbox" className="mt-1" checked={!!on[t.id]} onChange={(e) => setOn((x) => ({ ...x, [t.id]: e.target.checked }))} />
              <span>
                {t.text}
                {t.owner ? <small className="text-ink-3"> · {t.owner}</small> : null}
              </span>
            </label>
          ))}
        </div>
        <label className="flex cursor-pointer items-start gap-2 border-t border-line pt-2.5 text-[14px] text-ink">
          <input type="checkbox" className="mt-1" checked={fu} onChange={(e) => setFu(e.target.checked)} />
          <span>Add a follow-up entry: “Follow-up: {callName}”</span>
        </label>
      </div>
    )
    footer = (
      <>
        <span role="status" aria-live="polite" data-testid="notion-err" className="mr-auto text-[13.5px] text-bad">
          {err}
        </span>
        <button type="button" className={ghost} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={primary} disabled={!!busy} onClick={send}>
          {busy || (rest ? 'Send the rest' : 'Send to Notion')}
        </button>
      </>
    )
  }

  return (
    <Dialog open onClose={onClose} title="Send tasks to Notion" width={700} footer={footer}>
      {body}
    </Dialog>
  )
}
