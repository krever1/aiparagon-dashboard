'use client'

import { LogOut } from 'lucide-react'
import { clearPlaces } from './back-store'
import { clearFeedback } from './feedback-store'

/** Sign out: this browser's session ends, and Back starts a new list for whoever signs in next. */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post" onSubmit={() => {
        clearPlaces()
        clearFeedback()
      }}>
      <button type="submit" className="grid h-9 w-9 place-items-center rounded-sm text-ink-2 hover:bg-sunk hover:text-ink" title="Sign out" aria-label="Sign out">
        <LogOut size={17} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </form>
  )
}
