'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * A modal window on the browser's own <dialog>: it keeps the keyboard inside while open, Esc closes it, and the page
 * behind takes no clicks. A click on the dimmed backdrop closes it too.
 */
export function Dialog({
  open,
  onClose,
  kicker,
  title,
  children,
  footer,
  width = 640,
}: {
  open: boolean
  onClose: () => void
  kicker?: string
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
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
      aria-labelledby="dialog-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      style={{ maxWidth: `min(${width}px, calc(100vw - 24px))` }}
      className="m-auto max-h-[calc(100dvh-24px)] w-full overflow-hidden rounded-lg border border-line bg-panel p-0 text-ink shadow-pop backdrop:bg-[rgba(14,18,34,.42)] open:flex open:flex-col"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          {kicker ? <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-accent-text">{kicker}</p> : null}
          <h2 id="dialog-title" className="mt-0.5 font-display text-[24px] font-semibold leading-tight">
            {title}
          </h2>
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
