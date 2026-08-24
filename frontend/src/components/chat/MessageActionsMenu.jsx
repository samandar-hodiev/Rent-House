import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckSquare, CornerUpLeft, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useDismiss } from '../../hooks/useDismiss'

const MENU_WIDTH = 176
// Enough for the four items and the rule above the last one. Measured after
// mount; this only decides which way it opens on the first frame.
const ESTIMATED_HEIGHT = 168
const GAP = 4
const EDGE = 8

/**
 * One message's actions, behind a single button.
 *
 * Reply, Select, Edit and Delete used to sit beside every bubble at once, which
 * put four controls of very different weight — one of them destructive — at
 * equal prominence on every row. Collapsed to one button, the bubble is the
 * thing being read and the actions are a step away.
 *
 * Which actions appear is unchanged from when they were buttons: replying to
 * and selecting are things anyone in the thread may do, while editing and
 * withdrawing belong to a message's author, and editing only makes sense for
 * text — swapping the file under an attachment would leave the two people
 * looking at different things.
 *
 * The menu is portalled to the body and positioned in viewport coordinates.
 * Rendered in place it was clipped by the scrollback — an element that scrolls
 * cuts off whatever leaves it — and it stacked below the conversation list
 * beside it, because a z-index only competes within its own stacking context.
 * Out at the body there is no ancestor to be trapped by, and the only thing
 * left to get right is the arithmetic below.
 */
function MessageActionsMenu({ isMine, isText, onSurface, onReply, onSelect, onEdit, onDelete }) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const close = useCallback(() => setIsOpen(false), [])
  // Both elements count as "inside": the menu is no longer a descendant of the
  // button, so a click on an item would otherwise read as a click outside and
  // close the menu before the item's own handler ran.
  const dismissRefs = useMemo(() => [buttonRef, menuRef], [])
  useDismiss(dismissRefs, isOpen, close)

  // Placed before paint, so it never appears in one spot and jumps to another.
  const place = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const height = menuRef.current?.offsetHeight ?? ESTIMATED_HEIGHT

    // Below the button when there is room, above it when there is not.
    const below = rect.bottom + GAP
    const top =
      below + height <= window.innerHeight - EDGE ? below : Math.max(EDGE, rect.top - GAP - height)

    // Aligned to the button's right edge, growing left — flipped when that
    // would run off, which is the case for an incoming message near the left
    // of a narrow window. Clamped either way so it can never leave the
    // viewport.
    let left = rect.right - MENU_WIDTH
    if (left < EDGE) left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - EDGE)
    left = Math.max(EDGE, Math.min(left, window.innerWidth - MENU_WIDTH - EDGE))

    setPosition({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null)
      return undefined
    }
    place()

    // Fixed coordinates are a snapshot: scrolling the thread or resizing the
    // window moves the bubble and would leave the menu behind. Closing is the
    // honest response — the anchor the reader aimed at is no longer where they
    // aimed.
    const onScroll = () => close()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [isOpen, place, close])

  // Re-placed once the real height is known, which matters when the estimate
  // and the rendered menu differ (two items rather than four).
  useEffect(() => {
    if (isOpen && menuRef.current) place()
  }, [isOpen, place])

  const run = (action) => (event) => {
    event.stopPropagation()
    close()
    action()
  }

  const item =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
  const destructiveItem =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-error transition-colors hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((open) => !open)
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('chat.messageActions')}
        title={t('chat.messageActions')}
        className={`absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-md transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          // One branch or the other rather than `opacity-0` plus an override:
          // two opacity utilities in one class list are resolved by their
          // order in the stylesheet, not here.
          isOpen
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100'
        } ${
          onSurface
            ? 'text-white/70 hover:bg-white/20 hover:text-white'
            : 'text-text-muted hover:bg-surface hover:text-text-primary'
        }`}
      >
        <MoreVertical aria-hidden="true" size={14} />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              onClick={(event) => event.stopPropagation()}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                width: MENU_WIDTH,
                // Hidden for the frame before it is placed, so it is never
                // painted at the top-left corner first.
                visibility: position ? 'visible' : 'hidden',
              }}
              className="fixed z-[80] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(15,23,42,0.16)]"
            >
              {/* Anyone in the thread may reply to anything, their own words
                  included: adding to what you already said is as ordinary as
                  answering someone else. */}
              <button type="button" role="menuitem" onClick={run(onReply)} className={item}>
                <CornerUpLeft aria-hidden="true" size={15} className="shrink-0" />
                {t('chat.reply')}
              </button>

              {/* The way into selection mode, from either side's messages. */}
              <button type="button" role="menuitem" onClick={run(onSelect)} className={item}>
                <CheckSquare aria-hidden="true" size={15} className="shrink-0" />
                {t('chat.selectMessages')}
              </button>

              {isMine && isText ? (
                <button type="button" role="menuitem" onClick={run(onEdit)} className={item}>
                  <Pencil aria-hidden="true" size={15} className="shrink-0" />
                  {t('chat.edit')}
                </button>
              ) : null}

              {/* Destructive, and last: set apart by a rule so it is not
                  reached by a slipped finger aimed at the item above. */}
              {isMine ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(onDelete)}
                  className={`${destructiveItem} mt-1 border-t border-border pt-2`}
                >
                  <Trash2 aria-hidden="true" size={15} className="shrink-0" />
                  {t('chat.delete')}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export default MessageActionsMenu
