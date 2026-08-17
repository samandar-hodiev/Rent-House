import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Home, SearchX } from 'lucide-react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import SortDropdown, { DEFAULT_SORT_OPTIONS } from '../components/SortDropdown'
import ApartmentGrid from '../components/ApartmentGrid'
import { useWishlist } from '../context/WishlistContext'
import { useLocale } from '../context/LocaleContext'
import { APARTMENTS } from '../data/apartments'
import { filterApartments } from '../utils/filterApartments'
import { sortApartments } from '../utils/sortApartments'
import { ROUTES } from '../routes/paths'

const EMPTY_FILTERS = {
  districtId: null,
  minPrice: null,
  maxPrice: null,
  rooms: null,
  minArea: null,
  maxArea: null,
  furnished: null,
}

const SAVED_SORT_OPTIONS = [
  ...DEFAULT_SORT_OPTIONS,
  { value: 'savedNewest', labelKey: 'sort.savedNewest' },
  { value: 'savedOldest', labelKey: 'sort.savedOldest' },
]

function WishlistPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { savedItems } = useWishlist()
  const [filters, setFiltersState] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState('newest')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  const setFilters = (partial) => setFiltersState((current) => ({ ...current, ...partial }))
  const clearFilters = () => setFiltersState(EMPTY_FILTERS)

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== null).length,
    [filters],
  )

  const savedApartments = useMemo(
    () =>
      APARTMENTS.filter((apartment) => savedItems.has(apartment.id)).map((apartment) => ({
        ...apartment,
        savedAt: savedItems.get(apartment.id),
      })),
    [savedItems],
  )

  const filteredApartments = useMemo(
    () =>
      filterApartments(savedApartments, {
        districtId: filters.districtId,
        keyword: '',
        filters,
      }),
    [savedApartments, filters],
  )

  const apartments = useMemo(
    () => sortApartments(filteredApartments, sort),
    [filteredApartments, sort],
  )

  if (savedApartments.length === 0) {
    return (
      <Container className="pt-10 pb-12 lg:pt-12">
        <h1 className="mb-6 text-2xl font-semibold text-text-primary">
          {t('header.wishlistNav')}
        </h1>
        <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
          <div className="relative flex size-16 items-center justify-center rounded-full bg-primary-light">
            <Home aria-hidden="true" size={30} strokeWidth={1.75} className="text-primary" />
            <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-surface ring-2 ring-surface">
              <Heart aria-hidden="true" size={13} className="fill-primary text-primary" />
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('wishlist.emptyTitle')}
            </h2>
            <p className="text-sm text-text-secondary">{t('wishlist.emptyDescription')}</p>
          </div>

          <button
            type="button"
            onClick={() => navigate(ROUTES.home)}
            className="mt-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('wishlist.emptyAction')}
          </button>
        </div>
      </Container>
    )
  }

  return (
    <Container className="pt-10 pb-12 lg:pt-12">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-text-primary">
            {t('header.wishlistNav')}
          </h1>
          <p className="text-sm text-text-muted">
            {t('wishlist.resultCount', { count: apartments.length })}
          </p>
        </div>

        <SortDropdown sort={sort} onChange={setSort} options={SAVED_SORT_OPTIONS} />
      </div>

      <div className="mb-6">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          showDistrict
          showFloor={false}
        />
      </div>

      <ApartmentGrid
        apartments={apartments}
        loading={loading}
        onClearFilters={clearFilters}
        emptyIcon={<SearchX aria-hidden="true" size={32} className="text-text-muted" />}
        emptyTitle={t('wishlist.filteredEmptyTitle')}
        emptyDescription={t('wishlist.filteredEmptyDescription')}
        emptyActionLabel={t('emptyState.action')}
      />
    </Container>
  )
}

export default WishlistPage
