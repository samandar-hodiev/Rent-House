import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/auth/AuthLayout'
import AuthAlert from '../components/auth/AuthAlert'
import AuthButton from '../components/auth/AuthButton'
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
    <AuthLayout
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link
            to={ROUTES.register}
            className="font-medium text-primary transition-colors hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.registerTitle')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <AuthAlert variant="error">{formError}</AuthAlert> : null}

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

        <div className="-mt-1 flex justify-end">
          <Link
            to={ROUTES.login}
            className="text-[0.8125rem] font-medium text-text-muted transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.forgotPassword')}
          </Link>
        </div>

        <AuthButton loading={isSubmitting} loadingLabel={t('auth.signingIn')}>
          {t('auth.loginTitle')}
        </AuthButton>
      </form>
    </AuthLayout>
  )
}

export default LoginPage
