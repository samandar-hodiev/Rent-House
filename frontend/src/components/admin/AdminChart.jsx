import { Fragment, useCallback, useId, useRef, useState } from 'react'
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

const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/**
 * The axis label for one bucket the server reported.
 *
 * Month names come from the dictionary rather than from `toLocaleDateString`:
 * Chromium renders `uz-UZ` months as "M09", which is not a month name in any
 * language. Days and weeks are written as numbers, which need no translating
 * and read the same everywhere.
 */
export function periodLabel(iso, range, t) {
  const at = new Date(iso)
  if (range === 'monthly') return t(`chart.month.${MONTH_KEYS[at.getMonth()]}`)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}`
}

/**
 * A line chart, drawn as an SVG path.
 *
 * No charting library: the dashboard shows a handful of points and a shape, and
 * a dependency for that would be more code shipped than the feature is worth.
 *
 * The line is not one colour. Each step is coloured by the direction it went —
 * green climbing, amber flat, red falling — so a single series shows all three
 * at once, and each colour keeps to its own stretch: the steps are drawn as
 * separate paths in flat colour, never blended into one another.
 *
 * The fill under the line follows the same division. One area shape is drawn
 * once per colour and clipped to the steps that colour belongs to, so the
 * boundary is a clean change of hue on continuous geometry — no seam where two
 * shapes meet, and no double-strength band where two translucent fills would
 * otherwise overlap.
 *
 * `labels` are translation keys, or the string `'weeks'` for a series numbered
 * by week; `t` resolves them.
 */
export function LineChart({ labels, values, ariaLabel, t, tooltipKey }) {
  const uid = useId()
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

  // One entry per step, each knowing where it runs and which way it went.
  const steps = values.slice(0, -1).map((value, index) => ({
    index,
    from: x(index),
    to: x(index + 1),
    d: `M${x(index)},${y(value)} L${x(index + 1)},${y(values[index + 1])}`,
    trend: stepTrend(value, values[index + 1]),
  }))

  // Grouped by colour, so each fill is drawn once and clipped to its stretches
  // rather than once per step.
  const trends = [...new Set(steps.map((step) => step.trend))]

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
              {trends.map((trend) => (
                <Fragment key={trend}>
                  {/* Flat colour fading downwards — the fill under a step, in
                      that step's own hue. Anchored to the plot rather than to
                      each shape's own box, so every stretch fades on the same
                      scale and neighbours line up. Kept faint: this sits behind
                      the numbers, not in front of them. */}
                  <linearGradient
                    id={`${uid}-fill-${trend}`}
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2={height}
                  >
                    <stop offset="0%" stopColor={TREND_COLOR[trend]} stopOpacity="0.24" />
                    <stop offset="55%" stopColor={TREND_COLOR[trend]} stopOpacity="0.07" />
                    <stop offset="100%" stopColor={TREND_COLOR[trend]} stopOpacity="0" />
                  </linearGradient>

                  <clipPath id={`${uid}-clip-${trend}`}>
                    {steps
                      .filter((step) => step.trend === trend)
                      .map((step) => (
                        <rect
                          key={step.index}
                          x={step.from}
                          y="0"
                          width={step.to - step.from}
                          height={height}
                        />
                      ))}
                  </clipPath>
                </Fragment>
              ))}
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

            {trends.map((trend) => (
              <path
                key={trend}
                d={area}
                fill={`url(#${uid}-fill-${trend})`}
                clipPath={`url(#${uid}-clip-${trend})`}
              />
            ))}

            {steps.map((step) => (
              <path
                key={step.index}
                d={step.d}
                fill="none"
                stroke={TREND_COLOR[step.trend]}
                strokeWidth="1.5"
                // The stroke would scale with the viewBox otherwise, and a
                // chart stretched to fill a tall card would draw a wedge.
                vectorEffect="non-scaling-stroke"
                // Round caps let neighbouring steps meet without a notch at the
                // corner. The strokes are opaque, so the overlap does not show.
                strokeLinecap="round"
              />
            ))}

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
