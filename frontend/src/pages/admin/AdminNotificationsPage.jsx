import { Bell } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { AdminCard, PageHeading } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'

/**
 * Notifications for administrators.
 *
 * Nothing generates them yet, so there is nothing to list. The page used to
 * show a hand-written feed, which made an unbuilt feature look finished — an
 * empty page that says so is more useful than a full one that lies.
 *
 * The audit log is the nearest thing that does exist: it records what
 * administrators have done, as they do it.
 */
function AdminNotificationsPage() {
  const { t } = useAdmin()

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.notifications.title')}
        description={t('notifications.notBuilt')}
      />

      <AdminCard>
        <div className="p-4">
          <EmptyState
            icon={<Bell aria-hidden="true" size={28} />}
            title={t('empty.notifications')}
            description={t('notifications.notBuiltHint')}
          />
        </div>
      </AdminCard>
    </div>
  )
}

export default AdminNotificationsPage
