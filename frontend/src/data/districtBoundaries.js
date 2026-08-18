import districtsGeoJson from './districts.geo.json'

// Real Tashkent district administrative boundaries — sourced from
// OpenStreetMap (fetched via the Overpass API for each district's
// admin_level=6 relation, outer ways joined into closed ring(s), then
// simplified with Douglas-Peucker to keep bundle size reasonable while
// preserving the actual shape). Not hand-approximated coordinates.
//
// `districts.geo.json` is a standard GeoJSON FeatureCollection; each
// Feature's `properties.id` matches a `DISTRICTS` entry in `districts.js`.
// Adding another district's boundary later is just adding another Feature
// with a matching `id` — no code changes needed here.
export const DISTRICT_BOUNDARIES = districtsGeoJson

const featuresById = new Map(
  districtsGeoJson.features.map((feature) => [feature.properties.id, feature]),
)

export function getDistrictFeature(id) {
  return featuresById.get(id) ?? null
}
