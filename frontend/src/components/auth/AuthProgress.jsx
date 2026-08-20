import { Check } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

// Registration is three steps, so the user should always know which one they
// are on and how many remain. Rendered small and quiet — it is orientation,
// not decoration.
function AuthProgress({ current }) {
  const { t } = useLocale()

  const steps = [
    { id: 1, label: t('auth.stepContact') },
    { id: 2, label: t('auth.stepVerify') },
    { id: 3, label: t('auth.stepAccount') },
  ]

  return (
    <ol className="flex items-center gap-2" aria-label={t('auth.progressLabel')}>
      {steps.map((step, index) => {
        const isDone = step.id < current
        const isCurrent = step.id === current

        return (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span
                className={`h-1 rounded-full transition-colors ${
                  isDone || isCurrent ? 'bg-primary' : 'bg-border'
                }`}
              />
              <span
                className={`flex items-center gap-1 truncate text-[0.6875rem] font-medium ${
                  isCurrent ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {isDone ? (
                  <Check aria-hidden="true" size={11} className="shrink-0 text-primary" />
                ) : (
                  <span className="shrink-0 tabular-nums">{step.id}</span>
                )}
                {step.label}
              </span>
            </div>
            {/* aria-current marks the active step for assistive tech. */}
            {isCurrent ? <span className="sr-only" aria-current="step" /> : null}
            {index < steps.length - 1 ? null : null}
          </li>
        )
      })}
    </ol>
  )
}

export default AuthProgress
