import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import ChatConversationList from '../components/chat/ChatConversationList'
import ChatThread from '../components/chat/ChatThread'
import EmptyState from '../components/EmptyState'
import { useChat } from '../context/ChatContext'
import { useLocale } from '../context/LocaleContext'

// Two panels side by side from `md:` up. Below that only one is mounted at a
// time — the list, or the selected thread with a back button.
function DashboardChatsPage() {
  const { t } = useLocale()
  const { conversations, markRead, sendMessage } = useChat()
  const [searchParams, setSearchParams] = useSearchParams()

  // The selection lives in the URL (`?c=<id>`) rather than in component state,
  // so the mobile back gesture, the browser back button and a shared/reloaded
  // link all behave the way the user expects.
  const requestedId = searchParams.get('c')
  const selected = conversations.find((conversation) => conversation.id === requestedId) ?? null

  const select = useCallback(
    (conversationId) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('c', conversationId)
        return next
      })
    },
    [setSearchParams],
  )

  const clearSelection = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('c')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  // Opening a conversation clears its badge here, in the sidebar and in the
  // public header at once, since all three read the same context.
  useEffect(() => {
    if (selected) markRead(selected.id)
  }, [selected, markRead])

  const handleSend = useCallback(
    (text) => {
      if (selected) sendMessage(selected.id, text)
    },
    [selected, sendMessage],
  )

  return (
    // Fills the dashboard main area exactly: viewport minus the 4rem header
    // and the main padding, so only the panels scroll and the page does not.
    <section className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-md border border-border bg-surface sm:h-[calc(100vh-7rem)]">
      <h1 className="sr-only">{t('chat.title')}</h1>

      <div
        className={`min-w-0 flex-col border-border md:flex md:w-80 md:shrink-0 md:border-r ${
          selected ? 'hidden' : 'flex w-full'
        }`}
      >
        <ChatConversationList
          conversations={conversations}
          activeId={selected?.id ?? null}
          onSelect={select}
        />
      </div>

      <div className={`min-w-0 flex-1 flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected ? (
          <ChatThread conversation={selected} onSend={handleSend} onBack={clearSelection} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <EmptyState
              icon={<MessageSquare aria-hidden="true" size={28} />}
              title={t('chat.selectConversation')}
              description={t('chat.selectConversationHint')}
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default DashboardChatsPage
