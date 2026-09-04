import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, AtSign, Lock, Phone, User } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import AuthAlert from '../components/auth/AuthAlert'
import AuthButton from '../components/auth/AuthButton'
import AuthProgress from '../components/auth/AuthProgress'
import AuthInput from '../components/auth/AuthInput'
import AuthFooterLink from '../components/auth/AuthFooterLink'
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
import { readRedirect, withRedirect } from '../utils/redirectTarget'
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
  // A protected action can send someone here via the login page, so the
  // destination has to survive the whole registration flow too.
  const search = useLocation().search
  const destination = readRedirect(search) ?? ROUTES.dashboard

  const [step, setStep] = useState(STEP.contact)
  const [method, setMethod] = useState('phone')
  const [contact, setContact] = useState('')
  const [verificationId, setVerificationId] = useState(null)
  // "sent" when a provider accepted the message, "logged" when the server only
  // wrote the code to its log. Never claim delivery on the strength of a 200.
  const [delivery, setDelivery] = useState(null)
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
        case 'otp_delivery_failed':
          // The server was reached and understood the request; the SMS or email
          // provider is what failed. Not a connectivity problem.
          return t('auth.errorDeliveryFailed')
        case 'contact_taken':
          return t('auth.errorContactTaken')
        case 'otp_cooldown':
          return t('auth.errorResendTooSoon')
        case 'invalid_otp':
          return t('auth.errorInvalidCode')
        case 'otp_expired':
          return t('auth.errorCodeExpired')
        case 'otp_attempts_exceeded':
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
      setDelivery(data.delivery ?? null)
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
      // Mark the boxes themselves, not just the alert above them.
      if (error instanceof ApiError && ['invalid_otp', 'otp_expired'].includes(error.code)) {
        setErrors({ code: ' ' })
      }
      // A lost or exhausted verification cannot be retried on this screen, so
      // send the user back to request a fresh code rather than leaving them on
      // a dead form.
      if (
        error instanceof ApiError &&
        ['verification_not_found', 'otp_attempts_exceeded', 'otp_expired'].includes(error.code)
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
      signIn(data.access_token, data.user, data.refresh_token)
      navigate(destination, { replace: true })
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

  const alert = formError ? <AuthAlert variant="error">{formError}</AuthAlert> : null

  // ---- rendering ----

  if (step === STEP.code) {
    return (
      <AuthLayout
        step={STEP.code}
        width="narrow"
        progress={<AuthProgress current={2} />}
        title={method === 'phone' ? t('auth.verifyPhoneTitle') : t('auth.verifyEmailTitle')}
        subtitle={
          delivery === 'logged'
            ? t('auth.codeLoggedNotSent', { contact: contactForDisplay })
            : method === 'phone'
              ? t('auth.codeSentPhone', { contact: contactForDisplay })
              : t('auth.codeSentEmail', { contact: contactForDisplay })
        }
      >
        <form onSubmit={submitCode} noValidate className="flex flex-col gap-5">
          {alert}

          {delivery === 'logged' ? (
            <AuthAlert variant="info">{t('auth.devDeliveryNotice')}</AuthAlert>
          ) : null}

          <OtpInput
            value={code}
            onChange={(next) => {
              setCode(next)
              if (errors.code) setErrors({})
            }}
            error={errors.code}
            disabled={isSubmitting}
          />

          <AuthButton loading={isSubmitting} loadingLabel={t('auth.verifying')}>
            {t('auth.verifyAction')}
          </AuthButton>

          <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
            <div className="text-[0.8125rem]">
              {resendIn > 0 ? (
                <span className="text-text-muted tabular-nums">
                  {t('auth.resendIn', { seconds: resendIn })}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => sendCode({ isResend: true })}
                  disabled={isSubmitting}
                  className="font-medium text-primary transition-colors hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:text-text-muted"
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
              className="flex items-center gap-1.5 text-[0.8125rem] text-text-muted transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft aria-hidden="true" size={13} />
              {t('auth.changeContact')}
            </button>
          </div>
        </form>
      </AuthLayout>
    )
  }

  if (step === STEP.profile) {
    return (
      <AuthLayout
        step={STEP.profile}
        width="wide"
        progress={<AuthProgress current={3} />}
        title={t('auth.createAccountTitle')}
        subtitle={t('auth.createAccountSubtitle')}
      >
        <form onSubmit={submitProfile} noValidate className="flex flex-col gap-4">
          {/* The verified contact is confirmed here so the user can see the step
              actually succeeded before being asked for more details. */}
          <AuthAlert variant="success">
            {method === 'phone'
              ? t('auth.phoneVerified', { contact: contactForDisplay })
              : t('auth.emailVerified', { contact: contactForDisplay })}
          </AuthAlert>

          {alert}

          {/* Two short fields side by side on anything wider than a phone. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthInput
              icon={User}
              label={t('dashboard.firstName')}
              value={profile.firstName}
              onChange={setProfileField('firstName')}
              error={errors.firstName}
              placeholder={t('auth.namePlaceholder')}
              autoComplete="given-name"
            />
            <AuthInput
              icon={User}
              label={t('dashboard.lastName')}
              value={profile.lastName}
              onChange={setProfileField('lastName')}
              error={errors.lastName}
              autoComplete="family-name"
            />
          </div>
          <AuthInput
            icon={Lock}
            label={t('auth.password')}
            type="password"
            value={profile.password}
            onChange={setProfileField('password')}
            error={errors.password}
            autoComplete="new-password"
          />
          <AuthInput
            icon={Lock}
            label={t('auth.confirmPassword')}
            type="password"
            value={profile.passwordConfirmation}
            onChange={setProfileField('passwordConfirmation')}
            error={errors.passwordConfirmation}
            autoComplete="new-password"
          />

          <AuthButton loading={isSubmitting} loadingLabel={t('auth.creatingAccount')}>
            {t('auth.createAccountAction')}
          </AuthButton>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      step={STEP.contact}
      progress={<AuthProgress current={1} />}
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerVerifySubtitle')}
      footer={
        <AuthFooterLink
          prompt={t('auth.hasAccount')}
          to={withRedirect(ROUTES.login, destination)}
          label={t('auth.loginTitle')}
        />
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          sendCode()
        }}
        noValidate
        className="flex flex-col gap-4"
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

        <AuthInput
          label={method === 'phone' ? t('auth.phone') : t('auth.email')}
          type={method === 'phone' ? 'tel' : 'email'}
          icon={method === 'phone' ? Phone : AtSign}
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

        <AuthButton loading={isSubmitting} loadingLabel={t('auth.sending')}>
          {method === 'phone' ? t('auth.sendSmsCode') : t('auth.sendCode')}
        </AuthButton>
      </form>
    </AuthLayout>
  )
}

export default RegisterPage
