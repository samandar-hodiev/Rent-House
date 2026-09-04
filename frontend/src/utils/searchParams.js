/**
 * The search, as it appears in the address bar.
 *
 * The results page keeps its state in the URL rather than in memory: a search
 * is then something you can bookmark, share, or come back to with the browser's
 * back button — none of which is true of a page that holds its filters in a
 * component. Everything here is the translation between that URL and the shapes
 * the rest of the app already uses.
 *
 * The parameter names are the API's own, so what the address bar shows and what
 * the server is asked are the same words.
 */

export const DEFAULT_SORT = 'newest'

// The sort values the interface offers, mapped onto the API's names. Both area
// orders are answered by the server; until it accepted them, choosing one
// quietly returned newest-first.
export const SORT_PARAM = {
  newest: 'newest',
  cheapest: 'price_asc',
  expensive: 'price_desc',
  areaLarge: 'area_desc',
  areaSmall: 'area_asc',
}

const SORT_FROM_PARAM = Object.fromEntries(
  Object.entries(SORT_PARAM).map(([ui, api]) => [api, ui]),
)

export const EMPTY_FILTERS = {
  minPrice: null,
  maxPrice: null,
  rooms: null,
  minArea: null,
  maxArea: null,
  floorRange: null,
  furnished: null,
}

const FLOOR_BANDS = ['low', 'mid', 'high']

function toNumber(value) {
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Reads a URLSearchParams into the district, keyword, filters and sort. */
export function readSearchParams(params) {
  const furnished = params.get('furnished')
  const floor = params.get('floor')
  const sortParam = params.get('sort')

  return {
    districtId: params.get('district') || null,
    keyword: params.get('keyword') ?? '',
    sort: SORT_FROM_PARAM[sortParam] ?? DEFAULT_SORT,
    page: Math.max(1, toNumber(params.get('page')) ?? 1),
    filters: {
      minPrice: toNumber(params.get('min_price')),
      maxPrice: toNumber(params.get('max_price')),
      rooms: toNumber(params.get('rooms')),
      minArea: toNumber(params.get('min_area')),
      maxArea: toNumber(params.get('max_area')),
      floorRange: FLOOR_BANDS.includes(floor) ? floor : null,
      furnished: furnished === 'true' ? true : furnished === 'false' ? false : null,
    },
  }
}

/**
 * Writes a search back into a query string.
 *
 * Empty values are left out rather than written as blanks, so the address bar
 * shows the search that was actually made — `?district=chilonzor` and not a
 * paragraph of empty parameters.
 */
export function writeSearchParams({ districtId, keyword, filters, sort, page }) {
  const params = new URLSearchParams()
  const set = (key, value) => {
    if (value === null || value === undefined || value === '') return
    params.set(key, String(value))
  }

  set('district', districtId)
  set('keyword', keyword?.trim())
  set('min_price', filters?.minPrice)
  set('max_price', filters?.maxPrice)
  set('rooms', filters?.rooms)
  set('min_area', filters?.minArea)
  set('max_area', filters?.maxArea)
  set('floor', filters?.floorRange)
  if (filters?.furnished !== null && filters?.furnished !== undefined) {
    set('furnished', filters.furnished)
  }
  if (sort && sort !== DEFAULT_SORT) set('sort', SORT_PARAM[sort] ?? sort)
  if (page && page > 1) set('page', page)

  return params
}

/**
 * The same search as the API expects it.
 *
 * "4+ rooms" becomes `rooms_min`, because a set of exact values cannot say "or
 * more"; every other filter maps one to one.
 */
export function toApiQuery({ districtId, keyword, filters, sort, page, limit }) {
  const query = {
    district: districtId ?? '',
    keyword: keyword ?? '',
    min_price: filters.minPrice ?? '',
    max_price: filters.maxPrice ?? '',
    min_area: filters.minArea ?? '',
    max_area: filters.maxArea ?? '',
    floor: filters.floorRange ?? '',
    sort: SORT_PARAM[sort] ?? SORT_PARAM.newest,
    page,
    limit,
  }

  if (filters.rooms !== null) {
    // The filter bar's last option is "4+", which is a minimum rather than a
    // value to match.
    if (filters.rooms >= 4) query.rooms_min = filters.rooms
    else query.rooms = filters.rooms
  }
  if (filters.furnished !== null) query.furnished = filters.furnished

  return query
}

/** How many filters are set, for the badge on the filter button. */
export function countFilters(filters) {
  return Object.values(filters ?? {}).filter((value) => value !== null).length
}
