import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ApartmentMap from '../components/ApartmentMap'
import MapApartmentPreview from '../components/MapApartmentPreview'
import MapControls from '../components/MapControls'
import MapLayerSelector from '../components/MapLayerSelector'
import FilterBar from '../components/FilterBar'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { readStoredMapLayerId, storeMapLayerId } from '../data/mapLayers'
import { fetchApartments } from '../services/apartmentsApi'
import { filterApartments } from '../utils/filterApartments'
import { getNearbyApartments } from '../utils/geo'
import { applyMapFiltersToParams, parseMapFiltersFromParams } from '../utils/mapFilterParams'

const NEARBY_RADIUS_KM = 3

const GEOLOCATION_ERROR_KEYS = {
  1: 'map.locationDenied',
  2: 'map.locationUnavailable',
  3: 'map.locationTimeout',
}

function MapPage() {
  const { t } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const { districtId, setDistrictId, filters, setFilters, clearFilters, activeFilterCount } =
    useSearch()
  const [selectedApartment, setSelectedApartment] = useState(null)
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle') // idle | locating | granted | error
  const [locationErrorKey, setLocationErrorKey] = useState(null)
  const [layerId, setLayerId] = useState(readStoredMapLayerId)
  const isLocatingRef = useRef(false)
  const mapControllerRef = useRef(null)
  const skipNextUrlSync = useRef(false)

  const handleLayerChange = useCallback((nextLayerId) => {
    setLayerId(nextLayerId)
    storeMapLayerId(nextLayerId)
  }, [])

  const handleZoomIn = useCallback(() => mapControllerRef.current?.zoomIn(), [])
  const handleZoomOut = useCallback(() => mapControllerRef.current?.zoomOut(), [])

  const focusApartmentId = useMemo(() => {
    const raw = searchParams.get('apartment')
    return raw ? Number(raw) : null
  }, [searchParams])

  // Restore district/filters from the URL once on mount — covers a reload,
  // landing here via browser back/forward, or opening a shared/copied URL.
  // If the URL has no district/filter params, leave whatever's already
  // active (e.g. carried over from Home's shared SearchContext) alone.
  useEffect(() => {
    const parsed = parseMapFiltersFromParams(searchParams)
    if (!parsed.hasAnyValue) return
    skipNextUrlSync.current = true
    if (parsed.districtId) setDistrictId(parsed.districtId)
    setFilters(parsed.filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the URL in sync with the active district/filters (district and
  // "Clear all" clearing filters both flow through here too) so the
  // selection can be reloaded, shared, or restored via back/forward.
  // `replace` avoids spamming browser history on every filter tweak.
  useEffect(() => {
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false
      return
    }
    setSearchParams((prev) => applyMapFiltersToParams(prev, districtId, filters), {
      replace: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtId, filters])

  // Every published listing carries coordinates from the database, so the map
  // pins come from the same rows the listing pages render — nothing here is
  // positioned by hand.
  const [catalog, setCatalog] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    fetchApartments({ signal: controller.signal, limit: 60 })
      .then((page) => setCatalog(page.items))
      .catch((error) => {
        if (error?.name !== 'AbortError') setCatalog([])
      })
    return () => controller.abort()
  }, [])

  // Map MVP: district + filters only, no keyword search (kept disabled in
  // the header — see SearchBar.jsx).
  const visibleApartments = useMemo(
    () => filterApartments(catalog, { districtId, keyword: '', filters }),
    [catalog, districtId, filters],
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
        selectedDistrictId={districtId}
        focusApartmentId={focusApartmentId}
        onMarkerClick={handleMarkerClick}
        userLocation={locationStatus === 'granted' ? userLocation : null}
        nearbyApartmentIds={nearbyApartmentIds}
        layerId={layerId}
        mapRef={mapControllerRef}
      />

      {/* Top glass bar: filter controls, active chips and the result count.
          The map controls live in their own group at the bottom-right. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-start gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-xl border border-white/25 bg-white/8 px-2.5 py-2 shadow-[0_2px_6px_rgba(15,23,42,0.06)] backdrop-blur-lg dark:bg-surface/20 sm:flex-row sm:items-center sm:justify-between">
          {/* Desktop: filter button, chips and count on one row. Mobile:
              FilterBar splits into a compact controls row (button, clear,
              count) plus a chips row that only appears while filters are
              active — both still inside this glass parent. */}
          {/* Content-sized wrapper: without it FilterBar stretches across the
              whole bar on desktop and its chip scroller pushes the result
              count out to the far right. */}
          <div className="flex min-w-0 items-center gap-2">
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              clearFilters={clearFilters}
              activeFilterCount={activeFilterCount}
              glass
              sheetOnMobile
              singleRow
              trailing={
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white/55 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {countText}
                </span>
              }
            />
          </div>
        </div>

        {locationStatusText ? (
          <span
            role="status"
            className="pointer-events-auto rounded-full border border-white/50 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-[0_2px_10px_rgba(15,23,42,0.10)] backdrop-blur-md"
          >
            {locationStatusText}
          </span>
        ) : null}
      </div>

      {/* One horizontal control row in the map's bottom-right corner on every
          breakpoint, sitting above the Yandex attribution/logo strip so it
          never covers the copyright or legal text. */}
      <div className="pointer-events-none absolute bottom-0 right-0 z-10 flex justify-end p-3 pb-9 sm:p-4 sm:pb-10">
        {/* Layers, My Location and both zoom buttons share a single glass
            container so they read as one control group. */}
        <div className="pointer-events-auto relative flex items-center gap-1 rounded-xl border border-white/25 bg-white/12 px-1.5 py-1 shadow-[0_2px_6px_rgba(15,23,42,0.06)] backdrop-blur-lg dark:bg-surface/20">
          <MapLayerSelector layerId={layerId} onLayerChange={handleLayerChange} />
          <MapControls
            onLocate={handleLocateRequest}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            orientation="horizontal"
          />
        </div>
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
