let ctx = null
// Every oscillator currently scheduled/playing, across however many
// pulses+chirps are in flight, so stopEmergencySiren() can silence all
// of them at once regardless of which one triggered playEmergencySiren()
// or how far into the sequence it currently is.
let activeOscillators = []

function getCtx() {
  if (!ctx || ctx.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function track(osc) {
  activeOscillators.push(osc)
  // Self-removes once it's naturally finished playing, so the tracking
  // array doesn't grow unbounded across multiple sirens in one session
  // — stopEmergencySiren() only ever needs to worry about oscillators
  // that are still actually playing.
  osc.addEventListener('ended', () => {
    activeOscillators = activeOscillators.filter((o) => o !== osc)
  })
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
  track(osc)
}

/** Urgent wailing siren, played once when an emergency alert is submitted
 * or received live. Runs up to ~60 seconds unless stopEmergencySiren() is
 * called first (e.g. staff acknowledging or dismissing the alert). */
export function playEmergencySiren() {
  try {
    const audioCtx = getCtx()
    if (!audioCtx) return
    // A brand-new siren always replaces whatever's still playing from a
    // previous one, rather than layering on top of it — relevant if a
    // second alert comes in while an earlier one's siren is still
    // sounding.
    stopEmergencySiren()
    const now = audioCtx.currentTime
    // Louder + longer: more pulses (3 -> 6, roughly doubling total
    // duration) and higher gain on both the main wail and the chirp
    // accent (0.55 -> 0.85, 0.18 -> 0.35) — kept under 1.0 throughout
    // rather than pushed all the way to max, since gain values that
    // high clip/distort in WebAudio and end up sounding harsher and
    // less loud, not more.
    // 80 pulses at the existing 0.75s spacing works out to ~60 seconds
    // total (79 x 0.75s + the final pulse's ~0.73s tail ~= 60s) — cut
    // short well before that in practice once someone actually
    // acknowledges/dismisses the alert.
    const pulses = 80
    const pulseSpacing = 0.75
    for (let p = 0; p < pulses; p++) {
      const t0 = now + p * pulseSpacing
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(520, t0)
      osc.frequency.linearRampToValueAtTime(880, t0 + 0.3)
      osc.frequency.linearRampToValueAtTime(520, t0 + 0.6)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.linearRampToValueAtTime(0.85, t0 + 0.05)
      gain.gain.setValueAtTime(0.85, t0 + 0.58)
      gain.gain.linearRampToValueAtTime(0.0001, t0 + 0.68)
      osc.start(t0)
      osc.stop(t0 + 0.73)
      track(osc)
      tone(1046, 'square', t0 + 0.3, 0.08, 0.35, audioCtx)
    }
  } catch (e) {
    console.warn('playEmergencySiren:', e)
  }
}

/** Cuts the siren short — call this the moment an alert is acknowledged
 * or dismissed, rather than letting it keep sounding for its full
 * scheduled duration. Silences every pulse/chirp still ahead in the
 * sequence, including ones that haven't started playing yet. */
export function stopEmergencySiren() {
  if (!ctx) return
  const now = ctx.currentTime
  activeOscillators.forEach((osc) => {
    try {
      // .stop() on an oscillator that hasn't started yet (still ahead in
      // the schedule) is valid and just cancels it outright — no
      // audible click, since it was never sounding. One that's actively
      // playing gets stopped immediately, which CAN click; live with
      // that trade-off here since an emergency siren cutting off
      // abruptly the instant someone acknowledges it is the correct
      // behavior, not a bug to smooth over.
      osc.stop(now)
    } catch {
      // Already stopped/ended - nothing to do.
    }
  })
  activeOscillators = []
}