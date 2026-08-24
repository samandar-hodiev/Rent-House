import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { CheckSquare, CornerUpLeft, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useDismiss } from '../../hooks/useDismiss'

// Roughly what the menu occupies, used only to pick which way it opens. The
// same approach the header and conversation menus take.
const ESTIMATED_HEIGHT = 168
const ESTIMATED_WIDTH = 176

/**
 * One message's actions, behind a single button.
 *
 * Reply, Select, Edit and Delete used to sit beside every bubble at once, which
 * put four controls of very different weight — one of them destructive — at
 * equal prominence on every row. Collapsed to one button, the bubble is the
 * thing being read and the actions are a step away.
 *
 * Which actions appear is unchanged from when they were buttons: replying to
 * and selecting a message are things anyone in the thread may do, while editing
 * and withdrawing belong to its author, and editing only makes sense for text —
 * swapping the file under an attachment would leave the two people looking at
 * different things.
 *
 * It flips both ways rather than only down. A bubble can sit at the bottom of
 * the panel, and an incoming one can sit close enough to the left edge that a
 * right-anchored menu would run off it.
 */
function MessageActionsMenu({ isMine, isText, onSurface, onReply, onSelect, onEdit, onDelete }) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [anchorRight, setAnchorRight] = useState(true)
  const containerRef = useRef(null)
  const buttonRef = useRef(null)

  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)

  // Measured before paint, so the menu never appears in one place and jumps.
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()

    // The message list scrolls, and an element that scrolls clips what leaves
    // it. So the room below is the room inside the scrollback, not the room in
    // the window — measuring against the window would open a menu downward
    // into an edge that cuts it off.
    const scroller = buttonRef.current.closest('[data-chat-scroll]')
    const bottomLimit = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
    setOpenUpward(bottomLimit - rect.bottom < ESTIMATED_HEIGHT + 16)
    // Anchored to its right edge — growing leftwards — unless there is not
    // enough room that way, which is the case for an incoming message near the
    // left of a narrow screen.
    setAnchorRight(rect.right >= ESTIMATED_WIDTH + 8)
  }, [isOpen])

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
    <div ref={containerRef} className="absolute right-1 top-1 z-10">
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
        // Faint until wanted: it sits on top of the bubble, so it earns
        // attention on hover, on focus, while open — and always on a touch
        // screen, where there is no hover to reveal it.
        className={`flex size-6 items-center justify-center rounded-md transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          // Written as one branch or the other rather than as `opacity-0` plus
          // an override: two opacity utilities in the same class list are
          // resolved by their order in the stylesheet, not here, so the
          // override would not reliably win.
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

      {isOpen ? (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className={`absolute z-30 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(15,23,42,0.16)] ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${anchorRight ? 'right-0' : 'left-0'}`}
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

          {/* Destructive, and last: set apart by a rule so it is not reached by
              a slipped finger aimed at the item above. */}
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
        </div>
      ) : null}
    </div>
  )
}

export default MessageActionsMenu
