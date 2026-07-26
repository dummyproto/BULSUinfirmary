import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { lookupRegistrationQr, checkStudentNumberRegistered } from '@services/usersService'
import { extractRegistrationPayload, normalizeSchoolIdCode } from '@lib/schoolId'
import { CreditCardIcon, CameraIcon, SearchIcon, SquareIcon } from '@components/ui/icons'

// Modeled directly on QrLoginScan.jsx — same camera lifecycle
// (getUserMedia, jsQR polling every 250ms, manual-entry fallback,
// stopCamera on unmount). The differences are all about WHAT a decoded
// frame means: a login scan resolves to one existing account's email; a
// registration scan resolves to prefill data for an account that doesn't
// exist yet, and — critically — never blocks progress just because the
// scanned code isn't in `registration_qr_codes` (see migration 023's
// seeding-gap note). `onScanned` (not `onIdentified`) keeps this distinct
// from the login component's callback shape.
export default function RegisterQrScan({ onScanned, onError }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [scanStatus, setScanStatus] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => stopCamera, [])

  async function resolvePayload(raw) {
    const payload = extractRegistrationPayload(raw)
    const code = normalizeSchoolIdCode(payload.rawCode)
    if (!code) return
    setScanStatus('Reading ID…')
    try {
      const dbMatch = await lookupRegistrationQr(code)
if (payload.studentNumber) {
  const alreadyRegistered = await checkStudentNumberRegistered(payload.studentNumber)
  if (alreadyRegistered) {
    stopCamera()
    setScanStatus('')
    onError('This QR code has already been registered. Please use a different QR code.')
    return
  }
}
      if (dbMatch?.is_used) {
      stopCamera()
     setScanStatus('')
       onError('Your QR code is already registered. Please try another, or sign in if this is your account.')
       return
    }

      // Not found in `registration_qr_codes` is expected, not an error —
      // this app has no seeding flow yet (see KNOWN_ISSUES.md "Phase Q").
      // Fall back to whatever the QR payload itself contained rather than
      // hard-blocking registration on an unseeded table.
      stopCamera()
      setScanStatus('')
      onScanned({
        studentNumber: dbMatch?.student_number || payload.studentNumber,
        fullName: dbMatch?.full_name || payload.fullName,
        course: dbMatch?.course || payload.course,
        yearLevel: dbMatch?.year_level || payload.yearLevel,
        rawCode: code,
      })
    } catch (err) {
      setScanStatus('')
      onError(`Lookup failed: ${err.message}`)
    }
  }

  async function startCamera() {
    setCameraStarting()
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
  }

  function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) resolvePayload(code.data)
  }

  return (
    <div>
      <div className="scan-viewport-wrap">
        <div className="scan-viewport" style={{ aspectRatio: '4/3' }}>
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
              <div className="scan-idle-sub">Scan your ID's QR code to fill in your details</div>
            </div>
          )}
          <div className="scan-corner-tl" />
          <div className="scan-corner-tr" />
          <div className="scan-corner-bl" />
          <div className="scan-corner-br" />
          {cameraActive && <div className="scan-line" />}
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
