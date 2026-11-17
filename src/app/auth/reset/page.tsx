import type { Metadata } from 'next'
import { AuthLayout } from '@/components/auth-layout'
import { ResetForm } from './reset-form'

export const metadata: Metadata = { title: 'Set a new password' }

/** Where the password reset email's link comes back to (both dashboards send it here). */
export default function ResetPage() {
  return (
    <AuthLayout>
      <ResetForm />
    </AuthLayout>
  )
}
