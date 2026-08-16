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
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
  }
}
