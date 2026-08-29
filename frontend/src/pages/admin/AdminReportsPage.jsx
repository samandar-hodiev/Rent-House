import { Flag } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { AdminCard, PageHeading } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'

/**
 * Reports about listings and people.
 *
 * There is nothing to show, and that is the truth rather than a failure: the
 * marketplace has no way to report anything yet, so nothing is recorded. The
 * page said otherwise until now — it was filled with invented rows, which made
 * an unbuilt feature look finished.
 *
 * When reporting exists — a table, a way for a visitor to submit one — this
 * page reads it the way every other admin page reads its data.
 */
function AdminReportsPage() {
  const { t } = useAdmin()

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t('page.reports.title')} description={t('reports.notBuilt')} />

      <AdminCard>
        <div className="p-4">
          <EmptyState
            icon={<Flag aria-hidden="true" size={28} />}
            title={t('empty.reports')}
            description={t('reports.notBuiltHint')}
          />
        </div>
      </AdminCard>
    </div>
  )
}

export default AdminReportsPage
