import { useState } from 'react'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import ImageLightbox from './ImageLightbox'

/**
 * A listing's photographs.
 *
 * The shape is set by aspect ratio rather than by a height, so the picture
 * scales with whatever column it is given and never distorts — `object-cover`
 * decides what to crop when the ratio and the photograph disagree.
 *
 * The ratio widens as the screen does, which is what keeps the gallery from
 * dominating a laptop. The detail page puts this in a `1fr` column beside a
 * fixed 400px one, so on a 1440-wide screen it is handed roughly 860px: at
 * 16/10 that is a 540px-tall image on a viewport barely 800px high, and the
 * price and description start below the fold. A wider ratio through the laptop
 * range trims that without touching the large-desktop layout, which is already
 * right and where the extra height is affordable.
 */
function ImageGallery({ images, title }) {
  const { t } = useLocale()
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  const goPrev = () => setActiveIndex((current) => (current === 0 ? images.length - 1 : current - 1))
  const goNext = () => setActiveIndex((current) => (current === images.length - 1 ? 0 : current + 1))

  return (
    <div>
      <div
        className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-surface-secondary sm:aspect-3/2 lg:aspect-16/9 2xl:aspect-16/10"
      >
        {/* The picture is the way into the full-size viewer, which is where a
            photograph is actually looked at. A button rather than a click
            handler on the image, so it is reachable by keyboard and announces
            itself. */}
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={t('apartmentDetails.gallery.open')}
          className="group absolute inset-0 size-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <img
            src={images[activeIndex]}
            alt={t('apartmentDetails.gallery.thumbnailLabel', { index: activeIndex + 1, title })}
            className="size-full object-cover"
          />
          {/* A hint, not a control: it says the picture opens without putting
              another button on top of one. */}
          <span
            aria-hidden="true"
            className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100"
          >
            <Expand size={15} />
          </span>
        </button>

        {images.length > 1 ? (
          <>
            {/* Above the picture button, and stopping their clicks, so paging
                through the gallery in place does not also open the viewer. */}
            <button
              type="button"
              onClick={goPrev}
              aria-label={t('apartmentDetails.gallery.prev')}
              className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-slate-900 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={t('apartmentDetails.gallery.next')}
              className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-slate-900 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight aria-hidden="true" size={20} />
            </button>

            <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
              {activeIndex + 1} / {images.length}
            </div>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        // More columns through the laptop range means smaller thumbnails
        // there, which is the same trade the main image makes. Five again at
        // 2xl, so the large-desktop strip is exactly what it was.
        <div className="mt-3 grid grid-cols-5 gap-2 lg:grid-cols-6 lg:gap-1.5 2xl:grid-cols-5 2xl:gap-2">
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

      {/* The same viewer chat and the profile use, given the whole set so it
          can page through it. */}
      {zoomed ? (
        <ImageLightbox
          image={{
            src: images[activeIndex],
            name: t('apartmentDetails.gallery.thumbnailLabel', {
              index: activeIndex + 1,
              title,
            }),
          }}
          index={activeIndex}
          count={images.length}
          onPrev={goPrev}
          onNext={goNext}
          onClose={() => setZoomed(false)}
        />
      ) : null}
    </div>
  )
}

export default ImageGallery
