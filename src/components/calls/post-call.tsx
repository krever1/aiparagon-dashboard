'use client'

import { useState } from 'react'
import { setAutoActions, tickTask } from '@/app/(app)/calls/actions'
import { Dialog } from '@/components/ui/dialog'
import { Ago, dueText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type CallRow, type Task, deliverableOf, guestsOf, tasksText, typeLabel } from '@/lib/catalyst/calls'
import { SlackShare, TypeOptions } from './call-dialogs'
import { MiniMd } from './mini-md'

// A call's post-call actions (apCxPostPaint): a summary, next steps, the deliverable its call type calls for and a
// follow-up email, written by Meetings · Post-call Actions. They stay here, and can go to Slack or HubSpot.

const ghost = 'rounded-sm border border-line px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary = 'rounded-sm bg-action px-3.5 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
const card = 'rounded-md border border-line bg-panel p-4'
const select = 'h-9 rounded-sm border border-line bg-panel px-2.5 text-[14px] text-ink focus:border-accent focus:outline-none'

export type WriteRequest = { type: string; notes: string }

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied')
  } catch {
    toast('Copy blocked by the browser', 'warn')
  }
}

const slugOf = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'deliverable'

function TypePick({ value, onChange, custom, first }: { value: string; onChange: (v: string) => void; custom: string[]; first: string }) {
  return (
    <select aria-label="Call type for the post-call actions" value={value} onChange={(e) => onChange(e.target.value)} className={select}>
      <option value="">{first}</option>
      <TypeOptions current={value} custom={custom} />
    </select>
  )
}

export function PostCall({
  row,
  auto,
  custom,
  writing,
  onWrite,
  slackText,
  onRunAssessment,
}: {
  row: CallRow
  auto: boolean
  custom: string[]
  writing: boolean
  onWrite: (r: WriteRequest) => Promise<boolean>
  slackText: string
  onRunAssessment: () => Promise<void>
}) {
  const o = row.out
  const saved = row.meta?.meeting_type ?? ''
  const [type, setType] = useState(saved)
  const [notes, setNotes] = useState(row.meta?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [again, setAgain] = useState(false)
  const [slack, setSlack] = useState(false)
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [autoOn, setAutoOn] = useState(auto)
  const deliv = deliverableOf(row.type)

  const start = async (r: WriteRequest) => {
    setBusy(true)
    const ok = await onWrite(r)
    setBusy(false)
    return ok
  }

  const toggleAuto = async (on: boolean) => {
    setAutoOn(on)
    const r = await setAutoActions(on).catch(() => ({ ok: false as const, error: 'Could not save that: the dashboard could not be reached.' }))
    if (!r.ok) {
      setAutoOn(!on)
      return toast(r.error, 'warn')
    }
    toast('Saved. The next run follows it.')
  }

  const tick = async (t: Task, done: boolean) => {
    setTicks((x) => ({ ...x, [t.id]: done }))
    const r = await tickTask(o!.id, t.id, done).catch(() => ({ ok: false as const, error: 'Could not save that tick: the dashboard could not be reached.' }))
    if (!r.ok) {
      setTicks((x) => ({ ...x, [t.id]: !done }))
      toast(r.error, 'warn')
    }
  }

  const tasks = (o?.tasks ?? []).map((t) => (t.id in ticks ? { ...t, done: ticks[t.id] } : t))
  const open = tasks.filter((t) => !t.done).length
  const mails = guestsOf(row.call, row.meta).filter((g) => g.external && g.email).map((g) => g.email)

  const write = (label: string) => (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TypePick value={type} onChange={setType} custom={custom} first="Let the AI decide" />
        <button type="button" className={primary} disabled={busy} onClick={() => start({ type, notes })}>
          {busy ? 'Starting…' : label}
        </button>
      </div>
      <textarea
        rows={2}
        maxLength={1500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Anything the AI should know"
        placeholder="Anything the AI should know (optional), e.g. they asked for pricing by Friday"
        className="mt-2 w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
      />
    </>
  )

  return (
    <div className="space-y-3" data-testid="post-call">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[240px] flex-1">
          <h3 className="text-[15px] font-semibold text-ink">Meeting intelligence · post-call actions</h3>
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">
            A summary, next steps, the {deliv} and a follow-up email, written from this call. They stay here, and can go to Slack or HubSpot.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-2" title="When on, every new recorded call gets its actions within the hour">
          <input type="checkbox" checked={autoOn} onChange={(e) => toggleAuto(e.target.checked)} />
          Auto for new calls
        </label>
      </div>

      {writing ? (
        <div className={card} role="status">
          <b className="block text-[14.5px] font-semibold text-ink">Writing the post-call actions…</b>
          <p className="mt-1 text-[13.5px] text-ink-2">Reading the transcript and writing the {deliv}. This usually takes under a minute. You can leave this page.</p>
        </div>
      ) : !o ? (
        <div className={card}>
          <b className="block text-[14.5px] font-semibold text-ink">No post-call actions for this call yet</b>
          <p className="mt-1 text-[13.5px] text-ink-2">Pick the call type so the deliverable fits, or let the AI work it out from the call.</p>
          {write('Write post-call actions')}
          {autoOn ? <p className="mt-2 text-[12.5px] text-ink-3">New calls get these automatically within the hour. Older calls need the button.</p> : null}
        </div>
      ) : o.status === 'error' ? (
        <div className={card}>
          <b className="block text-[14.5px] font-semibold text-bad">The last try did not work: {o.error || 'unknown error'}</b>
          {write('Try again')}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {row.type ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-accent-text">{typeLabel(row.type)}</span> : null}
            <span className="text-[13.5px] text-ink-2">
              Written <Ago iso={o.created_at} />
              {o.source === 'auto' ? ' automatically' : o.created_by ? ' by ' + o.created_by.split('@')[0] : ''}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <button type="button" className={ghost} onClick={() => setSlack(true)}>
                Share to Slack
              </button>
              <button type="button" className={ghost} onClick={() => setAgain(true)}>
                ↻ Write again
              </button>
            </span>
          </div>
          {o.slack_posted_at ? (
            <p className="text-[13px] text-ink-3">
              Shared to Slack <Ago iso={o.slack_posted_at} />.
            </p>
          ) : null}

          {o.summary.length ? (
            <section className={card} aria-label="Summary">
              <h4 className="mb-1.5 text-[14px] font-semibold text-ink">Summary</h4>
              <ul className="list-disc space-y-1 pl-5 text-[14px] text-ink">
                {o.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={card} aria-label="Next steps">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="text-[14px] font-semibold text-ink">Next steps</h4>
              <span className="text-[12.5px] text-ink-3">{tasks.length ? `${open} of ${tasks.length} open` : 'none found'}</span>
              {tasks.length ? (
                <button type="button" className={ghost + ' ml-auto'} onClick={() => copy(tasksText(tasks, false))}>
                  ⧉ Copy
                </button>
              ) : null}
            </div>
            {tasks.length ? (
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <label className="flex gap-2.5 text-[14px] text-ink">
                      <input type="checkbox" checked={t.done} onChange={(e) => tick(t, e.target.checked)} className="mt-1" />
                      <span>
                        <span className={t.done ? 'text-ink-3 line-through' : ''}>{t.text}</span>
                        {t.owner || t.due || t.why ? (
                          <small className="block text-[12.5px] text-ink-3">
                            {[t.owner, t.due ? 'due ' + dueText(t.due) : '', t.why].filter(Boolean).join(' · ')}
                          </small>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-ink-3">The call had no clear next steps.</p>
            )}
          </section>

          {o.deliverable ? (
            <section className={card} aria-label={o.deliverable.title || 'Deliverable'}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="text-[14px] font-semibold text-ink">{o.deliverable.title || 'Deliverable'}</h4>
                <span className="ml-auto flex gap-2">
                  <button type="button" className={ghost} onClick={() => copy('# ' + (o.deliverable!.title || 'Deliverable') + '\n\n' + o.deliverable!.markdown)}>
                    ⧉ Copy
                  </button>
                  <button
                    type="button"
                    className={ghost}
                    onClick={() => {
                      const d = o.deliverable!
                      const blob = new Blob(['# ' + (d.title || 'Deliverable') + '\n\n' + d.markdown], { type: 'text/markdown' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = slugOf(d.title) + '.md'
                      a.click()
                      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
                    }}
                  >
                    ⬇ .md
                  </button>
                </span>
              </div>
              <MiniMd text={o.deliverable.markdown} />
            </section>
          ) : null}

          {o.follow_up ? (
            <section className={card} aria-label="Follow-up email">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="text-[14px] font-semibold text-ink">Follow-up email</h4>
                <span className="ml-auto flex gap-2">
                  <button type="button" className={ghost} onClick={() => copy('Subject: ' + o.follow_up!.subject + '\n\n' + o.follow_up!.body)}>
                    ⧉ Copy
                  </button>
                  {mails.length ? (
                    <a
                      className={ghost}
                      href={`mailto:${mails.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(o.follow_up.subject)}&body=${encodeURIComponent(o.follow_up.body)}`}
                    >
                      Open in email
                    </a>
                  ) : null}
                </span>
              </div>
              <p className="text-[14px] text-ink">
                <b className="font-semibold">Subject:</b> {o.follow_up.subject}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{o.follow_up.body}</p>
            </section>
          ) : null}
        </>
      )}

      {o && o.status !== 'error' && !writing && (row.type === 'interview' || row.type === 'discovery') ? <RunFromCall onRun={onRunAssessment} discovery={row.type === 'discovery'} /> : null}

      {again ? (
        <WriteAgain
          custom={custom}
          saved={saved}
          notes={row.meta?.description ?? ''}
          onClose={() => setAgain(false)}
          onGo={async (r) => {
            setAgain(false)
            await start(r)
          }}
        />
      ) : null}
      {slack && o ? <SlackShare outputId={o.id} text={slackText} onClose={() => setSlack(false)} /> : null}
    </div>
  )
}

/** The Assessment from an interview or discovery call: New run, filled in from the call. */
function RunFromCall({ onRun, discovery }: { onRun: () => Promise<void>; discovery: boolean }) {
  const [busy, setBusy] = useState(false)
  return (
    <section className="rounded-md border border-accent/30 bg-accent-soft/50 p-4" aria-label="Next: the Assessment">
      <h4 className="text-[14.5px] font-semibold text-ink">Next: the Assessment</h4>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {discovery
          ? 'Write the assessment from this call. Only the assessment runs, with this call as what was said.'
          : 'Write the assessment from this call, for the lead’s Assessment stage. Only the assessment runs.'}
      </p>
      <button
        type="button"
        className={primary + ' mt-2.5'}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await onRun()
          setBusy(false)
        }}
      >
        {busy ? 'Loading the transcript…' : 'Run the assessment from this call'}
      </button>
    </section>
  )
}

function WriteAgain({
  custom,
  saved,
  notes,
  onClose,
  onGo,
}: {
  custom: string[]
  saved: string
  notes: string
  onClose: () => void
  onGo: (r: WriteRequest) => void
}) {
  const [type, setType] = useState(saved)
  const [text, setText] = useState(notes)
  return (
    <Dialog
      open
      onClose={onClose}
      title="Write the post-call actions again"
      width={520}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} onClick={() => onGo({ type, notes: text })}>
            Write again
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] leading-relaxed text-ink-2">This makes a fresh set from the call. The current set stays in the history, and ticked tasks start unticked.</p>
      <label className="mb-3 block">
        <span className="mb-1 block text-[13px] font-semibold text-ink-2">Call type</span>
        <TypePick value={type} onChange={setType} custom={custom} first="Let the AI decide" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-ink-2">Notes for the AI (optional)</span>
        <textarea
          rows={3}
          maxLength={1500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
        />
      </label>
    </Dialog>
  )
}
