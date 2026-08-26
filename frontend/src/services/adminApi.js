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
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at ?? null,
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
