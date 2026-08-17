import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'

function ImageGallery({ images, title }) {
  const { t } = useLocale()
  const [activeIndex, setActiveIndex] = useState(0)

  const goPrev = () => setActiveIndex((current) => (current === 0 ? images.length - 1 : current - 1))
  const goNext = () => setActiveIndex((current) => (current === images.length - 1 ? 0 : current + 1))

  return (
    <div>
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-surface-secondary sm:aspect-16/10">
        <img
          src={images[activeIndex]}
          alt={t('apartmentDetails.gallery.thumbnailLabel', { index: activeIndex + 1, title })}
          className="size-full object-cover"
        />

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={t('apartmentDetails.gallery.prev')}
              className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-text-primary shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t('apartmentDetails.gallery.next')}
              className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-text-primary shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight aria-hidden="true" size={20} />
            </button>

            <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
              {activeIndex + 1} / {images.length}
            </div>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={t('apartmentDetails.gallery.thumbnailLabel', { index: index + 1, title })}
              aria-current={index === activeIndex}
              className={`aspect-square overflow-hidden rounded-lg ring-2 transition-colors focus:outline-none ${
                index === activeIndex ? 'ring-primary' : 'ring-transparent hover:ring-border'
              }`}
            >
              <img src={image} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default ImageGallery
