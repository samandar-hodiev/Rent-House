import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import Container from '../components/Container'
import FilterBar from '../components/FilterBar'
import SortDropdown from '../components/SortDropdown'
import ApartmentGrid from '../components/ApartmentGrid'
import Pagination from '../components/Pagination'
import { useLocale } from '../context/LocaleContext'
import { useSearch } from '../context/SearchContext'
import { useSiteSettings } from '../context/SiteSettingsContext'
import { fetchApartments } from '../services/apartmentsApi'
import {
  EMPTY_FILTERS, countFilters, readSearchParams, toApiQuery, writeSearchParams,
} from '../utils/searchParams'

/**
 * The results of a search.
 *
 * Its state is the address bar. Every filter, the ordering and the page number
 * are query parameters, so a search can be linked to, bookmarked and stepped
 * back through — and the page needs no memory of its own to be correct after a
 * reload.
 *
 * Everything is answered by the server, including the filters that used to be
 * applied in the browser over a single page of results. That mattered here in a
 * way it did not on the home page: with real pagination, filtering after the
 * fact would show four listings on a page that claims to hold twenty.
 */
function SearchPage() {
  const { t } = useLocale()
  const { settings } = useSiteSettings()
  const [params, setParams] = useSearchParams()

  // The header's search bar reads from the shared context, so what the address
  // bar says and what the bar shows have to be the same thing.
  const { setDistrictId, submitKeyword, setFilters: setContextFilters, setSort: setContextSort } =
    useSearch()

  const search = useMemo(() => readSearchParams(params), [params])
  const limit = settings.pagination_default_size || 20

  const [result, setResult] = useState({ items: [], total: 0, page: 1, pages: 0 })
  const [state, setState] = useState('loading')

  // Pushed into the shared context rather than read from it: the URL is the
  // source of truth here, and the bar follows it.
  const sync = useRef(null)
  useEffect(() => {
    const signature = params.toString()
    if (sync.current === signature) return
    sync.current = signature
    setDistrictId(search.districtId)
    submitKeyword(search.keyword)
    setContextFilters(search.filters)
    setContextSort(search.sort)
  }, [params, search, setDistrictId, submitKeyword, setContextFilters, setContextSort])

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        const page = await fetchApartments({ signal, ...toApiQuery({ ...search, limit }) })
        setResult(page)
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setResult({ items: [], total: 0, page: 1, pages: 0 })
        setState('error')
      }
    },
    [search, limit],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // Every change to the search is a change to the URL, and the fetch follows
  // from that — one direction, so the two can never disagree.
  const update = useCallback(
    (patch) => {
      const next = {
        districtId: search.districtId,
        keyword: search.keyword,
        filters: search.filters,
        sort: search.sort,
        // Any change but the page itself starts again from the first page:
        // staying on page four of a search that no longer has four pages is
        // how an empty screen appears with results sitting behind it.
        page: patch.page ?? 1,
        ...patch,
      }
      setParams(writeSearchParams(next), { replace: false })
      if (patch.page) window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [search, setParams],
  )

  const activeFilterCount = countFilters(search.filters)
  const isFiltered =
    Boolean(search.districtId) || Boolean(search.keyword) || activeFilterCount > 0

  const loading = state === 'loading'
  let summary
  if (state === 'error') summary = t('apartments.loadFailed')
  else if (loading) summary = t('listing.loading')
  else if (result.total === 0) summary = t('apartments.noResultsCount')
  else summary = t('apartments.foundCount', { count: result.total })

  return (
    <Container className="pb-12 pt-8 lg:pt-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold text-text-primary">{t('search.title')}</h1>
          <p className={`text-sm ${state === 'error' ? 'text-error' : 'text-text-muted'}`}>
            {summary}
            {!loading && state !== 'error' && result.pages > 1 ? (
              <span className="text-text-muted">
                {' · '}
                {t('search.pageOf', { page: result.page, pages: result.pages })}
              </span>
            ) : null}
          </p>
        </div>

        <SortDropdown sort={search.sort} onChange={(sort) => update({ sort })} />
      </div>

      <div className="mb-6">
        {/* The district belongs to the chips here: on this page it is part of
            the search being described, not a control that lives elsewhere. */}
        <FilterBar
          filters={search.filters}
          setFilters={(partial) => update({ filters: { ...search.filters, ...partial } })}
          clearFilters={() => update({ filters: EMPTY_FILTERS })}
          activeFilterCount={activeFilterCount}
          showDistrict
        />
      </div>

      {state === 'error' ? (
        <ApartmentGrid
          apartments={[]}
          loading={false}
          emptyIcon={<SearchX aria-hidden="true" size={28} />}
          emptyTitle={t('apartments.loadFailed')}
          emptyDescription={t('search.errorHint')}
          emptyActionLabel={t('analytics.retry')}
          onClearFilters={() => load()}
        />
      ) : (
        <>
          <ApartmentGrid
            apartments={result.items}
            loading={loading}
            emptyIcon={<SearchX aria-hidden="true" size={28} />}
            emptyTitle={isFiltered ? t('search.emptyTitle') : t('apartments.noResults')}
            emptyDescription={isFiltered ? t('search.emptyHint') : undefined}
            emptyActionLabel={isFiltered ? t('filters.clearAll') : undefined}
            onClearFilters={() =>
              update({ districtId: null, keyword: '', filters: EMPTY_FILTERS })
            }
          />

          {!loading ? (
            <Pagination
              page={result.page}
              pages={result.pages}
              onChange={(page) => update({ page })}
            />
          ) : null}
        </>
      )}
    </Container>
  )
}

export default SearchPage
