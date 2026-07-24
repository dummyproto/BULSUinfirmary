import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { timeAgo } from './lib/inventoryHelpers'
import { RefreshCwIcon, SearchIcon, AlertTriangleIcon, CheckCircleIcon, CameraIcon, ImageIcon, KeyboardIcon, SquareIcon, TrashIcon, ClipboardIcon, FlaskConicalIcon, HistoryIcon } from '@components/ui/icons'

const SAMPLE_QR = '{"name":"Vitamin B Complex","category":"Medicine","qty":150,"unit":"Tablets","batch":"VBC-2026-001","expiry":"2028-09-30","supplier":"HealthPlus","minStock":30}'
const TEST_SCANS = [
  { label: 'Restock Existing', data: '{"name":"Paracetamol 500mg","category":"Medicine","qty":50,"unit":"Tablets","batch":"PCT-2026-002","expiry":"2028-06-30","supplier":"MedSupply","minStock":50}' },
]

const STATUS_ICONS = { info: SearchIcon, success: CheckCircleIcon, error: AlertTriangleIcon }

// A real phone-camera photo is commonly 4000×3000 (12MP) or larger —
// applying the existing [1, 0.5, 2] scale attempts directly to that
// would mean a worst case of 8000×6000 (48MP) for the 2x pass, which can
// exceed the browser's canvas size/memory limits and throw inside
// drawImage/getImageData. Downscaling to this ceiling first (applied to
// the *longest* side, so aspect ratio is preserved) before running the
// existing scale multipliers keeps the worst case (2x this ceiling)
// comfortably under any real browser's limits, while jsQR still gets
// the same multiple resolutions to try against.
const MAX_UPLOAD_DIMENSION = 1800

function StatusIcon({ status }) {
  const Icon = STATUS_ICONS[status.kind] || SearchIcon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon width={13} height={13} /> {status.text || 'Ready to scan'}
    </span>
  )
}

export default function ScanTab({ scanHistory, onProcessRaw }) {
  const [panel, setPanel] = useState(null) // 'manual' | 'upload' | null
  const [manualValue, setManualValue] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [decodeStatus, setDecodeStatus] = useState({ text: '', kind: 'info' })
  const [decoding, setDecoding] = useState(false)
  const fileInputRef = useRef(null)

  // Live camera scanning — ported from initQRScanner/startCamera/
  // stopCamera/captureFrame. MediaStream/video/canvas are inherently
  // imperative APIs, so refs (not state) are the right tool here, same as
  // the legacy code's direct DOM handles.
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => stopCamera, []) // stop the camera if the page is left while scanning

  function togglePanel(name) {
    setPanel((p) => (p === name ? null : name))
  }

  async function startCamera() {
    setCameraStarting(true)
    setDecodeStatus({ text: '', kind: 'info' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraActive(true)
      setDecodeStatus({ text: 'Scanning for QR/Barcode…', kind: 'info' })
      pollRef.current = setInterval(captureFrame, 250)
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Camera access denied. Please allow camera access in browser settings.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Use Manual Entry instead.'
            : `Camera error: ${err.message}`
      setDecodeStatus({ text: msg, kind: 'error' })
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
    setDecodeStatus((s) => (s.kind === 'error' ? s : { text: 'Ready to scan', kind: 'info' }))
  }

  function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      setDecodeStatus({ text: 'QR Code detected!', kind: 'success' })
      stopCamera()
      onProcessRaw(code.data)
    }
  }

  function handleManualSubmit() {
    if (!manualValue.trim()) return
    setPanel(null)
    onProcessRaw(manualValue)
  }

  // iPhones save camera photos as HEIC by default — a format neither
  // Chrome nor Firefox can load into an <img> element at all (Safari
  // can). Uploading a QR photo taken straight from an iPhone's camera
  // roll would silently fail every time on those browsers before this
  // fix: the file picker happily lets you select it (the OS reports it
  // as an image), but img.onerror below would immediately fire. This is
  // very plausibly *the* "upload doesn't work" complaint for anyone
  // scanning a printed batch label with their phone rather than a
  // desktop screenshot. Detected by extension as well as MIME type,
  // since some browsers/OSes report an empty or generic MIME type for
  // HEIC specifically.
  function isHeic(file) {
    const type = (file.type || '').toLowerCase()
    const name = (file.name || '').toLowerCase()
    return type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')
  }

  async function handleFileSelected(file) {
    if (!file) return
    setImageFile(file)
    setDecodeStatus({ text: '', kind: 'info' })

    let toRead = file
    if (isHeic(file)) {
      setDecodeStatus({ text: 'Converting photo…', kind: 'info' })
      try {
        const { default: heic2any } = await import('heic2any')
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
        toRead = Array.isArray(converted) ? converted[0] : converted
        setDecodeStatus({ text: '', kind: 'info' })
      } catch {
        setDecodeStatus({ text: 'Could not convert this HEIC photo. Try taking the photo with "Most Compatible" format in your camera settings, or use a JPG/PNG instead.', kind: 'error' })
        return
      }
    }

    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.onerror = () => setDecodeStatus({ text: 'Could not read this file. Try a different image.', kind: 'error' })
    reader.readAsDataURL(toRead)
  }

  function clearUpload() {
    setImageFile(null)
    setImagePreview(null)
    setDecodeStatus({ text: '', kind: 'info' })
  }

  function decodeImage() {
    if (!imagePreview) return
    setDecoding(true)
    setDecodeStatus({ text: 'Decoding image…', kind: 'info' })
    const img = new Image()
    img.onload = () => {
      try {
        // Downscale to a safe ceiling first (preserving aspect ratio),
        // then run the existing scale attempts relative to THAT size,
        // not the original (possibly huge) natural dimensions — see
        // MAX_UPLOAD_DIMENSION above for why.
        const longestSide = Math.max(img.naturalWidth, img.naturalHeight)
        const baseScale = longestSide > MAX_UPLOAD_DIMENSION ? MAX_UPLOAD_DIMENSION / longestSide : 1
        const baseWidth = Math.round(img.naturalWidth * baseScale)
        const baseHeight = Math.round(img.naturalHeight * baseScale)

        // Try a couple of canvas scales — a still image can afford more
        // decode attempts than a live 250ms-polled video frame can.
        const scales = [1, 0.5, 2]
        let found = null
        for (const scale of scales) {
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(baseWidth * scale)
          canvas.height = Math.round(baseHeight * scale)
          if (canvas.width < 1 || canvas.height < 1) continue
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })
          if (code?.data) {
            found = code.data
            break
          }
        }
        setDecoding(false)
        if (found) {
          setDecodeStatus({ text: 'QR Code detected!', kind: 'success' })
          setPanel(null)
          onProcessRaw(found)
        } else {
          setDecodeStatus({ text: 'No QR code found. Use a clearer, well-lit image.', kind: 'error' })
        }
      } catch {
        // A canvas/memory error mid-decode (e.g. an unusually large
        // source image even after downscaling, or a browser-specific
        // limit) previously left `decoding` stuck true forever, since
        // nothing after the throwing line ever ran — this is the actual
        // bug this phase fixes. Every path now always resolves to a
        // visible message, never a stuck spinner.
        setDecoding(false)
        setDecodeStatus({ text: 'Could not process this image. Try a smaller/clearer photo.', kind: 'error' })
      }
    }
    img.onerror = () => {
      setDecoding(false)
      setDecodeStatus({ text: 'Could not load this file as an image — it may be corrupted or an unsupported format. Try a JPG or PNG.', kind: 'error' })
    }
    img.src = imagePreview
  }

  return (
    <div className="scan-layout">
      <div className="card scan-main-card">
        <div className="card-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><CameraIcon width={15} height={15} /> QR / Barcode Scanner</h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Point camera at QR code or enter code manually</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${cameraActive ? 'btn-red' : 'btn-outline'}`}
              onClick={() => (cameraActive ? stopCamera() : startCamera())}
              disabled={cameraStarting}
            >
              {cameraActive ? (<><SquareIcon width={11} height={11} /> Stop Camera</>) : cameraStarting ? 'Starting…' : (<><CameraIcon width={13} height={13} /> Start Camera</>)}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'linear-gradient(135deg,#0EA5E9,#0369A1)', color: 'white' }}
              onClick={() => togglePanel('upload')}
            >
              <ImageIcon width={13} height={13} /> Upload Image
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: 'white' }}
              onClick={() => togglePanel('manual')}
            >
              <KeyboardIcon width={13} height={13} /> Manual Entry
            </button>
          </div>
        </div>

        <div className="scan-viewport-wrap">
          <div className="scan-viewport">
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
                <div className="scan-qr-icon">
                  <svg width="64" height="64" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="4">
                    <rect x="10" y="10" width="30" height="30" rx="2" />
                    <rect x="15" y="15" width="20" height="20" rx="1" fill="currentColor" opacity=".15" />
                    <rect x="60" y="10" width="30" height="30" rx="2" />
                    <rect x="65" y="15" width="20" height="20" rx="1" fill="currentColor" opacity=".15" />
                    <rect x="10" y="60" width="30" height="30" rx="2" />
                    <rect x="15" y="65" width="20" height="20" rx="1" fill="currentColor" opacity=".15" />
                    <line x1="60" y1="60" x2="90" y2="60" />
                    <line x1="60" y1="60" x2="60" y2="90" />
                    <line x1="75" y1="60" x2="75" y2="75" />
                    <line x1="60" y1="75" x2="75" y2="75" />
                    <line x1="90" y1="75" x2="75" y2="75" />
                    <line x1="90" y1="75" x2="90" y2="90" />
                    <line x1="60" y1="90" x2="75" y2="90" />
                  </svg>
                </div>
                <div className="scan-idle-label">Camera not started</div>
                <div className="scan-idle-sub">Click &quot;Start Camera&quot;, upload an image, or use Manual Entry</div>
              </div>
            )}
            <div className="scan-corner-tl" />
            <div className="scan-corner-tr" />
            <div className="scan-corner-bl" />
            <div className="scan-corner-br" />
            {cameraActive && <div className="scan-line" />}
          </div>
          <div className="scan-status-bar">
            <StatusIcon status={decodeStatus} />
          </div>
        </div>

        {panel === 'upload' && (
          <div className="scan-manual-wrap">
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '.05em' }}>UPLOAD QR IMAGE</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                handleFileSelected(e.dataTransfer.files?.[0])
              }}
              style={{ marginTop: 10, border: '2px dashed var(--border)', borderRadius: 10, padding: '28px 16px', textAlign: 'center', cursor: 'pointer' }}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Uploaded" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,.12)' }} />
              ) : (
                <>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: 'var(--text-3)' }}><ImageIcon width={36} height={36} /></div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Click to upload or drag &amp; drop</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Supports JPG, PNG, GIF, WEBP, HEIC (iPhone photos)</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Camera roll uploads work directly — no need to screenshot first</div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, minHeight: 18 }}>{imageFile?.name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-blue" disabled={!imagePreview || decoding} onClick={decodeImage} style={!imagePreview ? { opacity: 0.5 } : undefined}>
                {decoding ? 'Decoding…' : (<><SearchIcon width={13} height={13} /> Decode Image</>)}
              </button>
              <button type="button" className="btn btn-outline" onClick={clearUpload}>
                <TrashIcon width={13} height={13} /> Clear
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {panel === 'manual' && (
          <div className="scan-manual-wrap">
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '.05em' }}>PASTE QR DATA / BARCODE VALUE</label>
            <textarea
              className="form-input"
              rows={3}
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder={`Paste QR payload, e.g.: {"name":"Paracetamol 500mg","category":"Medicine","qty":100,"unit":"Tablets","batch":"PCT-2026-001","expiry":"2028-06-30","supplier":"PharmaCorp","minStock":50}\nor pipe format: Paracetamol 500mg|Medicine|100|Tablets|PCT-2026-001|2028-06-30|PharmaCorp|50`}
              style={{ fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginTop: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-blue" onClick={handleManualSubmit}>
                <SearchIcon width={13} height={13} /> Process QR Data
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setManualValue(SAMPLE_QR)}>
                <ClipboardIcon width={13} height={13} /> Load Sample
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><FlaskConicalIcon width={12} height={12} /> TEST SCAN SAMPLES</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TEST_SCANS.map((s) => (
              <button key={s.label} type="button" className="qr-sample-btn" onClick={() => onProcessRaw(s.data)}>
                <RefreshCwIcon width={12} height={12} /> {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="scan-side-panel">
        <div className="card" style={{ height: '100%' }}>
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><HistoryIcon width={15} height={15} /> Scan History</h3>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {scanHistory.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No scans yet</div>
            )}
            {[...scanHistory].reverse().slice(0, 10).map((s, idx) => (
              <div className="scan-history-item" key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{s.item_name}</div>
                  <span
                    className={`badge ${s.result === 'Saved' ? 'badge-green' : s.result === 'Duplicate' ? 'badge-orange' : 'badge-red'} badge-no-dot`}
                    style={{ fontSize: 10 }}
                  >
                    {s.result}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  Qty: {s.quantity} · {s.category}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(s.scanned_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
