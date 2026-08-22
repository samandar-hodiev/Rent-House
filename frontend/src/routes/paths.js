export const ROUTES = {
  home: '/',
  search: '/search',
  apartmentDetails: '/apartment/:id',
  map: '/map',
  wishlist: '/wishlist',
  login: '/login',
  register: '/register',
  profile: '/profile',
  dashboard: '/dashboard',
  dashboardProfile: '/dashboard/profile',
  dashboardListings: '/dashboard/listings',
  dashboardSaved: '/dashboard/saved',
  dashboardChats: '/dashboard/chats',
  dashboardEditProfile: '/dashboard/edit-profile',
  createListing: '/create-listing',
  editListing: '/edit-listing/:id',
  owner: '/owner',
  admin: '/admin',
}

export const apartmentDetailsPath = (id) => `/apartment/${id}`

export const editListingPath = (id) => `/edit-listing/${id}`
