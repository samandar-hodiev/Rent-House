import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import SortDropdown, { DEFAULT_SORT_OPTIONS } from '../components/SortDropdown'
import ApartmentGrid from '../components/ApartmentGrid'
import EmptyState from '../components/EmptyState'
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
        <EmptyState
          icon={<Heart size={40} aria-hidden="true" />}
          title={t('wishlist.emptyTitle')}
          description={t('wishlist.emptyDescription')}
          actionLabel={t('wishlist.emptyAction')}
          onAction={() => navigate(ROUTES.home)}
        />
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

      <ApartmentGrid apartments={apartments} loading={loading} onClearFilters={clearFilters} />
    </Container>
  )
}

export default WishlistPage
