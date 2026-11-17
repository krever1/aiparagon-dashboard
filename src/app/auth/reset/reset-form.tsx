'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { type ResetStart, type ResetState, resetWho, setPassword, startReset } from './actions'
import { MIN_PASSWORD } from './rules'

const field =
  'w-full rounded-sm border border-line-2 bg-panel px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'
const label = 'mb-1.5 block text-[13px] font-semibold text-ink-2'
const button =
  'w-full rounded-sm bg-action px-4 py-3 text-center text-[15px] font-semibold text-action-ink transition-colors hover:bg-action-hover disabled:opacity-60'

type Stage = { k: 'checking' } | { k: 'form'; email: string } | { k: 'expired' } | { k: 'denied' } | { k: 'none' }

/** What the reset email's link left in the address: its tokens, or Supabase's reason it could not sign in. */
function readLink(): { access?: string; refresh?: string; failed?: boolean } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  if (hash.get('error') || hash.get('error_code') || query.get('error') || query.get('error_code')) return { failed: true }
  const access = hash.get('access_token') || ''
  const refresh = hash.get('refresh_token') || ''
  return access && refresh ? { access, refresh } : {}
}

function stageOf(r: ResetStart): Stage {
  if (r.email) return { k: 'form', email: r.email }
  return { k: r.error || 'none' }
}

export function ResetForm() {
  const [stage, setStage] = useState<Stage>({ k: 'checking' })
  const [state, action, saving] = useActionState<ResetState, FormData>(setPassword, {})
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const link = readLink()
    // The tokens leave the address at once: they would stay in the history and show in any screenshot.
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname)
    const ask: Promise<ResetStart> = link.failed
      ? Promise.resolve({ error: 'expired' })
      : link.access && link.refresh
        ? startReset(link.access, link.refresh)
        : resetWho()
    // Once only (the ref), so the tokens are never handed over twice; a link's refresh token works one time.
    ask.then((r) => setStage(stageOf(r))).catch(() => setStage({ k: 'expired' }))
  }, [])

  const title = <h2 className="font-display text-[30px] font-semibold leading-tight text-ink">Set a new password</h2>
  const again = (
    <Link href="/login" className={button + ' mt-6 block'}>
      Back to sign in
    </Link>
  )

  if (stage.k === 'checking') {
    return (
      <div className="w-full max-w-[380px]" aria-busy="true">
        {title}
        <p role="status" className="mt-3 text-[14px] text-ink-2">
          Checking your reset link…
        </p>
      </div>
    )
  }

  if (stage.k !== 'form') {
    const text =
      stage.k === 'expired'
        ? 'This reset link has expired or was already used. On the sign-in page, enter your email and press Forgot your password? for a new one.'
        : stage.k === 'denied'
          ? 'This workspace is for the AI Paragon team. That reset link is for an account outside it.'
          : 'Open the link in your password reset email to set a new password. To get one, enter your email on the sign-in page and press Forgot your password?'
    return (
      <div className="w-full max-w-[380px]">
        {title}
        <p role={stage.k === 'none' ? 'status' : 'alert'} className="mt-4 rounded-sm border border-bad/30 bg-bad-soft px-3 py-2 text-[14px] text-bad">
          {text}
        </p>
        {again}
      </div>
    )
  }

  if (state.done) {
    return (
      <div className="w-full max-w-[380px]">
        {title}
        <p role="status" className="mt-4 rounded-sm border border-good/30 bg-good-soft px-3 py-2 text-[14px] text-good">
          Your password is changed. Use it to sign in to both dashboards.
        </p>
        <Link href="/today" className={button + ' mt-6 block'}>
          Open the dashboard
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="w-full max-w-[380px]" noValidate>
      {title}
      <p className="mb-5 mt-1.5 text-[14px] text-ink-2">
        For <b className="text-ink">{stage.email}</b>. It works in both dashboards.
      </p>
      <div aria-live="polite" className="mb-4 empty:hidden">
        {state.error ? (
          <p role="alert" className="rounded-sm border border-bad/30 bg-bad-soft px-3 py-2 text-[14px] text-bad">
            {state.error}
          </p>
        ) : null}
      </div>
      <input type="email" name="username" autoComplete="username" value={stage.email} readOnly hidden />
      <label htmlFor="password" className={label}>
        New password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        aria-describedby="password-hint"
        className={field}
        required
      />
      <p id="password-hint" className="mb-4 mt-1.5 text-[13px] text-ink-3">
        At least {MIN_PASSWORD} characters.
      </p>
      <label htmlFor="again" className={label}>
        Type it again
      </label>
      <input id="again" name="again" type="password" autoComplete="new-password" className={field + ' mb-6'} required />
      <button type="submit" disabled={saving} className={button}>
        {saving ? 'Saving…' : 'Save the new password'}
      </button>
    </form>
  )
}
