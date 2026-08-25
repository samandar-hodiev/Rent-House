import { NavLink } from 'react-router-dom'
import { AdminCard, MockButton, PageHeading } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

const TABS = [
  { key: 'nav.general', to: ADMIN_ROUTES.settings, end: true },
  { key: 'nav.listings', to: ADMIN_ROUTES.settingsListings },
  { key: 'nav.chat', to: ADMIN_ROUTES.settingsChat },
  { key: 'nav.security', to: ADMIN_ROUTES.settingsSecurity },
]

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
      {hint ? <span className="text-xs text-text-muted">{hint}</span> : null}
    </label>
  )
}

const INPUT =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-xs placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

function Toggle({ label, hint, defaultChecked = false }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-text-muted">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
      />
    </label>
  )
}

// A function rather than a constant: the labels come from the dictionary, and
// a module-level object would be built once with whichever language happened to
// be active when the file first ran.
function panelFor(panel, t) {
  switch (panel) {
    case 'listings':
      return (
        <div className="flex flex-col gap-4 p-4">
          <Toggle
            label={t('settings.requireModeration')}
            hint={t('settings.requireModerationHint')}
            defaultChecked
          />
          <Field label={t('settings.maxImages')}>
            <input className={INPUT} type="number" defaultValue={20} />
          </Field>
          <Field label={t('settings.autoClose')} hint={t('settings.autoCloseHint')}>
            <input className={INPUT} type="number" defaultValue={90} />
          </Field>
          <Toggle
            label={t('settings.allowDrafts')}
            hint={t('settings.allowDraftsHint')}
            defaultChecked
          />
        </div>
      )
    case 'chat':
      return (
        <div className="flex flex-col gap-4 p-4">
          <Toggle
            label={t('settings.allowAttachments')}
            hint={t('settings.allowAttachmentsHint')}
            defaultChecked
          />
          <Field label={t('settings.maxAttachment')}>
            <input className={INPUT} type="number" defaultValue={20} />
          </Field>
          <Toggle label={t('settings.allowEditing')} defaultChecked />
          <Toggle label={t('settings.notifyReported')} defaultChecked />
        </div>
      )
    case 'security':
      return (
        <div className="flex flex-col gap-4 p-4">
          <Toggle label={t('settings.twoFactor')} defaultChecked />
          <Field label={t('settings.sessionTimeout')}>
            <input className={INPUT} type="number" defaultValue={60} />
          </Field>
          <Field label={t('settings.ipRange')} hint={t('settings.ipRangeHint')}>
            <input className={INPUT} placeholder="81.192.0.0/16" />
          </Field>
          <Toggle label={t('settings.auditLogs')} defaultChecked />
        </div>
      )
    default:
      return (
        <div className="flex flex-col gap-4 p-4">
          <Field label={t('settings.siteName')}>
            <input className={INPUT} defaultValue="RentHouse" />
          </Field>
          <Field label={t('settings.supportEmail')}>
            <input className={INPUT} defaultValue="support@renthouse.uz" />
          </Field>
          {/* The language new accounts start in — a marketplace setting, and a
              different thing from the admin's own language under Dashboard
              Settings. Changing this one would not move a single label on this
              page. */}
          <Field label={t('settings.defaultLanguage')} hint={t('settings.defaultLanguageHint')}>
            <select className={INPUT} defaultValue="uz">
              <option value="uz">O'zbekcha</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Toggle label={t('settings.maintenance')} hint={t('settings.maintenanceHint')} />
        </div>
      )
  }
}

/**
 * Settings, as four panels behind one heading.
 *
 * Nothing is saved: the task is the interface, and a form that pretended to
 * persist would be worse than one that plainly does not.
 */
function AdminSettingsPage({ panel = 'general', titleKey }) {
  const { t } = useAdmin()

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t('page.settings.title')} description={t('page.settings.description')} />

      <div className="flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? 'bg-primary-light text-primary-hover dark:text-primary'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              }`
            }
          >
            {t(tab.key)}
          </NavLink>
        ))}
      </div>

      <AdminCard title={t(titleKey)} className="max-w-2xl">
        {panelFor(panel, t)}
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <MockButton>{t('action.cancel')}</MockButton>
          <MockButton tone="primary">{t('action.save')}</MockButton>
        </div>
      </AdminCard>
    </div>
  )
}

export default AdminSettingsPage
