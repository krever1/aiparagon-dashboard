'use client'

import { useEffect } from 'react'

// Back in the top bar (v143): the pages this browser tab visited, a lead's own page included, kept in sessionStorage so
// a reload keeps them. A place is a page (its path); the address it was last at (its tab, its filters) is kept with it,
// so Back opens it the way it was left. 30 places at most, as in the current dashboard. This app is on another address
// than the current dashboard, so it keeps its own list (the current dashboard's is `ap.back.v1`).

export type Place = { path: string; href: string; name: string }

const KEY = 'ap.next.back.v1'
const MAX = 30
const listeners = new Set<() => void>()
let stack: Place[] | null = null
/** names a page gave itself (a lead's page: the lead's name), by path, for a place recorded before it said so */
const named = new Map<string, string>()

function load(): Place[] {
  if (stack) return stack
  let s: Place[] = []
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) || '[]')
    if (Array.isArray(p)) {
      s = p
        .filter((x) => x && typeof x.path === 'string' && typeof x.href === 'string' && x.path.startsWith('/'))
        .map((x) => ({ path: x.path, href: x.href.startsWith('/') && !x.href.startsWith('//') ? x.href : x.path, name: String(x.name ?? '') }))
        .slice(-MAX)
    }
  } catch {
    // a broken entry starts a new list
  }
  stack = s
  return s
}

function save(next: Place[]) {
  stack = next.slice(-MAX)
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack))
  } catch {
    // kept for this page only
  }
  for (const l of listeners) l()
}

/** Where the page settled: the same place as the last one updates it (its address, its name), a new one goes on top. */
export function recordPlace(path: string, href: string, name: string) {
  const s = load()
  const top = s[s.length - 1]
  // a name the page gave itself wins; a place seen again keeps the name it had (a lead's page names itself a moment
  // after it shows, and a reload forgets which pages named themselves)
  const nm = named.get(path) || (top && top.path === path ? top.name : '') || name
  if (top && top.path === path) {
    if (top.href === href && top.name === nm) return
    save([...s.slice(0, -1), { path, href, name: nm }])
  } else {
    save([...s, { path, href, name: nm }])
  }
}

/** A page names itself (a lead's page by the lead's name): every place at that path takes the name. */
export function namePlace(path: string, name: string) {
  if (!name) return
  named.set(path, name)
  const s = load()
  if (!s.some((p) => p.path === path && p.name !== name)) return
  save(s.map((p) => (p.path === path ? { ...p, name } : p)))
}

/** Back: the place before this one, taken off the top so arriving there adds nothing. */
export function takeBack(): Place | null {
  const s = load()
  if (s.length < 2) return null
  const to = s[s.length - 2]
  save(s.slice(0, -1))
  return to
}

/** Signing out starts a new list. */
export function clearPlaces() {
  named.clear()
  save([])
}

export function subscribePlaces(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The place Back goes to, or null on the first page. */
export function previousPlace(): Place | null {
  const s = load()
  return s.length > 1 ? s[s.length - 2] : null
}

/** For a page that names itself in the top bar's Back ("Back to Lee Ready"). Runs again when a kept page shows again. */
export function usePlaceName(path: string, name: string) {
  useEffect(() => {
    namePlace(path, name)
  }, [path, name])
}
