'use client'

import { useEffect, useRef, useState } from 'react'
import { type Choices, deleteResult, pickChoices, saveResult } from '@/app/(app)/ad-testing/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { type Kind, type NumKey, type Result, PLATFORMS, boxesFor, clip, dayText, noDash, pickOf } from '@/lib/pipeline/ad-testing'
import { btn, inputCls, primary } from './bits'

// Log a result (v98ResOpen with v106's qualified leads and booked calls, and the clients won and revenue the Ad
// Testing page added): an organic post or an ad, the piece it was (a campaign and which of its ads, a draft or a
// library piece), its title, where and when, a link, the platform's numbers as they are, and what the team noticed.
// The same window edits a result; a synced one has no Edit.

const OFF = 'Could not reach the dashboard. Try again in a minute.'

/** Delete a result, asking first (v98ResDel). */
export async function removeResult(r: Result) {
  if (!window.confirm('Delete the result for “' + clip(r.title, 60) + '”? This cannot be undone.')) return
  const x = await deleteResult({ id: r.id }).catch(() => ({ ok: false as const, error: 'Could not delete: ' + OFF }))
  if (!x.ok) return toast(x.error, 'warn')
  toast('Result deleted.')
}

const label = 'grid gap-1 text-[13.5px] font-semibold text-ink'

export function LogDialog({ result: r, onClose, onSaved }: { result: Result | null; onClose: () => void; onSaved: () => void }) {
  const [choices, setChoices] = useState<Choices | null>(null)
  const [kind, setKind] = useState<Kind>(r?.kind ?? 'post')
  const [pick, setPick] = useState(r ? pickOf(r) : '')
  const [ids, setIds] = useState({ contentPieceId: r?.contentPieceId ?? '', sourceOutputId: r?.sourceOutputId ?? '', sourceRunId: r?.sourceRunId ?? '' })
  const [variant, setVariant] = useState(r?.variantFile ?? '')
  const [hook, setHook] = useState('')
  const [title, setTitle] = useState(r?.title ?? '')
  const [auto, setAuto] = useState(false)
  const [platform, setPlatform] = useState(r?.platform ?? '')
  const [postedOn, setPostedOn] = useState(r?.postedOn ?? '')
  const [url, setUrl] = useState(r?.url ?? '')
  const [notes, setNotes] = useState(r?.notes ?? '')
  const [nums, setNums] = useState<Partial<Record<NumKey, string>>>(() =>
    r ? Object.fromEntries(boxesFor(r.kind).map((b) => [b.k, r[b.k] === null ? '' : String(r[b.k])])) : {},
  )
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLSelectElement>(null)
  const firstNum = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    pickChoices()
      .catch(() => ({ ok: false as const, error: '' }))
      .then((x) => {
        if (live) setChoices(x.ok ? x.choices : { lib: [], drafts: [], camps: [] })
      })
    return () => {
      live = false
    }
  }, [])
  // the picker first for a new result, the numbers first for one being changed
  useEffect(() => {
    const t = setTimeout(() => (r ? firstNum.current : first.current)?.focus(), 60)
    return () => clearTimeout(t)
  }, [r])

  const camp = pick.startsWith('c:') ? choices?.camps.find((c) => c.runId === pick.slice(2)) : undefined
  const fill = (t: string) => {
    if (!title || auto) {
      setTitle(t)
      setAuto(true)
    }
  }
  const switchKind = (k: Kind) => {
    setKind(k)
    if (platform && !PLATFORMS[k].includes(platform)) setPlatform('')
  }
  const onPick = (v: string) => {
    setPick(v)
    setVariant('')
    setHook('')
    const next = { contentPieceId: '', sourceOutputId: '', sourceRunId: '' }
    if (v.startsWith('l:')) {
      const l = choices?.lib.find((x) => 'l:' + x.id === v)
      next.contentPieceId = l?.id ?? ''
      if (l) fill(noDash(l.title || ''))
    } else if (v.startsWith('d:')) {
      const d = choices?.drafts.find((x) => 'd:' + x.id === v)
      next.sourceOutputId = d?.id ?? ''
      if (d) fill(noDash(d.title || ''))
    } else if (v.startsWith('c:')) {
      next.sourceRunId = v.slice(2)
      if (kind !== 'ad') switchKind('ad')
    }
    setIds(next)
  }
  const onHook = (i: string) => {
    setHook(i)
    if (!camp || i === '') return
    const h = camp.hooks[Number(i)]
    if (h) {
      setTitle(h)
      setAuto(true)
    }
    setVariant(camp.files[Number(i)] || '')
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    const x = await saveResult({ id: r?.id, kind, title, platform, url, postedOn, notes, nums, ...ids, variantFile: variant }).catch(() => ({
      ok: false as const,
      error: 'Could not save: ' + OFF,
    }))
    setBusy(false)
    if (!x.ok) return setErr(x.error)
    onClose()
    toast(r ? 'Result updated.' : 'Result saved. The leaderboard and the next strategy read use it.')
    onSaved()
  }

  const known = !pick || (choices && [...choices.camps.map((c) => 'c:' + c.runId), ...choices.drafts.map((d) => 'd:' + d.id), ...choices.lib.map((l) => 'l:' + l.id)].includes(pick))
  const platforms = platform && !PLATFORMS[kind].includes(platform) ? [platform, ...PLATFORMS[kind]] : PLATFORMS[kind]

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Ad Testing · results"
      title={r ? 'Edit this result' : 'Log a result'}
      width={680}
      footer={
        <div className="grid w-full gap-2">
          <p role="alert" className="min-h-[1.2em] text-[13.5px] font-semibold text-bad" data-testid="log-err">
            {err}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={primary} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : r ? 'Save changes' : 'Save result'}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3.5" data-testid="log-form">
        <p className="text-[14px] text-ink-2">Use the numbers from the platform, as they are. Nothing is estimated or filled in for you.</p>
        <div role="radiogroup" aria-label="What was it?" className="flex w-fit gap-1 rounded-md border border-line bg-panel p-1">
          {(
            [
              ['post', 'Organic post'],
              ['ad', 'Ad'],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => switchKind(k)}
              className={`rounded-sm px-3 py-1.5 text-[14px] font-medium ${kind === k ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-sunk'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <label className={label}>
          Which piece was it?
          <select ref={first} className={inputCls} value={pick} onChange={(e) => onPick(e.target.value)} disabled={!choices}>
            <option value="">{choices ? 'Something else' : 'Loading…'}</option>
            {!known ? <option value={pick}>The piece it was logged for</option> : null}
            {choices?.camps.length ? (
              <optgroup label="Campaigns from Marketing Generation">
                {choices.camps.map((c) => (
                  <option key={c.runId} value={'c:' + c.runId}>
                    {'Campaign · ' + dayText(c.createdAt, true) + (c.offer ? ' · ' + c.offer : '')}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {choices?.drafts.length ? (
              <optgroup label="Drafts">
                {choices.drafts.map((d) => (
                  <option key={d.id} value={'d:' + d.id}>
                    {clip(noDash(d.title || 'Untitled draft'), 70) + ' · ' + dayText(d.createdAt)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {choices?.lib.length ? (
              <optgroup label="Library">
                {choices.lib.map((l) => (
                  <option key={l.id} value={'l:' + l.id}>
                    {clip(noDash(l.title || 'Untitled'), 70)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        {camp && camp.hooks.length ? (
          <label className={label}>
            Which ad from the campaign?
            <select className={inputCls} value={hook || String(camp.hooks.indexOf(title) >= 0 ? camp.hooks.indexOf(title) : '')} onChange={(e) => onHook(e.target.value)}>
              <option value="">Pick the ad</option>
              {camp.hooks.map((h, i) => (
                <option key={i} value={String(i)}>
                  {'Ad ' + (i + 1) + ' · ' + clip(h, 80)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={label}>
          <span>
            Title{' '}
            <i aria-hidden="true" className="not-italic text-bad">
              *
            </i>
          </span>
          <input
            className={inputCls}
            maxLength={200}
            required
            aria-required="true"
            placeholder="The hook, the headline or a short name"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setAuto(false)
            }}
          />
        </label>
        <div className="grid gap-3.5 min-[521px]:grid-cols-2">
          <label className={label}>
            Where
            <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">Pick one</option>
              {platforms.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Posted on
            <input type="date" className={inputCls} value={postedOn} onChange={(e) => setPostedOn(e.target.value)} />
          </label>
        </div>
        <label className={label}>
          <span>
            Link <small className="font-normal text-ink-3">optional</small>
          </span>
          <input className={inputCls} inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3 min-[521px]:grid-cols-3" data-testid="log-nums">
          {boxesFor(kind).map((b, i) => (
            <label key={b.k} className={label}>
              {b.label}
              <input
                ref={i === (kind === 'ad' ? 1 : 0) ? firstNum : undefined}
                className={inputCls}
                inputMode="decimal"
                placeholder={b.ph ?? ''}
                value={nums[b.k] ?? ''}
                onChange={(e) => setNums((x) => ({ ...x, [b.k]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <label className={label}>
          <span>
            What did you notice? <small className="font-normal text-ink-3">optional</small>
          </span>
          <textarea className={inputCls} rows={2} maxLength={600} placeholder="e.g. Most comments came from COOs" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
    </Dialog>
  )
}
