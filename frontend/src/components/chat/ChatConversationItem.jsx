import { useLocale } from '../../context/LocaleContext'
import { getLastMessage, messageTextKey } from '../../data/conversations'
import { formatConversationTime } from '../../utils/formatChatTime'
import UserAvatar from '../dashboard/UserAvatar'

// One row in the conversation list: avatar, name, last-message preview, time
// and the unread badge.
function ChatConversationItem({ conversation, isActive, onSelect }) {
  const { t, locale } = useLocale()
  const lastMessage = getLastMessage(conversation)
  const isUnread = conversation.unreadCount > 0

  // Locally sent messages carry plain text; seeded ones carry an i18n key.
  const preview = lastMessage
    ? lastMessage.text ?? t(messageTextKey(conversation.id, lastMessage.id))
    : ''
  const previewPrefix = lastMessage?.from === 'me' ? `${t('chat.youPrefix')} ` : ''

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={isActive ? 'true' : undefined}
      className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isActive ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
      }`}
    >
      <UserAvatar name={conversation.name} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm ${
              isUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-primary'
            }`}
          >
            {conversation.name}
          </span>
          <span className="shrink-0 text-xs text-text-muted">
            {lastMessage ? formatConversationTime(lastMessage.sentAt, locale, t) : ''}
          </span>
        </span>

        <span className="mt-1 flex items-center justify-between gap-2">
          <span
            className={`truncate text-xs ${
              isUnread ? 'font-medium text-text-secondary' : 'text-text-muted'
            }`}
          >
            {previewPrefix}
            {preview}
          </span>
          {isUnread ? (
            <span
              aria-label={t('dashboard.unreadCount', { count: conversation.unreadCount })}
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
            >
              {conversation.unreadCount}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  )
}

export default ChatConversationItem
