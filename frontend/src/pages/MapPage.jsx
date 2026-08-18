import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LocateFixed, Minus, Plus } from 'lucide-react'
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
  const leafletMapRef = useRef(null)

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
        mapRef={leafletMapRef}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-start gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-white/25 bg-white/20 px-2.5 py-2 shadow-[0_2px_6px_rgba(15,23,42,0.06)] backdrop-blur-lg">
          <div className="flex flex-wrap items-center gap-2">
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              clearFilters={clearFilters}
              activeFilterCount={activeFilterCount}
              glass
            />
            <span className="rounded-full bg-white/55 px-3 py-1.5 text-xs font-medium text-text-secondary">
              {countText}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleLocateRequest}
              aria-label={t('map.locateMe')}
              title={t('map.locateMe')}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-white/70 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LocateFixed aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              onClick={() => leafletMapRef.current?.zoomIn()}
              aria-label={t('map.zoomIn')}
              title={t('map.zoomIn')}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-white/70 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              onClick={() => leafletMapRef.current?.zoomOut()}
              aria-label={t('map.zoomOut')}
              title={t('map.zoomOut')}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-white/70 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Minus aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        {locationStatusText ? (
          <span
            role="status"
            className="pointer-events-auto rounded-full border border-white/50 bg-white/80 px-3 py-1.5 text-xs font-medium text-text-secondary shadow-[0_2px_10px_rgba(15,23,42,0.10)] backdrop-blur-md"
          >
            {locationStatusText}
          </span>
        ) : null}
      </div>

      {selectedApartment ? (
        <>
          {/* Desktop/tablet: floating card near the viewport center. */}
          <div className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center p-4 sm:flex">
            <div className="pointer-events-auto w-full max-w-[400px]">
              <MapApartmentPreview
                apartment={selectedApartment}
                onClose={() => setSelectedApartment(null)}
                variant="floating"
              />
            </div>
          </div>

          {/* Mobile: bottom-sheet card, map stays interactive above it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center sm:hidden">
            <div className="pointer-events-auto w-full">
              <MapApartmentPreview
                apartment={selectedApartment}
                onClose={() => setSelectedApartment(null)}
                variant="sheet"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default MapPage
