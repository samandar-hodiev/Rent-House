import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Eye, Loader2 } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import ListingGalleryDialog from '../../components/admin/ListingGalleryDialog'
import {
  ADMIN_SELECT, ADMIN_SELECT_STYLE, AdminCard, AdminTable, Cell, MockButton, PageHeading,
  Row, StatusBadge, ViewLink, useAdminFormat,
} from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchListingImages, fetchListings } from '../../services/adminApi'
import { adminListingPath } from '../../routes/adminPaths'

const PER_PAGE = 10
const SEARCH_DEBOUNCE = 300

/**
 * The listing's own picture, with a way into the rest of them.
 *
 * The eye appears on hover and on keyboard focus — a control that only exists
 * under a pointer is a control somebody navigating by keyboard cannot reach.
 */
function CoverThumb({ listing, onOpen, label }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="group relative size-10 shrink-0 overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {listing.coverUrl ? (
        <img src={listing.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center bg-surface-secondary text-text-muted">
          <Building2 aria-hidden="true" size={15} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition-all duration-150 group-hover:bg-slate-900/55 group-hover:opacity-100 group-focus-visible:bg-slate-900/55 group-focus-visible:opacity-100">
        <Eye aria-hidden="true" size={15} />
      </span>
    </button>
  )
}

/**
 * Every listing, or the ones in a single state.
 *
 * One page behind six sidebar entries: they differ by which listings they show
 * and by nothing else. Searching, filtering and paging are the server's work.
 */
function AdminListingsPage({ status = null, titleKey }) {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { formatDate, formatMoney, formatNumber } = useAdminFormat()

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ listings: [], total: 0, page: 1, totalPages: 1 })
  const [state, setState] = useState('loading')

  // The listing whose gallery is open, and what has arrived for it.
  const [gallery, setGallery] = useState(null)
  const [images, setImages] = useState([])
  const [imagesLoading, setImagesLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [query])

  // A different sidebar entry is a different filter, so the page resets.
  useEffect(() => {
    setPage(1)
  }, [status])

  const firstLoad = useRef(true)
  const load = useCallback(
    async (signal) => {
      if (firstLoad.current) setState('loading')
      try {
        setData(await fetchListings({
          status: status ?? '', search, page, limit: PER_PAGE, token, signal,
        }))
        setState('ready')
        firstLoad.current = false
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState('error')
      }
    },
    [status, search, page, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const openGallery = async (listing) => {
    setGallery(listing)
    setImagesLoading(true)
    try {
      setImages(await fetchListingImages(listing.id, { token }))
    } catch {
      setImages([])
    }
    setImagesLoading(false)
  }

  const empty = status ?? 'null'
  const from = data.total === 0 ? 0 : (data.page - 1) * PER_PAGE + 1
  const to = Math.min(data.page * PER_PAGE, data.total)

  return (
    <div className="flex min-h-full flex-col gap-5">
      <PageHeading
        title={t(titleKey)}
        description={t('page.listings.count', { count: formatNumber(data.total) })}
      />

      <AdminCard className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('listings.search')}
            aria-label={t('listings.search')}
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-xs placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {/* The status is decided by which sidebar entry you came through, so
              there is no second control for it here. */}
          <span className="hidden shrink-0 text-xs text-text-muted sm:block">
            {t('users.showing', { from, to, total: formatNumber(data.total) })}
          </span>
        </div>

        {state === 'loading' ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : state === 'error' ? (
          <div className="p-4">
            <EmptyState
              icon={<Building2 aria-hidden="true" size={28} />}
              title={t('listings.loadFailed')}
              description={t('login.errorNetwork')}
            />
          </div>
        ) : (
          <AdminTable
            headers={[
              t('table.listing'), t('table.owner'), t('table.district'), t('table.price'),
              t('table.status'), t('table.views'), t('table.created'), t('table.actions'),
            ]}
            empty={
              data.listings.length === 0 ? (
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
            {data.listings.map((listing) => (
              <Row key={listing.id}>
                <Cell>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CoverThumb
                      listing={listing}
                      label={t('listings.viewImages')}
                      onOpen={() => openGallery(listing)}
                    />
                    <span className="min-w-0 max-w-[220px] truncate font-medium text-text-primary">
                      {listing.title}
                    </span>
                  </span>
                </Cell>
                <Cell className="whitespace-nowrap text-text-secondary">{listing.ownerName}</Cell>
                <Cell className="whitespace-nowrap text-text-secondary">{listing.district}</Cell>
                <Cell className="whitespace-nowrap tabular-nums text-text-secondary">
                  {formatMoney(Number(listing.price), listing.currency)}
                </Cell>
                <Cell><StatusBadge status={listing.status} /></Cell>
                <Cell className="tabular-nums text-text-secondary">
                  {formatNumber(listing.views)}
                </Cell>
                <Cell className="whitespace-nowrap text-text-secondary">
                  {formatDate(listing.createdAt)}
                </Cell>
                <Cell><ViewLink to={adminListingPath(listing.id)} /></Cell>
              </Row>
            ))}
          </AdminTable>
        )}

        {state === 'ready' && data.total > 0 ? (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-xs text-text-muted">
              {t('users.showing', { from, to, total: formatNumber(data.total) })}
            </p>
            <span className="flex items-center gap-1.5">
              <MockButton
                disabled={data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {t('action.previous')}
              </MockButton>
              <span className="px-1 text-xs tabular-nums text-text-secondary">
                {data.page} / {data.totalPages}
              </span>
              <MockButton
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
              >
                {t('action.next')}
              </MockButton>
            </span>
          </div>
        ) : null}
      </AdminCard>

      {gallery ? (
        <ListingGalleryDialog
          title={gallery.title}
          images={images}
          loading={imagesLoading}
          onClose={() => {
            setGallery(null)
            setImages([])
          }}
        />
      ) : null}
    </div>
  )
}

export default AdminListingsPage
