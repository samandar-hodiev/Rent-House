// Base map styles offered by the Map page's Layers control, expressed as
// Yandex Maps map types (see ApartmentMap's `map.setType` call).
export const MAP_LAYERS = [
  { id: 'street', labelKey: 'map.layerStreet', type: 'yandex#map' },
  { id: 'satellite', labelKey: 'map.layerSatellite', type: 'yandex#satellite' },
]

export const DEFAULT_MAP_LAYER_ID = 'street'

export function getMapLayerById(id) {
  return MAP_LAYERS.find((layer) => layer.id === id) ?? MAP_LAYERS[0]
}
