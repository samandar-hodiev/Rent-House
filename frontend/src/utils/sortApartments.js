export function sortApartments(apartments, sort) {
  const sorted = [...apartments]

  switch (sort) {
    case 'cheapest':
      return sorted.sort((a, b) => a.price - b.price)
    case 'expensive':
      return sorted.sort((a, b) => b.price - a.price)
    case 'areaLarge':
      return sorted.sort((a, b) => b.area - a.area)
    case 'areaSmall':
      return sorted.sort((a, b) => a.area - b.area)
    case 'savedNewest':
      return sorted.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    case 'savedOldest':
      return sorted.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt))
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
  }
}
