// The title and description a listing displays.
//
// Listings carry their own text: the owner typed it, in whatever language they
// chose, and it is stored on the row — so there is nothing to translate here.
//
// There used to be a fallback to `apartmentTitle.<id>` in the dictionary, for a
// seeded demo catalogue whose copy existed in all three languages. That
// catalogue is gone, and with it the only listings those keys could match: a
// real listing has a uuid, and the fallback could only ever have rendered the
// key itself on screen.
//
// What remains is `toReadableCase`, which is why every screen showing a listing
// agrees on how a shouted title looks.

import { toReadableCase } from './readableText'

export function listingTitle(listing) {
  if (!listing) return ''
  const stored = listing.customTitle ?? listing.title
  return typeof stored === 'string' ? toReadableCase(stored) : ''
}

export function listingDescription(listing) {
  if (!listing) return ''
  const stored = listing.description
  return typeof stored === 'string' ? toReadableCase(stored) : ''
}
