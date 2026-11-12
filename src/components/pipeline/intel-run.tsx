'use client'

import { useEffect, useRef, useState } from 'react'
import { startRun } from '@/app/(app)/intel-tracker/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { RUN_FIELDS, type RunRow, parseRunLine } from '@/lib/pipeline/intel'
import { btn, ghost, inputCls, primary } from './bits'

// Run now (apOpenIntelRun as v96 and v108 left it): the people or companies to read now, one card each or pasted as a
// list, read with everyone followed or alone, and an ad strategy after it if wanted.

export function RunDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<RunRow[]>([{}])
  const [paste, setPaste] = useState<string | null>(null)
  const [only, setOnly] = useState(true)
  const [cascade, setCascade] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const focusLast = () => setTimeout(() => {
    const ins = box.current?.querySelectorAll<HTMLInputElement>('input[data-k="name"]')
    ins?.[ins.length - 1]?.focus()
  }, 0)
  // the window opens before this runs, so the first name gets the keyboard
  useEffect(() => {
    box.current?.querySelector<HTMLInputElement>('input[data-k="name"]')?.focus()
  }, [])

  const set = (i: number, k: keyof RunRow, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const addRow = () => {
    if (rows.length >= 25) return toast('25 competitors per run at most', 'warn')
    setRows((r) => [...r, {}])
    focusLast()
  }
  const del = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [{}]))
  const applyPaste = () => {
    const got = (paste ?? '').split(/\n+/).map(parseRunLine).filter((x): x is RunRow => !!x)
    if (!got.length) return toast('Nothing to add yet', 'warn')
    setRows((r) => [...r.filter((x) => Object.values(x).some((v) => String(v ?? '').trim())), ...got].slice(0, 25))
    setPaste(null)
    toast(got.length + ' competitor' + (got.length === 1 ? '' : 's') + ' added to the form')
  }
  const go = async () => {
    setErr('')
    setBusy(true)
    const r = await startRun({ rows, only, cascade }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.toast)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Intel Tracker"
      title="Run now with new names"
      width={760}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={go}>
            {busy ? 'Starting…' : 'Start the run'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] leading-relaxed text-ink-2">
        Add the people or companies you want read now. They join your follow list and the Intel Tracker runs straight away, reading their LinkedIn, X and
        Facebook posts plus recent news about them. The result is marked as a custom run so you can tell it apart from the scheduled runs.
      </p>
      <div ref={box} className="grid gap-3">
        {rows.map((r, i) => (
          <fieldset key={i} className="relative rounded-md border border-line p-3" data-testid="run-row">
            <legend className="px-1 text-[13px] font-semibold text-ink-2">Competitor {i + 1}</legend>
            {rows.length > 1 ? (
              <button type="button" aria-label={'Remove competitor ' + (i + 1)} onClick={() => del(i)} className={ghost + ' absolute right-2 top-1'}>
                Remove
              </button>
            ) : null}
            <div className="grid grid-cols-1 gap-2 min-[641px]:grid-cols-2">
              {RUN_FIELDS.map(([k, label, ph, req]) => (
                <label key={k} className={k === 'notes' ? 'min-[641px]:col-span-2' : ''}>
                  <span className="mb-0.5 block text-[12.5px] font-semibold text-ink-2">
                    {label}
                    {req ? (
                      <i aria-hidden="true" className="not-italic text-bad">
                        {' '}*
                      </i>
                    ) : null}
                  </span>
                  <input
                    data-k={k}
                    aria-required={req || undefined}
                    className={inputCls + ' py-1.5 text-[13.5px]'}
                    placeholder={ph}
                    value={r[k] ?? ''}
                    onChange={(e) => set(i, k, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={addRow}>
          + Add another name
        </button>
        <button type="button" className={btn} onClick={() => setPaste(paste === null ? '' : null)} aria-expanded={paste !== null}>
          Paste a list
        </button>
      </div>
      {paste !== null ? (
        <div className="mt-3 rounded-md border border-line p-3">
          <label htmlFor="run-paste" className="mb-1 block text-[13px] font-semibold text-ink-2">
            One competitor per line: name, website, LinkedIn, X, Facebook
          </label>
          <textarea
            id="run-paste"
            rows={5}
            className={inputCls + ' text-[13.5px]'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Acme Advisory, acme.com, linkedin.com/company/acme, @acme, facebook.com/acme\nNorthwind AI, northwind.ai, linkedin.com/company/northwind-ai'}
          />
          <button type="button" className={primary + ' mt-2'} onClick={applyPaste}>
            Add these
          </button>
        </div>
      ) : null}
      <div className="mt-4 grid gap-2">
        <label className="flex items-start gap-2.5 text-[14px]">
          <input type="checkbox" className="mt-1" checked={only} onChange={(e) => setOnly(e.target.checked)} />
          <span>
            <b className="block text-ink">Only these names this run</b>
            <small className="text-[13px] text-ink-3">Untick to read everyone you follow too. Faster and cheaper when ticked.</small>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-[14px]">
          <input type="checkbox" className="mt-1" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
          <span>
            <b className="block text-ink">Then build an ad strategy from it</b>
            <small className="text-[13px] text-ink-3">
              Sends the high-value findings and your newest uploaded ads to the Ad Strategist when the run finishes. Content Generation still starts from Uploads
              &amp; runs.
            </small>
          </span>
        </label>
      </div>
      {err ? (
        <p role="alert" className="mt-3 text-[13.5px] font-semibold text-bad">
          {err}
        </p>
      ) : null}
    </Dialog>
  )
}
