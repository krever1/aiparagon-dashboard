'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** While a run is under way, the page checks back for its document every 30 seconds (the board did the same). */
export function useCheckBack(running: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => router.refresh(), 30_000)
    return () => window.clearInterval(t)
  }, [running, router])
}
