/**
 * The initials shown when an account has no picture.
 *
 * Two letters at most: a longer run stops reading as a monogram and starts
 * overflowing the circle it sits in.
 */
export function getUserInitials(name) {
  return (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
