'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { answerClient } from '@/app/(app)/today/actions'
import { Dialog } from '@/components/ui/dialog'
import { usDayText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { companyOf } from '@/lib/catalyst/calls'
import type { ClientItem } from '@/lib/catalyst/inbox'
import type { Stage } from '@/lib/catalyst/stages'

// A new contact on a call (v144AskClient): someone from outside on a recent call who is not a lead and matches no client
// folder. Create client record puts them on the Lead pipeline in Prospect research and files the call in their folder
// (and writes the prospect brief if ticked); Just file the call sets its folder only; Not a client sets it aside.

const input = 'h-10 w-full rounded-sm border border-line bg-panel px-3 text-[14.5px] text-ink focus:border-accent focus:outline-none'
const label = 'mb-1 block text-[13px] font-semibold text-ink-2'
const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary =
  'inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

export function ClientQuestion({ item, research, onClose }: { item: ClientItem; research: Stage; onClose: () => void }) {
  const hydrated = useHydrated()
  const first = item.people[0]
  const [who, setWho] = useState(0)
  const [f, setF] = useState(() => {
    const co = companyOf(first?.email ?? '')
    return { name: first?.name ?? '', email: first?.email ?? '', company: co, folder: co || first?.name || first?.email || '', auto: true }
  })
  const [run, setRun] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const shown = first?.name || first?.email || ''
  const meta = [usDayText(item.start, hydrated ? undefined : 'UTC'), item.minutes ? item.minutes + ' min' : '', item.title].filter(Boolean).join(' · ')

  const pick = (i: number) => {
    const p = item.people[i]
    if (!p) return
    setWho(i)
    const co = companyOf(p.email)
    setF((x) => ({ ...x, name: p.name, email: p.email, company: co, folder: x.auto ? co || p.name || p.email : x.folder }))
  }

  const go = async (action: 'skip' | 'file' | 'add') => {
    setBusy(true)
    setMsg({ text: action === 'skip' ? 'Setting it aside…' : action === 'add' ? 'Creating the client record…' : 'Filing the call…' })
    const r = await answerClient({ callId: item.id, action, name: f.name, email: f.email, company: f.company, folder: f.folder, run }).catch(() => ({
      ok: false as const,
      error: 'Could not save it: the dashboard could not be reached. Try again in a minute.',
    }))
    if (!r.ok) {
      setBusy(false)
      setMsg({ text: r.error, bad: true })
      return
    }
    onClose()
    toast(r.toast)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Catalyst · New contact on a call"
      title={`Create a client record for ${shown}?`}
      width={640}
      footer={
        <>
          <button type="button" className={ghost} disabled={busy} onClick={() => go('skip')}>
            Not a client
          </button>
          <span className="flex-1" />
          <button type="button" className={ghost} disabled={busy} onClick={() => go('file')}>
            Just file the call
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => go('add')}>
            <Check size={16} aria-hidden="true" />
            Create client record
          </button>
        </>
      }
    >
      <p className="text-[13.5px] text-ink-3">{meta}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink" data-testid="client-line">
        {shown} is not a lead yet, and no client folder matches the people on this call. A client record puts them on the Lead pipeline in {research.name} and
        files this call in their folder.
      </p>
      <div className="mt-3 grid gap-3">
        {item.people.length > 1 ? (
          <label className="block">
            <span className={label}>Who is the client</span>
            <select className={input} value={who} onChange={(e) => pick(Number(e.target.value))}>
              {item.people.map((p, i) => (
                <option key={p.email} value={i}>
                  {(p.name || p.email) + ' · ' + p.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Name</span>
            <input className={input} maxLength={120} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
          </label>
          <label className="block">
            <span className={label}>Email</span>
            <input className={input} maxLength={200} value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} />
          </label>
          <label className="block">
            <span className={label}>Company</span>
            <input
              className={input}
              maxLength={120}
              value={f.company}
              onChange={(e) => {
                const v = e.target.value
                setF((x) => ({ ...x, company: v, folder: x.auto ? v : x.folder }))
              }}
            />
          </label>
          <label className="block">
            <span className={label}>Client folder</span>
            <input className={input} maxLength={80} value={f.folder} onChange={(e) => setF((x) => ({ ...x, folder: e.target.value, auto: false }))} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input type="checkbox" checked={run} onChange={(e) => setRun(e.target.checked)} /> Write the pre-meeting prospect brief now
        </label>
      </div>
      <p role="status" aria-live="polite" data-testid="client-question-msg" className={`mt-2 min-h-[1.2em] text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
        {msg?.text ?? ''}
      </p>
    </Dialog>
  )
}
