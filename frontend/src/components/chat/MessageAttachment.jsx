import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Pause, Play } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'
import { attachmentSrc } from '../../services/chatApi'

/** Bytes as a person reads them: 2.4 MB, not 2516582. */
export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${index === 0 ? value : value.toFixed(1)} ${units[index]}`
}

/** Seconds as mm:ss, for a recording length or a playback position. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The attachment inside a message bubble.
 *
 * Every source is signed with the access token, because chat attachments are
 * served by an authorized endpoint rather than as static files — an <img> or an
 * <audio> cannot send a header, so the token rides in the query string.
 */
function MessageAttachment({ attachment, isMine, onOpenImage }) {
  const { t } = useLocale()
  const { token } = useAuth()
  const src = attachmentSrc(attachment.url, token)

  if (attachment.kind === 'image') {
    return (
      <button
        type="button"
        onClick={() => onOpenImage?.({ ...attachment, src })}
        className="block overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <img
          src={src}
          alt={attachment.name}
          // Lazy so a thread full of photographs does not fetch all of them at
          // once, and sized so the bubble cannot be stretched by a tall image.
          loading="lazy"
          className="max-h-64 w-full max-w-xs rounded-md object-cover"
        />
      </button>
    )
  }

  if (attachment.kind === 'audio') {
    return <VoiceNote src={src} attachment={attachment} isMine={isMine} />
  }

  return (
    <a
      href={src}
      download={attachment.name}
      className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isMine
          ? 'border-white/25 bg-white/10 hover:bg-white/15'
          : 'border-border bg-surface hover:bg-surface-secondary'
      }`}
    >
      <FileText
        aria-hidden="true"
        size={20}
        className={`shrink-0 ${isMine ? 'text-white' : 'text-text-secondary'}`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-medium ${isMine ? 'text-white' : 'text-text-primary'}`}
        >
          {attachment.name}
        </span>
        <span className={`block text-xs ${isMine ? 'text-white/70' : 'text-text-muted'}`}>
          {formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      <Download
        aria-hidden="true"
        size={16}
        className={`shrink-0 ${isMine ? 'text-white/80' : 'text-text-muted'}`}
      />
      <span className="sr-only">{t('chat.download')}</span>
    </a>
  )
}

/**
 * A voice note.
 *
 * Never autoplays: a message that starts talking the moment it arrives is a
 * message that speaks in a meeting. The length comes from the recorder and is
 * stored, so it is known before the file has loaded.
 */
function VoiceNote({ src, attachment, isMine }) {
  const { t } = useLocale()
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(attachment.durationSeconds ?? 0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined

    const onTime = () => setPosition(audio.currentTime)
    const onEnd = () => {
      setPlaying(false)
      setPosition(0)
    }
    // The recorder's figure is used until the file itself reports one, because
    // a WebM from MediaRecorder often has no duration in its header.
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('loadedmetadata', onMeta)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <div className="flex min-w-[200px] items-center gap-3">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('chat.pause') : t('chat.play')}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 ${
          isMine
            ? 'bg-white/20 text-white hover:bg-white/30 focus-visible:ring-white/60'
            : 'bg-primary text-white hover:bg-primary-hover focus-visible:ring-primary'
        }`}
      >
        {playing ? (
          <Pause aria-hidden="true" size={16} />
        ) : (
          <Play aria-hidden="true" size={16} className="ml-0.5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className={`h-1.5 w-full rounded-full ${isMine ? 'bg-white/25' : 'bg-border'}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-150 ${
              isMine ? 'bg-white' : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`mt-1 text-[11px] ${isMine ? 'text-white/70' : 'text-text-muted'}`}>
          {formatDuration(playing || position > 0 ? position : duration)}
        </p>
      </div>
    </div>
  )
}

export default MessageAttachment
