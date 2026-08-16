import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const EMPTY_FILTERS = {
  minPrice: null,
  maxPrice: null,
  rooms: null,
  minArea: null,
  maxArea: null,
  floorRange: null,
  furnished: null,
}

const SearchContext = createContext(null)

export const DEFAULT_SORT = 'newest'

export function SearchProvider({ children }) {
  const [districtId, setDistrictId] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [filters, setFiltersState] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState(DEFAULT_SORT)

  const submitKeyword = useCallback((value) => {
    setKeyword(value.trim())
  }, [])

  const setFilters = useCallback((partial) => {
    setFiltersState((current) => ({ ...current, ...partial }))
  }, [])

  const clearFilters = useCallback(() => {
    setFiltersState(EMPTY_FILTERS)
  }, [])

  const resetSearch = useCallback(() => {
    setDistrictId(null)
    setKeyword('')
    setFiltersState(EMPTY_FILTERS)
  }, [])

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== null).length,
    [filters],
  )

  const value = useMemo(
    () => ({
      districtId,
      setDistrictId,
      keyword,
      submitKeyword,
      filters,
      setFilters,
      clearFilters,
      resetSearch,
      activeFilterCount,
      sort,
      setSort,
    }),
    [
      districtId,
      keyword,
      submitKeyword,
      filters,
      setFilters,
      clearFilters,
      resetSearch,
      activeFilterCount,
      sort,
    ],
  )

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}

export function useSearch() {
  const context = useContext(SearchContext)
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider')
  }
  return context
}
