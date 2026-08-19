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
  dashboardChats: '/dashboard/chats',
  dashboardSettings: '/dashboard/settings',
  createListing: '/create-listing',
  owner: '/owner',
  admin: '/admin',
}

export const apartmentDetailsPath = (id) => `/apartment/${id}`
