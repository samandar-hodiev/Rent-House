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
    <div role="radiogroup" aria-label={t('auth.methodLabel')} className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const isActive = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.id)}
            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isActive
                ? 'border-primary bg-primary-light font-medium text-primary-hover dark:text-primary'
                : 'border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default MethodChoice
