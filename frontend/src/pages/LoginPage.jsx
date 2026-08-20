import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import { useLocale } from '../context/LocaleContext'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../services/apiClient'
import { login } from '../services/authApi'
import { ROUTES } from '../routes/paths'

function LoginPage() {
  const { t } = useLocale()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ identifier: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const setField = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFormError(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!values.identifier.trim()) nextErrors.identifier = t('auth.errorRequired')
    if (!values.password) nextErrors.password = t('auth.errorRequired')

    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const data = await login({
        identifier: values.identifier.trim(),
        password: values.password,
      })
      signIn(data.access_token, data.user)
      navigate(ROUTES.dashboard, { replace: true })
    } catch (error) {
      // The backend answers the same way for an unknown account and a wrong
      // password, and so does this form.
      if (error instanceof ApiError && error.code === 'network_error') {
        setFormError(t('auth.errorNetwork'))
      } else if (error instanceof ApiError && error.code === 'invalid_credentials') {
        setFormError(t('auth.errorCredentials'))
      } else {
        setFormError(t('auth.errorUnexpected'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link
            to={ROUTES.register}
            className="font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.registerTitle')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
          >
            {formError}
          </p>
        ) : null}

        <FormField
          label={t('auth.identifier')}
          value={values.identifier}
          onChange={setField('identifier')}
          error={errors.identifier}
          placeholder={t('auth.identifierPlaceholder')}
          autoComplete="username"
        />

        <FormField
          label={t('auth.password')}
          type="password"
          value={values.password}
          onChange={setField('password')}
          error={errors.password}
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link
            to={ROUTES.login}
            className="text-sm font-medium text-text-secondary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.forgotPassword')}
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
        >
          {isSubmitting ? t('auth.signingIn') : t('auth.loginTitle')}
        </button>
      </form>
    </AuthCard>
  )
}

export default LoginPage
