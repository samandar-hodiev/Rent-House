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
