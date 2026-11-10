'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** While a run is under way, the page checks back for its document every 30 seconds (the board did the same). */
export function useCheckBack(running: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => router.refresh(), 30_000)
    // marks the page while it checks back, so a test can wait until the timer is set before moving the clock on
    document.documentElement.dataset.checkBack = 'on'
    return () => {
      window.clearInterval(t)
      delete document.documentElement.dataset.checkBack
    }
  }, [running, router])
}
