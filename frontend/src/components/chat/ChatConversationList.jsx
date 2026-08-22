import { useMemo, useState } from 'react'
import { Archive, ArrowLeft, Loader2, Pin, Search, X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useChat } from '../../context/ChatContext'
import { formatMessageTime } from '../../utils/formatChatTime'
import UserAvatar from '../dashboard/UserAvatar'
import ConversationMenu from './ConversationMenu'
import { ArchiveConversationDialog, DeleteConversationDialog } from './ConversationDialogs'

/**
 * The threads a user is in, most recently active first with pinned ones above.
 *
 * Reads the shared chat state rather than fetching, so a message arriving over
 * the socket reorders this list and moves its badge without a request.
 */
function ChatConversationList({ activeId, onSelect }) {
  const { t, locale } = useLocale()
  const {
    conversations,
    archivedConversations,
    archivedStatus,
    isLoading,
    status,
    setPinned,
    setArchived,
    removeConversation,
  } = useChat()

  const [query, setQuery] = useState('')
  const [showArchive, setShowArchive] = useState(false)
  // { conversation, kind: 'archive' | 'delete' }
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const source = showArchive ? archivedConversations : conversations

  /**
   * Filtering happens here rather than on the server.
   *
   * The list is already loaded whole — it is one person's conversations, not a
   * feed — so matching in memory is instant and costs no requests at all. That
   * is a better answer than a debounced round trip per keystroke, which is what
   * a server-side search would need in order to feel the same.
   */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return source
    return source.filter((conversation) => {
      const haystack = [
        conversation.other.name,
        conversation.apartment.title,
        conversation.lastMessage?.isDeleted ? '' : (conversation.lastMessage?.body ?? ''),
      ]
      return haystack.some((value) => value.toLowerCase().includes(needle))
    })
  }, [source, query])

  const act = async (run) => {
    setBusy(true)
    setActionError(null)
    try {
      await run()
      setPending(null)
    } catch {
      setActionError(t('chat.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const listStatus = showArchive ? archivedStatus : status
  const showSpinner = showArchive ? archivedStatus === 'loading' : isLoading && conversations.length === 0

  const header = (
    <div className="shrink-0 border-b border-border p-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('chat.searchPlaceholder')}
          aria-label={t('chat.searchPlaceholder')}
          className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('chat.clearSearch')}
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setShowArchive((open) => !open)
          setQuery('')
        }}
        className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {showArchive ? (
          <ArrowLeft aria-hidden="true" size={14} className="shrink-0" />
        ) : (
          <Archive aria-hidden="true" size={14} className="shrink-0" />
        )}
        {showArchive ? t('chat.backToInbox') : t('chat.archived')}
      </button>
    </div>
  )

  const body = () => {
    if (showSpinner) {
      return (
        <p className="flex items-center gap-2 p-4 text-sm text-text-muted">
          <Loader2 aria-hidden="true" size={16} className="animate-spin" />
          {t('chat.loading')}
        </p>
      )
    }

    if (listStatus === 'error' && source.length === 0) {
      return (
        <p role="alert" className="p-4 text-sm text-error">
          {t('chat.loadFailed')}
        </p>
      )
    }

    // A search that matched nothing is a different situation from having no
    // conversations, and saying "you have no conversations" to someone who has
    // several would be wrong.
    if (visible.length === 0) {
      const [title, hint] = query
        ? [t('chat.noSearchResults'), t('chat.noSearchResultsHint')]
        : showArchive
          ? [t('chat.noArchived'), t('chat.noArchivedHint')]
          : [t('chat.noConversations'), t('chat.noConversationsHint')]
      return (
        <div className="flex flex-col gap-1 p-4">
          <p className="text-sm font-medium text-text-primary">{title}</p>
          <p className="text-sm text-text-muted">{hint}</p>
        </div>
      )
    }

    return (
      <ul className="flex flex-col">
        {visible.map((conversation) => {
          const isActive = conversation.id === activeId
          const last = conversation.lastMessage

          return (
            <li
              key={conversation.id}
              // The row and its menu are siblings: a button inside a button is
              // invalid, and a click on the menu would otherwise also open the
              // conversation behind it.
              className={`flex items-center gap-1 border-b border-border pr-2 transition-colors ${
                isActive ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(conversation)}
                aria-current={isActive}
                className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span className="relative shrink-0">
                  <UserAvatar name={conversation.other.name} />
                  {/* The dot is on the avatar rather than beside the name, so a
                      long name cannot push it out of view. */}
                  {conversation.other.online ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-primary"
                    />
                  ) : null}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {conversation.isPinned ? (
                        <Pin
                          aria-label={t('chat.pinned')}
                          size={12}
                          className="shrink-0 text-primary"
                        />
                      ) : null}
                      <span className="truncate text-sm font-medium text-text-primary">
                        {conversation.other.name}
                      </span>
                    </span>
                    {last ? (
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {formatMessageTime(last.createdAt, locale)}
                      </span>
                    ) : null}
                  </span>

                  <span className="truncate text-xs text-text-muted">
                    {conversation.apartment.title}
                  </span>

                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-text-secondary">
                      {last
                        ? last.isDeleted
                          ? t('chat.messageDeleted')
                          : last.body
                        : t('chat.empty')}
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>

              <ConversationMenu
                conversation={conversation}
                onPin={() => act(() => setPinned(conversation.id, !conversation.isPinned))}
                onArchive={() => {
                  // Un-archiving needs no confirmation: it undoes something and
                  // destroys nothing.
                  if (conversation.isArchived) {
                    act(() => setArchived(conversation.id, false))
                    return
                  }
                  setActionError(null)
                  setPending({ conversation, kind: 'archive' })
                }}
                onDelete={() => {
                  setActionError(null)
                  setPending({ conversation, kind: 'delete' })
                }}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>

      {pending?.kind === 'archive' ? (
        <ArchiveConversationDialog
          busy={busy}
          error={actionError}
          onCancel={() => (busy ? undefined : setPending(null))}
          onConfirm={() => act(() => setArchived(pending.conversation.id, true))}
        />
      ) : null}

      {pending?.kind === 'delete' ? (
        <DeleteConversationDialog
          busy={busy}
          error={actionError}
          onCancel={() => (busy ? undefined : setPending(null))}
          onDeleteForMe={() => act(() => removeConversation(pending.conversation.id))}
          onDeleteForEveryone={() =>
            act(() => removeConversation(pending.conversation.id, { forEveryone: true }))
          }
        />
      ) : null}
    </div>
  )
}

export default ChatConversationList
