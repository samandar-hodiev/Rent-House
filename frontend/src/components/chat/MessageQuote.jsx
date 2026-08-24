import { useLocale } from '../../context/LocaleContext'

// A quoted message has no text of its own when it is an attachment, and none
// left at all once it has been withdrawn. Both need something to show.
function quoteText(quote, t) {
  if (quote.isDeleted) return t('chat.messageDeleted')
  if (quote.body) return quote.body
  switch (quote.kind) {
    case 'image':
      return t('chat.quoteImage')
    case 'audio':
      return t('chat.quoteAudio')
    case 'file':
      return t('chat.quoteFile')
    default:
      return ''
  }
}

/**
 * The message a reply answers, shown above the reply's own text.
 *
 * Used in two places with the same shape: inside a bubble, and above the
 * composer while a reply is being written. `onSurface` picks the palette,
 * because inside an outgoing bubble the background is the primary colour and
 * the usual text tokens would be unreadable on it.
 */
function MessageQuote({ quote, authorName, onSurface = false, className = '' }) {
  const { t } = useLocale()

  return (
    <div
      className={`flex flex-col gap-0.5 border-l-2 pl-2 ${
        onSurface ? 'border-white/60' : 'border-primary'
      } ${className}`}
    >
      <span
        className={`truncate text-[11px] font-medium ${
          onSurface ? 'text-white/90' : 'text-primary'
        }`}
      >
        {authorName}
      </span>
      <span
        className={`line-clamp-2 break-words text-[11px] ${
          quote.isDeleted ? 'italic ' : ''
        }${onSurface ? 'text-white/70' : 'text-text-muted'}`}
      >
        {quoteText(quote, t)}
      </span>
    </div>
  )
}

export default MessageQuote
