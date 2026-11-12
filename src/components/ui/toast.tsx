'use client'

import { useSyncExternalStore } from 'react'
import { CircleAlert, Check } from 'lucide-react'

// A short message at the bottom of the screen after something is done ("Saved. The whole team sees the new names."),
// as in the current dashboard. Messages about something wrong stay up longer, and one with an action (Undo) stays up
// for 7 seconds.

type Action = { label: string; run: () => void }
type Toast = { id: number; text: string; tone: 'ok' | 'warn'; action?: Action }

let list: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const EMPTY: Toast[] = []

function emit() {
  for (const l of listeners) l()
}

function drop(id: number) {
  list = list.filter((x) => x.id !== id)
  emit()
}

export function toast(text: string, tone: Toast['tone'] = 'ok', action?: Action) {
  const t = { id: ++seq, text, tone, action }
  list = [...list.slice(-2), t]
  emit()
  setTimeout(() => drop(t.id), tone === 'warn' || action ? 7000 : 4000)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, () => list, () => EMPTY)
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toasts"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-[560px] items-center gap-2.5 rounded-md bg-action px-4 py-3 text-[14px] font-medium text-action-ink shadow-pop"
        >
          {t.tone === 'warn' ? (
            <CircleAlert size={16} aria-hidden="true" className="shrink-0 text-art-gold" />
          ) : (
            <Check size={16} aria-hidden="true" className="shrink-0 text-[#7fd3a5]" />
          )}
          <span>{t.text}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                drop(t.id)
                t.action!.run()
              }}
              className="ml-1 shrink-0 rounded-sm px-2 py-0.5 text-[13.5px] font-semibold text-art-gold underline-offset-2 hover:underline"
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
