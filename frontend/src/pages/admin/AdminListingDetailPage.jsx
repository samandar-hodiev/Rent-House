import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, Heart, MessageSquare } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { AdminCard, MockButton, StatusBadge, useAdminFormat } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { LISTINGS } from '../../mock/admin'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

function Metric({ icon, label, value }) {
  const { formatNumber } = useAdminFormat()
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-text-muted">{label}</span>
        <span className="block text-sm font-semibold tabular-nums text-text-primary">
          {formatNumber(value)}
        </span>
      </span>
    </div>
  )
}

function AdminListingDetailPage() {
  const { t } = useAdmin()
  const { formatDate, formatMoney } = useAdminFormat()
  const { id } = useParams()
  const listing = LISTINGS.find((item) => item.id === id)

  if (!listing) {
    return (
      <EmptyState
        title={t('listings.notFound')}
        description={t('listings.notFoundHint')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        to={ADMIN_ROUTES.listings}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft aria-hidden="true" size={15} />
        {t('nav.allListings')}
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <AdminCard>
            <div className="grid grid-cols-3 gap-1 p-1">
              {listing.images.map((image, index) => (
                <img
                  key={image}
                  src={image}
                  alt=""
                  loading="lazy"
                  className={`w-full rounded-md object-cover ${
                    index === 0 ? 'col-span-3 aspect-16/9' : 'aspect-4/3'
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h1 className="min-w-0 text-lg font-semibold text-text-primary">{listing.title}</h1>
                <StatusBadge status={listing.status} />
              </div>
              <p className="text-xl font-bold text-text-primary">
                {formatMoney(listing.price, listing.currency)} {t('listings.perMonth')}
              </p>
              <p className="text-sm text-text-secondary">
                {listing.district}, {t('listings.city')} — {listing.address}
              </p>
              <p className="text-sm text-text-muted">
                {listing.rooms} {t('listings.rooms')} · {listing.area} m² ·{' '}
                {listing.floor}/{listing.totalFloors} {t('listings.floor')}
              </p>
              <p className="mt-1 text-sm text-text-secondary">{listing.description}</p>
            </div>
          </AdminCard>

          <AdminCard title={t('listings.moderation')}>
            {/* Frontend only, as specified: these say what an administrator
                would be able to do, and do nothing yet. */}
            <div className="flex flex-wrap gap-2 p-4">
              <MockButton tone="primary">{t('action.approve')}</MockButton>
              <MockButton>{t('action.reject')}</MockButton>
              <MockButton>{t('action.suspend')}</MockButton>
              <MockButton>{t('action.close')}</MockButton>
              <MockButton tone="danger">{t('action.delete')}</MockButton>
              <MockButton>{t('action.restore')}</MockButton>
            </div>
          </AdminCard>
        </div>

        <div className="flex flex-col gap-4">
          <AdminCard title={t('listings.engagement')}>
            <div className="flex flex-col gap-3 p-4">
              <Metric icon={<Eye size={15} />} label={t('stat.views')} value={listing.views} />
              <Metric
                icon={<Heart size={15} />}
                label={t('stat.favorites')}
                value={listing.favorites}
              />
              <Metric
                icon={<MessageSquare size={15} />}
                label={t('listings.messages')}
                value={listing.messages}
              />
            </div>
          </AdminCard>

          <AdminCard title={t('listings.owner')}>
            <dl className="flex flex-col gap-3 p-4">
              <div>
                <dt className="text-xs text-text-muted">{t('listings.name')}</dt>
                <dd className="mt-0.5 text-sm text-text-primary">{listing.owner.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">{t('table.email')}</dt>
                <dd className="mt-0.5 truncate text-sm text-text-primary">{listing.owner.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">{t('table.created')}</dt>
                <dd className="mt-0.5 text-sm text-text-primary">{formatDate(listing.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">{t('listings.updated')}</dt>
                <dd className="mt-0.5 text-sm text-text-primary">{formatDate(listing.updatedAt)}</dd>
              </div>
            </dl>
          </AdminCard>
        </div>
      </div>
    </div>
  )
}

export default AdminListingDetailPage
