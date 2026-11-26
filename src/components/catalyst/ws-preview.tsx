'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Pencil, Star } from 'lucide-react'
import { callText } from '@/app/(app)/lead-pipeline/actions'
import { type FileManyResult, type WsResult, wsDelete, wsFileMany, wsInfo, wsSet } from '@/app/(app)/lead-pipeline/ws-actions'
import { Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { useHydrated, usDateText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type TypeNames, typeLabel } from '@/lib/catalyst/calls'
import type { LeadPageData } from '@/lib/catalyst/lead-page'
import type { Stage } from '@/lib/catalyst/stages'
import type { LeadTab } from '@/lib/catalyst/view'
import {
  type GuessCtx, type WsFolder, type WsInfo, type WsItem, type WsItemMeta, type WsMeta, activityOf, byLine, firstLink, guessFolder, relatedCall, wsKindName,
} from '@/lib/catalyst/workspace'
import { Md } from './markdown'
import { plural } from './bits'

// v153: the client workspace's preview panel (a click on an item's name) and the folder suggestions for calls (the
// Calls view's Review suggestions), as the current dashboard's v153 has them.

type Found = Extract<LeadPageData, { found: true }>
type Msg = { text: string; bad?: boolean } | null

const btn = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const ghost = 'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-60'
const primary =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
const field = 'w-full min-w-0 max-w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none'
const chipCls = 'rounded-[6px] border border-line px-1.5 text-[12px] text-ink hover:bg-sunk'
const docBox = 'rounded-lg border border-line bg-[#fffdf8] px-4 py-3.5 text-[14px] leading-relaxed [overflow-wrap:anywhere]'
const fail = { ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }
const web = (u?: string) => !!u && /^https?:\/\//i.test(u)

/** "Oct 2, 2026, 9:00 AM" in the viewer's zone (v153When); UTC while the server draws it. */
function whenText(iso: string, tz?: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
}

function clip(t: string, n: number) {
  return t.length > n ? { t: t.slice(0, n), more: true } : { t, more: false }
}

/** A document's own text (v153DocMd): an older agent's from its row, a meeting prep's from its stage's row. */
function docText(data: Found, key: string): string {
  if (key.startsWith('a:')) return data.docs.find((d) => 'a:' + d.agent === key)?.md ?? ''
  if (key.startsWith('p:')) return data.prep[key.slice(2)]?.md ?? ''
  return ''
}

/**
 * The preview panel (v153Open, v153Paint): File preview or Call preview, its folder, name, who and when; Star, Rename
 * and Move to; then Preview, Details and Activity; Open the file (or in Fathom, on Calls) and View related call below.
 */
export function WsPreview({
  data,
  item,
  meta,
  folders,
  stages,
  calls,
  typeNames,
  onClose,
  onOpen,
  onStar,
  onMove,
  onSaved,
  onTab,
}: {
  data: Found
  item: WsItem
  meta: WsItemMeta | undefined
  folders: WsFolder[]
  stages: readonly Stage[]
  calls: WsItem[]
  typeNames: TypeNames
  onClose: () => void
  onOpen: (key: string) => void
  onStar: (i: WsItem) => Promise<void> | void
  onMove: (i: WsItem, folder: string) => Promise<void> | void
  onSaved: (ws: WsMeta) => void
  onTab: (t: LeadTab) => void
}) {
  const h = useHydrated()
  const tz = h ? undefined : 'UTC'
  const key = item.key
  const [tab, setTab] = useState<'preview' | 'details' | 'activity'>('preview')
  const [rn, setRn] = useState(false)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [info, setInfo] = useState<WsInfo | null>(null)
  const [infoErr, setInfoErr] = useState(false)
  const [tx, setTx] = useState<string | null | undefined>(undefined)
  const [txBusy, setTxBusy] = useState(false)
  const [desc, setDesc] = useState('')
  const [source, setSource] = useState(false)
  const [busy, setBusy] = useState(false)
  const rnRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // another item starts afresh, on Preview
  const [shown, setShown] = useState('')
  if (shown !== key) {
    setShown(key)
    setTab('preview')
    setRn(false)
    setMsg(null)
    setInfo(null)
    setInfoErr(false)
    setTx(undefined)
    setDesc(item.desc ?? '')
    setSource(!!item.source)
  }

  useEffect(() => {
    if (!key || key.startsWith('a:') || key.startsWith('p:')) return
    let live = true
    wsInfo(data.lead.id, key)
      .then((r) => {
        if (!live) return
        if (r.ok) setInfo(r.info)
        else setInfoErr(true)
      })
      .catch(() => live && setInfoErr(true))
    return () => {
      live = false
    }
  }, [data.lead.id, key])

  useEffect(() => {
    if (rn) {
      rnRef.current?.focus()
      rnRef.current?.select()
    }
  }, [rn])

  const i = item
  const up = i.kind === 'upload' || i.kind === 'transcript'
  const fname = folders.find((f) => f.id === i.folder)?.name ?? ''
  const link = firstLink(i)
  const rel = relatedCall(i, calls)
  const tabOf = i.fm.find((f) => f.tab)?.tab
  const say = (text: string, bad?: boolean) => setMsg({ text, bad })
  const stageName = (k: string) => stages.find((s) => s.key === k)?.name || k

  const renameGo = async () => {
    const n = name.replace(/\s+/g, ' ').trim()
    if (!n) return say('Give it a name.', true)
    if (n === i.name) return setRn(false)
    setBusy(true)
    const r: WsResult = await wsSet(data.lead.id, i.key, { name: n }).catch(() => fail)
    setBusy(false)
    if (!r.ok) return say(r.error, true)
    onSaved(r.ws)
    setRn(false)
    say('Renamed.')
  }
  const detailsGo = async () => {
    const ch: { desc?: string; source?: boolean } = {}
    if (desc.trim() !== (i.desc || '')) ch.desc = desc
    if (up && source !== !!i.source) ch.source = source
    if (!Object.keys(ch).length) return say('Nothing changed.')
    setBusy(true)
    const r: WsResult = await wsSet(data.lead.id, i.key, ch).catch(() => fail)
    setBusy(false)
    if (!r.ok) return say(r.error, true)
    onSaved(r.ws)
    say('Saved.')
  }
  const remove = async () => {
    if (!window.confirm('Delete ' + i.name + '? The file is removed for the whole team.')) return
    setBusy(true)
    const r: WsResult = await wsDelete(data.lead.id, i.key).catch(() => fail)
    setBusy(false)
    if (!r.ok) return say(r.error, true)
    onSaved(r.ws)
    onClose()
    toast(r.toast)
  }
  const showTx = async () => {
    if (!i.id) return
    setTxBusy(true)
    const r = await callText(i.id).catch(() => null)
    setTxBusy(false)
    setTx(r && r.ok ? r.text : null)
  }
  const pick = (t: typeof tab) => {
    setTab(t)
    tabRefs.current[t]?.focus()
  }

  const formats = i.fm.filter((f) => f.l && f.l !== 'Read')
  const chips = formats.length ? (
    <div className="mb-3 flex flex-wrap gap-1.5" data-testid="ws-formats">
      {formats.map((f) =>
        web(f.u) ? (
          <a key={f.l} href={f.u} target="_blank" rel="noopener noreferrer" className={chipCls}>
            {f.l}
          </a>
        ) : (
          <span key={f.l} className={chipCls}>
            {f.l}
          </span>
        ),
      )}
    </div>
  ) : null
  const muted = (t: string) => <p className="text-[14px] text-ink-3">{t}</p>

  const preview = () => {
    if (i.kind === 'doc') {
      const md = docText(data, i.key)
      if (!md || /^\s*[[{]/.test(md))
        return (
          <>
            {chips}
            {muted(md ? 'This document is kept as structured data. Open it from its format above.' : 'No text of this document is kept in the dashboard. Open it from its format above.')}
          </>
        )
      const c = clip(md, 24_000)
      return (
        <>
          {chips}
          <div className={docBox}>
            <Md>{c.t}</Md>
          </div>
          {c.more ? <p className="mt-2 text-[12.5px] text-ink-3">Showing the first part. Open it from its format above for the whole document.</p> : null}
        </>
      )
    }
    if (up) {
      if (infoErr) return <>{chips}{muted('The text could not be read just now. Open the file from its format above.')}</>
      if (!info) return <>{chips}<p role="status" className="text-[14px] text-ink-3">Reading the text…</p></>
      const t = info.text ?? ''
      if (!t) return <>{chips}{muted('No text has been read from this file yet' + (i.kind === 'upload' ? ' (pictures and some PDFs have none)' : '') + '. Open it from its format above.')}</>
      const c = clip(t, 20_000)
      return (
        <>
          {chips}
          {i.desc ? <p className="mb-2 text-[14px]">{i.desc}</p> : null}
          <div className={docBox + ' whitespace-pre-wrap text-[13.5px]'}>{c.t}</div>
          {c.more ? <p className="mt-2 text-[12.5px] text-ink-3">Showing the first {c.t.length.toLocaleString('en-US')} characters.</p> : null}
        </>
      )
    }
    // a call
    const sum = info?.summary ?? []
    const tasks = info?.tasks ?? []
    return (
      <>
        {i.desc ? <p className="mb-2 text-[14px]">{i.desc}</p> : null}
        {!info && !infoErr ? (
          <p role="status" className="text-[14px] text-ink-3">Reading the call…</p>
        ) : sum.length ? (
          <section className="mb-3">
            <h3 className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Summary</h3>
            <ul className="list-disc space-y-1 pl-5 text-[14px]">
              {sum.map((s, n) => (
                <li key={n}>{s}</li>
              ))}
            </ul>
          </section>
        ) : (
          muted('No post-call summary yet. Write one from the call on Calls.')
        )}
        {tasks.length ? (
          <section className="mb-3">
            <h3 className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Next steps</h3>
            <ul className="list-disc space-y-1 pl-5 text-[14px]">
              {tasks.map((t, n) => (
                <li key={n}>
                  {t.text}
                  {t.owner ? ' (' + t.owner + ')' : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="mt-3">
          <h3 className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Transcript</h3>
          {txBusy ? (
            <p role="status" className="text-[14px] text-ink-3">Loading the transcript…</p>
          ) : tx === undefined ? (
            <button type="button" className={btn} onClick={showTx}>
              Show the transcript
            </button>
          ) : tx === null ? (
            muted('Fathom could not give the transcript just now.')
          ) : !tx ? (
            muted('Fathom has no transcript for this call.')
          ) : (
            <div className={docBox + ' whitespace-pre-wrap text-[13.5px]'} data-testid="ws-transcript">
              {clip(tx, 20_000).t}
            </div>
          )}
        </section>
      </>
    )
  }

  const details = () => {
    const rows: [string, React.ReactNode][] = []
    const add = (t: string, v: React.ReactNode) => {
      if (t && v) rows.push([t, v])
    }
    add('Name', i.name)
    add('Kind', wsKindName(i))
    add('Folder', fname || 'To organize')
    if (i.kind === 'call') {
      const st = info?.filed ? info.filed.stage : ''
      add('Filed', st === 'none' ? 'Set aside: not about this client' : st ? 'Filed under ' + stageName(st) : info || infoErr ? 'Not filed under a stage yet' : '…')
    }
    add(
      'Formats',
      formats.length
        ? formats.map((f, n) => (
            <span key={f.l}>
              {n ? ', ' : ''}
              {web(f.u) ? (
                <a href={f.u} target="_blank" rel="noopener noreferrer" className="underline">
                  {f.l}
                </a>
              ) : (
                f.l
              )}
            </span>
          ))
        : '',
    )
    if (i.kind === 'call') {
      add('People', i.who)
      add('Length', i.mins ? i.mins + ' min' : '')
      add('Call type', i.type ? typeLabel(i.type, typeNames) : '')
    } else add(up ? 'Uploaded by' : 'Written by', up ? i.by || 'Team' : i.by === 'AI generated' ? 'Catalyst (AI generated)' : i.by)
    add(i.kind === 'call' ? 'Held' : 'Date', whenText(i.at, tz))
    if (up) add('Source', i.source ? 'Yes: this client’s stage runs read it' : 'No: the stage runs leave it out')
    add(
      'Sent to',
      i.sent.length
        ? i.sent.map((s) => (
            <span key={s.to} className="block">
              {s.to} · {s.name} ({usDateText(s.at, tz)})
            </span>
          ))
        : '',
    )
    return (
      <>
        <dl className="grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[14px] max-[600px]:grid-cols-[minmax(0,1fr)]" data-testid="ws-details">
          {rows.map(([t, v]) => (
            <div key={t} className="contents">
              <dt className="text-ink-3 max-[600px]:mt-1.5">{t}</dt>
              <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
        <label className="mt-4 block">
          <span className="block text-[13.5px] font-semibold text-ink">Description</span>
          <textarea rows={3} maxLength={600} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it is, or why it matters" className={field + ' mt-1'} />
        </label>
        {up ? (
          <label className="mt-2 flex items-start gap-2 text-[13.5px]">
            <input type="checkbox" className="mt-1" checked={source} onChange={(e) => setSource(e.target.checked)} /> Use it as a source: this client’s stage runs read it
          </label>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primary} disabled={busy} onClick={detailsGo}>
            Save details
          </button>
          {up ? (
            <>
              <span className="flex-1" />
              <button type="button" disabled={busy} onClick={remove} className="rounded-sm px-3 py-1.5 text-[13.5px] font-semibold text-bad hover:bg-bad-soft">
                Delete
              </button>
            </>
          ) : null}
        </div>
      </>
    )
  }

  const activity = () => {
    const ev = activityOf(i, meta, info, stages)
    return (
      <>
        {ev.length ? (
          <ul className="grid gap-2.5" data-testid="ws-activity">
            {ev.map((e, n) => (
              <li key={n} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 text-[14px]">
                <span aria-hidden="true" className="mt-[7px] h-2 w-2 rounded-full bg-[#b08d3c]" />
                <span>{e.what}</span>
                <small className="col-start-2 text-[12.5px] text-ink-3">{[whenText(e.at, tz), e.by && e.by !== 'Team' ? e.by : ''].filter(Boolean).join(' · ') || 'Date not kept'}</small>
              </li>
            ))}
          </ul>
        ) : (
          muted('Nothing recorded yet.')
        )}
        <p className="mt-3 text-[12.5px] text-ink-3">Renames, moves, stars and description changes are kept from Nov 26 on.</p>
      </>
    )
  }

  const when = i.at ? (i.kind === 'call' ? usDateText(i.at, tz) : 'Updated ' + usDateText(i.at, tz)) : ''
  const head = (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <span className="w-fit max-w-full truncate rounded-[6px] bg-[#eef3ea] px-2 py-0.5 text-[12px] text-[#3b6b2c]" data-testid="ws-folder-chip">
        {fname || 'To organize'}
      </span>
      <p className="text-[13px] text-ink-2" data-testid="ws-by">
        {[byLine(i), when].filter(Boolean).join(' · ')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={'grid h-8 w-8 place-items-center rounded-sm hover:bg-sunk ' + (i.star ? 'text-[#b38a2a]' : 'text-ink-2')}
          aria-pressed={i.star}
          aria-label={(i.star ? 'Unstar ' : 'Star ') + i.name}
          onClick={() => onStar(i)}
        >
          <Star size={17} aria-hidden="true" fill={i.star ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className={ghost}
          aria-expanded={rn}
          onClick={() => {
            setName(i.name)
            setRn(true)
          }}
        >
          <Pencil size={13} aria-hidden="true" /> Rename
        </button>
        <label className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
          <span aria-hidden="true">Move to</span>
          <span className="sr-only">Move {i.name} to</span>
          <select value={i.folder} onChange={(e) => onMove(i, e.target.value)} className="max-w-[220px] rounded-sm border border-line bg-panel px-2 py-1 text-[13.5px] text-ink">
            <option value="">To organize</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rn ? (
        <div className="flex flex-wrap gap-2">
          <label className="min-w-0 flex-[1_1_200px]">
            <span className="sr-only">New name</span>
            <input
              ref={rnRef}
              type="text"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') renameGo()
                if (e.key === 'Escape') {
                  // Esc cancels the rename, and leaves the panel open
                  e.preventDefault()
                  e.stopPropagation()
                  setRn(false)
                }
              }}
              className={field + ' h-9'}
            />
          </label>
          <button type="button" className={primary} disabled={busy} onClick={renameGo}>
            Save
          </button>
          <button type="button" className={btn} onClick={() => setRn(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className={`min-h-[1em] text-[13px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="ws-preview-msg">
        {msg?.text ?? ''}
      </p>
    </div>
  )

  const footer = (
    <>
      {link ? (
        <a className={btn} href={link.u} target="_blank" rel="noopener noreferrer">
          <Download size={14} aria-hidden="true" /> Open {link.l === 'Transcript' ? 'the transcript file' : link.l}
        </a>
      ) : null}
      {i.kind === 'doc' && tabOf ? (
        <button
          type="button"
          className={btn}
          onClick={() => {
            onClose()
            onTab(tabOf as LeadTab)
          }}
        >
          Open its tab
        </button>
      ) : null}
      {i.kind === 'call' && i.link && /^https:\/\//i.test(i.link) ? (
        <a className={btn} href={i.link} target="_blank" rel="noopener noreferrer">
          Open in Fathom
        </a>
      ) : null}
      <span className="flex-1" />
      {i.kind === 'call' && i.id && i.src !== 'Uploaded' ? (
        <Link className={primary} href={`/calls?call=${encodeURIComponent(i.id)}&seg=post`}>
          Open on Calls
        </Link>
      ) : rel ? (
        <button type="button" className={primary} title={'The newest call in ' + (fname || 'this folder') + ': ' + rel.name} onClick={() => onOpen(rel.key)}>
          View related call
        </button>
      ) : null}
    </>
  )

  const TABS = [
    ['preview', 'Preview'],
    ['details', 'Details'],
    ['activity', 'Activity'],
  ] as const
  return (
    <Drawer open onClose={onClose} eyebrow={i.kind === 'call' ? 'Call preview' : 'File preview'} title={i.name} meta={head} footer={footer} label="ws-preview">
      <div role="tablist" aria-label="Preview, details and activity" className="mb-3 flex gap-[18px] border-b border-line">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            ref={(el) => {
              tabRefs.current[k] = el
            }}
            type="button"
            role="tab"
            id={'ws-pv-' + k}
            aria-controls="ws-pv-pane"
            aria-selected={tab === k}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => pick(k)}
            onKeyDown={(e) => {
              const n = TABS.findIndex((t) => t[0] === tab)
              if (e.key === 'ArrowRight') pick(TABS[(n + 1) % 3][0])
              if (e.key === 'ArrowLeft') pick(TABS[(n + 2) % 3][0])
            }}
            className={`-mb-px border-b-2 py-2 text-[14px] ${tab === k ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div id="ws-pv-pane" role="tabpanel" aria-labelledby={'ws-pv-' + tab} data-testid="ws-pane">
        {tab === 'details' ? details() : tab === 'activity' ? activity() : preview()}
      </div>
    </Drawer>
  )
}

/**
 * Folder suggestions for calls (v153Suggest, v153SgGo): each call or uploaded transcript with no folder gets a folder,
 * with why, ticked when one is suggested; File N calls files them in one go (a stage folder files the call under that
 * stage, as a move does).
 */
export function WsSuggest({
  leadId,
  list,
  folders,
  ctx,
  onClose,
  onDone,
}: {
  leadId: string
  list: WsItem[]
  folders: WsFolder[]
  ctx: GuessCtx
  onClose: () => void
  onDone: (ws: WsMeta | null) => void
}) {
  const h = useHydrated()
  const [rows, setRows] = useState(() =>
    list.map((i) => {
      const g = guessFolder(i, ctx)
      return { i, folder: g.folder, why: g.why, on: !!g.folder }
    }),
  )
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const n = rows.filter((r) => r.on && r.folder).length
  const set = (k: number, p: Partial<(typeof rows)[number]>) => setRows((x) => x.map((r, j) => (j === k ? { ...r, ...p } : r)))

  const go = async () => {
    const picks = rows.filter((r) => r.on && r.folder).map((r) => ({ key: r.i.key, folder: r.folder }))
    if (!picks.length) return
    setBusy(true)
    const r: FileManyResult = await wsFileMany(leadId, picks).catch(() => ({ ...fail, ws: null, n: 0 }))
    if (!r.ok) {
      setBusy(false)
      setMsg({ text: r.error, bad: true })
      // the ones filed are unticked, so filing again sends only the others
      const went = new Set(picks.slice(0, r.n).map((p) => p.key))
      setRows((x) => x.map((row) => (went.has(row.i.key) ? { ...row, on: false } : row)))
      if (r.ws) onDone(r.ws)
      return
    }
    onDone(r.ws)
    onClose()
    toast('Filed ' + plural(r.n, 'call') + '.')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Client workspace · Calls"
      title={plural(rows.length, 'call') + ' ' + (rows.length === 1 ? 'needs' : 'need') + ' a folder'}
      width={640}
      footer={
        <>
          <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="ws-sg-msg">
            {msg?.text ?? ''}
          </span>
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={!n || busy} onClick={go}>
            {n ? 'File ' + plural(n, 'call') : 'Nothing to file'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] text-ink-3">
        A folder is suggested for each, with why. Change any of them, untick one to leave it, then file them. A stage folder files the call under that stage.
      </p>
      <ul className="grid gap-2.5" data-testid="ws-suggestions">
        {rows.map((r, k) => (
          <li key={r.i.key} data-testid="ws-suggestion" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-line px-3.5 py-3">
            <input
              type="checkbox"
              className="mt-[3px] h-[18px] w-[18px]"
              aria-label={'File ' + r.i.name}
              checked={r.on}
              onChange={(e) => set(k, { on: e.target.checked })}
            />
            <div className="min-w-0">
              <b className="block font-semibold [overflow-wrap:anywhere]">{r.i.name}</b>
              <div className="text-[12.5px] text-ink-3">
                {[usDateText(r.i.at, h ? undefined : 'UTC'), r.i.mins ? r.i.mins + ' min' : '', r.i.who, r.i.src].filter(Boolean).join(' · ')}
              </div>
              <label className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
                <span>Suggested folder</span>
                <select
                  value={r.folder}
                  onChange={(e) => set(k, { folder: e.target.value, on: !!e.target.value })}
                  className="max-w-full rounded-sm border border-line bg-panel px-2 py-1 text-[13.5px] text-ink"
                >
                  <option value="">Leave in To organize</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              {r.why ? (
                <div className="mt-1 text-[12.5px] text-[#6b5a2a]" data-testid="ws-why">
                  {r.why}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
