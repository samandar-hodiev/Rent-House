import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Settings2, Wrench } from 'lucide-react'
import {
  ADMIN_SELECT, ADMIN_SELECT_STYLE, AdminCard, MockButton, PageHeading, Switch,
  useAdminFormat,
} from '../../components/admin/adminUi'
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog'
import EmptyState from '../../components/EmptyState'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { useToast } from '../../context/ToastContext'
import { fetchSiteSettings, saveSiteSettings } from '../../services/adminApi'
import { FIELD, MAINTENANCE_KEYS, SETTINGS_SECTIONS, keysOf } from './settingsSchema'

const INPUT =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/**
 * One setting, checked against the same rule the server will apply.
 *
 * Returns a message or nothing. The server validates every value again — this
 * is here so an owner learns about a number out of range without waiting for a
 * round trip, not because the browser is trusted with the rule.
 */
function validateField(field, value, t) {
  switch (field.type) {
    case FIELD.number: {
      if (!Number.isInteger(value) || value < field.min || value > field.max) {
        return t('settings.numberRange', { min: field.min, max: field.max })
      }
      return ''
    }
    case FIELD.text:
    case FIELD.textarea: {
      const text = String(value ?? '').trim()
      // Only the contact fields may not be empty: a marketplace with no name
      // has nothing to put in a browser tab, and support with no address is a
      // dead end. A description is allowed to be nothing.
      if (!text && field.key !== 'site_description') return t('settings.textRequired')
      if (field.max && [...text].length > field.max) {
        return t('settings.textTooLong', { max: field.max })
      }
      if (field.key === 'support_email' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        return t('settings.emailInvalid')
      }
      return ''
    }
    case FIELD.formats:
      return Array.isArray(value) && value.length > 0 ? '' : t('settings.formatsRequired')
    default:
      return ''
  }
}

/** Reads what a control produced back into the type the setting holds. */
function readControl(field, event) {
  if (field.type === FIELD.number) return Number.parseInt(event.target.value, 10)
  if (field.type === FIELD.select && field.numeric) {
    return Number.parseInt(event.target.value, 10)
  }
  return event.target.value
}

function Field({ field, value, error, onChange, t }) {
  const labelId = useId()
  const label = t(`settings.${field.key}`)
  const hintKey = `settings.${field.key}.hint`
  const hint = t(hintKey)
  const description = hint === hintKey ? '' : hint

  const caption = (
    <span className="min-w-0 flex-1">
      <span id={labelId} className="block text-sm font-medium text-text-primary">
        {label}
      </span>
      {description ? (
        <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
      ) : null}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-error">
          {error}
        </span>
      ) : null}
    </span>
  )

  if (field.type === FIELD.toggle) {
    return (
      <div className="flex items-start justify-between gap-4">
        {caption}
        <Switch checked={Boolean(value)} labelledBy={labelId} onChange={onChange} />
      </div>
    )
  }

  if (field.type === FIELD.formats) {
    return (
      <div className="flex flex-col gap-2">
        {caption}
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((format) => {
            const chosen = Array.isArray(value) && value.includes(format)
            return (
              <button
                key={format}
                type="button"
                aria-pressed={chosen}
                onClick={() =>
                  onChange(
                    chosen
                      ? value.filter((item) => item !== format)
                      : [...(value ?? []), format],
                  )
                }
                className={`rounded-md border px-2.5 py-1 text-xs font-medium uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  chosen
                    ? 'border-primary bg-primary-light text-primary-hover dark:text-primary'
                    : 'border-border bg-surface text-text-muted hover:text-text-primary'
                }`}
              >
                {format}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (field.type === FIELD.textarea) {
    return (
      <label className="flex flex-col gap-1.5">
        {caption}
        <textarea
          rows={2}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          className={`${INPUT} h-auto w-full py-2`}
        />
      </label>
    )
  }

  if (field.type === FIELD.select) {
    return (
      <label className="flex items-start justify-between gap-4">
        {caption}
        <select
          value={String(value ?? '')}
          onChange={(event) => onChange(readControl(field, event))}
          className={`${ADMIN_SELECT} w-44 shrink-0`}
          style={ADMIN_SELECT_STYLE}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {field.translateOptions ? t(option.label) : option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="flex items-start justify-between gap-4">
      {caption}
      <input
        type={field.type === FIELD.number ? 'number' : 'text'}
        value={value ?? ''}
        min={field.min}
        max={field.max}
        onChange={(event) => onChange(readControl(field, event))}
        aria-invalid={Boolean(error)}
        className={`${INPUT} ${field.type === FIELD.number ? 'w-24 text-center' : 'w-64'} shrink-0`}
      />
    </label>
  )
}

/**
 * One card, saved on its own.
 *
 * Per section rather than one button for the page: the page is long, and a
 * single save would mean an owner who changed the site name also wrote every
 * other value they happened to scroll past — including any a colleague changed
 * in the meantime.
 */
function SettingsSection({ section, saved, onSave, onDirtyChange, t }) {
  const [form, setForm] = useState(() => pick(saved, keysOf(section)))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // The server is the source of truth: when a save comes back, or another
  // section's save refreshes the whole record, this card follows it.
  useEffect(() => {
    setForm(pick(saved, keysOf(section)))
    setErrors({})
  }, [saved, section])

  const dirty = keysOf(section).some((key) => !same(form[key], saved[key]))

  // Reported upward so the page can warn before the browser leaves with an
  // unsaved card open.
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const set = (field) => (value) => {
    setForm((current) => ({ ...current, [field.key]: value }))
    setErrors((current) =>
      current[field.key] ? { ...current, [field.key]: validateField(field, value, t) } : current,
    )
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy || !dirty) return

    const found = {}
    for (const field of section.fields) {
      const message = validateField(field, form[field.key], t)
      if (message) found[field.key] = message
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // Only what actually moved. Two owners saving different cards must not
    // overwrite each other with values neither of them chose.
    const patch = {}
    for (const key of keysOf(section)) {
      if (!same(form[key], saved[key])) patch[key] = form[key]
    }

    setBusy(true)
    await onSave(patch)
    setBusy(false)
  }

  return (
    <AdminCard
      title={t(`settingsSection.${section.id}.title`)}
      action={
        dirty ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <AlertTriangle aria-hidden="true" size={13} />
            {t('settings.dirty')}
          </span>
        ) : null
      }
    >
      {/* noValidate: the browser's own bubble would otherwise block the submit
          and explain the problem in English, whatever language the dashboard is
          in. The same rules are checked below, in the reader's language, and
          the server checks them again regardless. */}
      <form onSubmit={submit} noValidate>
        <div className="flex flex-col gap-5 p-4">
          <p className="-mt-1 text-xs text-text-muted">
            {t(`settingsSection.${section.id}.description`)}
          </p>
          {section.fields.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={form[field.key]}
              error={errors[field.key]}
              onChange={set(field)}
              t={t}
            />
          ))}
          {section.note ? (
            <p className="rounded-md bg-surface-secondary p-3 text-xs text-text-muted">
              {t(section.note)}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <MockButton
            onClick={() => {
              setForm(pick(saved, keysOf(section)))
              setErrors({})
            }}
            disabled={!dirty || busy}
          >
            {t('action.cancel')}
          </MockButton>
          <MockButton type="submit" tone="primary" disabled={!dirty || busy}>
            {busy ? t('settings.saving') : t('action.save')}
          </MockButton>
        </div>
      </form>
    </AdminCard>
  )
}

/**
 * Maintenance mode, apart from everything else.
 *
 * It closes the marketplace, so it is not a switch in a list: it states what it
 * does, shows what state it is in, and asks before either move. The message
 * visitors see is edited here too, because the two are one decision.
 */
function MaintenanceCard({ saved, onSave, t }) {
  const [message, setMessage] = useState(saved[MAINTENANCE_KEYS.message] ?? '')
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)
  const on = Boolean(saved[MAINTENANCE_KEYS.mode])

  useEffect(() => {
    setMessage(saved[MAINTENANCE_KEYS.message] ?? '')
  }, [saved])

  const messageDirty = message !== (saved[MAINTENANCE_KEYS.message] ?? '')

  const apply = async (patch, toastKey) => {
    setBusy(true)
    await onSave(patch, toastKey)
    setBusy(false)
    setConfirming(null)
  }

  return (
    <>
      <AdminCard title={t('settingsSection.maintenance.title')}>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                  on ? 'bg-warning/15 text-warning' : 'bg-surface-secondary text-text-muted'
                }`}
              >
                <Wrench aria-hidden="true" size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text-primary">
                  {t('settings.maintenance_mode')}
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {t('settings.maintenanceBody')}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={`text-xs font-medium ${on ? 'text-warning' : 'text-text-muted'}`}
              >
                {on ? t('settings.maintenanceOn') : t('settings.maintenanceOff')}
              </span>
              {/* Never toggled straight through: both directions change what
                  every visitor sees, so both are confirmed. */}
              <Switch checked={on} onChange={() => setConfirming(on ? 'off' : 'on')} />
            </span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">
              {t('settings.maintenance_message')}
            </span>
            <textarea
              rows={2}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className={`${INPUT} h-auto w-full py-2`}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <MockButton
            onClick={() => setMessage(saved[MAINTENANCE_KEYS.message] ?? '')}
            disabled={!messageDirty || busy}
          >
            {t('action.cancel')}
          </MockButton>
          <MockButton
            tone="primary"
            disabled={!messageDirty || busy}
            onClick={() => apply({ [MAINTENANCE_KEYS.message]: message })}
          >
            {busy ? t('settings.saving') : t('action.save')}
          </MockButton>
        </div>
      </AdminCard>

      {confirming ? (
        <AdminConfirmDialog
          title={t(
            confirming === 'on'
              ? 'settings.maintenanceEnableTitle'
              : 'settings.maintenanceDisableTitle',
          )}
          description={t(
            confirming === 'on'
              ? 'settings.maintenanceEnableBody'
              : 'settings.maintenanceDisableBody',
          )}
          confirmLabel={t(
            confirming === 'on'
              ? 'settings.maintenanceEnableAction'
              : 'settings.maintenanceDisableAction',
          )}
          tone={confirming === 'on' ? 'warning' : 'primary'}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            apply(
              { [MAINTENANCE_KEYS.mode]: confirming === 'on' },
              confirming === 'on' ? 'settings.maintenanceEnabled' : 'settings.maintenanceDisabled',
            )
          }
        />
      ) : null}
    </>
  )
}

function SectionSkeleton() {
  return (
    <AdminCard>
      <div className="flex flex-col gap-4 p-4">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-start justify-between gap-4">
            <div className="flex w-full max-w-sm flex-col gap-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-secondary" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-secondary" />
            </div>
            <div className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-surface-secondary" />
          </div>
        ))}
      </div>
    </AdminCard>
  )
}

function pick(source, keys) {
  const out = {}
  for (const key of keys) out[key] = clone(source[key])
  return out
}

function clone(value) {
  return Array.isArray(value) ? [...value] : value
}

function same(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : []
    const right = Array.isArray(b) ? b : []
    return left.length === right.length && left.every((item, i) => item === right[i])
  }
  return a === b
}

/**
 * How the marketplace behaves, as the owner sets it.
 *
 * Every value here is loaded from the server and enforced by it: the page is a
 * way to change the configuration, never the thing that applies it. The API is
 * the owner's alone — a super admin who reaches this route is refused by the
 * server, and the empty state below says so rather than showing a form that
 * cannot save.
 */
function AdminSettingsPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { showToast } = useToast()
  const { formatDateTime } = useAdminFormat()

  const [state, setState] = useState('loading')
  const [saved, setSaved] = useState({})
  const [updatedAt, setUpdatedAt] = useState(null)
  const [failure, setFailure] = useState('')

  // Whether anything on the page is unsaved, for the browser's own warning.
  // Per section, so one card going clean does not clear another's warning.
  const dirtyState = useRef({})
  const dirtyRef = useRef(false)

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        const { settings, updatedAt: at } = await fetchSiteSettings({ token, signal })
        setSaved(settings)
        setUpdatedAt(at)
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState(error?.status === 403 ? 'forbidden' : 'error')
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const save = useCallback(
    async (patch, toastKey = 'settings.saved') => {
      setFailure('')
      try {
        const { settings, updatedAt: at } = await saveSiteSettings(patch, { token })
        setSaved(settings)
        setUpdatedAt(at)
        showToast(t(toastKey))
        return true
      } catch (error) {
        // The server's message names the key and the rule it broke, which is
        // more use than "could not save".
        setFailure(error?.message || t('settings.saveFailed'))
        showToast(t('settings.saveFailed'))
        return false
      }
    },
    [token, showToast, t],
  )

  // A page this long is easy to leave with a card still unsaved.
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirtyRef.current) return undefined
      event.preventDefault()
      // Browsers show their own wording; returning a value is what asks.
      event.returnValue = t('settings.leaveConfirm')
      return event.returnValue
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [t])

  const sections = useMemo(() => SETTINGS_SECTIONS, [])

  if (state === 'forbidden') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeading title={t('page.settings.title')} description={t('page.settings.description')} />
        <EmptyState
          icon={<Settings2 aria-hidden="true" size={28} />}
          title={t('page.settings.title')}
          description={t('admins.ownerOnly')}
        />
      </div>
    )
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

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.settings.title')}
        description={t('page.settings.description')}
        action={
          updatedAt ? (
            <span className="text-xs text-text-muted">
              {t('settings.updatedAt', { when: formatDateTime(updatedAt) })}
            </span>
          ) : null
        }
      />

      {failure ? (
        <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {failure}
        </p>
      ) : null}

      {state === 'loading' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {[0, 1, 2, 3].map((row) => (
            <SectionSkeleton key={row} />
          ))}
        </div>
      ) : (
        <>
          {/* Maintenance first and full width: it is the one switch here that
              closes the marketplace, and burying it in a column would make it
              look like a preference. */}
          <MaintenanceCard saved={saved} onSave={save} t={t} />

          <div className="grid items-start gap-5 xl:grid-cols-2">
            {sections.map((section) => (
              <SettingsSection
                key={section.id}
                section={section}
                saved={saved}
                onSave={save}
                t={t}
                onDirtyChange={(dirty) => {
                  dirtyState.current[section.id] = dirty
                  dirtyRef.current = Object.values(dirtyState.current).some(Boolean)
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default AdminSettingsPage
