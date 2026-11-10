// Charts in a Catalyst document, as the current dashboard draws them since v138 (v138Vis, v138Chart): a timeline or
// bars that the workflows build only from the documents' own numbers and dates. The model never draws: the dashboard
// checks the numbers again (two charts at most, two to twelve items each) and lays them out here. Pure functions;
// chart.tsx draws the shapes they return. Used by the client proposal and the meeting prep documents.

export type TimelineItem = { label: string; start: number; end: number }
export type BarItem = { label: string; value: number }
export type Chart =
  | { type: 'timeline'; title: string; after: string; unit: string; items: TimelineItem[] }
  | { type: 'bars'; title: string; after: string; unit: string; items: BarItem[] }

/** The marks' navy and the text's ink when no brand color stands out on white; muted text, the grid, the baseline. */
export const INK = '#1C2647'
export const TXT = '#1D2433'
export const MUT = '#667085'
const GRID = '#EAECF0'
const BASE = '#C9CED6'
export const CHART_W = 600

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
const clean = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** The charts a document carries, checked again: a timeline or bars, two to twelve items, numbers that make sense. */
export function checkCharts(list: unknown): Chart[] {
  const arr = Array.isArray(list) ? list : []
  const out: Chart[] = []
  for (const raw of arr.filter((v) => v && typeof v === 'object' && (v.type === 'timeline' || v.type === 'bars') && Array.isArray(v.items)).slice(0, 2)) {
    const v = raw as Record<string, unknown>
    const items = (v.items as unknown[]).slice(0, 12)
    const head = { title: clean(v.title, 120), after: String(v.after ?? ''), unit: clean(v.unit, 20) }
    if (v.type === 'timeline') {
      const list = items
        .map((x) => {
          const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
          return { label: clean(o.label, 60), start: num(o.start), end: num(o.end) }
        })
        .filter((x) => x.label && Number.isFinite(x.start) && Number.isFinite(x.end) && x.start >= 0 && x.end >= x.start && x.end <= 520)
      if (list.length >= 2) out.push({ type: 'timeline', ...head, items: list })
    } else {
      const list = items
        .map((x) => {
          const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
          return { label: clean(o.label, 60), value: num(o.value) }
        })
        .filter((x) => x.label && Number.isFinite(x.value) && x.value >= 0 && x.value < 1e12)
      if (list.length >= 2) out.push({ type: 'bars', ...head, items: list })
    }
  }
  return out
}

/** A section title as charts name it: lowercase, anything but letters and digits as one space. */
export function chartKey(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A brand color as #RRGGBB, or '' when it is not one. */
export function hex(v: unknown): string {
  const s = String(v ?? '')
    .replace(/^#/, '')
    .toUpperCase()
  return /^[0-9A-F]{6}$/.test(s) ? '#' + s : ''
}

/** A brand color for the marks only when it stands out on white (3:1), else the fallback. */
export function inkOf(h: unknown, fallback: string): string {
  const x = hex(h)
  if (!x) return fallback
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(x.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  return 1.05 / (L + 0.05) >= 3 ? x : fallback
}

const r1 = (n: number) => Math.round(n * 10) / 10
/** About how wide a text is at a size (the current dashboard's estimate). */
const tw = (s: string, px: number) => String(s).length * px * 0.56
export function fmtNum(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-US')
}
function plural(u: string): string {
  const t = String(u || '').trim()
  return !t ? '' : /s$/i.test(t) ? t : t + 's'
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** "Week 3", "Weeks 1 to 2", or "1 to 2" with no unit. */
export function rangeText(c: { unit: string }, x: TimelineItem): string {
  const one = x.end === x.start
  return (c.unit ? cap(one ? c.unit : plural(c.unit)) + ' ' : '') + fmtNum(x.start) + (one ? '' : ' to ' + fmtNum(x.end))
}

/** A bar's value as it shows: "1,250 hrs". */
export function barValue(c: { unit: string }, x: BarItem): string {
  return fmtNum(x.value) + (c.unit ? ' ' + c.unit : '')
}

/** A chart as one line of text, as the client proposal workflow writes it in the markdown. */
export function chartText(c: Chart): string {
  const parts =
    c.type === 'timeline'
      ? c.items.map((x) => x.label + ' (' + (c.unit ? c.unit + 's ' : '') + x.start + (x.end !== x.start ? ' to ' + x.end : '') + ')')
      : c.items.map((x) => x.label + ': ' + x.value + (c.unit ? ' ' + c.unit : ''))
  return 'Chart: ' + (c.title || 'Chart') + '. ' + parts.join('; ') + '.'
}

export type Span = { text: string; fill: string; weight?: number }
export type Shape =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { k: 'label'; x: number; y: number; anchor: 'start' | 'end' | 'middle'; size: number; spans: Span[] }
  | { k: 'lines'; x: number; y: number; size: number; fill: string; lines: string[]; title: string }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: string; title: string }
  | { k: 'bar'; d: string; fill: string; title: string }

export type ChartLayout = { H: number; shapes: Shape[]; head: [string, string]; rows: [string, string][] }

/** A bar grows from the baseline: square there, its data end rounded. */
export function barPath(x: number, y: number, w: number, h: number, r: number): string {
  if (!(w > 0)) return ''
  const rr = Math.min(r, w, h / 2)
  const X = r1(x)
  const Y = r1(y)
  const R = r1(x + w)
  const B = r1(y + h)
  return `M${X},${Y}H${r1(x + w - rr)}Q${R},${Y} ${R},${r1(y + rr)}V${r1(y + h - rr)}Q${R},${B} ${r1(x + w - rr)},${B}H${X}Z`
}

/** Where everything goes in a 600-wide drawing, with the same chart as a table for screen readers. */
export function layoutChart(c: Chart, color: string, ink: string): ChartLayout {
  const W = CHART_W
  const n = c.items.length
  const shapes: Shape[] = []
  const rows: [string, string][] = []
  if (c.type === 'timeline') {
    const lo = Math.min(...c.items.map((x) => x.start))
    const hi = Math.max(...c.items.map((x) => x.end))
    // whole weeks (or months): item "1 to 2" covers the first two cells; anything starting at 0 is read as points
    const cells = lo >= 1 && c.items.every((x) => x.start === Math.round(x.start) && x.end === Math.round(x.end))
    const a = cells ? lo - 1 : lo
    const b = cells ? hi : Math.max(hi, lo + 1)
    const span = Math.max(1, b - a)
    const L = 6
    const R = W - 6
    const sx = (t: number) => L + ((R - L) * (t - a)) / span
    const RH = 44
    const TOP = 4
    const step = span <= 14 ? 1 : span <= 28 ? 2 : span <= 56 ? 4 : Math.ceil(span / 12)
    for (let t = a; t <= b + 1e-9; t += step) shapes.push({ k: 'line', x1: r1(sx(t)), y1: TOP, x2: r1(sx(t)), y2: TOP + n * RH, stroke: GRID })
    c.items.forEach((x, i) => {
      const y0 = TOP + i * RH
      const x0 = sx(cells ? x.start - 1 : x.start)
      const x1 = Math.max(sx(x.end), x0 + 4)
      const rg = rangeText(c, x)
      const est = tw(x.label + ' · ' + rg, 12.5)
      let tx = x0
      let an: 'start' | 'end' = 'start'
      if (tx + est > W) {
        if (x1 - est >= 0) {
          tx = x1
          an = 'end'
        } else {
          tx = 0
          an = 'start'
        }
      }
      shapes.push({ k: 'label', x: r1(tx), y: y0 + 15, anchor: an, size: 12.5, spans: [{ text: x.label, fill: ink, weight: 600 }, { text: ' · ' + rg, fill: MUT }] })
      shapes.push({ k: 'rect', x: r1(x0), y: y0 + 22, w: r1(x1 - x0), h: 14, fill: color, title: x.label + ': ' + rg })
      rows.push([x.label, rg])
    })
    const ay = TOP + n * RH + 16
    let first = true
    for (let t = cells ? a + 1 : a; t <= b + 1e-9; t += step) {
      const xx = cells ? sx(t - 0.5) : sx(t)
      shapes.push({ k: 'label', x: r1(xx), y: ay, anchor: 'middle', size: 11.5, spans: [{ text: (first && c.unit ? cap(c.unit) + ' ' : '') + fmtNum(t), fill: MUT }] })
      first = false
    }
    return { H: ay + 6, shapes, head: [c.unit ? 'Phase' : 'Item', c.unit ? cap(plural(c.unit)) : 'When'], rows }
  }
  const fmt = (x: BarItem) => barValue(c, x)
  // the labels' column fits the longest label, up to two fifths of the width; a longer label takes two lines
  const fit = Math.min(Math.max(...c.items.map((x) => tw(x.label, 13))) + 14, W * 0.4)
  const room = Math.floor((fit - 14) / (13 * 0.56))
  const lines = c.items.map((x) => {
    if (x.label.length <= room) return [x.label]
    let cut = x.label.lastIndexOf(' ', Math.min(room, Math.ceil(x.label.length / 2) + 6))
    if (cut <= 0) cut = room
    const one = x.label.slice(0, cut).trim()
    const two = x.label.slice(cut).trim()
    return [one.length > room ? one.slice(0, room - 1) + '…' : one, two.length > room ? two.slice(0, room - 1) + '…' : two]
  })
  const RH = lines.some((l) => l.length > 1) ? 40 : 30
  const TOP = 2
  const vw = Math.max(...c.items.map((x) => tw(fmt(x), 12.5))) + 10
  const x0 = fit
  const max = Math.max(...c.items.map((x) => x.value)) || 1
  const len = Math.max(40, W - vw - x0)
  shapes.push({ k: 'line', x1: r1(x0), y1: TOP, x2: r1(x0), y2: TOP + n * RH, stroke: BASE })
  c.items.forEach((x, i) => {
    const y0 = TOP + i * RH
    const cy = y0 + RH / 2
    const w = (len * x.value) / max
    const ls = lines[i]
    const cut = ls.join(' ') !== x.label
    shapes.push({ k: 'lines', x: r1(x0 - 10), y: r1(ls.length > 1 ? cy - 3 : cy + 4.5), size: 13, fill: ink, lines: ls, title: cut ? x.label : '' })
    const d = barPath(x0, cy - 9, w, 18, 4)
    if (d) shapes.push({ k: 'bar', d, fill: color, title: x.label + ': ' + fmt(x) })
    shapes.push({ k: 'label', x: r1(x0 + w + 6), y: r1(cy + 4.5), anchor: 'start', size: 12.5, spans: [{ text: fmt(x), fill: ink }] })
    rows.push([x.label, fmt(x)])
  })
  return { H: TOP + n * RH + 4, shapes, head: ['Item', c.unit ? cap(c.unit) : 'Value'], rows }
}

/**
 * A meeting prep document's markdown cut at its ## headings, with each chart at the end of the section it names (the
 * last part when no heading has that title), as v138 places them under the document's h2s.
 */
export function placeCharts(md: string, charts: Chart[]): { text: string; charts: Chart[] }[] {
  const parts: { heading: string | null; text: string; charts: Chart[] }[] = [{ heading: null, text: '', charts: [] }]
  let fence = false
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const m = fence ? null : line.match(/^##\s+(.*?)\s*#*\s*$/)
    if (m) parts.push({ heading: m[1], text: line + '\n', charts: [] })
    else parts[parts.length - 1].text += line + '\n'
  }
  for (const c of charts) {
    const at = parts.find((p) => p.heading !== null && chartKey(p.heading) === chartKey(c.after))
    ;(at ?? parts[parts.length - 1]).charts.push(c)
  }
  return parts.filter((p) => p.text.trim() || p.charts.length).map(({ text, charts }) => ({ text, charts }))
}
