import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ApartmentMap from '../components/ApartmentMap'
import MapApartmentPreview from '../components/MapApartmentPreview'
import FilterBar from '../components/FilterBar'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { APARTMENTS } from '../data/apartments'
import { getDistrictById } from '../data/districts'
import { filterApartments } from '../utils/filterApartments'
import { getNearbyApartments } from '../utils/geo'

const NEARBY_RADIUS_KM = 3

const GEOLOCATION_ERROR_KEYS = {
  1: 'map.locationDenied',
  2: 'map.locationUnavailable',
  3: 'map.locationTimeout',
}

function MapPage() {
  const { t } = useLocale()
  const [searchParams] = useSearchParams()
  const { districtId, filters, setFilters, clearFilters, activeFilterCount } = useSearch()
  const [selectedApartment, setSelectedApartment] = useState(null)
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle') // idle | locating | granted | error
  const [locationErrorKey, setLocationErrorKey] = useState(null)
  const isLocatingRef = useRef(false)

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

  const nearbyApartments = useMemo(
    () => getNearbyApartments(visibleApartments, userLocation, NEARBY_RADIUS_KM),
    [visibleApartments, userLocation],
  )
  const nearbyApartmentIds = useMemo(
    () => new Set(nearbyApartments.map((apartment) => apartment.id)),
    [nearbyApartments],
  )

  const handleMarkerClick = useCallback((apartment) => {
    setSelectedApartment(apartment)
  }, [])

  const handleLocateRequest = useCallback(() => {
    if (isLocatingRef.current) return
    if (!navigator.geolocation) {
      setLocationStatus('error')
      setLocationErrorKey('map.locationUnsupported')
      return
    }
    isLocatingRef.current = true
    setLocationStatus('locating')
    setLocationErrorKey(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        isLocatingRef.current = false
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setLocationStatus('granted')
      },
      (error) => {
        isLocatingRef.current = false
        setLocationStatus('error')
        setLocationErrorKey(GEOLOCATION_ERROR_KEYS[error.code] ?? 'map.locationUnavailable')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  const isFiltered = Boolean(districtId) || activeFilterCount > 0
  const countText = isFiltered
    ? t('apartments.foundCount', { count: visibleApartments.length })
    : t('apartments.defaultCount', { count: visibleApartments.length })

  const locationStatusText =
    locationStatus === 'locating'
      ? t('map.locating')
      : locationStatus === 'granted'
        ? t('map.nearbyCount', { count: nearbyApartments.length })
        : locationStatus === 'error'
          ? t(locationErrorKey)
          : null

  return (
    <div className="relative w-full flex-1 min-h-[500px]">
      <h1 className="sr-only">{t('map.pageTitle')}</h1>

      <ApartmentMap
        apartments={visibleApartments}
        selectedDistrict={district}
        focusApartmentId={focusApartmentId}
        onMarkerClick={handleMarkerClick}
        userLocation={locationStatus === 'granted' ? userLocation : null}
        nearbyApartmentIds={nearbyApartmentIds}
        onLocateRequest={handleLocateRequest}
        locateLabel={t('map.locateMe')}
      />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-between p-4">
        <div className="flex w-full flex-col items-start gap-2">
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

          {locationStatusText ? (
            <span
              role="status"
              className="pointer-events-auto rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm"
            >
              {locationStatusText}
            </span>
          ) : null}
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
