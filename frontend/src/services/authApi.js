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

/** Loads the account behind a token; used to restore a session after reload. */
export function fetchCurrentUser(token) {
  return request('/auth/me', { token })
}
