import { Bell, Building2, Flag, ShieldAlert, UserPlus } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { AdminCard, PageHeading, useAdminFormat } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { NOTIFICATIONS } from '../../mock/admin'

const ICONS = {
  user: UserPlus,
  listing: Building2,
  report: Flag,
  moderation: ShieldAlert,
}

function AdminNotificationsPage() {
  const { t } = useAdmin()
  const { formatDateTime } = useAdminFormat()
  const unread = NOTIFICATIONS.filter((item) => !item.read).length

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.notifications.title')}
        description={t('page.notifications.description', {
          unread,
          total: NOTIFICATIONS.length,
        })}
      />

      <AdminCard>
        {NOTIFICATIONS.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Bell aria-hidden="true" size={28} />}
              title={t('empty.notifications')}
              description={t('empty.notificationsHint')}
            />
          </div>
        ) : (
          <ul className="flex flex-col">
            {NOTIFICATIONS.map((item) => {
              const Icon = ICONS[item.kind] ?? Bell
              return (
                <li
                  key={item.id}
                  // Unread rows carry a tint and a dot. Two signals rather than
                  // one, because a tint alone disappears for anyone who cannot
                  // separate it from the surface behind it.
                  className={`flex items-start gap-3 border-b border-border p-4 last:border-0 ${
                    item.read ? '' : 'bg-primary-light/30'
                  }`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-muted">
                    <Icon aria-hidden="true" size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {item.title}
                      </span>
                      {item.read ? null : (
                        <span
                          aria-label={t('notifications.unread')}
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-text-secondary">
                      {item.description}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-text-muted">
                    {formatDateTime(item.at)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </AdminCard>
    </div>
  )
}

export default AdminNotificationsPage
