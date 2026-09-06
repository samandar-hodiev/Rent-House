import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import FormField from './FormField'

/**
 * Confirms deleting the account.
 *
 * Asks for the password rather than a plain "are you sure": the account is
 * reached here through a browser that is already signed in, so a click alone
 * proves nothing about who is at the keyboard. Typing the password is the one
 * extra step between an idle session and an action that cannot be undone.
 *
 * Same shell as the block and delete-message dialogs: backdrop, Escape, click
 * outside, and the destructive action set apart rather than styled as default.
 */
function DeleteAccountDialog({ onCancel, onConfirm, busy, error }) {
  const { t } = useLocale()
  const [password, setPassword] = useState('')
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

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!busy) onConfirm(password)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => (busy ? undefined : onCancel())}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <h2 id="delete-account-title" className="text-base font-semibold text-text-primary">
          {t('dashboard.deleteAccountConfirmTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t('dashboard.deleteAccountConfirmHint')}
        </p>

        <div className="mt-4">
          <FormField
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={setPassword}
            error={error}
            autoComplete="current-password"
          />
        </div>

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
            type="submit"
            disabled={busy || !password}
            className="flex items-center justify-center gap-2 rounded-md border border-error/40 bg-error/10 px-4 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
            {t('dashboard.deleteAccountConfirmButton')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default DeleteAccountDialog
