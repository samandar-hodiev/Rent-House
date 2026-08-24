import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'

// Below this, a horizontal drag is a flick rather than a wobble. Vertical
// movement is compared against it too, so scrolling the page past a picture is
// not mistaken for paging through one.
const SWIPE_PX = 48

/**
 * A picture at full size.
 *
 * The thumbnail in a bubble — or in a listing's gallery — is deliberately
 * small; this is where the photograph is actually looked at. Escape and a click
 * outside both close it, because a viewer that traps you is worse than no
 * viewer.
 *
 * `onPrev`/`onNext` are optional. Given them, this becomes a gallery: arrows,
 * a counter, arrow keys and a swipe. Without them — the chat's single
 * attachment — none of that is rendered, so one attachment does not grow
 * controls that would have nothing to move to.
 */
function ImageLightbox({ image, onClose, onPrev, onNext, index, count }) {
  const { t } = useLocale()
  const touchStart = useRef(null)

  const canNavigate = Boolean(onPrev && onNext && count > 1)

  // Captured, and the event stopped.
  //
  // The chat modal underneath also closes on Escape. Without capturing here,
  // one press would close both — the reader would dismiss the enlarged picture
  // and lose the whole conversation with it. The topmost layer takes the key
  // and nothing below sees it.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (!canNavigate) return
      if (event.key === 'ArrowLeft') {
        event.stopPropagation()
        onPrev()
      } else if (event.key === 'ArrowRight') {
        event.stopPropagation()
        onNext()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, onPrev, onNext, canNavigate])

  // The page behind must not scroll while this is open — on a phone especially,
  // where the drag that pages through pictures would otherwise also move the
  // listing underneath.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const onTouchStart = (event) => {
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event) => {
    if (!canNavigate || !touchStart.current) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    touchStart.current = null
    // Mostly sideways, and far enough to be deliberate.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return
    if (dx > 0) onPrev()
    else onNext()
  }

  const arrow =
    'flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/90 p-3 sm:p-6"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('chat.close')}
        // Comfortably tappable, and clear of the arrows below it on a phone.
        className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4 sm:top-4"
      >
        <X aria-hidden="true" size={20} />
      </button>

      {/* The picture takes the whole area the controls leave, centred both
          ways, and `object-contain` keeps it whole — cropping here would
          defeat the point of opening it.
          
          `h-full w-full` rather than `max-h-full max-w-full`: the latter sizes
          an image by its intrinsic dimensions and only caps them, so anything
          smaller than the viewport stayed at its natural size and the "full
          size" viewer showed a stamp in the middle of a dark screen. Sized to
          the box and contained, it scales up as well as down, and the ratio is
          preserved either way. */}
      <img
        src={image.src}
        alt={image.name}
        onClick={(event) => event.stopPropagation()}
        className="size-full rounded-lg object-contain"
      />

      {canNavigate ? (
        <>
          {/* Sitting over the backdrop rather than inside the picture, so they
              stay reachable whatever shape the photograph is. */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onPrev()
            }}
            aria-label={t('apartmentDetails.gallery.prev')}
            className={`absolute left-3 top-1/2 -translate-y-1/2 sm:left-6 ${arrow}`}
          >
            <ChevronLeft aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onNext()
            }}
            aria-label={t('apartmentDetails.gallery.next')}
            className={`absolute right-3 top-1/2 -translate-y-1/2 sm:right-6 ${arrow}`}
          >
            <ChevronRight aria-hidden="true" size={22} />
          </button>

          <p
            aria-live="polite"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white sm:bottom-6"
          >
            {index + 1} / {count}
          </p>
        </>
      ) : null}
    </div>
  )
}

export default ImageLightbox
