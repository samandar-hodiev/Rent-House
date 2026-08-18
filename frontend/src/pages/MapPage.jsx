import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ApartmentMap from '../components/ApartmentMap'
import MapApartmentPreview from '../components/MapApartmentPreview'
import FilterBar from '../components/FilterBar'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { APARTMENTS } from '../data/apartments'
import { getDistrictById } from '../data/districts'
import { filterApartments } from '../utils/filterApartments'

function MapPage() {
  const { t } = useLocale()
  const [searchParams] = useSearchParams()
  const { districtId, filters, setFilters, clearFilters, activeFilterCount } = useSearch()
  const [selectedApartment, setSelectedApartment] = useState(null)

  const focusApartmentId = useMemo(() => {
    const raw = searchParams.get('apartment')
    return raw ? Number(raw) : null
  }, [searchParams])

  const district = districtId ? getDistrictById(districtId) : null

  // Map MVP: district + filters only, no keyword search (kept disabled in
  // the header — see SearchBar.jsx).
  const visibleApartments = useMemo(
    () => filterApartments(APARTMENTS, { districtId, keyword: '', filters }),
    [districtId, filters],
  )

  const handleMarkerClick = useCallback((apartment) => {
    setSelectedApartment(apartment)
  }, [])

  const isFiltered = Boolean(districtId) || activeFilterCount > 0
  const countText = isFiltered
    ? t('apartments.foundCount', { count: visibleApartments.length })
    : t('apartments.defaultCount', { count: visibleApartments.length })

  return (
    <div className="relative h-[80vh] min-h-[500px] w-full">
      <h1 className="sr-only">{t('map.pageTitle')}</h1>

      <ApartmentMap
        apartments={visibleApartments}
        selectedDistrict={district}
        focusApartmentId={focusApartmentId}
        onMarkerClick={handleMarkerClick}
      />

      <div className="pointer-events-none absolute inset-0 z-1000 flex flex-col items-start justify-between p-4">
        <div className="pointer-events-auto flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            clearFilters={clearFilters}
            activeFilterCount={activeFilterCount}
          />
          <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm">
            {countText}
          </span>
        </div>

        {selectedApartment ? (
          <div className="pointer-events-auto mx-auto w-full sm:mx-0 sm:w-80">
            <MapApartmentPreview
              apartment={selectedApartment}
              onClose={() => setSelectedApartment(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default MapPage
