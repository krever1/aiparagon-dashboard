'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { type LeadCallRow, type ReadsResult, answerCall, callSummary, stageReads } from '@/app/(app)/lead-pipeline/actions'
import { Dialog } from '@/components/ui/dialog'
import { LocalUsDay } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { planFor } from '@/lib/catalyst/plan'
import { type Stage, nextStageKey } from '@/lib/catalyst/stages'
import { type LeadView, viewStage } from '@/lib/catalyst/view'

// A new transcript (v137AskCall): a recorded call with a lead, filed under the stage the lead is in, set aside, or
// filed and the next stage run with it.

const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary =
  'inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

export function CallQuestion({
  lead,
  stages,
  call,
  onClose,
  onDone,
}: {
  lead: LeadView
  stages: Stage[]
  call: LeadCallRow
  onClose: () => void
  onDone: () => void
}) {
  const cur = viewStage(lead)
  const nx = nextStageKey(cur)
  const same = nx === cur
  const st = stages.find((s) => s.key === nx)!
  const cst = stages.find((s) => s.key === cur)!
  const name = lead.name
  const filed = call.stage && call.stage !== 'none' ? stages.find((s) => s.key === call.stage) : null
  const running = lead.run ? stages.find((s) => s.key === lead.run!.s) : null
  const stop = running
    ? `Catalyst is still writing ${running.what} for ${name}. File the transcript now, and run the next stage once that is done.`
    : planFor(lead, nx).blocked
  const [reads, setReads] = useState<ReadsResult | null>(null)
  const [sum, setSum] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    stageReads(lead.id, nx)
      .then((r) => live && setReads(r))
      .catch(() => live && setReads({ ok: false, error: '' }))
    callSummary(call.id)
      .then((s) => live && setSum(s))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [lead.id, nx, call.id])

  const go = async (action: 'skip' | 'file' | 'run') => {
    setBusy(true)
    setMsg({ text: action === 'skip' ? 'Setting it aside…' : action === 'file' ? 'Filing it…' : 'Filing the transcript, then reading the call transcripts and emails…' })
    const r = await answerCall({ leadId: lead.id, callId: call.id, action, notes }).catch(() => ({
      ok: false as const,
      error: 'Could not reach the dashboard. Try again in a minute.',
    }))
    if (!r.ok) {
      setBusy(false)
      setMsg({ text: r.error, bad: true })
      return
    }
    onClose()
    toast(r.toast)
    onDone()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Catalyst · New transcript"
      title={same ? `Run ${st.what} again with this call?` : `Run the ${st.name.toLowerCase()} stage for ${name}?`}
      width={640}
      footer={
        <>
          <button type="button" className={ghost} disabled={busy} onClick={() => go('skip')}>
            Not about this client
          </button>
          <span className="flex-1" />
          <button type="button" className={ghost} disabled={busy} onClick={() => go('file')}>
            Just file it
          </button>
          {stop ? null : (
            <button type="button" className={primary} disabled={busy} onClick={() => go('run')}>
              <Check size={16} aria-hidden="true" />
              {same ? 'Run it again' : 'Move and run it'}
            </button>
          )}
        </>
      }
    >
      <div className="rounded-md border border-line bg-sunk/60 p-3.5" data-testid="call-card">
        <b className="block text-[14.5px] font-semibold text-ink">Your call with {name}</b>
        <small className="block text-[13px] text-ink-3">
          <LocalUsDay iso={call.start} />
          {[call.minutes ? `${call.minutes} min` : '', call.title].filter(Boolean).map((x) => ' · ' + x)}
        </small>
        {sum.length ? (
          <>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-ink">
              {sum.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <span className="mt-1 block text-[12px] text-ink-3">From the post-call summary</span>
          </>
        ) : null}
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-ink">
        {filed ? `Its transcript is filed under ${filed.name}. ` : `Its transcript is filed under ${cst.name}, where ${name} is now. `}
        {same ? `Catalyst writes ${st.what} again, with this call.` : `In ${st.name}, Catalyst writes ${st.what} from everything so far and this call.`} Only that
        runs, and nothing goes to the client.
      </p>
      <div className="mt-3 rounded-md border border-line bg-sunk/60 p-3.5" data-testid="reads">
        <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Reads</p>
        {!reads ? (
          <p role="status" className="text-[13.5px] text-ink-3">
            … Checking for call transcripts and emails…
          </p>
        ) : reads.ok ? (
          <ul className="space-y-1">
            {reads.rows.map((r, i) => (
              <li key={i} data-ok={r.ok ? 'yes' : 'no'} className={`flex gap-2 text-[13.5px] leading-snug ${r.ok ? 'text-ink' : 'text-ink-3'}`}>
                <span aria-hidden="true" className="w-3 shrink-0">
                  {r.ok ? '✓' : '–'}
                </span>{' '}
                <span>
                  {r.text}
                  {r.date ? <LocalUsDay iso={r.date} /> : null}
                  {r.after ?? ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-3">Could not check what it reads.{reads.error ? ' ' + reads.error : ''}</p>
        )}
      </div>
      {stop ? (
        <p role="alert" className="mt-3 rounded-sm border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">
          {stop}
        </p>
      ) : (
        <label className="mt-4 block">
          <span className="block text-[14px] font-semibold text-ink">Anything to add from the meeting?</span>
          <small className="mb-1.5 block text-[13px] text-ink-3">Optional. The transcript goes with it.</small>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none"
          />
        </label>
      )}
      <p role="status" aria-live="polite" data-testid="call-question-msg" className={`mt-2 min-h-[1.2em] text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
        {msg?.text ?? ''}
      </p>
    </Dialog>
  )
}
