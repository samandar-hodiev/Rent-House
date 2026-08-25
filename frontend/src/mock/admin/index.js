// Fake data for the admin dashboard.
//
// Kept out of the components on purpose: every screen reads from here, so the
// numbers on the dashboard, the rows in the tables and the counts in the
// sidebar all agree with one another. When these are replaced by an API, the
// components will not need to change — only this module.
//
// Nothing here is persisted and nothing here is real.

import { LISTING_STATUS } from '../../data/listingStatus'

const DISTRICTS = [
  'Chilonzor',
  'Yunusobod',
  'Sergeli',
  'Mirzo Ulug\'bek',
  'Yakkasaroy',
  'Shayxontohur',
]

// A fixed date so every "3 days ago" in the UI is stable between renders and
// the screenshots in review do not drift.
const NOW = new Date('2026-08-24T15:00:00+05:00')

const daysAgo = (days, hours = 0) =>
  new Date(NOW.getTime() - days * 86400000 - hours * 3600000).toISOString()

// --- users -----------------------------------------------------------------

const USER_NAMES = [
  'Samandar Hodiev', 'Alisher Berdiev', 'Jasur Karimov', 'Dilnoza Rahimova',
  'Bekzod Tursunov', 'Nilufar Ergasheva', 'Sardor Qodirov', 'Malika Yusupova',
  'Aziz Nazarov', 'Gulnora Sattorova', 'Rustam Umarov', 'Zilola Ismoilova',
  'Otabek Sharipov', 'Kamola Abdullayeva', 'Farrux Xolmatov',
]

export const USERS = USER_NAMES.map((name, index) => {
  const slug = name.toLowerCase().split(' ')[0]
  return {
    id: `u-${index + 1}`,
    name,
    email: `${slug}@gmail.com`,
    phone: `+998 9${index % 9} ${300 + index} ${10 + index} ${20 + index}`,
    listings: [12, 4, 7, 0, 3, 9, 1, 5, 0, 2, 6, 8, 3, 0, 11][index],
    status: [3, 8, 13].includes(index) ? 'blocked' : 'active',
    registeredAt: daysAgo(index * 9 + 2),
    lastActiveAt: daysAgo(index % 5, index % 12),
    stats: {
      totalListings: [12, 4, 7, 0, 3, 9, 1, 5, 0, 2, 6, 8, 3, 0, 11][index],
      activeListings: [7, 2, 4, 0, 1, 5, 1, 3, 0, 1, 3, 5, 2, 0, 6][index],
      closedListings: [3, 1, 2, 0, 1, 2, 0, 1, 0, 1, 2, 2, 1, 0, 3][index],
      drafts: [2, 1, 1, 0, 1, 2, 0, 1, 0, 0, 1, 1, 0, 0, 2][index],
      chats: [18, 6, 9, 1, 4, 12, 2, 7, 0, 3, 8, 10, 5, 1, 14][index],
    },
    timeline: [
      { at: '12:31', text: 'Created new listing' },
      { at: '12:42', text: 'Received message' },
      { at: '13:10', text: 'Updated listing' },
      { at: '14:22', text: 'Added listing to favorites' },
    ],
  }
})

// --- listings --------------------------------------------------------------

const LISTING_TITLES = [
  '3 xonali kvartira, metro yonida', '2 xonali uy, hovli bilan',
  '7 xonali kvartira oilaga', '1 xonali studiya', '4 xonali kvartira, yangi bino',
  '5 xonali uy, ta\'mirlangan', '2 xonali kvartira, markazda', '3 xonali uy, bog\' bilan',
  '6 xonali kvartira, panorama', '1 xonali kvartira, arzon',
  '4 xonali uy, garaj bilan', '2 xonali studiya, mebelli',
  '3 xonali kvartira, maktab yonida', '8 xonali uy, biznes uchun',
  '2 xonali kvartira, remont kerak',
]

const LISTING_STATUSES = [
  LISTING_STATUS.active, LISTING_STATUS.active, LISTING_STATUS.pending,
  LISTING_STATUS.active, LISTING_STATUS.closed, LISTING_STATUS.draft,
  LISTING_STATUS.active, LISTING_STATUS.pending, LISTING_STATUS.closed,
  LISTING_STATUS.deleted, LISTING_STATUS.active, LISTING_STATUS.draft,
  LISTING_STATUS.active, LISTING_STATUS.pending, LISTING_STATUS.closed,
]

export const LISTINGS = LISTING_TITLES.map((title, index) => ({
  id: `l-${index + 1}`,
  title,
  owner: USERS[index % USERS.length],
  district: DISTRICTS[index % DISTRICTS.length],
  price: 300 + index * 137,
  currency: index % 3 === 0 ? 'USD' : 'UZS',
  status: LISTING_STATUSES[index],
  views: 40 + index * 63,
  favorites: 2 + (index % 9),
  messages: index % 7,
  rooms: 1 + (index % 8),
  area: 38 + index * 11,
  floor: 1 + (index % 9),
  totalFloors: 9 + (index % 8),
  address: `${DISTRICTS[index % DISTRICTS.length]} tumani, ${10 + index}-uy`,
  description:
    'Uy markazga yaqin, transport qulay. Barcha sharoitlar mavjud, uzoq muddatga beriladi.',
  createdAt: daysAgo(index * 4 + 1),
  updatedAt: daysAgo(index % 6),
  // Deterministic placeholder art rather than photographs nobody licensed.
  images: [index, index + 1, index + 2].map(
    (n) => `https://picsum.photos/seed/renthouse-${n}/640/480`,
  ),
}))

/** Listings in one state, for the sidebar's status pages. */
export const listingsByStatus = (status) =>
  status ? LISTINGS.filter((listing) => listing.status === status) : LISTINGS

/** How many listings sit in each state, for the sidebar counts. */
export const listingStatusCounts = () => {
  const counts = { all: LISTINGS.length }
  for (const status of Object.values(LISTING_STATUS)) {
    counts[status] = LISTINGS.filter((listing) => listing.status === status).length
  }
  return counts
}

// --- chats -----------------------------------------------------------------

export const CHATS = [
  { id: 'c-1', buyer: USERS[1], seller: USERS[0], listing: LISTINGS[0], status: 'active',
    lastMessage: 'Bu uy hali bo\'shmi?', at: daysAgo(0, 2) },
  { id: 'c-2', buyer: USERS[4], seller: USERS[2], listing: LISTINGS[2], status: 'active',
    lastMessage: 'Narxi kelishiladimi?', at: daysAgo(0, 5) },
  { id: 'c-3', buyer: USERS[6], seller: USERS[0], listing: LISTINGS[6], status: 'reported',
    lastMessage: 'Manzilni yuboring iltimos', at: daysAgo(1, 3) },
  { id: 'c-4', buyer: USERS[9], seller: USERS[5], listing: LISTINGS[4], status: 'archived',
    lastMessage: 'Rahmat, o\'ylab ko\'raman', at: daysAgo(2, 1) },
  { id: 'c-5', buyer: USERS[11], seller: USERS[10], listing: LISTINGS[10], status: 'active',
    lastMessage: 'Ertaga ko\'rgani boraman', at: daysAgo(3, 6) },
  { id: 'c-6', buyer: USERS[13], seller: USERS[12], listing: LISTINGS[12], status: 'blocked',
    lastMessage: 'Xabar bloklangan', at: daysAgo(5, 4) },
]

// A short exchange for the read-only preview. Admins moderate conversations;
// they never write in them, so there is no composer and no draft.
export const CHAT_MESSAGES = {
  'c-1': [
    { id: 'm1', from: 'buyer', body: 'Assalomu alaykum, bu uy hali bo\'shmi?', at: '14:02' },
    { id: 'm2', from: 'seller', body: 'Va alaykum assalom. Ha, bo\'sh.', at: '14:05' },
    { id: 'm3', from: 'buyer', body: 'Narxi kelishiladimi?', at: '14:07' },
    { id: 'm4', from: 'seller', body: 'Ko\'rib chiqamiz, keling avval ko\'ring.', at: '14:11' },
  ],
}

// --- reports ---------------------------------------------------------------

const REASONS = ['Fraud', 'Fake listing', 'Wrong information', 'Spam', 'Inappropriate content']
const REPORT_STATUSES = ['pending', 'resolved', 'rejected']

export const REPORTS = Array.from({ length: 9 }, (_, index) => ({
  id: `R-${1200 + index}`,
  reporter: USERS[(index + 2) % USERS.length],
  reported: USERS[(index + 6) % USERS.length],
  listing: LISTINGS[index % LISTINGS.length],
  reason: REASONS[index % REASONS.length],
  status: REPORT_STATUSES[index % REPORT_STATUSES.length],
  createdAt: daysAgo(index + 1, index),
  note: 'Foydalanuvchi e\'lon ma\'lumotlari haqiqatga to\'g\'ri kelmasligini bildirdi.',
}))

// --- notifications ---------------------------------------------------------

export const NOTIFICATIONS = [
  { id: 'n-1', kind: 'user', title: 'New user registered',
    description: 'Farrux Xolmatov created an account.', at: daysAgo(0, 1), read: false },
  { id: 'n-2', kind: 'listing', title: 'New listing submitted',
    description: '"7 xonali kvartira oilaga" is waiting for review.', at: daysAgo(0, 3), read: false },
  { id: 'n-3', kind: 'report', title: 'New report received',
    description: 'Report R-1203 was filed against a listing.', at: daysAgo(0, 6), read: false },
  { id: 'n-4', kind: 'moderation', title: 'Listing requires moderation',
    description: '3 listings have been pending for over 48 hours.', at: daysAgo(1, 2), read: true },
  { id: 'n-5', kind: 'report', title: 'User reported',
    description: 'Dilnoza Rahimova was reported for spam.', at: daysAgo(2, 4), read: true },
]

// --- admins ----------------------------------------------------------------

export const ADMIN_ROLES = ['Super Admin', 'Moderator', 'Support', 'Analyst']

export const ADMINS = [
  { id: 'a-1', name: 'Samandar Hodiev', email: 'samandar@renthouse.uz', role: 'Super Admin',
    status: 'active', lastActiveAt: daysAgo(0, 1) },
  { id: 'a-2', name: 'Alisher Berdiev', email: 'alisher@renthouse.uz', role: 'Moderator',
    status: 'active', lastActiveAt: daysAgo(0, 4) },
  { id: 'a-3', name: 'Nilufar Ergasheva', email: 'nilufar@renthouse.uz', role: 'Support',
    status: 'active', lastActiveAt: daysAgo(1, 2) },
  { id: 'a-4', name: 'Rustam Umarov', email: 'rustam@renthouse.uz', role: 'Analyst',
    status: 'inactive', lastActiveAt: daysAgo(6, 5) },
  { id: 'a-5', name: 'Malika Yusupova', email: 'malika@renthouse.uz', role: 'Moderator',
    status: 'active', lastActiveAt: daysAgo(2, 3) },
]

// Exactly the grid the task specifies. `true` is granted, `false` is not.
export const PERMISSIONS = [
  { name: 'Users', 'Super Admin': true, Moderator: true, Support: true, Analyst: true },
  { name: 'Listings', 'Super Admin': true, Moderator: true, Support: false, Analyst: true },
  { name: 'Reports', 'Super Admin': true, Moderator: true, Support: true, Analyst: false },
  { name: 'Chats', 'Super Admin': true, Moderator: true, Support: true, Analyst: false },
  { name: 'Analytics', 'Super Admin': true, Moderator: false, Support: false, Analyst: true },
  { name: 'Settings', 'Super Admin': true, Moderator: false, Support: false, Analyst: false },
]

// --- audit logs ------------------------------------------------------------

export const AUDIT_LOGS = [
  { id: 'log-1', admin: ADMINS[0], action: 'Approved listing', target: '#1821',
    at: daysAgo(0, 1), ip: '81.192.14.22', status: 'success' },
  { id: 'log-2', admin: ADMINS[1], action: 'Blocked user', target: '#921',
    at: daysAgo(0, 2), ip: '84.54.90.11', status: 'success' },
  { id: 'log-3', admin: ADMINS[0], action: 'Deleted listing', target: '#821',
    at: daysAgo(0, 4), ip: '81.192.14.22', status: 'success' },
  { id: 'log-4', admin: ADMINS[2], action: 'Resolved report', target: 'R-1204',
    at: daysAgo(1, 3), ip: '213.230.77.4', status: 'success' },
  { id: 'log-5', admin: ADMINS[4], action: 'Rejected listing', target: '#1799',
    at: daysAgo(1, 7), ip: '84.54.90.55', status: 'success' },
  { id: 'log-6', admin: ADMINS[3], action: 'Exported analytics', target: 'August 2026',
    at: daysAgo(2, 2), ip: '178.164.9.30', status: 'failed' },
]

// --- dashboard figures -----------------------------------------------------

export const OVERVIEW = {
  totalUsers: 12450,
  activeUsers: 8921,
  totalListings: 6842,
  activeListings: 4921,
  pendingListings: 342,
  closedListings: 1421,
  reports: 24,
  newUsersToday: 124,
  blockedUsers: 186,
  drafts: 158,
  views: 184320,
  favorites: 22410,
  chats: 9340,
  contacts: 4120,
}

/**
 * A series for the growth charts.
 *
 * Generated from a seed rather than random, so the line is the same on every
 * render — a chart that reshuffles itself each time it is looked at reads as a
 * bug even when the numbers are admittedly fake.
 *
 * `step` may be negative or zero. The chart colours itself by which way the
 * line went, and a generator that could only climb would leave two of those
 * three colours as code nobody ever sees.
 */
function series(points, base, step, seed) {
  // The wobble stays visible on a flat line, where the step alone would be 0.
  const amplitude = (Math.abs(step) || base * 0.03) * 0.35
  return Array.from({ length: points }, (_, index) => {
    const wobble = Math.sin((index + seed) * 1.7) * amplitude
    return Math.max(0, Math.round(base + index * step + wobble))
  })
}

export const GROWTH = {
  users: {
    daily: { labels: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'], values: series(7, 90, 12, 1) },
    // Flat: registrations held steady week to week.
    weekly: { labels: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'], values: series(6, 520, 0, 2) },
    monthly: {
      labels: ['Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg'],
      values: series(6, 1800, 320, 3),
    },
  },
  listings: {
    // Falling: fewer listings posted each day this week.
    daily: { labels: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'], values: series(7, 76, -9, 4) },
    weekly: { labels: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'], values: series(6, 260, 44, 5) },
    monthly: {
      labels: ['Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg'],
      values: series(6, 900, 180, 6),
    },
  },
}

/**
 * Active listings per district, for the dashboard's district chart.
 *
 * All twelve of Tashkent's districts, not a top six: a district with few
 * listings is as much a fact about the market as one with many, and a chart
 * that silently drops the quiet ones invites the wrong conclusion.
 *
 * Declared unsorted and ordered at render time, so replacing this array with an
 * API response needs no ordering guarantee from the server.
 */
export const DISTRICT_STATS = [
  { name: 'Chilonzor', activeListings: 1284 },
  { name: 'Yunusobod', activeListings: 1042 },
  { name: 'Sergeli', activeListings: 861 },
  { name: 'Mirzo Ulug\'bek', activeListings: 744 },
  { name: 'Yakkasaroy', activeListings: 512 },
  { name: 'Shayxontohur', activeListings: 398 },
  { name: 'Mirobod', activeListings: 356 },
  { name: 'Olmazor', activeListings: 321 },
  { name: 'Uchtepa', activeListings: 287 },
  { name: 'Yashnobod', activeListings: 254 },
  { name: 'Yangihayot', activeListings: 198 },
  { name: 'Bektemir', activeListings: 143 },
]

/** Busiest first. Sorted here so the order follows the data, not the array. */
export const districtsByActivity = () =>
  [...DISTRICT_STATS].sort((a, b) => b.activeListings - a.activeListings)
