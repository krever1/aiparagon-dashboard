'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { type ReadsResult, goStage, stageReads } from '@/app/(app)/lead-pipeline/actions'
import { Dialog } from '@/components/ui/dialog'
import { LocalDay, LocalUsDay } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { planFor } from '@/lib/catalyst/plan'
import type { Stage, StageKey } from '@/lib/catalyst/stages'
import { type LeadView, viewStage } from '@/lib/catalyst/view'

/** A question to put to the team before anything runs: move this lead to a stage, run a stage's document, or both. */
export type Ask = { lead: LeadView; stage: StageKey; move: boolean }

const btn = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary =
  'inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

/** A lead with a run under way takes no question: the team waits for its document. */
export function stillWriting(lead: LeadView): boolean {
  if (!lead.run) return false
  toast(`Catalyst is still writing for ${lead.name}. It shows on the card when it is done.`, 'warn')
  return true
}

/**
 * The question before a run (v136Ask, with v137's Reads list): what the stage writes and works from, what the run would
 * read, the meeting notes, and Cancel / Just move it / Move and run it (or Run it, Run it again). Nothing is written
 * before an answer.
 */
export function StageQuestion({ ask, stages, onClose }: { ask: Ask; stages: Stage[]; onClose: () => void }) {
  const { lead } = ask
  const st = stages.find((s) => s.key === ask.stage)!
  const cur = viewStage(lead)
  const moving = ask.move && ask.stage !== cur
  const plan = planFor(lead, ask.stage)
  const done = plan.doneAt !== null
  const [reads, setReads] = useState<ReadsResult | null>(null)
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    stageReads(lead.id, ask.stage)
      .then((r) => {
        if (live) setReads(r)
      })
      .catch(() => {
        if (live) setReads({ ok: false, error: '' })
      })
    return () => {
      live = false
    }
  }, [lead.id, ask.stage])

  const found = reads && reads.ok ? reads.found : { calls: 0, emails: 0 }
  const both = found.calls && found.emails ? 'call transcripts and emails' : found.calls ? 'call transcripts' : found.emails ? 'emails' : ''
  const hint = both
    ? `Optional: the ${both} above go with it. Add anything else from the meeting.`
    : plan.need
      ? `Needed: this lead has no ${plan.need} yet, so paste what Catalyst should work from, like the meeting transcript or your notes.`
      : 'If you had the meeting, paste its transcript or your notes. Optional.'

  const go = async (run: boolean) => {
    setBusy(true)
    setMsg({ text: !run ? 'Moving…' : ask.stage === 'research' ? 'Starting…' : 'Reading the call transcripts and emails, then starting…' })
    let r: Awaited<ReturnType<typeof goStage>>
    try {
      r = await goStage({ leadId: lead.id, stage: ask.stage, move: moving, run, notes })
    } catch {
      r = { ok: false, error: 'Could not reach the dashboard. Try again in a minute.' }
    }
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
      kicker="Catalyst · Lead pipeline"
      title={moving ? `Move ${lead.name} to ${st.name}?` : `Run ${st.what} for ${lead.name}?`}
      width={640}
      footer={
        <>
          <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="question-msg">
            {msg?.text ?? ''}
          </span>
          <button type="button" onClick={onClose} className={btn}>
            Cancel
          </button>
          {moving ? (
            <button type="button" disabled={busy} onClick={() => go(false)} className={btn}>
              Just move it
            </button>
          ) : null}
          {!plan.blocked ? (
            <button type="button" disabled={busy} onClick={() => go(true)} className={primary}>
              <Check size={16} aria-hidden="true" />
              {moving ? 'Move and run it' : done ? 'Run it again' : 'Run it'}
            </button>
          ) : null}
        </>
      }
    >
      <ul aria-label="Meeting stages" className="mb-4 flex flex-wrap gap-1.5">
        {stages.map((s) => {
          const on = s.key === ask.stage
          const here = s.key === cur && !on
          return (
            <li
              key={s.key}
              data-s={s.key}
              aria-current={on ? 'step' : undefined}
              title={here ? 'Where the lead is now' : undefined}
              className={`rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${
                on ? 'bg-accent-soft text-accent-text' : here ? 'text-ink ring-2 ring-line-2' : 'bg-sunk text-ink-3'
              }`}
            >
              {s.name}
            </li>
          )
        })}
      </ul>
      <p className="text-[15px] leading-relaxed text-ink">
        {moving ? `In ${st.name}, Catalyst writes ` : 'Catalyst writes '}
        {st.what}. Only that runs, and nothing goes to the client.
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">It works from {st.from}.</p>

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

      {done ? (
        <p className="mt-3 text-[14px] text-ink-2">
          {st.doc} was written
          {plan.doneAt ? (
            <>
              {' on '}
              <LocalDay iso={new Date(plan.doneAt).toISOString()} />
            </>
          ) : null}
          . Running it again writes a new version; the earlier one stays in Files.
        </p>
      ) : null}
      {plan.blocked ? (
        <p role="alert" className="mt-3 rounded-sm border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">
          {plan.blocked}
        </p>
      ) : null}
      {plan.notes && !plan.blocked ? (
        <label className="mt-4 block">
          <span className="block text-[14px] font-semibold text-ink">Transcript or notes from the last meeting</span>
          <small className="mb-1.5 block text-[13px] text-ink-3">{hint}</small>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none"
          />
        </label>
      ) : null}
    </Dialog>
  )
}
