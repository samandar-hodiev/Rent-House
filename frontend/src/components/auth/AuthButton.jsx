import { Loader2 } from 'lucide-react'

// The primary action on every auth screen.
//
// While a request is in flight the button is disabled and shows a spinner with
// its own label ("Kod yuborilmoqda..."), which both explains the wait and makes
// a double submission impossible.
function AuthButton({ children, loading, loadingLabel, type = 'submit', onClick, disabled }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
    >
      {loading ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

export default AuthButton
