'use client'

import { useState } from 'react'
import { ArrowUpRight, Megaphone, Upload } from 'lucide-react'
import { startAdRun } from '@/app/(app)/ad-strategist/actions'
import { Dialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { btn, ghost, primary } from './bits'
import { OUT_TIP, legacy } from './briefs-parts'
import type { ACtx } from './ads-view'

// Run now (nwAdRunOpen, nwAdRunStart): a fresh pull from the Ad Library, or a brief from the team's uploads (still in
// the current dashboard).

export function RunNowDialog({ ctx, onClose }: { ctx: ACtx; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setErr('')
    setBusy(true)
    const r = await startAdRun().catch(() => ({ ok: false as const, error: 'Could not reach the dashboard. Try again in a minute.' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Ad Strategist"
      title="Run the Ad Strategist"
      width={680}
      footer={
        <button type="button" className={ghost} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-md border border-line p-3.5">
          <Megaphone size={20} aria-hidden="true" className="text-accent-text" />
          <b className="text-[15px] text-ink">Fresh ads from the Ad Library</b>
          <p className="text-[13.5px] text-ink-2">
            Pulls the newest long-running ads from the advertisers it follows, then writes a new ads brief. Takes a few minutes.
          </p>
          <button type="button" className={primary + ' mt-auto w-fit'} disabled={busy} onClick={() => void go()}>
            {busy ? 'Starting…' : 'Start a run'}
          </button>
        </section>
        <section className="flex flex-col gap-2 rounded-md border border-line p-3.5">
          <Upload size={20} aria-hidden="true" className="text-accent-text" />
          <b className="text-[15px] text-ink">From the ads you uploaded</b>
          <p className="text-[13.5px] text-ink-2">Builds an ads brief from the screenshots your team uploaded.</p>
          <a href={legacy('ad-strategist')} title={OUT_TIP} className={btn + ' mt-auto w-fit'}>
            Pick ads
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </section>
      </div>
      <p role={err ? 'alert' : undefined} className={`mt-3 text-[13.5px] ${err ? 'text-bad' : 'text-ink-3'}`} data-testid="run-msg">
        {err || (ctx.data.schedule.afterIntel ? 'It also runs after each Intel Tracker run.' : '')}
      </p>
    </Dialog>
  )
}
