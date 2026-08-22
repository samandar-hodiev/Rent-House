import { useCallback, useRef, useState } from 'react'

// The browser reports failures as numeric codes; these are the messages the
// project already had for them. Kept beside the request that produces them so
// a second caller cannot invent a third wording for "permission denied".
const ERROR_KEYS = {
  1: 'map.locationDenied',
  2: 'map.locationUnavailable',
  3: 'map.locationTimeout',
}

const OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }

/**
 * The browser's idea of where the user is.
 *
 * Extracted from MapPage so the listing form's location picker asks the same
 * question the same way — same options, same error vocabulary — rather than
 * carrying a second copy that drifts.
 *
 * Failure is a state, never an exception: a denied permission, a device with
 * no receiver and a request that timed out all leave the map exactly as it
 * was and put a message next to the button. The map keeps working either way.
 *
 * `onLocated` fires only on success, for callers that need to move something.
 */
export function useGeolocation({ onLocated } = {}) {
  const [status, setStatus] = useState('idle') // idle | locating | granted | error
  const [position, setPosition] = useState(null)
  const [errorKey, setErrorKey] = useState(null)

  // Guards against a second request while one is in flight — two overlapping
  // fixes would race to set the position.
  const isLocatingRef = useRef(false)
  const onLocatedRef = useRef(onLocated)
  onLocatedRef.current = onLocated

  const locate = useCallback(() => {
    if (isLocatingRef.current) return

    if (!navigator.geolocation) {
      setStatus('error')
      setErrorKey('map.locationUnsupported')
      return
    }

    isLocatingRef.current = true
    setStatus('locating')
    setErrorKey(null)

    navigator.geolocation.getCurrentPosition(
      (result) => {
        isLocatingRef.current = false
        const next = {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
        }
        setPosition(next)
        setStatus('granted')
        onLocatedRef.current?.(next)
      },
      (error) => {
        isLocatingRef.current = false
        setStatus('error')
        setErrorKey(ERROR_KEYS[error.code] ?? 'map.locationUnavailable')
      },
      OPTIONS,
    )
  }, [])

  return {
    status,
    position: status === 'granted' ? position : null,
    errorKey,
    isLocating: status === 'locating',
    locate,
  }
}
