// The admin dashboard's endpoints.
//
// A separate file from `authApi` because it is a separate system: separate
// accounts, separate tokens, separate rules. Sharing a client would invite
// sharing a token, and an administrator's token must never be sent to the
// marketplace API or the other way round.
import { request } from './apiClient'

/** Maps the API's administrator onto the shape the dashboard reads. */
export function toAdmin(data) {
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    // 'owner' | 'super_admin' — as stored, so the UI never invents a role.
    role: data.role,
    status: data.status,
    avatarUrl: data.avatar_url ?? null,
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at ?? null,
  }
}

/** Maps a marketplace account as the administrator's table shows it. */
export function toManagedUser(data) {
  return {
    id: data.id,
    name: data.name,
    email: data.email ?? null,
    phone: data.phone ?? null,
    avatarUrl: data.avatar_url ?? null,
    status: data.status,
    listings: data.listings ?? 0,
    registeredAt: data.registered_at,
    // Present only while a block is in force.
    blockReason: data.block_reason ?? null,
    blockedAt: data.blocked_at ?? null,
    blockedBy: data.blocked_by_name ?? null,
  }
}

/** Signs in. Returns the account and the token that identifies it. */
export async function login({ email, password, signal } = {}) {
  const data = await request('/admin/auth/login', {
    method: 'POST',
    body: { email, password },
    signal,
  })
  return { admin: toAdmin(data.admin), token: data.access_token, expiresIn: data.expires_in }
}

/** Who the stored token belongs to, re-checked against the server. */
export async function fetchCurrentAdmin({ token, signal } = {}) {
  return toAdmin(await request('/admin/auth/me', { token, signal }))
}

export async function logout({ token, signal } = {}) {
  return request('/admin/auth/logout', { method: 'POST', token, signal })
}

/** Every administrator. Owner only — the API answers 403 to anyone else. */
export async function fetchAdmins({ token, signal } = {}) {
  const data = await request('/admin/admins', { token, signal })
  return (data ?? []).map(toAdmin)
}

export async function createAdmin({ name, email, role, password, token, signal } = {}) {
  return toAdmin(
    await request('/admin/admins', {
      method: 'POST',
      body: { name, email, role, password },
      token,
      signal,
    }),
  )
}

export async function setAdminStatus(id, status, { token, signal } = {}) {
  return request(`/admin/admins/${id}/status`, {
    method: 'PATCH',
    body: { status },
    token,
    signal,
  })
}

export async function deleteAdmin(id, { token, signal } = {}) {
  return request(`/admin/admins/${id}`, { method: 'DELETE', token, signal })
}

/**
 * Which sections the sidebar offers.
 *
 * Readable by any administrator — the dashboard draws its navigation from it.
 * Writing it is the owner's, and the server enforces that rather than trusting
 * the client not to call it.
 */
export async function fetchSidebarSections({ token, signal } = {}) {
  const data = await request('/admin/sidebar', { token, signal })
  return data?.sections ?? {}
}

export async function saveSidebarSections(sections, { token, signal } = {}) {
  const data = await request('/admin/sidebar', {
    method: 'PUT',
    body: { sections },
    token,
    signal,
  })
  return data?.sections ?? {}
}

/**
 * Complaints about listings.
 *
 * Filtering, searching and paging are the server's work, like every other
 * table here: it returns the page plus the totals a paginator needs.
 */
export async function fetchReports({ status, search, page = 1, limit, token, signal } = {}) {
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (search) query.set('search', search)
  query.set('page', String(page))
  if (limit) query.set('limit', String(limit))

  const data = await request(`/admin/reports?${query}`, { token, signal })
  return {
    reports: (data?.reports ?? []).map(toReport),
    counts: data?.counts ?? {},
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    limit: data?.limit ?? 20,
  }
}

/** Moves one complaint along, recording who decided and what they wrote. */
export async function setReportStatus(id, { status, resolution = '', token, signal } = {}) {
  return toReport(await request(`/admin/reports/${id}`, {
    method: 'PATCH',
    body: { status, resolution },
    token,
    signal,
  }))
}

function toReport(row) {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    apartmentTitle: row.apartment_title ?? '',
    apartmentStatus: row.apartment_status ?? '',
    reason: row.reason,
    comment: row.comment ?? '',
    status: row.status,
    resolution: row.resolution ?? '',
    reporterName: row.reporter_name ?? '',
    resolvedByName: row.resolved_by_name ?? '',
    openCount: row.open_count ?? 0,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  }
}

/**
 * Back to the values the server declares as its defaults.
 *
 * A delete rather than a write: the defaults live in the registry, so removing
 * everything that was stored is what "as it came" means.
 */
export async function resetSiteSettings({ token, signal } = {}) {
  const data = await request('/admin/settings', { method: 'DELETE', token, signal })
  return { settings: data?.settings ?? {}, changed: data?.changed ?? 0 }
}

/**
 * The roles this system has, and what each one may reach.
 *
 * Derived by the server from the rules its own middleware enforces, so the
 * form cannot offer a role — or promise a permission — that the server would
 * refuse. It also carries the password policy the server will apply, so the
 * form checks the same rule rather than a copy of it.
 */
export async function fetchRoles({ token, signal } = {}) {
  const data = await request('/admin/roles', { token, signal })
  return {
    roles: data?.roles ?? [],
    passwordPolicy: {
      minLength: data?.password_policy?.min_length ?? 8,
      requireStrong: Boolean(data?.password_policy?.require_strong),
    },
  }
}

/**
 * How the marketplace is configured.
 *
 * The owner's, both ways — the server refuses anybody else, so the page being
 * hidden from a super admin is convenience rather than the protection.
 */
export async function fetchSiteSettings({ token, signal } = {}) {
  const data = await request('/admin/settings', { token, signal })
  return { settings: data?.settings ?? {}, updatedAt: data?.updated_at ?? null }
}

// Only the keys that changed. The page saves one section at a time, and sending
// the whole form would let two administrators saving different cards overwrite
// each other with values neither of them chose.
export async function saveSiteSettings(patch, { token, signal } = {}) {
  const data = await request('/admin/settings', {
    method: 'PUT',
    body: { settings: patch },
    token,
    signal,
  })
  return { settings: data?.settings ?? {}, updatedAt: data?.updated_at ?? null }
}

/**
 * One page of marketplace accounts.
 *
 * Searching, filtering and paging are all the server's work: it returns the
 * page plus the totals a paginator needs, so the client never holds every
 * account in order to show ten of them.
 */
export async function fetchUsers({ search, status, page = 1, limit = 10, token, signal } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (search) params.set('search', search)
  if (status) params.set('status', status)

  const data = await request(`/admin/users?${params}`, { token, signal })
  return {
    users: (data?.users ?? []).map(toManagedUser),
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    totalPages: data?.total_pages ?? 1,
  }
}

/**
 * Blocks or unblocks a marketplace account.
 *
 * Blocking carries a reason. The server requires one too — this endpoint is
 * reachable without the form, and a block with nothing on record is what asking
 * for a reason exists to prevent.
 */
export async function setUserStatus(id, status, { reason, token, signal } = {}) {
  const body = { status }
  if (reason !== undefined) body.reason = reason
  return request(`/admin/users/${id}/status`, { method: 'PATCH', body, token, signal })
}

/** The calling administrator's own name and picture. Nothing else is editable. */
export async function updateProfile({ name, avatarUrl, token, signal } = {}) {
  const body = { name }
  // Omitted rather than sent as null when unchanged: the server treats an
  // absent field as "leave it alone".
  if (avatarUrl !== undefined) body.avatar_url = avatarUrl
  return toAdmin(await request('/admin/profile', { method: 'PATCH', body, token, signal }))
}

/**
 * Stores a picture and returns its URL.
 *
 * Uploading does not change the profile — saving does. A picture chosen and
 * then abandoned leaves the account as it was.
 */
export async function uploadAvatar(file, { token, signal } = {}) {
  const form = new FormData()
  form.append('image', file)
  const data = await request('/admin/profile/avatar', {
    method: 'POST',
    body: form,
    token,
    signal,
  })
  return data?.url ?? null
}

/** The dashboard's headline figures, counted by PostgreSQL. */
export async function fetchDashboardStats({ token, signal } = {}) {
  const d = await request('/admin/dashboard/stats', { token, signal })
  return {
    totalUsers: d?.total_users ?? 0,
    activeUsers: d?.active_users ?? 0,
    blockedUsers: d?.blocked_users ?? 0,
    totalListings: d?.total_listings ?? 0,
    activeListings: d?.active_listings ?? 0,
    pendingListings: d?.pending_listings ?? 0,
    closedListings: d?.closed_listings ?? 0,
    draftListings: d?.draft_listings ?? 0,
    reports: d?.reports ?? 0,
    newUsersToday: d?.new_users_today ?? 0,
    newUsers30d: d?.new_users_30d ?? 0,
    views: d?.views ?? 0,
    saves: d?.saves ?? 0,
    chats: d?.chats ?? 0,
    contacts: d?.contacts ?? 0,
  }
}

/**
 * Both growth charts, at all three granularities.
 *
 * One request rather than one per tab: the series are small, and switching
 * between Kunlik and Oylik should not wait on the network.
 */
export async function fetchDashboardGrowth({ token, signal } = {}) {
  const d = await request('/admin/dashboard/growth', { token, signal })
  const series = (metric) => ({
    daily: (d?.[metric]?.daily ?? []).map(toPoint),
    weekly: (d?.[metric]?.weekly ?? []).map(toPoint),
    monthly: (d?.[metric]?.monthly ?? []).map(toPoint),
  })
  return { users: series('users'), listings: series('listings') }
}

function toPoint(p) {
  return { period: p.period, count: p.count ?? 0 }
}

/** Every district with its live listing count, busiest first. */
export async function fetchDistrictActivity({ token, signal } = {}) {
  const d = await request('/admin/dashboard/districts', { token, signal })
  return (d?.districts ?? []).map((row) => ({
    name: row.name,
    activeListings: row.active_listings ?? 0,
  }))
}

/** Maps one row of the listings table. */
export function toManagedListing(data) {
  return {
    id: data.id,
    title: data.title,
    price: data.price,
    currency: data.currency,
    status: data.status,
    rooms: data.rooms,
    area: data.area,
    floor: data.floor,
    views: data.views ?? 0,
    district: data.district,
    ownerName: data.owner_name,
    coverUrl: data.cover_url ?? null,
    createdAt: data.created_at,
  }
}

/** One page of listings, filtered and paged by the server. */
export async function fetchListings({ status, search, page = 1, limit = 10, token, signal } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (status) params.set('status', status)
  if (search) params.set('search', search)

  const data = await request(`/admin/listings?${params}`, { token, signal })
  return {
    listings: (data?.listings ?? []).map(toManagedListing),
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    totalPages: data?.total_pages ?? 1,
  }
}

/** One listing, with its gallery, its owner and its figures. */
export async function fetchListing(id, { token, signal } = {}) {
  const data = await request(`/admin/listings/${id}`, { token, signal })
  return {
    ...toManagedListing(data),
    address: data.address,
    description: data.description,
    totalFloors: data.total_floors,
    furnished: data.furnished,
    images: data.images ?? [],
    owner: {
      id: data.owner?.id,
      name: data.owner?.name,
      email: data.owner?.email ?? null,
      phone: data.owner?.phone ?? null,
      avatarUrl: data.owner?.avatar_url ?? null,
    },
    stats: {
      views: data.stats?.views ?? 0,
      saves: data.stats?.saves ?? 0,
      contacts: data.stats?.contacts ?? 0,
      chats: data.stats?.chats ?? 0,
    },
  }
}

/** Just the photographs — what the gallery opened from the table needs. */
export async function fetchListingImages(id, { token, signal } = {}) {
  const data = await request(`/admin/listings/${id}/images`, { token, signal })
  return data?.images ?? []
}

/**
 * The conversations held about a listing.
 *
 * The owner's alone: the API answers 403 to anyone else, so a super admin
 * calling this directly gets nothing rather than a hidden button's worth of
 * protection.
 */
export async function fetchListingChats(id, { token, signal } = {}) {
  const data = await request(`/admin/listings/${id}/chats`, { token, signal })
  return (data?.chats ?? []).map((c) => ({
    conversationId: c.conversation_id,
    userId: c.user_id,
    userName: c.user_name,
    userAvatar: c.user_avatar ?? null,
    lastMessage: c.last_message,
    lastMessageAt: c.last_message_at,
    unread: c.unread ?? 0,
  }))
}

/**
 * Every conversation held about a listing owner's listings, with the messages.
 *
 * The owner's alone: the API answers 403 to anyone else. Withdrawn messages
 * arrive with their original text and who withdrew it, which is the whole point
 * of the endpoint and why it is guarded at the server rather than in the UI.
 */
export async function fetchListingAudit(id, { token, signal } = {}) {
  const data = await request(`/admin/listings/${id}/audit`, { token, signal })
  return (data?.conversations ?? []).map((c) => ({
    conversationId: c.conversation_id,
    userId: c.user_id,
    userName: c.user_name,
    userAvatar: c.user_avatar ?? null,
    lastMessageAt: c.last_message_at,
    messages: (c.messages ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      body: m.body,
      kind: m.kind,
      createdAt: m.created_at,
      editedAt: m.edited_at ?? null,
      deletedAt: m.deleted_at ?? null,
      deletedByName: m.deleted_by_name ?? null,
      listingTitle: m.listing_title ?? null,
    })),
  }))
}

/** One page of conversations for the moderation table. */
export async function fetchChats({ search, page = 1, limit = 10, token, signal } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (search) params.set('search', search)

  const data = await request(`/admin/chats?${params}`, { token, signal })
  return {
    chats: (data?.chats ?? []).map((c) => ({
      id: c.id,
      buyerName: c.buyer_name,
      sellerName: c.seller_name,
      listingTitle: c.listing_title ?? null,
      lastMessage: c.last_message ?? '',
      lastMessageAt: c.last_message_at ?? null,
      messages: c.messages ?? 0,
      status: c.status,
    })),
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    totalPages: data?.total_pages ?? 1,
  }
}

/**
 * What was said in one conversation.
 *
 * The owner's alone — the API answers 403 to anyone else, because moderating
 * the marketplace does not by itself entitle somebody to read everybody's
 * correspondence.
 */
export async function fetchChatMessages(id, { token, signal } = {}) {
  const data = await request(`/admin/chats/${id}/messages`, { token, signal })
  return {
    buyerName: data?.buyer_name ?? '',
    sellerName: data?.seller_name ?? '',
    messages: (data?.messages ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      body: m.body,
      createdAt: m.created_at,
      editedAt: m.edited_at ?? null,
      deletedAt: m.deleted_at ?? null,
      deletedByName: m.deleted_by_name ?? null,
    })),
  }
}

/** One marketplace account, with its figures and its block history. */
export async function fetchUser(id, { token, signal } = {}) {
  const d = await request(`/admin/users/${id}`, { token, signal })
  return {
    ...toManagedUser(d),
    stats: {
      totalListings: d?.stats?.total_listings ?? 0,
      activeListings: d?.stats?.active_listings ?? 0,
      closedListings: d?.stats?.closed_listings ?? 0,
      draftListings: d?.stats?.draft_listings ?? 0,
      chats: d?.stats?.chats ?? 0,
      saves: d?.stats?.saves ?? 0,
    },
    blockHistory: (d?.block_history ?? []).map((b) => ({
      reason: b.reason,
      blockedAt: b.blocked_at,
      blockedByName: b.blocked_by_name ?? null,
      unblockedAt: b.unblocked_at ?? null,
      unblockedByName: b.unblocked_by_name ?? null,
    })),
  }
}

/**
 * What each role may reach.
 *
 * Derived on the server from the rules the middleware enforces and the sidebar
 * configuration the owner set, so the table cannot promise a permission the
 * server would refuse.
 */
export async function fetchPermissions({ token, signal } = {}) {
  const d = await request('/admin/permissions', { token, signal })
  return (d?.permissions ?? []).map((p) => ({
    section: p.section,
    owner: p.owner,
    superAdmin: p.super_admin,
  }))
}

/** One page of the admin action log, newest first. */
export async function fetchAuditLogs({ page = 1, limit = 20, token, signal } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  const d = await request(`/admin/audit-logs?${params}`, { token, signal })
  return {
    entries: (d?.entries ?? []).map((e) => ({
      id: e.id,
      adminName: e.admin_name,
      action: e.action,
      target: e.target,
      ip: e.ip,
      status: e.status,
      createdAt: e.created_at,
    })),
    total: d?.total ?? 0,
    page: d?.page ?? 1,
    totalPages: d?.total_pages ?? 1,
  }
}

/**
 * Moves a listing between states, as moderation.
 *
 * The transitions are the owner's own, so this cannot put a listing into a
 * state its owner could never reach; the server refuses anything else with 409.
 */
export async function setListingStatus(id, status, { token, signal } = {}) {
  return request(`/admin/listings/${id}/status`, {
    method: 'PATCH',
    body: { status },
    token,
    signal,
  })
}
