import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { CHAT_EVENTS } from '../services/chatSocket'

// Synthesized rather than loaded from a file: two short notes need no asset, no
// network request and no decision about where to host it, and the volume is
// under this code's control rather than baked into a recording.
const NOTES = [
  { frequency: 880, startAt: 0, duration: 0.09 }, // A5
  { frequency: 1174.7, startAt: 0.08, duration: 0.13 }, // D6
]
// Quiet on purpose. This announces a message, it does not demand attention.
const PEAK_GAIN = 0.07

/**
 * A short tone when somebody else's message arrives.
 *
 * Separate from the toast, which is suppressed while the thread is already on
 * screen. A sound is not: the reader may be looking at the composer, or at
 * another part of the window, and hearing the message land is the point. What
 * it must never do is chime for the reader's own message.
 *
 * Browsers refuse to start audio until the page has been interacted with, so
 * the context is created on the first click or keypress and the sound is simply
 * skipped before that. There is no prompt to dismiss and nothing to configure —
 * by the time anyone is in a conversation they have clicked something.
 */
export function useMessageSound() {
  const { subscribe, isAuthenticated } = useChat()
  const { user } = useAuth()

  const contextRef = useRef(null)
  const myIdRef = useRef(user?.id)
  myIdRef.current = user?.id

  // Message ids already sounded. The same message can arrive twice — a
  // reconnect refetch alongside a live frame — and it should be heard once.
  const heardRef = useRef(new Set())

  // One AudioContext for the tab, created by a real user gesture so it starts
  // in the "running" state rather than "suspended".
  useEffect(() => {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContextClass) return undefined

    const unlock = () => {
      if (!contextRef.current) {
        try {
          contextRef.current = new AudioContextClass()
        } catch {
          // Audio is unavailable in this browser or blocked by policy. The
          // chat works exactly as before, only silently.
          return
        }
      }
      // A context created before the gesture — or suspended by the browser
      // when the tab was backgrounded — resumes here.
      if (contextRef.current.state === 'suspended') contextRef.current.resume().catch(() => {})
    }

    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    return subscribe((envelope) => {
      if (envelope.event !== CHAT_EVENTS.messageNew) return

      const payload = envelope.payload
      // The sender's own echo, delivered so their other tabs stay in step.
      if (!payload || payload.sender_id === myIdRef.current) return

      if (heardRef.current.has(payload.id)) return
      heardRef.current.add(payload.id)
      // The set is only there to stop an immediate repeat; without a bound it
      // would grow for as long as the tab is open.
      if (heardRef.current.size > 200) {
        heardRef.current = new Set([payload.id])
      }

      play(contextRef.current)
    })
  }, [subscribe, isAuthenticated])
}

/**
 * Two soft notes, or nothing at all.
 *
 * Every failure here is silent by design: audio being unavailable is not
 * something to interrupt a conversation over.
 */
function play(context) {
  if (!context || context.state !== 'running') return

  try {
    const now = context.currentTime
    for (const note of NOTES) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      // A sine has no harmonics, which is what keeps this from sounding like
      // an alert. The ramps matter as much as the volume: a tone that starts
      // or stops abruptly clicks.
      oscillator.type = 'sine'
      oscillator.frequency.value = note.frequency

      const start = now + note.startAt
      const end = start + note.duration
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(end + 0.02)
    }
  } catch {
    // Ignored deliberately — see above.
  }
}
