import { useCallback, useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import SortDropdown from '../components/SortDropdown'
import ApartmentGrid from '../components/ApartmentGrid'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { fetchApartments } from '../services/apartmentsApi'
import { filterApartments } from '../utils/filterApartments'

// How many listings one request brings back. The backend caps it at 60; this
// asks for that maximum so the client-side filters below still work on the
// whole of what is currently published.
const PAGE_LIMIT = 60

// The sort values the UI offers, mapped onto the API's names.
const SORT_PARAM = {
  newest: 'newest',
  priceAsc: 'price_asc',
  priceDesc: 'price_desc',
}

function HomePage() {
  const { t } = useLocale()
  const {
    districtId,
    keyword,
    filters,
    setFilters,
    clearFilters,
    activeFilterCount,
    sort,
    setSort,
    resetSearch,
  } = useSearch()

  const [page, setPage] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  // District, keyword, price, rooms, furnished and the ordering are answered by
  // PostgreSQL; area and floor range are still applied below, because the
  // column filters for them are not exposed by the API yet. That split is safe
  // only while one request covers everything published — see PAGE_LIMIT.
  const load = useCallback(
    async (signal) => {
      setLoading(true)
      setFailed(false)
      try {
        const result = await fetchApartments({
          signal,
          district: districtId ?? '',
          keyword,
          min_price: filters.minPrice ?? '',
          max_price: filters.maxPrice ?? '',
          rooms: filters.rooms ?? undefined,
          furnished: filters.furnished ?? undefined,
          sort: SORT_PARAM[sort] ?? SORT_PARAM.newest,
          limit: PAGE_LIMIT,
        })
        setPage(result)
      } catch (error) {
        if (error?.name === 'AbortError') return
        setFailed(true)
        setPage({ items: [], total: 0 })
      } finally {
        setLoading(false)
      }
    },
    [districtId, keyword, filters.minPrice, filters.maxPrice, filters.rooms, filters.furnished, sort],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // The remaining filters run over what came back. `filterApartments` also
  // re-checks the ones the server applied, which costs nothing and keeps the
  // two from disagreeing if a parameter is ever dropped.
  const apartments = useMemo(
    () => filterApartments(page.items, { districtId, keyword, filters }),
    [page.items, districtId, keyword, filters],
  )

  const isSearchActive = Boolean(districtId) || Boolean(keyword) || activeFilterCount > 0

  let countText
  if (failed) {
    countText = t('apartments.loadFailed')
  } else if (loading) {
    countText = t('listing.loading')
  } else if (apartments.length === 0) {
    countText = t('apartments.noResultsCount')
  } else if (isSearchActive || apartments.length !== page.total) {
    countText = t('apartments.foundCount', { count: apartments.length })
  } else {
    // Unfiltered: the server's total, which is every published listing rather
    // than only the page held in memory.
    countText = t('apartments.defaultCount', { count: page.total })
  }

  return (
    <Container className="pt-10 pb-12 lg:pt-12">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-text-primary">{t('apartments.title')}</h1>
          <p className={`text-sm ${failed ? 'text-error' : 'text-text-muted'}`}>{countText}</p>
        </div>

        <SortDropdown sort={sort} onChange={setSort} />
      </div>

      <div className="mb-6">
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
        />
      </div>

      <ApartmentGrid apartments={apartments} loading={loading} onClearFilters={resetSearch} />
    </Container>
  )
}

export default HomePage
