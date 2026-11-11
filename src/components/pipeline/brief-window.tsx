'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { type AdPick, briefChoices, buildBrief, startCampaign } from '@/app/(app)/ad-strategist/upload-actions'
import { Dialog } from '@/components/ui/dialog'
import { dateText, useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { briefHref } from '@/lib/touchpoint/approvals'
import { btn, ghost, primary } from './bits'
import { clip } from './ads-cards'

// Build an ad strategy from your uploads (apOpenBuildBrief, apRunBuildBrief): the team's read uploads to pick from, the
// high-value Intel Tracker findings if wanted, then Engine 3 · Custom Ad Strategy writes an ads brief from them. It
// becomes the newest brief built from uploads, which Send to Marketing Generation starts a campaign from.

const OFF = 'Could not reach the dashboard. Try again in a minute.'

/** Send to Marketing Generation: a campaign from an ads brief built from uploads (the newest when none is named). */
export function SendButton({ brief, onSent, className = btn }: { brief?: string; onSent?: () => void; className?: string }) {
  const router = useRouter()
  const path = usePathname()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const r = await startCampaign({ brief }).catch(() => ({ ok: false as const, error: OFF }))
        setBusy(false)
        if (!r.ok) return toast(r.error, 'warn')
        toast(r.toast)
        onSent?.()
        // Runs & uploads shows the campaign while it is written, as before
        if (path !== '/runs') router.push('/runs')
      }}
    >
      <Send size={14} aria-hidden="true" />
      {busy ? 'Starting…' : 'Send to Marketing Generation'}
    </button>
  )
}

export function BriefWindow({ onClose }: { onClose: () => void }) {
  const tz = useHydrated() ? undefined : 'UTC'
  const [ads, setAds] = useState<AdPick[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [intel, setIntel] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' | '' } | null>(null)
  const [done, setDone] = useState<{ runId: string; angle: string; hooks: string[] } | null>(null)

  useEffect(() => {
    let live = true
    void briefChoices()
      .catch(() => ({ ok: false as const, error: OFF }))
      .then((r) => {
        if (!live) return
        if (!r.ok) return setLoadErr(r.error)
        setAds(r.ads)
        // an upload switched out of the next ads brief starts unticked (the old window ticked every one)
        setPicked(new Set(r.ads.filter((a) => a.inBrief).map((a) => a.id)))
      })
    return () => {
      live = false
    }
  }, [])

  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const go = async () => {
    if (busy || !ads) return
    const ids = ads.filter((a) => picked.has(a.id)).map((a) => a.id)
    if (!ids.length) return setMsg({ text: 'Pick at least one ad.', tone: 'err' })
    setBusy(true)
    setMsg({ text: 'Reading ' + ids.length + (ids.length === 1 ? ' ad' : ' ads') + ' and writing the brief. This takes about half a minute…', tone: '' })
    const r = await buildBrief({ ids, intel }).catch(() => ({ ok: false as const, error: OFF }))
    setBusy(false)
    if (!r.ok) return setMsg({ text: r.error, tone: 'err' })
    setDone(r)
    setMsg({ text: 'Strategy saved as run ' + r.runId + '. It is now the newest brief.', tone: 'ok' })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      kicker="Pipeline · Custom run"
      title="Build an ad strategy from your uploads"
      width={720}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Close
          </button>
          {done ? null : (
            <button type="button" className={primary} disabled={busy || !ads?.length} onClick={() => void go()}>
              {busy ? 'Building…' : 'Build the strategy'}
            </button>
          )}
        </>
      }
    >
      <div data-testid="brief-window">
        <p className="mb-3 text-[14px] text-ink-2">
          Creates an Ad Strategist creative brief from the ads you pick. It becomes the newest brief, so Marketing Generation builds from it next.
        </p>
        {loadErr ? (
          <p role="alert" className="text-[14px] text-bad">
            {loadErr}
          </p>
        ) : !ads ? (
          <p className="text-[14px] text-ink-3">Loading…</p>
        ) : (
          <>
            <p className="mb-1.5 text-[13.5px] font-semibold text-ink">Uploaded ads ({ads.length})</p>
            {ads.length ? (
              <ul className="grid max-h-[220px] gap-0.5 overflow-y-auto rounded-sm border border-line p-1.5" aria-label="Uploaded ads">
                {ads.map((a) => (
                  <li key={a.id}>
                    <label className="flex items-start gap-2 rounded-sm px-1.5 py-1 text-[13.5px] text-ink-2 hover:bg-sunk">
                      <input type="checkbox" className="mt-1" disabled={busy || !!done} checked={picked.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />
                      <span>
                        <b className="text-ink">{a.advertiser}</b> · {clip(a.title, 80)} · {dateText(a.at, tz)}
                        {a.inBrief ? null : <small className="ml-1 text-ink-3">(left out of the next ads brief)</small>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-3">No uploads read yet. Upload a few competitor ads first.</p>
            )}
            <label className="mt-3 flex items-center gap-2 text-[14px] text-ink-2">
              <input type="checkbox" disabled={busy || !!done} checked={intel} onChange={(e) => setIntel(e.target.checked)} />
              Also use high-value intel from the last 30 days
            </label>
          </>
        )}
        {msg ? (
          <p role={msg.tone === 'err' ? 'alert' : 'status'} className={`mt-3 text-[14px] ${msg.tone === 'ok' ? 'text-good' : msg.tone === 'err' ? 'text-bad' : 'text-ink-2'}`}>
            {msg.text}
          </p>
        ) : null}
        {done ? (
          <div className="mt-3 rounded-md border border-line p-3" data-testid="brief-result">
            {done.angle ? (
              <p className="mb-2 text-[14px] text-ink-2">
                <b className="text-ink">Angle:</b> {done.angle}
              </p>
            ) : null}
            {done.hooks.length ? (
              <>
                <b className="mb-1 block text-[13.5px] text-ink">Hook patterns</b>
                <ul className="mb-2 grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">
                  {done.hooks.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Link href={briefHref(done.runId, 'ads')} className={btn} onClick={onClose}>
                Open the brief
              </Link>
              <SendButton brief={done.runId} onSent={onClose} className={primary} />
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
