// Loads the Yandex Maps JS API (v2.1) once per page and resolves with the
// global `ymaps` namespace after it reports ready.
//
// The API key is read from the VITE_YANDEX_MAPS_API_KEY env var and is never
// hardcoded (see .env.example). It is optional in development — the API also
// serves requests without a key — but a key should be configured for
// production use.
const API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY
const API_LANG = 'en_US'
const SCRIPT_ID = 'yandex-maps-api'

let loadPromise = null

export function loadYandexMaps() {
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (window.ymaps?.ready) {
      window.ymaps.ready(() => resolve(window.ymaps))
      return
    }

    const params = new URLSearchParams({ lang: API_LANG })
    if (API_KEY) params.set('apikey', API_KEY)

    const existing = document.getElementById(SCRIPT_ID)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => window.ymaps.ready(() => resolve(window.ymaps)))
    script.addEventListener('error', () => {
      loadPromise = null
      reject(new Error('Yandex Maps API could not be loaded'))
    })

    if (!existing) {
      script.id = SCRIPT_ID
      script.async = true
      script.src = `https://api-maps.yandex.ru/2.1/?${params.toString()}`
      document.head.appendChild(script)
    }
  })

  return loadPromise
}
