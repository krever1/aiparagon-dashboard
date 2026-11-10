import type { ReactNode } from 'react'
import { fitTone } from '@/lib/catalyst/stages'

// Small pieces the Catalyst pages share, drawn as the current dashboard draws them.

/** The fit rating as a pill: green for strong, red for weak or disqualified, amber for anything else. */
export function FitPill({ fit }: { fit: string | null | undefined }) {
  const tone = fitTone(fit)
  if (!tone) return null
  const cls =
    tone === 'good' ? 'bg-good-soft text-good' : tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${cls}`}>
      {String(fit).trim()}
    </span>
  )
}

export function StageDot({ color, className = '' }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} style={{ background: color }} />
}

/** The line under a page's heading: a gold tag, what the page is, and anything on the right. */
export function Banner({ tag, text, tip, right }: { tag: string; text: string; tip?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-text">
        {tag}
      </span>
      <span className="text-[15px] font-medium text-ink-2" title={tip}>
        {text}
      </span>
      {right ? <div className="ml-auto flex flex-wrap items-center gap-3">{right}</div> : null}
    </div>
  )
}

/** A number on the strip under the banner; a click opens the tab it counts. */
export function StripTile({
  n,
  label,
  tip,
  active,
  onClick,
}: {
  n: ReactNode
  label: string
  tip?: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      title={tip}
      onClick={onClick}
      aria-pressed={active ? 'true' : 'false'}
      className={`inline-flex items-baseline gap-2 rounded-md border px-3.5 py-2 text-left transition-colors ${
        active ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-line-2'
      }`}
    >
      <span className="font-display text-[22px] font-semibold leading-none text-ink">{n}</span>{' '}
      <span className={`text-[14px] ${active ? 'text-accent-text' : 'text-ink-2'}`}>{label}</span>
    </button>
  )
}

export type TabDef<K extends string> = { key: K; label: string; count?: number | string | null; done?: boolean }

/** The row of tabs under the strip. */
export function Tabs<K extends string>({
  tabs,
  active,
  onPick,
  label,
}: {
  tabs: TabDef<K>[]
  active: K
  onPick: (k: K) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex w-fit max-w-full flex-wrap gap-1 rounded-md border border-line bg-panel p-1">
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={t.key}
            onClick={() => onPick(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[14px] font-medium transition-colors ${
              on ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-sunk hover:text-ink'
            }`}
          >
            {t.done ? (
              <>
                <span>✓</span>{' '}
              </>
            ) : null}
            <span>{t.label}</span>
            {t.count !== undefined && t.count !== null && t.count !== '' ? (
              <>
                {' '}
                <span className={`text-[12px] ${on ? 'text-action-ink/70' : 'text-ink-3'}`}>{t.count}</span>
              </>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mb-4 rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-[14px] text-bad">
      {children}
    </div>
  )
}

export function plural(n: number, one: string, many = one + 's'): string {
  return n + ' ' + (n === 1 ? one : many)
}

/** "Pat QA" → "PQ"; an email → its first letter. */
export function initials(name: string): string {
  const words = String(name).replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}
