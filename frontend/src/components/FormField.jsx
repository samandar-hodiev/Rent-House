import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'

// Label + input + inline error, matching the input styling used elsewhere in
// the app (FilterPanel, SearchBar). Password fields get a visibility toggle.
function FormField({
  label,
  type = 'text',
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
  inputMode,
}) {
  const { t } = useLocale()
  const id = useId()
  const errorId = `${id}-error`
  const [isRevealed, setIsRevealed] = useState(false)

  const isPassword = type === 'password'
  const inputType = isPassword && isRevealed ? 'text' : type

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-md border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 ${
            isPassword ? 'pr-11' : ''
          } ${error ? 'border-error' : 'border-border'}`}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setIsRevealed((revealed) => !revealed)}
            aria-label={isRevealed ? t('auth.hidePassword') : t('auth.showPassword')}
            title={isRevealed ? t('auth.hidePassword') : t('auth.showPassword')}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isRevealed ? (
              <EyeOff aria-hidden="true" size={16} />
            ) : (
              <Eye aria-hidden="true" size={16} />
            )}
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default FormField
