import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import MethodChoice from '../components/auth/MethodChoice'
import OtpInput from '../components/auth/OtpInput'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { ApiError } from '../services/apiClient'
import {
  completeRegistration,
  requestRegistrationCode,
  verifyRegistrationCode,
} from '../services/authApi'
import { ROUTES } from '../routes/paths'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_LENGTH = 6

const STEP = { contact: 'contact', code: 'code', profile: 'profile' }

// Accepts the shapes people actually type and returns the canonical form the
// API expects, or an empty string when it cannot be read as an Uzbek mobile
// number. Mirrors the backend's own normalisation.
function normalizePhone(input) {
  const cleaned = input.replace(/[\s\-()]/g, '').trim()
  if (!cleaned) return ''

  let candidate = cleaned
  if (/^\d{9}$/.test(cleaned)) candidate = `+998${cleaned}`
  else if (/^998\d{9}$/.test(cleaned)) candidate = `+${cleaned}`

  return /^\+998\d{9}$/.test(candidate) ? candidate : ''
}

/**
 * Three-step registration: prove ownership of a phone or email, then create the
 * account.
 *
 * The whole flow lives in component state and is never persisted. The
 * verification id, the registration token and the password exist only for as
 * long as the page does — a refresh restarts registration, which is the correct
 * trade for keeping none of it in storage.
 */
function RegisterPage() {
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [step, setStep] = useState(STEP.contact)
  const [method, setMethod] = useState('phone')
  const [contact, setContact] = useState('')
  const [verificationId, setVerificationId] = useState(null)
  const [registrationToken, setRegistrationToken] = useState(null)

  const [code, setCode] = useState('')
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    password: '',
    passwordConfirmation: '',
  })

  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  const timerRef = useRef(null)

  // Countdown for the resend link. Cleared on unmount so a finished flow does
  // not leave an interval running.
  useEffect(() => {
    if (resendIn <= 0) return undefined
    timerRef.current = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [resendIn])

  // Turns a backend error code into a message the user can act on. Unknown
  // codes fall back to a generic line rather than showing internals.
  const messageFor = useCallback(
    (error) => {
      if (!(error instanceof ApiError)) return t('auth.errorUnexpected')

      switch (error.code) {
        case 'network_error':
          return t('auth.errorNetwork')
        case 'contact_taken':
          return t('auth.errorContactTaken')
        case 'resend_too_soon':
          return t('auth.errorResendTooSoon')
        case 'invalid_code':
          return t('auth.errorInvalidCode')
        case 'code_expired':
          return t('auth.errorCodeExpired')
        case 'too_many_attempts':
          return t('auth.errorTooManyAttempts')
        case 'verification_not_found':
          return t('auth.errorVerificationLost')
        case 'invalid_registration_token':
          return t('auth.errorSessionExpired')
        case 'validation_failed':
        case 'contact_mismatch':
          return t('auth.errorValidation')
        default:
          return t('auth.errorUnexpected')
      }
    },
    [t],
  )

  const contactForDisplay = method === 'phone' ? contact : contact.trim()

  // ---- step 1: send the code ----

  const sendCode = async ({ isResend } = {}) => {
    const trimmed = contact.trim()
    const nextErrors = {}
    let payload = trimmed

    if (method === 'phone') {
      payload = normalizePhone(trimmed)
      if (!trimmed) nextErrors.contact = t('auth.errorRequired')
      else if (!payload) nextErrors.contact = t('auth.errorPhone')
    } else {
      if (!trimmed) nextErrors.contact = t('auth.errorRequired')
      else if (!EMAIL_PATTERN.test(trimmed)) nextErrors.contact = t('auth.errorEmail')
    }

    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const data = await requestRegistrationCode({ method, contact: payload })
      setContact(payload)
      setVerificationId(data.verification_id)
      setResendIn(data.resend_after ?? 60)
      if (!isResend) {
        setCode('')
        setStep(STEP.code)
      }
    } catch (error) {
      setFormError(messageFor(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---- step 2: verify the code ----

  const submitCode = async (event) => {
    event.preventDefault()
    setFormError(null)

    if (code.length !== OTP_LENGTH) {
      setErrors({ code: t('auth.errorOtpLength') })
      return
    }
    setErrors({})

    setIsSubmitting(true)
    try {
      const data = await verifyRegistrationCode({ verificationId, code })
      setRegistrationToken(data.registration_token)
      setStep(STEP.profile)
    } catch (error) {
      setFormError(messageFor(error))
      // A lost or exhausted verification cannot be retried on this screen, so
      // send the user back to request a fresh code rather than leaving them on
      // a dead form.
      if (
        error instanceof ApiError &&
        ['verification_not_found', 'too_many_attempts', 'code_expired'].includes(error.code)
      ) {
        setStep(STEP.contact)
        setVerificationId(null)
        setCode('')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---- step 3: create the account ----

  const submitProfile = async (event) => {
    event.preventDefault()
    const nextErrors = {}

    if (!profile.firstName.trim()) nextErrors.firstName = t('auth.errorRequired')
    if (!profile.lastName.trim()) nextErrors.lastName = t('auth.errorRequired')

    if (!profile.password) nextErrors.password = t('auth.errorRequired')
    else if (profile.password.length < 8) nextErrors.password = t('auth.errorPasswordShort')

    if (!profile.passwordConfirmation) nextErrors.passwordConfirmation = t('auth.errorRequired')
    else if (profile.password !== profile.passwordConfirmation) {
      nextErrors.passwordConfirmation = t('auth.errorPasswordMatch')
    }

    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const data = await completeRegistration({
        registrationToken,
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        password: profile.password,
        passwordConfirmation: profile.passwordConfirmation,
        language: locale,
      })

      // The backend signs the user in as part of registration, so there is no
      // second trip through the login form.
      signIn(data.access_token, data.user)
      navigate(ROUTES.home, { replace: true })
    } catch (error) {
      setFormError(messageFor(error))
      if (error instanceof ApiError && error.code === 'invalid_registration_token') {
        setStep(STEP.contact)
        setRegistrationToken(null)
        setVerificationId(null)
        setCode('')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const setProfileField = (field) => (value) => {
    setProfile((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const primaryButtonClass =
    'w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted'

  const alert = formError ? (
    <p role="alert" className="rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
      {formError}
    </p>
  ) : null

  // ---- rendering ----

  if (step === STEP.code) {
    return (
      <AuthCard
        title={method === 'phone' ? t('auth.verifyPhoneTitle') : t('auth.verifyEmailTitle')}
        subtitle={
          method === 'phone'
            ? t('auth.codeSentPhone', { contact: contactForDisplay })
            : t('auth.codeSentEmail', { contact: contactForDisplay })
        }
      >
        <form onSubmit={submitCode} noValidate className="mt-6 flex flex-col gap-4">
          {alert}

          <OtpInput value={code} onChange={setCode} error={errors.code} disabled={isSubmitting} />

          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? t('auth.verifying') : t('auth.verifyAction')}
          </button>

          <div className="text-center text-sm">
            {resendIn > 0 ? (
              <span className="text-text-muted">{t('auth.resendIn', { seconds: resendIn })}</span>
            ) : (
              <button
                type="button"
                onClick={() => sendCode({ isResend: true })}
                disabled={isSubmitting}
                className="font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:text-text-muted"
              >
                {t('auth.resendCode')}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setStep(STEP.contact)
              setCode('')
              setFormError(null)
            }}
            className="flex items-center justify-center gap-1.5 text-sm text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft aria-hidden="true" size={14} />
            {t('auth.changeContact')}
          </button>
        </form>
      </AuthCard>
    )
  }

  if (step === STEP.profile) {
    return (
      <AuthCard title={t('auth.createAccountTitle')} subtitle={t('auth.createAccountSubtitle')}>
        <form onSubmit={submitProfile} noValidate className="mt-6 flex flex-col gap-4">
          {alert}

          <FormField
            label={t('dashboard.firstName')}
            value={profile.firstName}
            onChange={setProfileField('firstName')}
            error={errors.firstName}
            placeholder={t('auth.namePlaceholder')}
            autoComplete="given-name"
          />
          <FormField
            label={t('dashboard.lastName')}
            value={profile.lastName}
            onChange={setProfileField('lastName')}
            error={errors.lastName}
            autoComplete="family-name"
          />
          <FormField
            label={t('auth.password')}
            type="password"
            value={profile.password}
            onChange={setProfileField('password')}
            error={errors.password}
            autoComplete="new-password"
          />
          <FormField
            label={t('auth.confirmPassword')}
            type="password"
            value={profile.passwordConfirmation}
            onChange={setProfileField('passwordConfirmation')}
            error={errors.passwordConfirmation}
            autoComplete="new-password"
          />

          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            {isSubmitting ? t('auth.creatingAccount') : t('auth.createAccountAction')}
          </button>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerVerifySubtitle')}
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
      <form
        onSubmit={(event) => {
          event.preventDefault()
          sendCode()
        }}
        noValidate
        className="mt-6 flex flex-col gap-4"
      >
        {alert}

        <MethodChoice
          value={method}
          onChange={(next) => {
            setMethod(next)
            setContact('')
            setErrors({})
            setFormError(null)
          }}
        />

        <FormField
          label={method === 'phone' ? t('auth.phone') : t('auth.email')}
          type={method === 'phone' ? 'tel' : 'email'}
          value={contact}
          onChange={(value) => {
            setContact(value)
            setErrors({})
          }}
          error={errors.contact}
          placeholder={method === 'phone' ? t('auth.phonePlaceholder') : t('auth.emailPlaceholder')}
          autoComplete={method === 'phone' ? 'tel' : 'email'}
          inputMode={method === 'phone' ? 'tel' : 'email'}
        />

        <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
          {isSubmitting
            ? t('auth.sending')
            : method === 'phone'
              ? t('auth.sendSmsCode')
              : t('auth.sendCode')}
        </button>
      </form>
    </AuthCard>
  )
}

export default RegisterPage
