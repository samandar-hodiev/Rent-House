// Where to send a user back to after they authenticate.
//
// The target arrives from a query string, which means it is attacker-supplied:
// a link to /login?redirect=https://evil.test would otherwise turn this app
// into an open redirect, lending it credibility to a phishing page. Only
// same-origin relative paths are ever accepted.

const PARAM = 'redirect'

/**
 * Returns the path if it is a safe internal destination, otherwise null.
 *
 * Rejected:
 *   https://evil.test        absolute URL
 *   //evil.test              protocol-relative — the browser treats this as
 *                            absolute, which is what makes it a classic bypass
 *   javascript:alert(1)      scheme injection
 *   \\evil.test              backslashes, which some browsers normalise to /
 *   dashboard                not rooted, so it would resolve relative to the
 *                            current path and land somewhere unintended
 */
export function safeRedirect(raw) {
  if (typeof raw !== 'string') return null

  const value = raw.trim()
  if (!value) return null

  // Must be rooted, and must not be protocol-relative.
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null

  // Backslashes are normalised to forward slashes by some browsers, so
  // "/\evil.test" can become "//evil.test".
  if (value.includes('\\')) return null

  // A scheme anywhere means it is not a plain path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  if (value.includes('://')) return null

  return value
}

/**
 * Builds `<route>?redirect=<path>`, e.g. `/login?redirect=/apartment/3`.
 *
 * An unsafe or missing target yields the bare route, so a poisoned link simply
 * loses its redirect rather than being followed.
 */
export function withRedirect(route, target) {
  const safe = safeRedirect(target)
  if (!safe) return route
  return `${route}?${PARAM}=${encodeURIComponent(safe)}`
}

/** Reads the redirect target out of a location's search string. */
export function readRedirect(search) {
  return safeRedirect(new URLSearchParams(search).get(PARAM))
}
