import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { SignOutButton } from './sign-out'

function initials(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

/** Who is signed in, with Your account and Sign out. Reads the session, so it streams in behind <Suspense>. */
export async function UserCard() {
  const user = await getCurrentUser()
  if (!user) return null
  return (
    <div className="flex items-center gap-2 border-t border-line pt-3" data-testid="user-card">
      <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm p-1.5 hover:bg-sunk" title="Your account">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-text">
          {initials(user.name)}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[13.5px] font-semibold text-ink">{user.name}</b>
          <small className="block truncate text-[12px] text-ink-3">{user.email}</small>
        </span>
      </Link>
      <SignOutButton />
    </div>
  )
}

export function UserCardFallback() {
  return <div className="h-[52px] border-t border-line" aria-hidden="true" />
}
