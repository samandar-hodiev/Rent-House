import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Ban, MoreVertical, ShieldCheck } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useDismiss } from '../../hooks/useDismiss'

// Roughly what the menu occupies. Used only to decide which way it opens, so an
// approximation is enough — the real height is measured once it is on screen.
const ESTIMATED_HEIGHT = 56

/**
 * The chat header's actions menu.
 *
 * One item, deliberately: blocking. The conversation's own actions — pin,
 * archive, delete — already live on its row in the list, and repeating them
 * here would be two places to keep in step.
 *
 * It opens downward when there is room below and upward when there is not, so
 * the menu is never cut off by the bottom of the window. The chat panel is
 * often near the bottom of the viewport, which is exactly where a
 * downward-only menu disappears.
 */
function ChatHeaderMenu({ isBlocked, onBlock, onUnblock }) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const containerRef = useRef(null)
  const buttonRef = useRef(null)

  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)

  // Measured before paint, so the menu never appears in one place and jumps to
  // the other.
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setOpenUpward(window.innerHeight - rect.bottom < ESTIMATED_HEIGHT + 16)
  }, [isOpen])

  const run = (action) => (event) => {
    event.stopPropagation()
    close()
    action()
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('chat.headerActions')}
        title={t('chat.headerActions')}
        className="flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreVertical aria-hidden="true" size={16} />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className={`absolute right-0 z-30 w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(15,23,42,0.16)] ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {isBlocked ? (
            <button
              type="button"
              role="menuitem"
              onClick={run(onUnblock)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <ShieldCheck aria-hidden="true" size={15} className="shrink-0" />
              {t('chat.unblock')}
            </button>
          ) : (
            // Restrictive rather than destructive — it takes nothing away and
            // can be undone — but still set apart from an ordinary action.
            <button
              type="button"
              role="menuitem"
              onClick={run(onBlock)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-error transition-colors hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <Ban aria-hidden="true" size={15} className="shrink-0" />
              {t('chat.block')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default ChatHeaderMenu
