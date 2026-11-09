'use client'

import { useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LEGACY_DASHBOARD_URL, TEAM_EMAIL_DOMAIN } from '@/lib/config'
import { type AuthState, sendReset, signIn } from './actions'

const field =
  'w-full rounded-sm border border-line-2 bg-panel px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'
const label = 'mb-1.5 block text-[13px] font-semibold text-ink-2'

export function LoginForm() {
  const params = useSearchParams()
  const next = params.get('next') ?? ''
  const denied = params.get('denied') === '1'
  const [email, setEmail] = useState('')
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {})
  const [resetState, resetAction, resetting] = useActionState<AuthState, FormData>(sendReset, {})

  const error = signInState.error || resetState.error || (denied ? `This workspace is for the AI Paragon team. Sign in with your @${TEAM_EMAIL_DOMAIN} account.` : '')
  const ok = !signInState.error ? resetState.ok : ''

  return (
    <form action={signInAction} className="w-full max-w-[380px]" noValidate>
      <h2 className="font-display text-[30px] font-semibold leading-tight text-ink">Welcome back</h2>
      <p className="mb-5 mt-1.5 text-[14px] text-ink-2">Sign in with your AI Paragon account.</p>

      <div aria-live="polite" className="mb-4 empty:hidden">
        {error ? (
          <p role="alert" className="rounded-sm border border-bad/30 bg-bad-soft px-3 py-2 text-[14px] text-bad">
            {error}
          </p>
        ) : ok ? (
          <p role="status" className="rounded-sm border border-good/30 bg-good-soft px-3 py-2 text-[14px] text-good">
            {ok}
          </p>
        ) : null}
      </div>

      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className={label}>
        Work email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder={`you@${TEAM_EMAIL_DOMAIN}`}
        className={field + ' mb-4'}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <label htmlFor="password" className={label}>
        Password
      </label>
      <input id="password" name="password" type="password" autoComplete="current-password" className={field + ' mb-6'} required />

      <button
        type="submit"
        disabled={signingIn}
        className="w-full rounded-sm bg-action px-4 py-3 text-[15px] font-semibold text-action-ink transition-colors hover:bg-action-hover disabled:opacity-60"
      >
        {signingIn ? 'Signing in…' : 'Sign in'}
      </button>
      <button
        type="submit"
        formAction={resetAction}
        formNoValidate
        disabled={resetting}
        className="mt-3 block text-[14px] font-medium text-accent-text underline-offset-2 hover:underline disabled:opacity-60"
      >
        Forgot your password?
      </button>

      <p className="mt-6 text-[13px] text-ink-3">
        Accounts are limited to <b className="text-ink-2">@{TEAM_EMAIL_DOMAIN}</b> addresses. New to the team?{' '}
        <a className="font-medium text-accent-text underline-offset-2 hover:underline" href={`${LEGACY_DASHBOARD_URL}/login`}>
          Create your account in the current dashboard
        </a>
        .
      </p>
    </form>
  )
}
