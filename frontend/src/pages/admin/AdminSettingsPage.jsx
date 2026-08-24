import { NavLink } from 'react-router-dom'
import { AdminCard, MockButton, PageHeading } from '../../components/admin/adminUi'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

const TABS = [
  { label: 'General', to: ADMIN_ROUTES.settings, end: true },
  { label: 'Listings', to: ADMIN_ROUTES.settingsListings },
  { label: 'Chat', to: ADMIN_ROUTES.settingsChat },
  { label: 'Security', to: ADMIN_ROUTES.settingsSecurity },
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

const PANELS = {
  general: (
    <div className="flex flex-col gap-4 p-4">
      <Field label="Site name">
        <input className={INPUT} defaultValue="RentHouse" />
      </Field>
      <Field label="Support email">
        <input className={INPUT} defaultValue="support@renthouse.uz" />
      </Field>
      <Field label="Default language" hint="Used for new accounts.">
        <select className={INPUT} defaultValue="uz">
          <option value="uz">O'zbekcha</option>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </Field>
      <Toggle label="Maintenance mode" hint="Shows a notice instead of the marketplace." />
    </div>
  ),
  listings: (
    <div className="flex flex-col gap-4 p-4">
      <Toggle
        label="Require moderation before publishing"
        hint="New listings arrive as Pending instead of going live."
        defaultChecked
      />
      <Field label="Maximum images per listing">
        <input className={INPUT} type="number" defaultValue={20} />
      </Field>
      <Field label="Auto-close after (days)" hint="A listing with no activity is closed.">
        <input className={INPUT} type="number" defaultValue={90} />
      </Field>
      <Toggle label="Allow drafts" hint="Owners can save without publishing." defaultChecked />
    </div>
  ),
  chat: (
    <div className="flex flex-col gap-4 p-4">
      <Toggle label="Allow attachments" hint="Images, documents and voice notes." defaultChecked />
      <Field label="Maximum attachment size (MB)">
        <input className={INPUT} type="number" defaultValue={20} />
      </Field>
      <Toggle label="Allow message editing" defaultChecked />
      <Toggle label="Notify admins about reported chats" defaultChecked />
    </div>
  ),
  security: (
    <div className="flex flex-col gap-4 p-4">
      <Toggle label="Two-factor authentication for admins" defaultChecked />
      <Field label="Session timeout (minutes)">
        <input className={INPUT} type="number" defaultValue={60} />
      </Field>
      <Field label="Allowed admin IP range" hint="Leave empty to allow any address.">
        <input className={INPUT} placeholder="81.192.0.0/16" />
      </Field>
      <Toggle label="Record audit logs" defaultChecked />
    </div>
  ),
}

/**
 * Settings, as four panels behind one heading.
 *
 * Nothing is saved: the task is the interface, and a form that pretended to
 * persist would be worse than one that plainly does not.
 */
function AdminSettingsPage({ panel = 'general', title }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title="Settings" description="Marketplace configuration." />

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
            {tab.label}
          </NavLink>
        ))}
      </div>

      <AdminCard title={title} className="max-w-2xl">
        {PANELS[panel]}
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <MockButton>Cancel</MockButton>
          <MockButton tone="primary">Save changes</MockButton>
        </div>
      </AdminCard>
    </div>
  )
}

export default AdminSettingsPage
