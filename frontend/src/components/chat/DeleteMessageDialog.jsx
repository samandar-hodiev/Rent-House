import { useEffect } from 'react'
import { useLocale } from '../../context/LocaleContext'

/**
 * Confirms how a message should be removed.
 *
 * Two outcomes, not one, because they differ in who is affected: hiding it
 * changes only your own view, withdrawing it reaches into someone else's. That
 * difference has to be stated before the fact rather than discovered after, so
 * the choice is made here instead of by a single ambiguous "Delete".
 */
function DeleteMessageDialog({
  onCancel,
  onDeleteForMe,
  onDeleteForEveryone,
  // A selection rather than a single message: `count` is how many, and
  // `allowEveryone` is false when the selection holds someone else's message,
  // which only its author may withdraw. The defaults are the single-message
  // case, so every existing call site behaves exactly as before.
  count = 1,
  allowEveryone = true,
  busy = false,
}) {
  const { t } = useLocale()

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, busy])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => (busy ? undefined : onCancel())}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="delete-message-title" className="text-base font-semibold text-text-primary">
          {count > 1
            ? t('chat.deleteManyConfirmTitle', { count })
            : t('chat.deleteConfirmTitle')}
        </h2>

        <div className="mt-5 flex flex-col gap-2">
          {/* The destructive option is not the default and is not styled as the
              primary action — it is the one that cannot be undone for anyone. */}
          {/* Absent, not disabled, when the selection is not all this
              reader's own: an action they cannot take is not worth explaining
              here, and the server refuses it either way. */}
          {allowEveryone ? (
          <button
            type="button"
            onClick={onDeleteForEveryone}
            disabled={busy}
            className="w-full rounded-md border border-error/40 bg-error/10 px-4 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('chat.deleteForEveryone')}
          </button>
          ) : null}
          <button
            type="button"
            onClick={onDeleteForMe}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface-secondary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('chat.deleteForMe')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('chat.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteMessageDialog
