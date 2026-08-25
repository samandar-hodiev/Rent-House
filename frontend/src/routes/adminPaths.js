// Every admin address in one place, so the sidebar, the routes and the links
// inside pages cannot disagree about where something lives.
const BASE = '/admin'

export const ADMIN_ROUTES = {
  dashboard: BASE,

  users: `${BASE}/users`,
  userDetail: `${BASE}/users/:id`,

  listings: `${BASE}/listings`,
  listingsPending: `${BASE}/listings/pending`,
  listingsActive: `${BASE}/listings/active`,
  listingsClosed: `${BASE}/listings/closed`,
  listingsDrafts: `${BASE}/listings/drafts`,
  listingsDeleted: `${BASE}/listings/deleted`,
  listingDetail: `${BASE}/listings/detail/:id`,

  chats: `${BASE}/chats`,
  reports: `${BASE}/reports`,
  analytics: `${BASE}/analytics`,
  notifications: `${BASE}/notifications`,

  admins: `${BASE}/admins`,
  roles: `${BASE}/roles`,
  auditLogs: `${BASE}/audit-logs`,

  dashboardSettings: `${BASE}/dashboard-settings`,

  settings: `${BASE}/settings`,
  settingsListings: `${BASE}/settings/listings`,
  settingsChat: `${BASE}/settings/chat`,
  settingsSecurity: `${BASE}/settings/security`,
}

export const adminUserPath = (id) => `${BASE}/users/${id}`
export const adminListingPath = (id) => `${BASE}/listings/detail/${id}`
