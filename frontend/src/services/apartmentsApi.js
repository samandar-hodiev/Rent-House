// Listing endpoints. Components call these rather than fetch directly, so the
// request shapes stay in one file next to the backend contract.
//
// The API speaks snake_case and the UI speaks camelCase. The translation lives
// here, in `toApartment` and `toApartmentPayload`, so a rename on either side
// is a change to one file rather than to every screen that renders a listing.
import { request } from './apiClient'

/** Strips the empty values so an optional field is absent rather than "". */
const omitEmpty = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== '' && value != null))

/**
 * Turns an API listing into the shape the existing cards and pages already
 * render.
 *
 * The UI was built against the mock data, so this maps onto that vocabulary —
 * `districtId`, `image`, `title` — and the components did not have to change.
 */
export function toApartment(item) {
  // The API returns `[{ url, is_primary }]`, already ordered cover-first by the
  // repository. Every gallery in the app — the detail page's and the
  // dashboard's — renders `<img src={images[i]}>`, so what they need is a list
  // of URL strings. Handing them the raw objects produced `src="[object
  // Object]"` and a page of broken images, while the card kept working because
  // it reads the single `image` field below.
  const urls = (item.images ?? []).map((image) => image.url).filter(Boolean)
  const cover = item.images?.find((image) => image.is_primary) ?? item.images?.[0] ?? null

  return {
    id: item.id,
    title: item.title,
    description: item.description ?? '',

    price: Number(item.price),
    currency: item.currency,
    rentalPeriod: item.rental_period,

    rooms: item.rooms,
    area: item.area,
    floor: item.floor,
    totalFloors: item.total_floors,
    furnished: item.furnished,

    status: item.status,

    // The card and the filters key off the slug, which is also what the
    // frontend's district list uses — so they line up without a lookup table.
    districtId: item.district?.slug ?? '',
    districtName: item.district?.name ?? '',
    neighborhood: item.neighborhood ?? '',
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,

    deposit: item.deposit ? Number(item.deposit) : null,
    utilities: item.utilities,
    minimumMonths: item.minimum_months ?? null,
    rules: item.rules ?? [],

    amenities: item.amenities ?? [],
    // Cover first, matching the order the API sends.
    images: urls,
    image: cover?.url ?? urls[0] ?? null,

    viewsCount: item.views_count ?? 0,
    owner: item.owner ?? null,

    createdAt: item.created_at,
    updatedAt: item.updated_at,
    // The cards, the detail page and the "newest first" sort all read
    // `postedAt` — the name the catalog used before the API existed. Aliased
    // here rather than renamed in six components, and for the same reason as
    // `districtId` and `image` above: the mapping layer is where the two
    // vocabularies meet.
    postedAt: item.created_at,

    // What keyword search matches against, lower-cased once here rather than
    // rebuilt for every listing on every keystroke.
    //
    // The seeded catalog carried this field and `filterApartments` has always
    // read it; the API mapper did not produce it, so the moment listings came
    // from the database a keyword search threw on the first row and took the
    // home page down with it.
    //
    // The same three fields the server's own keyword filter uses, so the
    // client's second pass cannot disagree with the query that fetched the
    // rows. District is deliberately not among them — it has its own picker,
    // and matching it here would only promise something the server has already
    // filtered out.
    searchText: [item.title, item.address, item.neighborhood]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }
}

/** Builds the request body from the listing form's values. */
export function toApartmentPayload(values, { publish }) {
  const { location, rentalConditions } = values

  return {
    title: values.title.trim(),
    description: values.description.trim(),

    price: String(values.price),
    currency: values.currency,
    // The form's ids are upper case ('MONTHLY'); the column stores the API's
    // lower-case vocabulary.
    rental_period: values.rentalPeriod.toLowerCase(),

    rooms: Number(values.rooms),
    area: Number(values.area),
    floor: Number(values.floor),
    total_floors: Number(values.totalFloors),
    // The form stores this as an id ('FURNISHED' / 'UNFURNISHED'); the column
    // is a boolean.
    furnished: values.furnished === 'FURNISHED',

    district_slug: location.district,
    address: location.address.trim(),
    latitude: location.latitude,
    longitude: location.longitude,

    ...omitEmpty({
      neighborhood: location.neighborhood.trim(),
      deposit: rentalConditions.deposit === '' ? null : String(rentalConditions.deposit),
      minimum_months:
        rentalConditions.minimumMonths === '' ? null : Number(rentalConditions.minimumMonths),
    }),

    utilities: rentalConditions.utilities,
    rules: rentalConditions.rules,
    amenities: values.amenities,

    // Only pictures that actually reached the server. A blob: URL is local to
    // this browser tab and would be a dead link for everyone else, so it is
    // dropped rather than stored as if it were a real image.
    images: values.images
      .filter((image) => image.uploadedUrl)
      .map((image) => ({
        url: image.uploadedUrl,
        is_primary: image.id === values.coverImageId,
      })),

    publish,
  }
}

/** Public feed. Returns `{ items, total, page, limit, pages }`. */
export async function fetchApartments({ signal, ...params } = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    // `rooms` repeats rather than joining, which is what Gin binds to a slice.
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry))
    else query.set(key, value)
  }

  const suffix = query.toString() ? `?${query}` : ''
  const data = await request(`/apartments${suffix}`, { signal })
  return { ...data, items: data.items.map(toApartment) }
}

/** One listing. A draft resolves only for its owner, hence the token. */
export async function fetchApartment(id, { token, signal } = {}) {
  return toApartment(await request(`/apartments/${id}`, { token, signal }))
}

/** The signed-in user's own listings, drafts included. */
export async function fetchMyApartments({ token, signal, ...params } = {}) {
  const query = new URLSearchParams(omitEmpty(params)).toString()
  const data = await request(`/me/apartments${query ? `?${query}` : ''}`, { token, signal })
  return { ...data, items: data.items.map(toApartment) }
}

/** The dashboard's listing counters. */
export function fetchMyApartmentStats({ token, signal } = {}) {
  return request('/me/apartments/stats', { token, signal })
}

export async function createApartment(payload, { token } = {}) {
  return toApartment(await request('/apartments', { method: 'POST', body: payload, token }))
}

export async function updateApartment(id, payload, { token } = {}) {
  return toApartment(await request(`/apartments/${id}`, { method: 'PUT', body: payload, token }))
}

/**
 * Moves a listing to another point in its lifecycle.
 *
 * Separate from `updateApartment`, which rewrites the listing's content along
 * with its gallery and amenities. A status change touches none of that, and
 * which transitions are legal is decided by the server.
 */
export async function changeApartmentStatus(id, status, { token } = {}) {
  const data = await request(`/apartments/${id}/status`, {
    method: 'PATCH',
    body: { status },
    token,
  })
  return toApartment(data)
}

export function deleteApartment(id, { token } = {}) {
  return request(`/apartments/${id}`, { method: 'DELETE', token })
}

/** The districts a listing can be placed in. */
export function fetchDistricts({ signal } = {}) {
  return request('/districts', { signal })
}

/**
 * Uploads one photograph and returns the URL it is served from.
 *
 * Pictures go up as they are chosen rather than with the listing: a gallery
 * base64'd into the JSON body would inflate every request by a third and hold
 * the whole set in memory on both sides. The listing then references URLs.
 */
export async function uploadApartmentImage(file, { token, signal } = {}) {
  const form = new FormData()
  form.append('image', file)
  const data = await request('/uploads/images', {
    method: 'POST',
    body: form,
    token,
    signal,
  })
  return data.url
}
