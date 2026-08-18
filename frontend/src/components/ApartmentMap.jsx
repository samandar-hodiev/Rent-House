import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TASHKENT_CENTER } from '../data/districts'
import { formatUzsShort } from '../utils/formatPrice'

const DEFAULT_ZOOM = 12
const DISTRICT_ZOOM = 14
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const DISTRICT_HIGHLIGHT_COLOR = '#E11D48'

const MARKER_WIDTH = 64
const MARKER_HEIGHT = 26

function createPriceIcon(apartment) {
  const html = `
    <div class="flex size-full cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-border bg-white text-xs font-semibold text-text-primary shadow-sm transition-all duration-200 hover:border-primary hover:text-primary hover:shadow-md">
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

function ApartmentMap({ apartments, selectedDistrict, focusApartmentId, onMarkerClick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersLayerRef = useRef(null)
  const districtCircleRef = useRef(null)
  const hasFocusedInitialApartment = useRef(false)

  // Initialize the map once.
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [TASHKENT_CENTER.latitude, TASHKENT_CENTER.longitude],
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: true,
      zoomControl: false,
    })

    // Top-right so it never collides with the floating FilterBar (top-left).
    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)

    markersLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      districtCircleRef.current = null
    }
  }, [])

  // Keep markers in sync with the (already filtered) apartment list.
  useEffect(() => {
    const map = mapRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    apartments.forEach((apartment) => {
      const marker = L.marker([apartment.latitude, apartment.longitude], {
        icon: createPriceIcon(apartment),
      })
      marker.on('click', () => onMarkerClick(apartment))
      marker.addTo(layer)
    })
  }, [apartments, onMarkerClick])

  // Zoom to / highlight the selected district, or reset to the city view.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (districtCircleRef.current) {
      districtCircleRef.current.remove()
      districtCircleRef.current = null
    }

    if (selectedDistrict) {
      const center = [selectedDistrict.latitude, selectedDistrict.longitude]
      districtCircleRef.current = L.circle(center, {
        radius: selectedDistrict.radiusMeters,
        color: DISTRICT_HIGHLIGHT_COLOR,
        weight: 2,
        opacity: 0.6,
        fillColor: DISTRICT_HIGHLIGHT_COLOR,
        fillOpacity: 0.06,
      }).addTo(map)
      map.flyTo(center, DISTRICT_ZOOM, { duration: 0.6 })
    } else {
      map.flyTo([TASHKENT_CENTER.latitude, TASHKENT_CENTER.longitude], DEFAULT_ZOOM, {
        duration: 0.6,
      })
    }
  }, [selectedDistrict])

  // On first load only, focus a specific apartment passed via ?apartment=.
  useEffect(() => {
    const map = mapRef.current
    if (!map || hasFocusedInitialApartment.current || !focusApartmentId) return

    const apartment = apartments.find((item) => item.id === focusApartmentId)
    if (!apartment) return

    hasFocusedInitialApartment.current = true
    map.setView([apartment.latitude, apartment.longitude], DISTRICT_ZOOM)
    onMarkerClick(apartment)
  }, [apartments, focusApartmentId, onMarkerClick])

  return <div ref={containerRef} className="size-full" />
}

export default ApartmentMap
