import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import FormField from '../components/FormField'
import UserAvatar from '../components/dashboard/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'

// Profile editing lives in the dashboard body, reached from the Settings
// popover. UI only: no upload, no request, no persistence beyond local state.
function DashboardEditProfilePage() {
  const { t } = useLocale()
  const { user, updateUser } = useAuth()
  const fileInputRef = useRef(null)

  const [values, setValues] = useState({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
  })
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [isSaved, setIsSaved] = useState(false)

  const setField = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setIsSaved(false)
  }

  // Local object URL only — nothing is uploaded anywhere.
  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (file) setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    updateUser(values)
    setIsSaved(true)
  }

  const displayName = [values.firstName, values.lastName].filter(Boolean).join(' ') || user.name

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-text-primary">
        {t('dashboard.editProfileTitle')}
      </h1>

      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt={displayName}
                className="size-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <UserAvatar name={displayName} size="lg" />
            )}

            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{t('dashboard.avatar')}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1.5 flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Upload aria-hidden="true" size={14} />
                {t('dashboard.changeAvatar')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="sr-only"
                aria-label={t('dashboard.changeAvatar')}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('dashboard.firstName')}
              value={values.firstName}
              onChange={setField('firstName')}
              autoComplete="given-name"
            />
            <FormField
              label={t('dashboard.lastName')}
              value={values.lastName}
              onChange={setField('lastName')}
              autoComplete="family-name"
            />
          </div>

          <FormField
            label={t('auth.email')}
            type="email"
            value={values.email}
            onChange={setField('email')}
            autoComplete="email"
            inputMode="email"
          />
          <FormField
            label={t('auth.phone')}
            type="tel"
            value={values.phone}
            onChange={setField('phone')}
            autoComplete="tel"
            inputMode="tel"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
            >
              {t('dashboard.saveChanges')}
            </button>
            {isSaved ? (
              <p role="status" className="text-xs text-text-muted">
                {t('dashboard.saveNote')}
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  )
}

export default DashboardEditProfilePage
