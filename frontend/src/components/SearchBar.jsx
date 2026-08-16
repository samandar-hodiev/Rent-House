import { useEffect, useState } from 'react'
import { useSearch } from '../context/SearchContext'
import { useLocale } from '../context/LocaleContext'
import DistrictSelector from './DistrictSelector'

function SearchBar() {
  const { t } = useLocale()
  const { districtId, setDistrictId, keyword, submitKeyword } = useSearch()
  const [keywordInput, setKeywordInput] = useState(keyword)

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
      className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-primary/40"
    >
      <DistrictSelector districtId={districtId} onChange={setDistrictId} />

      <label htmlFor="header-keyword-search" className="sr-only">
        {t('search.keywordLabel')}
      </label>
      <input
        id="header-keyword-search"
        type="search"
        value={keywordInput}
        onChange={(event) => setKeywordInput(event.target.value)}
        placeholder={t('search.keywordPlaceholder')}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
      />

      <button
        type="submit"
        className="shrink-0 bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t('search.button')}
      </button>
    </form>
  )
}

export default SearchBar
