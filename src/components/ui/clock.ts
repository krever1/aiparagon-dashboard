'use client'

import { useSyncExternalStore } from 'react'

// The clock by the minute, read only once the page is in the browser: the server's time until then, so the page
// draws the same on both sides and greetings and "last ran" lines follow the viewer's own clock afterwards.

let minute = 0
const subscribe = (l: () => void) => {
  const t = window.setInterval(l, 30_000)
  return () => window.clearInterval(t)
}
const read = () => {
  const m = Math.floor(Date.now() / 60_000)
  if (m !== minute) minute = m
  return minute
}

/** Now, in milliseconds to the minute; `serverNow` while the page hydrates. */
export function useNow(serverNow: number): number {
  const m = useSyncExternalStore(subscribe, read, () => 0)
  return m ? m * 60_000 : serverNow
}
