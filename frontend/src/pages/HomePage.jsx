import { useCallback, useEffect, useState } from 'react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import SortDropdown from '../components/SortDropdown'
import ApartmentGrid from '../components/ApartmentGrid'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { fetchApartments } from '../services/apartmentsApi'
import { toApiQuery } from '../utils/searchParams'

// How many listings the landing page shows. The API's ceiling, because this
// page has no pagination of its own — a search that matches more than this
// belongs on the results page, which the search bar leads to.
const PAGE_LIMIT = 60

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

  // Every filter is answered by PostgreSQL, including area, floor band and
  // "4+ rooms" — which used to be applied in the browser over whatever one
  // request happened to return. That made the count on this page a count of
  // what had been fetched rather than of what matches.
  const load = useCallback(
    async (signal) => {
      setLoading(true)
      setFailed(false)
      try {
        const result = await fetchApartments({
          signal,
          ...toApiQuery({ districtId, keyword, filters, sort, page: 1, limit: PAGE_LIMIT }),
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
    [districtId, keyword, filters, sort],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const apartments = page.items
  const isSearchActive = Boolean(districtId) || Boolean(keyword) || activeFilterCount > 0

  let countText
  if (failed) {
    countText = t('apartments.loadFailed')
  } else if (loading) {
    countText = t('listing.loading')
  } else if (apartments.length === 0) {
    countText = t('apartments.noResultsCount')
  } else if (isSearchActive) {
    countText = t('apartments.foundCount', { count: page.total })
  } else {
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
