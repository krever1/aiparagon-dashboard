'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { savePlanDefault } from '@/app/(app)/content-transformation/actions'
import { toast } from '@/components/ui/toast'
import { NAME_MAX, NOTE_MAX, PLAN_MAX, type Step, addStep, isTplKey, moveStep, removeStep, setStep, stepSum } from '@/lib/pipeline/content-plan'
import { Tag, btn, ghost, inputCls, linkCls } from './bits'

// New draft's plan (v121Html and its step editor): the parts the draft is built in, in order, at the top of the side.
// A part opens to rename it and say what goes in it, to move or remove it; parts can be added (twelve at most). Reset
// goes back to the default, Save as our default makes the plan the team's, Use the usual steps sets the team's
// default aside.

export type PlanView = {
  key: string
  steps: Step[]
  /** the plan differs from the default (the team's, else the usual) */
  changed: boolean
  /** the default in force is the team's */
  team: boolean
  /** the saved template the parts come from, when one is picked */
  template: string | null
}

export function PlanPane({
  plan,
  gets,
  onSteps,
  onReset,
  onUsual,
}: {
  plan: PlanView
  /** what comes back (the kind's "You’ll get" list) */
  gets: readonly string[]
  onSteps: (steps: Step[]) => void
  onReset: () => void
  onUsual: () => void
}) {
  const [open, setOpen] = useState(-1)
  const [saving, setSaving] = useState(false)
  const [lastKey, setLastKey] = useState(plan.key)
  const nameRef = useRef<HTMLInputElement>(null)
  const [focusName, setFocusName] = useState(0)
  // another kind or structure: the open part closes
  if (lastKey !== plan.key) {
    setLastKey(plan.key)
    setOpen(-1)
  }
  useEffect(() => {
    if (!focusName) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [focusName])

  const S = plan.steps
  const save = async () => {
    if (saving) return
    setSaving(true)
    const r = await savePlanDefault({ key: plan.key, steps: S }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    setSaving(false)
    if (!r.ok) return toast('Could not save the plan: ' + r.error, 'warn')
    onReset()
    setOpen(-1)
    toast('Saved. The team starts from this plan from now on.')
  }
  return (
    <section aria-label="The plan" data-testid="plan">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">The plan</h3>
        {plan.changed ? <Tag gold>Changed</Tag> : null}
      </div>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {gets[0]}
        {S.length ? ', in these parts:' : ''}
        {plan.template ? <span className="text-ink-3"> From the {plan.template} template.</span> : null}
      </p>
      {S.length ? (
        <ol className="mt-2 grid gap-1.5" aria-label="The plan">
          {S.map((s, i) => {
            const on = open === i
            return (
              <li key={s.key + ':' + i} className={`rounded-md border ${on ? 'border-accent bg-bg' : 'border-line bg-panel'}`} data-testid="plan-step">
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? -1 : i)}
                  className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunk text-[12px] font-semibold text-ink-2">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold text-ink">{s.name.trim() || 'Untitled'}</b>
                    <small className="block text-[12.5px] text-ink-3">{stepSum(s)}</small>
                  </span>
                  {on ? <ChevronDown size={16} aria-hidden="true" className="mt-0.5 text-ink-3" /> : <ChevronRight size={16} aria-hidden="true" className="mt-0.5 text-ink-3" />}
                </button>
                {on ? (
                  <div className="grid gap-2.5 border-t border-line px-2.5 py-2.5">
                    <label className="block">
                      <span className="text-[12.5px] font-semibold text-ink">Name</span>
                      <input
                        ref={nameRef}
                        value={s.name}
                        maxLength={NAME_MAX}
                        onChange={(e) => onSteps(setStep(S, i, { name: e.target.value }))}
                        className={inputCls + ' mt-1 py-1.5 text-[13.5px]'}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[12.5px] font-semibold text-ink">
                        What goes in it <small className="font-normal text-ink-3">optional</small>
                      </span>
                      <textarea
                        rows={3}
                        value={s.note}
                        maxLength={NOTE_MAX}
                        placeholder="e.g. one example from the material"
                        onChange={(e) => onSteps(setStep(S, i, { note: e.target.value }))}
                        className={inputCls + ' mt-1 py-1.5 text-[13.5px]'}
                      />
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Move up"
                        className={ghost}
                        disabled={i === 0}
                        onClick={() => {
                          onSteps(moveStep(S, i, -1))
                          setOpen(i - 1)
                        }}
                      >
                        <ArrowUp size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        className={ghost}
                        disabled={i === S.length - 1}
                        onClick={() => {
                          onSteps(moveStep(S, i, 1))
                          setOpen(i + 1)
                        }}
                      >
                        <ArrowDown size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={ghost + ' ml-auto'}
                        onClick={() => {
                          onSteps(removeStep(S, i))
                          setOpen(-1)
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">No set parts. The writer picks a shape from your answers.</p>
      )}
      {S.length < PLAN_MAX ? (
        <button
          type="button"
          className={linkCls + ' mt-2'}
          onClick={() => {
            onSteps(addStep(S))
            setOpen(S.length)
            setFocusName((n) => n + 1)
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add a part
        </button>
      ) : null}
      {gets.length > 1 ? <p className="mt-2 text-[13px] text-ink-3">Also: {gets.slice(1).join(', ')}</p> : null}
      {plan.changed ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => {
              onReset()
              setOpen(-1)
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </button>
          {isTplKey(plan.key) ? null : (
            <button type="button" className={btn} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save as our default'}
            </button>
          )}
        </div>
      ) : plan.team ? (
        <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
          Your team’s default
          <button
            type="button"
            className={linkCls}
            onClick={() => {
              onUsual()
              setOpen(-1)
            }}
          >
            Use the usual steps
          </button>
        </p>
      ) : null}
    </section>
  )
}
