import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, Loader2, X } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { useAuth } from '../context/AuthContext'
import { reportListing } from '../services/apartmentsApi'
import { ApiError } from '../services/apiClient'
import { useModalDialog } from '../hooks/useModalDialog'

// The reasons the server accepts. Repeated here so the form can offer them;
// the server refuses anything else regardless.
const REASONS = ['fraud', 'wrong_info', 'unavailable', 'duplicate', 'offensive', 'other']

/**
 * Reporting a listing.
 *
 * A reason from a short list, and room to say more. The list exists so
 * complaints can be counted and grouped — free text alone cannot tell a
 * moderator that eleven people said the same thing.
 */
function ReportListingDialog({ apartmentId, onClose }) {
  const { t } = useLocale()
  const { token } = useAuth()
  const dialogRef = useModalDialog(onClose)

  const [reason, setReason] = useState(REASONS[0])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')
    try {
      await reportListing(apartmentId, { reason, comment: comment.trim(), token })
      setSent(true)
    } catch (caught) {
      // Each of these is something the reader can act on, so each is said
      // plainly rather than collapsed into "something went wrong".
      if (caught instanceof ApiError && caught.code === 'already_reported') {
        setError(t('report.alreadySent'))
      } else if (caught instanceof ApiError && caught.code === 'own_listing') {
        setError(t('report.ownListing'))
      } else {
        setError(t('report.failed'))
      }
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => (busy ? undefined : onClose())}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('report.title')}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <Flag aria-hidden="true" size={16} className="text-error" />
            {t('report.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('a11y.close')}
            className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        {sent ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              {t('report.thanks')}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t('report.close')}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-medium text-text-secondary">
                {t('report.reasonLabel')}
              </legend>
              {REASONS.map((value) => (
                <label key={value} className="flex items-center gap-2.5 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="size-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  {t(`reportReason.${value}`)}
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-secondary">
                {t('report.commentLabel')}
              </span>
              <textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={1000}
                placeholder={t('report.commentPlaceholder')}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>

            {error ? (
              <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-xs text-error">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t('report.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-md bg-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
                {t(busy ? 'report.sending' : 'report.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default ReportListingDialog
