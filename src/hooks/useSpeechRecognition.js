import { useCallback, useEffect, useRef, useState } from 'react'

// Vendor-prefixed in every browser that has it at all (Chrome/Edge only
// as of writing — no Firefox support, inconsistent Safari support), so
// this checks both names once at module load rather than per-render.
const SpeechRecognitionCtor =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
export const SPEECH_RECOGNITION_SUPPORTED = !!SpeechRecognitionCtor

// Feature-detection alone isn't reliable here — Brave in particular
// exposes webkitSpeechRecognition (so SPEECH_RECOGNITION_SUPPORTED is
// true) but blocks the underlying Google speech service by default for
// privacy, which typically surfaces as a 'network' or
// 'service-not-allowed' error the moment .start() is called rather than
// any actual transcription — easy to mistake for "the mic just doesn't
// work" since nothing about the UI looked wrong. Mapped to a real,
// specific message instead of the generic microphone-permission one,
// since telling someone to check mic permissions when the real problem
// is a browser privacy setting sends them to fix the wrong thing.
const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access was denied. Check your browser/site permissions and try again.',
  'service-not-allowed': "Your browser is blocking speech recognition (common in Brave's privacy settings). Try Chrome or Edge, or enable speech services in your browser's settings.",
  network: "Couldn't reach the speech recognition service — this can happen if your browser (e.g. Brave) blocks it by default, or if you're offline.",
  'audio-capture': 'No microphone was found. Check that one is connected and enabled.',
  'language-not-supported': "Your browser doesn't support speech recognition in this language.",
}

// No result AND no error within this long genuinely means something's
// silently wrong (the Brave case above, in particular, can hang with
// neither firing) rather than the person just being slow to start
// talking — stop listening and say so instead of leaving the mic
// button stuck in "Listening…" forever with nothing happening.
const SILENT_FAILURE_TIMEOUT_MS = 8000

/**
 * `listening`: whether the mic is currently capturing.
 * `start(onResult, onError, onInterim)`: begins listening;
 * `onResult(transcript)` fires once with the final recognized text when
 * the person stops talking. `onInterim(transcript)` (optional) fires
 * repeatedly with partial, still-being-refined text WHILE they're
 * talking — wiring this into the input box gives real-time feedback
 * that the mic is actually hearing them, rather than a silent wait
 * until they stop.
 * `stop()`: cancels early, e.g. if they tap the mic again mid-listen.
 */
export function useSpeechRecognition() {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const silentTimeoutRef = useRef(null)

  function clearSilentTimeout() {
    if (silentTimeoutRef.current) {
      clearTimeout(silentTimeoutRef.current)
      silentTimeoutRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearSilentTimeout()
      recognitionRef.current?.abort()
    }
  }, [])

  const stop = useCallback(() => {
    clearSilentTimeout()
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(
    (onResult, onError, onInterim) => {
      if (!SPEECH_RECOGNITION_SUPPORTED) return
      // Already listening — treat a second tap as "stop", same
      // start/stop-on-tap pattern as the listen button.
      if (listening) {
        stop()
        return
      }
      const recognition = new SpeechRecognitionCtor()
      // Browser's own language setting rather than a hardcoded
      // 'en-US' — this app's chatbot itself detects and replies in
      // whatever language the person types, so hardcoding English-only
      // recognition here would silently produce garbled or empty
      // results for anyone speaking Filipino/Tagalog, Bisaya, etc.,
      // even though typing in those languages works fine.
      recognition.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.onresult = (event) => {
        clearSilentTimeout()
        const result = event.results?.[event.results.length - 1]
        const transcript = result?.[0]?.transcript ?? ''
        if (result?.isFinal) {
          onResult(transcript)
        } else {
          onInterim?.(transcript)
        }
      }
      recognition.onerror = (event) => {
        clearSilentTimeout()
        // 'no-speech' and 'aborted' aren't real failures worth
        // surfacing (silence, or the person tapped stop themselves) —
        // everything else gets a specific message when one exists,
        // falling back to the raw error code so it's still visible
        // rather than silently swallowed if it's a code not mapped
        // above.
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          onError?.(ERROR_MESSAGES[event.error] || `Speech recognition error: ${event.error}`)
        }
      }
      recognition.onend = () => {
        clearSilentTimeout()
        setListening(false)
      }
      recognitionRef.current = recognition
      setListening(true)
      recognition.start()

      clearSilentTimeout()
      silentTimeoutRef.current = setTimeout(() => {
        recognition.abort()
        setListening(false)
        onError?.("Didn't hear anything, or your browser may be blocking speech recognition (this happens by default in Brave). Try again, or use a different browser like Chrome or Edge.")
      }, SILENT_FAILURE_TIMEOUT_MS)
    },
    [listening, stop]
  )

  return { listening, start, stop, supported: SPEECH_RECOGNITION_SUPPORTED }
}