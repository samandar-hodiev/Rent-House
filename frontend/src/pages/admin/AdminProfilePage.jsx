import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import UserAvatar from '../../components/dashboard/UserAvatar'
import { AdminCard, PageHeading, StatusBadge } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { updateProfile, uploadAvatar } from '../../services/adminApi'

const INPUT =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** A field the account has but its holder may not edit. */
function ReadOnlyField({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 min-w-0 truncate text-sm text-text-primary">{children}</dd>
    </div>
  )
}

/**
 * The signed-in administrator's own account.
 *
 * Two things are editable — the name and the picture — and they are the two the
 * server accepts. Email, role and status are shown as text rather than as
 * disabled inputs: a greyed-out field invites the question "how do I enable
 * this", and the answer is that an administrator changing their own role is
 * exactly what the authorization exists to prevent.
 *
 * There is no id anywhere in this page. The account edited is the one the token
 * names, so it cannot be aimed at anybody else.
 */
function AdminProfilePage() {
  const { t } = useAdmin()
  const { admin, token, updateAdmin } = useAdminAuth()

  const [name, setName] = useState(admin?.name ?? '')
  // The chosen file's local preview, before it has been uploaded. Null means
  // "showing whatever the account already has".
  const [preview, setPreview] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef(null)

  // The account can change under the page — a save elsewhere, a reload — so the
  // form follows it rather than keeping a stale copy.
  useEffect(() => {
    setName(admin?.name ?? '')
  }, [admin?.name])

  // An object URL holds a blob alive until it is revoked.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const pick = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    setSaved(false)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    setPendingFile(file)
  }

  const submit = async (event) => {
    event.preventDefault()
    // Guarded rather than merely disabled: a double click can land two
    // submissions before React has re-rendered the button.
    if (busy) return

    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('profile.nameRequired'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      // Uploaded first, so the profile is only written once there is a URL to
      // write. A failed upload leaves the account exactly as it was.
      let avatarUrl
      if (pendingFile) {
        avatarUrl = await uploadAvatar(pendingFile, { token })
      }

      const updated = await updateProfile({ name: trimmed, avatarUrl, token })
      // The header reads the same record, so it changes with this one.
      updateAdmin(updated)
      setPendingFile(null)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(null)
      setSaved(true)
    } catch (caught) {
      setError(caught?.message ?? t('profile.saveFailed'))
    }
    setBusy(false)
  }

  if (!admin) return null

  const dirty = name.trim() !== admin.name || pendingFile !== null

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeading title={t('profile.title')} description={t('profile.description')} />

      <AdminCard>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5 p-4">
          <div className="flex items-center gap-4">
            <span className="relative shrink-0">
              <UserAvatar name={admin.name} src={preview ?? admin.avatarUrl} size="lg" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              >
                <Camera aria-hidden="true" size={15} className="shrink-0" />
                {t('profile.changePhoto')}
              </button>
              <span className="text-xs text-text-muted">{t('profile.photoHint')}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pick}
                className="sr-only"
              />
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{t('profile.name')}</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setSaved(false)
              }}
              disabled={busy}
              maxLength={200}
              className={INPUT}
            />
          </label>

          {/* Shown, not offered. These are what the account *is*; changing them
              is not this page's business and the server would refuse anyway. */}
          <dl className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <ReadOnlyField label={t('profile.email')}>{admin.email}</ReadOnlyField>
            <ReadOnlyField label={t('profile.role')}>{t(`role.${admin.role}`)}</ReadOnlyField>
            <ReadOnlyField label={t('profile.status')}>
              <StatusBadge status={admin.status} />
            </ReadOnlyField>
          </dl>

          {error ? (
            <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          {saved && !dirty ? (
            <p role="status" className="rounded-md bg-primary-light px-3 py-2 text-sm text-primary-hover dark:text-primary">
              {t('profile.saved')}
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy || !dirty}
              className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
              {t(busy ? 'profile.saving' : 'action.save')}
            </button>
          </div>
        </form>
      </AdminCard>
    </div>
  )
}

export default AdminProfilePage
