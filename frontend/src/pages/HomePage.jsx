import { useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import SortDropdown from '../components/SortDropdown'
import ApartmentGrid from '../components/ApartmentGrid'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { APARTMENTS } from '../data/apartments'
import { filterApartments } from '../utils/filterApartments'
import { sortApartments } from '../utils/sortApartments'

function HomePage() {
  const { t } = useLocale()
  const { districtId, keyword, filters, activeFilterCount, sort, resetSearch } = useSearch()
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
    countText = t('apartments.defaultCount', { count: apartments.length })
  }

  return (
    <Container className="pt-10 pb-12 lg:pt-14">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-text-primary">{t('apartments.title')}</h1>
          <p className="text-sm text-text-muted">{countText}</p>
        </div>

        <SortDropdown />
      </div>

      <div className="mb-6">
        <FilterBar />
      </div>

      <ApartmentGrid apartments={apartments} loading={loading} onClearFilters={resetSearch} />
    </Container>
  )
}

export default HomePage
