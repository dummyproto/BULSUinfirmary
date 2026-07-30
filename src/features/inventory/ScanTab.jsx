import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { timeAgo } from './lib/inventoryHelpers'
import { parseQRPayload } from './ScanVerifyModal'
import {
  RefreshCwIcon,
  SearchIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CameraIcon,
  ImageIcon,
  KeyboardIcon,
  SquareIcon,
  TrashIcon,
  ClipboardIcon,
  FlaskConicalIcon,
  HistoryIcon,
  ZapIcon,
  MaximizeIcon,
  CheckIcon,
  FileTextIcon,
  TagIcon,
  EyeIcon,
  XIcon,
} from '@components/ui/icons'

const SAMPLE_QR = '{"name":"Vitamin B Complex","category":"Medicine","qty":150,"unit":"Tablets","batch":"VBC-2026-001","expiry":"2028-09-30","supplier":"HealthPlus","minStock":30}'
const TEST_SCANS = [
  { label: 'Restock Existing', data: '{"name":"Paracetamol 500mg","category":"Medicine","qty":50,"unit":"Tablets","batch":"PCT-2026-002","expiry":"2028-06-30","supplier":"MedSupply","minStock":50}' },
]

const STATUS_ICONS = { info: SearchIcon, success: CheckCircleIcon, error: AlertTriangleIcon }

function StatusIcon({ status }) {
  const Icon = STATUS_ICONS[status.kind] || SearchIcon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon width={13} height={13} /> {status.text || 'Ready to scan'}
    </span>
  )
}

// Best-effort parse of the most recent scan_history row into the fields
// the "Scanned Item" panel wants (batch/expiry aren't columns on
// scan_history itself — see services/inventoryService.addScanHistory —
// so they're recovered from the same raw_data payload
// parseQRPayload/ScanVerifyModal already knows how to read). Our own
// printed batch QR codes (type:'batch') have a different shape with no
// `name` field, so this falls back to scan_history's own item_name/
// category/quantity columns whenever the raw payload doesn't parse into
// something usable — the panel always shows *something* sensible
// regardless of which kind of code was scanned.
function summarizeLastScan(entry) {
  if (!entry) return null
  let parsed = null
  try {
    parsed = entry.raw_data ? parseQRPayload(entry.raw_data) : null
  } catch {
    // parsed stays null — already its initial value, nothing to reset.
  }
  return {
    name: parsed?.name || entry.item_name || 'Unknown item',
    category: parsed?.category || entry.category || '—',
    batch: parsed?.batch || '—',
    expiry: parsed?.expiry || '—',
    stock: parsed?.qty != null ? `${parsed.qty} ${parsed.unit || ''}`.trim() : entry.quantity != null ? String(entry.quantity) : '—',
    result: entry.result,
    scannedAt: entry.scanned_at,
  }
}

export default function ScanTab({ scanHistory, onProcessRaw }) {
  const [panel, setPanel] = useState(null) // 'manual' | 'upload' | null
  const [manualValue, setManualValue] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [decodeStatus, setDecodeStatus] = useState({ text: '', kind: 'info' })
  const [decoding, setDecoding] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const historyCardRef = useRef(null)

  // Below 768px, .qr-scan-layout collapses to a single column (see
  // legacy.css), so the Scanned Item + Scan History panel ends up
  // stacked far below the camera section instead of sitting beside it.
  // Tapping "Scan History" DOES correctly toggle it open — but with no
  // scroll, it opens off-screen below whatever the person is currently
  // looking at, which reads as "the button didn't do anything" even
  // though it worked. Scrolling it into view on open fixes that,
  // without needing to change the layout itself.
  useEffect(() => {
    if (historyOpen) historyCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [historyOpen])
  // OCR (read text/handwriting) — separate from decoding/decodeStatus
  // above (that's for QR/barcode). OCR runs on the SAME uploaded image
  // but through Tesseract.js instead of ZXing, and the result is never
  // auto-submitted — see readText()'s comment for why.
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrText, setOcrText] = useState(null)
  const fileInputRef = useRef(null)
  const viewportRef = useRef(null)

  // Live camera scanning — now backed by ZXing's BrowserMultiFormatReader
  // instead of jsQR. jsQR only ever decoded QR codes; ZXing's multi-format
  // reader decodes QR codes AND common 1D/text barcodes (Code 128, EAN-13/
  // 8, UPC-A/E, Code 39, ITF, Codabar, etc.) in one unified scan, which is
  // exactly what "also read text/written [barcodes]" needs — many printed
  // batch/product labels only carry a traditional barcode, not a QR code.
  // The getUserMedia/video-element setup below is unchanged from before;
  // only the "read frames from the video and decode" mechanism changed,
  // from jsQR's manual 250ms canvas-polling loop to ZXing's own
  // continuous-decode API running against the same live video element.
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const codeReaderRef = useRef(null)
  const scanControlsRef = useRef(null)
  if (codeReaderRef.current === null) codeReaderRef.current = new BrowserMultiFormatReader()

  useEffect(() => stopCamera, []) // stop the camera if the page is left while scanning

  // scan_history is fetched newest-first (listScanHistory orders by
  // scanned_at descending), so the most recent scan is simply index 0 —
  // no need for the reverse()/slice() gymnastics the history list below
  // uses for its own, separate display purposes.
  const lastScan = summarizeLastScan(scanHistory[0])

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
      setDecodeStatus({ text: 'Scanning for QR code or barcode…', kind: 'info' })
      // decodeFromVideoElement calls back on every frame it examines —
      // `result` is only set when something was actually found; on every
      // other frame it fires with a NotFoundException in `error`, which
      // is the library's normal "nothing here yet" signal, not a real
      // error, so it's silently ignored rather than surfaced.
      scanControlsRef.current = await codeReaderRef.current.decodeFromVideoElement(videoRef.current, (result) => {
        if (!result) return
        setDecodeStatus({ text: 'Code detected!', kind: 'success' })
        stopCamera()
        onProcessRaw(result.getText())
      })
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
    if (scanControlsRef.current) {
      scanControlsRef.current.stop()
      scanControlsRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setTorchOn(false)
    setDecodeStatus((s) => (s.kind === 'error' ? s : { text: 'Ready to scan', kind: 'info' }))
  }

  // Camera torch/flashlight — only supported on some devices/browsers
  // (mainly Android Chrome over a rear camera); there's no reliable way
  // to feature-detect this ahead of time other than trying it, so this
  // fails silently rather than showing an error for something the
  // person has no control over on their specific device.
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
    setOcrText(null)

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
    setOcrText(null)
    setOcrRunning(false)
  }

  async function decodeImage() {
    if (!imagePreview) return
    setDecoding(true)
    setDecodeStatus({ text: 'Decoding image…', kind: 'info' })
    try {
      // decodeFromImageUrl loads the data URL into its own image element
      // and decodes at natural resolution, trying multiple internal
      // strategies (including rotated attempts) — handles large phone
      // photos and unusual angles more robustly than the manual
      // multi-scale canvas loop this replaced, and now catches barcodes
      // (Code 128, EAN, UPC, etc.) in addition to QR codes.
      const result = await codeReaderRef.current.decodeFromImageUrl(imagePreview)
      setDecoding(false)
      setDecodeStatus({ text: 'Code detected!', kind: 'success' })
      setPanel(null)
      onProcessRaw(result.getText())
    } catch {
      setDecoding(false)
      setDecodeStatus({ text: 'No QR code or barcode found. Use a clearer, well-lit image.', kind: 'error' })
    }
  }

  // "Read Text" — OCR for plain printed or handwritten labels (like a
  // handwritten stock card) that don't have a QR code or barcode on them
  // at all. Tesseract.js (the OCR engine) is dynamically imported so its
  // sizable WASM payload is only ever downloaded by someone who actually
  // uses this feature, not everyone who opens the QR Scanner tab — same
  // lazy-loading approach already used for heic2any above.
  //
  // Deliberately does NOT feed the result into onProcessRaw the way a
  // decoded QR/barcode does. onProcessRaw expects a specific structured
  // payload (JSON or pipe-delimited: name|category|qty|unit|batch|
  // expiry|supplier|minStock) — raw OCR text from a handwritten note
  // ("Paracetamol 500G 24 pcs") won't match that shape, and silently
  // mis-mapping OCR guesses into item fields could create wrong
  // inventory records with no obvious sign anything went wrong. Instead
  // the extracted text is shown back for the person to read and copy the
  // relevant parts into the actual form themselves — especially
  // important for handwriting, where OCR accuracy is meaningfully lower
  // than on printed text and mistakes are expected, not exceptional.
  async function readText() {
    if (!imagePreview) return
    setOcrRunning(true)
    setOcrText(null)
    setDecodeStatus({ text: '', kind: 'info' })
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data } = await worker.recognize(imagePreview)
      await worker.terminate()
      const text = (data.text || '').trim()
      setOcrRunning(false)
      if (text) {
        setOcrText(text)
      } else {
        setDecodeStatus({ text: 'No readable text found in this image. Try better lighting or a closer, steadier photo.', kind: 'error' })
      }
    } catch (err) {
      setOcrRunning(false)
      setDecodeStatus({ text: `Text reading failed: ${err.message}`, kind: 'error' })
    }
  }

  return (
    <div className="qr-scan-layout">
      {/* Left — instructions */}
      <div className="card qr-instructions-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><CameraIcon width={15} height={15} /> Scan Inventory QR Code or Barcode</h3>
        <p>Position the QR code or barcode within the frame to scan and retrieve item information.</p>
        <ul className="qr-checklist">
          <li><CheckIcon width={13} height={13} /> Ensure good lighting</li>
          <li><CheckIcon width={13} height={13} /> Hold camera steady</li>
          <li><CheckIcon width={13} height={13} /> QR code or barcode will be scanned automatically</li>
        </ul>
        <button type="button" className="qr-upload-link" onClick={() => togglePanel('upload')}>
          <ImageIcon width={13} height={13} /> Upload an image instead
        </button>
      </div>

      {/* Center — camera viewport */}
      <div className="qr-camera-col">
        <div className="scan-viewport-wrap">
          <div className="scan-viewport" ref={viewportRef}>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              style={{ display: cameraActive ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
            />
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
                <div className="scan-idle-sub">Tap the camera icon below to start scanning</div>
              </div>
            )}
            <div className="scan-corner-tl" />
            <div className="scan-corner-tr" />
            <div className="scan-corner-bl" />
            <div className="scan-corner-br" />
            {cameraActive && <div className="scan-line" />}

            {/* Flash + fullscreen overlay controls — only meaningful once
                the camera is running; torch fails silently on
                unsupported devices (see toggleTorch's comment). */}
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
            <StatusIcon status={decodeStatus} />
          </div>
        </div>

        <div className="qr-camera-toggle-row">
          <button
            type="button"
            className={`btn ${cameraActive ? 'btn-red' : 'btn-blue'}`}
            onClick={() => (cameraActive ? stopCamera() : startCamera())}
            disabled={cameraStarting}
          >
            {cameraActive ? (<><SquareIcon width={13} height={13} /> Stop Camera</>) : cameraStarting ? 'Starting…' : (<><CameraIcon width={14} height={14} /> Start Camera</>)}
          </button>
        </div>

        {panel === 'upload' && (
          <div className="card scan-manual-wrap" style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '.05em' }}>UPLOAD QR CODE OR BARCODE IMAGE</label>
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
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-blue" disabled={!imagePreview || decoding} onClick={decodeImage} style={!imagePreview ? { opacity: 0.5 } : undefined}>
                {decoding ? 'Decoding…' : (<><SearchIcon width={13} height={13} /> Decode Image</>)}
              </button>
              <button type="button" className="btn btn-outline" disabled={!imagePreview || ocrRunning} onClick={readText} style={!imagePreview ? { opacity: 0.5 } : undefined} title="Read printed or handwritten text — no QR code or barcode needed">
                {ocrRunning ? 'Reading…' : (<><FileTextIcon width={13} height={13} /> Read Text</>)}
              </button>
              <button type="button" className="btn btn-outline" onClick={clearUpload}>
                <TrashIcon width={13} height={13} /> Clear
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
            {ocrText !== null && (
              <div className="ocr-result-box">
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileTextIcon width={12} height={12} /> EXTRACTED TEXT — REVIEW BEFORE USING
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8, lineHeight: 1.4 }}>
                  Handwriting can be misread — check this carefully against the original before copying anything into a form.
                </div>
                <textarea
                  className="form-input"
                  rows={4}
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  style={{ fontSize: 12.5, fontFamily: 'monospace', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => navigator.clipboard?.writeText(ocrText).catch(() => {})}
                  >
                    <ClipboardIcon width={12} height={12} /> Copy
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setManualValue(ocrText)
                      setOcrText(null)
                      setPanel('manual')
                    }}
                    title="Paste this text into Manual Entry so you can reformat it into the expected fields"
                  >
                    <KeyboardIcon width={12} height={12} /> Edit in Manual Entry
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {panel === 'manual' && (
          <div className="card scan-manual-wrap" style={{ marginTop: 12 }}>
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

        <div className="card qr-test-samples-card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><FlaskConicalIcon width={12} height={12} /> TEST SCAN SAMPLES</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TEST_SCANS.map((s) => (
              <button key={s.label} type="button" className="qr-sample-btn" onClick={() => onProcessRaw(s.data)}>
                <RefreshCwIcon width={12} height={12} /> {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom action row — Scan History toggles the panel on the
            right open on mobile (where it's stacked below instead of a
            side column); Manual Entry mirrors the reference design's
            bottom button pair. */}
        <div className="qr-bottom-actions">
          <button type="button" className="btn btn-outline" onClick={() => setHistoryOpen((v) => !v)}>
            <HistoryIcon width={13} height={13} /> Scan History
          </button>
          <button type="button" className="btn btn-blue" onClick={() => togglePanel('manual')}>
            <KeyboardIcon width={13} height={13} /> Manual Entry
          </button>
        </div>
      </div>

      {/* Right — last scanned item + history */}
      <div className={`qr-side-panel${historyOpen ? ' history-open' : ''}`}>
        <div className="card qr-scanned-item-card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TagIcon width={15} height={15} /> Scanned Item</h3>
          </div>
          {lastScan ? (
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{lastScan.name}</div>
              <div className="detail-row">
                <span className="detail-label">Category</span>
                <span className="detail-value">{lastScan.category}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Batch Number</span>
                <span className="detail-value">{lastScan.batch}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Expiry Date</span>
                <span className="detail-value">{lastScan.expiry}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Stock</span>
                <span className="detail-value">{lastScan.stock}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>Scanned {timeAgo(lastScan.scannedAt)}</div>
              <button type="button" className="btn btn-blue" style={{ width: '100%', marginTop: 14 }} onClick={() => setHistoryOpen(true)}>
                <EyeIcon width={13} height={13} /> View Item Details
              </button>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              Nothing scanned yet — start the camera or use Manual Entry to get started.
            </div>
          )}
        </div>

        <div className="card qr-history-card" ref={historyCardRef}>
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><HistoryIcon width={15} height={15} /> Scan History</h3>
            <button type="button" className="qr-history-close-btn" onClick={() => setHistoryOpen(false)} aria-label="Close">
              <XIcon width={14} height={14} />
            </button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {scanHistory.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No scans yet</div>
            )}
            {scanHistory.slice(0, 10).map((s, idx) => (
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