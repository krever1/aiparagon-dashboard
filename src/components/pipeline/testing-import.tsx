'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { importChunk, importExisting } from '@/app/(app)/ad-testing/import-actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { clip, dayText, int, money } from '@/lib/pipeline/ad-testing'
import {
  CHUNK, type Existing, type ImportRow, type Kind, MAX_BYTES, MAX_ROWS, MAX_STAGES, type Mode, STAGES, type Stage, fieldsFor, importRows, plural, readFile, remap, stageGuess,
  stageValues,
} from '@/lib/pipeline/ad-testing-import'
import { btn, primary } from './bits'

// Import a CSV (v106ImpOpen in the current dashboard): a file of ads or posts with their numbers, or a CRM export with
// one row per lead counted by ad. The file is read here in the browser; which column holds what is guessed and can be
// changed; the first rows show what will be written, and which update a result already logged. Then the rows go to
// the server a hundred at a time.

const label = 'grid min-w-0 gap-1 text-[13px] font-semibold text-ink-2'
const sel = 'w-full min-w-0 rounded-sm border border-line bg-panel px-2.5 py-1.5 text-[13.5px] text-ink focus:border-accent focus:outline-none'
const head4 = 'mb-1.5 block text-[13.5px] font-semibold text-ink'

function Seg<K extends string>({ name, value, opts, onPick }: { name: string; value: K; opts: readonly (readonly [K, string])[]; onPick: (k: K) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex w-fit flex-wrap gap-1 rounded-md border border-line bg-panel p-1">
      {opts.map(([k, t]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onPick(k)}
          className={`rounded-sm px-3 py-1.5 text-[14px] font-medium ${value === k ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-sunk'}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

type FileState = { name: string; head: string[]; rows: string[][]; cut: boolean; delim: string }
const NONE: FileState = { name: '', head: [], rows: [], cut: false, delim: ',' }

export function ImportDialog({ now, onClose, onTemplate }: { now: number; onClose: () => void; onTemplate: () => void }) {
  const router = useRouter()
  const today = new Date(now).toISOString().slice(0, 10)
  const [mode, setMode] = useState<Mode>('rows')
  const [kind, setKind] = useState<Kind>('ad')
  const [file, setFile] = useState<FileState>(NONE)
  const [map, setMap] = useState<Record<string, number>>({})
  const [stages, setStages] = useState<Record<string, Stage>>({})
  const [fileErr, setFileErr] = useState('')
  const [ex, setEx] = useState<Existing[] | null>(null)
  const [busy, setBusy] = useState('')
  const [fail, setFail] = useState('')

  // every result already logged, to match against
  useEffect(() => {
    let live = true
    importExisting()
      .catch(() => ({ ok: false as const, error: '' }))
      .then((x) => {
        if (live) setEx(x.ok ? x.ex : [])
      })
    return () => {
      live = false
    }
  }, [])

  const state = { mode, kind, rows: file.rows, map, stages, delim: file.delim }
  // worked out again only when the file, a column, a stage or the results logged change
  const rows: ImportRow[] = useMemo(
    () => (file.head.length ? importRows({ mode, kind, rows: file.rows, map, stages, delim: file.delim }, ex ?? [], today) : []),
    [file, mode, kind, map, stages, ex, today],
  )
  const stageVals = mode === 'leads' && map.stage !== undefined ? stageValues(state) : []
  const shown = stageVals.slice(0, MAX_STAGES)

  const pickFile = async (f: File | undefined) => {
    if (!f) return
    setFileErr('')
    setFail('')
    setFile(NONE)
    if (f.size > MAX_BYTES) return setFileErr('That file is over 3 MB. Export a shorter date range and try again.')
    let text = ''
    try {
      text = await f.text()
    } catch {
      return setFileErr('Could not read that file.')
    }
    const r = readFile(text)
    if (!r.ok) return setFileErr(r.error)
    setFile({ name: f.name, head: r.head, rows: r.rows, cut: r.cut, delim: r.delim })
    setMode(r.mode)
    setMap(r.map)
    setStages(r.stages)
  }
  const pickMode = (m: Mode) => {
    setMode(m)
    if (file.head.length) {
      const g = remap({ mode: m, rows: file.rows, head: file.head })
      setMap(g.map)
      setStages(g.stages)
    }
  }
  const setCol = (f: string, v: string) => {
    const next = { ...map }
    if (v === '') delete next[f]
    else next[f] = Number(v)
    setMap(next)
    if (f === 'stage') {
      const st: Record<string, Stage> = {}
      for (const x of stageValues({ ...state, map: next })) st[x] = stageGuess(x)
      setStages(st)
    }
  }

  const go = async () => {
    if (busy) return
    setFail('')
    setBusy('Checking…')
    const fresh = await importExisting().catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    if (!fresh.ok) {
      setBusy('')
      return setFail('Could not check the results already logged, so nothing was imported: ' + fresh.error)
    }
    setEx(fresh.ex)
    const all = importRows(state, fresh.ex, today)
    if (!all.length) return setBusy('')
    setBusy('Importing…')
    let done = 0
    let added = 0
    let updated = 0
    for (let i = 0; i < all.length; i += CHUNK) {
      const part = all.slice(i, i + CHUNK)
      const x = await importChunk({ mode, rows: part }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.', done: 0 }))
      if (!x.ok) {
        done += x.done
        setBusy('')
        setFail('Stopped after ' + plural(done, 'result') + ': ' + x.error)
        // what went in is matched next time, so Try again updates it instead of adding it twice
        importExisting()
          .then((y) => y.ok && setEx(y.ex))
          .catch(() => {})
        router.refresh()
        return
      }
      done += part.length
      added += x.added
      updated += x.updated
    }
    setBusy('')
    onClose()
    toast('Imported ' + plural(added, 'new result') + (updated ? ' and updated ' + updated : '') + '. The leaderboard and the next strategy read use them.')
    router.refresh()
  }

  const n = rows.length
  const ready = n > 0 && ex !== null && !busy
  const upd = rows.filter((r) => r.match).length
  const lead = mode === 'leads'
  const ad = rows.some((r) => r.kind === 'ad')
  const cols = lead ? ['Ad or campaign', 'Leads', 'Qualified', 'Booked calls'] : ad ? ['Ad', 'Date', 'Spend', 'Clicks', 'Leads', 'Qualified', 'Booked calls'] : ['Post', 'Date', 'Impressions', 'Reactions', 'Comments', 'Clicks']
  const name = (r: ImportRow) => r.title + (r.match ? (r.matchDay ? ' · logged ' + dayText(r.matchDay, true) : ' · logged') : '')
  const cells = (r: ImportRow): string[] =>
    lead
      ? [name(r), String(r.leads ?? 0), String(r.qualified ?? 0), String(r.bookings ?? 0)]
      : r.kind === 'ad'
        ? [name(r), r.posted_on ? dayText(r.posted_on, true) : '–', money(r.spend), int(r.clicks), int(r.leads), int(r.qualified), int(r.bookings)]
        : [name(r), r.posted_on ? dayText(r.posted_on, true) : '–', int(r.impressions), int(r.reactions), int(r.comments), int(r.clicks)]

  return (
    <Dialog
      open
      // the window stays while it writes, so an import is never left half seen
      onClose={() => {
        if (!busy) onClose()
      }}
      kicker="Ad Testing · results"
      title="Import results"
      width={760}
      footer={
        <div className="grid w-full gap-2">
          <p role="alert" className="min-h-[1.2em] text-[13.5px] font-semibold text-bad" data-testid="import-err">
            {fail}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} onClick={onClose} disabled={!!busy}>
              Cancel
            </button>
            <button type="button" className={primary} disabled={!ready} onClick={() => void go()}>
              {busy || (fail ? 'Try again' : n ? 'Import ' + plural(n, 'result') : 'Import')}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4" data-testid="import-form">
        <div>
          <span className={head4}>What is in the file?</span>
          <Seg
            name="What is in the file?"
            value={mode}
            opts={[
              ['rows', 'One row per ad or post'],
              ['leads', 'One row per lead, from a CRM'],
            ]}
            onPick={pickMode}
          />
          <p className="mt-1.5 text-[13px] text-ink-3">
            {lead
              ? 'An export of contacts or deals. It counts leads, qualified leads and booked calls for each ad, and adds them to that ad’s results.'
              : 'An export from Meta, LinkedIn or a spreadsheet. Download the template for the column names.'}
          </p>
        </div>
        {!lead ? (
          <div>
            <span className={head4}>These are</span>
            <Seg
              name="These are"
              value={kind}
              opts={[
                ['ad', 'Ads'],
                ['post', 'Organic posts'],
              ]}
              onPick={setKind}
            />
          </div>
        ) : null}
        <label className="grid cursor-pointer justify-items-center gap-1 rounded-md border-2 border-dashed border-line-2 bg-sunk px-4 py-5 text-center hover:border-accent">
          <input
            type="file"
            accept=".csv,text/csv,.tsv,text/tab-separated-values"
            className="sr-only"
            aria-label={file.name ? 'Choose another file' : 'Choose a CSV file'}
            onChange={(e) => {
              void pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <b className="text-[14.5px] text-ink" data-testid="import-file">
            {file.name ? file.name + ' · ' + plural(file.rows.length, 'row') : 'Choose a CSV file'}
          </b>
          <small className="text-[13px] text-ink-3">{file.name ? 'Choose another file' : 'Exports from Meta, LinkedIn, Google Sheets, Excel or HubSpot'}</small>
        </label>
        {file.cut ? <p className="text-[13px] text-ink-3">Only the first {MAX_ROWS.toLocaleString('en-US')} rows are read. Export a shorter date range for the rest.</p> : null}
        {fileErr ? (
          <p role="alert" className="text-[13.5px] font-semibold text-bad">
            {fileErr}
          </p>
        ) : null}
        <p>
          <button type="button" className="text-[13.5px] font-semibold text-accent-text hover:underline" onClick={onTemplate}>
            Download the template
          </button>
        </p>

        {file.head.length ? (
          <>
            <div>
              <span className={head4}>Which column holds what</span>
              <div className="grid grid-cols-1 gap-2.5 min-[521px]:grid-cols-2 min-[761px]:grid-cols-3" data-testid="import-map">
                {fieldsFor(mode, kind).map(([f, l]) => (
                  <label key={f} className={label}>
                    <span>
                      {l}
                      {f === 'title' ? (
                        <i aria-hidden="true" className="ml-0.5 not-italic text-bad">
                          *
                        </i>
                      ) : null}
                    </span>
                    <select className={sel} value={map[f] === undefined ? '' : String(map[f])} onChange={(e) => setCol(f, e.target.value)}>
                      <option value="">Not in this file</option>
                      {file.head.map((c, k) => (
                        <option key={k} value={String(k)}>
                          {c || 'Column ' + (k + 1)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            {lead && map.stage !== undefined ? (
              <div>
                <span className={head4}>
                  What each stage means <small className="font-normal text-ink-3">a booked call also counts as qualified</small>
                </span>
                <div className="grid grid-cols-1 gap-2.5 min-[521px]:grid-cols-2 min-[761px]:grid-cols-3" data-testid="import-stages">
                  {shown.map((v) => (
                    <label key={v} className={label}>
                      <span title={v} className="truncate">
                        {v || '(empty)'}
                      </span>
                      <select className={sel} value={stages[v] ?? 'lead'} onChange={(e) => setStages({ ...stages, [v]: e.target.value as Stage })}>
                        {STAGES.map(([k, t]) => (
                          <option key={k} value={k}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {stageVals.length > shown.length ? (
                  <small className="mt-1.5 block text-[13px] text-ink-3">{plural(stageVals.length - shown.length, 'more stage')} keep the meaning guessed from the name.</small>
                ) : null}
              </div>
            ) : null}
            {map.title === undefined ? (
              <p role="alert" className="text-[13.5px] font-semibold text-bad">
                Pick the column with the name of the ad or post.
              </p>
            ) : !n ? (
              <p role="alert" className="text-[13.5px] font-semibold text-bad">
                No rows with numbers to import. Check which column holds what.
              </p>
            ) : ex === null ? (
              <p className="text-[13px] text-ink-3">Checking the results already logged…</p>
            ) : (
              <div>
                <span className={head4}>
                  Check before you import{' '}
                  <small className="font-normal text-ink-3" data-testid="import-count">
                    {plural(n, 'result') + (upd ? ' · ' + upd + ' update results already logged' : '')}
                  </small>
                </span>
                <div className="relative overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[520px] border-collapse text-[13.5px]" aria-label="Check before you import">
                    <thead>
                      <tr className="border-b border-line bg-sunk text-left">
                        {cols.map((c, i) => (
                          <th key={c} scope="col" className={`px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3 ${i ? 'text-right' : ''}`}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 6).map((r, k) => (
                        <tr key={k} className="border-b border-line last:border-0" data-testid="import-row">
                          {cells(r).map((c, i) => (
                            <td key={i} className={i ? 'px-3 py-2 text-right tabular-nums text-ink-2' : 'px-3 py-2 text-ink'}>
                              {i ? c : clip(c, 80)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {n > 6 ? <small className="mt-1.5 block text-[13px] text-ink-3">and {plural(n - 6, 'more row')}</small> : null}
              </div>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  )
}
