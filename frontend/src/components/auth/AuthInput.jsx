import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

/**
 * The input used on the authentication screens.
 *
 * It is separate from the shared `FormField` on purpose: that component is also
 * used by the dashboard's profile and listing forms, and restyling it would
 * change screens this redesign is not meant to touch. The prop signature is the
 * same, so moving a field between the two is a one-word change.
 *
 * A leading icon is optional and purely for scanning — the visible label is
 * what names the field, so the icon carries no information of its own and is
 * hidden from assistive tech.
 */
function AuthInput({
  label,
  type = 'text',
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
  inputMode,
  icon: Icon,
  autoFocus,
}) {
  const { t } = useLocale()
  const id = useId()
  const errorId = `${id}-error`
  const [isRevealed, setIsRevealed] = useState(false)

  const isPassword = type === 'password'
  const inputType = isPassword && isRevealed ? 'text' : type

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-text-secondary">
        {label}
      </label>

      <div className="relative">
        {Icon ? (
          <Icon
            aria-hidden="true"
            size={16}
            className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
              error ? 'text-error/70' : 'text-text-muted'
            }`}
          />
        ) : null}

        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`h-11 w-full rounded-lg border bg-surface text-sm text-text-primary transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted/70 focus:outline-none ${
            Icon ? 'pl-10' : 'pl-3.5'
          } ${isPassword ? 'pr-11' : 'pr-3.5'} ${
            error
              ? 'border-error focus:border-error focus:ring-4 focus:ring-error/15'
              : 'border-border hover:border-text-muted/40 focus:border-primary focus:ring-4 focus:ring-primary/15'
          }`}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setIsRevealed((revealed) => !revealed)}
            aria-label={isRevealed ? t('auth.hidePassword') : t('auth.showPassword')}
            title={isRevealed ? t('auth.hidePassword') : t('auth.showPassword')}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-text-muted transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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

export default AuthInput
