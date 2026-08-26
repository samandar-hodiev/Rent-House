import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useModalDialog } from '../../hooks/useModalDialog'

/**
 * A listing's photographs, one at a time.
 *
 * A carousel rather than a column: a listing has three to five pictures and the
 * point of opening them is to look at one, not to scroll past all of them. The
 * arrows sit against the edges of the picture itself, so the eye travels the
 * shortest distance between looking and moving on.
 *
 * The picture is 800px wide with its height left to follow, and capped against
 * the viewport so a portrait shot cannot run off the screen — a cap on the
 * height rather than a fixed frame, so the proportions are never touched. On a
 * narrow screen the width gives way to whatever is available.
 */
function ListingGalleryDialog({ title, images, loading, onClose }) {
  const { t } = useAdmin()
  const dialogRef = useModalDialog(onClose)
  const [index, setIndex] = useState(0)

  const count = images.length
  // Wraps, as a carousel does: the last picture's "next" is the first.
  const go = (step) => setIndex((current) => (current + step + count) % count)

  // A new listing starts at its first picture rather than wherever the last
  // one was left.
  useEffect(() => {
    setIndex(0)
  }, [title])

  // Arrow keys, because a viewer looking through pictures reaches for them
  // before reaching for the mouse.
  useEffect(() => {
    if (count < 2) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft') setIndex((c) => (c - 1 + count) % count)
      if (event.key === 'ArrowRight') setIndex((c) => (c + 1) % count)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [count])

  const host = document.getElementById('admin-root')
  if (!host) return null

  const arrow =
    'absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/90 text-text-primary shadow-sm backdrop-blur transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[880px] flex-col overflow-hidden rounded-xl border border-border bg-surface focus:outline-none"
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

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : count === 0 ? (
          <p className="py-16 text-center text-sm text-text-muted">{t('listings.noImages')}</p>
        ) : (
          <>
            {/* The picture, centred both ways in whatever room the dialog has. */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
              <img
                key={images[index]}
                src={images[index]}
                alt={t('listings.imageAlt', { index: index + 1, total: count })}
                // 800 wide and the height follows, until the viewport says
                // otherwise — then the height leads and the width follows. The
                // ratio is the picture's own either way.
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
                style={{ width: 800 }}
              />

              {count > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label={t('action.previous')}
                    className={`${arrow} left-3`}
                  >
                    <ChevronLeft aria-hidden="true" size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label={t('action.next')}
                    className={`${arrow} right-3`}
                  >
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                </>
              ) : null}
            </div>

            {/* Where you are in the set. Announced too, so moving between
                pictures is not a silent change for a screen reader. */}
            <p
              role="status"
              className="shrink-0 border-t border-border py-2.5 text-center text-xs tabular-nums text-text-muted"
            >
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>
    </div>,
    host,
  )
}

export default ListingGalleryDialog
