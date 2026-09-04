import { useEffect, useId, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSearch } from '../context/SearchContext'
import { writeSearchParams } from '../utils/searchParams'
import { useLocale } from '../context/LocaleContext'
import { ROUTES } from '../routes/paths'
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
  const { districtId, setDistrictId, keyword, submitKeyword, filters, sort } = useSearch()
  const [keywordInput, setKeywordInput] = useState(keyword)
  const keywordInputId = useId()
  const location = useLocation()
  const navigate = useNavigate()

  // The Map MVP searches by district + filters only; keyword/address search
  // is kept in the DOM (not removed) but visually muted and inert there.
  const isKeywordSearchDisabled = location.pathname === ROUTES.map

  useEffect(() => {
    setKeywordInput(keyword)
  }, [keyword])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (isKeywordSearchDisabled) return

    const value = keywordInput.trim()
    submitKeyword(value)

    // Searching means going to the results. The bar sits in the header of every
    // page, and until now submitting it from a listing or the map only changed
    // state that page did not render — the search appeared to do nothing.
    //
    // The map is left alone: it is a search of its own, drawn on the map
    // itself, and sending it to a list would be answering a different question.
    if (location.pathname !== ROUTES.map) {
      navigate({
        pathname: ROUTES.search,
        search: writeSearchParams({
          districtId, keyword: value, filters, sort, page: 1,
        }).toString(),
      })
    }
  }

  // Choosing a district is a search too, and the same rule applies: from the
  // results page it re-runs the search, from anywhere else it goes there. The
  // home page is the exception — it lists everything and answers a district
  // change in place.
  const handleDistrict = (nextDistrict) => {
    setDistrictId(nextDistrict)
    if (location.pathname === ROUTES.home || location.pathname === ROUTES.map) return
    navigate({
      pathname: ROUTES.search,
      search: writeSearchParams({
        districtId: nextDistrict, keyword: keywordInput.trim(), filters, sort, page: 1,
      }).toString(),
    })
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-primary/40"
    >
      <DistrictSelector districtId={districtId} onChange={handleDistrict} />

      <label htmlFor={keywordInputId} className="sr-only">
        {t('search.keywordLabel')}
      </label>
      <input
        id={keywordInputId}
        type="search"
        value={keywordInput}
        onChange={(event) => setKeywordInput(event.target.value)}
        placeholder={t('search.keywordPlaceholder')}
        disabled={isKeywordSearchDisabled}
        title={isKeywordSearchDisabled ? t('search.keywordDisabledHint') : undefined}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed disabled:text-text-muted disabled:placeholder:text-border lg:px-4 lg:py-2.5"
      />

      <button
        type="submit"
        aria-label={t('search.button')}
        disabled={isKeywordSearchDisabled}
        title={isKeywordSearchDisabled ? t('search.keywordDisabledHint') : undefined}
        className="flex shrink-0 items-center justify-center gap-1.5 rounded-r-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted disabled:hover:bg-border min-[412px]:px-4 lg:px-5 lg:py-2.5"
      >
        <SearchIcon className="min-[412px]:hidden" />
        <span className="hidden min-[412px]:inline">{t('search.button')}</span>
      </button>
    </form>
  )
}

export default SearchBar
