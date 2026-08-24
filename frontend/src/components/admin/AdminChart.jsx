import { useId } from 'react'

/**
 * A small line chart, drawn as an SVG path.
 *
 * No charting library: the dashboard shows a handful of points and a trend,
 * and a dependency for that would be more code shipped than the feature is
 * worth. `preserveAspectRatio="none"` lets one viewBox stretch to whatever
 * width the card has, which is what makes it responsive without measuring.
 */
export function LineChart({ labels, values, ariaLabel }) {
  const gradientId = useId()
  const width = 100
  const height = 40
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  const x = (index) => (values.length === 1 ? width / 2 : (index / (values.length - 1)) * width)
  const y = (value) => height - ((value - min) / span) * (height - 4) - 2

  const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="h-28 w-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          // The stroke would stretch with the viewBox otherwise, so a wide card
          // would draw a hairline and a narrow one a slab.
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-text-muted">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </figcaption>
    </figure>
  )
}

/** A ranked list drawn as bars, for "top districts". */
export function BarList({ items, valueKey = 'listings', nameKey = 'name' }) {
  const max = Math.max(...items.map((item) => item[valueKey]), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item[nameKey]} className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-text-secondary">{item[nameKey]}</span>
            <span className="shrink-0 tabular-nums font-medium text-text-primary">
              {item[valueKey].toLocaleString('en-US')}
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
