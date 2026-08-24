// Where the API lives. An avatar is stored as a path — see the profile
// endpoint, which keeps only the path so a profile can never point a viewer's
// browser at another origin — and the origin is added back here, at the point
// of rendering.
const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '')

// Strip the "/api/v1" suffix: uploads are served from the server root, not from
// under the API prefix.
const ORIGIN = API_BASE.replace(/\/api\/v\d+$/, '')

/**
 * Turns a stored upload path into something an <img> can load.
 *
 * Absolute URLs are returned untouched, so a value that predates path-only
 * storage — or one that came from an endpoint that still returns absolute URLs
 * — keeps working.
 */
export function resolveUploadUrl(value) {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  return `${ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`
}
