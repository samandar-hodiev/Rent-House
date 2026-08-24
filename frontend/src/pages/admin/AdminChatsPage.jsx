import { useState } from 'react'
import { MessageSquare, ShieldAlert } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, formatDateTime,
} from '../../components/admin/adminUi'
import { CHATS, CHAT_MESSAGES } from '../../mock/admin'

/**
 * Conversations, for moderation.
 *
 * Read-only by construction: there is no composer anywhere on this page, so an
 * administrator cannot write in somebody else's name even by accident. The
 * preview says so out loud too, because "why can't I reply" is a question worth
 * answering before it is asked.
 */
function AdminChatsPage() {
  const [openId, setOpenId] = useState(null)
  const conversation = CHATS.find((chat) => chat.id === openId) ?? null
  const messages = conversation ? (CHAT_MESSAGES[conversation.id] ?? []) : []

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title="Chats" description={`${CHATS.length} conversations.`} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <AdminCard>
          <AdminTable
            headers={['Buyer', 'Seller', 'Listing', 'Last Message', 'Date', 'Status', 'Actions']}
            empty={
              CHATS.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<MessageSquare aria-hidden="true" size={28} />}
                    title="No conversations"
                    description="Conversations between buyers and owners will appear here."
                  />
                </div>
              ) : null
            }
          >
            {CHATS.map((chat) => (
              <Row key={chat.id}>
                <Cell className="whitespace-nowrap text-text-primary">{chat.buyer.name}</Cell>
                <Cell className="whitespace-nowrap text-text-secondary">{chat.seller.name}</Cell>
                <Cell>
                  <span className="block max-w-[180px] truncate text-text-secondary">
                    {chat.listing.title}
                  </span>
                </Cell>
                <Cell>
                  <span className="block max-w-[200px] truncate text-text-secondary">
                    {chat.lastMessage}
                  </span>
                </Cell>
                <Cell className="whitespace-nowrap text-text-secondary">
                  {formatDateTime(chat.at)}
                </Cell>
                <Cell><StatusBadge status={chat.status} /></Cell>
                <Cell>
                  <MockButton onClick={() => setOpenId(chat.id)}>View</MockButton>
                </Cell>
              </Row>
            ))}
          </AdminTable>
        </AdminCard>

        <AdminCard title="Conversation preview">
          {conversation ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-2.5 border-b border-border p-3">
                <UserAvatar name={conversation.buyer.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {conversation.buyer.name} · {conversation.seller.name}
                  </span>
                  <span className="block truncate text-[11px] text-text-muted">
                    {conversation.listing.title}
                  </span>
                </span>
              </div>

              <ul className="chat-scroll flex max-h-80 flex-col gap-2 overflow-y-auto p-3">
                {messages.length === 0 ? (
                  <li className="py-6 text-center text-sm text-text-muted">
                    No messages in this conversation.
                  </li>
                ) : (
                  messages.map((message) => (
                    <li
                      key={message.id}
                      className={`flex ${message.from === 'buyer' ? 'justify-start' : 'justify-end'}`}
                    >
                      <span
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          message.from === 'seller'
                            ? 'bg-primary text-white'
                            : 'border border-border bg-surface-secondary text-text-primary'
                        }`}
                      >
                        {message.body}
                        <span
                          className={`mt-1 block text-[11px] ${
                            message.from === 'seller' ? 'text-white/70' : 'text-text-muted'
                          }`}
                        >
                          {message.at}
                        </span>
                      </span>
                    </li>
                  ))
                )}
              </ul>

              <p className="flex items-center gap-2 border-t border-border p-3 text-xs text-text-muted">
                <ShieldAlert aria-hidden="true" size={14} className="shrink-0" />
                Read-only. Admins cannot send messages on behalf of a user.
              </p>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-text-muted">
              Select a conversation to preview it.
            </p>
          )}
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminChatsPage
