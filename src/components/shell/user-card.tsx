import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'

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
      <form action="/auth/signout" method="post">
        <button type="submit" className="grid h-9 w-9 place-items-center rounded-sm text-ink-2 hover:bg-sunk hover:text-ink" title="Sign out" aria-label="Sign out">
          <LogOut size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}

export function UserCardFallback() {
  return <div className="h-[52px] border-t border-line" aria-hidden="true" />
}
