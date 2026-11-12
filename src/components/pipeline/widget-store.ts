'use client'

import { useSyncExternalStore } from 'react'
import { type WKey, hiddenOf, orderOf } from '@/lib/pipeline/overview'

// The Pipeline Overview's cards as this browser keeps them, as the current dashboard does (localStorage `ap.nw.ord`,
// the order, and `ap.nw.hidew`, the hidden cards). The two apps are on different addresses, so they do not share them.

const ORDER_KEY = 'ap.nw.ord'
const HIDDEN_KEY = 'ap.nw.hidew'

export type Cards = { order: WKey[]; hidden: WKey[] }

const DEFAULT: Cards = { order: orderOf(null), hidden: [] }
let mem: { order: unknown; hidden: unknown } = { order: null, hidden: [] }
let cache: { raw: string; val: Cards } = { raw: '', val: DEFAULT }
const listeners = new Set<() => void>()

function raw(key: string, fallback: unknown): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return JSON.stringify(fallback)
  }
}

const parse = (s: string | null): unknown => {
  try {
    return s === null ? null : JSON.parse(s)
  } catch {
    return null
  }
}

function read(): Cards {
  const o = raw(ORDER_KEY, mem.order)
  const h = raw(HIDDEN_KEY, mem.hidden)
  const key = String(o) + '\u0000' + String(h)
  if (key === cache.raw) return cache.val
  cache = { raw: key, val: { order: orderOf(parse(o)), hidden: hiddenOf(parse(h)) } }
  return cache.val
}

function write(order: WKey[] | null, hidden: WKey[]) {
  mem = { order, hidden }
  try {
    if (order) localStorage.setItem(ORDER_KEY, JSON.stringify(order))
    else localStorage.removeItem(ORDER_KEY)
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden))
  } catch {
    // kept for this page only
  }
  for (const l of listeners) l()
}

export const setOrder = (order: WKey[]) => write(order, read().hidden)
export const hideCard = (k: WKey) => write(read().order, [...new Set([...read().hidden, k])])
export const showCard = (k: WKey) => write(read().order, read().hidden.filter((x) => x !== k))
/** Back to the usual order with every card shown (nwWReset). */
export const resetCards = () => write(null, [])

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === ORDER_KEY || e.key === HIDDEN_KEY) l()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

/** The cards' order and the hidden ones; the usual order while the page hydrates. */
export function useCards(): Cards {
  return useSyncExternalStore(subscribe, read, () => DEFAULT)
}
