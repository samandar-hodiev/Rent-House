import { Mail, Phone } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

// The phone / email switch on the first registration step.
//
// `disabled` names option ids that can be seen but not chosen — used while
// phone registration has no SMS provider behind it yet (see RegisterPage's
// PHONE_REGISTRATION_ENABLED). Kept visible rather than removed: the option
// existing but explained is a clearer state than it quietly disappearing.
function MethodChoice({ value, onChange, disabled = [] }) {
  const { t } = useLocale()

  const options = [
    { id: 'phone', label: t('auth.viaPhone'), icon: <Phone aria-hidden="true" size={16} /> },
    { id: 'email', label: t('auth.viaEmail'), icon: <Mail aria-hidden="true" size={16} /> },
  ]

  return (
    // A segmented control rather than two loose buttons: the pair reads as one
    // switch, which is what it is.
    <div
      role="radiogroup"
      aria-label={t('auth.methodLabel')}
      className="grid grid-cols-1 gap-1 rounded-xl border border-border bg-surface-secondary/60 p-1 min-[321px]:grid-cols-2"
    >
      {options.map((option) => {
        const isActive = option.id === value
        const isDisabled = disabled.includes(option.id)
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            title={isDisabled ? t('auth.methodTemporarilyUnavailable') : undefined}
            onClick={() => {
              if (!isDisabled) onChange(option.id)
            }}
            className={`flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isDisabled
                ? 'cursor-not-allowed text-text-muted/50'
                : isActive
                  ? 'bg-surface font-medium text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <span className={isActive && !isDisabled ? 'text-primary' : ''}>{option.icon}</span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default MethodChoice
