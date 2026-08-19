import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import { useLocale } from '../context/LocaleContext'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from '../routes/paths'

function LoginPage() {
  const { t } = useLocale()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ identifier: '', password: '' })
  const [errors, setErrors] = useState({})
  const [isValid, setIsValid] = useState(false)

  const setField = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setIsValid(false)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!values.identifier.trim()) nextErrors.identifier = t('auth.errorRequired')
    if (!values.password) nextErrors.password = t('auth.errorRequired')

    setErrors(nextErrors)
    const ok = Object.keys(nextErrors).length === 0
    setIsValid(ok)
    if (ok) {
      // UI-only session: no request, no credential check, no token. It only
      // flips the signed-in header/dashboard state.
      signIn()
      navigate(ROUTES.dashboardProfile)
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
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('auth.loginTitle')}
        </button>

        {isValid ? (
          <p role="status" className="text-center text-xs text-text-muted">
            {t('auth.backendPending')}
          </p>
        ) : null}
      </form>
    </AuthCard>
  )
}

export default LoginPage
