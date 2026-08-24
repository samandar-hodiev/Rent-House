import { Building2 } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import {
  AdminCard, AdminTable, Cell, LISTING_LABEL, PageHeading, Row, StatusBadge, ViewLink,
  formatDate, formatMoney,
} from '../../components/admin/adminUi'
import { listingsByStatus } from '../../mock/admin'
import { adminListingPath } from '../../routes/adminPaths'

// Empty-state wording per state: "no pending listings" and "nothing deleted"
// are different pieces of news, and one generic line would say neither.
const EMPTY_TEXT = {
  null: ['No listings yet', 'Listings will appear here once owners publish them.'],
  pending: ['No pending listings', 'Nothing is waiting for moderation right now.'],
  active: ['No active listings', 'No listing is currently published.'],
  closed: ['No closed listings', 'Nothing has been closed yet.'],
  draft: ['No drafts', 'Owners have not left any unfinished listings.'],
  deleted: ['No deleted listings', 'Nothing has been removed.'],
}

/**
 * Every listing, or the ones in a single state.
 *
 * One page behind six sidebar entries: they differ by which listings they show
 * and by nothing else, so six components would be five copies waiting to drift
 * apart.
 */
function AdminListingsPage({ status = null, title }) {
  const listings = listingsByStatus(status)
  const [emptyTitle, emptyHint] = EMPTY_TEXT[status ?? 'null']

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={title}
        description={`${listings.length} ${listings.length === 1 ? 'listing' : 'listings'}.`}
      />

      <AdminCard>
        <AdminTable
          headers={['Listing', 'Owner', 'District', 'Price', 'Status', 'Views', 'Created', 'Actions']}
          empty={
            listings.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Building2 aria-hidden="true" size={28} />}
                  title={emptyTitle}
                  description={emptyHint}
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
                <StatusBadge status={listing.status} label={LISTING_LABEL[listing.status]} />
              </Cell>
              <Cell className="tabular-nums text-text-secondary">
                {listing.views.toLocaleString('en-US')}
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
