function matchesFloorRange(floor, floorRange) {
  if (!floorRange) return true
  if (floorRange === 'low') return floor >= 1 && floor <= 5
  if (floorRange === 'mid') return floor >= 6 && floor <= 10
  if (floorRange === 'high') return floor >= 11
  return true
}

function matchesRooms(rooms, roomsFilter) {
  if (roomsFilter === null) return true
  if (roomsFilter === 4) return rooms >= 4
  return rooms === roomsFilter
}

export function filterApartments(apartments, { districtId, keyword, filters }) {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return apartments.filter((apartment) => {
    if (districtId && apartment.districtId !== districtId) return false

    // Defensive: a listing with nothing to match simply does not match. A
    // missing field is a reason to exclude one row, never to throw and blank
    // the page — which is what it did when the API mapper stopped producing it.
    if (normalizedKeyword && !(apartment.searchText ?? '').includes(normalizedKeyword)) {
      return false
    }

    if (filters.minPrice !== null && apartment.price < filters.minPrice) return false
    if (filters.maxPrice !== null && apartment.price > filters.maxPrice) return false

    if (!matchesRooms(apartment.rooms, filters.rooms)) return false

    if (filters.minArea !== null && apartment.area < filters.minArea) return false
    if (filters.maxArea !== null && apartment.area > filters.maxArea) return false

    if (!matchesFloorRange(apartment.floor, filters.floorRange)) return false

    if (filters.furnished !== null && apartment.furnished !== filters.furnished) {
      return false
    }

    return true
  })
}
