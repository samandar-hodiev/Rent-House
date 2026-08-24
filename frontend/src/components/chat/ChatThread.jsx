import { Fragment, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Ban, Loader2, Trash2, X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useChat } from '../../context/ChatContext'
import { useConversation } from '../../hooks/useConversation'
import { SOCKET_STATUS } from '../../services/chatSocket'
import UserAvatar from '../dashboard/UserAvatar'
import { fetchAttachmentLimits } from '../../services/chatApi'
import ApartmentContextBar from './ApartmentContextBar'
import BlockUserDialog from './BlockUserDialog'
import { ArchiveConversationDialog, DeleteConversationDialog } from './ConversationDialogs'
import ChatComposer from './ChatComposer'
import ChatHeaderMenu from './ChatHeaderMenu'
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
/**
 * `apartmentId` is the listing the reader arrived from — the apartment detail
 * page passes it, the dashboard does not. Messages sent while it is set record
 * it, which is what lets one conversation hold several listings' worth of
 * discussion and still show which is which.
 */
function ChatThread({
  conversation,
  apartmentId = null,
  onConversationGone,
  className = '',
}) {
  const { t } = useLocale()
  const { socketStatus, setActiveConversation, setBlocked, setArchived, removeConversation } =
    useChat()

  // Two different facts. `isBlocked` is this reader's own decision and offers a
  // way back; `isBlockedBy` is the other party's, and only explains why the
  // composer is closed.
  const isBlocked = Boolean(conversation?.isBlocked)
  const isBlockedBy = Boolean(conversation?.isBlockedBy)
  const [blockDialog, setBlockDialog] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [blockError, setBlockError] = useState(null)

  // Archiving and deleting from the header run the same context methods and
  // open the same dialogs as the conversation's own row in the sidebar. There
  // is one archive and one delete in the application, reachable from two
  // places rather than implemented in two.
  const [pending, setPending] = useState(null) // 'archive' | 'delete'
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const act = async (run) => {
    setActionBusy(true)
    setActionError(null)
    try {
      await run()
      setPending(null)
      // The dashboard drops the panel on its own — it reads the selection from
      // the list, which no longer holds this thread. The apartment modal has no
      // list to read, so it is told.
      onConversationGone?.()
    } catch {
      setActionError(t('chat.actionFailed'))
    } finally {
      setActionBusy(false)
    }
  }

  const changeBlock = async (blocked, reason) => {
    setBlockBusy(true)
    setBlockError(null)
    try {
      await setBlocked(conversation.other.id, blocked, reason)
      setBlockDialog(false)
    } catch {
      setBlockError(t('chat.blockFailed'))
    } finally {
      setBlockBusy(false)
    }
  }

  // While this thread is on screen its messages need no notification — the
  // reader is looking at them. Cleared on unmount so closing the panel starts
  // notifying again.
  useEffect(() => {
    setActiveConversation(conversation?.id ?? null)
    return () => setActiveConversation(null)
  }, [conversation?.id, setActiveConversation])
  const {
    messages,
    apartments,
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
    removeMany,
  } = useConversation(conversation?.id, apartmentId)

  const [pendingDelete, setPendingDelete] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [limits, setLimits] = useState(null)
  // The message being answered, if any.
  const [replyTo, setReplyTo] = useState(null)
  // Selected message ids. A Set rather than a list: selecting is a membership
  // question asked once per rendered bubble.
  const [selected, setSelected] = useState(() => new Set())
  // Set while a bulk delete is confirmed, so the dialog knows what it is about
  // to remove and whether "for everyone" is even available.
  const [confirmingBulk, setConfirmingBulk] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

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

  // Switching threads must not carry a selection or a half-written reply into
  // the next one.
  useEffect(() => {
    setSelected(new Set())
    setReplyTo(null)
    setConfirmingBulk(false)
  }, [conversation?.id])

  const selecting = selected.size > 0

  const toggleSelect = (messageId) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  // "Delete for everyone" is the author's to use, so it is offered only when
  // every selected message is this reader's own. The server refuses the rest
  // regardless — this stops the UI offering something that would be refused.
  const selectedMessages = messages.filter((message) => selected.has(message.id))
  const allMine = selectedMessages.length > 0 && selectedMessages.every((m) => m.senderId === myId)

  const handleBulkDelete = async (scope) => {
    setBulkBusy(true)
    const ok = await removeMany([...selected], scope)
    setBulkBusy(false)
    if (ok) {
      setConfirmingBulk(false)
      clearSelection()
    }
  }

  const handleSendText = async (text) => {
    pinnedToBottom.current = true
    const ok = await send(text, replyTo?.id ?? null)
    // Cleared only on success, so a failed send keeps what it was answering.
    if (ok) setReplyTo(null)
    return ok
  }

  // Starting a reply ends a selection: they are two different things to be
  // doing with a message, and staying in both is how a stray click deletes
  // something.
  const handleReply = (message) => {
    clearSelection()
    setReplyTo(message)
  }

  // Who the quote is attributed to. The reply carries only a sender id, and
  // the thread already knows the only two people it can belong to.
  const quoteAuthor = (senderId) => (senderId === myId ? t('chat.you') : conversation?.other?.name)

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
      {/* While a selection is open it takes the header's place, so the count
          and its two actions sit where the reader is already looking and the
          thread does not grow a second toolbar. */}
      {selecting ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-secondary px-3 py-2 sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={clearSelection}
            aria-label={t('chat.cancelSelection')}
            title={t('chat.cancelSelection')}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={16} />
          </button>

          <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
            {t('chat.selectedCount', { count: selected.size })}
          </p>

          <button
            type="button"
            onClick={() => setConfirmingBulk(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-error transition-colors hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Trash2 aria-hidden="true" size={15} />
            {/* The label is dropped on the narrowest screens, where the icon
                and the count together are unambiguous. */}
            <span className="max-[380px]:sr-only">{t('chat.delete')}</span>
          </button>
        </div>
      ) : null}

      {/* Header */}
      <div className={`shrink-0 items-center gap-3 border-b border-border px-4 py-3 ${selecting ? 'hidden' : 'flex'}`}>
        <UserAvatar name={other.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{other.name}</p>
          {/* Somebody who has been blocked is told so here, in place of a
              presence line they cannot act on — and which would otherwise keep
              reporting the other person as available while every message they
              send is refused. Red, because it explains a restriction. */}
          {isBlockedBy ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-error">
              <AlertTriangle aria-hidden="true" size={12} className="shrink-0" />
              {t('chat.blockedYouStatus')}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${
                  other.online ? 'bg-primary' : 'bg-text-muted/40'
                }`}
              />
              {other.online ? t('chat.online') : t('chat.offline')}
            </p>
          )}
        </div>

        <ChatHeaderMenu
          isBlocked={isBlocked}
          onBlock={() => {
            setBlockError(null)
            setBlockDialog(true)
          }}
          onUnblock={() => changeBlock(false)}
          onArchive={() => {
            setActionError(null)
            setPending('archive')
          }}
          onDelete={() => {
            setActionError(null)
            setPending('delete')
          }}
        />
      </div>

      {/* The listing context is not here on purpose. A thread can range over
          several listings, and a single bar under the header can only name one
          of them — so it is rendered inside the message flow instead, at the
          point each listing's run of messages begins. */}

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
      {/* A column, so a short thread can sit at the bottom rather than clinging
          to the top of an otherwise empty panel — the way every messenger
          behaves, and the way the eye expects to find the newest message just
          above the composer. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // Named so a message's actions menu can measure the room it actually
        // has: this element clips anything that leaves it.
        data-chat-scroll=""
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3"
      >
        {isLoading ? (
          <p className="m-auto flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
            <Loader2 aria-hidden="true" size={16} className="animate-spin" />
            {t('chat.loading')}
          </p>
        ) : status === 'error' ? (
          <p role="alert" className="m-auto py-8 text-center text-sm text-error">
            {t('chat.loadFailed')}
          </p>
        ) : messages.length === 0 ? (
          <p className="m-auto py-8 text-center text-sm text-text-muted">{t('chat.empty')}</p>
        ) : (
          // `mt-auto` rather than `justify-end` on the container: an auto
          // margin collapses to zero once the thread is taller than the panel,
          // where `justify-end` would clip the messages that overflow upward
          // and put the oldest ones out of reach.
          <div className="mt-auto">
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
              {messages.map((message, index) => {
                // The listing context opens each run of messages about a given
                // listing, so one thread can cover several and still say which
                // is which.
                const previous = index > 0 ? messages[index - 1].apartmentId : null
                const changed = message.apartmentId && message.apartmentId !== previous
                // Looked up by the message's own listing id — never the
                // thread's pinned one, which would caption an older run with
                // whatever is being discussed now. A listing withdrawn since
                // is simply absent, and heads nothing rather than heading the
                // wrong thing.
                const listing = changed ? (apartments[message.apartmentId] ?? null) : null

                return (
                  <Fragment key={message.id}>
                    {listing ? (
                      <li>
                        <ApartmentContextBar apartment={listing} />
                      </li>
                    ) : null}
                    <ChatMessage
                      message={message}
                      isMine={message.senderId === myId}
                      onEdit={edit}
                      onDelete={setPendingDelete}
                      onOpenImage={setLightbox}
                      onReply={handleReply}
                      selecting={selecting}
                      selected={selected.has(message.id)}
                      onToggleSelect={toggleSelect}
                      quoteAuthorName={quoteAuthor(message.replyTo?.senderId)}
                    />
                  </Fragment>
                )
              })}
            </ul>
          </div>
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

      {isBlocked || isBlockedBy ? (
        // Not a disabled input: an apparently active composer that refuses
        // every message is worse than none. This says why, and — when the
        // block is this reader's own — offers the way back.
        <div className="flex shrink-0 flex-col items-center gap-2 border-t border-border bg-surface-secondary px-4 py-4 text-center">
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Ban aria-hidden="true" size={15} className="shrink-0 text-error" />
            {isBlocked ? t('chat.blockedByYou') : t('chat.blockedYou')}
          </p>
          {isBlocked ? (
            <button
              type="button"
              onClick={() => changeBlock(false)}
              disabled={blockBusy}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {blockBusy ? <Loader2 aria-hidden="true" size={13} className="animate-spin" /> : null}
              {t('chat.unblock')}
            </button>
          ) : null}
          {blockError ? (
            <p role="alert" className="text-xs text-error">
              {blockError}
            </p>
          ) : null}
        </div>
      ) : (
        <ChatComposer
          onSendText={handleSendText}
          onSendFile={handleSendFile}
          sending={sending}
          limits={limits}
          replyTo={replyTo}
          replyAuthorName={quoteAuthor(replyTo?.senderId)}
          onCancelReply={() => setReplyTo(null)}
        />
      )}

      {/* The sidebar's own dialogs, imported rather than reproduced. */}
      {pending === 'archive' ? (
        <ArchiveConversationDialog
          busy={actionBusy}
          error={actionError}
          onCancel={() => (actionBusy ? undefined : setPending(null))}
          onConfirm={() => act(() => setArchived(conversation.id, true))}
        />
      ) : null}

      {pending === 'delete' ? (
        <DeleteConversationDialog
          busy={actionBusy}
          error={actionError}
          onCancel={() => (actionBusy ? undefined : setPending(null))}
          onDeleteForMe={() => act(() => removeConversation(conversation.id))}
          onDeleteForEveryone={() =>
            act(() => removeConversation(conversation.id, { forEveryone: true }))
          }
        />
      ) : null}

      {blockDialog ? (
        <BlockUserDialog
          name={other.name}
          busy={blockBusy}
          error={blockError}
          onCancel={() => (blockBusy ? undefined : setBlockDialog(false))}
          onConfirm={(reason) => changeBlock(true, reason)}
        />
      ) : null}

      {lightbox ? <ImageLightbox image={lightbox} onClose={() => setLightbox(null)} /> : null}

      {pendingDelete ? (
        <DeleteMessageDialog
          onCancel={() => setPendingDelete(null)}
          onDeleteForMe={() => handleDelete('me')}
          onDeleteForEveryone={() => handleDelete('everyone')}
        />
      ) : null}

      {/* The same dialog the single delete uses, told how many messages it is
          about and whether withdrawing them from both sides is this reader's
          to do. */}
      {confirmingBulk ? (
        <DeleteMessageDialog
          count={selected.size}
          busy={bulkBusy}
          allowEveryone={allMine}
          onCancel={() => (bulkBusy ? undefined : setConfirmingBulk(false))}
          onDeleteForMe={() => handleBulkDelete('me')}
          onDeleteForEveryone={() => handleBulkDelete('everyone')}
        />
      ) : null}
    </div>
  )
}

export default ChatThread
