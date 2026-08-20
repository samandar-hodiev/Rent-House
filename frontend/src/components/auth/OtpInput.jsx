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
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text-primary">{t('auth.otpLabel')}</span>

      {/* Equal-width boxes with a small gap: six of them must fit a 320px
          screen without the row ever scrolling sideways. */}
      <div className="flex justify-between gap-2" role="group" aria-label={t('auth.otpLabel')}>
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
            className={`h-[3.25rem] w-full min-w-0 rounded-xl border text-center text-xl font-semibold tabular-nums text-text-primary transition-[border-color,box-shadow,background-color] duration-200 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70 ${
              error
                ? 'border-error bg-error/[0.04] ring-4 ring-error/10'
                : digit.trim()
                  ? 'border-primary/60 bg-primary/[0.06]'
                  : 'border-border bg-surface hover:border-text-muted/40'
            }`}
          />
        ))}
      </div>

      {error && error.trim() ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  )
}

export default OtpInput
