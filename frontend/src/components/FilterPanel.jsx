import { useLocale } from '../context/LocaleContext'
import { DISTRICTS } from '../data/districts'

const ROOM_OPTIONS = [1, 2, 3, 4]
const FLOOR_OPTIONS = [
  { value: 'low', labelKey: 'filters.floorLow' },
  { value: 'mid', labelKey: 'filters.floorMid' },
  { value: 'high', labelKey: 'filters.floorHigh' },
]

function optionButtonClass(isActive) {
  return `rounded-md border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    isActive
      ? 'border-primary bg-primary-light text-primary-hover'
      : 'border-border text-text-secondary hover:bg-surface-secondary'
  }`
}

function FilterPanel({
  filters,
  onChange,
  onReset,
  onApply,
  showDistrict = false,
  showFloor = true,
  // 'sheet' drops the panel's own width/frame so it can fill a bottom sheet
  // that already provides them.
  variant = 'panel',
}) {
  const { t } = useLocale()

  const numberInputClass =
    'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40'

  const toNumberOrNull = (value) => (value === '' ? null : Number(value))

  return (
    <div
      className={
        variant === 'sheet'
          ? 'w-full'
          : 'w-80 rounded-md border border-border bg-surface p-4 shadow-md'
      }
    >
      {showDistrict ? (
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium text-text-primary">
            {t('filters.district')}
          </legend>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {DISTRICTS.map((district) => (
              <button
                key={district.id}
                type="button"
                onClick={() =>
                  onChange({ districtId: filters.districtId === district.id ? null : district.id })
                }
                aria-pressed={filters.districtId === district.id}
                className={optionButtonClass(filters.districtId === district.id)}
              >
                {district.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-text-primary">
          {t('filters.price')}
        </legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="filter-price-min">
            {t('filters.priceMin')}
          </label>
          <input
            id="filter-price-min"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={t('filters.priceMin')}
            value={filters.minPrice ?? ''}
            onChange={(event) => onChange({ minPrice: toNumberOrNull(event.target.value) })}
            className={numberInputClass}
          />
          <span className="text-text-muted">–</span>
          <label className="sr-only" htmlFor="filter-price-max">
            {t('filters.priceMax')}
          </label>
          <input
            id="filter-price-max"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={t('filters.priceMax')}
            value={filters.maxPrice ?? ''}
            onChange={(event) => onChange({ maxPrice: toNumberOrNull(event.target.value) })}
            className={numberInputClass}
          />
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-text-primary">
          {t('filters.rooms')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {ROOM_OPTIONS.map((room) => (
            <button
              key={room}
              type="button"
              onClick={() => onChange({ rooms: filters.rooms === room ? null : room })}
              aria-pressed={filters.rooms === room}
              className={optionButtonClass(filters.rooms === room)}
            >
              {room === 4 ? t('filters.roomsPlus') : room}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-text-primary">
          {t('filters.area')}
        </legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="filter-area-min">
            {t('filters.areaMin')}
          </label>
          <input
            id="filter-area-min"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={t('filters.areaMin')}
            value={filters.minArea ?? ''}
            onChange={(event) => onChange({ minArea: toNumberOrNull(event.target.value) })}
            className={numberInputClass}
          />
          <span className="text-text-muted">–</span>
          <label className="sr-only" htmlFor="filter-area-max">
            {t('filters.areaMax')}
          </label>
          <input
            id="filter-area-max"
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={t('filters.areaMax')}
            value={filters.maxArea ?? ''}
            onChange={(event) => onChange({ maxArea: toNumberOrNull(event.target.value) })}
            className={numberInputClass}
          />
        </div>
      </fieldset>

      {showFloor ? (
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium text-text-primary">
            {t('filters.floor')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {FLOOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  onChange({
                    floorRange: filters.floorRange === option.value ? null : option.value,
                  })
                }
                aria-pressed={filters.floorRange === option.value}
                className={optionButtonClass(filters.floorRange === option.value)}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium text-text-primary">
          {t('filters.furnished')}
        </legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange({ furnished: filters.furnished === true ? null : true })}
            aria-pressed={filters.furnished === true}
            className={optionButtonClass(filters.furnished === true)}
          >
            {t('filters.furnishedYes')}
          </button>
          <button
            type="button"
            onClick={() => onChange({ furnished: filters.furnished === false ? null : false })}
            aria-pressed={filters.furnished === false}
            className={optionButtonClass(filters.furnished === false)}
          >
            {t('filters.furnishedNo')}
          </button>
        </div>
      </fieldset>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-text-secondary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('filters.reset')}
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('filters.apply')}
        </button>
      </div>
    </div>
  )
}

export default FilterPanel
