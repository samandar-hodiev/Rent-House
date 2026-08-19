import { TASHKENT_CENTER } from './districts'

// Shape and options for the listing form. Kept out of the components so the
// same structure can be POSTed to `/api/v1/apartments` later without the UI
// having to change.
export const MAX_IMAGES = 10
export const MAX_DESCRIPTION = 1200

export const ROOM_OPTIONS = ['1', '2', '3', '4', '5+']

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
  'hotWater',
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

export function createEmptyListing() {
  return {
    title: '',
    description: '',
    price: '',
    currency: CURRENCIES[0].id,
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

  if (listing.images.length === 0) errors.images = 'listing.errorImages'
  if (!listing.title.trim()) errors.title = 'listing.errorTitle'
  if (!isPositiveNumber(listing.price)) errors.price = 'listing.errorPrice'
  if (!listing.rooms) errors.rooms = 'listing.errorRooms'
  if (!isPositiveNumber(listing.area)) errors.area = 'listing.errorArea'
  if (!isPositiveNumber(listing.floor)) errors.floor = 'listing.errorFloor'
  if (!isPositiveNumber(listing.totalFloors)) {
    errors.totalFloors = 'listing.errorTotalFloors'
  } else if (isPositiveNumber(listing.floor) && Number(listing.floor) > Number(listing.totalFloors)) {
    errors.floor = 'listing.errorFloorAboveTotal'
  }
  if (!listing.location.city.trim()) errors.city = 'listing.errorCity'
  if (!listing.location.district) errors.district = 'listing.errorDistrict'
  if (!listing.location.address.trim()) errors.address = 'listing.errorAddress'
  if (!listing.description.trim()) errors.description = 'listing.errorDescription'

  return errors
}

// Maps a stored listing onto the form's shape so edit mode opens pre-filled.
// `title` is passed in because the canonical title is translated
// (`apartmentTitle.<id>`) unless the owner has already overridden it.
export function listingToFormValues(listing, title, description) {
  const gallery = listing.images?.length ? listing.images : [listing.image].filter(Boolean)
  const images = gallery.map((url, index) => ({
    id: `existing-${listing.id}-${index}`,
    name: `${index + 1}`,
    url,
  }))

  const rooms = String(listing.rooms ?? '')
  return {
    title,
    description,
    price: String(listing.price ?? ''),
    currency: listing.currency ?? CURRENCIES[0].id,
    rentalPeriod: listing.rentalPeriod ?? RENTAL_PERIODS[0].id,
    // The catalog stores a number; the form offers "5+" as the top option.
    rooms: ROOM_OPTIONS.includes(rooms) ? rooms : Number(rooms) >= 5 ? '5+' : '',
    area: String(listing.area ?? ''),
    floor: String(listing.floor ?? ''),
    totalFloors: String(listing.totalFloors ?? ''),
    furnished: listing.furnished ? FURNISHING[0].id : FURNISHING[1].id,
    // The catalog carries a couple of tags the form does not offer as amenities.
    amenities: (listing.amenities ?? []).filter((id) => AMENITIES.includes(id)),
    images,
    coverImageId: images[0]?.id ?? null,
    location: {
      city: listing.location?.city ?? 'Toshkent',
      district: listing.districtId ?? '',
      neighborhood: listing.location?.neighborhood ?? '',
      address: listing.address ?? '',
      latitude: listing.latitude ?? TASHKENT_CENTER.latitude,
      longitude: listing.longitude ?? TASHKENT_CENTER.longitude,
    },
    rentalConditions: listing.rentalConditions ?? {
      deposit: '',
      utilities: UTILITIES[0].id,
      minimumMonths: '',
      rules: [],
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
    rooms: Number(values.rooms.replace('+', '')) || 0,
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
