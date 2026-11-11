'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Clock, Copy, Eye, MessageSquare, PenLine, Repeat2 } from 'lucide-react'
import { approveItems, approveReply, rejectReply, undoItems } from '@/app/(app)/approvals/actions'
import { ItemIcon } from '@/components/approvals/item-icon'
import { addSkips, removeSkips, useSkips } from '@/components/approvals/skips'
import { ErrorNotice } from '@/components/catalyst/bits'
import { Dialog } from '@/components/ui/dialog'
import { LocalDay, dayText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import {
  type Item, type TabKey, PAGE, WHY, clip, kindLabel, platformLabel, safeUrl, tabFromWord, viewOf, whyText, wordOf,
} from '@/lib/touchpoint/approvals'
import type { ApprovalsData } from '@/lib/touchpoint/approvals-load'

// Approvals (nwApprovalsHtml): one list of everything waiting for a person. Select several and approve them together,
// open a reply to change it first, skip what can wait (in this browser), and undo from the message that confirms.
// The tab is the address's (?tab=replies), so Today's chips can open one.

const btn =
  'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-2.5 py-1.5 text-[13px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const ghost = 'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-60'
const primary =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-2.5 py-1.5 text-[13px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

/** What the message says once they are done: comments are resolved, the rest approved (nwApprove). */
function doneText(done: string[]): string {
  const n = done.length
  if (done.every((k) => k.startsWith('cmt:'))) return n === 1 ? 'Comment resolved' : n + ' comments resolved'
  return n === 1 ? 'Approved' : 'Approved ' + n
}

/** The tab in the address (?tab=replies), without a new history entry. */
function writeTab(t: TabKey) {
  const u = new URL(window.location.href)
  const w = wordOf(t)
  if (w) u.searchParams.set('tab', w)
  else u.searchParams.delete('tab')
  window.history.replaceState(null, '', u.pathname + u.search)
}

export function ApprovalsView({ data }: { data: ApprovalsData }) {
  const sp = useSearchParams()
  const skips = useSkips()
  const asked = tabFromWord(sp.get('tab'))
  const [more, setMore] = useState<{ tab: TabKey; n: number }>({ tab: asked, n: PAGE })
  const view = viewOf(data.items, skips, asked, more.tab === asked ? more.n : PAGE)
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [replyKey, setReplyKey] = useState<string | null>(null)
  // Today's Next up opens a reply here (?review=reply:<id>), once
  const [reviewed, setReviewed] = useState(false)
  const askedReview = reviewed ? null : sp.get('review')
  const [whyFor, setWhyFor] = useState<Item | null>(null)

  // the selection only keeps rows that are still here and can be approved
  const approvable = new Set(data.items.filter((x) => x.approve && !skips[x.key]).map((x) => x.key))
  const selected = [...sel].filter((k) => approvable.has(k))
  const selectable = view.tab !== 'skipped'

  const setTab = (t: TabKey) => {
    writeTab(t)
    setSel(new Set())
    setMore({ tab: t, n: PAGE })
  }

  // a tab left with nothing in it shows All, and All becomes the choice (as V107D.filter does), so a later skip or
  // undo does not jump back to it. Only once this browser's skips are read: before that, Skipped always looks empty.
  const hydrated = useHydrated()
  useEffect(() => {
    if (hydrated && view.tab !== asked) writeTab(view.tab)
  }, [hydrated, view.tab, asked])

  const drop = (keys: string[]) =>
    setSel((s) => {
      const n = new Set(s)
      for (const k of keys) n.delete(k)
      return n
    })

  const undo = async (keys: string[]) => {
    const r = await undoItems(keys).catch(() => ({ ok: false as const, error: 'the dashboard could not be reached' }))
    if (!r.ok) return toast('Could not undo that: ' + r.error, 'warn')
    toast('Undone. ' + (keys.length === 1 ? 'It is' : 'They are') + ' waiting again.')
  }

  const approve = async (keys: string[]) => {
    if (!keys.length) return
    setBusy(true)
    const r = await approveItems(keys).catch(() => ({ ok: false as const, done: [] as string[], error: 'the dashboard could not be reached' }))
    setBusy(false)
    drop(keys)
    if (!r.ok) toast('Could not approve that: ' + r.error, 'warn')
    if (r.done.length) toast(doneText(r.done), 'ok', { label: 'Undo', run: () => void undo(r.done) })
  }

  const unskip = (keys: string[]) => removeSkips(keys)
  const skip = (keys: string[]) => {
    if (!keys.length) return
    addSkips(keys)
    drop(keys)
    toast(keys.length === 1 ? 'Skipped for now' : 'Skipped ' + keys.length, 'ok', { label: 'Undo', run: () => unskip(keys) })
  }

  const toggle = (k: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const canSel = view.rows.filter((x) => x.approve).map((x) => x.key)
  const allOn = canSel.length > 0 && canSel.every((k) => sel.has(k))
  const selAll = () =>
    setSel((s) => {
      const n = new Set(s)
      for (const k of canSel) {
        if (allOn) n.delete(k)
        else n.add(k)
      }
      return n
    })

  const openKey = replyKey ?? askedReview
  const replyItem = openKey ? data.items.find((x) => x.key === openKey && x.reply) : null
  const closeReply = () => {
    setReplyKey(null)
    setReviewed(true)
    if (sp.get('review')) {
      const u = new URL(window.location.href)
      u.searchParams.delete('review')
      window.history.replaceState(null, '', u.pathname + u.search)
    }
  }

  const row = (x: Item, selectable: boolean) => (
    <Row
      key={x.key}
      item={x}
      selectable={selectable}
      on={sel.has(x.key)}
      skipped={!!skips[x.key]}
      busy={busy}
      onToggle={() => toggle(x.key)}
      onSkip={() => skip([x.key])}
      onUnskip={() => unskip([x.key])}
      onReview={() => setReplyKey(x.key)}
      onApprove={() => approve([x.key])}
    />
  )

  return (
    <div data-testid="approvals">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="approvals-status">
        <span className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${view.waiting ? 'bg-warn' : 'bg-good'}`} />
          {view.waiting ? view.waiting + ' waiting' : 'Nothing waiting'}
        </span>
        <span className="text-[14px] text-ink-2">Nothing posts or goes live until you approve it</span>
        <ul className="flex flex-wrap gap-1.5" aria-label="What you can do here">
          {(
            [
              [Check, 'Approve in bulk', 'Select several and approve them together'],
              [PenLine, 'Edit before approving', 'Open a reply or draft to change it first'],
              [Repeat2, 'Undo anytime', 'Every approval can be undone from the message that confirms it'],
            ] as const
          ).map(([I, label, tip]) => (
            <li key={label} title={tip} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12.5px] text-ink-2">
              <I size={13} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {data.error ? <ErrorNotice>Could not read everything waiting: {data.error}</ErrorNotice> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-1.5">
          {view.tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={view.tab === t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13.5px] font-semibold ${
                view.tab === t.key ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'
              }`}
            >
              {t.label} <span className="text-[12px] font-normal opacity-75">{t.n}</span>
            </button>
          ))}
        </div>
        {selectable && canSel.length ? (
          <button type="button" aria-pressed={allOn} onClick={selAll} className={ghost + ' ml-auto'}>
            <Box on={allOn} />
            Select all
          </button>
        ) : null}
      </div>

      {view.rows.length ? (
        <div className="overflow-hidden rounded-lg border border-line bg-panel shadow-card" data-testid="approval-list">
          {view.rows.map((x) => row(x, selectable))}
          {view.replyMore ? (
            <button
              type="button"
              onClick={() => setTab('reply')}
              className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-[14px] font-semibold text-accent-text hover:bg-sunk/60"
            >
              <MessageSquare size={18} aria-hidden="true" />
              <span className="grow">{kindLabel('reply', view.replyMore)} more from the Intel Tracker</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : null}
          {view.total > view.rows.length ? (
            <button
              type="button"
              onClick={() => setMore({ tab: view.tab, n: view.rows.length + PAGE })}
              className="flex w-full items-center justify-center gap-2 border-t border-line px-4 py-3 text-[14px] font-semibold text-ink-2 hover:bg-sunk/60"
            >
              Show {Math.min(PAGE, view.total - view.rows.length)} more of {view.total}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid justify-items-center gap-1.5 rounded-lg border border-line bg-panel px-6 py-10 text-center shadow-card" data-testid="approvals-empty">
          <CheckCircle2 size={28} aria-hidden="true" className="text-good" />
          <b className="text-[16px] font-semibold text-ink">{view.tab === 'all' ? 'You are all caught up' : 'Nothing here'}</b>
          <p className="text-[14px] text-ink-2">
            {view.tab === 'all' ? 'New briefs, ads and replies land here when the agents finish.' : 'Pick another filter to see the rest.'}
          </p>
        </div>
      )}

      {view.old.length ? (
        <details className="group mt-4 rounded-lg border border-line bg-panel shadow-card" data-testid="older">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14px] font-semibold text-ink">
            <Clock size={17} aria-hidden="true" className="text-ink-3" />
            Older than a week{' '}
            <span className="text-[12px] font-normal text-ink-3">{view.old.length}</span>
            <ChevronDown size={16} aria-hidden="true" className="ml-auto text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-4 pb-2 text-[13px] text-ink-3">The posts these reply to are more than a week old, so they are left out of the count.</p>
          <div>{view.old.slice(0, 40).map((x) => row(x, true))}</div>
        </details>
      ) : null}

      {selected.length ? (
        <div
          role="region"
          aria-label="Selection"
          className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 shadow-pop"
          data-testid="bulk"
        >
          <b className="mr-auto text-[14px] font-semibold text-ink">{selected.length} selected</b>
          <button type="button" className={ghost} onClick={() => setSel(new Set())}>
            Clear
          </button>
          <button type="button" className={btn} onClick={() => skip(selected)}>
            Skip
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => approve(selected)}>
            <Check size={16} aria-hidden="true" />
            Approve {selected.length}
          </button>
        </div>
      ) : null}

      {replyItem ? (
        <ReplyWindow
          item={replyItem}
          onClose={closeReply}
          onReject={() => {
            closeReply()
            setWhyFor(replyItem)
          }}
          onApproved={(done) => {
            closeReply()
            drop(done)
            toast('Approved', 'ok', { label: 'Undo', run: () => void undo(done) })
          }}
        />
      ) : null}
      {whyFor ? <WhyWindow item={whyFor} onClose={() => setWhyFor(null)} /> : null}
    </div>
  )
}

function Box({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border ${on ? 'border-action bg-action text-action-ink' : 'border-line-2 bg-panel text-transparent'}`}
    >
      <Check size={13} strokeWidth={2.6} />
    </span>
  )
}

function Row({
  item: x,
  selectable,
  on,
  skipped,
  busy,
  onToggle,
  onSkip,
  onUnskip,
  onReview,
  onApprove,
}: {
  item: Item
  selectable: boolean
  on: boolean
  skipped: boolean
  busy: boolean
  onToggle: () => void
  onSkip: () => void
  onUnskip: () => void
  onReview: () => void
  onApprove: () => void
}) {
  const review = x.review
  return (
    <div
      data-testid="approval"
      data-key={x.key}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0 ${on ? 'bg-accent-soft/50' : ''}`}
    >
      {selectable ? (
        x.approve ? (
          <button type="button" role="checkbox" aria-checked={on} aria-label={'Select ' + x.title} onClick={onToggle} className="shrink-0">
            <Box on={on} />
          </button>
        ) : (
          <span aria-hidden="true" className="w-[18px] shrink-0" />
        )
      ) : null}
      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-sunk text-ink-2">
        {x.img ? (
          // eslint-disable-next-line @next/next/no-img-element -- an ad's image, from wherever the campaign kept it
          <img src={x.img} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <ItemIcon icon={x.icon} />
        )}
      </span>
      <div className="min-w-0 flex-[1_1_240px]">
        <b className="block text-[14.5px] font-semibold text-ink">
          {x.title}
          {x.titleDay ? (
            <>
              {' · '}
              <LocalDay iso={x.titleDay} />
            </>
          ) : null}
        </b>
        {x.text ? (
          <span className="block truncate text-[13.5px] text-ink-2" title={clip(x.text, 400)}>
            {x.text}
          </span>
        ) : null}
        {x.tags.length ? (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {x.tags.map((t, i) => (
              <span
                key={i}
                className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${
                  'tone' in t && t.tone === 'bad'
                    ? 'bg-bad-soft text-bad'
                    : 'tone' in t && t.tone === 'warn'
                      ? 'bg-warn-soft text-warn'
                      : 'bg-sunk text-ink-2'
                }`}
              >
                {'day' in t ? (
                  <>
                    {t.before}
                    <LocalDay iso={t.day} />
                  </>
                ) : (
                  t.text
                )}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
        {skipped ? (
          <button type="button" className={ghost} onClick={onUnskip}>
            Bring back
          </button>
        ) : (
          <button type="button" className={ghost} onClick={onSkip}>
            Skip
          </button>
        )}
        {review.kind === 'reply' ? (
          <button type="button" className={btn} onClick={onReview}>
            <Eye size={16} aria-hidden="true" />
            Review
          </button>
        ) : review.out ? (
          <a href={review.href} className={btn} title="Opens in the current dashboard">
            {review.label ? <ArrowRight size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            {review.label ?? 'Review'}
          </a>
        ) : (
          <Link href={review.href} className={btn}>
            {review.label ? <ArrowRight size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            {review.label ?? 'Review'}
          </Link>
        )}
        {x.approve ? (
          <button type="button" className={primary} disabled={busy} onClick={onApprove}>
            <Check size={16} aria-hidden="true" />
            {x.approveLabel ?? 'Approve'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** A reply in full, editable before it is approved (nwReplyOpen). */
function ReplyWindow({
  item,
  onClose,
  onReject,
  onApproved,
}: {
  item: Item
  onClose: () => void
  onReject: () => void
  onApproved: (done: string[]) => void
}) {
  const r = item.reply!
  const quote = r.action === 'quote_post'
  const [text, setText] = useState(r.draft)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const url = safeUrl(r.sourceUrl)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied')
    } catch {
      box.current?.select()
    }
  }
  const approve = async () => {
    setBusy(true)
    const res = await approveReply(r.id, text).catch(() => ({ ok: false as const, done: [] as string[], error: 'Could not approve that: the dashboard could not be reached' }))
    setBusy(false)
    if (!res.ok) return toast(res.error, 'warn')
    onApproved(res.done)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={[quote ? 'Quote post' : 'Reply', platformLabel(r.platform), dayText(r.createdAt)].filter(Boolean).join(' · ')}
      title={item.title}
      width={640}
      footer={
        <>
          <button type="button" className={ghost + ' mr-auto'} onClick={onReject}>
            Reject
          </button>
          <button type="button" className={btn} onClick={copy}>
            <Copy size={16} aria-hidden="true" />
            Copy
          </button>
          <button type="button" className={primary} disabled={busy} onClick={approve}>
            <Check size={16} aria-hidden="true" />
            Approve
          </button>
        </>
      }
    >
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mb-3 inline-flex items-center gap-1 text-[14px] font-semibold text-accent-text hover:underline">
          Open the post it answers
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-[13.5px] font-semibold text-ink-2">
          The drafted {quote ? 'quote post' : 'reply'} <small className="font-normal text-ink-3">edit it before you approve</small>
        </span>
        <textarea
          ref={box}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none"
        />
      </label>
      <p className="mt-2 text-[13px] text-ink-3">Approving does not post it. You copy it and post it yourself.</p>
    </Dialog>
  )
}

/** Why reject this reply? (v127Why): Cancel, the X, Esc or a click outside keep the reply. */
function WhyWindow({ item, onClose }: { item: Item; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  // the window opens after this mounts, so the first reason gets the focus once it is open
  useEffect(() => {
    first.current?.focus()
  }, [])
  const who = item.reply?.competitor ?? ''

  const reject = async () => {
    setBusy(true)
    const reason = whyText(picked, note)
    const r = await rejectReply(item.reply!.id, reason).catch(() => ({ ok: false as const, error: 'Could not save that: the dashboard could not be reached' }))
    setBusy(false)
    if (!r.ok) return toast(r.error, 'warn')
    onClose()
    toast(reason ? 'Rejected. The reason is on AI settings, where it can become a rule the tracker follows.' : 'Rejected.')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={'Intel Tracker' + (who ? ' · reply to ' + clip(who, 40) : '')}
      title="Why reject this reply?"
      width={540}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy} onClick={reject}>
            Reject
          </button>
        </>
      }
    >
      <p id="why-lbl" className="mb-2 text-[14px] font-semibold text-ink">
        What was off?
      </p>
      <div role="group" aria-labelledby="why-lbl" className="mb-4 flex flex-wrap gap-1.5">
        {WHY.map(([k, label], i) => {
          const on = picked.includes(k)
          return (
            <button
              key={k}
              ref={i === 0 ? first : undefined}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== k) : [...p, k]))}
              className={`rounded-full border px-3 py-1 text-[13.5px] font-semibold ${on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <label className="block" htmlFor="why-note">
        <span className="block text-[14px] font-semibold text-ink">
          Anything to add? <small className="font-normal text-ink-3">Optional.</small>
        </span>
      </label>
      <textarea
        id="why-note"
        rows={3}
        maxLength={400}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Skip posts about a client loss"
        className="mt-1 w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none"
      />
      <p className="mt-2 text-[13px] text-ink-3">The reason shows on AI settings, where it can become a rule the tracker follows. Leave it empty to reject without one.</p>
    </Dialog>
  )
}
