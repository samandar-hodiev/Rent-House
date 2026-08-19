import { useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import SortDropdown from '../components/SortDropdown'
import ApartmentGrid from '../components/ApartmentGrid'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { APARTMENTS, TOTAL_CATALOG_COUNT } from '../data/apartments'
import { filterApartments } from '../utils/filterApartments'
import { sortApartments } from '../utils/sortApartments'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  const filteredApartments = useMemo(
    () => filterApartments(APARTMENTS, { districtId, keyword, filters }),
    [districtId, keyword, filters],
  )

  const apartments = useMemo(
    () => sortApartments(filteredApartments, sort),
    [filteredApartments, sort],
  )

  const isSearchActive = Boolean(districtId) || Boolean(keyword) || activeFilterCount > 0

  let countText
  if (apartments.length === 0) {
    countText = t('apartments.noResultsCount')
  } else if (isSearchActive) {
    countText = t('apartments.foundCount', { count: apartments.length })
  } else {
    // Unfiltered: report the whole catalog, not just the page held in memory.
    // Any active filter falls into the branch above and reports what actually
    // matched, so filtering and sorting stay truthful.
    countText = t('apartments.defaultCount', { count: TOTAL_CATALOG_COUNT })
  }

  return (
    <Container className="pt-10 pb-12 lg:pt-12">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-text-primary">{t('apartments.title')}</h1>
          <p className="text-sm text-text-muted">{countText}</p>
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
