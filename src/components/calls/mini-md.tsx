import { Fragment, type ReactNode } from 'react'

// Fathom's summaries and the post-call deliverables, read like notes (the current dashboard's apMiniMd, v88): headings
// as small headings without a trailing colon, bullets (indented ones as sub-points), numbered lists, **bold**, links
// (https only), and a line that is only a link to a moment in the call gets the moment's time as a chip.

const clock = (u: string) => {
  const m = /[?&]timestamp=([\d.]+)/.exec(u)
  if (!m) return ''
  const s = Math.floor(Number(m[1]))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function bold(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(<b key={key + '-b' + i++}>{m[1]}</b>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

function inline(s: string, key: string): ReactNode {
  const whole = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(s)
  if (whole) {
    const t = clock(whole[2])
    return (
      <>
        {bold(whole[1], key)}
        {t ? (
          <>
            {' '}
            <a href={whole[2]} target="_blank" rel="noopener noreferrer" title="Open this moment in Fathom" className="ml-0.5 rounded-sm bg-sunk px-1.5 py-0.5 font-mono text-[12px] text-accent-text no-underline hover:bg-accent-soft">
              {t}
            </a>
          </>
        ) : null}
      </>
    )
  }
  const out: ReactNode[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(...bold(s.slice(last, m.index), key + '-' + i))
    const safe = /^https:\/\//i.test(m[2])
    out.push(
      safe ? (
        <a key={key + '-a' + i} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-accent-text underline">
          {m[1]}
        </a>
      ) : (
        <Fragment key={key + '-a' + i}>{m[1]}</Fragment>
      ),
    )
    i++
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(...bold(s.slice(last), key + '-end'))
  return out
}

type Block = { kind: 'h'; text: string } | { kind: 'p'; text: string } | { kind: 'ul' | 'ol'; items: { text: string; sub: boolean }[] }

export function MiniMd({ text, className = '' }: { text: string; className?: string }) {
  const blocks: Block[] = []
  let list: Extract<Block, { items: unknown }> | null = null
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim()
    if (!l) {
      list = null
      continue
    }
    const ind = (/^\s*/.exec(raw)?.[0] ?? '').length
    let m: RegExpExecArray | null
    if ((m = /^#{1,6}\s+(.*)$/.exec(l))) {
      list = null
      blocks.push({ kind: 'h', text: m[1].replace(/:$/, '') })
    } else if ((m = /^[-*•]\s+(.*)$/.exec(l)) || (m = /^\d+[.)]\s+(.*)$/.exec(l))) {
      const kind = /^\d/.test(l) ? 'ol' : 'ul'
      if (!list || list.kind !== kind) {
        list = { kind, items: [] }
        blocks.push(list)
      }
      list.items.push({ text: m[1], sub: ind >= 4 })
    } else {
      list = null
      blocks.push({ kind: 'p', text: l })
    }
  }
  return (
    <div className={`space-y-2 text-[14.5px] leading-relaxed text-ink ${className}`}>
      {blocks.map((b, i) => {
        const k = 'b' + i
        if (b.kind === 'h') return <h4 key={k} className="pt-1 text-[14.5px] font-semibold text-ink">{inline(b.text, k)}</h4>
        if (b.kind === 'p') return <p key={k}>{inline(b.text, k)}</p>
        const Tag = b.kind
        return (
          <Tag key={k} className={`space-y-1 pl-5 ${b.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
            {b.items.map((it, j) => (
              <li key={j} className={it.sub ? 'ml-5 list-[circle]' : ''}>
                {inline(it.text, k + '-' + j)}
              </li>
            ))}
          </Tag>
        )
      })}
    </div>
  )
}
