export const ROUTES = {
  home: '/',
  search: '/search',
  apartmentDetails: '/apartment/:id',
  map: '/map',
  wishlist: '/wishlist',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  profile: '/profile',
  dashboard: '/dashboard',
  dashboardProfile: '/dashboard/profile',
  dashboardListings: '/dashboard/listings',
  dashboardSaved: '/dashboard/saved',
  dashboardChats: '/dashboard/chats',
  dashboardBlocked: '/dashboard/blocked',
  dashboardEditProfile: '/dashboard/edit-profile',
  createListing: '/create-listing',
  editListing: '/edit-listing/:id',
  owner: '/owner',
  admin: '/admin',
}

export const apartmentDetailsPath = (id) => `/apartment/${id}`

export const editListingPath = (id) => `/edit-listing/${id}`

/**
 * The dashboard page a listing in a given state lives on.
 *
 * The sidebar links here and a status change navigates here, so both agree
 * about where a listing goes without either spelling out the query string.
 */
export const listingsPathFor = (status) =>
  status ? `${ROUTES.dashboardListings}?status=${status}` : ROUTES.dashboardListings
