'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MessageSquarePlus } from 'lucide-react'
import { resolveFeedback, saveFeedback } from '@/app/(app)/feedback/actions'
import { Dialog } from '@/components/ui/dialog'
import { dayText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type FbAnchor, byPage, fbKey, goHref, openRows, whoOf } from '@/lib/touchpoint/feedback'
import { feedbackState, loadNotes, setFeedbackOn, useFeedback } from './feedback-store'

// Feedback pinned to any part of a page (v144Fb*): Feedback in the top bar turns on feedback mode, where a click on any
// part of the page (a card, a button, a row) opens a box to say what should change there instead of running it. Each
// note is saved for the team in dashboard_comments, shows as a numbered pin on that spot while the mode is on, and is
// listed in All feedback (open first, by page) with Go to it and Resolve. Esc leaves the mode.

const btn = 'rounded-sm border border-line bg-panel px-2.5 py-1 text-[13px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const pri = 'rounded-sm bg-art-gold px-2.5 py-1 text-[13px] font-semibold text-action hover:brightness-95 disabled:opacity-60'

/** Clicks on the feedback's own parts, the top bar, a window or the messages are not about the page. */
const isUi = (el: Element | null) => !!el?.closest('[data-fb-ui],[data-topbar],dialog,[data-testid="toasts"]')
/** Something with meaning: a button, a link, a row, a card, a heading. */
const targetOf = (el: Element) => el.closest('button,a,[role=button],tr,li,article,section,label,h1,h2,h3,h4,p') ?? el
const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null

/** A short path to the element: from the nearest unique id (v144FbPath). */
function pathOf(el: Element): string {
  const parts: string[] = []
  let n: Element | null = el
  for (let d = 0; n && n !== document.body && d < 12; d++) {
    if (n.id && !/^\d/.test(n.id) && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) {
      parts.unshift('#' + CSS.escape(n.id))
      break
    }
    const p: Element | null = n.parentElement
    if (!p) break
    const tag = n.tagName
    const same = Array.from(p.children).filter((c) => c.tagName === tag)
    parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? ':nth-of-type(' + (same.indexOf(n) + 1) + ')' : ''))
    n = p
  }
  return parts.join('>')
}
/** What the element says (v144FbLabel). */
function labelOf(el: Element): string {
  const t = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  return t.slice(0, 90) || el.tagName.toLowerCase()
}
/** Where a note was left: its path when that still says the same, else something on the page that says it (v144FbFind). */
function findOf(a: FbAnchor): HTMLElement | null {
  let el: Element | null = null
  if (a.sel) {
    try {
      el = document.querySelector(a.sel)
    } catch {
      el = null
    }
  }
  const lab = String(a.label || '').slice(0, 40)
  if ((!visible(el) || (lab && labelOf(el).slice(0, 40) !== lab)) && lab) {
    el = Array.from(document.querySelectorAll('#main *')).find((x) => visible(x) && x.children.length < 40 && labelOf(x).slice(0, 40) === lab) ?? el
  }
  return visible(el) ? el : null
}

/** The top bar's Feedback button, with how many notes are open. */
export function FeedbackButton() {
  const fb = useFeedback()
  useEffect(() => {
    void loadNotes()
  }, [])
  const n = openRows(fb.rows ?? []).length
  return (
    <button
      type="button"
      aria-label="Feedback"
      aria-pressed={fb.on}
      title="Leave feedback on any part of the page"
      data-testid="feedback-btn"
      onClick={() => {
        const on = !feedbackState().on
        setFeedbackOn(on)
        if (on) void loadNotes(true)
      }}
      className={`relative ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border ${
        fb.on ? 'border-action bg-action text-action-ink' : 'border-line bg-panel text-ink-2 hover:border-accent hover:text-ink'
      }`}
    >
      <MessageSquarePlus size={18} aria-hidden="true" />
      {n ? (
        <span data-testid="feedback-count" className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[11px] font-semibold text-white">
          {n}
        </span>
      ) : null}
    </button>
  )
}

type Pin = { id: string; n: number; left: number; top: number; body: string; who: string }
type Draft = { x: number; y: number; anchor: FbAnchor }

/** Feedback mode: the bar, the pins, the boxes and All feedback. */
export function FeedbackLayer() {
  const fb = useFeedback()
  const pathname = usePathname()
  const sp = useSearchParams()
  const router = useRouter()
  const hydrated = useHydrated()
  const key = fbKey(pathname, fb.lead && fb.lead.path === pathname ? fb.lead.email : '')
  const keyRef = useRef(key)
  useEffect(() => {
    keyRef.current = key
  }, [key])
  const [pins, setPins] = useState<Pin[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [show, setShow] = useState<{ id: string; x: number; y: number } | null>(null)
  const [list, setList] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const boxOpen = useRef(false)
  useEffect(() => {
    boxOpen.current = !!(draft || show)
  }, [draft, show])

  const rows = fb.rows ?? []
  const here = openRows(rows, key)

  // the pins on this page, oldest first, placed again when the page changes or the window is resized
  const place = useCallback(() => {
    if (!feedbackState().on) return setPins([])
    const L = openRows(feedbackState().rows ?? [], keyRef.current).slice().reverse()
    const out: Pin[] = []
    L.forEach((r, i) => {
      const el = findOf(r.anchor)
      if (!el) return
      const b = el.getBoundingClientRect()
      const a = r.anchor
      out.push({
        id: r.id,
        n: i + 1,
        left: window.scrollX + b.left + Math.min(b.width - 12, Math.max(0, (a.x || 0) * b.width)) - 11,
        top: window.scrollY + b.top + Math.min(b.height - 12, Math.max(0, (a.y || 0) * b.height)) - 11,
        body: r.body,
        who: whoOf(r.author),
      })
    })
    setPins(out)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('fb-on', fb.on)
    if (!fb.on) {
      document.querySelectorAll('[data-fb-hl]').forEach((x) => x.removeAttribute('data-fb-hl'))
      const t = window.setTimeout(() => {
        setDraft(null)
        setShow(null)
        setPins([])
      }, 0)
      return () => window.clearTimeout(t)
    }
    let t = window.setTimeout(place, 60)
    const again = () => {
      window.clearTimeout(t)
      t = window.setTimeout(place, 250)
    }
    window.addEventListener('resize', again)
    const main = document.getElementById('main')
    const mo = main ? new MutationObserver(again) : null
    if (main && mo) mo.observe(main, { childList: true, subtree: true, characterData: true })
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', again)
      mo?.disconnect()
    }
  }, [fb.on, fb.rows, key, place])

  // in feedback mode a click opens a note on that spot instead of running it, and the spot under the pointer is outlined
  useEffect(() => {
    if (!fb.on) return
    const click = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t || isUi(t)) return
      e.preventDefault()
      e.stopPropagation()
      const el = targetOf(t)
      const r = el.getBoundingClientRect()
      const anchor: FbAnchor = {
        sel: pathOf(el),
        label: labelOf(el),
        x: r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0,
        y: r.height ? Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) : 0,
      }
      setShow(null)
      setText('')
      setErr('')
      setDraft({ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, anchor })
    }
    const over = (e: MouseEvent) => {
      document.querySelectorAll('[data-fb-hl]').forEach((x) => x.removeAttribute('data-fb-hl'))
      const t = e.target as Element | null
      if (!t || isUi(t)) return
      targetOf(t).setAttribute('data-fb-hl', '')
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || boxOpen.current || document.querySelector('dialog[open]')) return
      setFeedbackOn(false)
    }
    document.addEventListener('click', click, true)
    document.addEventListener('mouseover', over, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('click', click, true)
      document.removeEventListener('mouseover', over, true)
      document.removeEventListener('keydown', key)
    }
  }, [fb.on])

  // Go to it: ?fb=<note> turns the mode on at that note, then leaves the address (the address changing does not stop it)
  const asked = sp.get('fb')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!asked) return
    const u = new URL(window.location.href)
    u.searchParams.delete('fb')
    window.history.replaceState(null, '', u.pathname + u.search)
    setFeedbackOn(true)
    void loadNotes(true).then(() => {
      window.setTimeout(() => {
        if (!alive.current) return
        const r = (feedbackState().rows ?? []).find((x) => x.id === asked)
        if (!r) return
        const el = findOf(r.anchor)
        el?.scrollIntoView({ block: 'center' })
        window.setTimeout(() => {
          if (!alive.current) return
          place()
          const b = el?.getBoundingClientRect()
          setShow({ id: r.id, x: window.scrollX + (b?.left ?? 120), y: window.scrollY + (b?.bottom ?? 120) + 6 })
        }, 250)
      }, 400)
    })
  }, [asked, place])

  const save = async () => {
    const body = text.trim()
    if (body.length < 3) return setErr('Say what should change.')
    if (!draft) return
    setBusy(true)
    const r = await saveFeedback({ key, body, anchor: draft.anchor }).catch(() => ({ ok: false as const, error: 'the dashboard could not be reached' }))
    setBusy(false)
    if (!r.ok) return setErr('Could not save it: ' + r.error)
    setDraft(null)
    toast('Feedback saved for the team. It shows on Approvals too.')
    void loadNotes(true)
  }

  const resolve = async (id: string) => {
    setBusy(true)
    const r = await resolveFeedback(id).catch(() => ({ ok: false as const, error: 'the dashboard could not be reached' }))
    setBusy(false)
    if (!r.ok) return toast('Could not resolve that: ' + r.error, 'warn')
    setShow(null)
    toast('Resolved.')
    void loadNotes(true)
  }

  const go = (id: string, key: string) => {
    const p = feedbackState().places[key]
    setList(false)
    if (!p) return
    if (p.out) window.location.assign(p.href)
    else router.push(goHref(p, id))
  }

  if (!hydrated) return null
  const shown = show ? rows.find((r) => r.id === show.id) : null
  const left = (x: number) => Math.max(8, Math.min(x, window.scrollX + document.documentElement.clientWidth - 328))
  const open = byPage(rows)
  const done = rows.filter((r) => r.resolved).slice(0, 20)
  const item = (r: (typeof rows)[number]) => (
    <li key={r.id} className={`flex flex-wrap items-start justify-between gap-2.5 rounded-md border border-line px-2.5 py-2 ${r.resolved ? 'opacity-65' : ''}`} data-testid="fb-item">
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="text-[14px] font-semibold text-ink">{r.body}</b>
        <small className="text-[12px] text-ink-3">
          {[whoOf(r.author), dayText(r.created_at), r.anchor.label ? 'on “' + r.anchor.label.slice(0, 60) + '”' : ''].filter(Boolean).join(' · ')}
          {r.resolved ? ' · resolved' + (r.resolved_by ? ' by ' + r.resolved_by : '') : ''}
        </small>
      </div>
      {r.resolved ? null : (
        <span className="flex shrink-0 gap-1.5">
          <button type="button" className={btn} onClick={() => go(r.id, r.target_key)}>
            Go to it
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => void resolve(r.id)}>
            Resolve
          </button>
        </span>
      )}
    </li>
  )

  return (
    <>
      {fb.on
        ? createPortal(
            <div data-fb-ui="">
              <div
                role="status"
                data-testid="feedback-bar"
                className="fixed bottom-[18px] left-1/2 z-[45] flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-2.5 rounded-xl bg-action px-3 py-2.5 text-[13.5px] text-action-ink shadow-pop"
              >
                <b>Feedback mode</b>
                <span className="hidden opacity-90 sm:inline">
                  Click any part of the page to say what should change there.{here.length ? ' ' + here.length + ' open here.' : ''}
                </span>
                <button type="button" className={btn} onClick={() => setList(true)}>
                  All feedback ({openRows(rows).length})
                </button>
                <button type="button" className={pri} onClick={() => setFeedbackOn(false)}>
                  Done
                </button>
              </div>
              {pins.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid="fb-pin"
                  data-id={p.id}
                  title={p.who + ': ' + p.body}
                  aria-label={'Feedback ' + p.n + ': ' + p.body}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDraft(null)
                    setShow({ id: p.id, x: p.left, y: p.top + 28 })
                  }}
                  style={{ left: p.left, top: p.top }}
                  className="absolute z-[44] grid h-[22px] w-[22px] place-items-center rounded-[50%_50%_50%_0] border-2 border-white bg-art-gold p-0 text-[11px] font-bold text-action shadow"
                >
                  {p.n}
                </button>
              ))}
              {draft ? (
                <div
                  role="dialog"
                  aria-label="Leave feedback"
                  style={{ left: left(draft.x), top: draft.y + 10 }}
                  className="absolute z-[46] w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-panel p-3 shadow-pop"
                >
                  <div className="mb-2 flex flex-col gap-0.5">
                    <b className="text-[14px] text-ink">Feedback on this</b>
                    <small className="truncate text-[12px] text-ink-3">{draft.anchor.label}</small>
                  </div>
                  <textarea
                    autoFocus
                    rows={4}
                    maxLength={1500}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setDraft(null)
                      }
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
                    }}
                    placeholder="What should change here?"
                    aria-label="What should change here?"
                    className="w-full resize-y rounded-md border border-line-2 p-2 text-[14px] text-ink focus:border-accent focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 text-[12.5px] text-bad" data-testid="fb-err">
                      {err}
                    </span>
                    <button type="button" className={btn} onClick={() => setDraft(null)}>
                      Cancel
                    </button>
                    <button type="button" className={btn + ' !bg-action !text-action-ink'} disabled={busy} onClick={() => void save()}>
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : null}
              {shown && show ? (
                <div
                  role="dialog"
                  aria-label="Feedback"
                  style={{ left: left(show.x), top: show.y }}
                  className="absolute z-[46] w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-panel p-3 shadow-pop"
                  data-testid="fb-show"
                >
                  <div className="mb-2 flex flex-col gap-0.5">
                    <b className="text-[14px] text-ink">{whoOf(shown.author)}</b>
                    <small className="truncate text-[12px] text-ink-3">{dayText(shown.created_at) + ' · ' + (shown.anchor.label || '')}</small>
                  </div>
                  <p className="mb-2 whitespace-pre-wrap text-[14px] text-ink">{shown.body}</p>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" className={btn} onClick={() => setShow(null)}>
                      Close
                    </button>
                    <button type="button" className={btn + ' !bg-action !text-action-ink'} disabled={busy} onClick={() => void resolve(shown.id)}>
                      {busy ? 'Resolving…' : 'Resolve'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      {list ? (
        <Dialog open onClose={() => setList(false)} kicker="Feedback" title="All feedback" width={680}>
          {open.length ? (
            open.map((g) => (
              <section key={g.key} className="mb-3" data-testid="fb-group">
                <h3 className="mb-1.5 text-[14px] font-semibold text-ink">
                  {fb.places[g.key]?.where ?? g.key} <small className="font-normal text-ink-3">{g.rows.length} open</small>
                </h3>
                <ul className="grid gap-1.5">{g.rows.map(item)}</ul>
              </section>
            ))
          ) : (
            <p className="text-[14px] text-ink-3">No open feedback. Turn on Feedback in the top bar and click any part of a page to leave some.</p>
          )}
          {done.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[13px] text-ink-3">Resolved ({done.length})</summary>
              <ul className="mt-2 grid gap-1.5">{done.map(item)}</ul>
            </details>
          ) : null}
        </Dialog>
      ) : null}
    </>
  )
}
