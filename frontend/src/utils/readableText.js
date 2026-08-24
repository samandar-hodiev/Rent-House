// Letters, in any script the app is read in.
const HAS_LOWER = /\p{Ll}/u
const HAS_LETTER = /\p{L}/u

/**
 * Renders text somebody typed in capitals as ordinary prose.
 *
 * An owner who types "12 XONALI UY" gets a card that shouts across the page and
 * sets a heading in a weight the type scale never intended. What they meant is
 * a title, not emphasis, so the interface presents it as one.
 *
 * Only text that is entirely uppercase is touched — a string containing any
 * lowercase letter was deliberately cased by whoever wrote it, and "3-xonali
 * UY" or a name with an acronym in it must survive untouched. That single test
 * is what keeps this from being a global `text-transform`, which would flatten
 * every intentional capital in the application along with the unintentional
 * ones.
 *
 * The first letter is capitalised, so a title that begins with a word still
 * reads as a sentence; one that begins with a number — which most do here —
 * simply lowercases. Punctuation, digits and spacing are left exactly as
 * typed: this changes how the words look, never what they say.
 */
export function toReadableCase(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return value

  // Nothing to reason about without letters, and anything already containing a
  // lowercase letter was cased on purpose.
  if (!HAS_LETTER.test(text) || HAS_LOWER.test(text)) return value

  const lowered = value.toLocaleLowerCase()
  const first = lowered.search(/\p{L}/u)
  // Only when a letter opens the string. "12 xonali uy" stays as it is; "uy
  // sotiladi" becomes "Uy sotiladi".
  if (first !== 0) return lowered
  return lowered.slice(0, 1).toLocaleUpperCase() + lowered.slice(1)
}
