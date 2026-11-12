'use client'

import { useSyncExternalStore } from 'react'

// What is skipped for now on Approvals: kept in this browser only, as in the current dashboard (localStorage
// `ap.nw.skip`, key → when it was skipped). Approvals and Today's Needs you both read it, and both follow a change made
// on the other, or in another tab.

const SKIP_KEY = 'ap.nw.skip'
export type Skips = Record<string, number>
const NO_SKIPS: Skips = {}
let memSkips: Skips = {}
let cache: { raw: string | null; val: Skips } = { raw: null, val: NO_SKIPS }
const listeners = new Set<() => void>()

function readSkips(): Skips {
  let raw: string | null
  try {
    raw = localStorage.getItem(SKIP_KEY)
  } catch {
    return memSkips
  }
  if (raw === cache.raw) return cache.val
  let val: Skips = {}
  try {
    const p = JSON.parse(raw || '{}')
    if (p && typeof p === 'object' && !Array.isArray(p)) val = p
  } catch {
    // a broken entry is no skips
  }
  cache = { raw, val }
  return val
}

function writeSkips(next: Skips) {
  memSkips = next
  try {
    localStorage.setItem(SKIP_KEY, JSON.stringify(next))
  } catch {
    // kept for this page only
  }
  for (const l of listeners) l()
}

/** Skipped now, for this browser. */
export function addSkips(keys: string[]) {
  const s = { ...readSkips() }
  const at = Date.now()
  for (const k of keys) s[k] = at
  writeSkips(s)
}

export function removeSkips(keys: string[]) {
  const s = { ...readSkips() }
  for (const k of keys) delete s[k]
  writeSkips(s)
}

function subscribe(l: () => void) {
  listeners.add(l)
  window.addEventListener('storage', l)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', l)
  }
}

/** This browser's skips; empty while the server draws the page (see the Gotchas in CLAUDE.md). */
export function useSkips(): Skips {
  return useSyncExternalStore(subscribe, readSkips, () => NO_SKIPS)
}
