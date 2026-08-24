import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'

// Long enough to read a sentence, short enough not to sit over the page.
const DISMISS_MS = 4000

const ToastContext = createContext(null)

/**
 * Short confirmations of something that already happened.
 *
 * Separate from the chat's message cards, which announce something arriving
 * from elsewhere and need a name, an avatar and somewhere to go. This is the
 * other kind: the reader did a thing, the thing worked, and the interface says
 * so and gets out of the way.
 *
 * Held above the router so a toast survives the navigation that usually
 * follows — moving a listing to another state sends the reader to that state's
 * page, and the confirmation has to outlive the route change to be read at all.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message) => {
    // A counter would do, but two toasts raised in the same tick would collide
    // on it; the timestamp plus a random suffix will not.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((current) => [...current, { id, message }])
  }, [])

  // A timer per toast rather than one shared: a card raised later must not be
  // cut short by an earlier one's deadline.
  useEffect(() => {
    if (toasts.length === 0) return undefined
    const timers = toasts.map((toast) => setTimeout(() => dismiss(toast.id), DISMISS_MS))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0
        ? createPortal(
            <div
              // `pointer-events-none` on the stack and `auto` on each card, so
              // the gaps between them do not swallow clicks meant for the page.
              className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
              role="region"
              aria-label="Bildirishnomalar"
            >
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  role="status"
                  className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-primary/30 bg-surface p-3 shadow-[0_4px_16px_rgba(15,23,42,0.18)]"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary-hover dark:text-primary">
                    <Check aria-hidden="true" size={13} strokeWidth={3} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-text-primary">{toast.message}</p>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    aria-label="Yopish"
                    className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
