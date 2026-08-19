import { useId } from 'react'

// Long-form description with a live character counter against `maxLength`.
function TextAreaField({ label, value, onChange, error, placeholder, maxLength }) {
  const id = useId()
  const errorId = `${id}-error`
  const countId = `${id}-count`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
      </label>

      <textarea
        id={id}
        rows={6}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${error ? `${errorId} ` : ''}${countId}`}
        className={`w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          error ? 'border-error' : 'border-border'
        }`}
      />

      <div className="flex items-start justify-between gap-3">
        {error ? (
          <p id={errorId} className="text-xs text-error">
            {error}
          </p>
        ) : (
          <span />
        )}
        <p id={countId} className="shrink-0 text-xs text-text-muted">
          {value.length} / {maxLength}
        </p>
      </div>
    </div>
  )
}

export default TextAreaField
