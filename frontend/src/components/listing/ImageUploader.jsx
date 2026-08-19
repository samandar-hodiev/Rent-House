import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, Star, Trash2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { MAX_IMAGES } from '../../data/listingForm'

// Photo picker with drag & drop, previews, remove and cover selection.
// Files never leave the browser: each one becomes an object URL that is
// revoked on removal, so there is no upload pipeline to stand up yet.
function ImageUploader({ images, coverImageId, onChange, onCoverChange, error }) {
  const { t } = useLocale()
  const inputId = useId()
  const errorId = `${inputId}-error`
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const remaining = MAX_IMAGES - images.length

  // Release every object URL when the form unmounts.
  const imagesRef = useRef(images)
  imagesRef.current = images
  useEffect(
    () => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)),
    [],
  )

  const addFiles = (fileList) => {
    const picked = [...fileList].filter((file) => file.type.startsWith('image/')).slice(0, remaining)
    if (picked.length === 0) return

    const added = picked.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }))

    const next = [...images, ...added]
    onChange(next)
    // The first photo added becomes the cover, matching what the card shows.
    if (!coverImageId) onCoverChange(added[0].id)
  }

  const removeImage = (imageId) => {
    const target = images.find((image) => image.id === imageId)
    if (target) URL.revokeObjectURL(target.url)

    const next = images.filter((image) => image.id !== imageId)
    onChange(next)
    if (coverImageId === imageId) onCoverChange(next[0]?.id ?? null)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center rounded-md border border-dashed px-4 py-8 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary-light/40' : 'border-border bg-surface-secondary/40'
        } ${error ? 'border-error' : ''}`}
      >
        <ImagePlus aria-hidden="true" size={24} className="text-text-muted" />
        <p className="mt-3 text-sm font-medium text-text-primary">{t('listing.imagesEmpty')}</p>
        <p className="mt-1 text-xs text-text-muted">
          {t('listing.imagesHint', { max: MAX_IMAGES })}
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={remaining <= 0}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
        >
          {t('listing.imagesAdd')}
        </button>

        <label htmlFor={inputId} className="sr-only">
          {t('listing.imagesAdd')}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {error ? (
        <p id={errorId} className="text-xs text-error">
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <>
          <p className="text-xs text-text-muted">
            {t('listing.imagesCount', { count: images.length, max: MAX_IMAGES })}
          </p>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((image) => {
              const isCover = image.id === coverImageId
              return (
                <li
                  key={image.id}
                  className={`relative overflow-hidden rounded-md border ${
                    isCover ? 'border-primary' : 'border-border'
                  }`}
                >
                  <img src={image.url} alt={image.name} className="aspect-4/3 w-full object-cover" />

                  {isCover ? (
                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-white">
                      {t('listing.imagesCover')}
                    </span>
                  ) : null}

                  <div className="flex items-center justify-between gap-1 bg-surface p-1.5">
                    <button
                      type="button"
                      onClick={() => onCoverChange(image.id)}
                      disabled={isCover}
                      aria-label={t('listing.imagesSetCover')}
                      title={t('listing.imagesSetCover')}
                      className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:text-primary"
                    >
                      <Star aria-hidden="true" size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      aria-label={t('listing.imagesRemove')}
                      title={t('listing.imagesRemove')}
                      className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </div>
  )
}

export default ImageUploader
