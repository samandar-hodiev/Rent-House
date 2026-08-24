import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Archive, ChevronDown, ChevronUp, Settings, ShieldOff } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { ROUTES } from '../../routes/paths'

const ITEM =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const ACTIVE = 'bg-primary-light text-primary-hover dark:text-primary'
const IDLE = 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'

/**
 * Chat's own settings, at the foot of its sidebar.
 *
 * The archive and the blocked list are both about conversations, and both used
 * to live somewhere else — the archive as a permanent toggle under the search
 * box, the blocked list as an entry in the application's main sidebar. Neither
 * is something anybody opens often, and a chat-specific list sitting among
 * Dashboard, Listings and Saved made the main navigation look like it had two
 * kinds of entry. Collected here, chat's navigation is in chat.
 *
 * Both are views of the chat page rather than separate routes, so which one is
 * open can be read off the URL — and so this menu is on screen to show it.
 */
function ChatSettingsMenu() {
  const { t } = useLocale()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const view = searchParams.get('view')
  const onChats = location.pathname === ROUTES.dashboardChats
  const archivedActive = onChats && view === 'archived'
  const blockedActive = onChats && view === 'blocked'

  // Open when the reader is already inside it, and openable anywhere else.
  const [expanded, setExpanded] = useState(archivedActive || blockedActive)

  return (
    <div className="shrink-0 border-t border-border p-2">
      {expanded ? (
        // Above the trigger rather than below it: the trigger sits at the very
        // bottom of the column, and a submenu opening downward would have
        // nowhere to go.
        <ul className="mb-1 flex flex-col gap-0.5">
          <li>
            <Link
              to={`${ROUTES.dashboardChats}?view=archived`}
              aria-current={archivedActive ? 'page' : undefined}
              className={`${ITEM} ${archivedActive ? ACTIVE : IDLE}`}
            >
              <Archive aria-hidden="true" size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t('chat.archived')}</span>
            </Link>
          </li>
          <li>
            <Link
              to={`${ROUTES.dashboardChats}?view=blocked`}
              aria-current={blockedActive ? 'page' : undefined}
              className={`${ITEM} ${blockedActive ? ACTIVE : IDLE}`}
            >
              <ShieldOff aria-hidden="true" size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t('blocked.title')}</span>
            </Link>
          </li>
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className={`${ITEM} ${IDLE}`}
      >
        <Settings aria-hidden="true" size={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{t('chat.settings')}</span>
        {expanded ? (
          <ChevronUp aria-hidden="true" size={15} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown aria-hidden="true" size={15} className="shrink-0 text-text-muted" />
        )}
      </button>
    </div>
  )
}

export default ChatSettingsMenu
