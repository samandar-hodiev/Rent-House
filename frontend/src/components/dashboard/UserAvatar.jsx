import { getUserInitials } from '../../data/currentUser'

const SIZE_CLASS = {
  sm: 'size-9 text-xs',
  lg: 'size-16 text-lg',
}

// Initials-based avatar: the account UI needs an avatar before any image
// upload/storage exists, so this stays asset-free.
function UserAvatar({ name, size = 'sm' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-light font-semibold text-primary-hover ${SIZE_CLASS[size]}`}
    >
      {getUserInitials(name)}
    </span>
  )
}

export default UserAvatar
