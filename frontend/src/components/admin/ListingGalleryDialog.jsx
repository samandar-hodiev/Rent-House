import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useModalDialog } from '../../hooks/useModalDialog'

/**
 * A listing's photographs, one under another.
 *
 * Each picture is capped at 800px and left to work out its own height, so the
 * proportions are the ones it was taken at — a fixed height would squash a
 * portrait shot of a room into something the flat does not look like. On a
 * narrow screen the cap gives way to the available width rather than forcing a
 * sideways scroll.
 *
 * Scrolls inside itself: a gallery of ten pictures must not make the dialog
 * taller than the window.
 */
function ListingGalleryDialog({ title, images, loading, onClose }) {
  const { t } = useAdmin()
  const dialogRef = useModalDialog(onClose)
  const host = document.getElementById('admin-root')
  if (!host) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[848px] flex-col overflow-hidden rounded-xl border border-border bg-surface focus:outline-none sm:max-h-[calc(100vh-4rem)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('action.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
            </div>
          ) : images.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">{t('listings.noImages')}</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {images.map((url, index) => (
                <img
                  key={url}
                  src={url}
                  alt={t('listings.imageAlt', { index: index + 1, total: images.length })}
                  loading="lazy"
                  // The cap and the fluid width together: 800px on a desktop,
                  // the column's width on a phone, and the height always the
                  // picture's own.
                  className="h-auto w-full max-w-[800px] rounded-lg"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    host,
  )
}

export default ListingGalleryDialog
