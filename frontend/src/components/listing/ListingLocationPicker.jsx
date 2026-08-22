import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../context/LocaleContext'
import MapLayerSelector from '../MapLayerSelector'
import { getDistrictFeature } from '../../data/districtBoundaries'
import { MAP_LAYERS, getMapLayerById } from '../../data/mapLayers'
import { boundsOfRings, centerOfBounds, outerRingsOf } from '../../utils/districtGeometry'
import { loadYandexMaps } from '../../utils/yandexMaps'

const PICK_ZOOM = 13
const DISTRICT_ZOOM = 15
const FLY_DURATION_MS = 600
const DISTRICT_BORDER_COLOR = '#059669'

// Traffic is left out of the picker's layer choices on purpose: it answers a
// question ("is this road busy right now") that has nothing to do with marking
// where a flat is, while satellite genuinely helps an owner recognise their own
// building. The Map page still offers all three.
const PICKER_LAYERS = MAP_LAYERS.filter((layer) => !layer.traffic)

// Click-to-pick map for the listing's coordinates. It deliberately does not
// reuse `ApartmentMap` — that component belongs to the Map page and carries
// price markers, a dimming mask and traffic, none of which apply here. It does
// reuse the shared `loadYandexMaps()` loader, the same OpenStreetMap district
// boundaries and the same layer control, so there is still only one Yandex
// integration and one source of district geography in the project.
function ListingLocationPicker({ districtId, latitude, longitude, onChange }) {
  const { t } = useLocale()
  const containerRef = useRef(null)
  const ymapsRef = useRef(null)
  const mapRef = useRef(null)
  const placemarkRef = useRef(null)
  const outlineRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Whether the owner has put the pin somewhere themselves. Until they have,
  // choosing a district may move it; afterwards the district only reframes the
  // view, because moving a pin someone placed deliberately would silently
  // change the address they just set.
  const hasPickedRef = useRef(false)

  const [status, setStatus] = useState('loading') // loading | ready | error
  const [layerId, setLayerId] = useState(PICKER_LAYERS[0].id)

  useEffect(() => {
    let cancelled = false

    loadYandexMaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return

        const map = new ymaps.Map(
          containerRef.current,
          {
            center: [latitude, longitude],
            zoom: PICK_ZOOM,
            controls: ['zoomControl'],
            type: getMapLayerById(layerId).type,
          },
          { suppressMapOpenBlock: true },
        )

        const placemark = new ymaps.Placemark([latitude, longitude], {}, { draggable: true })
        const outline = new ymaps.GeoObjectCollection()
        map.geoObjects.add(outline)
        map.geoObjects.add(placemark)

        const commit = (coords) => {
          hasPickedRef.current = true
          placemark.geometry.setCoordinates(coords)
          onChangeRef.current({ latitude: coords[0], longitude: coords[1] })
        }

        map.events.add('click', (event) => commit(event.get('coords')))
        placemark.events.add('dragend', () => commit(placemark.geometry.getCoordinates()))

        ymapsRef.current = ymaps
        mapRef.current = map
        placemarkRef.current = placemark
        outlineRef.current = outline
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      mapRef.current?.destroy()
      ymapsRef.current = null
      mapRef.current = null
      placemarkRef.current = null
      outlineRef.current = null
    }
    // Mount-only: later coordinate changes are pushed to the placemark below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Base map style, swapped in place.
  useEffect(() => {
    if (status !== 'ready') return
    mapRef.current?.setType(getMapLayerById(layerId).type)
  }, [layerId, status])

  // Choosing a district moves the map, not just the text field.
  useEffect(() => {
    const ymaps = ymapsRef.current
    const map = mapRef.current
    const outline = outlineRef.current
    if (status !== 'ready' || !ymaps || !map || !outline) return

    outline.removeAll()
    const feature = districtId ? getDistrictFeature(districtId) : null
    if (!feature) return

    const rings = outerRingsOf(feature.geometry)
    const bounds = boundsOfRings(rings)

    // The district's real outline, drawn thin and non-interactive so it frames
    // the area without competing with the pin or swallowing map clicks.
    rings.forEach((ring) => {
      outline.add(
        new ymaps.Polygon(
          [ring],
          {},
          {
            fill: false,
            strokeColor: DISTRICT_BORDER_COLOR,
            strokeWidth: 2,
            strokeOpacity: 0.85,
            interactivityModel: 'default#transparent',
          },
        ),
      )
    })

    // An untouched pin follows the district, so a listing whose owner never
    // clicked the map is still somewhere in the right district rather than at
    // the centre of Tashkent.
    if (!hasPickedRef.current) {
      const center = centerOfBounds(bounds)
      placemarkRef.current?.geometry.setCoordinates(center)
      onChangeRef.current({ latitude: center[0], longitude: center[1] })
    }

    Promise.resolve(
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24, duration: FLY_DURATION_MS }),
    )
      .then(() => {
        if (mapRef.current && map.getZoom() > DISTRICT_ZOOM) {
          map.setZoom(DISTRICT_ZOOM, { duration: 0 })
        }
      })
      .catch(() => {})
  }, [districtId, status])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text-primary">{t('listing.mapLabel')}</p>
      <p className="text-xs text-text-muted">{t('listing.mapHint')}</p>

      {/* Taller than a thumbnail: picking a point needs enough map to see the
          district, the street around it and the pin at the same time. */}
      <div className="relative h-80 overflow-hidden rounded-md border border-border bg-surface-secondary sm:h-[26rem]">
        <div ref={containerRef} className="size-full" />

        {status === 'ready' ? (
          <div className="absolute bottom-3 right-3 z-10 rounded-full bg-white/80 p-1 shadow-[0_2px_8px_rgba(15,23,42,0.15)] backdrop-blur">
            <MapLayerSelector
              layerId={layerId}
              onLayerChange={setLayerId}
              layers={PICKER_LAYERS}
            />
          </div>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-text-muted">
            {status === 'error' ? t('listing.mapError') : t('listing.mapLoading')}
          </p>
        )}
      </div>

      <p className="text-xs text-text-muted">
        {t('listing.coordinates', {
          latitude: latitude.toFixed(5),
          longitude: longitude.toFixed(5),
        })}
      </p>
    </div>
  )
}

export default ListingLocationPicker
