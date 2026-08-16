import { useMemo, useRef, useState } from 'react'
import { DISTRICTS, getDistrictById } from '../data/districts'
import { useDismiss } from '../hooks/useDismiss'
import { useLocale } from '../context/LocaleContext'

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 shrink-0">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}

function DistrictSelector({ districtId, onChange }) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)

  const selectedDistrict = getDistrictById(districtId)

  const filteredDistricts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return DISTRICTS
    return DISTRICTS.filter((district) =>
      district.name.toLowerCase().includes(normalized),
    )
  }, [query])

  const close = () => setIsOpen(false)
  useDismiss(containerRef, isOpen, close)

  const handleSelect = (id) => {
    onChange(id)
    setQuery('')
    close()
  }

  const handleClear = (event) => {
    event.stopPropagation()
    onChange(null)
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full shrink-0 items-center border-r border-border"
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex h-full items-center gap-1.5 rounded-l-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:px-4 lg:py-2.5"
      >
        <span className="max-w-[9rem] truncate">
          {selectedDistrict ? selectedDistrict.name : t('search.districtAll')}
        </span>
        {!selectedDistrict ? <ChevronIcon /> : null}
      </button>

      {selectedDistrict ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label={t('search.clearDistrict')}
          className="mr-2 rounded-full p-0.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ClearIcon />
        </button>
      ) : null}

      {isOpen ? (
        <div
          role="dialog"
          aria-label={t('search.districtLabel')}
          className="absolute left-0 top-full z-40 mt-2 w-72 rounded-md border border-border bg-surface p-2 shadow-md"
        >
          <label htmlFor="district-search-input" className="sr-only">
            {t('search.districtSearchLabel')}
          </label>
          <input
            id="district-search-input"
            type="text"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.districtSearchPlaceholder')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          <ul className="mt-2 max-h-64 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                  !districtId ? 'font-medium text-primary' : 'text-text-primary'
                }`}
              >
                {t('search.districtAll')}
              </button>
            </li>
            {filteredDistricts.map((district) => (
              <li key={district.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(district.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                    districtId === district.id
                      ? 'font-medium text-primary'
                      : 'text-text-primary'
                  }`}
                >
                  {district.name}
                </button>
              </li>
            ))}
            {filteredDistricts.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-muted">
                {t('search.noDistrictResults')}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export default DistrictSelector
