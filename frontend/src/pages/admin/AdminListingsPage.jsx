import { Building2 } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import {
  AdminCard, AdminTable, Cell, PageHeading, Row, StatusBadge, ViewLink, useAdminFormat,
} from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { listingsByStatus } from '../../mock/admin'
import { adminListingPath } from '../../routes/adminPaths'

// Empty-state wording per state: "no pending listings" and "nothing deleted"
// are different pieces of news, and one generic line would say neither.
const EMPTY_KEY = {
  null: 'allListings',
  pending: 'pending',
  active: 'active',
  closed: 'closed',
  draft: 'draft',
  deleted: 'deleted',
}

/**
 * Every listing, or the ones in a single state.
 *
 * One page behind six sidebar entries: they differ by which listings they show
 * and by nothing else, so six components would be five copies waiting to drift
 * apart.
 */
function AdminListingsPage({ status = null, titleKey }) {
  const { t } = useAdmin()
  const { formatDate, formatMoney, formatNumber } = useAdminFormat()
  const listings = listingsByStatus(status)
  const empty = EMPTY_KEY[status ?? 'null']

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t(titleKey)}
        description={t('page.listings.count', { count: listings.length })}
      />

      <AdminCard>
        <AdminTable
          headers={[
            t('table.listing'), t('table.owner'), t('table.district'), t('table.price'),
            t('table.status'), t('table.views'), t('table.created'), t('table.actions'),
          ]}
          empty={
            listings.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Building2 aria-hidden="true" size={28} />}
                  title={t(`empty.${empty}`)}
                  description={t(`empty.${empty}Hint`)}
                />
              </div>
            ) : null
          }
        >
          {listings.map((listing) => (
            <Row key={listing.id}>
              <Cell>
                <span className="flex min-w-0 items-center gap-2.5">
                  <img
                    src={listing.images[0]}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded-md object-cover"
                  />
                  <span className="min-w-0 max-w-[220px] truncate font-medium text-text-primary">
                    {listing.title}
                  </span>
                </span>
              </Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{listing.owner.name}</Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{listing.district}</Cell>
              <Cell className="whitespace-nowrap tabular-nums text-text-secondary">
                {formatMoney(listing.price, listing.currency)}
              </Cell>
              <Cell>
                <StatusBadge status={listing.status} />
              </Cell>
              <Cell className="tabular-nums text-text-secondary">
                {formatNumber(listing.views)}
              </Cell>
              <Cell className="whitespace-nowrap text-text-secondary">
                {formatDate(listing.createdAt)}
              </Cell>
              <Cell>
                <ViewLink to={adminListingPath(listing.id)} />
              </Cell>
            </Row>
          ))}
        </AdminTable>
      </AdminCard>
    </div>
  )
}

export default AdminListingsPage
