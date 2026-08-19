// Base map styles offered by the Map page's Layers control, expressed as
// Yandex Maps map types (see ApartmentMap's `map.setType` call).
export const MAP_LAYERS = [
  { id: 'street', labelKey: 'map.layerStreet', type: 'yandex#map' },
  { id: 'satellite', labelKey: 'map.layerSatellite', type: 'yandex#satellite' },
]

export const DEFAULT_MAP_LAYER_ID = 'street'

const STORAGE_KEY = 'renthouse_map_layer'

export function getMapLayerById(id) {
  return MAP_LAYERS.find((layer) => layer.id === id) ?? MAP_LAYERS[0]
}

// The chosen base map is persisted so it survives a reload, the same way the
// locale and wishlist are. Unknown/absent values fall back to the default.
export function readStoredMapLayerId() {
  if (typeof window === 'undefined') return DEFAULT_MAP_LAYER_ID
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return MAP_LAYERS.some((layer) => layer.id === stored) ? stored : DEFAULT_MAP_LAYER_ID
  } catch {
    // Storage can be unavailable (private mode, blocked cookies) — the map
    // must still render, so fall back rather than throw.
    return DEFAULT_MAP_LAYER_ID
  }
}

export function storeMapLayerId(id) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Ignore — persistence is a convenience, not required for the map to work.
  }
}
