import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SORT, EMPTY_FILTERS, countFilters, readSearchParams, toApiQuery, writeSearchParams,
} from './searchParams'

// The search page keeps its whole state in the address bar, so these two
// functions are what makes a search shareable, bookmarkable and survivable
// across a reload. A mistake here is a search that quietly loses a filter.
describe('reading a search from the URL', () => {
  it('reads every filter the interface offers', () => {
    const search = readSearchParams(new URLSearchParams(
      'district=chilonzor&keyword=metro&min_price=2000000&max_price=5000000' +
      '&rooms=2&min_area=40&max_area=90&floor=mid&furnished=true&sort=price_asc&page=3',
    ))

    expect(search.districtId).toBe('chilonzor')
    expect(search.keyword).toBe('metro')
    expect(search.page).toBe(3)
    expect(search.sort).toBe('cheapest')
    expect(search.filters).toEqual({
      minPrice: 2000000,
      maxPrice: 5000000,
      rooms: 2,
      minArea: 40,
      maxArea: 90,
      floorRange: 'mid',
      furnished: true,
    })
  })

  it('treats an empty query as no search at all', () => {
    const search = readSearchParams(new URLSearchParams(''))
    expect(search.districtId).toBeNull()
    expect(search.keyword).toBe('')
    expect(search.page).toBe(1)
    expect(search.sort).toBe(DEFAULT_SORT)
    expect(search.filters).toEqual(EMPTY_FILTERS)
  })

  it('ignores values it does not recognise rather than passing them on', () => {
    const search = readSearchParams(new URLSearchParams(
      'floor=basement&sort=by_vibes&page=-4&min_price=cheap&furnished=maybe',
    ))
    expect(search.filters.floorRange).toBeNull()
    expect(search.filters.minPrice).toBeNull()
    expect(search.filters.furnished).toBeNull()
    expect(search.sort).toBe(DEFAULT_SORT)
    // A page below one is not a page; the first is.
    expect(search.page).toBe(1)
  })
})

describe('writing a search back to the URL', () => {
  it('leaves out what was not searched for', () => {
    const params = writeSearchParams({
      districtId: 'sergeli',
      keyword: '  metro  ',
      filters: { ...EMPTY_FILTERS, rooms: 3 },
      sort: DEFAULT_SORT,
      page: 1,
    })

    expect(params.toString()).toBe('district=sergeli&keyword=metro&rooms=3')
    // The default sort and the first page are not worth an entry each.
    expect(params.has('sort')).toBe(false)
    expect(params.has('page')).toBe(false)
  })

  it('survives a round trip', () => {
    const original = {
      districtId: 'yunusobod',
      keyword: 'bunyodkor',
      filters: {
        minPrice: 3000000, maxPrice: null, rooms: 4, minArea: 50,
        maxArea: null, floorRange: 'high', furnished: false,
      },
      sort: 'expensive',
      page: 2,
    }
    const back = readSearchParams(writeSearchParams(original))

    expect(back.districtId).toBe(original.districtId)
    expect(back.keyword).toBe(original.keyword)
    expect(back.sort).toBe(original.sort)
    expect(back.page).toBe(original.page)
    expect(back.filters).toEqual(original.filters)
  })

  it('keeps "not furnished" rather than dropping it as empty', () => {
    // false is a choice; null is the absence of one. Writing them the same way
    // would silently turn "unfurnished only" into "any".
    const params = writeSearchParams({
      districtId: null, keyword: '', sort: DEFAULT_SORT, page: 1,
      filters: { ...EMPTY_FILTERS, furnished: false },
    })
    expect(params.get('furnished')).toBe('false')
  })
})

describe('asking the API', () => {
  it('sends "4+ rooms" as a minimum rather than as a value', () => {
    const query = toApiQuery({
      districtId: null, keyword: '', sort: DEFAULT_SORT, page: 1, limit: 20,
      filters: { ...EMPTY_FILTERS, rooms: 4 },
    })
    expect(query.rooms_min).toBe(4)
    expect(query.rooms).toBeUndefined()
  })

  it('sends an exact count for the other options', () => {
    const query = toApiQuery({
      districtId: null, keyword: '', sort: DEFAULT_SORT, page: 1, limit: 20,
      filters: { ...EMPTY_FILTERS, rooms: 2 },
    })
    expect(query.rooms).toBe(2)
    expect(query.rooms_min).toBeUndefined()
  })

  it('translates the interface sort names into the API ones', () => {
    const of = (sort) => toApiQuery({
      districtId: null, keyword: '', filters: EMPTY_FILTERS, page: 1, limit: 20, sort,
    }).sort

    expect(of('cheapest')).toBe('price_asc')
    expect(of('expensive')).toBe('price_desc')
    expect(of('areaLarge')).toBe('area_desc')
    expect(of('newest')).toBe('newest')
    // An unknown sort falls back rather than being sent for the server to
    // reject with a 400 the reader cannot act on.
    expect(of('nonsense')).toBe('newest')
  })
})

describe('counting active filters', () => {
  it('counts only what is set', () => {
    expect(countFilters(EMPTY_FILTERS)).toBe(0)
    expect(countFilters({ ...EMPTY_FILTERS, rooms: 2, furnished: false })).toBe(2)
    expect(countFilters(undefined)).toBe(0)
  })
})
