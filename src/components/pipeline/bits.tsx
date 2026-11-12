import type { ReactNode } from 'react'
import { VAL, type Val, hueOf, initialsOf } from '@/lib/pipeline/intel'

// Small pieces the Pipeline pages share, drawn as the current dashboard draws them (nwPill, nwTag, nwRing, nwValPill,
// the avatars).

export type Tone = 'good' | 'warn' | 'bad' | 'info' | ''

const TONES: Record<Tone, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  '': 'bg-sunk text-ink-2',
}

/** A status pill (nwPill). */
export function Pill({ tone = '', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${TONES[tone]}`}>{children}</span>
}

/** A tag (nwTag); gold for what the agent marks. */
export function Tag({ gold, children, title }: { gold?: boolean; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[11.5px] font-semibold ${gold ? 'bg-accent-soft text-accent-text' : 'bg-sunk text-ink-2'}`}
    >
      {children}
    </span>
  )
}

/** A post's value as a pill (nwValPill). */
export function ValPill({ val }: { val: Val }) {
  if (!val) return null
  return <Pill tone={VAL[val].tone}>{VAL[val].label}</Pill>
}

const RING: Record<string, string> = { high: 'var(--color-good)', medium: 'var(--color-warn)', low: 'var(--color-ink-3)', '': 'var(--color-ink-3)' }

/** A post's score in a ring (nwRing). */
export function Ring({ score, val, size = 44 }: { score: number; val: Val; size?: number }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Score ${score} of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4} stroke="var(--color-line)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          stroke={RING[val]}
          strokeDasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b className="relative font-semibold text-ink" style={{ fontSize: Math.round(size * 0.34) }} aria-hidden="true">
        {score}
      </b>
    </span>
  )
}

/** A round avatar with two letters, its colour from the name (nw-av). */
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const h = hueOf(name)
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full text-[12px] font-semibold"
      style={{ width: size, height: size, background: `hsl(${h} 45% 90%)`, color: `hsl(${h} 45% 28%)` }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** A filter chip with its count (nw-chip). */
export function Chip({ on, onClick, children, count }: { on: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13.5px] font-semibold ${
        on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-ink-2 hover:border-line-2'
      }`}
    >
      {children}
      {count !== undefined ? <span className="text-[12px] font-normal opacity-75">{count}</span> : null}
    </button>
  )
}

/** An empty state (nwEmpty): an icon, a line and what to do. */
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-panel px-6 py-10 text-center">
      <span className="text-ink-3">{icon}</span>
      <b className="text-[15.5px] text-ink">{title}</b>
      <p className="max-w-[460px] text-[14px] text-ink-2">{text}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export const btn =
  'inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel px-2.5 py-1.5 text-[13px] font-semibold text-ink hover:border-line-2 disabled:opacity-60'
export const ghost = 'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-60'
export const primary =
  'inline-flex items-center gap-1.5 rounded-sm bg-action px-2.5 py-1.5 text-[13px] font-semibold text-action-ink hover:bg-action-hover disabled:opacity-60'
export const linkCls = 'inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent-text hover:underline'
export const inputCls = 'w-full rounded-sm border border-line bg-panel px-3 py-2 text-[14.5px] text-ink focus:border-accent focus:outline-none'
export const selectCls = 'rounded-sm border border-line bg-panel px-2.5 py-1.5 text-[13.5px] text-ink focus:border-accent focus:outline-none'
