'use client'

import { useState } from 'react'
import { importConnections } from '@/app/(app)/intel-tracker/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import type { Competitor } from '@/lib/pipeline/intel'
import { type Connection, IMPORT_MAX, connectionsFrom, liKey } from '@/lib/pipeline/intel-replies'
import { btn, inputCls, primary } from './bits'

type Row = Connection & { i: number; had: boolean; pick: boolean; rep: boolean }

/**
 * Import LinkedIn connections (v145ImpOpen, v146): LinkedIn's Connections.csv is read in this browser, the people are
 * listed with search (those followed already marked, under a link saved in any shape), and the ones picked, 50 at a
 * time, are followed as people for their posts, each with Draft replies on or off. Only the people picked are saved.
 */
export function ImportConnections({ followed, onClose }: { followed: Competitor[]; onClose: () => void }) {
  const [list, setList] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const n = list.filter((c) => c.pick).length

  const read = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 8 * 1024 * 1024) return setMsg({ text: 'That file is too big for a connections list.', bad: true })
    const L = connectionsFrom(await f.text())
    if (!L) return setMsg({ text: 'That is not LinkedIn’s Connections.csv: it has no First Name and URL columns.', bad: true })
    if (!L.length) return setMsg({ text: 'No connections with a LinkedIn link in that file.', bad: true })
    const have = new Set<string>()
    for (const c of followed) {
      const k = liKey(c.handleLinkedin)
      if (k) have.add(k)
      have.add('n:' + c.name.toLowerCase())
    }
    const rows = L.map((c, i) => ({ ...c, i, had: have.has(liKey(c.url)) || have.has('n:' + c.name.toLowerCase()), pick: false, rep: true }))
    setList(rows)
    setMsg({ text: L.length + ' connection' + (L.length === 1 ? '' : 's') + ' read.' + (rows.some((c) => c.had) ? ' Those you follow already are marked.' : '') })
  }
  const pick = (i: number, on: boolean) => {
    if (on && n >= IMPORT_MAX) return setMsg({ text: 'Keep it to 50 at a time: each one adds about 12 seconds to every run.', bad: true })
    setList(list.map((c) => (c.i === i ? { ...c, pick: on } : c)))
  }
  const go = async () => {
    const P = list.filter((c) => c.pick && !c.had)
    if (!P.length) return
    setBusy(true)
    setMsg({ text: 'Saving…' })
    const r = await importConnections(P.map((c) => ({ name: c.name, url: c.url, company: c.company, position: c.position, replies: c.rep }))).catch(() => ({
      ok: false as const,
      error: 'Could not save: the dashboard could not be reached',
    }))
    if (!r.ok) {
      setBusy(false)
      return setMsg({ text: r.error, bad: true })
    }
    onClose()
    toast(r.toast)
  }
  const t = q.trim().toLowerCase()
  const shown = list.filter((c) => !t || (c.name + ' ' + c.company + ' ' + c.position).toLowerCase().includes(t))

  const steps: [string, string][] = [
    ['Download your connections from LinkedIn', 'LinkedIn › Settings › Data privacy › Get a copy of your data › Connections. LinkedIn emails a link, usually within minutes.'],
    ['Drop the Connections.csv here', 'It is read in this browser. Only the people you pick are saved.'],
    [
      'Pick whose posts to read, and whose get replies',
      'Each person is one more account a run reads, about 12 seconds each, so a few dozen is fine; hundreds make every run long.',
    ],
  ]
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Intel Tracker · Following"
      title="Import LinkedIn connections"
      width={680}
      footer={
        <>
          <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="import-msg">
            {msg?.text ?? ''}
          </span>
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={!n || busy} onClick={go}>
            {n ? 'Follow ' + n + (n === 1 ? ' person' : ' people') : 'Follow the people picked'}
          </button>
        </>
      }
    >
      <ol className="mb-3 space-y-2">
        {steps.map(([b, s], i) => (
          <li key={b} className="flex gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunk text-[12.5px] font-semibold text-ink-2">{i + 1}</span>
            <div className="min-w-0">
              <b className="block text-[14px] text-ink">{b}</b>
              <small className="block text-[12.5px] text-ink-3">{s}</small>
            </div>
          </li>
        ))}
      </ol>
      <label className="mb-3 block">
        <span className="block text-[13.5px] font-semibold text-ink">Connections.csv</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0])} className="mt-1 max-w-full text-[13.5px] text-ink-2" />
      </label>
      {list.length ? (
        <>
          <div className="mb-2 flex items-center gap-2.5">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company or title"
              aria-label="Search connections"
              className={inputCls + ' min-w-0 flex-1 py-1.5'}
            />
            <b className="whitespace-nowrap text-[13.5px] text-ink">{n} picked</b>
          </div>
          <div className="max-h-[340px] overflow-auto rounded-md border border-line" data-testid="connections">
            {shown.slice(0, 300).map((c) => (
              <div key={c.i} data-testid="connection" className={`flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-2.5 py-1.5 text-[13px] ${c.had ? 'opacity-55' : ''}`}>
                <label className="flex min-w-0 flex-wrap items-baseline gap-2">
                  <input type="checkbox" checked={c.pick} disabled={c.had} onChange={(e) => pick(c.i, e.target.checked)} /> <b className="[overflow-wrap:anywhere]">{c.name}</b>
                  <small className="text-[12px] text-ink-3 [overflow-wrap:anywhere]">
                    {[c.position, c.company].filter(Boolean).join(' · ')}
                    {c.had ? ' · followed already' : ''}
                  </small>
                </label>
                {c.had ? null : (
                  <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px]">
                    <input type="checkbox" checked={c.rep} onChange={(e) => setList(list.map((x) => (x.i === c.i ? { ...x, rep: e.target.checked } : x)))} /> Draft
                    replies
                  </label>
                )}
              </div>
            ))}
            {shown.length > 300 ? <p className="px-2.5 py-2 text-[12.5px] text-ink-3">Showing 300 of {shown.length}. Search to find others.</p> : null}
          </div>
        </>
      ) : null}
    </Dialog>
  )
}
