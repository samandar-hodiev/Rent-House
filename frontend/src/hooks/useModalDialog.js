import { useEffect, useRef } from 'react'

/**
 * The two things every dialog in the dashboard needs: focus when it opens, and
 * Escape to close it.
 *
 * Both are easy to get subtly wrong, and did go wrong: the focus call and the
 * key listener shared one effect whose dependency was the caller's `onClose`.
 * That prop is usually an inline arrow, so its identity changes on every render
 * — and every keystroke inside the dialog re-ran the effect and pulled focus
 * back to the container. Typing produced one character and then stopped.
 *
 * So: focus runs once, on open. The listener subscribes once and reads the
 * latest handler through a ref, which makes it immune to an unstable callback
 * rather than merely tolerant of one.
 *
 * Returns the ref to put on the dialog element.
 */
export function useModalDialog(onClose, { disabled = false } = {}) {
  const dialogRef = useRef(null)

  // Kept in refs and updated on every render, so the listener below can call
  // the current versions without having to be torn down and rebuilt.
  const handlerRef = useRef(onClose)
  handlerRef.current = onClose
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // Only if nothing inside has already taken it. A dialog whose first field
    // is autofocused should leave the cursor in that field; stealing it back
    // would mean the person has to click before they can type.
    if (!dialog.contains(document.activeElement)) dialog.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !disabledRef.current) handlerRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return dialogRef
}
