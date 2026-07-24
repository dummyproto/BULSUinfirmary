let ctx = null

function getCtx() {
  if (!ctx || ctx.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq, type, startTime, duration, gainVal, audioCtx) {
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  gain.gain.setValueAtTime(gainVal, startTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

/** Urgent 3-pulse wailing siren, played once when an emergency alert is submitted. */
export function playEmergencySiren() {
  try {
    const audioCtx = getCtx()
    if (!audioCtx) return
    const now = audioCtx.currentTime
    const pulses = 3
    for (let p = 0; p < pulses; p++) {
      const t0 = now + p * 0.72
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(520, t0)
      osc.frequency.linearRampToValueAtTime(880, t0 + 0.3)
      osc.frequency.linearRampToValueAtTime(520, t0 + 0.6)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.linearRampToValueAtTime(0.55, t0 + 0.05)
      gain.gain.setValueAtTime(0.55, t0 + 0.55)
      gain.gain.linearRampToValueAtTime(0.0001, t0 + 0.65)
      osc.start(t0)
      osc.stop(t0 + 0.7)
      tone(1046, 'square', t0 + 0.3, 0.08, 0.18, audioCtx)
    }
  } catch (e) {
    console.warn('playEmergencySiren:', e)
  }
}
