import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatCount, formatPeriod, formatPointHeading } from '../../utils/formatPeriod'

/**
 * Interactive multi-series line chart for the dashboard.
 *
 * Hand-drawn SVG rather than a charting library: the geometry is a few dozen
 * lines, and a library would add a dependency, a second theming system to keep
 * in step with the design tokens, and a bundle far larger than the feature.
 *
 * The viewBox tracks the container's measured pixel width, so one SVG unit is
 * always one CSS pixel. A fixed viewBox would letterbox — the browser preserves
 * its aspect ratio and the drawing floats in the middle of a wide card with
 * dead margins either side — and `preserveAspectRatio="none"` would fill the
 * card but stretch the stroke weights and the axis type with it. Measuring
 * costs one ResizeObserver and keeps the chart pixel-honest at every width,
 * which is also why it can never overflow its container.
 *
 * Props:
 *   points  [{ date, daily, weekly, monthly }] — one row per day
 *   series  [{ id, label, color }] — the series to draw, in legend order
 *
 * Chart and tooltip both read `points`, so a value can never disagree with the
 * line it was read from.
 */

const HEIGHT = 260
const FALLBACK_W = 720
const PAD = { top: 16, right: 12, bottom: 26, left: 44 }
const PLOT_H = HEIGHT - PAD.top - PAD.bottom
const GRID_LINES = 4
const TOOLTIP_GAP = 12
const EDGE_MARGIN = 8

// Below this the readout stops floating over the plot and sits underneath it
// instead. On a phone a three-row tooltip is nearly as wide as the chart, so
// as an overlay it hides the very line it is describing.
const NARROW_W = 480

// Rounds an axis maximum up to something a person would choose, so the labels
// read 0 / 500 / 1000 rather than 0 / 428 / 856.
function niceCeiling(value) {
  if (value <= 0) return GRID_LINES
  const step = Math.pow(10, Math.floor(Math.log10(value / GRID_LINES)))
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    const candidate = step * multiple * GRID_LINES
    if (candidate >= value) return candidate
  }
  return Math.ceil(value / GRID_LINES) * GRID_LINES
}

// Catmull-Rom converted to cubic Béziers: a curve that passes through every
// data point, unlike a plain smoothing spline. Tension is low, so the line
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

// dd.MM — short enough that four never collide, even at 320px.
function shortDate(iso) {
  const [, month, day] = iso.split('-')
  return `${day}.${month}`
}

function ViewsChart({ points, series, t }) {
  const gradientPrefix = useId()
  const containerRef = useRef(null)
  const tooltipRef = useRef(null)
  const [width, setWidth] = useState(FALLBACK_W)
  const [active, setActive] = useState(null)
  const [tooltipWidth, setTooltipWidth] = useState(0)

  // Fires once on attach, so the fallback width only ever covers the first
  // paint before layout is known.
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

  // A touch leaves the tooltip open — there is no pointerleave to close it —
  // so a tap anywhere else dismisses it.
  useEffect(() => {
    if (!active) return undefined
    const handleAway = (event) => {
      if (!containerRef.current?.contains(event.target)) setActive(null)
    }
    document.addEventListener('pointerdown', handleAway)
    return () => document.removeEventListener('pointerdown', handleAway)
  }, [active])

  // Measured rather than estimated, so the clamp below uses the tooltip's real
  // width whatever the longest label in the active language turns out to be.
  useEffect(() => {
    if (!active || !tooltipRef.current) return
    setTooltipWidth(tooltipRef.current.offsetWidth)
  }, [active])

  const geometry = useMemo(() => {
    const length = points.length
    if (length === 0 || series.length === 0) return null

    const plotW = Math.max(width - PAD.left - PAD.right, 1)
    const x = (index) => PAD.left + (length === 1 ? plotW / 2 : (index / (length - 1)) * plotW)

    // With one series the axis shows its real numbers. With several, the totals
    // differ by orders of magnitude — a month of views dwarfs a single day — so
    // each line is scaled against its own peak and the axis drops its numbers
    // rather than printing figures that would be true for only one of the three
    // lines. The tooltip carries the exact values in both modes.
    const isComparison = series.length > 1
    const sharedMax = niceCeiling(
      Math.max(...series.flatMap((line) => points.map((point) => point[line.id]))),
    )

    const scaleFor = (line) =>
      isComparison
        ? Math.max(...points.map((point) => point[line.id])) || 1
        : sharedMax

    const baseline = PAD.top + PLOT_H
    const yFor = (line) => {
      const max = scaleFor(line)
      return (value) => PAD.top + PLOT_H - (value / max) * PLOT_H
    }

    const lines = series.map((line) => {
      const y = yFor(line)
      const coords = points.map((point, index) => ({ x: x(index), y: y(point[line.id]) }))
      const path = smoothPath(coords)
      return {
        ...line,
        coords,
        path,
        // Closed down to the baseline for the fill underneath.
        area: `${path} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`,
      }
    })

    const ticks = Array.from({ length: GRID_LINES + 1 }, (_, index) => {
      const value = (sharedMax / GRID_LINES) * index
      return { value, y: PAD.top + PLOT_H - (index / GRID_LINES) * PLOT_H }
    })

    // Four date labels: first, last, and two evenly spaced between.
    const last = length - 1
    const labelIndexes = [...new Set([0, Math.round(last / 3), Math.round((last * 2) / 3), last])]
    const dates = labelIndexes.map((index) => ({
      x: x(index),
      label: shortDate(points[index].date),
      index,
      isLast: index === last,
    }))

    return { lines, ticks, dates, isComparison, x, plotW, length }
  }, [points, series, width])

  // Nearest point to the pointer, which is what makes the whole plot area
  // hoverable rather than only the pixels on a line.
  const pickIndex = useCallback(
    (clientX) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || !geometry) return null
      const local = clientX - rect.left
      const ratio = (local - PAD.left) / geometry.plotW
      const index = Math.round(ratio * (geometry.length - 1))
      return Math.min(Math.max(index, 0), geometry.length - 1)
    },
    [geometry],
  )

  const handlePointer = useCallback(
    (event) => {
      const index = pickIndex(event.clientX)
      if (index === null) return
      // Only re-render when the highlighted point actually changes, which is
      // what keeps the tooltip from jittering as the pointer moves within one
      // point's slice of the plot.
      setActive((current) => (current?.index === index ? current : { index }))
    },
    [pickIndex],
  )

  if (!geometry) {
    return <div ref={containerRef} className="w-full" />
  }

  const activePoint = active ? points[active.index] : null
  const activeX = active ? geometry.x(active.index) : 0
  const isNarrow = width < NARROW_W

  // Clamped inside the chart, so a point near either edge still shows its
  // readout in full instead of running off the card.
  const rawLeft = activeX - tooltipWidth / 2
  const maxLeft = Math.max(width - tooltipWidth - EDGE_MARGIN, EDGE_MARGIN)
  const tooltipLeft = Math.min(Math.max(rawLeft, EDGE_MARGIN), maxLeft)

  // Same markup either way — only where it sits changes, so the two layouts
  // can never drift apart in content.
  const readout = activePoint ? (
    <>
      <p className="text-xs font-medium text-text-primary">
        {/* One series names its own period — a week or a month, not the day
            that was hovered. Several series share the day as a heading and
            each row states the period its figure covers. */}
        {series.length === 1
          ? formatPeriod(t, activePoint.date, series[0].id)
          : formatPointHeading(t, activePoint.date)}
      </p>

      <ul className="mt-1.5 flex flex-col gap-1">
        {series.map((line) => (
          <li key={line.id} className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: line.color }}
            />
            <span className="text-text-secondary">{line.label}</span>
            <span className="ml-auto pl-3 font-semibold text-text-primary">
              {t('dashboard.viewsCount', { count: formatCount(activePoint[line.id]) })}
            </span>
          </li>
        ))}
      </ul>
    </>
  ) : null

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={t('dashboard.viewsChartLabel')}
        className="block h-auto max-w-full touch-pan-y"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={(event) => {
          // A touch has no meaningful "leave": the finger lifts and the tooltip
          // should stay until the reader taps elsewhere.
          if (event.pointerType !== 'touch') setActive(null)
        }}
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
              {/* Three fills can sit on top of one another, so each is far
                  fainter than a single-series chart would use — heavier than
                  this and the overlap silts up into an opaque wedge along the
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
            {geometry.isComparison ? null : (
              <text
                x={PAD.left - 8}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-text-muted text-[11px]"
              >
                {formatCount(tick.value)}
              </text>
            )}
          </g>
        ))}

        {geometry.dates.map((date) => (
          <text
            key={date.index}
            x={date.x}
            y={HEIGHT - 6}
            // End labels are pulled inward so neither can be clipped.
            textAnchor={date.index === 0 ? 'start' : date.isLast ? 'end' : 'middle'}
            className="fill-text-muted text-[11px]"
          >
            {date.label}
          </text>
        ))}

        {/* The guide sits under the lines so it never cuts across them. */}
        {active ? (
          <line
            x1={activeX}
            y1={PAD.top}
            x2={activeX}
            y2={PAD.top + PLOT_H}
            className="stroke-text-muted"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        ) : null}

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
              // Draws itself once on mount. `pathLength` normalises every line
              // to 1 unit so all of them finish together whatever their length.
              pathLength="1"
              className="animate-draw-line"
            />
          </g>
        ))}

        {/* Markers last, so they sit above every line. The white ring is the
            surface token, which keeps the dot legible on either theme. */}
        {active
          ? geometry.lines.map((line) => (
              <circle
                key={line.id}
                cx={activeX}
                cy={line.coords[active.index].y}
                r="4"
                fill={line.color}
                className="stroke-surface"
                strokeWidth="2"
              />
            ))
          : null}
      </svg>

      {/* Wide: floats over the plot next to the point it describes.
          Narrow: a panel underneath, because an overlay that wide would cover
          the line the reader just tapped. */}
      {activePoint && !isNarrow ? (
        <div
          ref={tooltipRef}
          role="status"
          aria-live="polite"
          style={{ left: tooltipLeft, top: PAD.top + TOOLTIP_GAP }}
          className="pointer-events-none absolute z-10 w-max max-w-[calc(100%-1rem)] rounded-lg border border-border bg-surface px-3 py-2 shadow-md"
        >
          {readout}
        </div>
      ) : null}

      {activePoint && isNarrow ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-border bg-surface-secondary px-3 py-2"
        >
          {readout}
        </div>
      ) : null}
    </div>
  )
}

export default ViewsChart
