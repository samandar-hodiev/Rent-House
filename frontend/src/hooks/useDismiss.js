import { useEffect } from 'react'

// `ref` may be a single ref or an array of refs — an array is needed when the
// popover is portalled out of its trigger's DOM subtree (e.g. the Map page's
// mobile filter sheet), so clicks inside either element still count as
// "inside". Pass a stable array (useMemo) to avoid re-subscribing each render.
export function useDismiss(ref, isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined

    const refs = Array.isArray(ref) ? ref : [ref]

    const handlePointerDown = (event) => {
      const mounted = refs.filter((item) => item.current)
      // Nothing rendered yet — same as before, don't treat that as "outside".
      if (mounted.length === 0) return
      if (!mounted.some((item) => item.current.contains(event.target))) {
        onClose()
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [ref, isOpen, onClose])
}
