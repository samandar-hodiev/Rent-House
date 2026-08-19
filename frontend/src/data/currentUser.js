// Placeholder for the signed-in user. There is no authentication yet, so the
// account UI renders this mock in order to be buildable and reviewable.
// Once auth exists this is replaced by the session user coming from the API.
export const CURRENT_USER = {
  id: 1,
  firstName: 'Samandar',
  lastName: 'Hodiev',
  name: 'Samandar Hodiev',
  email: 'samandar@example.com',
  phone: '+998 90 123 45 67',
  stats: {
    activeListings: 3,
    totalViews: 1248,
    unreadMessages: 3,
  },
}

// Avatars are rendered as initials so the account UI needs no image asset or
// upload pipeline before those exist.
export function getUserInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
