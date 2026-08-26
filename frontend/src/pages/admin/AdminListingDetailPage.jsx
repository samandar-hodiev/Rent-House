import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Building2, ChevronLeft, ChevronRight, Eye, Heart, Loader2, MessageSquare,
  Phone, ShieldAlert,
} from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import ListingGalleryDialog from '../../components/admin/ListingGalleryDialog'
import { AdminCard, StatusBadge, useAdminFormat } from '../../components/admin/adminUi'
import { ADMIN_ROLE, useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchListing, fetchListingChats } from '../../services/adminApi'
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
 * The conversations held about this listing, one at a time.
 *
 * Read-only and deliberately so: there is no composer anywhere in it, so an
 * administrator cannot write in somebody else's name even by accident. It shows
 * the latest message of each conversation and nothing further back — this is a
 * preview, not an inbox.
 *
 * Rendered only for the owner, and the endpoint behind it answers 403 to
 * anybody else, so the two agree rather than the interface being the only lock.
 */
function ChatPreview({ listingId, count }) {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const [chats, setChats] = useState([])
  const [state, setState] = useState('loading')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    fetchListingChats(listingId, { token, signal: controller.signal })
      .then((rows) => {
        if (cancelled) return
        setChats(rows)
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
  }, [listingId, token])

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 aria-hidden="true" size={18} className="animate-spin text-text-muted" />
      </div>
    )
  }
  if (state === 'error' || chats.length === 0) {
    return <p className="p-4 text-sm text-text-muted">{t('listings.noChats')}</p>
  }

  const chat = chats[Math.min(index, chats.length - 1)]
  const at = new Date(chat.lastMessageAt)
  const pad = (value) => String(value).padStart(2, '0')

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2.5">
        <UserAvatar name={chat.userName} src={chat.userAvatar} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">
              {chat.userName}
            </span>
            {chat.unread > 0 ? (
              <span className="shrink-0 rounded-full bg-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-primary-hover dark:text-primary">
                {chat.unread}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-sm text-text-secondary">{chat.lastMessage}</span>
          <span className="mt-0.5 block text-[11px] text-text-muted">
            {pad(at.getHours())}:{pad(at.getMinutes())}
          </span>
        </span>
      </div>

      {/* One at a time, with a counter: an administrator scanning seven
          conversations needs to know where they are in them. */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft aria-hidden="true" size={14} />
          {t('action.previous')}
        </button>
        <span className="text-xs tabular-nums text-text-muted">
          {index + 1} / {chats.length}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(chats.length - 1, i + 1))}
          disabled={index >= chats.length - 1}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('action.next')}
          <ChevronRight aria-hidden="true" size={14} />
        </button>
      </div>

      <p className="flex items-center gap-2 text-[11px] text-text-muted">
        <ShieldAlert aria-hidden="true" size={13} className="shrink-0" />
        {t('chats.readOnly')}
      </p>
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

  return (
    <div className="flex max-w-5xl flex-col gap-4">
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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <AdminCard title={t('listings.engagement')}>
          <div className="grid grid-cols-2 gap-2 p-4">
            <Stat
              icon={<Eye size={14} />}
              label={t('stat.views')}
              value={formatNumber(listing.stats.views)}
            />
            <Stat
              icon={<Heart size={14} />}
              label={t('stat.favorites')}
              value={formatNumber(listing.stats.saves)}
            />
            <Stat
              icon={<Phone size={14} />}
              label={t('stat.contacts')}
              value={formatNumber(listing.stats.contacts)}
            />
            <Stat
              icon={<MessageSquare size={14} />}
              label={t('stat.chats')}
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
        <AdminCard title={t('listings.chats', { count: listing.stats.chats })}>
          <ChatPreview listingId={listing.id} count={listing.stats.chats} />
        </AdminCard>
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
