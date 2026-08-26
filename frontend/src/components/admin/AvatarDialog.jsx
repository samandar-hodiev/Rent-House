import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import UserAvatar from '../dashboard/UserAvatar'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useModalDialog } from '../../hooks/useModalDialog'
import { resolveUploadUrl } from '../../utils/uploadUrl'

/**
 * One person's picture, at a size you can actually look at.
 *
 * Capped rather than filling the screen: an avatar is a small square, and
 * blowing a 200px upload up to the width of a monitor shows nothing more than
 * its own compression. 360px is enough to check a face and no more.
 *
 * An account with no picture shows the same initials the table shows. There is
 * nothing else to show, and a broken image icon would be worse than the mark
 * the product already uses everywhere.
 */
function AvatarDialog({ name, src, onClose }) {
  const { t } = useAdmin()
  const dialogRef = useModalDialog(onClose)
  const host = document.getElementById('admin-root')
  if (!host) return null

  const url = resolveUploadUrl(src)

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface focus:outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">{name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('action.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="flex items-center justify-center p-6">
          {url ? (
            <img
              src={url}
              alt={name}
              // The box is the picture's own shape, capped in both directions.
              // A fixed square with `object-contain` would show the whole
              // photograph but leave bars down the sides of a portrait one; this
              // way the frame hugs the image and nothing is cropped either.
              className="h-auto max-h-[360px] w-auto max-w-full rounded-lg object-contain"
              style={{ maxWidth: 360 }}
            />
          ) : (
            <span className="flex flex-col items-center gap-3">
              <UserAvatar name={name} size="lg" className="size-24 text-2xl" />
              <span className="text-sm text-text-muted">{t('users.noAvatar')}</span>
            </span>
          )}
        </div>
      </div>
    </div>,
    host,
  )
}

export default AvatarDialog
