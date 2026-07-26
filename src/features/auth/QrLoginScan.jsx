import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { lookupEmailBySchoolId } from '@services/usersService'
import { extractSchoolIdCode, normalizeSchoolIdCode } from '@lib/schoolId'
import { CreditCardIcon, CameraIcon, SearchIcon, SquareIcon } from '@components/ui/icons'

export default function QrLoginScan({ onIdentified, onError }) {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => stopCamera, [])

  async function resolveCode(raw) {
    const code = normalizeSchoolIdCode(extractSchoolIdCode(raw))
    if (!code) return
    setScanStatus('Looking up account…')
    try {
      const foundEmail = await lookupEmailBySchoolId(code)
      if (!foundEmail) {
        setScanStatus('')
        onError('No account found for that ID. Try again or sign in with email.')
        return
      }
      stopCamera()
      setScanStatus('')
      onIdentified(foundEmail)
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
    if (code?.data) resolveCode(code.data)
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
              <div className="scan-idle-sub">Scan your ID's QR code to identify your account</div>
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