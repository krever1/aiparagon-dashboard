'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { type ReadDocResult, readDocument } from '@/app/(app)/lead-pipeline/actions'
import {
  type DocSource, type JsonStruct, type MdStruct, humanize, jsonStruct, mdClean, mdStruct, parseDocText, parseSaved, pdfToMd, txt,
} from '@/lib/catalyst/doc-format'
import { plural } from './bits'
import { Md } from './markdown'

// "Read here": a document on its lead's page, as Structured (title, key facts, one part per heading) or Full text.
// The text saved with the document is shown as it is; without one, the Google Doc (or the PDF) is read through the
// Doc Reader workflow. The view picked is remembered in this browser.

const cache = new Map<string, Promise<ReadDocResult>>()

function read(id: string): Promise<ReadDocResult> {
  let p = cache.get(id)
  if (!p) {
    p = readDocument(id)
      .catch((): ReadDocResult => ({ ok: false, error: 'Could not reach the dashboard. Try again in a minute.' }))
      .then((r) => {
        if (!r.ok) cache.delete(id)
        return r
      })
    cache.set(id, p)
  }
  return p
}

type Loaded = { src: DocSource; note: string } | { error: string }

async function load(docId: string, pdfId: string): Promise<Loaded> {
  const r = await read(docId || pdfId)
  if (!r.ok) return { error: r.error }
  let src: DocSource = r.kind === 'pdf' ? { md: pdfToMd(r.text), pdf: true } : parseDocText(r.text)
  if (!src.json && docId && pdfId && docId !== pdfId && !src.md.trim()) {
    const p = await read(pdfId)
    if (!p.ok) return { error: p.error }
    src = { md: pdfToMd(p.text), pdf: true }
  }
  return { src, note: src.pdf ? 'Read from the PDF.' : 'Read from the Google Doc.' }
}

type Mode = 'structured' | 'full'
const MODE_KEY = 'catalyst.docView'

function useMode(): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return window.localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'structured'
    } catch {
      return 'structured'
    }
  })
  return [
    mode,
    (m) => {
      setMode(m)
      try {
        window.localStorage.setItem(MODE_KEY, m)
      } catch {
        // a private window: the choice lasts this visit
      }
    },
  ]
}

export function DocReader({ md, docId, pdfId }: { md: string | null; docId: string; pdfId: string }) {
  const saved = useMemo<Loaded | null>(() => (md ? { src: parseSaved(md), note: '' } : null), [md])
  const [fetched, setFetched] = useState<Loaded | null>(null)
  const [mode, setMode] = useMode()

  useEffect(() => {
    if (md) return
    let live = true
    load(docId, pdfId).then((r) => {
      if (live) setFetched(r)
    })
    return () => {
      live = false
    }
  }, [md, docId, pdfId])

  const state = saved ?? fetched
  if (!state) {
    return (
      <p role="status" className="mt-3 text-[14px] text-ink-2">
        {md ? 'Opening…' : 'Reading the document from Google Drive…'}
      </p>
    )
  }
  if ('error' in state) {
    return (
      <div role="alert" className="mt-3 rounded-sm border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">
        {state.error} Use Open PDF or Open Google Doc instead.
      </div>
    )
  }
  const { src, note } = state
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="doc-reader">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold text-ink-3">View</span>
        {(['structured', 'full'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full border px-3 py-1 font-semibold ${
              mode === m ? 'border-action bg-action text-action-ink' : 'border-line bg-panel text-ink-2 hover:border-line-2'
            }`}
          >
            {m === 'structured' ? 'Structured' : 'Full text'}
          </button>
        ))}
        {note ? <small className="text-ink-3">{note}</small> : null}
      </div>
      {mode === 'structured' ? (
        src.json ? (
          <JsonView s={jsonStruct(Array.isArray(src.json) ? { items: src.json } : src.json)} />
        ) : (
          <MdView s={mdStruct(src.md)} />
        )
      ) : (
        <Md>{mdClean(src.md)}</Md>
      )}
    </div>
  )
}

function Facts({ facts }: { facts: [string, string][] }) {
  if (!facts.length) return null
  return (
    <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 rounded-md bg-sunk p-3.5 sm:grid-cols-2">
      {facts.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{k}</span>
          <b className="block break-words text-[14px] font-semibold text-ink">
            <Md inline>{v}</Md>
          </b>
        </div>
      ))}
    </div>
  )
}

function Parts({ heads, children }: { heads: string[]; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const jump = (j: number) => {
    const d = box.current?.querySelector<HTMLDetailsElement>(`details[data-j="${j}"]`)
    if (!d) return
    d.open = true
    d.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <>
      {heads.length > 2 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="mr-1 font-semibold text-ink-3">Jump to</span>
          {heads.map((h, j) => (
            <button key={j} type="button" onClick={() => jump(j)} className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-ink-2 hover:border-line-2 hover:text-ink">
              {h}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={box} className="mt-3 space-y-2.5">
        {children}
      </div>
    </>
  )
}

function Part({ j, h, extra, flag, children }: { j: number; h: string; extra?: React.ReactNode; flag?: boolean; children: React.ReactNode }) {
  return (
    <details open data-j={j} className={`scroll-mt-20 rounded-md border ${flag ? 'border-warn/40 bg-warn-soft/40' : 'border-line bg-panel'}`}>
      <summary className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-sunk text-[12px] font-semibold text-ink-2">{j + 1}</span>
        <b className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{h}</b>
        {extra}
      </summary>
      <div className="border-t border-line px-3.5 py-3">{children}</div>
    </details>
  )
}

function MdView({ s }: { s: MdStruct }) {
  return (
    <div data-view="structured">
      {s.title ? <h3 className="font-display text-[21px] font-semibold text-ink">{s.title}</h3> : null}
      <Facts facts={s.facts} />
      {s.intro ? <Md className="mt-3">{s.intro}</Md> : null}
      <Parts heads={s.secs.map((x) => x.h)}>
        {s.secs.map((sec, j) => (
          <Part key={j} j={j} h={sec.h} extra={sec.points ? <em className="text-[12.5px] not-italic text-ink-3">{plural(sec.points, 'point')}</em> : null}>
            {sec.body ? <Md>{sec.body}</Md> : <p className="text-[14px] text-ink-3">Nothing in this section.</p>}
          </Part>
        ))}
      </Parts>
    </div>
  )
}

function JsonView({ s }: { s: JsonStruct }) {
  return (
    <div data-view="structured">
      {s.title ? <h3 className="font-display text-[21px] font-semibold text-ink">{s.title}</h3> : null}
      <Facts facts={s.facts} />
      <Parts heads={s.secs.map((x) => x.h)}>
        {s.secs.map((sec, j) => (
          <Part key={j} j={j} h={sec.h} flag={sec.flag}>
            <div className="md">{sec.kind === 'obj' ? <ObjView o={sec.value} /> : sec.kind === 'paras' ? <Paras t={sec.value} /> : <ValView v={sec.value} />}</div>
          </Part>
        ))}
      </Parts>
    </div>
  )
}

const PROSE = /^(content|text|body|description|notes?|summary|detail|details|answer|script|copy)$/i

function Paras({ t }: { t: unknown }) {
  const parts = txt(t)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return (
    <>
      {parts.map((p, i) =>
        /^([-*•]|\d+[.)])\s/m.test(p) ? (
          <Md key={i}>{p}</Md>
        ) : (
          <p key={i}>
            {p.split('\n').map((line, k) => (
              <Fragment key={k}>
                {k > 0 ? <br /> : null}
                <Md inline>{line}</Md>
              </Fragment>
            ))}
          </p>
        ),
      )}
    </>
  )
}

function ValView({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <p className="text-ink-3">Not provided.</p>
  if (typeof v !== 'object') return <Paras t={v} />
  if (Array.isArray(v)) {
    if (!v.length) return <p className="text-ink-3">None.</p>
    if (v.every((x) => x === null || typeof x !== 'object')) {
      return (
        <ul>
          {v.map((x, i) => (
            <li key={i}>
              <Md inline>{txt(x)}</Md>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <div className="space-y-2">
        {v.map((x, i) => (
          <div key={i} className="rounded-sm border border-line bg-sunk/60 px-3 py-2">
            <ObjView o={x} />
          </div>
        ))}
      </div>
    )
  }
  return <ObjView o={v} />
}

function ObjView({ o }: { o: unknown }) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return <ValView v={o} />
  const r = o as Record<string, unknown>
  const head = r.heading || r.title || r.name || r.question || r.label || ''
  const keys = Object.keys(r).filter((k) => !['heading', 'title', 'name', 'question', 'label', 'type'].includes(k))
  const headEl = head ? (
    <b className="block font-semibold text-ink">
      <Md inline>{txt(head)}</Md>
    </b>
  ) : null
  if (!head && keys.length === 1) return <ValView v={r[keys[0]]} />
  if (keys.length === 1 && PROSE.test(keys[0])) {
    return (
      <>
        {headEl}
        <ValView v={r[keys[0]]} />
      </>
    )
  }
  const simple = keys.filter((k) => {
    const v = r[k]
    return v !== null && v !== undefined && typeof v !== 'object' && String(v).length <= 140 && !PROSE.test(k)
  })
  const long = keys.filter((k) => !simple.includes(k))
  return (
    <>
      {headEl}
      {simple.length ? (
        <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1">
          {simple.map((k) => (
            <Fragment key={k}>
              <dt className="text-[13px] font-semibold text-ink-3">{humanize(k)}</dt>
              <dd className="min-w-0">
                <Md inline>{txt(r[k])}</Md>
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
      {long.map((k) => (
        <Fragment key={k}>
          {keys.length > 1 || head ? <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{humanize(k)}</div> : null}
          <ValView v={r[k]} />
        </Fragment>
      ))}
    </>
  )
}
