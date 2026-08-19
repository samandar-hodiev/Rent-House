import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { getLastMessage, messageTextKey } from '../../data/conversations'
import ChatConversationItem from './ChatConversationItem'

// Left panel: title, search field and the scrollable conversation list.
function ChatConversationList({ conversations, activeId, onSelect }) {
  const { t } = useLocale()
  const searchId = useId()
  const [query, setQuery] = useState('')

  // Matches the participant name and the last-message preview, so searching
  // works the same way whether the user remembers who or what.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return conversations
    return conversations.filter((conversation) => {
      const lastMessage = getLastMessage(conversation)
      const preview = lastMessage
        ? lastMessage.text ?? t(messageTextKey(conversation.id, lastMessage.id))
        : ''
      return (
        conversation.name.toLowerCase().includes(needle) ||
        preview.toLowerCase().includes(needle)
      )
    })
  }, [conversations, query, t])

  // Newest activity first. Deliberately not "unread first": that would make the
  // list jump the moment a badge clears, right under the pointer that cleared
  // it. Unread rows stay distinguishable by weight and badge instead.
  const ordered = useMemo(
    () =>
      [...visible].sort(
        (a, b) =>
          new Date(getLastMessage(b)?.sentAt ?? 0) - new Date(getLastMessage(a)?.sentAt ?? 0),
      ),
    [visible],
  )

  return (
    <>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold text-text-primary">{t('chat.title')}</h1>

        <div className="relative mt-3">
          <label htmlFor={searchId} className="sr-only">
            {t('chat.searchPlaceholder')}
          </label>
          <Search
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('chat.searchPlaceholder')}
            className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* The panel scrolls on its own so the search field stays put. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {ordered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-text-muted">{t('chat.noResults')}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {ordered.map((conversation) => (
              <li key={conversation.id}>
                <ChatConversationItem
                  conversation={conversation}
                  isActive={conversation.id === activeId}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default ChatConversationList
