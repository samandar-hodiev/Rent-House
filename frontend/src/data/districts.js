// Approximate center point + radius (meters) per district, used only to
// zoom/highlight on the Map page. Not a real GIS boundary dataset — the
// minimum structure needed until real district polygons come from the
// backend.
export const DISTRICTS = [
  { id: 'sergeli', name: 'Sergeli', latitude: 41.2131, longitude: 69.2401, radiusMeters: 3500 },
  { id: 'chilonzor', name: 'Chilonzor', latitude: 41.2789, longitude: 69.2043, radiusMeters: 3000 },
  { id: 'yunusobod', name: 'Yunusobod', latitude: 41.3599, longitude: 69.2887, radiusMeters: 3500 },
  {
    id: 'shayxontohur',
    name: 'Shayxontohur',
    latitude: 41.3287,
    longitude: 69.2401,
    radiusMeters: 2200,
  },
  { id: 'mirobod', name: 'Mirobod', latitude: 41.3007, longitude: 69.2899, radiusMeters: 2200 },
  { id: 'yakkasaroy', name: 'Yakkasaroy', latitude: 41.2925, longitude: 69.2607, radiusMeters: 2000 },
  { id: 'olmazor', name: 'Olmazor', latitude: 41.361, longitude: 69.228, radiusMeters: 3000 },
  { id: 'uchtepa', name: 'Uchtepa', latitude: 41.2967, longitude: 69.1928, radiusMeters: 2800 },
  { id: 'bektemir', name: 'Bektemir', latitude: 41.228, longitude: 69.354, radiusMeters: 3500 },
  { id: 'yashnobod', name: 'Yashnobod', latitude: 41.2942, longitude: 69.3211, radiusMeters: 2800 },
  { id: 'yangihayot', name: 'Yangihayot', latitude: 41.265, longitude: 69.155, radiusMeters: 3000 },
  {
    id: 'mirzo-ulugbek',
    name: "Mirzo Ulug'bek",
    latitude: 41.335,
    longitude: 69.31,
    radiusMeters: 3200,
  },
]

// Rough center of Tashkent, used for the default all-districts map view.
export const TASHKENT_CENTER = { latitude: 41.2995, longitude: 69.2401 }

export function getDistrictById(id) {
  return DISTRICTS.find((district) => district.id === id) ?? null
}
