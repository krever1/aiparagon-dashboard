'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { callAccess, callTranscript, moreCalls, postCallSince, writePostCall } from '@/app/(app)/calls/actions'
import { Banner, StripTile, Tabs } from '@/components/catalyst/bits'
import { NewRunDialog, type NewRunPrefill } from '@/components/catalyst/new-run'
import { LocalCallWhen, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import type { CallsData } from '@/lib/catalyst/calls-load'
import {
  type CallRow, type CallTab, type FtCall, callRow, catButtons, emptyLine, filterRows, folderChoices, ftGuests, guestsOf, hoursText, leadOf, minutesOf,
  tagChoices, typeGuessed, typeShort,
} from '@/lib/catalyst/calls'
import { EditDetails } from './call-dialogs'
import { CallDetail, SEGS, type Seg, type Transcript } from './call-detail'
import { FathomKeyDialog, FathomSetup } from './fathom-key'
import type { WriteRequest } from './post-call'

// Calls (apRenderCalls and the rounds after it): the team's Fathom recordings, read live through n8n. The tab, the type
// button, the open call and its section are the address's (?tab= ?type= ?call= ?seg=), so a link opens the same view.

const POLL_MS = 60_000
const WRITE_POLL_MS = 5_000
const WRITE_GIVE_UP_MS = 4 * 60_000
const select = 'h-9 max-w-full rounded-sm border border-line bg-panel px-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none'

function stampText(checked: number, now: number): string {
  const t = Math.round((now - checked) / 1000)
  return (t < 45 ? 'Checked Fathom just now' : 'Checked Fathom ' + Math.max(1, Math.round(t / 60)) + ' min ago') + ' · new calls show up within a minute'
}

export function CallsView({ data }: { data: CallsData }) {
  const router = useRouter()
  const sp = useSearchParams()
  const hydrated = useHydrated()
  const tab: CallTab = sp.get('tab') === 'ext' ? 'ext' : sp.get('tab') === 'int' ? 'int' : 'all'
  const cat = sp.get('type') ?? ''
  const callParam = sp.get('call') ?? ''
  const segParam = sp.get('seg') as Seg | null
  const seg: Seg = segParam && SEGS.includes(segParam) ? segParam : 'summary'

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const u = new URL(window.location.href)
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.searchParams.set(k, v)
      else u.searchParams.delete(k)
    }
    window.history.replaceState(null, '', u.pathname + u.search)
  }, [])

  const [older, setOlder] = useState<FtCall[]>([])
  const [cursor, setCursor] = useState<string | null | undefined>(undefined)
  const [moreBusy, setMoreBusy] = useState(false)
  const [q, setQ] = useState('')
  const [folder, setFolder] = useState('')
  const [tag, setTag] = useState('')
  const [access, setAccess] = useState<Record<string, string>>({})
  const [tx, setTx] = useState<Record<string, Transcript>>({})
  const [writing, setWriting] = useState<Record<string, { since: string; title: string }>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const [run, setRun] = useState<NewRunPrefill | null>(null)
  const [checked, setChecked] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const asked = useRef(new Set<string>())
  const txRef = useRef(tx)
  const checkedRef = useRef(checked)
  useEffect(() => {
    txRef.current = tx
  }, [tx])
  useEffect(() => {
    checkedRef.current = checked
  }, [checked])

  // ---------- the calls ----------
  const calls = useMemo(() => {
    const seen = new Set<string>()
    const out: FtCall[] = []
    for (const c of [...data.calls, ...older]) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
    }
    return out.sort((a, b) => b.start.localeCompare(a.start))
  }, [data.calls, older])
  const next = cursor === undefined ? data.next : cursor

  const rows = useMemo(
    () =>
      calls.map((c) => {
        const m = data.meta[c.id] ?? null
        const lead = leadOf(c, m, data.leads)
        return callRow(c, m, data.outputs[c.id] ?? null, lead?.company ?? '')
      }),
    [calls, data.meta, data.outputs, data.leads],
  )
  const filters = { q, folder, tag, cat }
  const shown = filterRows(rows, tab, filters)
  const selected = shown.find((r) => r.call.id === callParam) ?? shown[0] ?? null
  const metas = useMemo(() => Object.values(data.meta), [data.meta])
  const folders = folderChoices(rows, metas)
  const tags = tagChoices(metas)

  // ---------- new calls within a minute ----------
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(data.calls.map((c) => c.id))
    if (known.current) {
      const fresh = data.calls.filter((c) => !known.current!.has(c.id))
      if (fresh.length === 1) toast('New call from Fathom: ' + (data.meta[fresh[0].id]?.title || fresh[0].title))
      else if (fresh.length > 1) toast(fresh.length + ' new calls from Fathom')
      for (const id of ids) known.current.add(id)
    } else known.current = ids
  }, [data.calls, data.meta])

  useEffect(() => {
    if (!data.connected) return
    const check = () => {
      setChecked(Date.now())
      router.refresh()
    }
    const t = window.setInterval(check, POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    const vis = () => {
      if (document.visibilityState === 'visible' && Date.now() - checkedRef.current > 55_000) check()
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.clearInterval(t)
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [data.connected, router])

  // ---------- post-call actions being written ----------
  const writingRef = useRef(writing)
  useEffect(() => {
    writingRef.current = writing
  }, [writing])
  const hasWriting = Object.keys(writing).length > 0
  useEffect(() => {
    if (!hasWriting) return
    const t = window.setInterval(async () => {
      for (const [id, w] of Object.entries(writingRef.current)) {
        const r = await postCallSince(id, w.since).catch(() => null)
        const done = (msg: string, warn = false) => {
          setWriting((x) => {
            const y = { ...x }
            delete y[id]
            return y
          })
          toast(msg, warn ? 'warn' : 'ok')
        }
        if (r?.ok && r.output) {
          if (r.output.status === 'done') done(`Post-call actions are ready for “${w.title}”.`)
          else done('The post-call actions did not come out this time. Try again.', true)
        } else if (Date.now() - Date.parse(w.since) > WRITE_GIVE_UP_MS + 10_000) {
          done('Nothing back after four minutes. Check “Meetings · Post-call Actions” in n8n.', true)
        }
      }
    }, WRITE_POLL_MS)
    return () => window.clearInterval(t)
  }, [hasWriting])

  const write = (row: CallRow) => async (r: WriteRequest) => {
    const c = row.call
    const res = await writePostCall({
      call: {
        id: c.id,
        title: row.title,
        start: c.start,
        invitees: guestsOf(c, row.meta),
        summary: c.summary,
        actions: c.actions.map((a) => ({ text: a.text })),
      },
      type: r.type,
      savedType: row.meta?.meeting_type ?? '',
      notes: r.notes || row.meta?.description || '',
    }).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    if (!res.ok) {
      toast(res.error, 'warn')
      return false
    }
    setWriting((x) => ({ ...x, [c.id]: { since: res.since, title: row.title } }))
    return true
  }

  // ---------- a call's transcript, read once ----------
  const loadTranscript = useCallback(async (id: string): Promise<Transcript> => {
    const have = txRef.current[id]
    if (have) return have
    const r = await callTranscript(id).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    const t: Transcript = r.ok ? { lines: r.lines } : { error: r.error }
    setTx((x) => ({ ...x, [id]: t }))
    return t
  }, [])

  // ---------- whether Fathom plays a call here, 25 share links at a time ----------
  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  const checkAccess = useCallback((token: string) => {
    if (asked.current.has(token)) return
    const batch = [token]
    for (const r of rowsRef.current) {
      const t = /^https:\/\/fathom\.video\/share\/([A-Za-z0-9_-]{8,64})/.exec(r.call.shareUrl)?.[1]
      if (t && !asked.current.has(t) && !batch.includes(t) && batch.length < 25) batch.push(t)
    }
    batch.forEach((t) => asked.current.add(t))
    callAccess(batch)
      .then((r) => {
        const got = r.ok ? r.access : {}
        setAccess((x) => {
          const y = { ...x }
          for (const t of batch) y[t] = got[t] || 'unknown'
          return y
        })
      })
      .catch(() => setAccess((x) => Object.fromEntries([...Object.entries(x), ...batch.map((t) => [t, 'unknown'])])))
  }, [])

  const runFrom = (row: CallRow) => async () => {
    const t = await loadTranscript(row.call.id)
    let text = t && 'lines' in t ? t.lines.map((l) => (l.speaker ? l.speaker + ': ' : '') + l.text).join('\n') : ''
    if (!text) text = [row.call.summary, row.out?.deliverable?.markdown ?? ''].filter(Boolean).join('\n\n')
    if (!text.trim()) return toast('This call has no transcript or summary to start from.', 'warn')
    const g = guestsOf(row.call, row.meta).find((x) => x.external)
    const [first, ...rest] = (g?.name ?? '').trim().split(/\s+/)
    setRun({
      entry: 'assessment',
      form: { firstName: first ?? '', lastName: rest.join(' '), email: g?.email ?? '', company: row.meta?.client || row.meta?.folder || '' },
      transcript: text.slice(0, 120_000),
      note: 'Filled in from the call. Check the details, then start.',
    })
  }

  const loadOlder = async () => {
    if (!next) return
    setMoreBusy(true)
    const r = await moreCalls(next).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    setMoreBusy(false)
    if (!r.ok) return toast(r.error, 'warn')
    const have = new Set(calls.map((c) => c.id))
    const add = r.items.filter((c) => !have.has(c.id))
    setOlder((x) => [...x, ...add])
    setCursor(r.next)
    if (!add.length && !r.next) toast('That is every call the key can see')
  }

  // ---------- not connected ----------
  if (!data.connected) {
    const bad = !!data.error && data.error.code !== 'not_connected'
    return (
      <>
        <Banner
          tag="Fathom"
          text={bad ? 'Fathom could not be reached' : 'Connect Fathom once for the whole team'}
          tip="Paste a Fathom API key and every call it can see shows up here for the team."
        />
        <Tabs<'setup'> label="Calls" active="setup" onPick={() => {}} tabs={[{ key: 'setup', label: bad ? 'Connection' : 'Set up' }]} />
        <FathomSetup error={data.error} onRetry={() => router.refresh()} />
      </>
    )
  }

  // ---------- connected ----------
  const clientN = rows.filter((r) => r.client).length
  const monthOf = (iso: string) => {
    const d = new Date(iso)
    const n = new Date(now)
    return hydrated ? d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() : d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth()
  }
  const thisMonth = rows.filter((r) => r.call.start && monthOf(r.call.start)).length
  const monthName = new Date(now).toLocaleString('en-US', { month: 'long', timeZone: hydrated ? undefined : 'UTC' })
  const mins = rows.reduce((a, r) => a + minutesOf(r.call), 0)
  const cats = catButtons(rows, tab)
  const empty = emptyLine(rows, tab, filters)
  const anyFilter = !!(folder || tag || cat)
  const clear = () => {
    setFolder('')
    setTag('')
    setParams({ type: null })
  }
  const go = (t: CallTab) => setParams({ tab: t === 'all' ? null : t })

  return (
    <>
      <Banner
        tag="Fathom"
        text="Read live from Fathom"
        tip="Fathom’s recordings are not copied into the dashboard. Pick a call to watch it here, skim the summary or search the transcript."
        right={
          <>
            <button
              type="button"
              onClick={() => {
                setChecked(Date.now())
                setTx({})
                router.refresh()
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh from Fathom
            </button>
            <button type="button" onClick={() => setKeyOpen(true)} className="rounded-md border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink-2 hover:border-line-2">
              Key ending {data.hint || '····'}
            </button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StripTile n={rows.length} label="Calls loaded" tip={next ? 'older ones still in Fathom' : 'everything the key can see'} active={tab === 'all'} onClick={() => go('all')} />
        <StripTile n={clientN} label="With clients" tip="outside guests on the invite" active={tab === 'ext'} onClick={() => go('ext')} />
        <StripTile n={thisMonth} label="This month" tip={monthName} />
        <StripTile n={hoursText(mins)} label="Hours recorded" tip="across the loaded calls" />
      </div>
      <Tabs<CallTab>
        label="Calls"
        active={tab}
        onPick={go}
        tabs={[
          { key: 'all', label: 'All', count: rows.length },
          { key: 'ext', label: 'Clients', count: clientN },
          { key: 'int', label: 'Internal', count: rows.length - clientN },
        ]}
      />
      <div role="toolbar" aria-label="Show calls by type" className="mb-4 flex flex-wrap gap-1.5">
        {cats.map((b) => (
          <button
            key={b.key || 'all'}
            type="button"
            aria-pressed={cat === b.key}
            onClick={() => setParams({ type: b.key || null })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13.5px] font-semibold ${
              cat === b.key ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'
            }`}
          >
            {b.label} <span className="text-[12px] font-normal opacity-75">{b.n}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <section aria-label="Calls" className="min-w-0 rounded-lg border border-line bg-panel p-3 shadow-card">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search calls or people"
            aria-label="Search calls"
            className="h-9 w-full rounded-sm border border-line bg-panel px-3 text-[14px] text-ink focus:border-accent focus:outline-none"
          />
          <p className="mt-1.5 text-[12px] text-ink-3" data-testid="calls-stamp">
            {hydrated ? stampText(checked, now) : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label="All folders" value={folder} onChange={(e) => setFolder(e.target.value)} className={select}>
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select aria-label="All tags" value={tag} onChange={(e) => setTag(e.target.value)} className={select}>
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
            {anyFilter ? (
              <button type="button" onClick={clear} className="text-[13px] font-semibold text-accent-text hover:underline">
                Clear
              </button>
            ) : null}
          </div>
          {shown.length ? (
            <ul className="mt-2 space-y-1" data-testid="call-rows">
              {shown.map((r) => {
                const g = ftGuests(r.call)
                const m = minutesOf(r.call)
                const tags = r.meta?.tags ?? []
                const on = selected?.call.id === r.call.id
                return (
                  <li key={r.call.id}>
                    <button
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      data-id={r.call.id}
                      onClick={() => {
                        setParams({ call: r.call.id, seg: null })
                        if (window.innerWidth <= 1000) document.querySelector('[data-testid="call-detail"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className={`block w-full rounded-md border px-3 py-2 text-left ${on ? 'border-accent bg-accent-soft/60' : 'border-transparent hover:bg-sunk'}`}
                    >
                      <b className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold leading-snug text-ink">
                        {r.title}
                        {r.client ? <span className="rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent-text">Client</span> : null}
                      </b>
                      <small className="block text-[12.5px] text-ink-3">
                        <LocalCallWhen iso={r.call.start} />
                        {m ? ` · ${m} min` : ''}
                      </small>
                      {g.length ? (
                        <small className="block truncate text-[12.5px] text-ink-3">
                          {g
                            .slice(0, 3)
                            .map((i) => i.name || i.email)
                            .join(', ') + (g.length > 3 ? ' +' + (g.length - 3) : '')}
                        </small>
                      ) : null}
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.type ? (
                          <span
                            className={`rounded-full px-1.5 py-px text-[11.5px] font-semibold ${typeGuessed(r.meta, r.out) ? 'border border-dashed border-line-2 text-ink-2' : 'bg-sunk text-ink-2'}`}
                            title={typeGuessed(r.meta, r.out) ? 'Picked by the AI from the call. Pick a call type to set it.' : 'Call type'}
                          >
                            {typeShort(r.type)}
                          </span>
                        ) : null}
                        {r.meta?.folder ? (
                          <span className="rounded-full border border-line px-1.5 py-px text-[11.5px] text-ink-2" title="Folder">
                            {r.meta.folder}
                          </span>
                        ) : null}
                        {tags.slice(0, 2).map((t) => (
                          <span key={t} className="rounded-full border border-line px-1.5 py-px text-[11.5px] text-ink-2">
                            #{t}
                          </span>
                        ))}
                        {tags.length > 2 ? <span className="rounded-full border border-line px-1.5 py-px text-[11.5px] text-ink-2">+{tags.length - 2}</span> : null}
                        {r.out?.status === 'done' ? (
                          <span className="rounded-full bg-good-soft px-1.5 py-px text-[11.5px] font-semibold text-good" title="Post-call actions are ready">
                            Actions ready
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="mt-3 rounded-md bg-sunk/60 px-3 py-4 text-[14px] text-ink-3">
              <p>{empty.text}</p>
              {empty.clear === 'filters' ? (
                <button type="button" onClick={clear} className="mt-2 text-[13.5px] font-semibold text-accent-text hover:underline">
                  Clear filters
                </button>
              ) : empty.clear === 'cat' ? (
                <button type="button" onClick={() => setParams({ type: null })} className="mt-2 text-[13.5px] font-semibold text-accent-text hover:underline">
                  Show all
                </button>
              ) : null}
            </div>
          )}
          {next ? (
            <div className="mt-3 text-center">
              <button
                type="button"
                disabled={moreBusy}
                onClick={loadOlder}
                className="rounded-sm border border-line px-3.5 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2 disabled:opacity-60"
              >
                {moreBusy ? 'Loading…' : 'Load older calls'}
              </button>
            </div>
          ) : null}
        </section>

        {selected ? (
          <CallDetail
            key={selected.call.id}
            row={selected}
            lead={leadOf(selected.call, selected.meta, data.leads)}
            custom={data.types}
            auto={data.auto}
            access={(() => {
              const t = /^https:\/\/fathom\.video\/share\/([A-Za-z0-9_-]{8,64})/.exec(selected.call.shareUrl)?.[1]
              return t ? access[t] : undefined
            })()}
            onCheckAccess={checkAccess}
            seg={seg}
            setSeg={(s) => setParams({ seg: s === 'summary' ? null : s })}
            transcript={tx[selected.call.id] ?? null}
            loadTranscript={loadTranscript}
            writing={!!writing[selected.call.id]}
            onWrite={write(selected)}
            onEdit={() => setEditing(selected.call.id)}
            onRunAssessment={runFrom(selected)}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-line p-6 text-[14px] text-ink-3">Pick a call to see it here.</div>
        )}
      </div>

      {editing ? (
        (() => {
          const r = rows.find((x) => x.call.id === editing)
          return r ? <EditDetails row={r} folders={folders} tags={tags} custom={data.types} onClose={() => setEditing(null)} /> : null
        })()
      ) : null}
      {keyOpen ? <FathomKeyDialog onClose={() => setKeyOpen(false)} /> : null}
      {run ? <NewRunDialog prefill={run} onClose={() => setRun(null)} /> : null}
    </>
  )
}

