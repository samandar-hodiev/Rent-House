import { getDistrictFeature } from '../data/districtBoundaries'
import { boundsOfRings, centerOfBounds, outerRingsOf } from './districtGeometry'

// How a focused district is drawn, in one place.
//
// The geometry comes from `districts.geo.json` (real OpenStreetMap admin
// boundaries) via `districtBoundaries.js`, so adding a district later is still
// a matter of adding a Feature with a matching `properties.id` — there is no
// per-district code anywhere, here or in the components that call this.
//
// The colours live here rather than in JSX because two maps draw this same
// focus state and they must not drift apart.
const BORDER_COLOR = '#059669' // RentHouse primary
const FILL_COLOR = '#059669'
const MASK_COLOR = '#0f172a' // slate-900, the design system's darkest text

// Deliberately gentle. The point is to bias attention toward the district, not
// to switch the surroundings off: a reader still needs the neighbouring streets
// to tell where the district sits.
const MASK_OPACITY = 0.28
const FILL_OPACITY = 0.08

// Outer ring of the "dim everything outside" mask, in Yandex's [lat, lng]
// order (the GeoJSON is [lng, lat]). A full-globe rectangle is not rendered
// reliably by the Yandex renderer, so this is a generous box around the
// Tashkent region instead — far outside any view a district zoom can reach.
const MASK_OUTER_RING = [
  [30, 50],
  [30, 90],
  [50, 90],
  [50, 50],
  [30, 50],
]

// The overlay must never eat a click. On the listing form the map's click
// handler is how an owner drops the pin, and a mask that swallowed clicks
// would make the whole district unpickable.
const PASSTHROUGH = { interactivityModel: 'default#transparent' }

/**
 * Draws "this district is selected" into `collection`, replacing whatever it
 * held before — which is what keeps the highlight in step with the dropdown.
 *
 * Returns the district's bounds and centre so the caller can decide how to
 * move the map, or null when there is no boundary for that id.
 */
export function drawDistrictFocus(ymaps, collection, districtId, { fill = false } = {}) {
  collection.removeAll()

  const feature = districtId ? getDistrictFeature(districtId) : null
  if (!feature) return null

  const rings = outerRingsOf(feature.geometry)

  // Everything outside the district, dimmed: one polygon covering the region
  // with the district's ring(s) punched out through the even-odd fill rule.
  collection.add(
    new ymaps.Polygon(
      [MASK_OUTER_RING, ...rings],
      {},
      {
        fillColor: MASK_COLOR,
        fillOpacity: MASK_OPACITY,
        fillRule: 'evenOdd',
        stroke: false,
        ...PASSTHROUGH,
      },
    ),
  )

  rings.forEach((ring) => {
    // A faint green wash inside the district. Optional because the Map page
    // draws price markers on top, and tinting the ground under them buys
    // nothing there.
    if (fill) {
      collection.add(
        new ymaps.Polygon(
          [ring],
          {},
          { fillColor: FILL_COLOR, fillOpacity: FILL_OPACITY, stroke: false, ...PASSTHROUGH },
        ),
      )
    }

    collection.add(
      new ymaps.Polygon(
        [ring],
        {},
        {
          fill: false,
          strokeColor: BORDER_COLOR,
          strokeWidth: 2.5,
          strokeOpacity: 0.9,
          ...PASSTHROUGH,
        },
      ),
    )
  })

  const bounds = boundsOfRings(rings)
  return { bounds, center: centerOfBounds(bounds) }
}
