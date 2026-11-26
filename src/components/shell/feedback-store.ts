'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { FbPlace, FbRow } from '@/lib/touchpoint/feedback'

// The feedback notes for the whole app (v144.fb): whether feedback mode is on, the notes read (kept 30 seconds), where
// each page is, and the lead whose page is on screen (a lead's notes are keyed by its email).

type State = { on: boolean; rows: FbRow[] | null; places: Record<string, FbPlace>; at: number; lead: { path: string; email: string } | null }

let state: State = { on: false, rows: null, places: {}, at: 0, lead: null }
const listeners = new Set<() => void>()
const SERVER: State = { on: false, rows: null, places: {}, at: 0, lead: null }

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useFeedback = () => useSyncExternalStore(subscribe, () => state, () => SERVER)
export const feedbackState = () => state
export const setFeedbackOn = (on: boolean) => set({ on })

let loading: Promise<void> | null = null
/** Reads the notes again, unless they were read in the last 30 seconds (force reads anyway). */
export function loadNotes(force = false): Promise<void> {
  if (!force && state.rows && Date.now() - state.at < 30_000) return Promise.resolve()
  if (loading && !force) return loading
  const p = fetch('/api/feedback', { cache: 'no-store' })
    .then((res) => res.json() as Promise<{ ok: true; rows: FbRow[]; places: Record<string, FbPlace> } | { ok: false; error: string }>)
    .then((r) => {
      if (r.ok) set({ rows: r.rows, places: { ...state.places, ...r.places }, at: Date.now() })
      else if (!state.rows) set({ rows: [], at: Date.now() })
    })
    .catch(() => {
      if (!state.rows) set({ rows: [], at: Date.now() })
    })
    .finally(() => {
      if (loading === p) loading = null
    })
  loading = p
  return p
}

/** A lead's page says whose it is, so its notes carry the lead's email. */
export function useFeedbackLead(path: string, email: string) {
  useEffect(() => {
    set({ lead: { path, email: email.trim().toLowerCase() } })
    return () => {
      if (state.lead?.path === path) set({ lead: null })
    }
  }, [path, email])
}

/** Sign out forgets the notes. */
export const clearFeedback = () => set({ on: false, rows: null, places: {}, at: 0, lead: null })
