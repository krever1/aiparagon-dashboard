'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * A side panel on the browser's own <dialog> (nwDrawer): it slides in from the right, keeps the keyboard inside while
 * open, Esc and a click on the dimmed backdrop close it. On a phone it takes the whole width.
 */
export function Drawer({
  open,
  onClose,
  eyebrow,
  title,
  meta,
  children,
  footer,
  label,
}: {
  open: boolean
  onClose: () => void
  eyebrow?: ReactNode
  title: string
  meta?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** a test id for the panel */
  label?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      data-testid={label}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[560px] overflow-hidden border-l border-line bg-panel p-0 text-ink shadow-pop backdrop:bg-[rgba(14,18,34,.42)] open:flex open:flex-col"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-accent-text">{eyebrow}</p> : null}
          <h2 id="drawer-title" className="mt-0.5 break-words font-display text-[22px] font-semibold leading-tight">
            {title}
          </h2>
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-sunk hover:text-ink"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6">{footer}</div> : null}
    </dialog>
  )
}
