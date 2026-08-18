const EARTH_RADIUS_KM = 6371

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

// Great-circle distance between two lat/lng points, in kilometers.
export function getDistanceKm(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function hasValidCoordinates(apartment) {
  return (
    typeof apartment.latitude === 'number' &&
    typeof apartment.longitude === 'number' &&
    Number.isFinite(apartment.latitude) &&
    Number.isFinite(apartment.longitude)
  )
}

// Client-side MVP for "nearby apartments" — isolated here so the same
// distance/radius logic can move to a backend query later without touching
// the map or page components.
export function getNearbyApartments(apartments, userLocation, radiusKm = 3) {
  if (!userLocation) return []

  return apartments
    .filter(hasValidCoordinates)
    .map((apartment) => ({
      apartment,
      distanceKm: getDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        apartment.latitude,
        apartment.longitude,
      ),
    }))
    .filter(({ distanceKm }) => distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map(({ apartment }) => apartment)
}
