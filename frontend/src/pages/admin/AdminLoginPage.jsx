import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { ADMIN_AUTH_STATUS, useAdminAuth } from '../../context/AdminAuthContext'
import { ApiError, NETWORK_ERROR } from '../../services/apiClient'
import { ADMIN_ROUTES } from '../../routes/adminPaths'
import { useAdmin } from '../../context/AdminSettingsContext'

const INPUT =
  'h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/**
 * The way into the dashboard, and the only one.
 *
 * There is no registration here by design: an administrator account is created
 * by the owner, never by whoever finds the page. Both the owner and every super
 * admin sign in through this same form — the server decides which they are, and
 * the dashboard reads that from the session rather than from the URL they came
 * to.
 */
function AdminLoginPage() {
  const { t } = useAdmin()
  const { status, signIn } = useAdminAuth()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Typing is the person addressing the problem; the old message about it
  // should not still be on screen while they do.
  useEffect(() => {
    setError(null)
  }, [email, password])

  if (status === ADMIN_AUTH_STATUS.authenticated) {
    // Back where they were headed before the guard sent them here, or the
    // dashboard if they came straight to the form.
    return <Navigate to={location.state?.from ?? ADMIN_ROUTES.dashboard} replace />
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return

    // Checked here so an empty form never becomes a request, and so the person
    // is told which field is missing rather than "invalid credentials".
    if (!email.trim()) {
      setError(t('login.emailRequired'))
      return
    }
    if (!password) {
      setError(t('login.passwordRequired'))
      return
    }

    setBusy(true)
    try {
      await signIn({ email: email.trim(), password })
    } catch (caught) {
      setError(messageFor(caught, t))
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex items-center gap-2">
            <span className="text-lg font-semibold text-text-primary">RentHouse</span>
            <span className="flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-semibold text-primary-hover dark:text-primary">
              <ShieldCheck aria-hidden="true" size={11} className="shrink-0" />
              {t('login.badge')}
            </span>
          </span>
          <h1 className="text-xl font-semibold text-text-primary">{t('login.title')}</h1>
          <p className="text-sm text-text-muted">{t('login.subtitle')}</p>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{t('login.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
              disabled={busy}
              placeholder="admin@renthouse.uz"
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{t('login.password')}</span>
            <span className="relative block">
              <input
                type={revealed ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={busy}
                className={`${INPUT} pr-11`}
              />
              <button
                type="button"
                onClick={() => setRevealed((shown) => !shown)}
                // Labelled, because an eye on its own does not say which state
                // pressing it leads to.
                aria-label={t(revealed ? 'login.hidePassword' : 'login.showPassword')}
                className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {revealed ? (
                  <EyeOff aria-hidden="true" size={16} />
                ) : (
                  <Eye aria-hidden="true" size={16} />
                )}
              </button>
            </span>
          </label>

          {error ? (
            <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : null}
            {t(busy ? 'login.signingIn' : 'login.signIn')}
          </button>

          {/* Password reset for administrators is not built yet, so this says
              what to do instead rather than leading to a page that cannot help.
              A link that quietly did nothing would be worse than none. */}
          <p className="text-center text-xs text-text-muted">{t('login.forgot')}</p>
        </form>
      </div>
    </main>
  )
}

/** What to tell the person, from what the server said. */
function messageFor(error, t) {
  if (!(error instanceof ApiError)) return t('login.errorUnknown')
  if (error.code === NETWORK_ERROR) return t('login.errorNetwork')

  switch (error.code) {
    case 'invalid_credentials':
      // Deliberately the same for an unknown address and a wrong password:
      // anything else turns this form into a way to ask who has an account.
      return t('login.errorCredentials')
    case 'account_inactive':
      return t('login.errorInactive')
    case 'account_suspended':
      return t('login.errorSuspended')
    case 'validation_failed':
      return t('login.errorCredentials')
    default:
      return error.status >= 500 ? t('login.errorNetwork') : t('login.errorUnknown')
  }
}

export default AdminLoginPage
