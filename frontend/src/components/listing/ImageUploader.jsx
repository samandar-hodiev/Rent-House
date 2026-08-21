import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, Loader2, Star, Trash2, TriangleAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'
import { MAX_IMAGES } from '../../data/listingForm'
import { uploadApartmentImage } from '../../services/apartmentsApi'

// Photo picker with drag & drop, previews, remove and cover selection.
//
// Each file is shown immediately from a local object URL — waiting for a round
// trip before anything appears would make picking photos feel broken — and is
// uploaded in the background. `uploadedUrl` is what the listing actually
// stores; until it arrives the picture is visibly still uploading, and a
// failure is shown on the tile rather than silently producing a listing whose
// gallery is empty for everyone but its author.
function ImageUploader({ images, coverImageId, onChange, onCoverChange, error }) {
  const { t } = useLocale()
  const { token } = useAuth()
  const inputId = useId()
  const errorId = `${inputId}-error`
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const remaining = MAX_IMAGES - images.length

  // Release every object URL when the form unmounts.
  const imagesRef = useRef(images)
  imagesRef.current = images
  useEffect(
    () => () =>
      imagesRef.current.forEach((image) => {
        // Only the local previews hold a revocable handle; a stored URL is just
        // a string.
        if (image.url?.startsWith('blob:')) URL.revokeObjectURL(image.url)
      }),
    [],
  )

  // Patches one tile by id. The list may have changed while a request was in
  // flight — another file finished, or this one was removed — so the update
  // reads the current list rather than the one captured when it started.
  // An updater, not a value. Uploads run in parallel and finish in any order;
  // each one has to patch the list as it is at that moment. Reading a snapshot
  // — from props or from a ref — means two that land before the next render
  // both start from the same list, and the second silently discards the
  // first's URL. That is how three uploaded photographs became one saved one.
  const patchImage = (imageId, patch) => {
    onChange((current) =>
      current.map((image) => (image.id === imageId ? { ...image, ...patch } : image)),
    )
  }

  const upload = async (image, file) => {
    try {
      const url = await uploadApartmentImage(file, { token })
      patchImage(image.id, { uploadedUrl: url, uploading: false, failed: false })
    } catch {
      // The message is on the tile, next to the picture it is about.
      patchImage(image.id, { uploading: false, failed: true })
    }
  }

  const addFiles = (fileList) => {
    const picked = [...fileList].filter((file) => file.type.startsWith('image/')).slice(0, remaining)
    if (picked.length === 0) return

    const added = picked.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      url: URL.createObjectURL(file),
      uploading: true,
      uploadedUrl: null,
      failed: false,
    }))

    onChange((current) => [...current, ...added])
    // The first photo added becomes the cover, matching what the card shows.
    if (!coverImageId) onCoverChange(added[0].id)

    added.forEach((image, index) => upload(image, picked[index]))
  }

  const removeImage = (imageId) => {
    const target = images.find((image) => image.id === imageId)
    if (target?.url?.startsWith('blob:')) URL.revokeObjectURL(target.url)

    // Also an updater, so removing a tile while another upload is still in
    // flight cannot drop that upload's result.
    onChange((current) => current.filter((image) => image.id !== imageId))
    if (coverImageId === imageId) {
      const next = images.filter((image) => image.id !== imageId)
      onCoverChange(next[0]?.id ?? null)
    }
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

                  {/* The picture is on screen either way; this says whether the
                      server has it yet. Without it a listing could be published
                      with a gallery that only its author can see. */}
                  {image.uploading ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                      <Loader2
                        aria-hidden="true"
                        size={20}
                        className="animate-spin text-white"
                      />
                      <span className="sr-only">{t('listing.imageUploading')}</span>
                    </span>
                  ) : null}

                  {image.failed ? (
                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-error px-2 py-1 text-[11px] font-medium text-white">
                      <TriangleAlert aria-hidden="true" size={12} className="shrink-0" />
                      {t('listing.imageUploadFailed')}
                    </span>
                  ) : null}

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
