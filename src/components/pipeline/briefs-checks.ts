'use client'

import { useSyncExternalStore } from 'react'

// A brief's three review checks, kept in this browser only, as the current dashboard keeps them (localStorage
// `ap.nw.brchk`: "org:<run>" or "ads:<run>" → [bool, bool, bool]). The two apps are on different addresses, so each
// keeps its own.

const KEY = 'ap.nw.brchk'
type All = Record<string, boolean[]>
let mem: All = {}
let cache: { raw: string | null; val: All } = { raw: null, val: {} }
const listeners = new Set<() => void>()

function read(): All {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return mem
  }
  if (raw === cache.raw) return cache.val
  let val: All = {}
  try {
    const p = JSON.parse(raw || '{}')
    if (p && typeof p === 'object' && !Array.isArray(p)) val = p
  } catch {
    // a broken entry is no checks
  }
  cache = { raw, val }
  return val
}

/** Ticks or unticks one check of a brief. */
export function toggleCheck(key: string, i: number) {
  const all = { ...read() }
  const c = Array.isArray(all[key]) ? all[key].slice(0, 3) : [false, false, false]
  while (c.length < 3) c.push(false)
  c[i] = !c[i]
  all[key] = c
  mem = all
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // kept for this page only
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) l()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

const NONE: boolean[] = [false, false, false]

/** A brief's three checks in this browser; none ticked while the page hydrates. */
export function useChecks(key: string): boolean[] {
  const all = useSyncExternalStore(subscribe, read, () => ({}) as All)
  const c = all[key]
  return Array.isArray(c) ? [0, 1, 2].map((i) => c[i] === true) : NONE
}
