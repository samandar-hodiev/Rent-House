import { useCallback, useRef, useState } from 'react'
import { Archive, ArchiveRestore, MoreVertical, Pin, PinOff, Trash2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useDismiss } from '../../hooks/useDismiss'

/**
 * The per-conversation actions menu.
 *
 * Lives on the row it acts on, so there is never a question of which thread a
 * menu item applies to. It is a sibling of the row's button rather than a child
 * of it — a button inside a button is invalid, and clicking the menu would
 * otherwise also open the conversation behind it.
 */
function ConversationMenu({ conversation, onPin, onArchive, onDelete }) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)

  // Every item closes the menu first: the actions that follow open a dialog or
  // reorder the list, and a menu left hanging over either looks like a bug.
  const run = (action) => (event) => {
    event.stopPropagation()
    close()
    action()
  }

  const itemClass =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((open) => !open)
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('chat.conversationActions')}
        title={t('chat.conversationActions')}
        className="flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreVertical aria-hidden="true" size={16} />
      </button>

      {isOpen ? (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(15,23,42,0.16)]"
        >
          <button type="button" role="menuitem" onClick={run(onPin)} className={itemClass}>
            {conversation.isPinned ? (
              <PinOff aria-hidden="true" size={15} className="shrink-0" />
            ) : (
              <Pin aria-hidden="true" size={15} className="shrink-0" />
            )}
            {conversation.isPinned ? t('chat.unpin') : t('chat.pin')}
          </button>

          <button type="button" role="menuitem" onClick={run(onArchive)} className={itemClass}>
            {conversation.isArchived ? (
              <ArchiveRestore aria-hidden="true" size={15} className="shrink-0" />
            ) : (
              <Archive aria-hidden="true" size={15} className="shrink-0" />
            )}
            {conversation.isArchived ? t('chat.unarchive') : t('chat.archive')}
          </button>

          {/* Set apart and coloured, because it is the only one here that
              destroys something. */}
          <button
            type="button"
            role="menuitem"
            onClick={run(onDelete)}
            className={`${itemClass} mt-1 border-t border-border pt-2 text-error hover:bg-error/10 hover:text-error`}
          >
            <Trash2 aria-hidden="true" size={15} className="shrink-0" />
            {t('chat.deleteConversation')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default ConversationMenu
