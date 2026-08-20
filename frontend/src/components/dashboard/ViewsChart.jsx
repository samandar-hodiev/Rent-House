import { useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * Multi-series line chart for the dashboard.
 *
 * Hand-drawn SVG rather than a charting library: one chart with three lines is
 * a few dozen lines of geometry, and a library would add a dependency, a second
 * theming system to keep in step with the design tokens, and a bundle cost far
 * larger than the feature.
 *
 * The viewBox tracks the container's measured pixel width, so one SVG unit is
 * always one CSS pixel. A fixed viewBox would letterbox: the browser preserves
 * its aspect ratio and the drawing floats in the middle of a wide card with
 * dead margins on both sides. Setting `preserveAspectRatio="none"` instead
 * would fill the card but stretch the stroke weights and the axis type with it.
 * Measuring costs one ResizeObserver and keeps the chart pixel-honest at every
 * width, which is also why it can never overflow its container.
 *
 * `series` is `[{ id, label, color, points: [{ date, value }] }]`. All series
 * must share an x-axis length and a unit; the caller guarantees that.
 */

// Room for the y labels on the left and the date labels underneath. The plot
// area is what is left over.
const HEIGHT = 260
const FALLBACK_W = 720
const PAD = { top: 16, right: 12, bottom: 26, left: 36 }
const PLOT_H = HEIGHT - PAD.top - PAD.bottom
const GRID_LINES = 4

// Rounds an axis maximum up to something a person would choose, so the y labels
// read 0 / 20 / 40 / 60 rather than 0 / 17 / 34 / 51.
function niceCeiling(value) {
  if (value <= 0) return GRID_LINES
  const step = Math.pow(10, Math.floor(Math.log10(value / GRID_LINES)))
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    const candidate = step * multiple * GRID_LINES
    if (candidate >= value) return candidate
  }
  return Math.ceil(value / GRID_LINES) * GRID_LINES
}

// Catmull-Rom converted to cubic Béziers: a curve that actually passes through
// every data point, unlike a plain smoothing spline. Tension is low so the line
// stays calm and never overshoots into a value the data does not contain.
function smoothPath(coords) {
  if (coords.length < 2) return ''
  let path = `M ${coords[0].x} ${coords[0].y}`
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] ?? coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return path
}

// dd.MM — short enough that four of them never collide, even at 320px.
function shortDate(iso) {
  const [, month, day] = iso.split('-')
  return `${day}.${month}`
}

function ViewsChart({ series, ariaLabel }) {
  const gradientPrefix = useId()
  const containerRef = useRef(null)
  const [width, setWidth] = useState(FALLBACK_W)

  // The observer fires once on attach, so the fallback width is only ever used
  // for the very first paint.
  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      if (next > 0) setWidth(next)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    const length = series[0]?.points.length ?? 0
    if (length === 0) return null

    const plotW = Math.max(width - PAD.left - PAD.right, 1)
    const peak = Math.max(...series.flatMap((line) => line.points.map((point) => point.value)))
    const max = niceCeiling(peak)

    const x = (index) => PAD.left + (length === 1 ? plotW / 2 : (index / (length - 1)) * plotW)
    const y = (value) => PAD.top + PLOT_H - (value / max) * PLOT_H

    const baseline = PAD.top + PLOT_H
    const lines = series.map((line) => {
      const coords = line.points.map((point, index) => ({ x: x(index), y: y(point.value) }))
      const path = smoothPath(coords)
      return {
        ...line,
        path,
        // Close the line down to the baseline for the fill underneath.
        area: `${path} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`,
      }
    })

    const ticks = Array.from({ length: GRID_LINES + 1 }, (_, index) => {
      const value = (max / GRID_LINES) * index
      return { value, y: y(value) }
    })

    // Four date labels: first, last, and two evenly spaced between them.
    const last = length - 1
    const labelIndexes = [0, Math.round(last / 3), Math.round((last * 2) / 3), last]
    const dates = [...new Set(labelIndexes)].map((index) => ({
      x: x(index),
      label: shortDate(series[0].points[index].date),
      index,
      isLast: index === last,
    }))

    return { lines, ticks, dates }
  }, [series, width])

  return (
    <div ref={containerRef} className="w-full">
      {geometry ? (
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={ariaLabel}
          className="block h-auto max-w-full"
        >
          <defs>
            {geometry.lines.map((line) => (
              <linearGradient
                key={line.id}
                id={`${gradientPrefix}-${line.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                {/* Three fills sit on top of one another, so each has to be far
                    fainter than a single-series chart would use — at 0.16 the
                    overlap silted up into an opaque grey wedge along the
                    baseline. It fades out early for the same reason. */}
                <stop offset="0%" stopColor={line.color} stopOpacity="0.11" />
                <stop offset="70%" stopColor={line.color} stopOpacity="0.02" />
                <stop offset="100%" stopColor={line.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal grid only. Vertical rules would double the ink for
              information the date labels already carry. */}
          {geometry.ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PAD.left}
                y1={tick.y}
                x2={width - PAD.right}
                y2={tick.y}
                className="stroke-border"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-text-muted text-[11px]"
              >
                {tick.value}
              </text>
            </g>
          ))}

          {geometry.dates.map((date) => (
            <text
              key={date.index}
              x={date.x}
              y={HEIGHT - 6}
              // The end labels are pulled inward so neither can be clipped by
              // the edge of the plot.
              textAnchor={date.index === 0 ? 'start' : date.isLast ? 'end' : 'middle'}
              className="fill-text-muted text-[11px]"
            >
              {date.label}
            </text>
          ))}

          {geometry.lines.map((line) => (
            <g key={line.id}>
              <path d={line.area} fill={`url(#${gradientPrefix}-${line.id})`} />
              <path
                d={line.path}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                // Draws itself once on mount. `pathLength` normalises every
                // line to 1 unit so all three finish together regardless of
                // actual length.
                pathLength="1"
                className="animate-draw-line"
              />
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  )
}

export default ViewsChart
