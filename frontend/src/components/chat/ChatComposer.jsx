import { useEffect, useRef, useState } from 'react'
import { CornerUpLeft, Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { canRecord, useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import { formatBytes, formatDuration } from './MessageAttachment'
import MessageQuote from './MessageQuote'

/**
 * The composer: text, one attachment, or a voice note.
 *
 * A row of controls rather than a bare input, so the attachment and microphone
 * buttons sit beside the field on every width instead of wrapping away on a
 * phone.
 *
 * One attachment at a time. Several would need per-file progress, per-file
 * failure and partial-send semantics, and a single reliable attachment is worth
 * more than a half-working set of them.
 */
function ChatComposer({
  onSendText,
  onSendFile,
  sending,
  limits,
  // The message being answered, and the way out of answering it. Held by the
  // thread rather than here, because the reply is started from a bubble.
  replyTo = null,
  replyAuthorName = '',
  onCancelReply,
}) {
  const { t } = useLocale()
  const recorder = useVoiceRecorder()

  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState(null) // { file, previewUrl }
  const [progress, setProgress] = useState(null) // 0..1 while uploading
  const [failed, setFailed] = useState(null) // { file, body, durationSeconds }
  const [sizeError, setSizeError] = useState(null)
  const fileInputRef = useRef(null)
  const uploadRef = useRef(null)

  // The preview is an object URL, which has to be released or the blob stays in
  // memory for the life of the page.
  useEffect(() => {
    return () => {
      if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl)
    }
  }, [picked])

  const accept = limits
    ? [...limits.image.mime_types, ...limits.file.mime_types].join(',')
    : 'image/*'

  const pick = (file) => {
    if (!file) return
    setSizeError(null)

    // Checked here for a quick answer; the server checks again, because a
    // client-side limit is a courtesy and not a control.
    const isImage = file.type.startsWith('image/')
    const max = isImage ? limits?.image.max_bytes : limits?.file.max_bytes
    if (max && file.size > max) {
      setSizeError(t('chat.fileTooLarge', { size: formatBytes(max) }))
      return
    }

    setPicked({
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
    })
  }

  const clearPicked = () => {
    if (picked?.previewUrl) URL.revokeObjectURL(picked.previewUrl)
    setPicked(null)
    setSizeError(null)
  }

  const upload = async ({ file, body, durationSeconds }) => {
    setFailed(null)
    setProgress(0)
    const handle = onSendFile({ file, body, durationSeconds, onProgress: setProgress })
    uploadRef.current = handle
    try {
      await handle.promise
      clearPicked()
      setDraft('')
    } catch (error) {
      // A cancelled upload is a choice, not a failure, so it offers no retry.
      if (error?.code !== 'cancelled') setFailed({ file, body, durationSeconds })
    } finally {
      uploadRef.current = null
      setProgress(null)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (progress !== null) return

    if (picked) {
      await upload({ file: picked.file, body: draft.trim() })
      return
    }

    const text = draft
    setDraft('')
    // The reply is cleared by the thread once the send succeeds, so a failed
    // send leaves both the text and what it was answering in place.
    if (!(await onSendText(text))) setDraft(text)
  }

  const stopAndSend = async () => {
    const result = await recorder.stop()
    if (!result) return
    // Named so the download and the bubble have something to show; the
    // extension follows the format the browser actually produced.
    const extension = result.mimeType.split('/')[1] ?? 'webm'
    const file = new File([result.blob], `voice-${Date.now()}.${extension}`, {
      type: result.mimeType,
    })
    await upload({ file, body: '', durationSeconds: result.seconds })
  }

  // --- recording ----------------------------------------------------------

  if (recorder.recording) {
    return (
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="size-2.5 shrink-0 animate-pulse rounded-full bg-error" />
          <p role="status" className="flex-1 text-sm font-medium text-text-primary">
            {t('chat.recording')} {formatDuration(recorder.seconds)}
          </p>
          <button
            type="button"
            onClick={recorder.cancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('chat.cancel')}
          </button>
          <button
            type="button"
            onClick={stopAndSend}
            aria-label={t('chat.stopAndSend')}
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Square aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
    )
  }

  // --- normal --------------------------------------------------------------

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      {/* What this message will answer. Above the input rather than inside it,
          so the quote is not mistaken for text that will be sent. */}
      {replyTo ? (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-surface-secondary px-2.5 py-1.5">
          <CornerUpLeft aria-hidden="true" size={13} className="shrink-0 text-text-muted" />
          <MessageQuote
            quote={replyTo}
            authorName={replyAuthorName}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={t('chat.cancelReply')}
            title={t('chat.cancelReply')}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      ) : null}

      {recorder.error ? (
        <p role="alert" className="mb-2 text-xs text-error">
          {recorder.error === 'unsupported' ? t('chat.recordUnsupported') : t('chat.micDenied')}
        </p>
      ) : null}

      {sizeError ? (
        <p role="alert" className="mb-2 text-xs text-error">
          {sizeError}
        </p>
      ) : null}

      {failed ? (
        <p role="alert" className="mb-2 flex items-center justify-between gap-2 text-xs text-error">
          {t('chat.uploadFailed')}
          <button
            type="button"
            onClick={() => upload(failed)}
            className="font-medium underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('chat.retry')}
          </button>
        </p>
      ) : null}

      {/* Preview: what is about to be sent, with a way out of sending it. */}
      {picked ? (
        <div className="mb-2 flex items-center gap-3 rounded-md border border-border bg-surface-secondary p-2">
          {picked.previewUrl ? (
            <img
              src={picked.previewUrl}
              alt={picked.file.name}
              className="size-14 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded bg-surface">
              <Paperclip aria-hidden="true" size={18} className="text-text-muted" />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-primary">{picked.file.name}</span>
            <span className="block text-xs text-text-muted">{formatBytes(picked.file.size)}</span>

            {progress !== null ? (
              <span className="mt-1.5 block">
                <span className="block h-1.5 w-full rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </span>
                <span className="mt-1 block text-[11px] text-text-muted">
                  {t('chat.uploading')} {Math.round(progress * 100)}%
                </span>
              </span>
            ) : null}
          </span>

          <button
            type="button"
            onClick={progress !== null ? () => uploadRef.current?.abort() : clearPicked}
            aria-label={t('chat.cancel')}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0])
            event.target.value = ''
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={progress !== null}
          aria-label={t('chat.attach')}
          title={t('chat.attach')}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <Paperclip aria-hidden="true" size={18} />
        </button>

        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        {/* The microphone gives way to Send as soon as there is something to
            send, so the two never compete for the same tap. */}
        {!draft.trim() && !picked && canRecord() ? (
          <button
            type="button"
            onClick={recorder.start}
            aria-label={t('chat.record')}
            title={t('chat.record')}
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Mic aria-hidden="true" size={18} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={sending || progress !== null || (!draft.trim() && !picked)}
            aria-label={t('chat.send')}
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending || progress !== null ? (
              <Loader2 aria-hidden="true" size={16} className="animate-spin" />
            ) : (
              <Send aria-hidden="true" size={16} />
            )}
          </button>
        )}
      </form>
    </div>
  )
}

export default ChatComposer
