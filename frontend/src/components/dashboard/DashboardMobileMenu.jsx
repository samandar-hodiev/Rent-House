import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useAuth } from '../../context/AuthContext'
import UserAvatar from './UserAvatar'
import { DashboardNavList } from './DashboardSidebar'

// Slide-in drawer holding the same entries as the desktop sidebar. Portalled to
// <body> so it is never clipped or offset by an ancestor's stacking context.
function DashboardMobileMenu({ isOpen, onClose }) {
  const { t } = useLocale()
  const { user } = useAuth()

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('dashboard.navLabel')}
        className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface lg:hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar name={user.name} />
            <span className="truncate text-sm font-medium text-text-primary">
              {user.name}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('dashboard.closeMenu')}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <DashboardNavList onNavigate={onClose} />
        </div>
      </div>
    </>,
    document.body,
  )
}

export default DashboardMobileMenu
