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

export function getDistrictById(id) {
  return DISTRICTS.find((district) => district.id === id) ?? null
}
