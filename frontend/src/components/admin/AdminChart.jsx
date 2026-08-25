import { useCallback, useId, useRef, useState } from 'react'
import { useAdminFormat } from './adminUi'

// Where a series counts as flat. A line that wanders by a couple of per cent is
// not growing or shrinking, and colouring it green or red would read as a
// result when it is really noise.
const STEADY_BAND = 0.05

// The same question asked of a single step. Tighter than the whole-series band
// because one step covers less ground, and looser than nothing so a plateau
// that wobbles by a fraction of a per cent still reads as a plateau.
const STEP_BAND = 0.03

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

/** Which way one step went. */
function stepTrend(from, to) {
  if (from === 0) return to > 0 ? 'rising' : 'steady'
  const change = (to - from) / Math.abs(from)
  if (change > STEP_BAND) return 'rising'
  if (change < -STEP_BAND) return 'falling'
  return 'steady'
}

// Four gridlines, so a tall card reads as a chart with a scale rather than a
// line floating in an empty box.
const TICKS = 4

/**
 * A line chart, drawn as an SVG path.
 *
 * No charting library: the dashboard shows a handful of points and a shape, and
 * a dependency for that would be more code shipped than the feature is worth.
 *
 * The line is not one colour. Each step is coloured by the direction it went —
 * green climbing, amber flat, red falling — so a single series shows all three
 * at once. The colours meet through a gradient placed at the middle of each
 * step rather than at its ends, which puts the blend where the eye expects a
 * transition instead of breaking the line into stripes.
 *
 * `labels` are translation keys, or the string `'weeks'` for a series numbered
 * by week; `t` resolves them.
 */
export function LineChart({ labels, values, ariaLabel, t, tooltipKey }) {
  const gradientId = useId()
  const maskId = useId()
  const { formatNumber } = useAdminFormat()
  const plotRef = useRef(null)
  // Which point the tooltip is describing, or null when the pointer is away.
  const [active, setActive] = useState(null)

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

  // A stop at the middle of every step, so each step is unmistakably its own
  // colour and the change happens between them.
  const stops = []
  for (let i = 0; i < values.length - 1; i += 1) {
    const color = TREND_COLOR[stepTrend(values[i], values[i + 1])]
    if (i === 0) stops.push({ offset: 0, color })
    stops.push({ offset: (x(i) + x(i + 1)) / 2, color })
    if (i === values.length - 2) stops.push({ offset: width, color })
  }

  const ticks = Array.from({ length: TICKS }, (_, i) => min + (span * (TICKS - 1 - i)) / (TICKS - 1))

  const label = (index) =>
    labels === 'weeks' ? t('chart.week', { n: index + 1 }) : t(labels[index])

  const pick = useCallback(
    (event) => {
      const box = plotRef.current?.getBoundingClientRect()
      if (!box || box.width === 0) return
      const ratio = (event.clientX - box.left) / box.width
      const index = Math.round(ratio * (values.length - 1))
      setActive(Math.max(0, Math.min(values.length - 1, index)))
    },
    [values.length],
  )

  // Arrow keys walk the series, so the numbers behind the line are reachable
  // without a pointer.
  const onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setActive((current) => {
      const from = current ?? (event.key === 'ArrowRight' ? -1 : values.length)
      return Math.max(0, Math.min(values.length - 1, from + (event.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  return (
    <figure className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-0 flex-1 gap-2">
        {/* The value scale. Right-aligned against the plot so the numbers sit
            beside the gridlines they belong to. */}
        <div className="flex w-9 shrink-0 flex-col justify-between text-right text-[10px] leading-none text-text-muted">
          {ticks.map((tick) => (
            <span key={tick}>{formatNumber(Math.round(tick))}</span>
          ))}
        </div>

        <div
          ref={plotRef}
          tabIndex={0}
          role="group"
          aria-label={ariaLabel}
          onMouseMove={pick}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          className="relative min-h-0 flex-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
            className="h-full w-full"
          >
            <defs>
              {/* Horizontal: the colour depends on where along the series you
                  are, not how high the line is. */}
              <linearGradient
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2={width}
                y2="0"
              >
                {stops.map((stop, index) => (
                  <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} />
                ))}
              </linearGradient>

              {/* The area is the line's own gradient behind a vertical fade, so
                  the fill under each step matches that step and still softens
                  downwards. One colour, two jobs — never a second hue. */}
              {/* Most of the colour sits close to the line and the rest falls
                  away quickly. A flat wash over the whole area reads as neon on
                  a dark surface, which is not what this dashboard looks like. */}
              <linearGradient id={`${maskId}-fade`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.26" />
                <stop offset="45%" stopColor="#fff" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <mask id={maskId}>
                <rect
                  x="0"
                  y="0"
                  width={width}
                  height={height}
                  fill={`url(#${maskId}-fade)`}
                />
              </mask>
            </defs>

            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2={width}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={area} fill={`url(#${gradientId})`} mask={`url(#${maskId})`} />
            <path
              d={line}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="1.5"
              // The stroke would scale with the viewBox otherwise, and a chart
              // stretched to fill a tall card would draw a wedge.
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {active !== null ? (
              <>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1="0"
                  y2={height}
                  stroke="var(--color-border)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                {/* A degenerate line rather than a circle: the viewBox is
                    stretched to fill the card, so a circle would come out an
                    ellipse, and one with `r="0"` is not rendered at all. A
                    zero-length segment with a round cap draws a true dot at any
                    aspect ratio. */}
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={y(values[active])}
                  y2={y(values[active])}
                  stroke={
                    TREND_COLOR[
                      stepTrend(
                        values[Math.max(0, active - 1)],
                        values[Math.min(values.length - 1, active + 1)],
                      )
                    ]
                  }
                  strokeWidth="6"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>

          {active !== null ? (
            <div
              role="status"
              style={{
                left: `${x(active)}%`,
                top: `${(y(values[active]) / height) * 100}%`,
              }}
              // Placed relative to the point, then flipped at the edges: a box
              // centred on the first or last point would hang outside the card,
              // and one above a point near the top would cover the heading.
              className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1.5 text-left shadow-[0_2px_10px_rgba(15,23,42,0.14)] ${
                x(active) < 15 ? '' : x(active) > 85 ? '-translate-x-full' : '-translate-x-1/2'
              } ${
                (y(values[active]) / height) * 100 < 30
                  ? 'translate-y-[10px]'
                  : '-translate-y-[calc(100%+10px)]'
              }`}
            >
              <span className="block text-[11px] font-medium text-text-primary">
                {label(active)}
              </span>
              <span className="mt-0.5 block text-[11px] text-text-secondary">
                {t(tooltipKey, { count: formatNumber(values[active]) })}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* The legend, not a verdict: the line carries all three directions, so
          naming just one of them would contradict what is on screen. It also
          keeps the meaning off colour alone. */}
      <figcaption className="flex flex-col gap-1.5 pl-11">
        <span className="flex justify-between gap-1 text-[11px] text-text-muted">
          {values.map((_, index) => (
            <span key={index} className={active === index ? 'font-medium text-text-primary' : ''}>
              {label(index)}
            </span>
          ))}
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {['rising', 'steady', 'falling'].map((trend) => (
            <span key={trend} className={`flex items-center gap-1 ${TREND_TEXT[trend]}`}>
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: TREND_COLOR[trend] }}
              />
              {t(`chart.${trend}`)}
            </span>
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
