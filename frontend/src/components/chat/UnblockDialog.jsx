import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

/**
 * Confirms lifting a block.
 *
 * Unblocking is not destructive — it restores something — so the confirm button
 * carries the ordinary primary style rather than the red the block dialog uses.
 * It is asked at all because it is a decision the person made deliberately, and
 * undoing it by mistake means someone they blocked can write to them again.
 *
 * Portalled, like the logout dialog: this opens from a page whose ancestors may
 * clip a fixed child, and from a menu inside a scrolling list.
 */
function UnblockDialog({ name, onCancel, onConfirm, busy, error }) {
  const { t } = useLocale()
  const dialogRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, busy])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => (busy ? undefined : onCancel())}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unblock-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <h2 id="unblock-title" className="text-base font-semibold text-text-primary">
          {t('blocked.unblockTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t('blocked.unblockConfirm', { name })}
        </p>
        <p className="mt-1 text-xs text-text-muted">{t('blocked.unblockHint')}</p>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            {t('chat.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
            {t('chat.unblock')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default UnblockDialog
