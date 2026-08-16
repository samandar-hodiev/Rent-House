import { useEffect, useId, useState } from 'react'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import DistrictSelector from './DistrictSelector'

function SearchIcon({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`size-4 shrink-0 ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function SearchBar() {
  const { t } = useLocale()
  const { districtId, setDistrictId, keyword, submitKeyword } = useSearch()
  const [keywordInput, setKeywordInput] = useState(keyword)
  const keywordInputId = useId()

  useEffect(() => {
    setKeywordInput(keyword)
  }, [keyword])

  const handleSubmit = (event) => {
    event.preventDefault()
    submitKeyword(keywordInput)
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-primary/40"
    >
      <DistrictSelector districtId={districtId} onChange={setDistrictId} />

      <label htmlFor={keywordInputId} className="sr-only">
        {t('search.keywordLabel')}
      </label>
      <input
        id={keywordInputId}
        type="search"
        value={keywordInput}
        onChange={(event) => setKeywordInput(event.target.value)}
        placeholder={t('search.keywordPlaceholder')}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none lg:px-4 lg:py-2.5"
      />

      <button
        type="submit"
        aria-label={t('search.button')}
        className="flex shrink-0 items-center justify-center gap-1.5 rounded-r-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-[412px]:px-4 lg:px-5 lg:py-2.5"
      >
        <SearchIcon className="min-[412px]:hidden" />
        <span className="hidden min-[412px]:inline">{t('search.button')}</span>
      </button>
    </form>
  )
}

export default SearchBar
