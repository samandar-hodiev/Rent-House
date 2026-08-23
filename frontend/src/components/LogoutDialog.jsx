import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../context/LocaleContext'

/**
 * Confirms signing out.
 *
 * Log out sits at the bottom of the sidebar, directly under Settings, and is
 * reached by the same downward drag as everything above it — which makes it the
 * one item on the page that a slipped tap can end the session with. Asking
 * first costs a click and removes that.
 *
 * Signing out is not destructive — nothing is lost and signing back in restores
 * everything — so the confirm button is the ordinary primary style rather than
 * the red reserved for actions that take something away.
 *
 * Same shell as the chat's confirmations: backdrop, Escape, click outside.
 *
 * Portalled to <body>, following the gallery and the mobile drawer. It is
 * opened from the sidebar, whose scroll container is `sticky` with
 * `overflow-y-auto` — a stacking context that also clips. Rendered in place,
 * the dialog was both trapped behind the page and cut off by that container,
 * however high its z-index went.
 */
function LogoutDialog({ onCancel, onConfirm }) {
  const { t } = useLocale()
  const dialogRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  // Focus moves into the dialog, so a keyboard reader lands on it rather than
  // continuing through the menu behind the backdrop.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <h2 id="logout-title" className="text-base font-semibold text-text-primary">
          {t('auth.logoutConfirmTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{t('auth.logoutConfirmHint')}</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('chat.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('dashboard.logout')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default LogoutDialog
