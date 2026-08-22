import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

/**
 * The shell both confirmations share: backdrop, Escape, click-outside.
 *
 * One shell rather than two so the archive and delete dialogs cannot drift into
 * behaving differently — the same click closes both, the same key cancels both.
 */
function DialogShell({ titleId, onCancel, children }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Confirms archiving.
 *
 * Archiving is reversible and touches nobody else, so this is a plain
 * confirmation rather than a warning — the point is to catch a mis-tap, not to
 * talk anyone out of it.
 */
export function ArchiveConversationDialog({ onCancel, onConfirm, busy, error }) {
  const { t } = useLocale()

  return (
    <DialogShell titleId="archive-conversation-title" onCancel={onCancel}>
      <h2 id="archive-conversation-title" className="text-base font-semibold text-text-primary">
        {t('chat.archiveConfirmTitle')}
      </h2>
      <p className="mt-2 text-sm text-text-secondary">{t('chat.archiveConfirmHint')}</p>

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
          {t('chat.archive')}
        </button>
      </div>
    </DialogShell>
  )
}

/**
 * Confirms deleting, and asks which kind.
 *
 * The two outcomes differ in who they affect, and that has to be stated before
 * the fact rather than discovered after: one hides a thread from you, the other
 * takes it away from someone else too. Each option carries the sentence that
 * says which — a bare "Delete" would make them look interchangeable.
 */
export function DeleteConversationDialog({ onCancel, onDeleteForMe, onDeleteForEveryone, busy, error }) {
  const { t } = useLocale()

  return (
    <DialogShell titleId="delete-conversation-title" onCancel={onCancel}>
      <h2 id="delete-conversation-title" className="text-base font-semibold text-text-primary">
        {t('chat.deleteConversationTitle')}
      </h2>

      {error ? (
        <p role="alert" className="mt-3 text-xs text-error">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {/* The reversible one first, and styled as the ordinary choice. */}
        <button
          type="button"
          onClick={onDeleteForMe}
          disabled={busy}
          className="w-full rounded-md border border-border bg-surface-secondary px-4 py-3 text-left transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <span className="block text-sm font-medium text-text-primary">
            {t('chat.deleteForMe')}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            {t('chat.deleteForMeHint')}
          </span>
        </button>

        {/* Reaches into someone else's account, so it is neither the default
            nor styled as the primary action. */}
        <button
          type="button"
          onClick={onDeleteForEveryone}
          disabled={busy}
          className="w-full rounded-md border border-error/40 bg-error/10 px-4 py-3 text-left transition-colors hover:bg-error/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <span className="block text-sm font-medium text-error">
            {t('chat.deleteForEveryone')}
          </span>
          <span className="mt-0.5 block text-xs text-error/80">
            {t('chat.deleteForEveryoneHint')}
          </span>
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
          {t('chat.cancel')}
        </button>
      </div>
    </DialogShell>
  )
}
