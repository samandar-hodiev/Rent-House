import { useRef, useState } from 'react'
import { Eye, Loader2, Upload } from 'lucide-react'
import FormField from '../components/FormField'
import UserAvatar from '../components/dashboard/UserAvatar'
import ImageLightbox from '../components/chat/ImageLightbox'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { updateProfile } from '../services/authApi'
import { uploadApartmentImage } from '../services/apartmentsApi'
import { resolveUploadUrl } from '../utils/uploadUrl'
import { ApiError } from '../services/apiClient'

// The server refuses anything larger, so the same limit is stated here — the
// person finds out before a megabyte-long upload rather than after it.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/**
 * The account's own profile.
 *
 * Everything here is persisted through PATCH /me and read back: the response is
 * what lands in AuthContext, so the header, the chat and every set of initials
 * follow from the same place rather than from a copy kept on this page.
 */
function DashboardEditProfilePage() {
  const { t } = useLocale()
  const { user, token, applyUser } = useAuth()
  const fileInputRef = useRef(null)

  const [values, setValues] = useState({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    phone: user.phone ?? '',
  })
  // The avatar is uploaded and saved on its own, the moment a file is chosen —
  // it is not part of the form's own save. Waiting for "Save" would mean
  // holding a file in memory and showing a preview that is not yet true.
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState(null)
  const [lightbox, setLightbox] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const setField = (field) => (value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setSaved(false)
    setError(null)
  }

  const displayName = [values.firstName, values.lastName].filter(Boolean).join(' ') || user.name
  const avatarUrl = resolveUploadUrl(user.avatarUrl)

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]
    // Cleared so choosing the same file twice still fires a change event —
    // after a failed upload, retrying with the same picture must work.
    event.target.value = ''
    if (!file) return

    setAvatarError(null)

    if (!file.type.startsWith('image/')) {
      setAvatarError(t('dashboard.avatarNotImage'))
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t('dashboard.avatarTooLarge'))
      return
    }

    setAvatarBusy(true)
    try {
      // Two steps, because they are two different things: the file becomes a
      // URL, then the account points at it.
      const url = await uploadApartmentImage(file, { token })
      const updated = await updateProfile({ avatar_url: url }, { token })
      applyUser(updated)
    } catch {
      setAvatarError(t('dashboard.avatarFailed'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const removeAvatar = async () => {
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      applyUser(await updateProfile({ avatar_url: '' }, { token }))
    } catch {
      setAvatarError(t('dashboard.avatarFailed'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile(
        {
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          // Sent even when empty: an empty phone means "remove it", which is a
          // thing someone may legitimately want.
          phone: values.phone.trim(),
        },
        { token },
      )
      applyUser(updated)
      setSaved(true)
    } catch (caught) {
      // The server distinguishes these, so the person is told which one it is
      // rather than being handed "something went wrong" for a typo.
      const code = caught instanceof ApiError ? caught.code : null
      setError(
        code === 'phone_taken'
          ? t('dashboard.phoneTaken')
          : code === 'invalid_phone'
            ? t('dashboard.phoneInvalid')
            : code === 'contact_required'
              ? t('dashboard.contactRequired')
              : t('dashboard.saveFailed'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-text-primary">
        {t('dashboard.editProfileTitle')}
      </h1>

      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* The avatar, and a way to look at it properly. The magnifier
                appears on hover and on keyboard focus, and only when there is
                an image — there is nothing to enlarge about initials. */}
            <div className="group relative shrink-0">
              <UserAvatar name={displayName} src={user.avatarUrl} size="lg" />

              {avatarUrl ? (
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  aria-label={t('dashboard.viewAvatar')}
                  title={t('dashboard.viewAvatar')}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/45 text-white opacity-0 transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100"
                >
                  <Eye aria-hidden="true" size={18} />
                </button>
              ) : null}

              {avatarBusy ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/45 text-white">
                  <Loader2 aria-hidden="true" size={18} className="animate-spin" />
                </span>
              ) : null}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{t('dashboard.avatar')}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload aria-hidden="true" size={14} />
                  {t('dashboard.changeAvatar')}
                </button>

                {user.avatarUrl ? (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    disabled={avatarBusy}
                    className="rounded-md px-2.5 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                  >
                    {t('dashboard.removeAvatar')}
                  </button>
                ) : null}
              </div>

              <p className="mt-1 text-xs text-text-muted">{t('dashboard.avatarHint')}</p>

              {avatarError ? (
                <p role="alert" className="mt-1 text-xs text-error">
                  {avatarError}
                </p>
              ) : null}

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

          {/* Email is shown but not editable: it is a verified sign-in
              identifier, so changing it belongs to a flow with a confirmation
              code rather than to this form. */}
          <FormField
            label={t('auth.email')}
            type="email"
            value={user.email ?? ''}
            onChange={() => {}}
            disabled
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
            placeholder="+998 90 123 45 67"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
              {t('dashboard.saveChanges')}
            </button>

            {error ? (
              <p role="alert" className="text-xs text-error">
                {error}
              </p>
            ) : saved ? (
              <p role="status" className="text-xs text-primary">
                {t('dashboard.profileSaved')}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      {/* The same lightbox chat uses for an enlarged picture, so there is one
          image viewer in the application rather than two that look alike. */}
      {lightbox && avatarUrl ? (
        <ImageLightbox
          image={{ src: avatarUrl, name: displayName }}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </div>
  )
}

export default DashboardEditProfilePage
