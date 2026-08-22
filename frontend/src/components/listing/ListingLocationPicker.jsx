import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from '../../context/LocaleContext'
import MapControls from '../MapControls'
import MapLayerSelector from '../MapLayerSelector'
import { MAP_LAYERS, getMapLayerById } from '../../data/mapLayers'
import { useGeolocation } from '../../hooks/useGeolocation'
import { drawDistrictFocus } from '../../utils/districtFocus'
import { loadYandexMaps } from '../../utils/yandexMaps'

const PICK_ZOOM = 13
const DISTRICT_ZOOM = 15
const LOCATION_ZOOM = 16
const FLY_DURATION_MS = 600

// Traffic is left out of the picker's layer choices on purpose: it answers a
// question ("is this road busy right now") that has nothing to do with marking
// where a flat is, while satellite genuinely helps an owner recognise their own
// building. The Map page still offers all three.
const PICKER_LAYERS = MAP_LAYERS.filter((layer) => !layer.traffic)

// "You are here", distinct from the draggable pin that marks the apartment.
// Same blue dot the Map page uses, so the two maps say it the same way.
const LOCATION_TEMPLATE = `
  <div class="renthouse-location-marker" style="position:absolute;transform:translate(-50%,-50%);">
    <span class="relative flex size-4 items-center justify-center">
      <span class="absolute size-full animate-ping rounded-full bg-blue-400 opacity-60"></span>
      <span class="relative size-3 rounded-full border-2 border-white bg-blue-500 shadow-md"></span>
    </span>
  </div>
`

// Click-to-pick map for the listing's coordinates. It deliberately does not
// reuse `ApartmentMap` — that component belongs to the Map page and carries
// price markers and traffic, neither of which applies here. It does reuse the
// shared Yandex loader, the same OpenStreetMap district boundaries, the same
// district focus rendering, the same geolocation hook and the same control
// components, so there is still one integration and one source of truth.
function ListingLocationPicker({ districtId, latitude, longitude, onChange }) {
  const { t } = useLocale()
  const containerRef = useRef(null)
  const ymapsRef = useRef(null)
  const mapRef = useRef(null)
  const placemarkRef = useRef(null)
  const focusRef = useRef(null)
  const locationRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Whether the owner has put the pin somewhere themselves. Until they have,
  // choosing a district may move it; afterwards the district only reframes the
  // view, because moving a pin someone placed deliberately would silently
  // change the address they just set.
  const hasPickedRef = useRef(false)

  const [status, setStatus] = useState('loading') // loading | ready | error
  const [layerId, setLayerId] = useState(PICKER_LAYERS[0].id)

  const commit = useCallback((coords) => {
    hasPickedRef.current = true
    placemarkRef.current?.geometry.setCoordinates(coords)
    onChangeRef.current({ latitude: coords[0], longitude: coords[1] })
  }, [])

  // Finding the owner is treated as picking the spot: on this map the pin is
  // the apartment, and someone standing in the flat they are listing means
  // "here". The blue dot stays behind to show where the fix actually was, so
  // dragging the pin away afterwards still leaves that visible.
  const handleLocated = useCallback(
    ({ latitude: lat, longitude: lng }) => {
      const map = mapRef.current
      const ymaps = ymapsRef.current
      if (!map || !ymaps) return

      locationRef.current?.removeAll()
      locationRef.current?.add(
        new ymaps.Placemark(
          [lat, lng],
          {},
          {
            iconLayout: ymaps.templateLayoutFactory.createClass(LOCATION_TEMPLATE),
            iconShape: { type: 'Circle', coordinates: [0, 0], radius: 8 },
          },
        ),
      )

      commit([lat, lng])
      map.setCenter([lat, lng], LOCATION_ZOOM, { duration: FLY_DURATION_MS })
    },
    [commit],
  )

  const { errorKey, isLocating, locate } = useGeolocation({ onLocated: handleLocated })

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
            // No built-in controls: the page draws its own, so the picker's
            // buttons match the Map page's rather than sitting beside them in
            // a second visual language.
            controls: [],
            type: getMapLayerById(layerId).type,
          },
          { suppressMapOpenBlock: true },
        )

        const placemark = new ymaps.Placemark([latitude, longitude], {}, { draggable: true })
        // Order matters: the focus overlay is added first so it renders under
        // both markers.
        const focus = new ymaps.GeoObjectCollection()
        const location = new ymaps.GeoObjectCollection()
        map.geoObjects.add(focus)
        map.geoObjects.add(location)
        map.geoObjects.add(placemark)

        map.events.add('click', (event) => commit(event.get('coords')))
        placemark.events.add('dragend', () => commit(placemark.geometry.getCoordinates()))

        ymapsRef.current = ymaps
        mapRef.current = map
        placemarkRef.current = placemark
        focusRef.current = focus
        locationRef.current = location
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
      focusRef.current = null
      locationRef.current = null
    }
    // Mount-only: later coordinate changes are pushed to the placemark below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Base map style, swapped in place.
  useEffect(() => {
    if (status !== 'ready') return
    mapRef.current?.setType(getMapLayerById(layerId).type)
  }, [layerId, status])

  // Choosing a district moves the map and highlights it, rather than only
  // changing the text field. Redrawing clears the previous district, so the
  // highlight can never lag behind the dropdown.
  useEffect(() => {
    const ymaps = ymapsRef.current
    const map = mapRef.current
    const collection = focusRef.current
    if (status !== 'ready' || !ymaps || !map || !collection) return

    const focus = drawDistrictFocus(ymaps, collection, districtId, { fill: true })
    if (!focus) return

    // An untouched pin follows the district, so a listing whose owner never
    // clicked the map is still somewhere in the right district rather than at
    // the centre of Tashkent.
    if (!hasPickedRef.current) {
      placemarkRef.current?.geometry.setCoordinates(focus.center)
      onChangeRef.current({ latitude: focus.center[0], longitude: focus.center[1] })
    }

    // setBounds is asynchronous — clamp the zoom only after it settles, or the
    // clamp would interrupt the animation instead of following it.
    Promise.resolve(
      map.setBounds(focus.bounds, {
        checkZoomRange: true,
        zoomMargin: 24,
        duration: FLY_DURATION_MS,
      }),
    )
      .then(() => {
        if (mapRef.current && map.getZoom() > DISTRICT_ZOOM) {
          map.setZoom(DISTRICT_ZOOM, { duration: 0 })
        }
      })
      .catch(() => {})
  }, [districtId, status])

  const zoomBy = (delta) => {
    const map = mapRef.current
    map?.setZoom(map.getZoom() + delta, { duration: 200 })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text-primary">{t('listing.mapLabel')}</p>
      <p className="text-xs text-text-muted">{t('listing.mapHint')}</p>

      {/* Taller than a thumbnail: picking a point needs enough map to see the
          district, the street around it and the pin at the same time. */}
      <div className="relative h-80 overflow-hidden rounded-md border border-border bg-surface-secondary sm:h-[26rem]">
        <div ref={containerRef} className="size-full" />

        {status === 'ready' ? (
          // Bottom-right, clear of the Yandex attribution strip and of the pin,
          // which sits wherever the owner put it — usually mid-map. One glass
          // container so layers, location and zoom read as a single group, the
          // same arrangement the Map page uses.
          <div className="pointer-events-none absolute bottom-0 right-0 z-10 flex justify-end p-2 pb-8 sm:p-3 sm:pb-9">
            <div className="pointer-events-auto relative flex items-center gap-1 rounded-xl border border-white/25 bg-white/12 px-1.5 py-1 shadow-[0_2px_6px_rgba(15,23,42,0.06)] backdrop-blur-lg dark:bg-surface/20">
              <MapLayerSelector
                layerId={layerId}
                onLayerChange={setLayerId}
                layers={PICKER_LAYERS}
              />
              <MapControls
                onLocate={locate}
                locating={isLocating}
                onZoomIn={() => zoomBy(1)}
                onZoomOut={() => zoomBy(-1)}
              />
            </div>
          </div>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-text-muted">
            {status === 'error' ? t('listing.mapError') : t('listing.mapLoading')}
          </p>
        )}
      </div>

      {/* A refused or failed fix is reported here and nowhere else: the map
          keeps working, so this is a note rather than a form error. */}
      {errorKey ? (
        <p role="status" className="text-xs text-warning">
          {t(errorKey)}
        </p>
      ) : null}

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
