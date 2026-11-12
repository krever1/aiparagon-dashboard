'use client'

import { useSyncExternalStore } from 'react'

// The campaign banner on Runs & uploads, dismissed in this browser only (the old banner's state was this browser's, and
// Dismiss cleared it): the start time of the campaign dismissed last. The campaigns themselves are kept for the team.

const KEY = 'ap.campaign.dismissed'
let mem = 0
const listeners = new Set<() => void>()

function read(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return mem
  }
}

export function dismissCampaign(t: number) {
  mem = t
  try {
    localStorage.setItem(KEY, String(t))
  } catch {
    // kept for this page only
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  window.addEventListener('storage', l)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', l)
  }
}

/** When the campaign dismissed last started; 0 while the server draws the page. */
export function useDismissed(): number {
  return useSyncExternalStore(subscribe, read, () => 0)
}
