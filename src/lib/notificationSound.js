let ctx = null
let unlocked = false

function getCtx() {
  if (!ctx || ctx.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Browsers block audio from an AudioContext that was created/resumed
// OUTSIDE a genuine user gesture (a click, tap, or keypress) — resuming
// it from an async callback, like a realtime event arriving over the
// network, is silently ignored. Since playNotificationSound() below is
// only ever called from exactly that kind of callback (Topbar.jsx's
// realtime notifications listener), the context would otherwise stay
// permanently suspended for the entire session and produce no sound at
// all — not intermittently, every single time. This attaches a
// one-time, page-wide listener for the first click/keydown/touch of the
// session (whatever the person happens to do first, anywhere in the
// app — doesn't need to be related to notifications at all) that
// creates and resumes this context from within that genuine gesture,
// then removes itself. By the time any real notification arrives, the
// context is already unlocked and ready.
function unlockOnFirstInteraction() {
  if (unlocked) return
  unlocked = true
  getCtx()
  window.removeEventListener('pointerdown', unlockOnFirstInteraction)
  window.removeEventListener('keydown', unlockOnFirstInteraction)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockOnFirstInteraction)
  window.addEventListener('keydown', unlockOnFirstInteraction)
}

/** Notification chime played when a new notification arrives (Topbar.jsx's
 * bell) — three quick ascending notes, loud and clearly noticeable rather
 * than a background blip, but still a musical chime rather than a harsh
 * alarm tone (that's what playEmergencySiren() in emergencySound.js is
 * for). Triangle wave instead of a plain sine — richer in overtones, so
 * it reads as louder/more present at the same gain level, without
 * sounding harsh the way a square or sawtooth wave would. */
export function playNotificationSound() {
  try {
    const audioCtx = getCtx()
    if (!audioCtx) return
    const now = audioCtx.currentTime
    const notes = [
      { freq: 784, start: 0, duration: 0.16 }, // G5
      { freq: 1046.5, start: 0.1, duration: 0.16 }, // C6 — a fourth up
      { freq: 1568, start: 0.2, duration: 0.32 }, // G6 — an octave up from the first note, the held final note
    ]
    notes.forEach(({ freq, start, duration }) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + start)
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.linearRampToValueAtTime(0.6, now + start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
      osc.start(now + start)
      osc.stop(now + start + duration + 0.05)
    })
  } catch (e) {
    console.warn('playNotificationSound:', e)
  }
}