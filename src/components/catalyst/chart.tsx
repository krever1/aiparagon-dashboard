import { type Chart, CHART_W, layoutChart } from '@/lib/catalyst/charts'

/**
 * A chart in a document (v138Chart): the drawing, hidden from screen readers, and the same numbers as a table, which
 * screen readers read and a phone shows in place of the drawing (the .chart-* styles in globals.css). `color` is the
 * marks' color, `ink` the text's.
 */
export function ChartFigure({ chart, color, ink }: { chart: Chart; color: string; ink: string }) {
  const L = layoutChart(chart, color, ink)
  return (
    <figure className="chart-fig" data-chart={chart.type}>
      {chart.title ? <figcaption>{chart.title}</figcaption> : null}
      <svg viewBox={`0 0 ${CHART_W} ${L.H}`} width={CHART_W} height={L.H} aria-hidden="true" focusable="false">
        {L.shapes.map((s, i) => {
          if (s.k === 'line') return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={1} />
          if (s.k === 'rect') {
            return (
              <rect key={i} className="mk" x={s.x} y={s.y} width={s.w} height={s.h} rx={4} fill={s.fill}>
                <title>{s.title}</title>
              </rect>
            )
          }
          if (s.k === 'bar') {
            return (
              <path key={i} className="mk" fill={s.fill} d={s.d}>
                <title>{s.title}</title>
              </path>
            )
          }
          if (s.k === 'lines') {
            return (
              <text key={i} x={s.x} y={s.y} textAnchor="end" fontSize={s.size} fill={s.fill}>
                {s.lines.map((t, k) => (
                  <tspan key={k} x={s.x} dy={k ? 15 : undefined}>
                    {t}
                  </tspan>
                ))}
                {s.title ? <title>{s.title}</title> : null}
              </text>
            )
          }
          return (
            <text key={i} x={s.x} y={s.y} textAnchor={s.anchor} fontSize={s.size}>
              {s.spans.map((p, k) => (
                <tspan key={k} fill={p.fill} fontWeight={p.weight}>
                  {p.text}
                </tspan>
              ))}
            </text>
          )
        })}
      </svg>
      <div className="chart-tbl">
        <table>
          {chart.title ? <caption>{chart.title}</caption> : null}
          <thead>
            <tr>
              <th scope="col">{L.head[0]}</th>
              <th scope="col">{L.head[1]}</th>
            </tr>
          </thead>
          <tbody>
            {L.rows.map(([a, b], i) => (
              <tr key={i}>
                <th scope="row">{a}</th>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
