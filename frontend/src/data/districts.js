// District list used for search/selection UI (DistrictSelector, filter
// chips, apartment cards, etc.) — just id + display name. Real geographic
// boundary data for the Map page lives separately in
// `districtBoundaries.js` / `districts.geo.json`, sourced from actual
// OpenStreetMap administrative boundaries rather than hand-picked points.
export const DISTRICTS = [
  { id: 'sergeli', name: 'Sergeli' },
  { id: 'chilonzor', name: 'Chilonzor' },
  { id: 'yunusobod', name: 'Yunusobod' },
  { id: 'shayxontohur', name: 'Shayxontohur' },
  { id: 'mirobod', name: 'Mirobod' },
  { id: 'yakkasaroy', name: 'Yakkasaroy' },
  { id: 'olmazor', name: 'Olmazor' },
  { id: 'uchtepa', name: 'Uchtepa' },
  { id: 'bektemir', name: 'Bektemir' },
  { id: 'yashnobod', name: 'Yashnobod' },
  { id: 'yangihayot', name: 'Yangihayot' },
  { id: 'mirzo-ulugbek', name: "Mirzo Ulug'bek" },
]

// Rough center of Tashkent, used for the default all-districts map view.
export const TASHKENT_CENTER = { latitude: 41.2995, longitude: 69.2401 }

// District names are shown through i18n (`district.<id>` keys in src/locales),
// so the `name` field above stays the canonical Uzbek value and the id — which
// filtering, the URL and the GeoJSON boundaries all key off — never changes.
export function districtNameKey(id) {
  return `district.${id}`
}

export function getDistrictById(id) {
  return DISTRICTS.find((district) => district.id === id) ?? null
}
