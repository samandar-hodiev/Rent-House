import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useChat } from '../../context/ChatContext'
import { useConversation } from '../../hooks/useConversation'
import { SOCKET_STATUS } from '../../services/chatSocket'
import UserAvatar from '../dashboard/UserAvatar'
import { fetchAttachmentLimits } from '../../services/chatApi'
import ChatComposer from './ChatComposer'
import ChatMessage from './ChatMessage'
import ImageLightbox from './ImageLightbox'
import DeleteMessageDialog from './DeleteMessageDialog'

/**
 * One open conversation: header, scrollback, composer.
 *
 * The same component behind the apartment-detail modal and the dashboard, which
 * is what makes those one chat rather than two that happen to look alike. It
 * takes a conversation and renders it; where it is mounted is the caller's
 * business.
 */
function ChatThread({ conversation, className = '' }) {
  const { t } = useLocale()
  const { socketStatus } = useChat()
  const {
    messages,
    myId,
    isLoading,
    status,
    hasMore,
    loadingOlder,
    loadOlder,
    sending,
    sendError,
    clearSendError,
    send,
    sendFile,
    edit,
    remove,
  } = useConversation(conversation?.id)

  const [pendingDelete, setPendingDelete] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [limits, setLimits] = useState(null)

  // What the server accepts, read once so the picker's filter and the size
  // check come from the side that enforces them.
  useEffect(() => {
    const controller = new AbortController()
    fetchAttachmentLimits({ signal: controller.signal })
      .then(setLimits)
      .catch(() => setLimits(null))
    return () => controller.abort()
  }, [])
  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  // Whether the reader is at the bottom. Scrolling them down while they are
  // reading older messages would yank the thread out from under them.
  const pinnedToBottom = useRef(true)

  const handleScroll = () => {
    const node = scrollRef.current
    if (!node) return
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    pinnedToBottom.current = distance < 80
  }

  useEffect(() => {
    if (pinnedToBottom.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages])

  const handleSendText = async (text) => {
    pinnedToBottom.current = true
    return send(text)
  }

  const handleSendFile = (options) => {
    pinnedToBottom.current = true
    return sendFile(options)
  }

  const handleDelete = async (scope) => {
    const message = pendingDelete
    setPendingDelete(null)
    if (message) await remove(message.id, scope)
  }

  if (!conversation) return null

  const other = conversation.other

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <UserAvatar name={other.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{other.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${
                other.online ? 'bg-primary' : 'bg-text-muted/40'
              }`}
            />
            {other.online ? t('chat.online') : t('chat.offline')}
          </p>
        </div>
      </div>

      {/* The connection banner appears only when something is wrong, so a
          healthy chat carries no chrome about being healthy. */}
      {socketStatus === SOCKET_STATUS.reconnecting || socketStatus === SOCKET_STATUS.connecting ? (
        <p
          role="status"
          className="shrink-0 bg-warning/10 px-4 py-1.5 text-center text-xs text-warning"
        >
          {socketStatus === SOCKET_STATUS.connecting ? t('chat.connecting') : t('chat.reconnecting')}
        </p>
      ) : null}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
            <Loader2 aria-hidden="true" size={16} className="animate-spin" />
            {t('chat.loading')}
          </p>
        ) : status === 'error' ? (
          <p role="alert" className="py-8 text-center text-sm text-error">
            {t('chat.loadFailed')}
          </p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">{t('chat.empty')}</p>
        ) : (
          <>
            {hasMore ? (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                >
                  {loadingOlder ? (
                    <Loader2 aria-hidden="true" size={12} className="animate-spin" />
                  ) : null}
                  {t('chat.loadOlder')}
                </button>
              </div>
            ) : null}

            <ul className="flex flex-col gap-2">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isMine={message.senderId === myId}
                  onEdit={edit}
                  onDelete={setPendingDelete}
                  onOpenImage={setLightbox}
                />
              ))}
            </ul>
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {sendError ? (
        <p role="alert" className="flex items-center justify-between gap-2 border-t border-border px-4 pt-2 text-xs text-error">
          {t('chat.sendFailed')}
          <button
            type="button"
            onClick={clearSendError}
            className="font-medium underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('chat.dismiss')}
          </button>
        </p>
      ) : null}

      <ChatComposer
        onSendText={handleSendText}
        onSendFile={handleSendFile}
        sending={sending}
        limits={limits}
      />

      {lightbox ? <ImageLightbox image={lightbox} onClose={() => setLightbox(null)} /> : null}

      {pendingDelete ? (
        <DeleteMessageDialog
          onCancel={() => setPendingDelete(null)}
          onDeleteForMe={() => handleDelete('me')}
          onDeleteForEveryone={() => handleDelete('everyone')}
        />
      ) : null}
    </div>
  )
}

export default ChatThread
