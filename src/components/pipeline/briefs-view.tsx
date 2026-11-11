'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Layers, Megaphone, Radar, Sparkles } from 'lucide-react'
import { decideBrief } from '@/app/(app)/briefs/actions'
import { Dialog } from '@/components/ui/dialog'
import { useHydrated } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'
import { TABS, type Tab, waitingLine } from '@/lib/pipeline/briefs'
import type { BriefsData } from '@/lib/pipeline/briefs-load'
import { ghost, inputCls, primary } from './bits'
import { AdsTabView } from './briefs-ads'
import { ComboView } from './briefs-combined'
import { OrgTabView } from './briefs-organic'
import type { BCtx, DecideKind } from './briefs-parts'

// The Market Intelligence Briefs page (NW_PAGES['e3.briefs'] as v109 to v127 left it): how many briefs wait, the
// Organic, Ads and Combined tabs, each brief's record bar, its sections in the team's layout, the rail, and the review
// that approves it or asks for changes. The tab and the brief on screen are in the address (?tab=, ?run=); the newest
// brief needs no run, so a bare address follows new briefs.

const addressOf = (tab: Tab, run: string, latest: string) => {
  const u = new URLSearchParams()
  if (tab !== 'organic') u.set('tab', tab)
  if (run && run !== latest) u.set('run', run)
  const q = u.toString()
  return '/briefs' + (q ? '?' + q : '')
}

export function BriefsView({ data }: { data: BriefsData }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const tz = hydrated ? undefined : 'UTC'
  const [busy, setBusy] = useState<string | null>(null)
  const [ask, setAsk] = useState<{ kind: DecideKind; id: string; title: string } | null>(null)

  // the address names the tab and, when it is not the newest, the brief
  useEffect(() => {
    const want = addressOf(data.tab, data.run, data.latest)
    if (window.location.pathname + window.location.search !== want) window.history.replaceState(null, '', want)
  }, [data.tab, data.run, data.latest])

  const approve = async (kind: DecideKind, id: string) => {
    if (busy) return false
    setBusy(id)
    const r = await decideBrief({ kind, id, action: 'approved' }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    setBusy(null)
    if (!r.ok) {
      toast(r.error, 'warn')
      return false
    }
    toast(r.toast)
    return true
  }
  const ctx: BCtx = {
    data,
    tz,
    approve,
    askChanges: (kind, id, title) => setAsk({ kind, id, title }),
    busy,
    goVersion: (run) => router.replace(addressOf(data.tab, run, data.latest), { scroll: false }),
  }
  const line = waitingLine(data.waiting, data.anyBrief)

  return (
    <div data-testid="briefs">
      <div className="mb-5 grid gap-3">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[14px] text-ink-2" data-testid="briefs-status">
          <li className="flex items-center gap-2">
            <i aria-hidden="true" className={`h-2 w-2 rounded-full ${line.tone === 'warn' ? 'bg-warn' : 'bg-good'}`} />
            {line.text}
          </li>
          <li>Rebuilt after each agent run</li>
        </ul>
        <ul className="flex flex-wrap gap-2" aria-label="What briefs do">
          {[
            [Layers, 'Sums up both agents'],
            [Check, 'Approve before use'],
            [Sparkles, 'Shapes every draft'],
          ].map(([I, t]) => {
            const Ic = I as typeof Layers
            return (
              <li key={t as string} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[13px] font-semibold text-ink-2">
                <Ic size={14} aria-hidden="true" />
                {t as string}
              </li>
            )
          })}
        </ul>
      </div>
      {data.error ? <p className="mb-4 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[14px] text-bad">Could not read every brief: {data.error}</p> : null}

      <div role="tablist" aria-label="Briefs" className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([t, label]) => {
          const I = t === 'organic' ? Radar : t === 'ads' ? Megaphone : Layers
          const on = data.tab === t
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => (on ? undefined : router.replace(addressOf(t, '', ''), { scroll: true }))}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[14.5px] font-semibold ${on ? 'border-action text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
            >
              <I size={16} aria-hidden="true" />
              {label}
              {data.dots[t] ? <i title="Needs review" aria-label="Needs review" className="h-2 w-2 rounded-full bg-warn" /> : null}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" aria-label={TABS.find((x) => x[0] === data.tab)?.[1]} data-testid="briefs-panel">
        {data.tab === 'organic' ? <OrgTabView ctx={ctx} /> : data.tab === 'ads' ? <AdsTabView ctx={ctx} /> : <ComboView ctx={ctx} />}
      </div>

      {ask ? <ChangesDialog ask={ask} onClose={() => setAsk(null)} /> : null}
    </div>
  )
}

/** What should change in a brief (the editor's "Leave a note instead"), saved for AI settings. */
function ChangesDialog({ ask, onClose }: { ask: { kind: DecideKind; id: string; title: string }; onClose: () => void }) {
  const [t, setT] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    box.current?.focus()
  }, [])
  const save = async () => {
    if (!t.trim()) return setErr('Say what should change.')
    setBusy(true)
    const r = await decideBrief({ kind: ask.kind, id: ask.id, action: 'changes', reason: t }).catch(() => ({ ok: false as const, error: 'Could not save: the dashboard could not be reached' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    onClose()
    toast(r.toast)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      kicker={ask.title}
      title="What needs to change in this brief?"
      width={560}
      footer={
        <>
          <button type="button" className={ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primary} disabled={busy || !t.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <label htmlFor="brief-change" className="sr-only">
        What needs to change
      </label>
      <textarea
        id="brief-change"
        ref={box}
        rows={5}
        className={inputCls}
        value={t}
        onChange={(e) => {
          setT(e.target.value)
          setErr('')
        }}
        maxLength={1000}
        placeholder="Be specific: which signal is off, what is missing, what should not be used. It shows on AI settings, where it can become a rule the agent follows."
      />
      {err ? (
        <p role="alert" className="mt-2 text-[13.5px] font-semibold text-bad">
          {err}
        </p>
      ) : null}
    </Dialog>
  )
}
