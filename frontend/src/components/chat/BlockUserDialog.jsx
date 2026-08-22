import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

// The reasons the server accepts. Kept in the order they are most likely to
// apply, with "other" last because it is the fallback rather than a choice.
export const BLOCK_REASONS = [
  { id: 'spam', labelKey: 'chat.blockReasonSpam' },
  { id: 'fake_listing', labelKey: 'chat.blockReasonFake' },
  { id: 'harassment', labelKey: 'chat.blockReasonHarassment' },
  { id: 'abuse', labelKey: 'chat.blockReasonAbuse' },
  { id: 'suspicious', labelKey: 'chat.blockReasonSuspicious' },
  { id: 'other', labelKey: 'chat.blockReasonOther' },
]

/**
 * Confirms blocking someone, and optionally asks why.
 *
 * The reason is never required. Blocking is something people do when they want
 * a conversation to stop, and making them justify it first is a reason to
 * hesitate — the field exists for those who want to say, not as a toll.
 *
 * Same shell as the archive and delete dialogs: backdrop, Escape, click
 * outside, and the destructive action set apart rather than styled as the
 * default.
 */
function BlockUserDialog({ name, onCancel, onConfirm, busy, error }) {
  const { t } = useLocale()
  const [reason, setReason] = useState(null)
  const [reasonText, setReasonText] = useState('')
  const dialogRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, busy])

  // Focus moves into the dialog so a keyboard reader lands on it rather than
  // continuing behind the backdrop.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => (busy ? undefined : onCancel())}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-user-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <h2 id="block-user-title" className="text-base font-semibold text-text-primary">
          {t('chat.blockTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{t('chat.blockConfirm', { name })}</p>
        <p className="mt-1 text-xs text-text-muted">{t('chat.blockExplain')}</p>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-text-primary">
            {t('chat.blockReasonLabel')}
          </legend>
          <p className="mt-0.5 text-[11px] text-text-muted">{t('chat.blockReasonOptional')}</p>

          <div className="mt-2 flex flex-wrap gap-2">
            {BLOCK_REASONS.map((option) => {
              const isActive = reason === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  // Pressing the selected reason again clears it, so a reason
                  // given by mistake can be taken back without reopening.
                  onClick={() => setReason(isActive ? null : option.id)}
                  aria-pressed={isActive}
                  disabled={busy}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
                    isActive
                      ? 'border-primary bg-primary-light font-medium text-primary-hover dark:text-primary'
                      : 'border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                  }`}
                >
                  {t(option.labelKey)}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-text-primary">{t('chat.blockNoteLabel')}</span>
          <textarea
            value={reasonText}
            onChange={(event) => setReasonText(event.target.value)}
            rows={2}
            maxLength={500}
            disabled={busy}
            placeholder={t('chat.blockNotePlaceholder')}
            className="mt-1 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          />
        </label>

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
          {/* Restrictive, so it is set apart from an ordinary primary action —
              without turning the whole dialog red. */}
          <button
            type="button"
            onClick={() => onConfirm({ reason, reasonText: reasonText.trim() })}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md border border-error/40 bg-error/10 px-4 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
            {t('chat.block')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BlockUserDialog
