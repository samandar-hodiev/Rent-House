import { useEffect, useId, useRef, useState } from 'react'
import { useAdminFormat } from './adminUi'

// Where a series counts as flat. A line that wanders by a couple of per cent is
// not growing or shrinking, and colouring it green or red would read as a
// result when it is really noise.
const STEADY_BAND = 0.05

const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 0.0015

/**
 * Which way a series is going.
 *
 * Compared end to end rather than point to point: a month that dipped in the
 * middle and finished higher has grown, and reacting to the last pair of points
 * would make the colour flicker on noise.
 */
export function trendOf(values) {
  if (!values || values.length < 2) return 'steady'
  const first = values[0]
  const last = values[values.length - 1]
  if (first === 0) return last > 0 ? 'rising' : 'steady'
  const change = (last - first) / Math.abs(first)
  if (change > STEADY_BAND) return 'rising'
  if (change < -STEADY_BAND) return 'falling'
  return 'steady'
}

// One colour per direction, taken from the tokens the rest of the app uses, so
// green still means good and red still means trouble. The line and the area
// under it are the same hue — the fill is the line's own colour faded out,
// never a second colour that happens to sit nearby.
const TREND_COLOR = {
  rising: 'var(--color-primary)',
  steady: 'var(--color-warning)',
  falling: 'var(--color-error)',
}

const TREND_TEXT = {
  rising: 'text-primary',
  steady: 'text-warning',
  falling: 'text-error',
}

/**
 * A small line chart, drawn as an SVG path.
 *
 * No charting library: the dashboard shows a handful of points and a trend, and
 * a dependency for that would be more code shipped than the feature is worth.
 *
 * The wheel zooms, but only while the pointer is over the chart and only after
 * the chart has decided to take the gesture — see `onWheel`.
 */
export function LineChart({ labels, values, ariaLabel, trendLabel }) {
  const gradientId = useId()
  const [zoom, setZoom] = useState(1)
  // The live zoom value, separate from the state that renders it: wheel events
  // arrive faster than paints, so each one has to read what the previous one
  // decided rather than the value from the last render.
  const zoomRef = useRef(1)
  const frameRef = useRef(null)
  const boxRef = useRef(null)

  const trend = trendOf(values)
  const color = TREND_COLOR[trend]

  const width = 100
  const height = 40
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  const x = (index) => (values.length === 1 ? width / 2 : (index / (values.length - 1)) * width)
  const y = (value) => height - ((value - min) / span) * (height - 4) - 2

  const line = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`)
    .join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  // Zooming scales the drawing inside its box and lets the box clip, so every
  // point stays in the path — nothing is dropped or recomputed, and zooming
  // back out restores exactly what was there.
  //
  // Subscribed by hand rather than through React's `onWheel`, because React
  // registers wheel at the root as a passive listener and a passive listener's
  // `preventDefault()` does nothing: the chart would zoom and the page would
  // scroll out from under it at the same time.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return undefined

    const onWheel = (event) => {
      const next = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, zoomRef.current - event.deltaY * ZOOM_STEP),
      )
      // The page keeps its scroll unless the chart actually consumed the
      // gesture. At the ends of the range it does not, so scrolling past a
      // fully zoomed-out chart carries on down the page as usual.
      if (next === zoomRef.current) return
      event.preventDefault()
      zoomRef.current = next
      if (frameRef.current) return
      // Coalesced into one paint per frame: a trackpad emits wheel events far
      // faster than the screen refreshes.
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        setZoom(zoomRef.current)
      })
    }

    box.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      box.removeEventListener('wheel', onWheel)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <figure className="flex flex-col gap-2">
      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-md"
        style={{ touchAction: 'pan-y' }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
          className="h-40 w-full origin-bottom-left transition-transform duration-100 ease-out"
          style={{ transform: `scale(${zoom})` }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            // The stroke would scale with the viewBox and with the zoom
            // otherwise, so a zoomed chart would draw a slab.
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        {zoom > 1 ? (
          <span className="pointer-events-none absolute right-1 top-1 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-muted">
            {zoom.toFixed(1)}×
          </span>
        ) : null}
      </div>

      {/* The trend gets its own row. Sharing one with the axis labels put it
          hard against the last of them, and the two say different kinds of
          thing anyway. */}
      <figcaption className="flex flex-col gap-1 text-[11px] text-text-muted">
        {trendLabel ? (
          <span className={`self-end font-medium ${TREND_TEXT[trend]}`}>{trendLabel(trend)}</span>
        ) : null}
        <span className="flex justify-between gap-1">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * A ranked list drawn as bars.
 *
 * Ordered by value here rather than trusting the array, so the chart stays
 * correct when this is swapped for an API response — the server is under no
 * obligation to sort.
 */
export function BarList({ items, valueKey = 'activeListings', nameKey = 'name', scroll = false }) {
  const { formatNumber } = useAdminFormat()
  const ordered = [...items].sort((a, b) => b[valueKey] - a[valueKey])
  const max = Math.max(...ordered.map((item) => item[valueKey]), 1)

  return (
    <ul
      className={`flex flex-col gap-2.5 ${
        // Tall enough for all twelve at a desktop size, so the usual case is
        // the whole list at a glance. On a short window it scrolls inside
        // itself rather than dragging the dashboard down the page, using the
        // same quiet scrollbar chat uses.
        scroll ? 'chat-scroll max-h-[28rem] overflow-y-auto pr-1' : ''
      }`}
    >
      {ordered.map((item) => (
        <li key={item[nameKey]} className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-text-secondary">{item[nameKey]}</span>
            <span className="shrink-0 tabular-nums font-medium text-text-primary">
              {formatNumber(item[valueKey])}
            </span>
          </span>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.round((item[valueKey] / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}
