import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import FormField from '../components/FormField'
import CheckboxGroup from '../components/listing/CheckboxGroup'
import FormSection from '../components/listing/FormSection'
import ImageUploader from '../components/listing/ImageUploader'
import ListingLocationPicker from '../components/listing/ListingLocationPicker'
import ListingPreview from '../components/listing/ListingPreview'
import SegmentedField from '../components/listing/SegmentedField'
import SelectField from '../components/listing/SelectField'
import TextAreaField from '../components/listing/TextAreaField'
import { useLocale } from '../context/LocaleContext'
import { useListings } from '../context/ListingsContext'
import { DISTRICTS, districtNameKey } from '../data/districts'
import {
  AMENITIES,
  CURRENCIES,
  FURNISHING,
  MAX_DESCRIPTION,
  RENTAL_PERIODS,
  RENTAL_RULES,
  ROOM_OPTIONS,
  UTILITIES,
  createEmptyListing,
  formValuesToListing,
  listingToFormValues,
  validateListing,
} from '../data/listingForm'
import { ROUTES } from '../routes/paths'

// One component, two modes: `/create-listing` starts empty, `/edit-listing/:id`
// opens the same form pre-filled with the selected listing.
function CreateListingPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { id } = useParams()
  const { getListing, updateListing } = useListings()

  const isEditMode = Boolean(id)
  const existing = isEditMode ? getListing(id) : null

  // Seeded once: the form owns a working copy from here on, so leaving without
  // saving (cancel, back) cannot mutate the stored listing.
  const [listing, setListing] = useState(() =>
    existing
      ? listingToFormValues(
          existing,
          existing.customTitle ?? t(`apartmentTitle.${existing.id}`),
          existing.description ?? t(`apartmentDescription.${existing.id}`),
        )
      : createEmptyListing(),
  )
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null) // null | 'published' | 'draft'

  // Clearing the field's error as it is edited keeps messages from lingering
  // after the user has already fixed them.
  const setField = useCallback((field, value) => {
    setListing((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setStatus(null)
  }, [])

  const setLocationField = useCallback((field, value) => {
    setListing((current) => ({ ...current, location: { ...current.location, [field]: value } }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setStatus(null)
  }, [])

  const setConditionField = useCallback((field, value) => {
    setListing((current) => ({
      ...current,
      rentalConditions: { ...current.rentalConditions, [field]: value },
    }))
    setStatus(null)
  }, [])

  const toggleIn = (list, id) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id]

  const handleCoordinates = useCallback(({ latitude, longitude }) => {
    setListing((current) => ({ ...current, location: { ...current.location, latitude, longitude } }))
    setStatus(null)
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validateListing(listing)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setStatus(null)
      return
    }

    if (isEditMode) {
      // Writes the working copy back to the shared listing state; `status` is
      // deliberately not part of the patch, so Faol/Kutilmoqda/Yopilgan stays.
      updateListing(id, formValuesToListing(listing))
      // The project has no toast system; confirmation uses the same inline
      // `role="status"` pattern the rest of the app uses, rendered on the page
      // the user lands on.
      navigate(ROUTES.dashboardListings, { state: { saved: true } })
      return
    }
    // Mock submission: the listing object is complete and matches what
    // `POST /api/v1/apartments` will take, but nothing is sent anywhere.
    setStatus('published')
  }

  const handleSaveDraft = () => {
    setErrors({})
    setStatus('draft')
  }

  const districtOptions = useMemo(
    () => DISTRICTS.map((district) => ({ id: district.id, label: t(districtNameKey(district.id)) })),
    [t],
  )
  const optionsOf = (items) => items.map((item) => ({ id: item.id, label: t(item.labelKey) }))
  const roomOptions = ROOM_OPTIONS.map((value) => ({ id: value, label: value }))
  const amenityOptions = AMENITIES.map((id) => ({ id, label: t(`amenity.${id}`) }))
  const ruleOptions = RENTAL_RULES.map((id) => ({ id, label: t(`listing.rule${id}`) }))
  const errorText = (field) => (errors[field] ? t(errors[field]) : undefined)

  if (isEditMode && !existing) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-text-primary">{t('listing.editTitle')}</h1>
        <p className="text-sm text-text-secondary">{t('listing.notFound')}</p>
        <div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.dashboardListings)}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('listing.backToListings')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-text-primary">
        {isEditMode ? t('listing.editTitle') : t('dashboard.createListingTitle')}
      </h1>

      {/* Form left, live card preview right on `xl:`; single column below. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 xl:flex-row">
        <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
          <FormSection title={t('listing.sectionImages')}>
            <ImageUploader
              images={listing.images}
              coverImageId={listing.coverImageId}
              onChange={(images) => setField('images', images)}
              onCoverChange={(id) => setField('coverImageId', id)}
              error={errorText('images')}
            />
          </FormSection>

          <FormSection title={t('listing.sectionBasics')}>
            <FormField
              label={t('listing.title')}
              value={listing.title}
              onChange={(value) => setField('title', value)}
              error={errorText('title')}
              placeholder={t('listing.titlePlaceholder')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('listing.price')}
                value={listing.price}
                onChange={(value) => setField('price', value.replace(/[^\d]/g, ''))}
                error={errorText('price')}
                placeholder={t('listing.pricePlaceholder')}
                inputMode="numeric"
              />
              <SegmentedField
                label={t('listing.currency')}
                options={optionsOf(CURRENCIES)}
                value={listing.currency}
                onChange={(value) => setField('currency', value)}
              />
            </div>

            <SegmentedField
              label={t('listing.rentalPeriod')}
              options={optionsOf(RENTAL_PERIODS)}
              value={listing.rentalPeriod}
              onChange={(value) => setField('rentalPeriod', value)}
            />
          </FormSection>

          <FormSection title={t('listing.sectionApartment')}>
            <SegmentedField
              label={t('listing.rooms')}
              options={roomOptions}
              value={listing.rooms}
              onChange={(value) => setField('rooms', value)}
              error={errorText('rooms')}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                label={t('listing.area')}
                value={listing.area}
                onChange={(value) => setField('area', value.replace(/[^\d]/g, ''))}
                error={errorText('area')}
                placeholder="65"
                inputMode="numeric"
              />
              <FormField
                label={t('listing.floor')}
                value={listing.floor}
                onChange={(value) => setField('floor', value.replace(/[^\d]/g, ''))}
                error={errorText('floor')}
                placeholder="3"
                inputMode="numeric"
              />
              <FormField
                label={t('listing.totalFloors')}
                value={listing.totalFloors}
                onChange={(value) => setField('totalFloors', value.replace(/[^\d]/g, ''))}
                error={errorText('totalFloors')}
                placeholder="9"
                inputMode="numeric"
              />
            </div>
          </FormSection>

          <FormSection title={t('listing.sectionAmenities')}>
            <SegmentedField
              label={t('listing.furnishing')}
              options={optionsOf(FURNISHING)}
              value={listing.furnished}
              onChange={(value) => setField('furnished', value)}
            />
            <CheckboxGroup
              label={t('listing.amenities')}
              options={amenityOptions}
              selected={listing.amenities}
              onToggle={(id) => setField('amenities', toggleIn(listing.amenities, id))}
            />
          </FormSection>

          <FormSection title={t('listing.sectionDescription')}>
            <TextAreaField
              label={t('listing.description')}
              value={listing.description}
              onChange={(value) => setField('description', value)}
              error={errorText('description')}
              placeholder={t('listing.descriptionPlaceholder')}
              maxLength={MAX_DESCRIPTION}
            />
          </FormSection>

          <FormSection title={t('listing.sectionLocation')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('listing.city')}
                value={listing.location.city}
                onChange={(value) => setLocationField('city', value)}
                error={errorText('city')}
              />
              <SelectField
                label={t('listing.district')}
                options={districtOptions}
                value={listing.location.district}
                onChange={(value) => setLocationField('district', value)}
                error={errorText('district')}
                placeholder={t('listing.districtPlaceholder')}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('listing.neighborhood')}
                value={listing.location.neighborhood}
                onChange={(value) => setLocationField('neighborhood', value)}
                placeholder={t('listing.neighborhoodPlaceholder')}
              />
              <FormField
                label={t('listing.address')}
                value={listing.location.address}
                onChange={(value) => setLocationField('address', value)}
                error={errorText('address')}
                placeholder={t('listing.addressPlaceholder')}
              />
            </div>

            <ListingLocationPicker
              latitude={listing.location.latitude}
              longitude={listing.location.longitude}
              onChange={handleCoordinates}
            />
          </FormSection>

          <FormSection title={t('listing.sectionConditions')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('listing.deposit')}
                value={listing.rentalConditions.deposit}
                onChange={(value) => setConditionField('deposit', value.replace(/[^\d]/g, ''))}
                placeholder={t('listing.depositPlaceholder')}
                inputMode="numeric"
              />
              <FormField
                label={t('listing.minimumMonths')}
                value={listing.rentalConditions.minimumMonths}
                onChange={(value) => setConditionField('minimumMonths', value.replace(/[^\d]/g, ''))}
                placeholder="6"
                inputMode="numeric"
              />
            </div>

            <SegmentedField
              label={t('listing.utilities')}
              options={optionsOf(UTILITIES)}
              value={listing.rentalConditions.utilities}
              onChange={(value) => setConditionField('utilities', value)}
            />

            <CheckboxGroup
              label={t('listing.rules')}
              options={ruleOptions}
              selected={listing.rentalConditions.rules}
              onToggle={(id) =>
                setConditionField('rules', toggleIn(listing.rentalConditions.rules, id))
              }
            />
          </FormSection>

          <div className="flex flex-col gap-3">
            {status ? (
              <p
                role="status"
                className="flex items-center gap-2 rounded-md border border-primary bg-primary-light px-3 py-2.5 text-sm text-primary-hover dark:text-primary"
              >
                <Check aria-hidden="true" size={16} />
                {status === 'published' ? t('listing.published') : t('listing.draftSaved')}
              </p>
            ) : null}

            {Object.keys(errors).length > 0 ? (
              <p role="alert" className="text-sm text-error">
                {t('listing.errorSummary')}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {isEditMode ? t('listing.saveChanges') : t('listing.publish')}
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t('listing.saveDraft')}
              </button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.dashboardListings)}
                className="rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t('listing.cancel')}
              </button>
            </div>
          </div>
        </div>

        {/* Below `xl:` the preview follows the form instead of sitting beside it. */}
        <aside className="w-full shrink-0 xl:sticky xl:top-20 xl:w-80 xl:self-start">
          <ListingPreview listing={listing} />
        </aside>
      </form>
    </section>
  )
}

export default CreateListingPage
