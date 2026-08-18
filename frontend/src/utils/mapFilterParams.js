// Maps the Map page's district + filters (SearchContext shape) to/from URL
// query params, so the active selection survives a reload, browser
// back/forward, and copy/paste of the URL. Kept isolated from MapPage so
// the parsing/serialization rules live in one place.
const FILTER_PARAMS = {
  minPrice: 'min_price',
  maxPrice: 'max_price',
  rooms: 'rooms',
  minArea: 'min_area',
  maxArea: 'max_area',
  floorRange: 'floor',
  furnished: 'furnished',
}

const ROOM_VALUES = new Set([1, 2, 3, 4])
const FLOOR_VALUES = new Set(['low', 'mid', 'high'])

function parsePositiveNumber(raw) {
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

// Reads district + filters out of URLSearchParams. `hasAnyValue` tells the
// caller whether the URL actually specified anything (vs. a bare `/map`
// with no query string, where existing state — e.g. carried over from
// Home — should be left alone).
export function parseMapFiltersFromParams(searchParams) {
  const districtId = searchParams.get('district') || null

  const rawRooms = searchParams.get(FILTER_PARAMS.rooms)
  const rooms = rawRooms !== null && ROOM_VALUES.has(Number(rawRooms)) ? Number(rawRooms) : null

  const rawFloor = searchParams.get(FILTER_PARAMS.floorRange)
  const floorRange = rawFloor !== null && FLOOR_VALUES.has(rawFloor) ? rawFloor : null

  const rawFurnished = searchParams.get(FILTER_PARAMS.furnished)
  const furnished = rawFurnished === 'true' ? true : rawFurnished === 'false' ? false : null

  const filters = {
    minPrice: parsePositiveNumber(searchParams.get(FILTER_PARAMS.minPrice)),
    maxPrice: parsePositiveNumber(searchParams.get(FILTER_PARAMS.maxPrice)),
    rooms,
    minArea: parsePositiveNumber(searchParams.get(FILTER_PARAMS.minArea)),
    maxArea: parsePositiveNumber(searchParams.get(FILTER_PARAMS.maxArea)),
    floorRange,
    furnished,
  }

  const hasAnyValue =
    districtId !== null || Object.values(filters).some((value) => value !== null)

  return { districtId, filters, hasAnyValue }
}

// Returns a new URLSearchParams with district/filter keys replaced by the
// given state, preserving any unrelated params already present (e.g. the
// `apartment` deep-link param).
export function applyMapFiltersToParams(prevParams, districtId, filters) {
  const next = new URLSearchParams(prevParams)
  next.delete('district')
  Object.values(FILTER_PARAMS).forEach((param) => next.delete(param))

  if (districtId) next.set('district', districtId)
  for (const [key, param] of Object.entries(FILTER_PARAMS)) {
    const value = filters[key]
    if (value !== null && value !== undefined) next.set(param, String(value))
  }

  return next
}
