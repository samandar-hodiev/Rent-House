import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, Lock, TriangleAlert } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import AuthAlert from '../components/auth/AuthAlert'
import AuthButton from '../components/auth/AuthButton'
import AuthInput from '../components/auth/AuthInput'
import { useLocale } from '../context/LocaleContext'
import { ApiError } from '../services/apiClient'
import { resetPassword, validateResetToken } from '../services/authApi'
import { ROUTES } from '../routes/paths'

// The same minimum the registration form and the server both enforce.
const MIN_PASSWORD = 8

/**
 * Sets a new password from an emailed link.
 *
 * The token is checked before the form is drawn, so somebody arriving with an
 * expired link is told so immediately rather than after filling the form in.
 * The check is a courtesy: the reset endpoint validates the token again, and
 * that is the one that decides.
 */
function ResetPasswordPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  // checking | valid | invalid | done
  const [state, setState] = useState('checking')
  const [values, setValues] = useState({ password: '', confirmation: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setState('invalid')
      return undefined
    }

    const controller = new AbortController()
    validateResetToken(token, { signal: controller.signal })
      .then(() => {
        if (!controller.signal.aborted) setState('valid')
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return
        // Only an explicit refusal means the link is bad. A network fault says
        // nothing about the token, so the form is still offered and the submit
        // decides.
        setState(error instanceof ApiError ? 'invalid' : 'valid')
      })

    return () => controller.abort()
  }, [token])

  const setField = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFormError(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const nextErrors = {}
    if (!values.password) nextErrors.password = t('auth.errorRequired')
    else if (values.password.length < MIN_PASSWORD) {
      nextErrors.password = t('auth.errorPasswordShort')
    }
    if (!values.confirmation) nextErrors.confirmation = t('auth.errorRequired')
    else if (values.confirmation !== values.password) {
      nextErrors.confirmation = t('auth.errorPasswordMatch')
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    setFormError(null)
    try {
      await resetPassword({ token, password: values.password })
      setState('done')
    } catch (caught) {
      // The link can expire between loading the page and submitting it, so the
      // invalid state is reachable from here too.
      if (caught instanceof ApiError && caught.code === 'invalid_token') {
        setState('invalid')
        return
      }
      setFormError(t('auth.errorUnexpected'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (state === 'checking') {
    return (
      <AuthLayout title={t('auth.resetTitle')}>
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
          <Loader2 aria-hidden="true" size={16} className="animate-spin" />
          {t('auth.checkingLink')}
        </p>
      </AuthLayout>
    )
  }

  if (state === 'invalid') {
    return (
      <AuthLayout title={t('auth.resetInvalidTitle')} subtitle={t('auth.resetInvalidBody')}>
        <div className="flex flex-col items-center gap-5">
          <span className="flex size-14 items-center justify-center rounded-full bg-error/10 text-error">
            <TriangleAlert aria-hidden="true" size={26} strokeWidth={1.75} />
          </span>
          <Link
            to={ROUTES.forgotPassword}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.resetGetNewLink')}
          </Link>
          <Link
            to={ROUTES.login}
            className="text-sm font-medium text-text-secondary transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (state === 'done') {
    return (
      <AuthLayout title={t('auth.resetDoneTitle')} subtitle={t('auth.resetDoneBody')}>
        <div className="flex flex-col items-center gap-5">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-light text-primary-hover dark:text-primary">
            <CheckCircle2 aria-hidden="true" size={26} strokeWidth={1.75} />
          </span>
          <button
            type="button"
            onClick={() => navigate(ROUTES.login)}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.loginTitle')}
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSubtitle')}
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
          label={t('auth.newPassword')}
          type="password"
          value={values.password}
          onChange={setField('password')}
          error={errors.password}
          autoComplete="new-password"
          icon={Lock}
        />
        <AuthInput
          label={t('auth.confirmNewPassword')}
          type="password"
          value={values.confirmation}
          onChange={setField('confirmation')}
          error={errors.confirmation}
          autoComplete="new-password"
          icon={Lock}
        />

        <AuthButton loading={isSubmitting} loadingLabel={t('auth.resetting')}>
          {t('auth.resetSubmit')}
        </AuthButton>
      </form>
    </AuthLayout>
  )
}

export default ResetPasswordPage
