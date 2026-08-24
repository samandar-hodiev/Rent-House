import { useState } from 'react'
import { getUserInitials } from '../../data/currentUser'
import { resolveUploadUrl } from '../../utils/uploadUrl'

const SIZE_CLASS = {
  sm: 'size-9 text-xs',
  lg: 'size-16 text-lg',
}

/**
 * Somebody's avatar: their picture when they have uploaded one, their initials
 * when they have not.
 *
 * The initials are not a placeholder to be replaced later — they are the
 * fallback, and they are what most accounts will show. An image that fails to
 * load falls back to them too, so a deleted or unreachable file leaves a
 * readable avatar rather than a broken-image icon.
 */
function UserAvatar({ name, src = null, size = 'sm', className = '' }) {
  const [failed, setFailed] = useState(false)
  const url = failed ? null : resolveUploadUrl(src)

  if (url) {
    return (
      <img
        src={url}
        // Decorative: every place this is used names the person in text
        // beside it, so announcing the name again would be a repetition.
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${SIZE_CLASS[size]} ${className}`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-light font-semibold text-primary-hover ${SIZE_CLASS[size]} ${className}`}
    >
      {getUserInitials(name)}
    </span>
  )
}

export default UserAvatar
