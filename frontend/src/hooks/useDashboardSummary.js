import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchDashboardSummary } from '../services/favoritesApi'

/**
 * The dashboard's counters and its two short lists.
 *
 * One request rather than four, and refetched when the tab is brought back to
 * the front — publishing a listing, saving an apartment or reading a message
 * all happen elsewhere, and coming back to the dashboard is when a stale figure
 * would be noticed.
 */
export function useDashboardSummary() {
  const { token } = useAuth()
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error

  // Only the first load shows a spinner; a refetch swapping the page for a
  // placeholder would make returning to the tab look like a reload.
  const hasLoaded = useRef(false)

  const load = useCallback(
    async (signal) => {
      if (!token) return
      if (!hasLoaded.current) setStatus('loading')
      try {
        const next = await fetchDashboardSummary({ token, signal })
        if (signal?.aborted) return
        setSummary(next)
        setStatus('ready')
        hasLoaded.current = true
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return
        // A failed refresh keeps what is already on screen; only a failed first
        // load has nothing to show.
        if (!hasLoaded.current) setStatus('error')
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (!token) return undefined
    const refresh = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [token, load])

  return { summary, status, reload: load }
}
