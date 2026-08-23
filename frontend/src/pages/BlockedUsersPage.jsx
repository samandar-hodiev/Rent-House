import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ShieldOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useLocale } from '../context/LocaleContext'
import { fetchBlockedUsers } from '../services/chatApi'
import { formatMessageTime } from '../utils/formatChatTime'
import { ROUTES } from '../routes/paths'
import UserAvatar from '../components/dashboard/UserAvatar'
import UnblockDialog from '../components/chat/UnblockDialog'

// The categories the block dialog offers, named for reading rather than for
// storing. Anything the server sends that is not one of these falls back to
// "other", so an added category cannot render as a blank line.
const REASON_LABELS = {
  spam: 'chat.blockReasonSpam',
  fake_listing: 'chat.blockReasonFake',
  harassment: 'chat.blockReasonHarassment',
  abuse: 'chat.blockReasonAbuse',
  suspicious: 'chat.blockReasonSuspicious',
  other: 'chat.blockReasonOther',
}

/**
 * Everyone this user has blocked.
 *
 * A block is easy to make and easy to forget, and until now there was no way to
 * see one except by opening the conversation it applies to. This is the page
 * that makes the decision reviewable — and undoable — without hunting for the
 * thread.
 *
 * Only blocks this user made. Somebody who blocked *them* does not appear here,
 * because it is not theirs to lift.
 */
function BlockedUsersPage() {
  const { t, locale } = useLocale()
  const { token } = useAuth()
  // The same method the chat menus call, so there is one unblock in the
  // application and the conversation list refreshes with it.
  const { setBlocked } = useChat()

  const [blocked, setBlocked_] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const load = useCallback(
    async (signal) => {
      if (!token) return
      try {
        const list = await fetchBlockedUsers({ token, signal })
        if (signal?.aborted) return
        setBlocked_(list)
        setStatus('ready')
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) return
        setStatus('error')
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const unblock = async () => {
    setBusy(true)
    setActionError(null)
    try {
      await setBlocked(pending.userId, false)
      setBlocked_((current) => current.filter((item) => item.userId !== pending.userId))
      setPending(null)
    } catch {
      setActionError(t('chat.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const body = () => {
    if (status === 'loading') {
      return (
        <p className="flex items-center gap-2 py-8 text-sm text-text-muted">
          <Loader2 aria-hidden="true" size={16} className="animate-spin" />
          {t('chat.loading')}
        </p>
      )
    }

    if (status === 'error') {
      return (
        <p role="alert" className="py-8 text-sm text-error">
          {t('blocked.loadFailed')}
        </p>
      )
    }

    // Light, like the dashboard's other empty states: a line, a sentence and
    // nothing else. Having blocked nobody is the ordinary case.
    if (blocked.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <ShieldOff aria-hidden="true" size={22} className="text-text-muted" />
          <p className="text-sm font-medium text-text-secondary">{t('blocked.empty')}</p>
          <p className="max-w-sm text-xs text-text-muted">{t('blocked.emptyHint')}</p>
          <Link
            to={ROUTES.dashboardChats}
            className="mt-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('dashboard.chats')}
          </Link>
        </div>
      )
    }

    return (
      <ul className="flex flex-col gap-3">
        {blocked.map((person) => {
          const reasonKey = REASON_LABELS[person.reason] ?? null
          return (
            <li
              key={person.userId}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center"
            >
              <span className="flex min-w-0 flex-1 items-start gap-3">
                <UserAvatar name={person.name} />

                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {person.name}
                  </span>
                  <span className="text-xs text-text-muted">
                    {t('blocked.blockedOn', {
                      date: formatMessageTime(person.createdAt, locale),
                    })}
                  </span>

                  {/* The reason, when one was given. Both parts are optional,
                      so neither is rendered as an empty row. */}
                  {reasonKey ? (
                    <span className="mt-1 flex w-fit items-center rounded-md bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      {t(reasonKey)}
                    </span>
                  ) : null}
                  {person.reasonText ? (
                    <span className="mt-1 line-clamp-2 text-xs italic text-text-muted">
                      {person.reasonText}
                    </span>
                  ) : null}
                </span>
              </span>

              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                  setPending(person)
                }}
                className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t('chat.unblock')}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
          {t('blocked.title')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('blocked.subtitle')}</p>
      </div>

      {body()}

      {pending ? (
        <UnblockDialog
          name={pending.name}
          busy={busy}
          error={actionError}
          onCancel={() => (busy ? undefined : setPending(null))}
          onConfirm={unblock}
        />
      ) : null}
    </div>
  )
}

export default BlockedUsersPage
