import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

const SWIPE_THRESHOLD = 40

// Full-screen viewer for one listing's own photos. Portalled to <body> so no
// ancestor stacking or scroll context can clip it, following the same pattern
// as the dashboard's mobile drawer.
function ListingGalleryModal({ images, title, startIndex = 0, onClose }) {
  const { t } = useLocale()
  const [index, setIndex] = useState(startIndex)
  const touchStartX = useRef(null)

  const hasMany = images.length > 1
  const goPrev = () => setIndex((current) => (current === 0 ? images.length - 1 : current - 1))
  const goNext = () => setIndex((current) => (current === images.length - 1 ? 0 : current + 1))

  // Escape closes; arrow keys page through on a keyboard.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (!hasMany) return
      if (event.key === 'ArrowLeft') goPrev()
      if (event.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  // Freeze the page behind the viewer, restoring whatever was set before.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const handleTouchStart = (event) => {
    touchStartX.current = event.changedTouches[0].clientX
  }

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null || !hasMany) return
    const delta = event.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < SWIPE_THRESHOLD) return
    if (delta < 0) goNext()
    else goPrev()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('listing.galleryClose')}
        className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X aria-hidden="true" size={20} />
      </button>

      {/* Clicks inside the image area must not fall through to the backdrop. */}
      <div
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative flex w-full max-w-4xl items-center justify-center"
      >
        <img
          src={images[index]}
          alt={t('apartmentDetails.gallery.thumbnailLabel', { index: index + 1, title })}
          className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
        />

        {hasMany ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t('apartmentDetails.gallery.prev')}
              className="absolute left-2 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:left-3"
            >
              <ChevronLeft aria-hidden="true" size={22} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t('apartmentDetails.gallery.next')}
              className="absolute right-2 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:right-3"
            >
              <ChevronRight aria-hidden="true" size={22} />
            </button>
          </>
        ) : null}
      </div>

      <p className="mt-4 text-sm font-medium text-white/80">
        {index + 1} / {images.length}
      </p>
    </div>,
    document.body,
  )
}

export default ListingGalleryModal
