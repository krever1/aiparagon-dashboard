import { Suspense } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { UserCard, UserCardFallback } from '@/components/shell/user-card'

/** Every signed-in page: the shell is static; only the user card reads the session, behind <Suspense>. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      userCard={
        <Suspense fallback={<UserCardFallback />}>
          <UserCard />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  )
}
