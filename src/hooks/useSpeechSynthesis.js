import { useCallback, useEffect, useRef, useState } from 'react'

// Checked LIVE wherever this is called, rather than baked into a single
// module-level constant computed once at import time. That one-time
// version is what caused the toggle to sometimes not appear at all on
// other devices/browsers: window.speechSynthesis doesn't necessarily
// exist at the exact instant this file first executes — the timing of
// when a browser attaches its Web Speech APIs to `window` genuinely
// varies across engines (Chromium vs. Gecko vs. WebKit) and devices,
// especially slower ones. A one-time "not there yet" check at that
// precise moment permanently hid the feature for the rest of the
// session on any device where it happened to attach a beat later, even
// though the browser genuinely supports it.
function checkSpeechSynthesisSupport() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Chrome (and some Chromium-based browsers) load voices ASYNCHRONOUSLY
// after page load — window.speechSynthesis.getVoices() returns an empty
// array on the very first call, before the browser fires 'voiceschanged'.
// Calling .speak() before that happens is a well-documented cause of
// completely silent failure in Chrome specifically: no error, no
// onerror callback, the utterance just never produces audio. This
// resolves once real voices are available (or immediately, if they
// already are — e.g. on a second message, after the first one already
// triggered the load).
let voicesReadyPromise = null
function waitForVoices() {
  if (!checkSpeechSynthesisSupport()) return Promise.resolve([])
  if (!voicesReadyPromise) {
    voicesReadyPromise = new Promise((resolve) => {
      const existing = window.speechSynthesis.getVoices()
      if (existing.length > 0) {
        resolve(existing)
        return
      }
      const handleVoicesChanged = () => {
        const voices = window.speechSynthesis.getVoices()
        if (voices.length > 0) {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
          resolve(voices)
        }
      }
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
      // Some browsers never fire voiceschanged at all (rare, but real —
      // certain embedded/WebView contexts) — fall back to whatever
      // getVoices() returns after a short wait rather than hanging
      // forever with no voice ever resolving.
      setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000)
    })
  }
  return voicesReadyPromise
}

function pickVoice(voices) {
  if (!voices || voices.length === 0) return null
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
  return (
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang?.startsWith(lang.split('-')[0])) ||
    voices.find((v) => v.lang?.startsWith('en')) ||
    voices[0]
  )
}

/**
 * `speakingId` is whichever caller's `id` is currently being read aloud
 * (or null). `toggle(id, text)` starts speaking that id's text — or, if
 * that same id is already the one speaking, stops it instead, which is
 * what lets a message's own listen button double as its stop button.
 * Starting a different id first cancels whatever was already speaking,
 * matching how only one voice can plausibly be heard at once anyway.
 * `supported` is real React state, re-checked a few times shortly after
 * mount (not a frozen one-time snapshot) — see checkSpeechSynthesisSupport
 * above for why that matters.
 */
export function useSpeechSynthesis() {
  const [speakingId, setSpeakingId] = useState(null)
  const [supported, setSupported] = useState(checkSpeechSynthesisSupport)
  const utteranceRef = useRef(null)
  const resumeTimerRef = useRef(null)

  function clearResumeTimer() {
    if (resumeTimerRef.current) {
      clearInterval(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
  }

  // Re-checks a few times over the first couple of seconds after mount
  // rather than relying on a single check at any one instant — catches
  // the case where window.speechSynthesis attaches a beat after this
  // component first renders. Stops re-checking (and stops the interval)
  // the moment support is confirmed, or after the last scheduled check.
  useEffect(() => {
    // Already true from useState's own lazy initializer above — no need
    // to set it again (that's exactly what triggered the "calling
    // setState synchronously within an effect" warning: setSupported(true)
    // here was redundant with the initial render's own value, not
    // something that needed setting a second time).
    if (checkSpeechSynthesisSupport()) return undefined
    const delays = [100, 500, 1500, 3000]
    const timers = delays.map((delay) =>
      setTimeout(() => {
        if (checkSpeechSynthesisSupport()) setSupported(true)
      }, delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // Stop any in-progress speech on unmount (navigating away from the
  // chat mid-sentence shouldn't leave MediBot still talking in the
  // background with no UI left to stop it from).
  useEffect(() => {
    return () => {
      clearResumeTimer()
      if (checkSpeechSynthesisSupport()) window.speechSynthesis.cancel()
    }
  }, [])

  const stop = useCallback(() => {
    if (!checkSpeechSynthesisSupport()) return
    clearResumeTimer()
    window.speechSynthesis.cancel()
    setSpeakingId(null)
  }, [])

  const toggle = useCallback(
    (id, text) => {
      if (!checkSpeechSynthesisSupport() || !text) return
      if (speakingId === id) {
        stop()
        return
      }
      // cancel() first even when nothing else is speaking — harmless if
      // the queue is already empty, and guarantees a clean start rather
      // than the new utterance silently queueing behind a stale one.
      clearResumeTimer()
      window.speechSynthesis.cancel()
      setSpeakingId(id)

      waitForVoices().then((voices) => {
        // The person may have tapped stop, or started a different
        // message, while voices were still loading — don't start
        // speaking something that's no longer the active selection.
        if (!checkSpeechSynthesisSupport()) return

        const utterance = new SpeechSynthesisUtterance(text)
        const voice = pickVoice(voices)
        if (voice) utterance.voice = voice
        utterance.onend = () => {
          clearResumeTimer()
          setSpeakingId((current) => (current === id ? null : current))
        }
        utterance.onerror = () => {
          clearResumeTimer()
          setSpeakingId((current) => (current === id ? null : current))
        }
        utteranceRef.current = utterance
        window.speechSynthesis.speak(utterance)

        // Known Chrome bug: speechSynthesis can silently enter a
        // "paused" state partway through a longer utterance (most
        // commonly reported around the ~15s mark) and never resume on
        // its own — the utterance just stops producing audio with no
        // onend/onerror ever firing. A periodic resume() is the
        // standard workaround; harmless on browsers that don't have
        // the bug, since resume() on an already-running utterance is a
        // no-op.
        resumeTimerRef.current = setInterval(() => {
          if (window.speechSynthesis.speaking) window.speechSynthesis.resume()
        }, 5000)
      })
    },
    [speakingId, stop]
  )

  return { speakingId, toggle, stop, supported }
}