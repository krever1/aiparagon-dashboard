'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { ReadsResult } from '@/app/(app)/lead-pipeline/actions'
import { answerCrm, crmReads } from '@/app/(app)/today/actions'
import { ReadsBox } from '@/components/catalyst/reads-box'
import { Dialog } from '@/components/ui/dialog'
import { LocalUsDay } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import type { CrmItem } from '@/lib/catalyst/inbox'
import type { Stage } from '@/lib/catalyst/stages'

// A new client from HubSpot (v137AskCrm): set aside, added to the Lead pipeline, or added and the pre-meeting prospect
// brief run for them. Only that runs, and nothing goes to the client.

const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary =
  'inline-flex items-center gap-2 rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

export function CrmQuestion({ item, research, onClose }: { item: CrmItem; research: Stage; onClose: () => void }) {
  const [reads, setReads] = useState<ReadsResult | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const who = [item.name, item.title, item.company].filter(Boolean).join(', ')

  useEffect(() => {
    let live = true
    crmReads(item.email, item.raw)
      .then((r) => live && setReads(r))
      .catch(() => live && setReads({ ok: false, error: '' }))
    return () => {
      live = false
    }
  }, [item.email, item.raw])

  const go = async (action: 'skip' | 'add' | 'run') => {
    setBusy(true)
    setMsg({ text: action === 'skip' ? 'Setting it aside…' : action === 'run' ? `Adding ${item.name} and starting…` : `Adding ${item.name}…` })
    const r = await answerCrm({ email: item.email, raw: item.raw, action }).catch(() => ({
      ok: false as const,
      error: 'Could not reach the dashboard. Try again in a minute.',
    }))
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
      kicker="Catalyst · New client from HubSpot"
      title={`Run the pre-meeting prospect brief for ${item.name}?`}
      width={640}
      footer={
        <>
          <button type="button" className={ghost} disabled={busy} onClick={() => go('skip')}>
            Not a client
          </button>
          <span className="flex-1" />
          <button type="button" className={ghost} disabled={busy} onClick={() => go('add')}>
            Add without running
          </button>
          <button type="button" className={primary} disabled={busy} onClick={() => go('run')}>
            <Check size={16} aria-hidden="true" />
            Run the prospect brief
          </button>
        </>
      }
    >
      <p className="text-[15px] leading-relaxed text-ink" data-testid="crm-line">
        {who} is new in HubSpot
        {item.at ? (
          <>
            {' since '}
            <LocalUsDay iso={item.at} />
          </>
        ) : null}
        . Catalyst adds them to the Lead pipeline in {research.name} and writes the pre-meeting prospect brief. Only that runs, and nothing goes to the
        client.
      </p>
      <ReadsBox reads={reads} />
      <p role="status" aria-live="polite" data-testid="crm-question-msg" className={`mt-2 min-h-[1.2em] text-[13.5px] ${msg?.bad ? 'text-bad' : 'text-ink-2'}`}>
        {msg?.text ?? ''}
      </p>
    </Dialog>
  )
}
