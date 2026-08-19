import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../context/LocaleContext'
import { loadYandexMaps } from '../../utils/yandexMaps'

const PICK_ZOOM = 13

// Click-to-pick map for the listing's coordinates. It deliberately does not
// reuse `ApartmentMap` — that component belongs to the Map page and carries
// markers, district boundaries, layer switching and traffic, none of which
// apply here. It does reuse the shared `loadYandexMaps()` loader, so there is
// still only one Yandex API integration in the project.
function ListingLocationPicker({ latitude, longitude, onChange }) {
  const { t } = useLocale()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const placemarkRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    let cancelled = false

    loadYandexMaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return

        const map = new ymaps.Map(
          containerRef.current,
          { center: [latitude, longitude], zoom: PICK_ZOOM, controls: ['zoomControl'] },
          { suppressMapOpenBlock: true },
        )

        const placemark = new ymaps.Placemark([latitude, longitude], {}, { draggable: true })
        map.geoObjects.add(placemark)

        const commit = (coords) => {
          placemark.geometry.setCoordinates(coords)
          onChangeRef.current({ latitude: coords[0], longitude: coords[1] })
        }

        map.events.add('click', (event) => commit(event.get('coords')))
        placemark.events.add('dragend', () =>
          commit(placemark.geometry.getCoordinates()),
        )

        mapRef.current = map
        placemarkRef.current = placemark
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
      placemarkRef.current = null
    }
    // Mount-only: later coordinate changes are pushed to the placemark below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text-primary">{t('listing.mapLabel')}</p>
      <p className="text-xs text-text-muted">{t('listing.mapHint')}</p>

      <div className="relative h-64 overflow-hidden rounded-md border border-border bg-surface-secondary">
        <div ref={containerRef} className="size-full" />

        {status !== 'ready' ? (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-text-muted">
            {status === 'error' ? t('listing.mapError') : t('listing.mapLoading')}
          </p>
        ) : null}
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
