'use client'

import { useState, useSyncExternalStore } from 'react'
import { ArrowUpRight, Bookmark, Check, Sparkles, X } from 'lucide-react'
import { type Finding, AD_FMT_NAME, fromLine, leadLine, tagOf, waitNote } from '@/lib/pipeline/briefs-found'
import { clip } from '@/lib/touchpoint/approvals'
import { Tag, btn, ghost, linkCls, primary } from './bits'

// New draft's step 2, "What the briefs found" (v111InsBody and v111InsCard): the cards, six then all, each with Use,
// Not this and Save for later; what was dropped can come back; Write it from these. What is dropped is kept in this
// browser (localStorage `ap.v111.drop`, as the current dashboard keeps it), so it does not come up again.

const DROP_KEY = 'ap.v111.drop'
export type Drops = Record<string, number>
const NO_DROPS: Drops = {}
let mem: Drops = {}
let cache: { raw: string | null; val: Drops } = { raw: null, val: NO_DROPS }
const listeners = new Set<() => void>()

function read(): Drops {
  let raw: string | null
  try {
    raw = localStorage.getItem(DROP_KEY)
  } catch {
    return mem
  }
  if (raw === cache.raw) return cache.val
  let val: Drops = {}
  try {
    const p = JSON.parse(raw || '{}')
    if (p && typeof p === 'object' && !Array.isArray(p)) val = p
  } catch {
    // a broken entry is nothing dropped
  }
  cache = { raw, val }
  return val
}
function write(next: Drops) {
  mem = next
  try {
    localStorage.setItem(DROP_KEY, JSON.stringify(next))
  } catch {
    // kept for this page only
  }
  for (const l of listeners) l()
}
export function setDropped(ids: string[], on: boolean) {
  const d = { ...read() }
  for (const id of ids) {
    if (on) d[id] = 1
    else delete d[id]
  }
  write(d)
}
function subscribe(l: () => void) {
  listeners.add(l)
  window.addEventListener('storage', l)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', l)
  }
}
/** What was dropped in this browser; nothing while the server draws the page. */
export const useDrops = (): Drops => useSyncExternalStore(subscribe, read, () => NO_DROPS)

export function FoundBody({
  all,
  adcopy,
  cat,
  catName,
  nOrg,
  noun,
  use,
  drops,
  saved,
  error,
  day,
  onUse,
  onDrop,
  onUndrop,
  onSave,
  onWrite,
}: {
  /** the findings for the kind and category, dropped ones included */
  all: Finding[]
  adcopy: boolean
  cat: string
  catName: string
  nOrg: number
  noun: string
  use: Record<string, true>
  drops: Drops
  saved: Record<string, true>
  error: string | null
  day: (iso: string) => string
  onUse: (x: Finding) => void
  onDrop: (x: Finding) => void
  onUndrop: (ids: string[]) => void
  onSave: (x: Finding) => void
  onWrite: () => void
}) {
  const [more, setMore] = useState(false)
  const L = all.filter((x) => !drops[x.id])
  const dropped = all.filter((x) => drops[x.id]).map((x) => x.id)
  const on = L.filter((x) => use[x.id]).length
  let note = waitNote(all, day)
  if (adcopy && !L.some((x) => x.src === 'Ad'))
    note = 'No ' + (AD_FMT_NAME[cat] ?? 'ads of this kind') + ' in what the Ad Strategist read yet. The brief’s hooks and pains still apply.'
  const lead = <p className="text-[13.5px] text-ink-2">{leadLine(adcopy, nOrg, noun)}</p>
  const noteP = note ? <p className="mt-1 text-[13px] text-ink-3" data-testid="found-note">{note}</p> : null
  const err = error ? (
    <p className="mt-1 text-[13px] text-bad" role="alert">
      Could not read all the briefs: {error}
    </p>
  ) : null
  const back = dropped.length ? (
    <button type="button" className={linkCls + ' text-[13px]'} onClick={() => onUndrop(dropped)}>
      {L.length ? dropped.length + ' dropped · bring ' + (dropped.length === 1 ? 'it' : 'them') + ' back' : 'Bring back the ' + (dropped.length === 1 ? 'one' : dropped.length + ' ones') + ' you dropped'}
    </button>
  ) : null
  if (!L.length)
    return (
      <div data-testid="found">
        {lead}
        {noteP}
        {err}
        <div className="mt-3 rounded-md border border-dashed border-line-2 bg-bg px-4 py-4 text-center" data-testid="found-empty">
          <b className="block text-[14px] text-ink">{nOrg || adcopy ? 'Nothing for ' + (catName ? catName.toLowerCase() : 'this') + ' in the briefs yet' : 'No briefs yet'}</b>
          <span className="mt-1 block text-[13px] text-ink-3">
            {adcopy ? 'Run the Ad Strategist for fresh ads, or write from your own angle.' : 'Pick another category, or say what it should focus on.'}
          </span>
        </div>
        {back ? <div className="mt-2">{back}</div> : null}
      </div>
    )
  const shown = more ? L : L.slice(0, 6)
  return (
    <div data-testid="found">
      {lead}
      {noteP}
      {err}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2" role="list" aria-label="What the briefs found">
        {shown.map((x) => (
          <Card key={x.id} x={x} on={!!use[x.id]} saved={!!saved[x.id]} day={day} onUse={onUse} onDrop={onDrop} onSave={onSave} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {L.length > 6 ? (
          <button type="button" className={ghost} onClick={() => setMore((m) => !m)}>
            {more ? 'Show fewer' : 'Show all ' + L.length}
          </button>
        ) : null}
        {back}
        <span className="ml-auto text-[13px] text-ink-3" data-testid="found-count">
          {on ? on + (on === 1 ? ' pick' : ' picks') + ' in use' : 'Nothing picked yet'}
        </span>
        <button type="button" className={primary} disabled={!on} onClick={onWrite} data-testid="found-write">
          <Sparkles size={15} aria-hidden="true" />
          {on === 1 ? 'Write it from this' : 'Write it from these'}
        </button>
      </div>
    </div>
  )
}

function Card({
  x,
  on,
  saved,
  day,
  onUse,
  onDrop,
  onSave,
}: {
  x: Finding
  on: boolean
  saved: boolean
  day: (iso: string) => string
  onUse: (x: Finding) => void
  onDrop: (x: Finding) => void
  onSave: (x: Finding) => void
}) {
  // an ad opens on the Ad Strategist in a new tab, so the form stays as it is
  const go = x.adId ? '/ad-strategist?ad=' + encodeURIComponent(x.adId) : /^https?:\/\//i.test(x.url) ? x.url : ''
  return (
    <article role="listitem" className={`min-w-0 rounded-md border p-3 ${on ? 'border-accent bg-accent-soft/40' : 'border-line bg-panel'}`} data-testid="finding" aria-label={x.text}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Tag gold={x.src !== 'Ad'}>{tagOf(x)}</Tag>
        <span className="text-[12.5px] text-ink-3">{fromLine(x, day)}</span>
        {go ? (
          <a href={go} target="_blank" rel="noopener noreferrer" className={linkCls + ' ml-auto text-[12.5px]'}>
            {x.adId ? 'See the ad' : 'See the post'}
            <ArrowUpRight size={13} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
      <b className="mt-1.5 block text-[14px] font-semibold text-ink [overflow-wrap:anywhere]">{x.text}</b>
      {x.why ? (
        <p className="mt-1 text-[13px] text-ink-2 [overflow-wrap:anywhere]">
          {clip(x.why, 200)}
          {x.who && x.src !== 'Ad' ? <span className="text-ink-3"> · {x.who}</span> : null}
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={on} className={on ? primary : btn} onClick={() => onUse(x)}>
          <Check size={14} aria-hidden="true" />
          {on ? 'Using' : 'Use'}
        </button>
        <button type="button" className={ghost} onClick={() => onDrop(x)}>
          <X size={14} aria-hidden="true" />
          Not this
        </button>
        <button type="button" className={ghost} onClick={() => onSave(x)} disabled={saved}>
          <Bookmark size={14} aria-hidden="true" />
          {saved ? 'Saved for later' : 'Save for later'}
        </button>
      </div>
    </article>
  )
}
