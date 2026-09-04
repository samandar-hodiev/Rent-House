import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Flag,
  ArrowUpDown,
  BedDouble,
  Building2,
  ChevronRight,
  Droplets,
  Flame,
  Refrigerator,
  Tv,
  WashingMachine,
  Map,
  MapPin,
  MessageCircle,
  Pencil,
  ParkingCircle,
  Phone,
  Ruler,
  SearchX,
  Share2,
  Sofa,
  Sun,
  Utensils,
  Wifi,
  Wind,
  ShieldCheck,
} from 'lucide-react'
import Container from '../components/Container'
import EmptyState from '../components/EmptyState'
import ImageGallery from '../components/ImageGallery'
import ApartmentDetailsSkeleton from '../components/ApartmentDetailsSkeleton'
import ContactChatModal from '../components/ContactChatModal'
import NoPhoneDialog from '../components/NoPhoneDialog'
import ApartmentGrid from '../components/ApartmentGrid'
import { useLocale } from '../context/LocaleContext'
import { useSiteLocation } from '../hooks/useSiteLocation'
import { useAuth } from '../context/AuthContext'
import { useWishlist } from '../context/WishlistContext'
import ReportListingDialog from '../components/ReportListingDialog'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { getDistrictById, districtNameKey } from '../data/districts'
import { fetchApartment, fetchApartments } from '../services/apartmentsApi'
import { ROUTES, editListingPath } from '../routes/paths'
import { listingDescription, listingTitle } from '../utils/listingText'
import { formatListingPrice } from '../utils/formatPrice'
import { formatPostedAt } from '../utils/formatRelativeTime'
import { toReadableCase } from '../utils/readableText'

// Keyed by amenity slug — the same ids the API returns and the listing form
// submits. Every seeded amenity has an entry, so none of them render as a
// label floating without an icon beside its neighbours.
const AMENITY_ICONS = {
  wifi: Wifi,
  parking: ParkingCircle,
  elevator: ArrowUpDown,
  balcony: Sun,
  ac: Wind,
  furnished: Sofa,
  kitchen: Utensils,
  heating: Flame,
  security: ShieldCheck,
  'hot-water': Droplets,
  gas: Flame,
  fridge: Refrigerator,
  washer: WashingMachine,
  tv: Tv,
}

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
        <path d="M9.653 16.915a.75.75 0 0 0 .694 0c.966-.502 1.916-1.032 2.79-1.657 2.514-1.8 4.613-4.15 4.613-7.15 0-2.223-1.734-3.958-3.87-3.958-1.269 0-2.4.62-3.13 1.596-.73-.977-1.86-1.596-3.13-1.596-2.135 0-3.87 1.735-3.87 3.957 0 3.001 2.1 5.351 4.613 7.15.874.626 1.824 1.156 2.79 1.658Z" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-4"
    >
      <path d="M9.653 16.915a.75.75 0 0 0 .694 0c.966-.502 1.916-1.032 2.79-1.657 2.514-1.8 4.613-4.15 4.613-7.15 0-2.223-1.734-3.958-3.87-3.958-1.269 0-2.4.62-3.13 1.596-.73-.977-1.86-1.596-3.13-1.596-2.135 0-3.87 1.735-3.87 3.957 0 3.001 2.1 5.351 4.613 7.15.874.626 1.824 1.156 2.79 1.658Z" />
    </svg>
  )
}

function ApartmentDetailsPage() {
  const { id } = useParams()
  const { t } = useLocale()
  const { city, country } = useSiteLocation()
  const navigate = useNavigate()
  const { isSaved, toggleWishlist } = useWishlist()
  const requireAuth = useRequireAuth()
  const { token, user } = useAuth()
  const [apartment, setApartment] = useState(null)
  const [similarApartments, setSimilarApartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Both actions belong to an account. The page itself stays public — only
  // saving and messaging require signing in, and both return here afterwards.
  const handleSaveClick = requireAuth(() => toggleWishlist(apartment?.id))
  const handleChatClick = requireAuth(() => setIsChatOpen(true))

  // Reporting is an account's action too, for the same reason as the other
  // two: a complaint nobody can be asked about is not worth recording.
  const [isReportOpen, setIsReportOpen] = useState(false)
  const handleReportClick = requireAuth(() => setIsReportOpen(true))

  // Calling needs a number to call. When the owner has not added one, a `tel:`
  // link would open an empty dialer or do nothing at all, so the button says
  // why instead and offers chat, which does work.
  const [noPhoneOpen, setNoPhoneOpen] = useState(false)
  const ownerPhone = apartment?.owner?.phone?.trim() || null
  const [shareCopied, setShareCopied] = useState(false)

  // The token is sent when there is one so an owner can open their own
  // unpublished draft; to everyone else the backend answers 404, and the
  // not-found state below is what renders.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setApartment(null)

    fetchApartment(id, { token, signal: controller.signal })
      .then(setApartment)
      .catch((error) => {
        if (error?.name !== 'AbortError') setApartment(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [id, token])

  // "Similar" is a second request against the same district, minus this
  // listing. It is not worth blocking the page on, so a failure simply leaves
  // the section empty.
  useEffect(() => {
    if (!apartment) {
      setSimilarApartments([])
      return undefined
    }

    const controller = new AbortController()
    fetchApartments({
      signal: controller.signal,
      district: apartment.districtId,
      limit: 5,
    })
      .then((page) =>
        setSimilarApartments(page.items.filter((item) => item.id !== apartment.id).slice(0, 4)),
      )
      .catch(() => setSimilarApartments([]))

    return () => controller.abort()
  }, [apartment])

  if (loading) {
    return (
      <Container className="py-8">
        <ApartmentDetailsSkeleton />
      </Container>
    )
  }

  if (!apartment) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={<SearchX aria-hidden="true" size={32} className="text-text-muted" />}
          title={t('apartmentDetails.notFoundTitle')}
          description={t('apartmentDetails.notFoundDescription')}
          actionLabel={t('apartmentDetails.notFoundAction')}
          onAction={() => navigate(ROUTES.home)}
        />
      </Container>
    )
  }

  const title = listingTitle(apartment)
  const description = listingDescription(apartment)
  const district = getDistrictById(apartment.districtId)
  const saved = isSaved(apartment.id)

  // Your own listing offers no way to contact yourself. The backend refuses a
  // conversation between an owner and their own listing, so a Call and a
  // Message button here could only ever fail; what belongs in their place is
  // the one action an owner actually wants, which is editing it.
  // Also decides whether the report action is offered: reporting your own
  // listing is refused by the server, and an action that always fails should
  // not be on screen.
  const isOwnListing = Boolean(user?.id && apartment.owner?.id === user.id)

  const facts = [
    { Icon: BedDouble, label: t('filters.rooms'), value: apartment.rooms },
    { Icon: Ruler, label: t('filters.area'), value: `${apartment.area} m²` },
    {
      Icon: Building2,
      label: t('apartmentDetails.totalFloors'),
      value: `${apartment.floor}/${apartment.totalFloors}`,
    },
    {
      Icon: Sofa,
      label: t('filters.furnished'),
      value: apartment.furnished ? t('filters.furnishedYes') : t('filters.furnishedNo'),
    },
  ]

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // user cancelled the native share sheet — nothing to do
      }
      return
    }
    await navigator.clipboard.writeText(url)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  return (
    <Container className="py-8 pb-24 lg:pb-8">
      <nav aria-label={t('a11y.breadcrumb')} className="mb-6 flex items-center gap-1.5 text-sm">
        <Link to={ROUTES.home} className="text-text-secondary hover:text-primary">
          {t('breadcrumb.home')}
        </Link>
        <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-text-muted" />
        {district ? (
          <>
            <span className="text-text-secondary">{t(districtNameKey(district.id))}</span>
            <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-text-muted" />
          </>
        ) : null}
        <span className="truncate text-text-primary">{title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
        <ImageGallery images={apartment.images} title={title} />

        <div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleSaveClick}
                aria-pressed={saved}
                aria-label={
                  saved ? t('apartmentCard.wishlistRemove') : t('apartmentCard.wishlistAdd')
                }
                className={`flex size-9 items-center justify-center rounded-full shadow-[0_2px_10px_rgba(15,23,42,0.10)] ring-1 backdrop-blur-md transition-all duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  saved
                    ? 'bg-primary-light/80 text-primary ring-primary/30'
                    : 'bg-white/70 text-slate-600 ring-white/60 hover:bg-white/90'
                }`}
              >
                <HeartIcon filled={saved} />
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label={t('apartmentDetails.share')}
                className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Share2 aria-hidden="true" size={16} />
              </button>
              {isOwnListing ? null : (
                <button
                  type="button"
                  onClick={handleReportClick}
                  aria-label={t('report.title')}
                  title={t('report.title')}
                  className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Flag aria-hidden="true" size={16} />
                </button>
              )}
            </div>
          </div>
          {shareCopied ? (
            <p className="mt-1 text-xs font-medium text-primary">{t('apartmentDetails.shareCopied')}</p>
          ) : null}

          <p className="mt-3 text-2xl font-bold text-text-primary">
            {formatListingPrice(t, apartment)}
          </p>

          <p className="mt-2 flex items-center gap-1 text-sm text-text-secondary">
            <MapPin aria-hidden="true" size={15} className="shrink-0" />
            {district ? t(districtNameKey(district.id)) : ''}, {city}
            {country ? `, ${country}` : ''} —{' '}
            {toReadableCase(apartment.address)}
          </p>

          <p className="mt-1 text-xs text-text-muted">{formatPostedAt(apartment.postedAt, t)}</p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="group flex flex-col items-start gap-1 rounded-lg border border-border bg-surface p-3 transition-all duration-200 hover:border-primary/30 hover:bg-surface-secondary hover:shadow-sm"
              >
                <fact.Icon aria-hidden="true" size={18} className="text-primary" />
                <p className="text-sm font-semibold text-text-primary transition-colors duration-200 group-hover:text-primary">
                  {fact.value}
                </p>
                <p className="text-xs text-text-muted">{fact.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <h2 className="text-base font-semibold text-text-primary">
              {t('apartmentDetails.description')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
          </div>

          {apartment.amenities.length > 0 ? (
            <div className="mt-6 border-t border-border pt-6">
              <h2 className="text-base font-semibold text-text-primary">
                {t('apartmentDetails.amenities')}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {apartment.amenities.map((amenity) => {
                  const AmenityIcon = AMENITY_ICONS[amenity]
                  return (
                    <div key={amenity} className="flex items-center gap-2 text-sm text-text-secondary">
                      {AmenityIcon ? (
                        <AmenityIcon aria-hidden="true" size={16} className="shrink-0 text-primary" />
                      ) : null}
                      {t(`amenity.${amenity}`)}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-border pt-6">
            <h2 className="text-base font-semibold text-text-primary">
              {t('apartmentDetails.owner')}
            </h2>
            <p className="mt-2 text-sm font-medium text-text-primary">{apartment.owner.name}</p>

            {isOwnListing ? (
              <div className="mt-4 hidden lg:block">
                <p className="text-sm text-text-muted">{t('apartmentDetails.ownListing')}</p>
                <Link
                  to={editListingPath(apartment.id)}
                  className="mt-3 flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Pencil aria-hidden="true" size={16} />
                  {t('apartmentDetails.editListing')}
                </Link>
              </div>
            ) : (
              <div className="mt-4 hidden gap-3 lg:flex">
                {ownerPhone ? (
                  <a
                    href={`tel:${ownerPhone}`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Phone aria-hidden="true" size={16} />
                    {t('apartmentDetails.call')}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNoPhoneOpen(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Phone aria-hidden="true" size={16} />
                    {t('apartmentDetails.call')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleChatClick}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <MessageCircle aria-hidden="true" size={16} />
                  {t('apartmentDetails.message')}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(`/map?apartment=${apartment.id}`)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Map aria-hidden="true" size={16} />
            {t('apartmentCard.mapView')}
          </button>
        </div>
      </div>

      {similarApartments.length > 0 ? (
        <div className="mt-10 border-t border-border pt-8">
          <h2 className="mb-5 text-xl font-semibold text-text-primary">
            {t('apartmentDetails.similarApartments')}
          </h2>
          {/* Spans the same container as the home grid, so it uses the same
              component rather than repeating a column ladder that would drift
              out of step with it. The length check above means the empty state
              is never reached. */}
          <ApartmentGrid apartments={similarApartments} />
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-border bg-surface p-3 lg:hidden">
        {isOwnListing ? (
          <Link
            to={editListingPath(apartment.id)}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Pencil aria-hidden="true" size={16} />
            {t('apartmentDetails.editListing')}
          </Link>
        ) : (
          <>
            {ownerPhone ? (
              <a
                href={`tel:${ownerPhone}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Phone aria-hidden="true" size={16} />
                {t('apartmentDetails.call')}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setNoPhoneOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Phone aria-hidden="true" size={16} />
                {t('apartmentDetails.call')}
              </button>
            )}
            <button
              type="button"
              onClick={handleChatClick}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MessageCircle aria-hidden="true" size={16} />
              {t('apartmentDetails.message')}
            </button>
          </>
        )}
      </div>

      {noPhoneOpen ? (
        <NoPhoneDialog
          name={apartment.owner?.name ?? ''}
          onClose={() => setNoPhoneOpen(false)}
          onOpenChat={() => {
            setNoPhoneOpen(false)
            handleChatClick()
          }}
        />
      ) : null}

      {isReportOpen ? (
        <ReportListingDialog
          apartmentId={apartment.id}
          onClose={() => setIsReportOpen(false)}
        />
      ) : null}

      {isChatOpen ? (
        <ContactChatModal apartmentId={apartment.id} onClose={() => setIsChatOpen(false)} />
      ) : null}
    </Container>
  )
}

export default ApartmentDetailsPage
