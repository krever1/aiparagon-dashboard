import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthLayout } from '@/components/auth-layout'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<div className="h-[420px] w-full max-w-[380px]" aria-hidden="true" />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
