import { useCallback, useEffect, useRef, useState } from 'react'

// Candidate recording formats, best first.
//
// MediaRecorder does not agree across browsers: Chrome and Firefox produce WebM
// with Opus, Safari produces MP4 with AAC. Asking for one and assuming it works
// is how voice messages end up broken on somebody else's machine, so the first
// supported type is used and the server accepts all of them.
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
]

/** The recording format this browser will actually produce, or null. */
export function supportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return null
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? null
}

/** Whether recording is possible at all here. */
export function canRecord() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined' &&
      supportedMimeType(),
  )
}

/**
 * Records a voice note.
 *
 * States: idle → recording → (stop → a blob) or (cancel → nothing). The caller
 * decides what to do with the blob; this hook owns the microphone and is
 * responsible for letting go of it.
 *
 * Releasing the track matters: a stream left open keeps the browser's recording
 * indicator lit and the microphone held against other applications.
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState(null)

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  // Set by cancel(), and read when the recorder stops, so a cancelled
  // recording resolves to nothing instead of producing a blob nobody wants.
  const cancelledRef = useRef(false)

  const release = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  // A recording still running when the composer unmounts must not keep the
  // microphone.
  useEffect(() => release, [release])

  const start = useCallback(async () => {
    setError(null)

    const mimeType = supportedMimeType()
    if (!mimeType) {
      setError('unsupported')
      return false
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Denied, dismissed, or no microphone. They are indistinguishable from
      // here and lead to the same message.
      setError('permission')
      return false
    }

    const recorder = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []
    cancelledRef.current = false

    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) chunksRef.current.push(event.data)
    }

    streamRef.current = stream
    recorderRef.current = recorder
    recorder.start()

    setSeconds(0)
    setRecording(true)
    timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000)
    return true
  }, [])

  /** Stops and resolves with `{ blob, mimeType, seconds }`, or null if cancelled. */
  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null)

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const cancelled = cancelledRef.current
        const chunks = chunksRef.current
        const mimeType = recorder.mimeType || supportedMimeType()
        const elapsed = seconds

        release()
        setRecording(false)
        setSeconds(0)

        if (cancelled || chunks.length === 0) {
          resolve(null)
          return
        }
        // The type is stripped of its codec parameter: the server matches on
        // the base type, and "audio/webm;codecs=opus" is still audio/webm.
        const base = mimeType.split(';')[0]
        resolve({ blob: new Blob(chunks, { type: base }), mimeType: base, seconds: elapsed })
      }
      recorder.stop()
    })
  }, [release, seconds])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      return
    }
    release()
    setRecording(false)
    setSeconds(0)
  }, [release])

  return { recording, seconds, error, start, stop, cancel, clearError: () => setError(null) }
}
