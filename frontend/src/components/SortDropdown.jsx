import { useRef, useState } from 'react'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import { useDismiss } from '../hooks/useDismiss'

const SORT_OPTIONS = [
  { value: 'newest', labelKey: 'sort.newest' },
  { value: 'cheapest', labelKey: 'sort.cheapest' },
  { value: 'expensive', labelKey: 'sort.expensive' },
  { value: 'areaLarge', labelKey: 'sort.areaLarge' },
  { value: 'areaSmall', labelKey: 'sort.areaSmall' },
]

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

function SortDropdown() {
  const { t } = useLocale()
  const { sort, setSort } = useSearch()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const close = () => setIsOpen(false)
  useDismiss(containerRef, isOpen, close)

  const current = SORT_OPTIONS.find((option) => option.value === sort) ?? SORT_OPTIONS[0]

  const handleSelect = (value) => {
    setSort(value)
    close()
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="text-text-muted">{t('sort.ariaLabel')}:</span>
        {t(current.labelKey)}
        <ChevronIcon />
      </button>

      {isOpen ? (
        <ul
          role="menu"
          aria-label={t('sort.ariaLabel')}
          className="absolute right-0 top-full z-40 mt-2 w-48 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          {SORT_OPTIONS.map((option) => (
            <li key={option.value} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelect(option.value)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                  option.value === sort ? 'font-medium text-primary' : 'text-text-primary'
                }`}
              >
                {t(option.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default SortDropdown
