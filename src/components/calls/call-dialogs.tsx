'use client'

import { useEffect, useState } from 'react'
import { addCallType, saveCallDetails, slackChannels, slackPost, type SlackChannel } from '@/app/(app)/calls/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { CATS, type CallRow, type Guest, NO_CLIENT, ftGuests, guestsOf, newTypeProblem, typeLabel } from '@/lib/catalyst/calls'

// The Calls page's windows: Edit details, New call type, and Share to Slack, in the current dashboard's words.

const input = 'h-10 w-full rounded-sm border border-line bg-panel px-3 text-[14.5px] text-ink focus:border-accent focus:outline-none'
const label = 'mb-1 block text-[13px] font-semibold text-ink-2'
const area = 'w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none'
const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary = 'rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
const TAG_SUGGEST = ['onboarding', 'proposal', 'discovery', 'prequal', 'follow-up', 'renewal', 'referral']

/** The type picker's choices: grouped like the buttons, then the team's own types. */
export function TypeOptions({ current, custom }: { current: string; custom: string[] }) {
  const mine = [...custom]
  if (current && !CATS.some((c) => c[2].includes(current)) && !mine.includes(current)) mine.push(current)
  return (
    <>
      {CATS.map((c) => (
        <optgroup key={c[0]} label={c[1]}>
          {c[2].map((k) => (
            <option key={k} value={k}>
              {typeLabel(k)}
            </option>
          ))}
        </optgroup>
      ))}
      {mine.length ? (
        <optgroup label="Your types">
          {mine.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  )
}

const sameGuests = (a: Guest[], b: Guest[]) =>
  a.length === b.length && a.every((g, i) => g.name === b[i].name && g.email.toLowerCase() === b[i].email.toLowerCase() && g.external === b[i].external)

/** Edit details (apCxEdit): saved for the whole team in the dashboard; Fathom is not changed. */
export function EditDetails({ row, folders, tags, custom, onClose }: { row: CallRow; folders: string[]; tags: string[]; custom: string[]; onClose: () => void }) {
  const c = row.call
  const m = row.meta
  const [f, setF] = useState({
    title: m?.title ?? '',
    type: m?.meeting_type ?? '',
    client: m?.client ?? '',
    folder: m?.folder ?? '',
    tags: (m?.tags ?? []).join(', '),
    description: m?.description ?? '',
  })
  const [people, setPeople] = useState<Guest[]>(() => guestsOf(c, m).map((g) => ({ ...g })))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const setPerson = (i: number, p: Partial<Guest>) => setPeople((L) => L.map((g, j) => (j === i ? { ...g, ...p } : g)))
  const suggest = [...new Set([...TAG_SUGGEST, ...tags])].slice(0, 14)
  const have = f.tags.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase())

  const save = async () => {
    const kept = people.map((g) => ({ name: g.name.trim(), email: g.email.trim(), external: g.external })).filter((g) => g.name || g.email)
    const bad = kept.find((g) => g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email))
    if (bad) return setMsg(`“${bad.email}” does not look like an email address.`)
    setBusy(true)
    setMsg('')
    const r = await saveCallDetails(c.id, {
      ...f,
      guests: sameGuests(kept, ftGuests(c)) ? [] : kept,
    }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return setMsg(r.error)
    onClose()
    toast('Call details saved.')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Call details"
      width={640}
      footer={
        <>
          <span role="status" aria-live="polite" className="mr-auto text-[13.5px] text-bad" data-testid="details-msg">
            {msg}
          </span>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14px] leading-relaxed text-ink-2">
        Saved for the whole team in the dashboard. Fathom is not changed. These details feed the post-call actions, the HubSpot sync and Catalyst.
      </p>
      <div className="grid gap-3">
        <label className="block">
          <span className={label}>Title</span>
          <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={c.title} className={input} />
        </label>
        <label className="block">
          <span className={label}>Call type</span>
          <select value={f.type} onChange={(e) => set('type', e.target.value)} className={input}>
            <option value="">Not set (the AI picks one)</option>
            <TypeOptions current={f.type} custom={custom} />
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Client company</span>
            <input value={f.client} onChange={(e) => set('client', e.target.value)} placeholder="e.g. Northwind Advisors" className={input} />
          </label>
          <label className="block">
            <span className={label}>Client folder</span>
            <input value={f.folder} onChange={(e) => set('folder', e.target.value)} placeholder={'Filed under ' + row.folder} list="call-folders" className={input} />
            <datalist id="call-folders">
              {folders
                .filter((x) => x !== NO_CLIENT)
                .map((x) => (
                  <option key={x} value={x} />
                ))}
            </datalist>
          </label>
        </div>
        <p className="text-[12.5px] leading-snug text-ink-3">
          A call is filed under its folder, else its client company, else the company of the people on it. A call with only the AI Paragon team goes in AI
          Paragon (internal).
        </p>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold text-ink-2">People on the call</legend>
          <ul className="space-y-2">
            {people.map((g, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2" data-testid="person">
                <input value={g.name} onChange={(e) => setPerson(i, { name: e.target.value })} placeholder="Name" aria-label="Name" className={input + ' min-w-[140px] flex-1'} />
                <input
                  value={g.email}
                  onChange={(e) => setPerson(i, { email: e.target.value })}
                  placeholder="email@firm.com"
                  aria-label="Email"
                  className={input + ' min-w-[180px] flex-1'}
                />
                <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                  <input type="checkbox" checked={g.external} onChange={(e) => setPerson(i, { external: e.target.checked })} />
                  Client side
                </label>
                <button type="button" className="text-[13px] font-semibold text-ink-3 hover:text-bad" onClick={() => setPeople((L) => L.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-[13.5px] font-semibold text-accent-text hover:underline"
            onClick={() => setPeople((L) => [...L, { name: '', email: '', external: true }])}
          >
            + Add a person
          </button>
        </fieldset>

        <label className="block">
          <span className={label}>Tags</span>
          <input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="comma separated, e.g. onboarding, renewal" className={input} />
        </label>
        <div className="-mt-1 flex flex-wrap gap-1.5">
          {suggest
            .filter((t) => !have.includes(t))
            .map((t) => (
              <button
                key={t}
                type="button"
                className="rounded-full border border-line px-2 py-0.5 text-[12.5px] text-ink-2 hover:border-line-2"
                onClick={() => set('tags', [f.tags.trim().replace(/,\s*$/, ''), t].filter(Boolean).join(', '))}
              >
                #{t}
              </button>
            ))}
        </div>
        <label className="block">
          <span className={label}>Description</span>
          <textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What the call was about, anything to remember" className={area} />
        </label>
        <p className="text-[12.5px] leading-snug text-ink-3">
          The call type decides what gets written after the call: a demo recap, sales call notes, prequal notes that lead to the Assessment, a discovery recap
          that leads to the Growth Plan, a proposal follow-up, a 30-day onboarding plan, a client status update, or notes for an internal call.
        </p>
      </div>
    </Dialog>
  )
}

/** New call type (v121NewType): a kind of call of the team's own. */
export function NewTypeDialog({ onDone }: { onDone: (name: string | null) => void }) {
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const bad = newTypeProblem(name)
    if (bad) return setMsg(bad)
    setBusy(true)
    const r = await addCallType(name).catch(() => ({ ok: false as const, error: 'Could not add it: the dashboard could not be reached.' }))
    setBusy(false)
    if (!r.ok) return setMsg(r.error)
    onDone(r.name)
  }
  return (
    <Dialog
      open
      onClose={() => onDone(null)}
      title="New call type"
      width={460}
      footer={
        <>
          <span role="status" aria-live="polite" className="mr-auto text-[13.5px] text-bad" data-testid="type-msg">
            {msg}
          </span>
          <button type="button" className={ghost} onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={add}>
            {busy ? 'Adding…' : 'Add the type'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] leading-relaxed text-ink-2">A kind of call the team has, like Partner call or Podcast. It shows on every call and gets its own button.</p>
      <label className="block">
        <span className={label}>Name</span>
        <input
          autoFocus
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="e.g. Partner call"
          className={input}
        />
      </label>
    </Dialog>
  )
}

const LAST_CHANNEL = 'ap.cx.slack_channel'
const remembered = () => {
  try {
    return localStorage.getItem(LAST_CHANNEL) || ''
  } catch {
    return ''
  }
}

/** Share to Slack (apCxSlack): the channel and the message, which can be edited before it is posted. */
export function SlackShare({ outputId, text, onClose }: { outputId: string; text: string; onClose: () => void }) {
  const [channels, setChannels] = useState<SlackChannel[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [channel, setChannel] = useState('')
  const [msgText, setMsgText] = useState(text)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    slackChannels()
      .then((r) => {
        if (!live) return
        if (!r.ok) return setLoadErr(r.error)
        setChannels(r.channels)
        const last = remembered()
        setChannel(r.channels.some((c) => c.id === last) ? last : (r.channels[0]?.id ?? ''))
      })
      .catch(() => live && setLoadErr('Could not reach the dashboard.'))
    return () => {
      live = false
    }
  }, [])

  const post = async () => {
    setBusy(true)
    setMsg('')
    const r = await slackPost(outputId, channel, msgText).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    setBusy(false)
    if (!r.ok) return setMsg(r.error)
    try {
      localStorage.setItem(LAST_CHANNEL, channel)
    } catch {
      // the next share starts on the first channel
    }
    onClose()
    toast('Posted to Slack.')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Share to Slack"
      width={620}
      footer={
        channels ? (
          <>
            <span role="status" aria-live="polite" className="mr-auto text-[13.5px] text-bad" data-testid="slack-msg">
              {msg}
            </span>
            <button type="button" className={ghost} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={primary} disabled={busy || !channel} onClick={post}>
              {busy ? 'Posting…' : 'Post to Slack'}
            </button>
          </>
        ) : undefined
      }
    >
      {loadErr ? (
        <div className="rounded-md border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">
          <b className="block font-semibold">Slack could not be reached</b>
          <p className="mt-1 text-ink-2">{loadErr}</p>
        </div>
      ) : !channels ? (
        <p role="status" className="text-[14px] text-ink-3">
          Loading channels…
        </p>
      ) : (
        <div className="grid gap-3">
          <label className="block">
            <span className={label}>Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={input}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                  {c.member ? '' : ' (invite the n8n app first)'}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Message</span>
            <textarea rows={10} maxLength={3500} value={msgText} onChange={(e) => setMsgText(e.target.value)} className={area + ' font-mono text-[13.5px]'} />
          </label>
          <p className="text-[12.5px] text-ink-3">Slack formatting: *bold*, • bullets. You can edit before posting.</p>
        </div>
      )}
    </Dialog>
  )
}
