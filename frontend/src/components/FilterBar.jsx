import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../context/LocaleContext'
import { useDismiss } from '../hooks/useDismiss'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { getDistrictById } from '../data/districts'
import { formatUzsAmount } from '../utils/formatPrice'
import FilterPanel from './FilterPanel'

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
      <path
        fillRule="evenodd"
        d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.66 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ChipRemoveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 shrink-0">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}

// Meant to sit inside the Map page's own glass control bar, so it stays
// flat (no border/blur/shadow of its own — that would double up the effect).
const GLASS_CLASS = 'border-transparent bg-white/55'

function Chip({ label, onRemove, glass }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-3 pr-1.5 text-sm text-text-secondary ${
        glass ? GLASS_CLASS : 'border-border bg-surface-secondary'
      }`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className="rounded-full p-0.5 text-text-muted hover:bg-border hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChipRemoveIcon />
      </button>
    </span>
  )
}

function FilterBar({
  filters,
  setFilters,
  clearFilters,
  activeFilterCount,
  showDistrict = false,
  showFloor = true,
  glass = false,
  sheetOnMobile = false,
  // Keep the button + chips on one horizontal row (they scroll instead of
  // wrapping) — used by the Map page's compact glass bar.
  singleRow = false,
  // Rendered at the end of the controls row (the Map page's result count), so
  // it shares the row with the filter button instead of needing its own.
  trailing = null,
}) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const sheetRef = useRef(null)
  // Opt-in per caller (only the Map page), so Home/Wishlist keep the dropdown.
  const isMobile = useMediaQuery('(max-width: 639px)')
  const useSheet = sheetOnMobile && isMobile

  // On the map's mobile bar the clear action is pinned next to the filter
  // button (short label) so active chips can never scroll it out of reach.
  const pinClear = singleRow && isMobile

  // On mobile the map bar splits into two rows: controls on top, active chips
  // underneath. The chips row only exists while filters are active, so the
  // glass parent stays compact by default.
  const splitRows = singleRow && isMobile

  const close = () => setIsOpen(false)
  // The sheet is portalled outside `containerRef`, so it has to be treated as
  // "inside" too — otherwise picking any filter option would dismiss it.
  const sheetDismissTargets = useMemo(() => [containerRef, sheetRef], [])
  useDismiss(useSheet ? sheetDismissTargets : containerRef, isOpen, close)

  const chips = []

  if (showDistrict && filters.districtId) {
    const district = getDistrictById(filters.districtId)
    chips.push({
      key: 'district',
      label: `${t('filters.district')}: ${district ? district.name : ''}`,
      onRemove: () => setFilters({ districtId: null }),
    })
  }

  if (filters.minPrice !== null || filters.maxPrice !== null) {
    let value
    if (filters.minPrice !== null && filters.maxPrice !== null) {
      value = t('filters.chip.price', {
        min: formatUzsAmount(filters.minPrice),
        max: formatUzsAmount(filters.maxPrice),
      })
    } else if (filters.minPrice !== null) {
      value = t('filters.chip.priceMinOnly', { min: formatUzsAmount(filters.minPrice) })
    } else {
      value = t('filters.chip.priceMaxOnly', { max: formatUzsAmount(filters.maxPrice) })
    }
    chips.push({
      key: 'price',
      label: `${t('filters.price')}: ${value}`,
      onRemove: () => setFilters({ minPrice: null, maxPrice: null }),
    })
  }

  if (filters.rooms !== null) {
    const value =
      filters.rooms === 4
        ? t('filters.chip.roomsPlus', { rooms: 4 })
        : t('filters.chip.rooms', { rooms: filters.rooms })
    chips.push({
      key: 'rooms',
      label: `${t('filters.rooms')}: ${value}`,
      onRemove: () => setFilters({ rooms: null }),
    })
  }

  if (filters.minArea !== null || filters.maxArea !== null) {
    let value
    if (filters.minArea !== null && filters.maxArea !== null) {
      value = t('filters.chip.area', { min: filters.minArea, max: filters.maxArea })
    } else if (filters.minArea !== null) {
      value = t('filters.chip.areaMinOnly', { min: filters.minArea })
    } else {
      value = t('filters.chip.areaMaxOnly', { max: filters.maxArea })
    }
    chips.push({
      key: 'area',
      label: `${t('filters.area')}: ${value}`,
      onRemove: () => setFilters({ minArea: null, maxArea: null }),
    })
  }

  if (showFloor && filters.floorRange !== null) {
    const labelKey =
      filters.floorRange === 'low'
        ? 'filters.floorLow'
        : filters.floorRange === 'mid'
          ? 'filters.floorMid'
          : 'filters.floorHigh'
    chips.push({
      key: 'floor',
      label: `${t('filters.floor')}: ${t(labelKey)}`,
      onRemove: () => setFilters({ floorRange: null }),
    })
  }

  if (filters.furnished !== null) {
    chips.push({
      key: 'furnished',
      label: filters.furnished
        ? t('filters.chip.furnishedYes')
        : t('filters.chip.furnishedNo'),
      onRemove: () => setFilters({ furnished: null }),
    })
  }

  const chipNodes = (
    <>
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} glass={glass} />
      ))}

      {activeFilterCount > 0 && !pinClear ? (
        <button
          type="button"
          onClick={clearFilters}
          className="shrink-0 whitespace-nowrap text-sm font-medium text-text-secondary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('filters.clearAll')}
        </button>
      ) : null}
    </>
  )

  const trigger = (
    <div ref={containerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            glass ? `${GLASS_CLASS} hover:bg-white/75` : 'border-border bg-surface hover:bg-surface-secondary'
          }`}
        >
          <FilterIcon />
          {t('filters.button')}
          {activeFilterCount > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>

        {isOpen && !useSheet ? (
          <div className="absolute left-0 top-full z-40 mt-2">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              onReset={clearFilters}
              onApply={close}
              showDistrict={showDistrict}
              showFloor={showFloor}
            />
          </div>
        ) : null}
      </div>
  )

  // Mobile: a bottom sheet instead of the dropdown. Portalled to <body>
  // because an ancestor with `backdrop-filter` (the map's glass bar) would
  // otherwise become the containing block for `position: fixed`, and so the
  // sheet could not anchor to the viewport. It also keeps the sheet clear of
  // the map's stacking context.
  const sheet =
    isOpen && useSheet
      ? createPortal(
            <>
              <div
                className="fixed inset-0 z-40 bg-text-primary/30"
                onClick={close}
                aria-hidden="true"
              />
              <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('filters.button')}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 shadow-lg"
              >
                <div
                  aria-hidden="true"
                  className="mx-auto mb-3 h-1 w-10 rounded-full bg-border"
                />
                <FilterPanel
                  filters={filters}
                  onChange={setFilters}
                  onReset={clearFilters}
                  onApply={close}
                  showDistrict={showDistrict}
                  showFloor={showFloor}
                  variant="sheet"
                />
              </div>
            </>,
          document.body,
        )
      : null

  const pinnedClear =
    pinClear && activeFilterCount > 0 ? (
      <button
        type="button"
        onClick={clearFilters}
        className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          glass ? `${GLASS_CLASS} hover:bg-white/75` : 'border-border bg-surface hover:bg-surface-secondary'
        }`}
      >
        {t('filters.reset')}
      </button>
    ) : null

  // Exactly one scroll container: an overflow-x-auto ancestor as well would let
  // this row shrink and clip its chips with nothing left to scroll.
  const chipScroller = (grow) => (
    <div
      className={`renthouse-filter-chips flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        grow ? 'shrink' : 'w-full'
      }`}
    >
      {chipNodes}
    </div>
  )

  if (splitRows) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Scrolls rather than overflowing the page on very narrow screens
            (<360px), where the button, clear action and count cannot all fit. */}
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {trigger}
          {pinnedClear}
          {trailing}
        </div>
        {sheet}
        {chips.length > 0 ? chipScroller(false) : null}
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${singleRow ? 'min-w-0 flex-1' : 'flex-wrap'}`}>
      {trigger}
      {sheet}
      {singleRow ? chipScroller(true) : chipNodes}
      {trailing}
    </div>
  )
}

export default FilterBar
