import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TASHKENT_CENTER } from '../data/districts'
import { formatUzsShort } from '../utils/formatPrice'

const DEFAULT_ZOOM = 12
const DISTRICT_ZOOM = 14
const LOCATION_ZOOM = 15
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const DISTRICT_BORDER_COLOR = '#059669'
const DIM_MASK_COLOR = '#0f172a'
// A rectangle far larger than the Tashkent viewport, used with the district
// boundary as a hole so everything outside the district reads as dimmed.
const WORLD_MASK_RING = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
]

const MARKER_WIDTH = 64
const MARKER_HEIGHT = 26

function createPriceIcon(apartment, { isNearby = false } = {}) {
  const nearbyClass = isNearby
    ? 'ring-2 ring-blue-400 hover:ring-blue-500'
    : 'hover:border-primary hover:text-primary'
  const html = `
    <div class="flex size-full cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-border bg-white text-xs font-semibold text-text-primary shadow-sm transition-all duration-200 hover:shadow-md ${nearbyClass}">
      ${formatUzsShort(apartment.price)}
    </div>
  `
  return L.divIcon({
    html,
    className: 'renthouse-map-marker',
    iconSize: [MARKER_WIDTH, MARKER_HEIGHT],
    iconAnchor: [MARKER_WIDTH / 2, MARKER_HEIGHT / 2],
  })
}

function createLocationDivIcon() {
  return L.divIcon({
    html: `
      <span class="relative flex size-4 items-center justify-center">
        <span class="absolute size-full animate-ping rounded-full bg-blue-400 opacity-60"></span>
        <span class="relative size-3 rounded-full border-2 border-white bg-blue-500 shadow-md"></span>
      </span>
    `,
    className: 'renthouse-location-marker',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

const LocateControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd() {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
    const link = L.DomUtil.create('a', 'renthouse-locate-control', container)
    link.href = '#'
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', this.options.label)
    link.title = this.options.label
    link.innerHTML =
      '<svg viewBox="0 0 20 20" fill="currentColor" class="size-4" aria-hidden="true"><path d="M10 2a1 1 0 0 1 1 1v1.06a6.5 6.5 0 0 1 5.94 5.94H18a1 1 0 1 1 0 2h-1.06A6.5 6.5 0 0 1 11 17.94V19a1 1 0 1 1-2 0v-1.06A6.5 6.5 0 0 1 3.06 12H2a1 1 0 1 1 0-2h1.06A6.5 6.5 0 0 1 9 4.06V3a1 1 0 0 1 1-1Zm0 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg>'
    link.style.display = 'flex'
    link.style.alignItems = 'center'
    link.style.justifyContent = 'center'
    link.style.width = '30px'
    link.style.height = '30px'
    link.style.color = '#334155'

    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.on(link, 'click', L.DomEvent.stop)
    L.DomEvent.on(link, 'click', () => this.options.onClick?.())

    return container
  },
})

function ApartmentMap({
  apartments,
  selectedDistrict,
  focusApartmentId,
  onMarkerClick,
  userLocation,
  nearbyApartmentIds,
  onLocateRequest,
  locateLabel,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersLayerRef = useRef(null)
  const districtLayerRef = useRef(null)
  const locationLayerRef = useRef(null)
  const hasFocusedInitialApartment = useRef(false)
  const onLocateRequestRef = useRef(onLocateRequest)

  useEffect(() => {
    onLocateRequestRef.current = onLocateRequest
  }, [onLocateRequest])

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [TASHKENT_CENTER.latitude, TASHKENT_CENTER.longitude],
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: true,
      zoomControl: false,
    })
    L.control.zoom({ position: 'topright' }).addTo(map)
    new LocateControl({
      label: locateLabel,
      onClick: () => onLocateRequestRef.current?.(),
    }).addTo(map)
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    markersLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      districtLayerRef.current = null
      locationLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    apartments.forEach((apartment) => {
      const isNearby = nearbyApartmentIds?.has(apartment.id) ?? false
      const marker = L.marker([apartment.latitude, apartment.longitude], {
        icon: createPriceIcon(apartment, { isNearby }),
      })
      marker.on('click', () => onMarkerClick(apartment))
      marker.addTo(layer)
    })
  }, [apartments, nearbyApartmentIds, onMarkerClick])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (districtLayerRef.current) {
      districtLayerRef.current.remove()
      districtLayerRef.current = null
    }
    if (selectedDistrict) {
      const group = L.layerGroup()
      // Dim everything outside the district using the boundary as a hole
      // in a world-covering mask (even-odd fill rule punches the hole).
      L.polygon([WORLD_MASK_RING, selectedDistrict.boundary], {
        stroke: false,
        fillColor: DIM_MASK_COLOR,
        fillOpacity: 0.22,
        interactive: false,
      }).addTo(group)
      // Clear green outline for the district itself.
      L.polygon(selectedDistrict.boundary, {
        color: DISTRICT_BORDER_COLOR,
        weight: 2.5,
        opacity: 0.9,
        fillOpacity: 0,
        interactive: false,
      }).addTo(group)
      group.addTo(map)
      districtLayerRef.current = group

      const center = [selectedDistrict.latitude, selectedDistrict.longitude]
      map.flyTo(center, DISTRICT_ZOOM, { duration: 0.6 })
    } else {
      map.flyTo([TASHKENT_CENTER.latitude, TASHKENT_CENTER.longitude], DEFAULT_ZOOM, {
        duration: 0.6,
      })
    }
  }, [selectedDistrict])

  useEffect(() => {
    const map = mapRef.current
    if (!map || hasFocusedInitialApartment.current || !focusApartmentId) return
    const apartment = apartments.find((item) => item.id === focusApartmentId)
    if (!apartment) return
    hasFocusedInitialApartment.current = true
    map.setView([apartment.latitude, apartment.longitude], DISTRICT_ZOOM)
    onMarkerClick(apartment)
  }, [apartments, focusApartmentId, onMarkerClick])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (locationLayerRef.current) {
      locationLayerRef.current.remove()
      locationLayerRef.current = null
    }
    if (!userLocation) return

    const group = L.layerGroup()
    if (userLocation.accuracy) {
      L.circle([userLocation.latitude, userLocation.longitude], {
        radius: userLocation.accuracy,
        color: '#3b82f6',
        weight: 1,
        opacity: 0.3,
        fillColor: '#3b82f6',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(group)
    }
    L.marker([userLocation.latitude, userLocation.longitude], {
      icon: createLocationDivIcon(),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(group)
    group.addTo(map)
    locationLayerRef.current = group

    map.flyTo([userLocation.latitude, userLocation.longitude], LOCATION_ZOOM, { duration: 0.8 })
  }, [userLocation])

  return <div ref={containerRef} className="absolute inset-0 z-0" />
}

export default ApartmentMap
