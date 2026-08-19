import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import { useLocale } from '../context/LocaleContext'
import { ROUTES } from '../routes/paths'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY_VALUES = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
}

function RegisterPage() {
  const { t } = useLocale()
  const [values, setValues] = useState(EMPTY_VALUES)
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

    if (!values.name.trim()) nextErrors.name = t('auth.errorRequired')

    if (!values.email.trim()) {
      nextErrors.email = t('auth.errorRequired')
    } else if (!EMAIL_PATTERN.test(values.email.trim())) {
      nextErrors.email = t('auth.errorEmail')
    }

    if (!values.phone.trim()) nextErrors.phone = t('auth.errorRequired')
    if (!values.password) nextErrors.password = t('auth.errorRequired')

    if (!values.confirmPassword) {
      nextErrors.confirmPassword = t('auth.errorRequired')
    } else if (values.password !== values.confirmPassword) {
      nextErrors.confirmPassword = t('auth.errorPasswordMatch')
    }

    setErrors(nextErrors)
    // UI only for now — no account is created and no request is sent.
    setIsValid(Object.keys(nextErrors).length === 0)
  }

  return (
    <AuthCard
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          {t('auth.hasAccount')}{' '}
          <Link
            to={ROUTES.login}
            className="font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('auth.loginTitle')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <FormField
          label={t('auth.name')}
          value={values.name}
          onChange={setField('name')}
          error={errors.name}
          placeholder={t('auth.namePlaceholder')}
          autoComplete="name"
        />

        <FormField
          label={t('auth.email')}
          type="email"
          value={values.email}
          onChange={setField('email')}
          error={errors.email}
          placeholder={t('auth.emailPlaceholder')}
          autoComplete="email"
          inputMode="email"
        />

        <FormField
          label={t('auth.phone')}
          type="tel"
          value={values.phone}
          onChange={setField('phone')}
          error={errors.phone}
          placeholder={t('auth.phonePlaceholder')}
          autoComplete="tel"
          inputMode="tel"
        />

        <FormField
          label={t('auth.password')}
          type="password"
          value={values.password}
          onChange={setField('password')}
          error={errors.password}
          autoComplete="new-password"
        />

        <FormField
          label={t('auth.confirmPassword')}
          type="password"
          value={values.confirmPassword}
          onChange={setField('confirmPassword')}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <button
          type="submit"
          className="mt-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('auth.registerTitle')}
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

export default RegisterPage
