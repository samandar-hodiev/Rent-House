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
  const scrollRef = useRef(null)

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

  // A new photo starts at its top. Without this, paging from a tall image
  // scrolled halfway down lands you halfway down the next one.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [index])

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
      className="fixed inset-0 z-50 flex flex-col items-center bg-slate-900/90 px-2 pb-4 pt-16 sm:px-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('listing.galleryClose')}
        className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X aria-hidden="true" size={20} />
      </button>

      {/* The scroll area. Every photo is shown at the same width, so a portrait
          shot is not squeezed into a narrow column beside its landscape
          neighbours — which is what happened when the image was sized by
          height and left to work out its own width.

          A tall photo at full width can be taller than the screen, so this
          scrolls rather than shrinking the image back down. The controls sit
          outside it and stay where they are. */}
      <div
        ref={scrollRef}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex w-full flex-1 justify-center overflow-y-auto overscroll-contain py-2"
      >
        {/* The one element that fixes the width. It does not depend on the
            image, so switching photos cannot move anything horizontally. */}
        <div className="h-fit w-full max-w-3xl px-12 sm:px-14">
          <img
            src={images[index]}
            alt={t('apartmentDetails.gallery.thumbnailLabel', { index: index + 1, title })}
            // `w-full h-auto`: fill the fixed width, take whatever height the
            // aspect ratio asks for. No cropping and no distortion, because
            // nothing is constraining the other axis.
            className="w-full rounded-lg"
          />
        </div>
      </div>

      {hasMany ? (
        <>
          {/* Anchored to the backdrop rather than to the image, so they hold
              one position whatever the current photo's shape is. */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              goPrev()
            }}
            aria-label={t('apartmentDetails.gallery.prev')}
            className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:left-4"
          >
            <ChevronLeft aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              goNext()
            }}
            aria-label={t('apartmentDetails.gallery.next')}
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:right-4"
          >
            <ChevronRight aria-hidden="true" size={22} />
          </button>
        </>
      ) : null}

      <p className="mt-3 shrink-0 text-sm font-medium text-white/80">
        {index + 1} / {images.length}
      </p>
    </div>,
    document.body,
  )
}

export default ListingGalleryModal
