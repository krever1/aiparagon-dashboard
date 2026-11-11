'use client'

import { useState, useSyncExternalStore } from 'react'
import { Mic, Sparkles } from 'lucide-react'
import { type CallPick, callText, newRun, recentCalls } from '@/app/(app)/lead-pipeline/actions'
import { Dialog } from '@/components/ui/dialog'
import { LocalDate } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'

export type Entry = 'research' | 'consultation' | 'assessment'

const ENTRIES: { key: Entry; name: string; what: string; mode: string }[] = [
  { key: 'research', name: 'Prospect research', what: 'Writes the pre-meeting prospect brief from the lead’s details', mode: 'Prospect research · writes the prospect brief' },
  {
    key: 'consultation', name: 'Discovery consultation',
    what: 'Writes the consultation guide. Paste what was said in the first meeting: it stands in for a prospect brief',
    mode: 'Discovery consultation · writes the consultation guide',
  },
  { key: 'assessment', name: 'Assessment', what: 'Writes the assessment report from the consultation. Paste its transcript or notes', mode: 'Assessment · writes the assessment' },
]

const FIELDS = [
  ['firstName', 'First name', ''],
  ['lastName', 'Last name', ''],
  ['title', 'Title', 'e.g. Managing Partner'],
  ['company', 'Company', ''],
  ['link', 'Company link', 'https://…'],
  ['email', 'Email', ''],
  ['phone', 'Phone', ''],
  ['firmType', 'Firm type', 'e.g. RIA'],
  ['firmSize', 'Firm size / AUM', 'e.g. $100M–$500M'],
] as const

export type Form = Record<(typeof FIELDS)[number][0], string>
const EMPTY: Form = { firstName: '', lastName: '', title: '', company: '', link: '', email: '', phone: '', firmType: '', firmSize: '' }

const input = 'h-10 w-full rounded-sm border border-line bg-panel px-3 text-[14.5px] text-ink focus:border-accent focus:outline-none'

const noop = () => () => {}
/** The address asks for the form (Today's Quick start links to /lead-pipeline?run=new); false while the server draws. */
const askedNew = () => new URLSearchParams(window.location.search).get('run') === 'new'

/** The header's New run: a lead that is not on the board yet, started at the stage the client is at. */
export function NewRunButton() {
  const asked = useSyncExternalStore(noop, askedNew, () => false)
  const [state, setState] = useState<'asked' | 'open' | 'closed'>('asked')
  const open = state === 'open' || (state === 'asked' && asked)
  const close = () => {
    setState('closed')
    const u = new URL(window.location.href)
    if (u.searchParams.get('run') === 'new') {
      u.searchParams.delete('run')
      window.history.replaceState(null, '', u.pathname + u.search)
    }
  }
  const setOpen = (on: boolean) => (on ? setState('open') : close())
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2.5 text-[15px] font-semibold text-action-ink shadow-card hover:bg-action-hover"
      >
        <Sparkles size={17} aria-hidden="true" className="text-art-gold" />
        New run
      </button>
      {open ? <NewRunDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

/** What the form opens with: a HubSpot contact's details, or a call's transcript and guest, and a line saying so. */
export type NewRunPrefill = { form?: Partial<Form>; entry?: Entry; transcript?: string; note?: string }

/** The New Catalyst run form, empty or prefilled. */
export function NewRunDialog({ onClose, prefill }: { onClose: () => void; prefill?: NewRunPrefill }) {
  const [entry, setEntry] = useState<Entry>(prefill?.entry ?? 'research')
  const [f, setF] = useState<Form>(() => ({ ...EMPTY, ...prefill?.form }))
  const [transcript, setTranscript] = useState(prefill?.transcript ?? '')
  const [doc, setDoc] = useState<{ name: string; text: string } | null>(null)
  const [docMsg, setDocMsg] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(prefill?.note ? { text: prefill.note } : null)
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const [picker, setPicker] = useState<{ calls: CallPick[] | null; error: string; q: string } | null>(null)
  const mode = ENTRIES.find((e) => e.key === entry)!

  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }))

  const readFile = async (file: File | undefined) => {
    setDoc(null)
    if (!file) return setDocMsg('')
    if (file.size > 400_000) return setDocMsg('File too large (max ~400 KB): paste the key sections into the transcript box instead.')
    try {
      const text = await file.text()
      setDoc({ name: file.name, text })
      setDocMsg(`Loaded ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB) ✓`)
    } catch {
      setDocMsg('Couldn’t read that file.')
    }
  }

  const openPicker = async () => {
    if (picker) return setPicker(null)
    setPicker({ calls: null, error: '', q: '' })
    const r = await recentCalls().catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    setPicker((p) => (p ? (r.ok ? { ...p, calls: r.calls } : { ...p, calls: [], error: r.error }) : p))
  }

  const pick = async (c: CallPick) => {
    setMsg({ text: 'Loading the transcript…' })
    const r = await callText(c.id).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    if (!r.ok) return setMsg({ text: r.error, bad: true })
    if (!r.text) {
      setMsg(null)
      return toast('Fathom has no transcript for this call.', 'warn')
    }
    setTranscript(r.text)
    if (c.guest) {
      const [first, ...rest] = c.guest.name.trim().split(/\s+/)
      setF((x) => ({
        ...x,
        firstName: x.firstName || (c.guest!.name.includes('@') ? '' : first || ''),
        lastName: x.lastName || (c.guest!.name.includes('@') ? '' : rest.join(' ')),
        email: x.email || c.guest!.email,
      }))
    }
    setPicker(null)
    setMsg({ text: `Loaded “${c.title || 'the call'}” (${r.text.split('\n').length} lines).` })
  }

  const start = async () => {
    setBusy(true)
    setMsg({ text: 'Starting run…' })
    const r = await newRun({ entry, ...f, transcript, doc: doc?.text ?? '' }).catch(() => ({
      ok: false as const,
      error: 'Could not reach the dashboard. Try again in a minute.',
    }))
    setBusy(false)
    if (!r.ok) return setMsg({ text: r.error, bad: true })
    setStarted(true)
    setMsg({ text: 'Started ✓: the document lands on the lead when it is done.' })
    toast(r.toast)
  }

  const q = picker?.q.trim().toLowerCase() ?? ''
  const calls = (picker?.calls ?? []).filter((c) => !q || [c.title, c.guest?.name, c.guest?.email].join(' ').toLowerCase().includes(q))

  return (
    <Dialog
      open
      onClose={onClose}
      title="New Catalyst run"
      width={720}
      footer={
        <>
          <span role="status" aria-live="polite" data-testid="new-run-msg" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
            {msg?.text ?? ''}
          </span>
          <span className="hidden rounded-full bg-sunk px-2.5 py-1 text-[12.5px] text-ink-2 sm:inline">{mode.mode}</span>
          <button
            type="button"
            disabled={busy || started}
            onClick={start}
            className="inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60"
          >
            {started ? 'Run started ✓' : 'Start run ▶'}
          </button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold text-ink">Which stage is this client at?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ENTRIES.map((e) => (
            <label
              key={e.key}
              className={`flex cursor-pointer gap-2 rounded-md border p-3 text-[13.5px] ${entry === e.key ? 'border-accent bg-accent-soft' : 'border-line bg-panel'}`}
            >
              <input type="radio" name="entry" value={e.key} checked={entry === e.key} onChange={() => setEntry(e.key)} className="mt-0.5" />
              <span>
                <b className="block font-semibold text-ink">{e.name}</b>
                <span className="text-ink-2">{e.what}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">
          Only that stage runs. When the client gets to the next meeting, move them on the Lead pipeline board and Catalyst
          writes that stage’s prep.
        </p>
      </fieldset>

      <h3 className="mb-2 mt-4 text-[14px] font-semibold text-ink">Lead details</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label, ph]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink-2">{label}</span>
            <input
              type={k === 'email' ? 'email' : k === 'link' ? 'url' : 'text'}
              value={f[k]}
              placeholder={ph}
              required={k === 'email'}
              onChange={(e) => set(k, e.target.value)}
              className={input}
            />
          </label>
        ))}
      </div>

      {entry !== 'research' ? (
        <section className="mt-4 rounded-md border border-line bg-sunk/60 p-3.5" aria-label="Source material">
          <h3 className="text-[14px] font-semibold text-ink">
            Source material <small className="font-normal text-ink-3">used by the AI in place of the stages you skip</small>
          </h3>
          <label className="mt-2 block">
            <span className="mb-1 block text-[13px] font-semibold text-ink-2">Call transcript or notes</span>
            <textarea
              rows={7}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Pick a Fathom call below, or paste a transcript or your notes"
              className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={openPicker} aria-expanded={!!picker} className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2">
              <Mic size={15} aria-hidden="true" />
              Use a Fathom call
            </button>
            <small className="text-[12.5px] text-ink-3">Loads the call transcript into the box above.</small>
          </div>
          {picker ? (
            <div className="mt-2 rounded-sm border border-line bg-panel p-2" data-testid="call-picker">
              {picker.calls === null ? (
                <p role="status" className="p-2 text-[13.5px] text-ink-3">
                  Loading your Fathom calls…
                </p>
              ) : picker.error ? (
                <p className="p-2 text-[13.5px] text-bad">{picker.error}</p>
              ) : (
                <>
                  <input
                    type="search"
                    value={picker.q}
                    onChange={(e) => setPicker((p) => (p ? { ...p, q: e.target.value } : p))}
                    placeholder="Search calls or people"
                    aria-label="Search calls or people"
                    className={input + ' mb-2'}
                  />
                  <ul className="max-h-[220px] overflow-y-auto">
                    {calls.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => pick(c)} className="flex w-full flex-wrap items-baseline gap-x-2 rounded-sm px-2 py-1.5 text-left text-[13.5px] hover:bg-sunk">
                          <b className="font-semibold text-ink">{c.title || 'A call'}</b>
                          <small className="text-ink-3">
                            <LocalDate iso={c.start} />
                            {c.minutes ? ` · ${c.minutes} min` : ''}
                            {c.guest ? ` · ${c.guest.name || c.guest.email}` : ''}
                          </small>
                        </button>
                      </li>
                    ))}
                    {!calls.length ? <li className="p-2 text-[13.5px] text-ink-3">No calls match.</li> : null}
                  </ul>
                </>
              )}
            </div>
          ) : null}
          <label className="mt-3 block">
            <span className="mb-1 block text-[13px] font-semibold text-ink-2">Supporting document (.txt or .md, read into the run)</span>
            <input type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv" onChange={(e) => readFile(e.target.files?.[0])} className="text-[13px]" />
          </label>
          {docMsg ? <p className="mt-1 text-[12.5px] text-ink-2">{docMsg}</p> : null}
        </section>
      ) : null}
    </Dialog>
  )
}
