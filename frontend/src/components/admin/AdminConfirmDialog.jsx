import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { useAdmin } from '../../context/AdminSettingsContext'

/**
 * The dashboard's confirmation dialog.
 *
 * One component for every "are you sure": signing out, blocking somebody,
 * removing an administrator. Two of those are destructive and one is not, which
 * is what `tone` is for — the wording changes per caller, the behaviour does
 * not.
 *
 * `children` render between the description and the buttons, for a confirmation
 * that also has to ask something — blocking an account needs a reason, and a
 * second dialog component for that would be this one with a textarea in it.
 *
 * Portalled into the admin root rather than the document body, so it inherits
 * the dashboard's own theme: the theme is a class on `#admin-root`, and a
 * dialog outside it would come out in the public site's colours.
 */
function AdminConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  tone = 'danger',
  busy = false,
  confirmDisabled = false,
  children,
}) {
  const { t } = useAdmin()
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, busy])

  const host = document.getElementById('admin-root')
  if (!host) return null

  const confirmTone = {
    danger: 'border border-error/40 bg-error/10 text-error hover:bg-error/15',
    warning: 'border border-warning/40 bg-warning/15 text-warning hover:bg-warning/25',
    primary: 'bg-primary text-white hover:bg-primary-hover',
  }[tone]

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => (busy ? undefined : onCancel())}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <h2 id="admin-confirm-title" className="text-base font-semibold text-text-primary">
          {title}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{description}</p>

        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${confirmTone}`}
          >
            {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    host,
  )
}

export default AdminConfirmDialog
