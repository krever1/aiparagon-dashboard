'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { askChange } from '@/app/(app)/lead-pipeline/doc-actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { LEGACY_DASHBOARD_URL } from '@/lib/config'

const btn = 'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:border-line-2'
const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary =
  'inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

/**
 * What should change? on a finished Catalyst document (v125, and v132's copy on the client proposal): the reason goes
 * to AI settings, where Make it a rule turns it into a house rule for the Catalyst agents. The count after the button
 * opens AI settings, which is still in the current dashboard.
 */
export function ChangeAsk({ leadId, agent, doc, name, count }: { leadId: string; agent: string; doc: string; name: string; count: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={btn}
        title="Say what should be different next time. On AI settings the reason can become a house rule the Catalyst agents follow."
        onClick={() => setOpen(true)}
      >
        What should change?
      </button>
      {count > 0 ? (
        <a
          href={LEGACY_DASHBOARD_URL + '/ai-settings'}
          title="See them on AI settings, under From your feedback"
          className="text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink-2"
          data-testid="asks"
        >
          {count === 1 ? '1 change asked' : count + ' changes asked'}
        </a>
      ) : null}
      {open ? <ChangeDialog leadId={leadId} agent={agent} doc={doc} name={name} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ChangeDialog({ leadId, agent, doc, name, onClose }: { leadId: string; agent: string; doc: string; name: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  // the window opens after this mounts (its effect runs first), so the box is focused once it is open
  useEffect(() => {
    box.current?.focus()
  }, [])

  const save = async () => {
    if (text.replace(/\s+/g, ' ').trim().length < 12) {
      setMsg({ text: 'Write a sentence or two, so it can become a rule.', bad: true })
      box.current?.focus()
      return
    }
    setBusy(true)
    setMsg({ text: 'Saving…' })
    let r: Awaited<ReturnType<typeof askChange>>
    try {
      r = await askChange({ leadId, agent, text })
    } catch {
      r = { ok: false, error: 'Could not reach the dashboard. Try again in a minute.' }
    }
    if (!r.ok) {
      setBusy(false)
      setMsg({ text: r.error, bad: true })
      return
    }
    onClose()
    toast(r.toast)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={'Catalyst · ' + name}
      title={`What should change in the ${doc}?`}
      width={560}
      footer={
        <>
          <span role="status" aria-live="polite" className={`mr-auto text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`} data-testid="change-msg">
            {msg?.text ?? ''}
          </span>
          <button type="button" onClick={onClose} className={ghost}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={save} className={primary}>
            <Check size={16} aria-hidden="true" />
            Save the reason
          </button>
        </>
      }
    >
      <label className="block" htmlFor="change-why">
        <span className="block text-[14px] font-semibold text-ink">Your reason</span>
        <small className="mb-1.5 block text-[13px] text-ink-3">
          Say what to add, cut or do differently next time. It shows on AI settings, where it can become a house rule that every Catalyst agent follows.
        </small>
      </label>
      <textarea
        id="change-why"
        rows={4}
        maxLength={600}
        ref={box}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none"
      />
    </Dialog>
  )
}
