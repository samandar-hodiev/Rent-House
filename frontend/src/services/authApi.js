// Authentication endpoints. Components call these rather than fetch directly,
// so the request shapes stay in one file next to the backend contract.
import { request } from './apiClient'

/** Step 1: ask the backend to send a six-digit code to a phone or an email. */
export function requestRegistrationCode({ method, contact }) {
  return request('/auth/register/request', {
    method: 'POST',
    // Only the contact matching the method is sent; the backend rejects a body
    // that carries both.
    body: method === 'phone' ? { method, phone: contact } : { method, email: contact },
  })
}

/** Step 2: exchange the code for a short-lived registration token. */
export function verifyRegistrationCode({ verificationId, code }) {
  return request('/auth/register/verify', {
    method: 'POST',
    body: { verification_id: verificationId, code },
  })
}

/** Step 3: exchange the registration token for an account and a JWT. */
export function completeRegistration({
  registrationToken,
  firstName,
  lastName,
  password,
  passwordConfirmation,
  language,
}) {
  return request('/auth/register/complete', {
    method: 'POST',
    body: {
      registration_token: registrationToken,
      first_name: firstName,
      last_name: lastName,
      password,
      password_confirmation: passwordConfirmation,
      ...(language ? { language } : {}),
    },
  })
}

/** Signs in with an email or a phone number. */
export function login({ identifier, password }) {
  return request('/auth/login', { method: 'POST', body: { identifier, password } })
}

/**
 * Renews a session.
 *
 * Unauthenticated: the access token this replaces has usually expired by the
 * time this is called, so the refresh token is the only credential sent.
 */
export function refreshSession(refreshToken) {
  return request('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } })
}

/** Ends the session on the server, so signing out is more than forgetting. */
export function logout(refreshToken) {
  return request('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } })
}

/**
 * Asks for a password-reset link.
 *
 * Always resolves. The server answers the same way whether or not the address
 * belongs to an account — telling them apart would make this endpoint a way to
 * ask which addresses are registered — so there is nothing here to branch on.
 */
export function requestPasswordReset(email) {
  return request('/auth/password/forgot', { method: 'POST', body: { email } })
}

/**
 * Checks a reset link before the form is shown.
 *
 * Rejects with an ApiError for an unknown, expired or already-used token, which
 * is what lets the page offer "get a new link" instead of a form that would
 * fail on submit.
 */
export function validateResetToken(token, { signal } = {}) {
  return request(`/auth/password/reset?token=${encodeURIComponent(token)}`, { signal })
}

/** Sets a new password and spends the link. */
export function resetPassword({ token, password }) {
  return request('/auth/password/reset', { method: 'POST', body: { token, password } })
}

/** Loads the account behind a token; used to restore a session after reload. */
export function fetchCurrentUser(token) {
  return request('/auth/me', { token })
}

/**
 * Saves the parts of an account its owner may change.
 *
 * A PATCH, and only the fields that were actually edited are sent: a field the
 * form left alone must not be erased, and the server tells "absent" from
 * "cleared" by whether the key is present at all.
 *
 * Returns the account as stored, which is what the rest of the application
 * then reads — the response is the new truth, not the values that were typed.
 */
export function updateProfile(patch, { token } = {}) {
  return request('/me', { method: 'PATCH', body: patch, token })
}
