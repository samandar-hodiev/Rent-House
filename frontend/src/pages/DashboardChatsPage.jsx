import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import ChatConversationList from '../components/chat/ChatConversationList'
import ChatThread from '../components/chat/ChatThread'
import EmptyState from '../components/EmptyState'
import { useChat } from '../context/ChatContext'
import { useLocale } from '../context/LocaleContext'

// Two panels side by side from `md:` up. Below that only one is mounted at a
// time — the list, or the selected thread with a back button.
function DashboardChatsPage() {
  const { t } = useLocale()
  const { conversations, archivedConversations } = useChat()
  const [searchParams, setSearchParams] = useSearchParams()

  // The selection lives in the URL (`?c=<id>`) rather than in component state,
  // so the mobile back gesture, the browser back button and a shared/reloaded
  // link all behave the way the user expects.
  const requestedId = searchParams.get('c')
  // Both lists: opening an archived thread must work, and a thread the other
  // side just withdrew leaves both — at which point `selected` becomes null and
  // the panel closes on its own rather than showing a thread that is gone.
  const selected =
    [...conversations, ...archivedConversations].find(
      (conversation) => conversation.id === requestedId,
    ) ?? null

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

  // Marking a thread read is ChatThread's job: it has to tell the server as
  // well as clear the badge, and the modal needs exactly the same behaviour.

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
          activeId={selected?.id ?? null}
          onSelect={(conversation) => select(conversation.id)}
        />
      </div>

      <div className={`min-w-0 flex-1 flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected ? (
          <>
            {/* Below `md:` the thread replaces the list, so it needs its own
                way back to it. */}
            <button
              type="button"
              onClick={clearSelection}
              className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              {t('chat.backToList')}
            </button>
            <ChatThread conversation={selected} className="flex-1" />
          </>
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
