import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Archive, Ban, MoreVertical, ShieldCheck, Trash2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useDismiss } from '../../hooks/useDismiss'

// Roughly what the menu occupies. Used only to decide which way it opens, so an
// approximation is enough — the real height is measured once it is on screen.
const ESTIMATED_HEIGHT = 132

/**
 * The chat header's actions menu.
 *
 * Three actions, and the same three the conversation's own row offers minus
 * pinning: blocking, archiving, deleting. They are wired to the same context
 * methods and open the same dialogs as the sidebar, so there is one archive and
 * one delete in the application, reachable from two places.
 *
 * It opens downward when there is room below and upward when there is not, so
 * the menu is never cut off by the bottom of the window. The chat panel is
 * often near the bottom of the viewport, which is exactly where a
 * downward-only menu disappears.
 */
function ChatHeaderMenu({ isBlocked, onBlock, onUnblock, onArchive, onDelete }) {
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

  // The neutral action's styling, so the two restrictive ones are the ones that
  // stand out rather than the whole menu being red.
  const neutralItem =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
  const restrictiveItem =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-error transition-colors hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'

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
            <button type="button" role="menuitem" onClick={run(onUnblock)} className={neutralItem}>
              <ShieldCheck aria-hidden="true" size={15} className="shrink-0" />
              {t('chat.unblock')}
            </button>
          ) : (
            // Restrictive rather than destructive — it takes nothing away and
            // can be undone — but still set apart from an ordinary action.
            <button type="button" role="menuitem" onClick={run(onBlock)} className={restrictiveItem}>
              <Ban aria-hidden="true" size={15} className="shrink-0" />
              {t('chat.block')}
            </button>
          )}

          {/* Neutral: archiving hides a thread from one list and puts it in
              another, and undoes in a click. */}
          <button type="button" role="menuitem" onClick={run(onArchive)} className={neutralItem}>
            <Archive aria-hidden="true" size={15} className="shrink-0" />
            {t('chat.archive')}
          </button>

          {/* Destructive, and last: separated by a rule so it is not reached by
              a slipped finger aimed at the item above. */}
          <button
            type="button"
            role="menuitem"
            onClick={run(onDelete)}
            className={`${restrictiveItem} mt-1 border-t border-border pt-2`}
          >
            <Trash2 aria-hidden="true" size={15} className="shrink-0" />
            {t('chat.deleteConversation')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default ChatHeaderMenu
