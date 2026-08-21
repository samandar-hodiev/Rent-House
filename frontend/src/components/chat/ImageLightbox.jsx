import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

/**
 * A picture at full size.
 *
 * The thumbnail in a bubble is deliberately small; this is where the photograph
 * is actually looked at. Escape and a click outside both close it, because a
 * viewer that traps you is worse than no viewer.
 */
function ImageLightbox({ image, onClose }) {
  const { t } = useLocale()

  // Captured, and the event stopped.
  //
  // The chat modal underneath also closes on Escape. Without capturing here,
  // one press would close both — the reader would dismiss the enlarged picture
  // and lose the whole conversation with it. The topmost layer takes the key
  // and nothing below sees it.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('chat.cancel')}
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X aria-hidden="true" size={20} />
      </button>

      <img
        src={image.src}
        alt={image.name}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  )
}

export default ImageLightbox
