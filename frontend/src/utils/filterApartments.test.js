import { describe, expect, it } from 'vitest'
import { filterApartments } from './filterApartments'

// The map filters its markers in the browser — it holds the whole catalogue at
// once, so there is nothing to ask the server for. These rules are therefore
// the map's, and a mistake here shows as markers that should not be there.
const listing = (overrides = {}) => ({
  id: 'a', districtId: 'chilonzor', searchText: 'chilonzor bunyodkor metro',
  price: 4000000, rooms: 2, area: 60, floor: 4, furnished: true,
  ...overrides,
})

const NOTHING = {
  minPrice: null, maxPrice: null, rooms: null,
  minArea: null, maxArea: null, floorRange: null, furnished: null,
}

const run = (items, { districtId = null, keyword = '', filters = {} } = {}) =>
  filterApartments(items, { districtId, keyword, filters: { ...NOTHING, ...filters } })

describe('filtering listings', () => {
  it('keeps everything when nothing is asked', () => {
    expect(run([listing(), listing({ id: 'b' })])).toHaveLength(2)
  })

  it('matches a district exactly', () => {
    const items = [listing(), listing({ id: 'b', districtId: 'sergeli' })]
    expect(run(items, { districtId: 'sergeli' }).map((i) => i.id)).toEqual(['b'])
  })

  it('treats "4 rooms" as "four or more"', () => {
    const items = [listing({ id: '3', rooms: 3 }), listing({ id: '4', rooms: 4 }),
      listing({ id: '6', rooms: 6 })]
    expect(run(items, { filters: { rooms: 4 } }).map((i) => i.id)).toEqual(['4', '6'])
  })

  it('matches an exact count below four', () => {
    const items = [listing({ id: '2', rooms: 2 }), listing({ id: '3', rooms: 3 })]
    expect(run(items, { filters: { rooms: 2 } }).map((i) => i.id)).toEqual(['2'])
  })

  it('reads the floor bands the filter bar offers', () => {
    const items = [
      listing({ id: 'low', floor: 3 }),
      listing({ id: 'mid', floor: 8 }),
      listing({ id: 'high', floor: 14 }),
    ]
    expect(run(items, { filters: { floorRange: 'low' } }).map((i) => i.id)).toEqual(['low'])
    expect(run(items, { filters: { floorRange: 'mid' } }).map((i) => i.id)).toEqual(['mid'])
    expect(run(items, { filters: { floorRange: 'high' } }).map((i) => i.id)).toEqual(['high'])
  })

  it('applies price and area as inclusive bounds', () => {
    const items = [listing({ id: 'in', price: 4000000, area: 60 })]
    expect(run(items, { filters: { minPrice: 4000000, maxPrice: 4000000 } })).toHaveLength(1)
    expect(run(items, { filters: { minArea: 60, maxArea: 60 } })).toHaveLength(1)
    expect(run(items, { filters: { minPrice: 4000001 } })).toHaveLength(0)
  })

  it('tells "unfurnished only" apart from "any"', () => {
    const items = [listing({ id: 'yes', furnished: true }), listing({ id: 'no', furnished: false })]
    expect(run(items, { filters: { furnished: false } }).map((i) => i.id)).toEqual(['no'])
    expect(run(items, { filters: { furnished: null } })).toHaveLength(2)
  })

  it('drops a listing with nothing to search rather than throwing', () => {
    // A row whose searchText the API mapper stopped producing used to blank the
    // whole page; one missing field is a reason to exclude one listing.
    const items = [listing(), { ...listing({ id: 'broken' }), searchText: undefined }]
    expect(() => run(items, { keyword: 'metro' })).not.toThrow()
    expect(run(items, { keyword: 'metro' }).map((i) => i.id)).toEqual(['a'])
  })
})
