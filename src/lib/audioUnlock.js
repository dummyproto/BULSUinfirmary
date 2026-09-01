// Shared by emergencySound.js and notificationSound.js — ONE AudioContext
// for the whole app rather than each maintaining its own, so there's a
// single unlock story instead of two separate ones.
//
// Browsers block audio from an AudioContext that was created/resumed
// OUTSIDE a genuine user gesture (a click, tap, or keypress) — resuming
// it from an async callback, like a realtime event arriving over the
// network, is silently ignored. Both sound features here are only ever
// triggered from exactly that kind of callback (EmergencyAlertListener.jsx
// and Topbar.jsx's own realtime listeners), so without this, the context
// would stay permanently suspended for the entire session and produce no
// sound at all — not intermittently, every single time.
let ctx = null
let unlocked = false

export function getSharedAudioContext() {
  if (!ctx || ctx.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// One-time, page-wide listener for the first click/keydown/touch of the
// session (whatever the person happens to do first, anywhere in the app
// — doesn't need to be related to notifications or emergencies at all)
// that creates and resumes the shared context from within that genuine
// gesture, then removes itself. By the time any real sound needs to
// play, the context is already unlocked and ready.
function unlockOnFirstInteraction() {
  if (unlocked) return
  unlocked = true
  getSharedAudioContext()
  window.removeEventListener('pointerdown', unlockOnFirstInteraction)
  window.removeEventListener('keydown', unlockOnFirstInteraction)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockOnFirstInteraction)
  window.addEventListener('keydown', unlockOnFirstInteraction)
}