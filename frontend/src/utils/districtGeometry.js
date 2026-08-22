// Turning a district's GeoJSON boundary into something Yandex Maps accepts.
//
// Extracted from ApartmentMap so the listing form's location picker can focus
// on a district the same way the Map page does. Both read the same
// OpenStreetMap boundaries from `districtBoundaries.js`, so "Yunusobod" frames
// the identical area in both places — no second set of hand-picked centre
// points to drift out of step with the first.

/**
 * A district boundary's outer ring(s) in Yandex's [lat, lng] order.
 *
 * The source is a Polygon or a MultiPolygon (a district with a disjoint
 * exclave). Either way only the outer ring(s) matter — none of the source
 * districts have holes — and GeoJSON stores coordinates the other way round.
 */
export function outerRingsOf(geometry) {
  const rings =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map((polygon) => polygon[0])
        : []
  return rings.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
}

/** The bounding box of those rings, as Yandex's [[minLat, minLng], [maxLat, maxLng]]. */
export function boundsOfRings(rings) {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  rings.forEach((ring) =>
    ring.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }),
  )
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

/**
 * The centre of a bounding box.
 *
 * Deliberately the box's centre and not the polygon's centroid: this positions
 * a starting marker inside a district the owner has just chosen, and for that
 * "roughly the middle" is the whole requirement.
 */
export function centerOfBounds([[minLat, minLng], [maxLat, maxLng]]) {
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
}
