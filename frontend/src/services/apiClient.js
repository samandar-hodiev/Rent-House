// Central HTTP client. Every backend call goes through here so the base URL,
// the auth header, the response envelope and error handling live in one place
// rather than being repeated in components.

// The backend serves /api/v1. Configurable because the port differs between
// machines and environments; see .env.example.
const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '')

// ApiError carries the backend's machine-readable code so callers can branch on
// a stable value instead of matching on message text.
export class ApiError extends Error {
  constructor({ status, code, message }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// NETWORK_ERROR is used when the request never reached the server, which is a
// different problem from the server rejecting it.
export const NETWORK_ERROR = 'network_error'

/**
 * Sends a request and unwraps the `{success, message, data, error}` envelope.
 *
 * Returns `data` on success and throws an ApiError otherwise, so a caller never
 * has to check `success` by hand.
 */
export async function request(path, { method = 'GET', body, token, signal } = {}) {
  // FormData carries its own multipart boundary in the Content-Type header,
  // which only the browser can generate. Setting the header by hand would
  // produce one without a boundary and the server would reject the upload, so
  // the body is passed through untouched and the header is left off.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const headers = {}
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let requestBody
  if (body === undefined) requestBody = undefined
  else if (isFormData) requestBody = body
  else requestBody = JSON.stringify(body)

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: requestBody,
      signal,
    })
  } catch (error) {
    // Abort is the caller cancelling on purpose — pass it through untouched so
    // effects can ignore it rather than showing an error.
    if (error?.name === 'AbortError') throw error
    throw new ApiError({ status: 0, code: NETWORK_ERROR, message: 'Network request failed' })
  }

  // A 204 or an empty body is still a success.
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiError({
      status: response.status,
      code: payload?.error ?? 'unknown_error',
      message: payload?.message ?? `Request failed with status ${response.status}`,
    })
  }

  return payload?.data ?? null
}
