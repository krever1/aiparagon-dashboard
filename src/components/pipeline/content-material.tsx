'use client'

import { type DragEvent, useId, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CheckCircle2, Loader2, RefreshCw, Search, Sparkles, Upload } from 'lucide-react'
import type { CallPick, CallsPick } from '@/app/(app)/content-transformation/actions'
import { callWhenText } from '@/components/ui/local-date'
import { FILE_ACCEPT } from '@/lib/pipeline/content-files'
import { type Form, num, wordCount } from '@/lib/pipeline/content-new'
import { Tag, btn, inputCls, linkCls } from './bits'
import { OUT_TIP, legacy } from './content-view'

// New draft's material tabs that bring material in whole: Upload (a file read in this browser: apCfFile and its drop
// zone) and Fathom call (a recorded call's transcript: apCfCallPick, apCfCallRows and apCfUseCall), and the line a
// reason from Fill it in for me sits on under a field it filled (v99AfNotesPaint).

export type Msg = { text: string; tone: 'busy' | 'err' | 'ok'; out?: boolean }

const msgCls = (m: Msg | null) => (m?.tone === 'err' ? 'text-bad' : m?.tone === 'ok' ? 'text-good' : 'text-ink-2')

/** The drop zone and its file box: a file is read here, then its text is the material. */
export function UploadPanel({ f, busy, msg, onFile, onSee }: { f: Form; busy: boolean; msg: Msg | null; onFile: (file: File) => void; onSee: () => void }) {
  const id = useId()
  const [over, setOver] = useState(false)
  const has = !!f.fileName && !!f.text.trim()
  const take = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && !busy) onFile(file)
  }
  return (
    <div data-testid="upload">
      <input
        id={id}
        type="file"
        accept={FILE_ACCEPT}
        className="peer sr-only"
        aria-label="Upload a file"
        aria-describedby={id + '-h'}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <label
        htmlFor={id}
        onDragEnter={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!over) setOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
        }}
        onDrop={take}
        data-testid="drop-zone"
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-center peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
          over ? 'border-accent bg-accent-soft' : has ? 'border-good/40 bg-good-soft/40' : 'border-line bg-bg hover:border-line-2'
        }`}
      >
        {busy ? (
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-ink-2" />
        ) : has ? (
          <CheckCircle2 size={22} aria-hidden="true" className="text-good" />
        ) : (
          <Upload size={22} aria-hidden="true" className="text-ink-2" />
        )}
        <b className="max-w-full break-words text-[14.5px] font-semibold text-ink">{has ? f.fileName : 'Drop a file or browse'}</b>
        <small id={id + '-h'} className="max-w-[460px] text-[13px] text-ink-3">
          {has
            ? num(wordCount(f.text)) + ' words ready. Drop another file to replace it.'
            : 'Article, webinar transcript, interview or chapter: PDF, DOCX, TXT, VTT or SRT. Video and audio are still transcribed in the current dashboard.'}
        </small>
      </label>
      <p role="status" aria-live="polite" className={`mt-1.5 min-h-[1em] text-[13px] ${msgCls(msg)}`} data-testid="file-msg">
        {msg?.text ?? ''}
        {msg?.out ? (
          <>
            {' '}
            <a href={legacy('content-transformation')} title={OUT_TIP} className="inline-flex items-center gap-0.5 font-semibold text-accent-text hover:underline">
              Open the current dashboard
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </>
        ) : null}
        {msg?.tone === 'ok' && has ? (
          <>
            {' '}
            <button type="button" className={linkCls} onClick={onSee}>
              See the text
            </button>
          </>
        ) : null}
      </p>
    </div>
  )
}

export type CallList = { st: 'idle' | 'loading' } | { st: 'done'; at: number; res: CallsPick }

/** The Fathom call tab: the newest recorded calls, searched by Calls' rules; a pick's transcript becomes the material. */
export function FathomPanel({
  list,
  load,
  tz,
  open,
  setOpen,
  picked,
  onPick,
}: {
  list: CallList
  load: () => void
  tz: string | undefined
  open: boolean
  setOpen: (v: boolean) => void
  /** the title of the call whose transcript is in, if any */
  picked: string
  onPick: (c: CallPick) => Promise<boolean>
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="fathom">
        <button type="button" className={btn} onClick={() => setOpen(true)}>
          <RefreshCw size={14} aria-hidden="true" />
          {picked ? 'Pick another call' : 'Pick a call'}
        </button>
      </div>
    )
  const pick = async (c: CallPick) => {
    if (busy) return
    setBusy(c.id)
    const ok = await onPick(c)
    setBusy('')
    if (ok) setOpen(false)
  }
  let body
  if (list.st !== 'done') body = <p className="text-[13.5px] text-ink-2">Loading your Fathom calls…</p>
  else if (!list.res.ok) {
    const connect = list.res.code === 'not_connected' || list.res.code === 'bad_key'
    body = (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-[13.5px] text-bad">
        {list.res.error}
        {connect ? (
          <Link href="/calls" className={btn}>
            Connect Fathom
          </Link>
        ) : null}
        <button type="button" className={btn} onClick={load}>
          Try again
        </button>
      </p>
    )
  } else if (!list.res.connected)
    body = (
      <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
        Fathom is not connected yet.
        <Link href="/calls" className={btn}>
          Connect Fathom
        </Link>
      </p>
    )
  else if (!list.res.calls.length) body = <p className="text-[13.5px] text-ink-2">No calls in Fathom yet.</p>
  else {
    const s = q.trim().toLowerCase()
    const rows = list.res.calls.filter((c) => !s || c.hay.includes(s)).slice(0, 40)
    body = (
      <>
        <label className="relative block">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search calls or people"
            aria-label="Search calls"
            className={inputCls + ' pl-8'}
          />
        </label>
        {rows.length ? (
          <ul className="mt-2 grid max-h-[340px] gap-1 overflow-y-auto pr-1" aria-label="Fathom calls">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void pick(c)}
                  disabled={!!busy}
                  className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-sm border border-line bg-panel px-3 py-2 text-left hover:border-line-2 disabled:opacity-70"
                >
                  <b className="flex w-full min-w-0 items-center gap-1.5 text-[14px] font-semibold text-ink">
                    <span className="truncate">{c.title}</span>
                    {c.client ? <Tag gold>Client</Tag> : null}
                  </b>
                  <small className="text-[12.5px] text-ink-3">
                    {busy === c.id ? 'Loading the transcript…' : callWhenText(c.start, tz) + (c.minutes ? ' · ' + c.minutes + ' min' : '')}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13.5px] text-ink-2">No calls match that.</p>
        )}
      </>
    )
  }
  return (
    <div data-testid="fathom">
      <p className="mb-2 text-[13.5px] text-ink-2">Pick a recorded call. Its transcript becomes your material.</p>
      {body}
    </div>
  )
}

/** A reason Fill it in for me gave for a field it filled: one line, the whole of it on a click. */
export function Why({ text }: { text: string | undefined }) {
  const [full, setFull] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      aria-expanded={full}
      onClick={() => setFull((v) => !v)}
      title={full ? undefined : text}
      className="mt-1 flex w-full min-w-0 items-start gap-1.5 text-left text-[12.5px] text-accent-text"
      data-testid="fill-why"
    >
      <Sparkles size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className={full ? '' : 'truncate'}>{text}</span>
    </button>
  )
}
