'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { saveProposal } from '@/app/(app)/lead-pipeline/doc-actions'
import { dateText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { INK, TXT, inkOf } from '@/lib/catalyst/charts'
import {
  type Brand, type DocEdits, type Inline, type ProposalView, KICKER, brandVars, chartsBySection, fontLinks, logoOf, mdBlocks, srcLabels,
} from '@/lib/catalyst/proposal'
import { ChartFigure } from './chart'
import { lineOf, toMd } from './proposal-dom'

const btn = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2'
const primary =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-3 py-1.5 text-[13.5px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

/** The print window's own rules: letter pages with no margin of their own, a page per cover and body. */
const PRINT_CSS =
  '@page{size:letter;margin:0}html,body{margin:0;background:#fff}' +
  '.prop-doc{background:none;padding:0;gap:0;display:block;border-radius:0}' +
  '.prop-page{box-shadow:none;border-radius:0;max-width:none;width:auto;break-after:page;padding:.9in .85in}' +
  '.prop-cover{min-height:11in;padding-top:1in}.prop-sec{break-inside:avoid-page}'

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "Nov 4" in the viewer's own time zone (UTC while the server draws the page), for the chips' call date. */
function useDay(): (iso: string) => string {
  const hydrated = useHydrated()
  return (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: hydrated ? undefined : 'UTC' })
  }
}

/** The brand's fonts from Google Fonts, added to the page once (v132Fonts). */
function useBrandFonts(brand: Brand) {
  const urls = fontLinks(brand)
    .flatMap((f) => f.urls)
    .join('\n')
  useEffect(() => {
    for (const u of urls.split('\n').filter(Boolean)) {
      if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => (l as HTMLLinkElement).href === u)) continue
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.href = u
      l.dataset.brandFont = '1'
      document.head.appendChild(l)
    }
  }, [urls])
}

function Inl({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.k === 'text' ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : p.k === 'strong' ? (
          <strong key={i}>
            <Inl parts={p.kids} />
          </strong>
        ) : p.k === 'em' ? (
          <em key={i}>
            <Inl parts={p.kids} />
          </em>
        ) : (
          <span key={i} className="prop-fill">
            <Inl parts={p.kids} />
          </span>
        ),
      )}
    </>
  )
}

function Body({ md }: { md: string }) {
  return (
    <>
      {mdBlocks(md).map((b, i) =>
        b.k === 'h' ? (
          <h3 key={i}>
            <Inl parts={b.kids} />
          </h3>
        ) : b.k === 'p' ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                <Inl parts={l} />
              </Fragment>
            ))}
          </p>
        ) : b.k === 'ul' ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Inl parts={it} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Inl parts={it} />
              </li>
            ))}
          </ol>
        ),
      )}
    </>
  )
}

/**
 * The proposal as the client sees it (v132DocHtml): a cover in the template's logo, colors and fonts, then each
 * section numbered, with chips saying where it came from, [FILL IN] and [TO CONFIRM] marked, and its charts.
 */
export function ProposalPages({ view }: { view: ProposalView }) {
  const day = useDay()
  const doc = view.doc
  const firm = doc.prepared_by || ''
  const logo = logoOf(view.brand)
  const kicker = doc.kicker || KICKER
  const charts = chartsBySection(doc)
  const c = view.brand.colors || {}
  const col = inkOf(c.primary, INK)
  const ink = inkOf(c.text, TXT)
  return (
    <div className="prop-doc" style={brandVars(view.brand) as React.CSSProperties} data-testid="proposal-doc">
      <div className="prop-page prop-cover">
        {/* eslint-disable-next-line @next/next/no-img-element -- the template's logo, from wherever Templates kept it */}
        {logo ? <img className="lg" alt={firm || 'Logo'} src={logo} /> : firm ? <div className="firm">{firm}</div> : null}
        <div className="kick">{kicker}</div>
        <h1 className="cv-t">{doc.title || 'Proposal'}</h1>
        {doc.subtitle ? <p className="sub cv-s">{doc.subtitle}</p> : null}
        <div className="rule" />
        <div className="meta">
          {doc.prepared_for ? (
            <>
              <b>Prepared for</b>
              <span>{doc.prepared_for}</span>
            </>
          ) : null}
          {firm ? (
            <>
              <b>Prepared by</b>
              <span>{firm}</span>
            </>
          ) : null}
          {doc.date ? (
            <>
              <b>Date</b>
              <span>{doc.date}</span>
            </>
          ) : null}
        </div>
        <div className="foot">{doc.note || 'Confidential. Prepared for ' + (doc.client || 'the client') + '.'}</div>
        <div className="band" />
      </div>
      <div className="prop-page prop-body">
        {doc.sections.map((s, i) => {
          const chips = srcLabels(s.sources, view.call, day)
          return (
            <section key={i} className="prop-sec" data-i={i}>
              <div className="hd">
                <span className="no">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="t">{s.title}</h2>
              </div>
              {chips.length ? (
                <div className="src">
                  {chips.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              ) : null}
              <div className="bd">
                <Body md={s.body} />
              </div>
              {(charts.get(i) ?? []).map((ch, k) => (
                <ChartFigure key={k} chart={ch} color={col} ink={ink} />
              ))}
            </section>
          )
        })}
        <div className="prop-pfoot">
          <span>{firm}</span>
          <span>
            {kicker}
            {doc.client ? ' · ' + doc.client : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Save as PDF (v132Print): the saved proposal alone in a new window, with the page's styles and the brand's fonts,
 * printed once its fonts are in (or after 4 seconds). Unsaved edits are not printed. Tests set window.__apPrint to
 * look at the window instead of printing it.
 */
export function printProposal(view: ProposalView) {
  const w = window.open('', '_blank')
  if (!w) {
    toast('Allow pop-ups for this site to save the PDF.', 'warn')
    return
  }
  const doc = view.doc
  const title = (doc.kicker || 'Proposal') + (doc.client ? ' · ' + doc.client : '')
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((n) => (n.tagName === 'LINK' ? `<link rel="stylesheet" href="${escHtml((n as HTMLLinkElement).href)}">` : `<style>${n.textContent ?? ''}</style>`))
    .join('')
  const fonts = fontLinks(view.brand)
    .flatMap((f) => f.urls)
    .map((u) => `<link rel="stylesheet" href="${escHtml(u)}">`)
    .join('')
  w.document.open()
  w.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>${fonts}${styles}<style>${PRINT_CSS}</style></head><body><div id="print-root"></div></body></html>`,
  )
  w.document.close()
  const root = createRoot(w.document.getElementById('print-root')!)
  flushSync(() => root.render(<ProposalPages view={view} />))
  let done = false
  const go = () => {
    if (done) return
    done = true
    try {
      const hook = (window as unknown as { __apPrint?: (w: Window) => void }).__apPrint
      if (hook) hook(w)
      else {
        w.focus()
        w.print()
      }
    } catch {
      // a closed window prints nothing
    }
  }
  try {
    ;(w.document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(go, 350))
  } catch {
    // no font loading in this browser
  }
  setTimeout(go, 4000)
}

/**
 * Read here, open: the toolbar (✎ Edit, Save as PDF; while editing, Save changes and Cancel) and the document. Editing
 * makes the title, the subtitle and every section's heading and text editable in place; Save reads them back as
 * markdown and the server applies them to the saved document. The document is drawn once and left alone while it is
 * edited (React never redraws text a teammate is changing); Cancel or a save draws it afresh.
 */
export function ProposalDocument({ view }: { view: ProposalView }) {
  const [busy, setBusy] = useState(false)
  const [gen, setGen] = useState(0)
  // a new version (a save, a teammate's save, a new proposal) draws the document afresh and ends editing
  const docKey = [view.id, view.createdAt ?? '', view.edited?.at ?? '', gen].join('|')
  const [editKey, setEditKey] = useState<string | null>(null)
  const edit = editKey === docKey
  const box = useRef<HTMLDivElement>(null)
  const hydrated = useHydrated()
  useBrandFonts(view.brand)
  const pages = useMemo(() => <ProposalPages key={docKey} view={view} />, [view, docKey])

  const editedNote = view.edited
    ? `Edited ${dateText(view.edited.at, hydrated ? undefined : 'UTC')} by ${view.edited.by.split('@')[0]}. Save as PDF prints this version.`
    : 'Change anything in place. Save as PDF prints what you see.'

  const start = () => {
    const doc = box.current?.querySelector('.prop-doc')
    if (!doc) return
    doc.classList.add('edit')
    doc.querySelectorAll('.prop-sec .t, .prop-sec .bd, .cv-t, .cv-s').forEach((el) => {
      el.setAttribute('contenteditable', 'true')
      ;(el as HTMLElement).spellcheck = true
    })
    setEditKey(docKey)
  }
  const stop = () => {
    setEditKey(null)
    setGen((g) => g + 1)
  }
  const save = async () => {
    const doc = box.current?.querySelector('.prop-doc')
    if (!doc) return
    const sections: DocEdits['sections'] = view.doc.sections.map((s) => ({ title: s.title, body: s.body }))
    doc.querySelectorAll('.prop-sec').forEach((sec) => {
      const i = Number((sec as HTMLElement).dataset.i)
      if (sections[i]) sections[i] = { title: lineOf(sec.querySelector('.t')), body: toMd(sec.querySelector('.bd')) }
    })
    const edits: DocEdits = {
      title: lineOf(doc.querySelector('.cv-t')),
      subtitle: doc.querySelector('.cv-s') ? lineOf(doc.querySelector('.cv-s')) : null,
      sections,
    }
    setBusy(true)
    let r: Awaited<ReturnType<typeof saveProposal>>
    try {
      r = await saveProposal({ id: view.id, edits })
    } catch {
      r = { ok: false, error: 'Could not save it: the dashboard could not be reached. Try again in a minute.' }
    }
    setBusy(false)
    if (!r.ok) {
      toast(r.error, 'warn')
      return
    }
    stop()
    toast(r.toast)
  }

  return (
    <div className="mt-3" ref={box}>
      <div className="sticky top-14 z-[6] mb-3 flex flex-wrap items-center gap-2 border-b border-line bg-panel py-2.5" data-testid="proposal-bar">
        {edit ? (
          <>
            <button type="button" className={primary} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className={btn} disabled={busy} onClick={stop}>
              Cancel
            </button>
            <span className="text-[13px] text-ink-3">Click any heading or paragraph to change it.</span>
          </>
        ) : (
          <>
            <button type="button" className={btn} onClick={start}>
              ✎ Edit
            </button>
            <button type="button" className={btn} onClick={() => printProposal(view)}>
              Save as PDF
            </button>
            <span className="text-[13px] text-ink-3">{editedNote}</span>
          </>
        )}
      </div>
      {pages}
    </div>
  )
}
