// Chat endpoints. Components call these rather than fetch directly, so the
// request shapes stay in one file next to the backend contract.
//
// The API speaks snake_case and the UI speaks camelCase; the translation lives
// here, as it does for listings.
import { request } from './apiClient'

/** Turns an API message into the shape the bubbles render. */
export function toMessage(item) {
  return {
    id: item.id,
    conversationId: item.conversation_id,
    senderId: item.sender_id,
    body: item.body,
    isRead: item.is_read,
    isEdited: item.is_edited,
    isDeleted: item.is_deleted,
    createdAt: item.created_at,
    readAt: item.read_at ?? null,
    editedAt: item.edited_at ?? null,
  }
}

/** Turns an API conversation into the shape the list and header render. */
export function toConversation(item) {
  return {
    id: item.id,
    apartment: {
      id: item.apartment?.id ?? null,
      title: item.apartment?.title ?? '',
      image: item.apartment?.image ?? null,
    },
    other: {
      id: item.other?.id ?? null,
      name: item.other?.name ?? '',
      online: Boolean(item.other?.online),
    },
    lastMessage: item.last_message
      ? {
          body: item.last_message.body ?? '',
          senderId: item.last_message.sender_id,
          isDeleted: Boolean(item.last_message.is_deleted),
          createdAt: item.last_message.created_at,
        }
      : null,
    unreadCount: item.unread_count ?? 0,
    updatedAt: item.updated_at,
  }
}

/**
 * Opens the thread about a listing, or returns the one already open.
 *
 * Safe to call every time the modal opens: the backend keys the thread on
 * (apartment, enquirer) and returns the existing one rather than a second.
 */
export async function startConversation(apartmentId, { token, signal } = {}) {
  const data = await request('/conversations', {
    method: 'POST',
    body: { apartment_id: apartmentId },
    token,
    signal,
  })
  return toConversation(data)
}

/** The signed-in user's threads, plus the badge total. */
export async function fetchConversations({ token, signal } = {}) {
  const data = await request('/conversations', { token, signal })
  return {
    items: (data.items ?? []).map(toConversation),
    unreadTotal: data.unread_total ?? 0,
  }
}

/** One thread, for the chat header. */
export async function fetchConversation(id, { token, signal } = {}) {
  return toConversation(await request(`/conversations/${id}`, { token, signal }))
}

/**
 * One page of a thread, oldest first.
 *
 * `before` is the id of the oldest message already held — a cursor, not an
 * offset, so messages arriving mid-scroll cannot shift the page under the
 * reader and make it repeat or skip one.
 */
export async function fetchMessages(conversationId, { token, signal, limit = 30, before } = {}) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (before) query.set('before', before)

  const data = await request(`/conversations/${conversationId}/messages?${query}`, {
    token,
    signal,
  })
  return {
    items: (data.items ?? []).map(toMessage),
    hasMore: Boolean(data.has_more),
    nextBefore: data.next_before ?? null,
  }
}

export async function sendMessage(conversationId, body, { token } = {}) {
  const data = await request(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { body },
    token,
  })
  return toMessage(data)
}

/** Marks everything the other side sent as read. */
export function markConversationRead(conversationId, { token } = {}) {
  return request(`/conversations/${conversationId}/read`, { method: 'POST', token })
}

export async function editMessage(messageId, body, { token } = {}) {
  return toMessage(await request(`/messages/${messageId}`, { method: 'PATCH', body: { body }, token }))
}

/**
 * Removes a message.
 *
 * `scope` is 'me' — hidden from this reader alone — or 'everyone', which
 * withdraws it from both sides and is available only to its author.
 */
export function deleteMessage(messageId, scope, { token } = {}) {
  return request(`/messages/${messageId}`, { method: 'DELETE', body: { scope }, token })
}

/** The badge figure for the header and the sidebar. */
export async function fetchUnreadTotal({ token, signal } = {}) {
  const data = await request('/conversations/unread', { token, signal })
  return data.unread_total ?? 0
}
