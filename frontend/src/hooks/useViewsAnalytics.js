import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchViewsAnalytics, toChartPoints } from '../services/analyticsApi'

/**
 * The dashboard's view timeline.
 *
 * Refetched when the tab is brought back to the front, which is when a stale
 * number is actually noticed: the owner opens their listing in another tab,
 * comes back, and expects the chart to have moved.
 *
 * Deliberately not a WebSocket. The chat socket exists because a message is
 * worthless a minute late; a view count is not, and pushing analytics through
 * it would add a subscription, a fan-out and an invalidation path to save a
 * refetch nobody was waiting on.
 */
export function useViewsAnalytics() {
  const { token } = useAuth()
  const [analytics, setAnalytics] = useState(null)
  const [points, setPoints] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error

  // Only the first load shows a spinner. A refetch swapping the chart for a
  // placeholder would make returning to the tab look like a page reload.
  const hasLoaded = useRef(false)

  const load = useCallback(
    async (signal) => {
      if (!token) return
      if (!hasLoaded.current) setStatus('loading')
      try {
        const next = await fetchViewsAnalytics({ token, signal })
        if (signal?.aborted) return
        setAnalytics(next)
        setPoints(toChartPoints(next))
        setStatus('ready')
        hasLoaded.current = true
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return
        // A failed refresh keeps the numbers already on screen; only a failed
        // first load has nothing to show.
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

  return {
    analytics,
    points,
    status,
    totalViews: analytics?.totalViews ?? 0,
    // Nothing published, or published but never opened by anyone. Either way
    // there is no line to draw.
    isEmpty: status === 'ready' && (points.length === 0 || (analytics?.totalViews ?? 0) === 0),
    reload: load,
  }
}
