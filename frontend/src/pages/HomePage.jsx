import { useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import ApartmentGrid from '../components/ApartmentGrid'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { APARTMENTS } from '../data/apartments'
import { filterApartments } from '../utils/filterApartments'

function HomePage() {
  const { t } = useLocale()
  const { districtId, keyword, filters, resetSearch } = useSearch()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  const filteredApartments = useMemo(
    () => filterApartments(APARTMENTS, { districtId, keyword, filters }),
    [districtId, keyword, filters],
  )

  return (
    <Container className="pt-10 pb-12 lg:pt-14">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-text-primary">{t('apartments.title')}</h1>
        <p className="text-sm text-text-muted">
          {t('apartments.foundCount', { count: filteredApartments.length })}
        </p>
      </div>

      <div className="mb-6">
        <FilterBar />
      </div>

      <ApartmentGrid
        apartments={filteredApartments}
        loading={loading}
        onClearFilters={resetSearch}
      />
    </Container>
  )
}

export default HomePage
