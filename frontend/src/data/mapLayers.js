// Base tile layers offered by the Map page's Layers control. Both sources
// are free and key-less, so no env config/secret is required.
export const MAP_LAYERS = [
  {
    id: 'street',
    labelKey: 'map.layerStreet',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    id: 'satellite',
    labelKey: 'map.layerSatellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
]

export const DEFAULT_MAP_LAYER_ID = 'street'

export function getMapLayerById(id) {
  return MAP_LAYERS.find((layer) => layer.id === id) ?? MAP_LAYERS[0]
}
