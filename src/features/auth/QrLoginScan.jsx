import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { lookupEmailBySchoolId } from '@services/usersService'
import { extractSchoolIdCode, normalizeSchoolIdCode } from '@lib/schoolId'
import { CreditCardIcon, CameraIcon, SearchIcon, SquareIcon, ZapIcon, MaximizeIcon } from '@components/ui/icons'

export default function QrLoginScan({ onIdentified, onError }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const pollRef = useRef(null)
  const viewportRef = useRef(null)
  // Guards against captureFrame() firing resolveCode() more than once for
  // the same held-up QR code. The 250ms poll interval decodes the same
  // physical code on several consecutive frames while someone holds their
  // ID in front of the camera — without this lock, each of those frames
  // kicked off its OWN independent lookupEmailBySchoolId() ->
  // checkEmailHasPin() chain (in LoginPage's handleIdentified), all racing
  // each other over the network. Whichever call happened to resolve LAST
  // won the final setMode(...) in LoginPage — so a straggler call could
  // silently flip the screen from the PIN pad back to the password field
  // right after it had already (briefly) shown correctly, making it look
  // like the PIN screen "never appeared" even for accounts that do have a
  // PIN set. Locking on the first decoded frame, and stopping the poll
  // immediately (before the async lookup even starts) rather than only
  // after it resolves, means only one resolveCode() is ever in flight.
  const resolvingRef = useRef(false)

  useEffect(() => stopCamera, [])

  async function resolveCode(raw) {
    const code = normalizeSchoolIdCode(extractSchoolIdCode(raw))
    if (!code) {
      resolvingRef.current = false
      return
    }
    setScanStatus('Looking up account…')
    try {
      const foundEmail = await lookupEmailBySchoolId(code)
      if (!foundEmail) {
        setScanStatus('')
        onError('No account found for that ID. Try again or sign in with email.')
        // Not a match — let them try again by resuming the poll instead
        // of leaving the camera silently stuck on "locked".
        resolvingRef.current = false
        if (cameraActive && !pollRef.current) pollRef.current = setInterval(captureFrame, 250)
        return
      }
      stopCamera()
      setScanStatus('')
      onIdentified(foundEmail)
    } catch (err) {
      setScanStatus('')
      onError(`Lookup failed: ${err.message}`)
      resolvingRef.current = false
      if (cameraActive && !pollRef.current) pollRef.current = setInterval(captureFrame, 250)
    }
  }

  async function startCamera() {
    // Was previously called with no argument at all (setCameraStarting()),
    // so `cameraStarting` never actually became true — the button's
    // "Starting…" label could never show, since the state it depends on
    // was stuck at its initial `false` the whole time this function ran.
    setCameraStarting(true)
    setScanStatus('')
    onError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraActive(true)
      setScanStatus('Point your camera at your ID QR code…')
      pollRef.current = setInterval(captureFrame, 250)
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Camera access denied. Please allow camera access, or enter your ID code manually below.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Enter your ID code manually below.'
            : `Camera error: ${err.message}`
      onError(msg)
    } finally {
      setCameraStarting(false)
    }
  }

  function stopCamera() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setTorchOn(false)
    resolvingRef.current = false
  }

  // Best-effort — only supported on some devices/browsers (mainly
  // Android Chrome over a rear camera). Fails silently rather than
  // showing an error for something the person has no control over on
  // their specific device — same as the Inventory QR Scanner's version.
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] })
      setTorchOn((v) => !v)
    } catch {
      // Device/browser doesn't support torch control — nothing to do.
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else {
      viewportRef.current?.requestFullscreen?.().catch(() => {})
    }
  }

  function captureFrame() {
    if (resolvingRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      // Lock immediately, before the async lookup even starts — see the
      // comment on resolvingRef above.
      resolvingRef.current = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      resolveCode(code.data)
    }
  }

  return (
    <div>
      <div className="scan-viewport-wrap">
        <div className="scan-viewport" ref={viewportRef} style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            style={{ display: cameraActive ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {!cameraActive && (
            <div className="scan-idle-state">
              <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-3)' }}><CreditCardIcon width={40} height={40} /></div>
              <div className="scan-idle-label">Camera not started</div>
              <div className="scan-idle-sub">Scan your ID's QR code to identify your account</div>
            </div>
          )}
          <div className="scan-corner-tl" />
          <div className="scan-corner-tr" />
          <div className="scan-corner-bl" />
          <div className="scan-corner-br" />
          {cameraActive && <div className="scan-line" />}

          {/* Flash + fullscreen overlay controls, matching the redesigned
              Inventory QR Scanner — same idea, same visual treatment. */}
          {cameraActive && (
            <button type="button" className="scan-overlay-btn scan-overlay-flash" onClick={toggleTorch} title="Toggle flash" aria-label="Toggle flash">
              <ZapIcon width={16} height={16} style={torchOn ? { color: '#FBBF24' } : undefined} />
            </button>
          )}
          <button type="button" className="scan-overlay-btn scan-overlay-fullscreen" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">
            <MaximizeIcon width={16} height={16} />
          </button>
        </div>
        <div className="scan-status-bar">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><SearchIcon width={12} height={12} /> {scanStatus || 'Ready to scan'}</span>
        </div>
      </div>

      <button type="button" className="login-btn" style={{ marginTop: 12 }} onClick={() => (cameraActive ? stopCamera() : startCamera())} disabled={cameraStarting}>
        {cameraActive ? (<><SquareIcon width={11} height={11} /> Stop Camera</>) : cameraStarting ? 'Starting…' : (<><CameraIcon width={13} height={13} /> Start Camera</>)}
      </button>
    </div>
  )
}