import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, Settings2 } from 'lucide-react'
import { AdminCard, MockButton, PageHeading, Switch } from '../../components/admin/adminUi'
import EmptyState from '../../components/EmptyState'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchSiteSettings, saveSiteSettings } from '../../services/adminApi'

// No width utility of its own: the field sets one, and two widths in one class
// list are resolved by the order of the stylesheet rather than the order they
// are written in — which is how this row lost its layout the first time.
const INPUT =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

// The ceiling the server enforces. Repeated here so the field can refuse a
// number before a round trip does — the server remains the one that decides.
const MAX_IMAGES_CEILING = 50

function Row({ label, hint, children, labelId }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <span id={labelId} className="block text-sm font-medium text-text-primary">
          {label}
        </span>
        {hint ? <span className="mt-0.5 block text-xs text-text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function FieldSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex w-full max-w-xs flex-col gap-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-secondary" />
        <div className="h-3 w-full animate-pulse rounded bg-surface-secondary" />
      </div>
      <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-surface-secondary" />
    </div>
  )
}

/**
 * How the marketplace behaves, as the owner sets it.
 *
 * Two settings, because two are what the marketplace actually obeys. The page
 * used to offer fifteen — a site name, a maintenance switch, an IP range, a
 * two-factor toggle — none of which were read by anything: they were defaults
 * that reset on reload. A switch that changes nothing is worse than a missing
 * one, because it tells an owner the marketplace is configured a way it is not.
 * The other thirteen are gone rather than saved-but-ignored, and this page will
 * grow again as the features behind them are built.
 *
 * Both settings here are enforced by the server on every listing write — see
 * ApartmentService.applySettings — not by this form.
 */
function AdminSettingsPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const moderationLabelId = useId()

  const [state, setState] = useState('loading')
  // What the server holds, kept apart from what the form shows: "Bekor qilish"
  // is a return to this, and the Save button is only live when they differ.
  const [saved, setSaved] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const doneTimer = useRef(null)

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        const data = await fetchSiteSettings({ token, signal })
        const next = {
          listing_moderation_required: Boolean(data?.listing_moderation_required),
          listing_max_images: Number(data?.listing_max_images) || 1,
        }
        setSaved(next)
        setForm(next)
        setState('ready')
      } catch (err) {
        if (err?.name === 'AbortError') return
        setState('error')
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => () => clearTimeout(doneTimer.current), [])

  const dirty =
    form &&
    saved &&
    (form.listing_moderation_required !== saved.listing_moderation_required || form.listing_max_images !== saved.listing_max_images)

  const valid = form && Number.isInteger(form.listing_max_images) &&
    form.listing_max_images >= 1 && form.listing_max_images <= MAX_IMAGES_CEILING

  const onSubmit = async (event) => {
    event.preventDefault()
    if (!dirty || !valid || saving) return

    setSaving(true)
    setError('')
    setDone(false)
    try {
      const result = await saveSiteSettings(form, { token })
      // Reconciled with what the server stored rather than with what was sent:
      // it clamps, and the form should show the number that is now in force.
      const next = {
        listing_moderation_required: Boolean(result?.listing_moderation_required),
        listing_max_images: Number(result?.listing_max_images) || form.listing_max_images,
      }
      setSaved(next)
      setForm(next)
      setDone(true)
      clearTimeout(doneTimer.current)
      doneTimer.current = setTimeout(() => setDone(false), 4000)
    } catch (err) {
      setError(err?.message || t('settings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeading title={t('page.settings.title')} description={t('page.settings.description')} />
        <EmptyState
          icon={<Settings2 aria-hidden="true" size={28} />}
          title={t('settings.loadFailed')}
          description={t('login.errorNetwork')}
          actionLabel={t('analytics.retry')}
          onAction={() => load()}
        />
      </div>
    )
  }

  const loading = state === 'loading'

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t('page.settings.title')} description={t('page.settings.description')} />

      <AdminCard title={t('settings.listingRules')} className="max-w-2xl">
        <form onSubmit={onSubmit}>
          <div className="flex flex-col gap-5 p-4">
            {loading ? (
              <>
                <FieldSkeleton />
                <FieldSkeleton />
              </>
            ) : (
              <>
                <Row
                  labelId={moderationLabelId}
                  label={t('settings.requireModeration')}
                  hint={t('settings.requireModerationHint')}
                >
                  <Switch
                    checked={form.listing_moderation_required}
                    labelledBy={moderationLabelId}
                    onChange={(checked) =>
                      setForm((current) => ({ ...current, listing_moderation_required: checked }))
                    }
                  />
                </Row>

                <label className="flex items-start justify-between gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary">
                      {t('settings.maxImages')}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {t('settings.maxImagesHint', { max: MAX_IMAGES_CEILING })}
                    </span>
                  </span>
                  <input
                    className={`${INPUT} w-20 shrink-0 text-center`}
                    type="number"
                    min={1}
                    max={MAX_IMAGES_CEILING}
                    value={form.listing_max_images}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        listing_max_images: Number.parseInt(event.target.value, 10),
                      }))
                    }
                  />
                </label>

                {!valid ? (
                  <p role="alert" className="text-xs text-error">
                    {t('settings.maxImagesInvalid', { max: MAX_IMAGES_CEILING })}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border p-4">
            {error ? (
              <p role="alert" className="mr-auto text-sm text-error">
                {error}
              </p>
            ) : null}
            {done && !error ? (
              <p role="status" className="mr-auto flex items-center gap-1.5 text-sm text-primary">
                <Check aria-hidden="true" size={15} />
                {t('settings.saved')}
              </p>
            ) : null}
            <MockButton onClick={() => setForm(saved)} disabled={!dirty || saving}>
              {t('action.cancel')}
            </MockButton>
            <MockButton type="submit" tone="primary" disabled={loading || !dirty || !valid || saving}>
              {saving ? t('settings.saving') : t('action.save')}
            </MockButton>
          </div>
        </form>
      </AdminCard>
    </div>
  )
}

export default AdminSettingsPage
