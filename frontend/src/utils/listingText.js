// The title and description a listing displays.
//
// Listings from the API carry their own text: the owner typed it, in whatever
// language they chose, and it is stored on the row. The seeded demo catalog
// instead keys its copy off `apartmentTitle.<id>` so it can be shown in all
// three languages.
//
// These helpers prefer the stored text and fall back to the translation key, so
// both kinds of listing render through the same components without either
// having to know which it is holding.

export function listingTitle(t, listing) {
  if (!listing) return ''
  const stored = listing.customTitle ?? listing.title
  if (typeof stored === 'string' && stored.trim()) return stored
  return t(`apartmentTitle.${listing.id}`)
}

export function listingDescription(t, listing) {
  if (!listing) return ''
  const stored = listing.description
  if (typeof stored === 'string' && stored.trim()) return stored
  return t(`apartmentDescription.${listing.id}`)
}
