'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { approveReply, rejectReply } from '@/app/(app)/approvals/actions'
import { Dialog } from '@/components/ui/dialog'
import { dayText } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { type ReplyRow, WHY, clip, platformLabel, safeUrl, whyText } from '@/lib/touchpoint/approvals'

// A reply the Intel Tracker drafted, in its window (nwReplyOpen), and why it is rejected (v127Why). Approvals and the
// Intel Tracker both open them.

const btn =
  'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-2.5 py-1.5 text-[13px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const ghost = 'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-60'
const primary =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-2.5 py-1.5 text-[13px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

/** "Reply to Northwind Advisors", "Quote post on Sample Peak Partners". */
export const replyTitle = (r: Pick<ReplyRow, 'action' | 'competitor'>) => (r.action === 'quote_post' ? 'Quote post on ' : 'Reply to ') + (r.competitor || 'a post')

/** A reply in full, editable before it is approved (nwReplyOpen). */
export function ReplyWindow({
  reply: r,
  onClose,
  onReject,
  onApproved,
}: {
  reply: ReplyRow
  onClose: () => void
  onReject: () => void
  onApproved: (done: string[]) => void
}) {
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
      title={replyTitle(r)}
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
export function WhyWindow({ reply, onClose }: { reply: ReplyRow; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  // the window opens after this mounts, so the first reason gets the focus once it is open
  useEffect(() => {
    first.current?.focus()
  }, [])
  const who = reply.competitor

  const reject = async () => {
    setBusy(true)
    const reason = whyText(picked, note)
    const r = await rejectReply(reply.id, reason).catch(() => ({ ok: false as const, error: 'Could not save that: the dashboard could not be reached' }))
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
