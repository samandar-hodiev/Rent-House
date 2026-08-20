import { Mail, Phone } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

// The phone / email switch on the first registration step.
function MethodChoice({ value, onChange }) {
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
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.id)}
            className={`flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isActive
                ? 'bg-surface font-medium text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <span className={isActive ? 'text-primary' : ''}>{option.icon}</span>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default MethodChoice
