import { useEffect, useRef } from 'react'
import { useLocale } from '../../context/LocaleContext'

const LENGTH = 6

// Six single-character boxes that behave like one field: typing advances,
// backspace retreats, and a pasted code fills the row.
function OtpInput({ value, onChange, error, disabled }) {
  const { t } = useLocale()
  const inputsRef = useRef([])

  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('')

  useEffect(() => {
    // Land the caret in the first box so a user can start typing immediately.
    inputsRef.current[0]?.focus()
  }, [])

  const setDigit = (index, digit) => {
    const next = digits.map((d, i) => (i === index ? digit : d)).join('')
    onChange(next.replace(/\s/g, ''))
  }

  const handleChange = (index) => (event) => {
    // Take only the last character typed, so overwriting a filled box works.
    const raw = event.target.value.replace(/\D/g, '')
    if (!raw) {
      setDigit(index, ' ')
      return
    }

    if (raw.length > 1) {
      // A paste: spread it across this box and the ones after it.
      const spread = raw.slice(0, LENGTH - index).split('')
      const next = [...digits]
      spread.forEach((digit, offset) => {
        next[index + offset] = digit
      })
      onChange(next.join('').replace(/\s/g, ''))
      inputsRef.current[Math.min(index + spread.length, LENGTH - 1)]?.focus()
      return
    }

    setDigit(index, raw)
    if (index < LENGTH - 1) inputsRef.current[index + 1]?.focus()
  }

  const handleKeyDown = (index) => (event) => {
    if (event.key === 'Backspace' && digits[index].trim() === '' && index > 0) {
      // Empty box: step back rather than doing nothing.
      event.preventDefault()
      inputsRef.current[index - 1]?.focus()
      setDigit(index - 1, ' ')
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputsRef.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      event.preventDefault()
      inputsRef.current[index + 1]?.focus()
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{t('auth.otpLabel')}</span>

      {/* `gap-1.5` and a min-width rather than a fixed one: six boxes must fit
          a 320px screen without the row scrolling sideways. */}
      <div className="flex justify-between gap-1.5" role="group" aria-label={t('auth.otpLabel')}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              inputsRef.current[index] = node
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={LENGTH}
            value={digit.trim()}
            disabled={disabled}
            onChange={handleChange(index)}
            onKeyDown={handleKeyDown(index)}
            aria-label={t('auth.otpDigit', { index: index + 1 })}
            aria-invalid={error ? true : undefined}
            className={`h-12 w-full min-w-0 rounded-md border bg-surface text-center text-lg font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              error ? 'border-error' : 'border-border'
            }`}
          />
        ))}
      </div>

      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  )
}

export default OtpInput
