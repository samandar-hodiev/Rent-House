import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CONVERSATIONS, getLastMessage } from '../data/conversations'

const ChatContext = createContext(null)

// Holds the demo conversations so the chat page, the sidebar badge and the
// public header's chat icon all read the same unread count — opening a
// conversation clears its badge everywhere at once. In-memory only: nothing is
// persisted and no request is sent, this is the seam a messaging API replaces.
export function ChatProvider({ children }) {
  const [conversations, setConversations] = useState(CONVERSATIONS)

  const markRead = useCallback((conversationId) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId && conversation.unreadCount > 0
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    )
  }, [])

  const sendMessage = useCallback((conversationId, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation
        const lastId = getLastMessage(conversation)?.id ?? 0
        return {
          ...conversation,
          unreadCount: 0,
          messages: [
            ...conversation.messages,
            { id: lastId + 1, from: 'me', text: trimmed, sentAt: new Date().toISOString() },
          ],
        }
      }),
    )
  }, [])

  const unreadTotal = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  )

  const value = useMemo(
    () => ({ conversations, unreadTotal, markRead, sendMessage }),
    [conversations, unreadTotal, markRead, sendMessage],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) throw new Error('useChat must be used inside ChatProvider')
  return context
}
