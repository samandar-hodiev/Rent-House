import { TASHKENT_CENTER } from './districts'

// Shape and options for the listing form. Kept out of the components so the
// same structure can be POSTed to `/api/v1/apartments` later without the UI
// having to change.
export const MAX_IMAGES = 10
export const MAX_DESCRIPTION = 1200

// Mirrors of the API's binding rules, so the form rejects what the server would
// reject and says which field is at fault.
export const TITLE_MIN = 10
export const TITLE_MAX = 255
export const ADDRESS_MIN = 5
export const AREA_MAX = 10000
export const FLOOR_MAX = 200
export const NEIGHBORHOOD_MAX = 120
export const MIN_MONTHS_MAX = 60

// Quick picks for the common cases. Anything else — a seven-room house, a
// large family flat — is typed in, so the column stores the number the owner
// actually has. "5+" used to be the top option and was stored as a flat 5,
// which made an eight-room listing unrepresentable and "5+ xonali" a lie.
export const ROOM_OPTIONS = ['1', '2', '3', '4', '5']
export const ROOMS_CUSTOM = 'other'
export const ROOMS_MIN = 1
// Matches the API's `binding:"min=1,max=20"`, so the form rejects what the
// server would reject rather than letting the owner find out after Publish.
export const ROOMS_MAX = 20

/** Whether a stored room count needs the manual input rather than a quick pick. */
export function isCustomRoomCount(rooms) {
  const value = String(rooms ?? '')
  return value !== '' && !ROOM_OPTIONS.includes(value)
}

export const CURRENCIES = [
  { id: 'UZS', labelKey: 'listing.currencyUzs' },
  { id: 'USD', labelKey: 'listing.currencyUsd' },
]

export const RENTAL_PERIODS = [
  { id: 'MONTHLY', labelKey: 'listing.periodMonthly' },
  { id: 'DAILY', labelKey: 'listing.periodDaily' },
]

export const FURNISHING = [
  { id: 'FURNISHED', labelKey: 'listing.furnished' },
  { id: 'UNFURNISHED', labelKey: 'listing.unfurnished' },
]

// Reuses the existing `amenity.*` keys where they exist; the rest are the
// attributes a Tashkent rental listing is normally judged on.
export const AMENITIES = [
  'wifi',
  'ac',
  'heating',
  // Kebab-case, because these ids are the amenity slugs stored in the database
  // and echoed back by the API — not private frontend labels. A camelCase
  // "hotWater" here matched nothing server-side and made the whole listing
  // fail to publish with "one of the selected amenities does not exist".
  'hot-water',
  'gas',
  'fridge',
  'washer',
  'tv',
  'kitchen',
  'balcony',
  'elevator',
  'parking',
  'security',
]

export const UTILITIES = [
  { id: 'INCLUDED', labelKey: 'listing.utilitiesIncluded' },
  { id: 'SEPARATE', labelKey: 'listing.utilitiesSeparate' },
]

export const RENTAL_RULES = ['pets', 'smoking', 'families', 'students']

/**
 * A blank listing form.
 *
 * `currency` is a parameter rather than a constant: which currency this
 * marketplace prices in is the owner's to set, and a new listing should open
 * in it. An unknown value falls back to the first currency the form offers, so
 * a misconfigured setting cannot produce a form with no currency at all.
 */
export function createEmptyListing(currency) {
  const known = CURRENCIES.some((option) => option.id === currency)

  return {
    title: '',
    description: '',
    price: '',
    currency: known ? currency : CURRENCIES[0].id,
    rentalPeriod: RENTAL_PERIODS[0].id,
    rooms: '',
    area: '',
    floor: '',
    totalFloors: '',
    furnished: FURNISHING[0].id,
    amenities: [],
    images: [],
    coverImageId: null,
    location: {
      city: 'Toshkent',
      district: '',
      neighborhood: '',
      address: '',
      latitude: TASHKENT_CENTER.latitude,
      longitude: TASHKENT_CENTER.longitude,
    },
    rentalConditions: {
      deposit: '',
      utilities: UTILITIES[0].id,
      minimumMonths: '',
      rules: [],
    },
  }
}

const isPositiveNumber = (value) => value !== '' && Number(value) > 0

// Returns `{ field: messageKey }`. Messages are resolved by the caller so the
// validator itself stays free of translation concerns.
export function validateListing(listing) {
  const errors = {}
  const inRange = (value, min, max) => {
    const number = Number(value)
    return value !== '' && Number.isFinite(number) && number >= min && number <= max
  }

  if (listing.images.length === 0) errors.images = 'listing.errorImages'

  // These bounds mirror the API's binding rules exactly. When the two drift the
  // form accepts something the server then rejects, and the owner is told
  // "something went wrong" with no field marked — which is what happened with
  // a title shorter than ten characters.
  const title = listing.title.trim()
  if (!title) errors.title = 'listing.errorTitle'
  else if (title.length < TITLE_MIN) errors.title = 'listing.errorTitleShort'
  else if (title.length > TITLE_MAX) errors.title = 'listing.errorTitleLong'

  if (!isPositiveNumber(listing.price)) errors.price = 'listing.errorPrice'

  // Rooms is a count, so a fraction is not a smaller apartment — it is a typo.
  const rooms = Number(listing.rooms)
  if (listing.rooms === '') errors.rooms = 'listing.errorRooms'
  else if (!Number.isInteger(rooms)) errors.rooms = 'listing.errorRoomsInteger'
  else if (rooms < ROOMS_MIN || rooms > ROOMS_MAX) errors.rooms = 'listing.errorRoomsRange'

  if (!isPositiveNumber(listing.area)) errors.area = 'listing.errorArea'
  else if (!inRange(listing.area, 1, AREA_MAX)) errors.area = 'listing.errorAreaRange'

  if (!isPositiveNumber(listing.floor)) errors.floor = 'listing.errorFloor'
  else if (!inRange(listing.floor, 1, FLOOR_MAX)) errors.floor = 'listing.errorFloorRange'

  if (!isPositiveNumber(listing.totalFloors)) {
    errors.totalFloors = 'listing.errorTotalFloors'
  } else if (!inRange(listing.totalFloors, 1, FLOOR_MAX)) {
    errors.totalFloors = 'listing.errorFloorRange'
  } else if (isPositiveNumber(listing.floor) && Number(listing.floor) > Number(listing.totalFloors)) {
    errors.floor = 'listing.errorFloorAboveTotal'
  }

  if (!listing.location.city.trim()) errors.city = 'listing.errorCity'
  if (!listing.location.district) errors.district = 'listing.errorDistrict'

  const address = listing.location.address.trim()
  if (!address) errors.address = 'listing.errorAddress'
  else if (address.length < ADDRESS_MIN) errors.address = 'listing.errorAddressShort'

  if (listing.location.neighborhood.trim().length > NEIGHBORHOOD_MAX) {
    errors.neighborhood = 'listing.errorNeighborhoodLong'
  }

  if (!listing.description.trim()) errors.description = 'listing.errorDescription'

  const minimumMonths = listing.rentalConditions.minimumMonths
  if (minimumMonths !== '' && !inRange(minimumMonths, 1, MIN_MONTHS_MAX)) {
    errors.minimumMonths = 'listing.errorMinimumMonths'
  }

  return errors
}

// Maps a stored listing onto the form's shape so edit mode opens pre-filled.
// `title` is passed in because the canonical title is translated
// (`apartmentTitle.<id>`) unless the owner has already overridden it.
export function listingToFormValues(listing, title, description) {
  // The API returns `{ url, is_primary }`; older callers passed bare strings.
  // Both are accepted so this stays the one place the form learns about a
  // listing's gallery.
  const gallery = listing.images?.length ? listing.images : [listing.image].filter(Boolean)
  const images = gallery.map((entry, index) => {
    const url = typeof entry === 'string' ? entry : entry.url
    return {
      id: `existing-${listing.id}-${index}`,
      name: `${index + 1}`,
      url,
      // Already on the server: an edit that does not touch the gallery must
      // resubmit these, or saving would silently empty it.
      uploadedUrl: url,
      uploading: false,
      failed: false,
      isPrimary: typeof entry === 'object' && entry.is_primary,
    }
  })

  return {
    title,
    description,
    price: String(listing.price ?? ''),
    currency: listing.currency ?? CURRENCIES[0].id,
    rentalPeriod: listing.rentalPeriod ?? RENTAL_PERIODS[0].id,
    // The stored count is carried through as-is; the form picks the quick
    // button or the manual input to match, so editing an eight-room listing
    // reopens showing eight rather than snapping back to five.
    rooms: String(listing.rooms ?? ''),
    area: String(listing.area ?? ''),
    floor: String(listing.floor ?? ''),
    totalFloors: String(listing.totalFloors ?? ''),
    furnished: listing.furnished ? FURNISHING[0].id : FURNISHING[1].id,
    // The catalog carries a couple of tags the form does not offer as amenities.
    amenities: (listing.amenities ?? []).filter((id) => AMENITIES.includes(id)),
    images,
    coverImageId: (images.find((image) => image.isPrimary) ?? images[0])?.id ?? null,
    location: {
      city: listing.location?.city ?? 'Toshkent',
      district: listing.districtId ?? '',
      neighborhood: listing.neighborhood ?? listing.location?.neighborhood ?? '',
      address: listing.address ?? '',
      latitude: listing.latitude ?? TASHKENT_CENTER.latitude,
      longitude: listing.longitude ?? TASHKENT_CENTER.longitude,
    },
    rentalConditions: listing.rentalConditions ?? {
      deposit: listing.deposit != null ? String(listing.deposit) : '',
      utilities: listing.utilities ?? UTILITIES[0].id,
      minimumMonths: listing.minimumMonths != null ? String(listing.minimumMonths) : '',
      rules: listing.rules ?? [],
    },
  }
}

// Inverse of the above: what an edit writes back onto the stored listing.
// Deliberately omits `status` — editing never moves a listing between states.
export function formValuesToListing(values) {
  const cover =
    values.images.find((image) => image.id === values.coverImageId) ?? values.images[0] ?? null

  return {
    customTitle: values.title.trim(),
    description: values.description,
    price: Number(values.price) || 0,
    currency: values.currency,
    rentalPeriod: values.rentalPeriod,
    rooms: Number(values.rooms) || 0,
    area: Number(values.area) || 0,
    floor: Number(values.floor) || 0,
    totalFloors: Number(values.totalFloors) || 0,
    furnished: values.furnished === FURNISHING[0].id,
    amenities: values.amenities,
    image: cover?.url ?? '',
    images: values.images.map((image) => image.url),
    districtId: values.location.district,
    address: values.location.address,
    latitude: values.location.latitude,
    longitude: values.location.longitude,
    location: { ...values.location },
    rentalConditions: { ...values.rentalConditions },
  }
}
