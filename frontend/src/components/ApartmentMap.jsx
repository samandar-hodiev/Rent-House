import { useEffect, useRef, useState } from 'react'
import { TASHKENT_CENTER } from '../data/districts'
import { getDistrictFeature } from '../data/districtBoundaries'
import { DEFAULT_MAP_LAYER_ID, getMapLayerById } from '../data/mapLayers'
import { formatUzsShort } from '../utils/formatPrice'
import { loadYandexMaps } from '../utils/yandexMaps'

const DEFAULT_ZOOM = 12
const DISTRICT_ZOOM = 14
const LOCATION_ZOOM = 15
const FLY_DURATION_MS = 600
const LOCATION_FLY_DURATION_MS = 800

const DISTRICT_BORDER_COLOR = '#059669'
const DIM_MASK_COLOR = '#0f172a'
const USER_LOCATION_COLOR = '#3b82f6'

// Outer ring of the "dim everything outside the district" mask, in Yandex's
// [lat, lng] order (our GeoJSON boundaries are [lng, lat]). A full-globe
// rectangle is not rendered reliably by the Yandex renderer, so this is a
// generous box around the Tashkent region instead — far outside any view the
// district-level zoom can reach.
const MASK_OUTER_RING = [
  [30, 50],
  [30, 90],
  [50, 90],
  [50, 50],
  [30, 50],
]

const MARKER_WIDTH = 64
const MARKER_HEIGHT = 26

// Keeps the same class names the Leaflet implementation used, so styling
// and any marker lookups keep working unchanged.
const MARKER_TEMPLATE = `
  <div class="renthouse-map-marker" style="position:absolute;transform:translate(-50%,-50%);">
    <div class="flex h-[26px] w-16 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-900 shadow-sm transition-all duration-200 hover:shadow-md $[properties.accentClass]">
      $[properties.priceLabel]
    </div>
  </div>
`

const LOCATION_TEMPLATE = `
  <div class="renthouse-location-marker" style="position:absolute;transform:translate(-50%,-50%);">
    <span class="relative flex size-4 items-center justify-center">
      <span class="absolute size-full animate-ping rounded-full bg-blue-400 opacity-60"></span>
      <span class="relative size-3 rounded-full border-2 border-white bg-blue-500 shadow-md"></span>
    </span>
  </div>
`

// A district boundary is a Polygon or a MultiPolygon (a district with a
// disjoint exclave). Either way we only need its outer ring(s) — none of the
// source districts have holes — converted to Yandex's [lat, lng] order.
function outerRingsOf(geometry) {
  const rings =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map((polygon) => polygon[0])
        : []
  return rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
}

function boundsOfRings(rings) {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  rings.forEach((ring) =>
    ring.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }),
  )
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

function ApartmentMap({
  apartments,
  selectedDistrictId,
  focusApartmentId,
  onMarkerClick,
  userLocation,
  nearbyApartmentIds,
  layerId = DEFAULT_MAP_LAYER_ID,
  mapRef: externalMapRef,
}) {
  const containerRef = useRef(null)
  const ymapsRef = useRef(null)
  const mapRef = useRef(null)
  const markersCollectionRef = useRef(null)
  const districtCollectionRef = useRef(null)
  const locationCollectionRef = useRef(null)
  const markerLayoutRef = useRef(null)
  const trafficProviderRef = useRef(null)
  const hasFocusedInitialApartment = useRef(false)
  // The Yandex API loads asynchronously, so the effects below have to wait
  // for the map instance instead of assuming it exists on first render.
  const [isMapReady, setIsMapReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    loadYandexMaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return

        const map = new ymaps.Map(
          containerRef.current,
          {
            center: [TASHKENT_CENTER.latitude, TASHKENT_CENTER.longitude],
            zoom: DEFAULT_ZOOM,
            // Zoom controls live in the page's compact glass bar — see
            // MapPage's mapRef usage.
            controls: [],
            type: getMapLayerById(layerId).type,
          },
          { suppressMapOpenBlock: true },
        )

        ymapsRef.current = ymaps
        mapRef.current = map
        markerLayoutRef.current = ymaps.templateLayoutFactory.createClass(MARKER_TEMPLATE)

        markersCollectionRef.current = new ymaps.GeoObjectCollection()
        districtCollectionRef.current = new ymaps.GeoObjectCollection()
        locationCollectionRef.current = new ymaps.GeoObjectCollection()
        map.geoObjects.add(districtCollectionRef.current)
        map.geoObjects.add(markersCollectionRef.current)
        map.geoObjects.add(locationCollectionRef.current)

        // MapPage drives zoom through this ref; expose the same small API
        // the Leaflet map instance offered.
        if (externalMapRef) {
          externalMapRef.current = {
            zoomIn: () => map.setZoom(map.getZoom() + 1, { duration: 200 }),
            zoomOut: () => map.setZoom(map.getZoom() - 1, { duration: 200 }),
          }
        }

        setIsMapReady(true)
      })
      .catch(() => {
        // The map simply stays empty if the API cannot be reached; the rest
        // of the page (filters, counts, preview) keeps working.
      })

    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
      ymapsRef.current = null
      if (externalMapRef) externalMapRef.current = null
      markersCollectionRef.current = null
      districtCollectionRef.current = null
      locationCollectionRef.current = null
      markerLayoutRef.current = null
      trafficProviderRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Base map style, swapped in place. Yandex renders the base map below all
  // geo objects, so markers and the district overlay are unaffected.
  useEffect(() => {
    const map = mapRef.current
    const ymaps = ymapsRef.current
    if (!map || !ymaps || !isMapReady) return

    const layer = getMapLayerById(layerId)
    map.setType(layer.type)

    // Traffic is an overlay provider rather than a base type. The provider is
    // used directly instead of ymaps.control.TrafficControl, which would also
    // inject its own on-map widget.
    if (layer.traffic) {
      if (!trafficProviderRef.current) {
        trafficProviderRef.current = new ymaps.traffic.provider.Actual(
          {},
          { infoLayerShown: false },
        )
      }
      trafficProviderRef.current.setMap(map)
    } else {
      trafficProviderRef.current?.setMap(null)
    }
  }, [layerId, isMapReady])

  useEffect(() => {
    const ymaps = ymapsRef.current
    const collection = markersCollectionRef.current
    if (!ymaps || !collection || !isMapReady) return
    collection.removeAll()
    apartments.forEach((apartment) => {
      const isNearby = nearbyApartmentIds?.has(apartment.id) ?? false
      const placemark = new ymaps.Placemark(
        [apartment.latitude, apartment.longitude],
        {
          priceLabel: formatUzsShort(apartment.price),
          accentClass: isNearby
            ? 'ring-2 ring-blue-400 hover:ring-blue-500'
            : 'hover:border-primary hover:text-primary',
        },
        {
          iconLayout: markerLayoutRef.current,
          iconShape: {
            type: 'Rectangle',
            coordinates: [
              [-MARKER_WIDTH / 2, -MARKER_HEIGHT / 2],
              [MARKER_WIDTH / 2, MARKER_HEIGHT / 2],
            ],
          },
        },
      )
      placemark.events.add('click', () => onMarkerClick(apartment))
      collection.add(placemark)
    })
  }, [apartments, nearbyApartmentIds, onMarkerClick, isMapReady])

  useEffect(() => {
    const ymaps = ymapsRef.current
    const map = mapRef.current
    const collection = districtCollectionRef.current
    if (!ymaps || !map || !collection || !isMapReady) return

    collection.removeAll()

    const feature = selectedDistrictId ? getDistrictFeature(selectedDistrictId) : null
    if (!feature) {
      map.setCenter([TASHKENT_CENTER.latitude, TASHKENT_CENTER.longitude], DEFAULT_ZOOM, {
        duration: FLY_DURATION_MS,
      })
      return
    }

    const rings = outerRingsOf(feature.geometry)

    // Dim everything outside the district: one polygon covering the world
    // with the district's ring(s) punched out via the even-odd fill rule.
    collection.add(
      new ymaps.Polygon(
        [MASK_OUTER_RING, ...rings],
        {},
        {
          fillColor: DIM_MASK_COLOR,
          fillOpacity: 0.22,
          fillRule: 'evenOdd',
          stroke: false,
          interactivityModel: 'default#transparent',
        },
      ),
    )

    // Clear green outline for the district's actual boundary.
    rings.forEach((ring) => {
      collection.add(
        new ymaps.Polygon(
          [ring],
          {},
          {
            fill: false,
            strokeColor: DISTRICT_BORDER_COLOR,
            strokeWidth: 2.5,
            strokeOpacity: 0.9,
            interactivityModel: 'default#transparent',
          },
        ),
      )
    })

    // setBounds is asynchronous — clamp the zoom only after it settles, or
    // the clamp would interrupt the animation instead of following it.
    Promise.resolve(
      map.setBounds(boundsOfRings(rings), {
        checkZoomRange: true,
        zoomMargin: 40,
        duration: FLY_DURATION_MS,
      }),
    )
      .then(() => {
        if (mapRef.current && map.getZoom() > DISTRICT_ZOOM) {
          map.setZoom(DISTRICT_ZOOM, { duration: 0 })
        }
      })
      .catch(() => {})
  }, [selectedDistrictId, isMapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady || hasFocusedInitialApartment.current || !focusApartmentId) return
    const apartment = apartments.find((item) => item.id === focusApartmentId)
    if (!apartment) return
    hasFocusedInitialApartment.current = true
    map.setCenter([apartment.latitude, apartment.longitude], DISTRICT_ZOOM)
    onMarkerClick(apartment)
  }, [apartments, focusApartmentId, onMarkerClick, isMapReady])

  useEffect(() => {
    const ymaps = ymapsRef.current
    const map = mapRef.current
    const collection = locationCollectionRef.current
    if (!ymaps || !map || !collection || !isMapReady) return

    collection.removeAll()
    if (!userLocation) return

    if (userLocation.accuracy) {
      collection.add(
        new ymaps.Circle(
          [[userLocation.latitude, userLocation.longitude], userLocation.accuracy],
          {},
          {
            fillColor: USER_LOCATION_COLOR,
            fillOpacity: 0.08,
            strokeColor: USER_LOCATION_COLOR,
            strokeOpacity: 0.3,
            strokeWidth: 1,
            interactivityModel: 'default#transparent',
          },
        ),
      )
    }

    collection.add(
      new ymaps.Placemark(
        [userLocation.latitude, userLocation.longitude],
        {},
        {
          iconLayout: ymaps.templateLayoutFactory.createClass(LOCATION_TEMPLATE),
          interactivityModel: 'default#transparent',
        },
      ),
    )

    map.setCenter([userLocation.latitude, userLocation.longitude], LOCATION_ZOOM, {
      duration: LOCATION_FLY_DURATION_MS,
    })
  }, [userLocation, isMapReady])

  return <div ref={containerRef} className="absolute inset-0 z-0" />
}

export default ApartmentMap
