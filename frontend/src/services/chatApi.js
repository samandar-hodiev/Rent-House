// Chat endpoints. Components call these rather than fetch directly, so the
// request shapes stay in one file next to the backend contract.
//
// The API speaks snake_case and the UI speaks camelCase; the translation lives
// here, as it does for listings.
import { ApiError, NETWORK_ERROR, request } from './apiClient'

// The upload path builds its own request, so it needs the base URL the shared
// client normally hides.
const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '')

/** Turns an API message into the shape the bubbles render. */
export function toMessage(item) {
  return {
    id: item.id,
    conversationId: item.conversation_id,
    senderId: item.sender_id,
    // text | image | file | audio — the client picks a renderer from this
    // rather than inspecting the attachment.
    kind: item.kind ?? 'text',
    body: item.body,
    // Which listing this message was written about. The same conversation can
    // hold messages about several, and this is what tells them apart.
    apartmentId: item.apartment_id ?? null,
    attachment: item.attachment
      ? {
          id: item.attachment.id,
          kind: item.attachment.kind,
          name: item.attachment.name,
          url: item.attachment.url,
          mimeType: item.attachment.mime_type,
          sizeBytes: item.attachment.size_bytes,
          durationSeconds: item.attachment.duration_seconds ?? null,
        }
      : null,
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
    // The thread's current listing context — the one most recently written
    // about. Null when that listing has been withdrawn, or when the pair have
    // never named one: a conversation belongs to two people, not to a listing.
    apartment: item.apartment
      ? {
          id: item.apartment.id,
          title: item.apartment.title ?? '',
          image: item.apartment.image ?? null,
          district: item.apartment.district ?? '',
          price: item.apartment.price ? Number(item.apartment.price) : null,
          currency: item.apartment.currency ?? 'UZS',
          rentalPeriod: item.apartment.rental_period ?? 'monthly',
        }
      : null,
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
    // This user's own view of the thread. The other participant's copy has
    // its own answers, which is the whole point of these two.
    isPinned: Boolean(item.is_pinned),
    isArchived: Boolean(item.is_archived),
    // Two different facts. `isBlocked` offers a way to undo it; `isBlockedBy`
    // only explains why sending fails.
    isBlocked: Boolean(item.is_blocked),
    isBlockedBy: Boolean(item.is_blocked_by),
  }
}

/**
 * Opens the thread about a listing, or returns the one already open.
 *
 * Safe to call every time the modal opens: the backend keys the thread on
 * (buyer, owner) — the pair, not the listing — so writing to the same person
 * about a second apartment continues the conversation already underway. The
 * listing passed here becomes the thread's current context.
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

/**
 * The signed-in user's threads, plus the badge total.
 *
 * `archived` switches to the archive. Same endpoint and same shape — one
 * predicate apart on the server — so the two lists cannot disagree about what
 * a thread looks like.
 */
export async function fetchConversations({ token, signal, archived = false } = {}) {
  const path = archived ? '/conversations?archived=true' : '/conversations'
  const data = await request(path, { token, signal })
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

/**
 * Sends a text message.
 *
 * `apartmentId` records which listing it is about. Context, not routing: the
 * thread is chosen by who the two people are, and this says what was being
 * discussed when the message was written.
 */
export async function sendMessage(conversationId, body, { token, apartmentId } = {}) {
  const data = await request(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: apartmentId ? { body, apartment_id: apartmentId } : { body },
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

// --- attachments -----------------------------------------------------------

/**
 * Sends a message carrying a file, reporting real upload progress.
 *
 * XMLHttpRequest rather than fetch: fetch still has no upload-progress event in
 * any shipping browser, and the alternative — animating a fake bar on a timer —
 * would tell the user something the client does not know. This reports the
 * bytes the browser has actually handed to the socket.
 *
 * Returns `{ promise, abort }` so a caller can cancel a large upload.
 */
export function sendAttachment(
  conversationId,
  { file, body = '', durationSeconds, apartmentId, token, onProgress },
) {
  const form = new FormData()
  form.append('file', file, file.name || 'file')
  if (body) form.append('body', body)
  if (apartmentId) form.append('apartment_id', apartmentId)
  if (durationSeconds != null) form.append('duration_seconds', String(Math.round(durationSeconds)))

  const xhr = new XMLHttpRequest()
  const promise = new Promise((resolve, reject) => {
    xhr.open('POST', `${API_BASE}/conversations/${conversationId}/messages`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    // Content-Type is deliberately not set: the browser adds it with the
    // multipart boundary, which only it can generate.

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }

    xhr.onload = () => {
      let payload = null
      try {
        payload = JSON.parse(xhr.responseText || 'null')
      } catch {
        payload = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.success !== false) {
        // The bar reaches full only once the server has answered, not when the
        // last byte left the browser.
        onProgress?.(1)
        resolve(toMessage(payload.data))
        return
      }
      reject(
        new ApiError({
          status: xhr.status,
          code: payload?.error ?? 'unknown_error',
          message: payload?.message ?? `Upload failed with status ${xhr.status}`,
        }),
      )
    }

    xhr.onerror = () =>
      reject(new ApiError({ status: 0, code: NETWORK_ERROR, message: 'Upload failed' }))
    xhr.onabort = () =>
      reject(new ApiError({ status: 0, code: 'cancelled', message: 'Upload cancelled' }))

    xhr.send(form)
  })

  return { promise, abort: () => xhr.abort() }
}

/**
 * The URL an <img> or an <audio> can actually load.
 *
 * Those elements cannot carry an Authorization header, so the access token
 * travels in the query string — the same compromise the WebSocket makes, and
 * the reason chat attachments are not served as static files.
 */
export function attachmentSrc(url, token) {
  if (!url) return null
  if (!token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

/** What the server accepts: sizes and MIME types, read rather than restated. */
export function fetchAttachmentLimits({ signal } = {}) {
  return request('/attachments/limits', { signal })
}

/** Pins or unpins a thread, for this user only. */
export function setConversationPinned(id, pinned, { token } = {}) {
  return request(`/conversations/${id}/pin`, { method: 'PATCH', body: { value: pinned }, token })
}

/** Moves a thread into or out of this user's archive. */
export function setConversationArchived(id, archived, { token } = {}) {
  return request(`/conversations/${id}/archive`, {
    method: 'PATCH',
    body: { value: archived },
    token,
  })
}

/**
 * Removes a thread.
 *
 * `forEveryone` withdraws it from both participants; without it the thread is
 * hidden from this user and the other side keeps everything. The server decides
 * who is asking from the token, so neither form can be aimed at someone else.
 */
export function deleteConversation(id, { forEveryone = false, token } = {}) {
  return request(`/conversations/${id}`, {
    method: 'DELETE',
    body: { for_everyone: forEveryone },
    token,
  })
}

/**
 * Blocks a user.
 *
 * The blocker is the token's owner, so this names only who is being blocked.
 * Both parts of the reason are optional — blocking somebody must not require
 * explaining yourself.
 */
export function blockUser(userId, { reason, reasonText, token } = {}) {
  const body = {}
  if (reason) body.reason = reason
  if (reasonText) body.reason_text = reasonText
  return request(`/me/blocks/${userId}`, { method: 'POST', body, token })
}

/** Lifts this user's own block. Somebody else's block is not theirs to lift. */
export function unblockUser(userId, { token } = {}) {
  return request(`/me/blocks/${userId}`, { method: 'DELETE', token })
}
