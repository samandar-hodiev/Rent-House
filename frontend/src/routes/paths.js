export const ROUTES = {
  home: '/',
  search: '/search',
  apartmentDetails: '/apartment/:id',
  map: '/map',
  wishlist: '/wishlist',
  login: '/login',
  register: '/register',
  profile: '/profile',
  owner: '/owner',
  admin: '/admin',
}

export const apartmentDetailsPath = (id) => `/apartment/${id}`
