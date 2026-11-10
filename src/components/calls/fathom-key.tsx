'use client'

import { useEffect, useState } from 'react'
import { connectFathom, disconnectFathom, fathomKey } from '@/app/(app)/calls/actions'
import { Dialog } from '@/components/ui/dialog'
import { Ago } from '@/components/ui/local-date'
import { toast } from '@/components/ui/toast'

// Connecting Fathom for the whole team (apCallsSetup, apFathomModal): the key is stored in the team's n8n, never in
// the browser; the dashboard only reads calls.

const input = 'h-10 min-w-0 flex-1 rounded-sm border border-line bg-panel px-3 text-[14.5px] text-ink focus:border-accent focus:outline-none'
const ghost = 'rounded-sm border border-line px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
const primary = 'rounded-sm bg-action px-4 py-2 text-[14px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'

function Steps() {
  return (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-[14px] text-ink-2">
      <li>
        In Fathom, open your <b className="font-semibold text-ink">User Settings</b> and go to <b className="font-semibold text-ink">API Access</b>.
      </li>
      <li>Generate an API key and copy it.</li>
      <li>Paste it below.</li>
    </ol>
  )
}

function KeyForm({ id, onRetry }: { id: string; onRetry?: () => void }) {
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setErr('')
    if (key.trim().length < 10) return setErr('Paste the whole API key from Fathom.')
    setBusy(true)
    const r = await connectFathom(key).catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    toast('Fathom connected')
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          type="password"
          autoComplete="off"
          aria-label="Fathom API key"
          placeholder="Fathom API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go()
          }}
          className={input}
        />
        <button type="button" className={primary} disabled={busy} onClick={go}>
          {busy ? 'Checking…' : 'Connect'}
        </button>
        {onRetry ? (
          <button type="button" className={ghost} onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
      <p role="alert" className="mt-2 min-h-[1.2em] text-[13.5px] text-bad">
        {err}
      </p>
    </>
  )
}

/** The Set up tab when Fathom is not connected, or the Connection tab when it could not be reached. */
export function FathomSetup({ error, onRetry }: { error: { message: string; code: string } | null; onRetry: () => void }) {
  const code = error?.code ?? ''
  const shown = error && code !== 'not_connected'
  return (
    <div className="max-w-[640px] rounded-lg border border-line bg-panel p-5 shadow-card">
      {shown ? <div className="mb-3.5 rounded-md border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{error.message}</div> : null}
      <h3 className="font-display text-[20px] font-semibold text-ink">{code && code !== 'not_connected' && code !== 'bad_key' ? 'Try again, or check the key' : 'Connect Fathom'}</h3>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">
        Connect once and the whole team can watch calls here, read the summaries and use transcripts as sources for new drafts.
      </p>
      <Steps />
      <KeyForm id="fathom-key-setup" onRetry={error ? onRetry : undefined} />
      <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
        The key is stored in the team’s n8n, not in this browser. The dashboard only reads calls, it never changes anything in Fathom. A key sees the calls its
        owner recorded plus anything shared with them or their team.
      </p>
    </div>
  )
}

/** The key's window: who added it, replace it, or disconnect Fathom for the team. */
export function FathomKeyDialog({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<{ connected: boolean; hint: string; updatedBy: string; updatedAt: string; error: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    fathomKey()
      .then((r) => live && setSt(r.ok ? r : { connected: false, hint: '', updatedBy: '', updatedAt: '', error: r.error }))
      .catch(() => live && setSt({ connected: false, hint: '', updatedBy: '', updatedAt: '', error: 'Fathom could not be reached.' }))
    return () => {
      live = false
    }
  }, [])

  const disconnect = async () => {
    if (!window.confirm('Disconnect Fathom for the whole team? The Calls page will stop showing recordings until a key is added again.')) return
    setBusy(true)
    const r = await disconnectFathom().catch(() => ({ ok: false as const, error: 'Could not reach the dashboard.' }))
    setBusy(false)
    if (!r.ok) return toast(r.error, 'warn')
    onClose()
    toast('Fathom disconnected')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Fathom"
      width={560}
      footer={
        st?.connected ? (
          <>
            <button type="button" className={ghost + ' mr-auto'} disabled={busy} onClick={disconnect}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
            <button type="button" className={primary} onClick={onClose}>
              Open Calls
            </button>
          </>
        ) : undefined
      }
    >
      {!st ? (
        <p role="status" className="text-[14px] text-ink-3">
          Checking the connection…
        </p>
      ) : st.connected ? (
        <>
          <p className="text-[14.5px] text-ink">
            Connected. Using the key ending <b className="font-semibold">{st.hint || '····'}</b>
            {st.updatedBy ? (
              <>
                , added by {st.updatedBy.split('@')[0]} <Ago iso={st.updatedAt} />
              </>
            ) : null}
            .
          </p>
          <p className="mt-1.5 text-[14px] text-ink-2">Everyone at AI Paragon sees the calls this key can see, on the Calls page and in Content Transformation.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-[14px] font-semibold text-accent-text">Replace the key</summary>
            <div className="mt-3">
              <Steps />
              <KeyForm id="fathom-key-replace" />
            </div>
          </details>
        </>
      ) : (
        <>
          {st.error ? <div className="mb-3 rounded-md border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-[14px] text-bad">{st.error}</div> : null}
          <p className="text-[14.5px] text-ink-2">Connect Fathom once and the team can watch calls here, read the summaries and use transcripts as sources for new drafts.</p>
          <Steps />
          <KeyForm id="fathom-key-new" />
          <p className="mt-1 text-[12.5px] text-ink-3">The key is stored in the team’s n8n, not in this browser. The dashboard only reads calls, it never changes anything in Fathom.</p>
        </>
      )}
    </Dialog>
  )
}
