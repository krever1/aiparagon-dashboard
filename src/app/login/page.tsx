import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex flex-col justify-between gap-10 bg-art px-8 py-10 text-white sm:px-12 lg:px-16 lg:py-14">
        <div className="flex items-center gap-3">
          <BrandMark size={44} className="ring-1 ring-white/20" />
          <div>
            <b className="block font-display text-[26px] font-bold leading-none">AI Paragon</b>
            <span className="mt-1 block text-[13px] text-white/70">
              AI Paragon Consulting Group · <em>Team workspace</em>
            </span>
          </div>
        </div>
        <div className="max-w-[520px]">
          <h1 className="font-display text-[34px] font-semibold leading-[1.15] sm:text-[42px]">
            One intelligent workspace.
            <br />
            From <span className="text-art-gold">your real sources</span>, in <span className="text-art-gold">your voice</span>.
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-white/75">
            Prepare every meeting, turn your market into campaigns, and review it all before anything goes to a client.
          </p>
        </div>
        <p className="text-[12px] text-white/50">For the AI Paragon team only.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <Suspense fallback={<div className="h-[420px] w-full max-w-[380px]" aria-hidden="true" />}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  )
}
