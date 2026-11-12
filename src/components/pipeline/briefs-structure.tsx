'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Lock, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { saveLayout } from '@/app/(app)/briefs/actions'
import { toast } from '@/components/ui/toast'
import { ADDED, FIXED, type Kind, type Layout, SECS, SEC_TEXT, choiceLabel, lockOf, optLabel, optOf, standardLayout } from '@/lib/pipeline/briefs'
import { Tag, btn, ghost, primary, selectCls } from './bits'

// The Structure view (v111StHtml): how every brief of a kind is laid out, for the whole team. Each section in its order,
// shown or hidden, moved up or down, with how much of it to show; sections the team can add; the usual layout; and
// Save layout. The working copy is this view's own until it is saved or cancelled.

const OFF = 'Could not reach the dashboard. Try again in a minute.'
const NAMES: Record<Kind, string> = { org: 'organic brief', ads: 'ads brief' }

export function StructureView({ kind, saved, savedAny }: { kind: Kind; saved: Layout; savedAny: boolean }) {
  const [cur, setCur] = useState<Layout>(saved)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const addable = Object.keys(ADDED[kind]).filter((k) => !cur.order.includes(k))
  const [pick, setPick] = useState('')
  const toAdd = addable.includes(pick) ? pick : (addable[0] ?? '')
  const name = NAMES[kind]
  const title = (k: string) => SEC_TEXT[kind][k]?.[0] ?? k

  const change = (next: Layout, note = '') => {
    setCur(next)
    setDirty(true)
    setMsg(note)
  }
  const toggle = (k: string) => change({ ...cur, off: cur.off.includes(k) ? cur.off.filter((x) => x !== k) : [...cur.off, k] })
  // rec and five lead and review closes, so a move stays between them
  const movable = cur.order.filter((k) => !(k in FIXED))
  const move = (k: string, by: -1 | 1) => {
    const i = movable.indexOf(k)
    const j = i + by
    if (i < 0 || j < 0 || j >= movable.length) return
    const m = movable.slice()
    ;[m[i], m[j]] = [m[j], m[i]]
    change({ ...cur, order: ['rec', 'five', ...m, 'review'] })
  }
  const setOpt = (k: string, o: string, v: string) => change({ ...cur, opt: { ...cur.opt, [k]: { ...cur.opt[k], [o]: v } } })
  const add = () => {
    if (!toAdd) return
    change({ ...cur, order: [...cur.order.filter((k) => k !== 'review'), toAdd, 'review'] }, title(toAdd) + ' added. Save the layout to use it.')
    setPick('')
  }
  const drop = (k: string) => {
    const opt = { ...cur.opt }
    delete opt[k]
    change({ order: cur.order.filter((x) => x !== k), off: cur.off.filter((x) => x !== k), opt })
  }
  const save = async () => {
    setBusy(true)
    setMsg('')
    const r = await saveLayout({ kind, layout: cur }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(false)
    if (!r.ok) return setMsg(r.error)
    setDirty(false)
    setMsg('Saved for the team. Every ' + name + ' follows it.')
    toast(r.toast)
  }
  const status = msg || (dirty ? 'Not saved yet.' : savedAny ? 'Saved for the team.' : 'This is the standard layout.')
  const std = useMemo(() => standardLayout(kind), [kind])

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="structure">
      <p className="flex items-start gap-2 rounded-md border border-line bg-panel px-3 py-2.5 text-[14px] text-ink-2">
        <SlidersHorizontal size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" />
        <span>
          <b className="text-ink">How every {name} is laid out.</b> Pick the sections, their order and how much of each. It is saved for the whole team, and every{' '}
          {name} follows it, older ones too. Sections you add are counted from the {kind === 'org' ? 'posts' : 'ads'} behind each brief.
        </span>
      </p>

      <ol className="grid gap-2" aria-label="Sections">
        {cur.order.map((k, i) => {
          const off = cur.off.includes(k)
          const added = k in ADDED[kind]
          const lock = lockOf(kind, k)
          const opts = SECS[kind].find((x) => x.k === k)?.opt ?? []
          const at = movable.indexOf(k)
          return (
            <li
              key={k}
              data-testid="structure-row"
              data-k={k}
              className={`flex flex-wrap items-start gap-3 rounded-lg border border-line p-3.5 ${off ? 'bg-sunk' : 'bg-panel shadow-card'}`}
            >
              <span className="w-6 shrink-0 pt-0.5 text-[13px] font-semibold text-ink-3">{i + 1}</span>
              <div className={`min-w-0 grow basis-[260px] ${off ? 'opacity-60' : ''}`}>
                <b className="text-[15px] text-ink">{title(k)}</b> {added ? <Tag gold>Added</Tag> : null}
                <p className="mt-0.5 text-[13.5px] text-ink-2">{SEC_TEXT[kind][k]?.[1]}</p>
                {opts.length ? (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {opts.map(([o, choices]) => (
                      <label key={o} className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                        <span>{optLabel(k, o)}</span>
                        <select className={selectCls} value={optOf(cur, kind, k, o)} disabled={off} onChange={(e) => setOpt(k, o, e.target.value)}>
                          {choices.map((c) => (
                            <option key={c} value={c}>
                              {choiceLabel(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {lock ? (
                  <span title={lock.long} className="inline-flex items-center gap-1 rounded-full bg-sunk px-2.5 py-1 text-[12.5px] font-semibold text-ink-3">
                    <Lock size={13} aria-hidden="true" />
                    {lock.short}
                  </span>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!off}
                    aria-label={'Show ' + title(k)}
                    onClick={() => toggle(k)}
                    className="inline-flex h-[34px] items-center gap-2 rounded-full border border-line bg-panel px-2.5 text-[13px] font-semibold text-ink-2"
                  >
                    <span className={`relative h-[18px] w-[30px] rounded-full transition-colors ${off ? 'bg-line-2' : 'bg-action'}`} aria-hidden="true">
                      <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-panel transition-all ${off ? 'left-[2px]' : 'left-[14px]'}`} />
                    </span>
                    {off ? 'Hidden' : 'Shown'}
                  </button>
                )}
                {k in FIXED ? (
                  <span className="w-[72px] max-[760px]:hidden" title={FIXED[k]} />
                ) : (
                  <>
                    <button
                      type="button"
                      className={ghost + ' h-[34px] w-[34px] justify-center px-0 disabled:opacity-35'}
                      aria-label={'Move ' + title(k) + ' up'}
                      disabled={at <= 0}
                      onClick={() => move(k, -1)}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={ghost + ' h-[34px] w-[34px] justify-center px-0 disabled:opacity-35'}
                      aria-label={'Move ' + title(k) + ' down'}
                      disabled={at >= movable.length - 1}
                      onClick={() => move(k, 1)}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
                {added ? (
                  <button type="button" className={ghost + ' h-[34px] w-[34px] justify-center px-0'} aria-label={'Take ' + title(k) + ' out'} onClick={() => drop(k)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      <section className="rounded-lg border border-line bg-panel p-4 shadow-card" data-testid="structure-add">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-text">Add a section</p>
        <h3 className="mb-2 font-display text-[18px] font-semibold text-ink">More to show on every {name}</h3>
        {addable.length ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Section to add" className={selectCls + ' min-w-[220px] max-w-[420px] py-2'} value={toAdd} onChange={(e) => setPick(e.target.value)}>
                {addable.map((k) => (
                  <option key={k} value={k}>
                    {title(k)}
                  </option>
                ))}
              </select>
              <button type="button" className={btn} onClick={add}>
                <Plus size={14} aria-hidden="true" />
                Add
              </button>
            </div>
            <p className="mt-2 text-[13px] text-ink-3">{SEC_TEXT[kind][toAdd]?.[1]}</p>
          </>
        ) : (
          <p className="text-[14px] text-ink-3">Every section on the list is in.</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="min-w-0 grow text-[14px] text-ink-2" data-testid="structure-msg">
          {status}
        </p>
        <button type="button" className={ghost} onClick={() => change(std, 'The standard layout. Save it to use it.')}>
          Standard layout
        </button>
        {dirty ? (
          <button
            type="button"
            className={ghost}
            onClick={() => {
              setCur(saved)
              setDirty(false)
              setMsg('')
            }}
          >
            Cancel
          </button>
        ) : null}
        <button type="button" className={primary} disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save layout'}
        </button>
      </div>
    </div>
  )
}
