import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

const VARIANTS = {
  error: {
    icon: AlertCircle,
    className: 'border-error/30 bg-error/[0.07] text-error',
    role: 'alert',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-primary/30 bg-primary/[0.07] text-primary-hover dark:text-primary',
    role: 'status',
  },
  info: {
    icon: Info,
    className: 'border-warning/30 bg-warning/[0.07] text-warning',
    role: 'status',
  },
}

// Compact inline alert. Deliberately not a full-width banner with a big icon:
// on a form this size, a loud error box pushes the fields the user needs to fix
// off the screen.
function AuthAlert({ variant = 'error', children }) {
  const { icon: Icon, className, role } = VARIANTS[variant] ?? VARIANTS.error

  return (
    <p
      role={role}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[0.8125rem] leading-relaxed ${className}`}
    >
      <Icon aria-hidden="true" size={15} className="mt-px shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

export default AuthAlert
