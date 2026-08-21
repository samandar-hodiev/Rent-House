import { Loader2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useChat } from '../../context/ChatContext'
import { formatMessageTime } from '../../utils/formatChatTime'
import UserAvatar from '../dashboard/UserAvatar'

/**
 * The threads a user is in, most recently active first.
 *
 * Reads the shared chat state rather than fetching, so a message arriving over
 * the socket reorders this list and moves its badge without a request.
 */
function ChatConversationList({ activeId, onSelect }) {
  const { t, locale } = useLocale()
  const { conversations, isLoading, status } = useChat()

  if (isLoading && conversations.length === 0) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-text-muted">
        <Loader2 aria-hidden="true" size={16} className="animate-spin" />
        {t('chat.loading')}
      </p>
    )
  }

  if (status === 'error' && conversations.length === 0) {
    return (
      <p role="alert" className="p-4 text-sm text-error">
        {t('chat.loadFailed')}
      </p>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col gap-1 p-4">
        <p className="text-sm font-medium text-text-primary">{t('chat.noConversations')}</p>
        <p className="text-sm text-text-muted">{t('chat.noConversationsHint')}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeId
        const last = conversation.lastMessage

        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation)}
              aria-current={isActive}
              className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
              }`}
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
                  <span className="truncate text-sm font-medium text-text-primary">
                    {conversation.other.name}
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
          </li>
        )
      })}
    </ul>
  )
}

export default ChatConversationList
