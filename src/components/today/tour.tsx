'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, CircleHelp, FileText, Megaphone, MessageSquare, Repeat, Rocket } from 'lucide-react'
import { Icon } from '@/components/icon'
import { Dialog } from '@/components/ui/dialog'
import { PRODUCTS } from '@/lib/nav'
import { TOUR } from '@/lib/touchpoint/today'

// Take the tour (NW_TOUR, nwTourHtml): four short steps on Today. The first three are the current dashboard's words
// (the first as v115 left it); the fourth says what is true here: some pages still live in the current dashboard.

const chip = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[13px] font-semibold text-ink-2'
const btn = 'inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-[14px] font-semibold'

/** What each step shows above its words (the current dashboard's little flows). */
function Art({ i }: { i: number }) {
  if (i === 0) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {PRODUCTS.map((p) => (
          <span key={p.key} className={chip}>
            <Icon name={p.icon} size={15} />
            {p.name}
          </span>
        ))}
      </div>
    )
  }
  if (i === 1) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className={chip}>
          <FileText size={15} aria-hidden="true" />
          Brief
        </span>
        <span className={chip}>
          <Megaphone size={15} aria-hidden="true" />
          Ad
        </span>
        <span className={chip}>
          <MessageSquare size={15} aria-hidden="true" />
          Reply
        </span>
        <span className={chip + ' border-accent bg-accent-soft text-accent-text'}>
          <Check size={15} strokeWidth={2.2} aria-hidden="true" />
          Approve
        </span>
      </div>
    )
  }
  if (i === 2) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className={chip}>
          <Repeat size={15} aria-hidden="true" />
          Your material
        </span>
        <span className={chip}>
          <Rocket size={15} aria-hidden="true" />
          The briefs
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className={chip}>This dashboard</span>
      <ArrowRight size={15} aria-hidden="true" className="text-ink-3" />
      <span className={chip}>
        Current dashboard
        <ArrowUpRight size={15} aria-hidden="true" />
      </span>
    </div>
  )
}

/** The Take the tour button on the hello line, and the tour itself. */
export function TourButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-2 text-[14px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink"
      >
        <CircleHelp size={17} aria-hidden="true" />
        Take the tour
      </button>
      {open ? <TourDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function TourDialog({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const primary = useRef<HTMLButtonElement>(null)
  const last = i === TOUR.length - 1
  // the window opens before this runs (its effect runs first), so the step's main button gets the keyboard (nwTourGo)
  useEffect(() => {
    primary.current?.focus({ preventScroll: true })
  }, [i])

  return (
    <Dialog
      open
      onClose={onClose}
      kicker={i + 1 + ' of ' + TOUR.length}
      title={TOUR[i].t}
      width={560}
      footer={
        <>
          <div className="mr-auto flex items-center gap-1.5" aria-hidden="true" data-testid="tour-dots">
            {TOUR.map((s, j) => (
              <i key={s.t} className={'block h-2 rounded-full ' + (j === i ? 'w-[22px] bg-accent' : 'w-2 bg-line-2')} />
            ))}
          </div>
          {i ? (
            <button type="button" className={btn + ' text-ink-2 hover:bg-sunk hover:text-ink'} onClick={() => setI(i - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className={btn + ' text-ink-2 hover:bg-sunk hover:text-ink'} onClick={onClose}>
              Skip
            </button>
          )}
          <button
            ref={primary}
            type="button"
            className={btn + ' bg-action text-action-ink hover:bg-action-hover'}
            onClick={() => (last ? onClose() : setI(i + 1))}
          >
            {last ? 'Done' : 'Next'}
          </button>
        </>
      }
    >
      <div className="grid gap-4" data-testid="tour-step">
        <div className="grid min-h-[140px] place-items-center rounded-md bg-sunk p-[18px]">
          <Art i={i} />
        </div>
        <p className="text-[15px] leading-relaxed text-ink-2">{TOUR[i].p}</p>
      </div>
    </Dialog>
  )
}
