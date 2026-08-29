import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, ShieldAlert } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import { ADMIN_ROLE, useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchChatMessages, fetchChats } from '../../services/adminApi'

const PER_PAGE = 10
const SEARCH_DEBOUNCE = 300

const pad = (value) => String(value).padStart(2, '0')
const clock = (iso) => {
  const at = new Date(iso)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/**
 * What was said in one conversation.
 *
 * Read-only by construction: there is no composer, so an administrator cannot
 * write in somebody else's name even by accident. Withdrawn messages keep their
 * text here and say who withdrew them — the same audit view the listing page
 * shows, and the same rule guards it.
 */
function Thread({ id, onForbidden }) {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const [thread, setThread] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    fetchChatMessages(id, { token, signal: controller.signal })
      .then((data) => {
        if (cancelled) return
        setThread(data)
        setState('ready')
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        if (error?.status === 403) {
          onForbidden()
          return
        }
        setState('error')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [id, token, onForbidden])

  if (state === 'loading') {
    return (
      <div className="flex min-h-[16rem] items-center justify-center">
        <Loader2 aria-hidden="true" size={18} className="animate-spin text-text-muted" />
      </div>
    )
  }
  if (state === 'error') {
    return <p className="p-6 text-center text-sm text-error">{t('chats.loadFailed')}</p>
  }
  if (thread.messages.length === 0) {
    return <p className="p-6 text-center text-sm text-text-muted">{t('chats.noMessages')}</p>
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-border p-3">
        <UserAvatar name={thread.buyerName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">
            {thread.buyerName} · {thread.sellerName}
          </span>
          <span className="block text-[11px] text-text-muted">
            {t('chats.messageCount', { count: thread.messages.length })}
          </span>
        </span>
      </div>

      <ul className="chat-scroll flex max-h-80 flex-col gap-2 overflow-y-auto p-3">
        {thread.messages.map((message) => {
          const fromSeller = message.senderName === thread.sellerName
          const deleted = Boolean(message.deletedAt)
          return (
            <li key={message.id} className={`flex ${fromSeller ? 'justify-end' : 'justify-start'}`}>
              <span
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  fromSeller
                    ? 'bg-primary text-white'
                    : 'border border-border bg-surface-secondary text-text-primary'
                }`}
              >
                {message.body || (
                  <span className="italic opacity-70">{t('audit.noText')}</span>
                )}
                <span
                  className={`mt-1 block text-[10px] ${
                    fromSeller ? 'text-white/70' : 'text-text-muted'
                  }`}
                >
                  {clock(message.createdAt)}
                  {message.editedAt ? ` · ${t('audit.edited')}` : ''}
                </span>
                {deleted ? (
                  <span
                    className={`mt-1 block border-t pt-1 text-[10px] ${
                      fromSeller ? 'border-white/25 text-red-100' : 'border-error/25 text-error'
                    }`}
                  >
                    {message.deletedByName
                      ? t('audit.deletedBy', { name: message.deletedByName })
                      : t('audit.deletedUnknown')}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="flex items-center gap-2 border-t border-border p-3 text-xs text-text-muted">
        <ShieldAlert aria-hidden="true" size={14} className="shrink-0" />
        {t('chats.readOnly')}
      </p>
    </div>
  )
}

/**
 * Conversations, for moderation.
 *
 * The table says who spoke to whom, about what and when — that much any
 * administrator with this section may see. Reading the messages themselves is
 * the owner's, checked at the server; a super admin opening a thread is told
 * so rather than shown an empty panel.
 */
function AdminChatsPage() {
  const { t, role } = useAdmin()
  const { token } = useAdminAuth()
  const { formatDateTime, formatNumber } = useAdminFormat()

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ chats: [], total: 0, page: 1, totalPages: 1 })
  const [state, setState] = useState('loading')
  const [openId, setOpenId] = useState(null)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [query])

  const firstLoad = useRef(true)
  const load = useCallback(
    async (signal) => {
      if (firstLoad.current) setState('loading')
      try {
        setData(await fetchChats({ search, page, limit: PER_PAGE, token, signal }))
        setState('ready')
        firstLoad.current = false
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState('error')
      }
    },
    [search, page, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const onForbidden = useCallback(() => {
    setForbidden(true)
    setOpenId(null)
  }, [])

  const from = data.total === 0 ? 0 : (data.page - 1) * PER_PAGE + 1
  const to = Math.min(data.page * PER_PAGE, data.total)

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.chats.title')}
        description={t('page.chats.description', { count: formatNumber(data.total) })}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <AdminCard>
          <div className="border-b border-border p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('chats.search')}
              aria-label={t('chats.search')}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-xs placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {state === 'loading' ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
            </div>
          ) : state === 'error' ? (
            <div className="p-4">
              <EmptyState
                icon={<MessageSquare aria-hidden="true" size={28} />}
                title={t('chats.loadFailed')}
                description={t('login.errorNetwork')}
              />
            </div>
          ) : (
            <AdminTable
              headers={[
                t('table.buyer'), t('table.seller'), t('table.listing'), t('table.lastMessage'),
                t('table.date'), t('table.status'), t('table.actions'),
              ]}
              empty={
                data.chats.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      icon={<MessageSquare aria-hidden="true" size={28} />}
                      title={t('empty.chats')}
                      description={t('empty.chatsHint')}
                    />
                  </div>
                ) : null
              }
            >
              {data.chats.map((chat) => (
                <Row key={chat.id}>
                  <Cell className="whitespace-nowrap text-text-primary">{chat.buyerName}</Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">{chat.sellerName}</Cell>
                  <Cell>
                    <span className="block max-w-[180px] truncate text-text-secondary">
                      {chat.listingTitle ?? '—'}
                    </span>
                  </Cell>
                  <Cell>
                    <span className="block max-w-[200px] truncate text-text-secondary">
                      {chat.lastMessage || <span className="italic opacity-70">{t('audit.noText')}</span>}
                    </span>
                  </Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">
                    {chat.lastMessageAt ? formatDateTime(chat.lastMessageAt) : '—'}
                  </Cell>
                  <Cell><StatusBadge status={chat.status} /></Cell>
                  <Cell>
                    <MockButton
                      onClick={() => {
                        setForbidden(false)
                        setOpenId(chat.id)
                      }}
                    >
                      {t('action.view')}
                    </MockButton>
                  </Cell>
                </Row>
              ))}
            </AdminTable>
          )}

          {state === 'ready' && data.total > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <p className="text-xs text-text-muted">
                {t('users.showing', { from, to, total: formatNumber(data.total) })}
              </p>
              <span className="flex items-center gap-1.5">
                <MockButton
                  disabled={data.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t('action.previous')}
                </MockButton>
                <span className="px-1 text-xs tabular-nums text-text-secondary">
                  {data.page} / {data.totalPages}
                </span>
                <MockButton
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
                >
                  {t('action.next')}
                </MockButton>
              </span>
            </div>
          ) : null}
        </AdminCard>

        <AdminCard title={t('chats.preview')}>
          {/* Told plainly rather than shown an empty panel: the reason the
              messages are not here is a rule, not a failure. */}
          {forbidden || (openId && role !== ADMIN_ROLE.owner) ? (
            <p className="p-6 text-center text-sm text-text-muted">{t('chats.ownerOnly')}</p>
          ) : openId ? (
            <Thread id={openId} onForbidden={onForbidden} />
          ) : (
            <p className="p-6 text-center text-sm text-text-muted">{t('chats.selectHint')}</p>
          )}
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminChatsPage
