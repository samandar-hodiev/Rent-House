import { useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { APARTMENTS } from '../../data/apartments'
import UserAvatar from '../dashboard/UserAvatar'
import ChatApartmentPreview from './ChatApartmentPreview'
import ChatComposer from './ChatComposer'
import ChatMessage from './ChatMessage'

// Right panel: participant header, the scrolling message area with the listing
// context on top, and the composer pinned underneath.
function ChatThread({ conversation, onSend, onBack }) {
  const { t } = useLocale()
  const messagesRef = useRef(null)

  const apartment = conversation.apartmentId
    ? (APARTMENTS.find((item) => item.id === conversation.apartmentId) ?? null)
    : null

  // Jump to the newest message when the thread opens and after each send.
  useEffect(() => {
    const node = messagesRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [conversation.id, conversation.messages.length])

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
        {/* Below `md:` the thread replaces the list, so it needs a way back. */}
        <button
          type="button"
          onClick={onBack}
          aria-label={t('chat.back')}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>

        <UserAvatar name={conversation.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{conversation.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${conversation.isOnline ? 'bg-primary' : 'bg-border'}`}
            />
            {conversation.isOnline ? t('chat.online') : t('chat.offline')}
          </p>
        </div>
      </div>

      <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {apartment ? (
          <div className="mb-4">
            <ChatApartmentPreview apartment={apartment} />
          </div>
        ) : null}

        <ul className="flex flex-col gap-3">
          {conversation.messages.map((message) => (
            <ChatMessage
              key={message.id}
              conversationId={conversation.id}
              message={message}
            />
          ))}
        </ul>
      </div>

      <ChatComposer onSend={onSend} />
    </>
  )
}

export default ChatThread
