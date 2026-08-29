import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, Eye, Heart, Loader2, MessageSquare, Phone } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import ListingGalleryDialog from '../../components/admin/ListingGalleryDialog'
import ConversationAudit from '../../components/admin/ConversationAudit'
import { AdminCard, MockButton, StatusBadge, useAdminFormat } from '../../components/admin/adminUi'
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog'
import { STATUS_ACTIONS } from '../../data/listingStatus'
import { ADMIN_ROLE, useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchListing, setListingStatus } from '../../services/adminApi'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

/** One figure about the listing. */
function Stat({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-secondary/60 px-3 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface text-text-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-text-muted">{label}</span>
        <span className="block text-sm font-semibold tabular-nums text-text-primary">{value}</span>
      </span>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-text-primary">{children}</dd>
    </div>
  )
}

/**
 * One listing, as a compact card rather than a page.
 *
 * The gallery on the left and everything an administrator came to check on the
 * right — who published it, how it has been received, and who has written about
 * it. Deliberately narrow: this is a card that happens to fill a route, not a
 * layout that spreads to whatever width the screen has.
 */
function AdminListingDetailPage() {
  const { t, role } = useAdmin()
  const { token } = useAdminAuth()
  const { formatDate, formatMoney, formatNumber } = useAdminFormat()
  const { id } = useParams()

  const [listing, setListing] = useState(null)
  const [state, setState] = useState('loading')
  const [galleryOpen, setGalleryOpen] = useState(false)
  // The state being moved to, while the administrator confirms it.
  const [moving, setMoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const [moderationError, setModerationError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    fetchListing(id, { token, signal: controller.signal })
      .then((data) => {
        if (cancelled) return
        setListing(data)
        setState('ready')
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        setState('error')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [id, token])

  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 aria-hidden="true" size={22} className="animate-spin text-text-muted" />
      </div>
    )
  }
  if (state === 'error' || !listing) {
    return (
      <EmptyState
        icon={<Building2 aria-hidden="true" size={28} />}
        title={t('listings.notFound')}
        description={t('listings.notFoundHint')}
      />
    )
  }

  const cover = listing.images[0] ?? listing.coverUrl
  const targets = STATUS_ACTIONS[listing.status] ?? []

  return (
    // `min-h-full` so the conversations card can reach the foot of the screen
    // rather than stopping wherever its content happens to end.
    <div className="flex min-h-full max-w-5xl flex-col gap-4">
      <Link
        to={ADMIN_ROUTES.listings}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft aria-hidden="true" size={15} />
        {t('nav.allListings')}
      </Link>

      {/* Side by side on a desktop, stacked below it — the picture keeps its
          proportions either way. */}
      <AdminCard className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="relative bg-surface-secondary">
            {cover ? (
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                aria-label={t('listings.viewImages')}
                className="group relative block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <img
                  src={cover}
                  alt=""
                  className="h-56 w-full object-cover lg:h-full lg:min-h-[260px]"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition-all duration-150 group-hover:bg-slate-900/45 group-hover:opacity-100 group-focus-visible:bg-slate-900/45 group-focus-visible:opacity-100">
                  <Eye aria-hidden="true" size={22} />
                </span>
                {listing.images.length > 1 ? (
                  <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[11px] font-medium text-white">
                    {formatNumber(listing.images.length)}
                  </span>
                ) : null}
              </button>
            ) : (
              <span className="flex h-56 items-center justify-center text-text-muted lg:h-full">
                <Building2 aria-hidden="true" size={28} />
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="min-w-0 text-base font-semibold text-text-primary">{listing.title}</h1>
              <StatusBadge status={listing.status} />
            </div>

            <p className="text-lg font-bold text-text-primary">
              {formatMoney(Number(listing.price), listing.currency)} {t('listings.perMonth')}
            </p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-4">
              <Field label={t('table.district')}>{listing.district}</Field>
              <Field label={t('listings.rooms')}>{listing.rooms}</Field>
              <Field label={t('listings.area')}>{listing.area} m²</Field>
              <Field label={t('listings.floor')}>
                {listing.floor}/{listing.totalFloors}
              </Field>
              <div className="col-span-2 min-w-0 sm:col-span-4">
                <dt className="text-[11px] text-text-muted">{t('listings.address')}</dt>
                <dd className="mt-0.5 text-sm text-text-primary">{listing.address}</dd>
              </div>
            </dl>

            {listing.description ? (
              <p className="border-t border-border pt-3 text-sm leading-relaxed text-text-secondary">
                {listing.description}
              </p>
            ) : null}
          </div>
        </div>
      </AdminCard>

      {/* No `items-start`: the two cards sit on one row and should end on one
          line, whichever has more in it. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Every figure is counted for this listing alone — two flats owned by
            the same person never share a number. The labels say so, because a
            bare "Ko'rishlar" beside an owner card invites the question. */}
        <AdminCard title={t('listings.thisListing')}>
          <div className="grid grid-cols-2 gap-2 p-4">
            <Stat
              icon={<Eye size={14} />}
              label={t('listings.statViews')}
              value={formatNumber(listing.stats.views)}
            />
            <Stat
              icon={<Heart size={14} />}
              label={t('listings.statSaves')}
              value={formatNumber(listing.stats.saves)}
            />
            <Stat
              icon={<Phone size={14} />}
              label={t('listings.statContacts')}
              value={formatNumber(listing.stats.contacts)}
            />
            <Stat
              icon={<MessageSquare size={14} />}
              label={t('listings.statWriters')}
              value={formatNumber(listing.stats.chats)}
            />
          </div>
        </AdminCard>

        <AdminCard title={t('listings.owner')}>
          <div className="flex items-start gap-3 p-4">
            <UserAvatar name={listing.owner.name} src={listing.owner.avatarUrl} size="lg" />
            <dl className="flex min-w-0 flex-col gap-2">
              <Field label={t('listings.name')}>{listing.owner.name}</Field>
              <Field label={t('table.email')}>{listing.owner.email ?? '—'}</Field>
              <Field label={t('table.phone')}>{listing.owner.phone ?? '—'}</Field>
              <Field label={t('table.created')}>{formatDate(listing.createdAt)}</Field>
            </dl>
          </div>
        </AdminCard>
      </div>

      {/* The owner's alone. The endpoint refuses everybody else, so this is the
          interface agreeing with the rule rather than enforcing it. */}
      {role === ADMIN_ROLE.owner ? (
        <AdminCard title={t('audit.title')} className="min-h-0 flex-1 overflow-hidden">
          <ConversationAudit
            listingId={listing.id}
            ownerId={listing.owner.id}
            ownerName={listing.owner.name}
          />
        </AdminCard>
      ) : null}

      {/* Moderation. Only the moves the server will accept are offered — the
          same table the owner's own dashboard uses — so a button here never
          produces a refusal. */}
      {targets.length > 0 ? (
        <AdminCard title={t('listings.moderation')}>
          <div className="flex flex-wrap items-center gap-2 p-4">
            {targets.map((target) => (
              <MockButton
                key={target}
                tone={target === 'active' ? 'primary' : target === 'deleted' ? 'danger' : 'neutral'}
                disabled={busy}
                onClick={() => {
                  setModerationError(null)
                  setMoving(target)
                }}
              >
                {t(`listingAction.${target}.menu`)}
              </MockButton>
            ))}
          </div>
          {moderationError ? (
            <p role="alert" className="border-t border-border px-4 py-2.5 text-sm text-error">
              {moderationError}
            </p>
          ) : null}
        </AdminCard>
      ) : null}

      {moving ? (
        <AdminConfirmDialog
          title={t(`listingAction.${moving}.title`)}
          description={t(`listingAction.${moving}.body`, { title: listing.title })}
          confirmLabel={t(`listingAction.${moving}.confirm`)}
          tone={moving === 'active' ? 'primary' : moving === 'deleted' ? 'danger' : 'warning'}
          busy={busy}
          onCancel={() => setMoving(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              await setListingStatus(listing.id, moving, { token })
              setMoving(null)
              // Refetched rather than patched in place: publishing stamps a
              // date and the figures beside it may have moved too.
              setListing(await fetchListing(id, { token }))
            } catch (error) {
              setModerationError(error?.message ?? t('listings.moderationFailed'))
              setMoving(null)
            }
            setBusy(false)
          }}
        />
      ) : null}

      {galleryOpen ? (
        <ListingGalleryDialog
          title={listing.title}
          images={listing.images}
          loading={false}
          onClose={() => setGalleryOpen(false)}
        />
      ) : null}
    </div>
  )
}

export default AdminListingDetailPage
