import { useState } from 'react'
import { AtSign, MailCheck } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import AuthAlert from '../components/auth/AuthAlert'
import AuthButton from '../components/auth/AuthButton'
import AuthInput from '../components/auth/AuthInput'
import { Link } from 'react-router-dom'
import { useLocale } from '../context/LocaleContext'
import { requestPasswordReset } from '../services/authApi'
import { ROUTES } from '../routes/paths'

// The same shape the other auth forms accept. Kept here rather than imported
// from the login page so this file does not depend on that one's internals.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Asks for a password-reset link.
 *
 * The success state deliberately says "if that email belongs to an account"
 * rather than confirming it does. Anything more specific would turn this form
 * into a way to ask the server which addresses are registered — so the page
 * shows the same message either way, and the server answers the same way too.
 */
function ForgotPasswordPage() {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmed = email.trim()
    if (!trimmed) {
      setError(t('auth.errorRequired'))
      return
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(t('auth.errorEmail'))
      return
    }

    setError(null)
    setFormError(null)
    setIsSubmitting(true)
    try {
      await requestPasswordReset(trimmed.toLowerCase())
      setSent(true)
    } catch {
      // Only a request that never reached the server lands here: the endpoint
      // answers 200 whether or not the address is known.
      setFormError(t('auth.errorUnexpected'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout title={t('auth.forgotSentTitle')} subtitle={t('auth.forgotSentBody')}>
        <div className="flex flex-col items-center gap-5">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-light text-primary-hover dark:text-primary">
            <MailCheck aria-hidden="true" size={26} strokeWidth={1.75} />
          </span>
          <Link
            to={ROUTES.login}
            className="text-sm font-medium text-primary transition-colors hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
      footer={
        <p className="mt-6 text-center text-sm">
          <Link
            to={ROUTES.login}
            className="font-medium text-primary transition-colors hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.backToLogin')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <AuthAlert variant="error">{formError}</AuthAlert> : null}

        <AuthInput
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value)
            setError(null)
            setFormError(null)
          }}
          error={error}
          autoComplete="email"
          inputMode="email"
          icon={AtSign}
        />

        <AuthButton loading={isSubmitting} loadingLabel={t('auth.forgotSending')}>
          {t('auth.forgotSubmit')}
        </AuthButton>
      </form>
    </AuthLayout>
  )
}

export default ForgotPasswordPage
