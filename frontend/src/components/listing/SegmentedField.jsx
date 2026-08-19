import { useId } from 'react'

// Small set of mutually exclusive choices (rooms, currency, rental period,
// furnishing) — a row of buttons reads faster than a select at this size.
function SegmentedField({ label, options, value, onChange, error }) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-medium text-text-primary">
        {label}
      </span>

      <div
        role="radiogroup"
        aria-labelledby={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const isActive = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(option.id)}
              className={`min-w-11 rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? 'border-primary bg-primary-light font-medium text-primary-hover dark:text-primary'
                  : 'border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {error ? (
        <p id={errorId} className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default SegmentedField
