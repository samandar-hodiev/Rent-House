import { useLocale } from '../../context/LocaleContext'
import { messageTextKey } from '../../data/conversations'
import { formatMessageTime } from '../../utils/formatChatTime'

// One bubble. Outgoing messages sit right on the primary colour, incoming ones
// left on the secondary surface, so the two are distinguishable by side and by
// fill rather than by side alone.
function ChatMessage({ conversationId, message }) {
  const { t, locale } = useLocale()
  const isMine = message.from === 'me'
  // Locally sent messages carry plain text; seeded ones carry an i18n key.
  const text = message.text ?? t(messageTextKey(conversationId, message.id))

  return (
    <li className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 sm:max-w-[70%] ${
          isMine ? 'bg-primary text-white' : 'border border-border bg-surface-secondary'
        }`}
      >
        <p className={`whitespace-pre-wrap break-words text-sm ${isMine ? '' : 'text-text-primary'}`}>
          {text}
        </p>
        <p className={`mt-1 text-right text-[11px] ${isMine ? 'text-white/70' : 'text-text-muted'}`}>
          {formatMessageTime(message.sentAt, locale)}
        </p>
      </div>
    </li>
  )
}

export default ChatMessage
