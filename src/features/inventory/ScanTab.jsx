import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import jsQR from 'jsqr'
import Modal from '@components/ui/Modal'
import { formatDate, formatDateTime } from '@lib/format'
import { timeAgo, findInventoryItemsByName } from './lib/inventoryHelpers'
import { parseQRPayload, parseMultiQRPayload } from './ScanVerifyModal'
import {
  RefreshCwIcon,
  SearchIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CameraIcon,
  ImageIcon,
  SquareIcon,
  TrashIcon,
  ClipboardIcon,
  FlaskConicalIcon,
  HistoryIcon,
  ZapIcon,
  MaximizeIcon,
  CheckIcon,
  FileTextIcon,
  EyeIcon,
} from '@components/ui/icons'

const TEST_SCANS = [
  { label: 'Restock Existing', data: '{"name":"Paracetamol 500mg","category":"Medicine","qty":50,"unit":"Tablets","batch":"PCT-2026-002","expiry":"2028-06-30","supplier":"MedSupply","minStock":50}' },
]

const STATUS_ICONS = { info: SearchIcon, success: CheckCircleIcon, error: AlertTriangleIcon }

// ZXing reader tuned for real-world scans: TRY_HARDER makes it search the
// whole frame (rotated/tilted/small codes) instead of a fast single pass,
// and listing only the formats this app actually uses stops it from wasting
// time (and console warnings) on formats it never needs.
function createScanReader() {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 500 })
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image failed to load'))
    img.src = src
  })
}

// Decodes an uploaded image the robust way. Large phone photos (3000-4000px)
// often fail when handed to ZXing at full size, so this tries the image at
// several sizes, and at each size tries ZXing first and then jsQR (the same
// library the login/register QR scanners already use successfully) before
// moving on. Returns the decoded text, or null if nothing could be read.
async function decodeImageRobust(reader, src) {
  const img = await loadImageElement(src)
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height
  const longest = Math.max(natW, natH)
  const seen = new Set()
  for (const maxSide of [Math.min(longest, 2000), 1400, 1000, 700, 450]) {
    const scale = Math.min(1, maxSide / longest)
    const w = Math.max(1, Math.round(natW * scale))
    const h = Math.max(1, Math.round(natH * scale))
    const key = `${w}x${h}`
    if (seen.has(key)) continue
    seen.add(key)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#fff' // transparent PNGs would otherwise decode as black
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    try {
      return reader.decodeFromCanvas(canvas).getText()
    } catch {
      // ZXing found nothing at this size — fall through to jsQR.
    }
    const frame = ctx.getImageData(0, 0, w, h)
    const code = jsQR(frame.data, w, h, { inversionAttempts: 'attemptBoth' })
    if (code?.data) return code.data
  }
  return null
}

function StatusIcon({ status }) {
  const Icon = STATUS_ICONS[status.kind] || SearchIcon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon width={13} height={13} /> {status.text || 'Ready to scan'}
    </span>
  )
}

// Best-effort parse of ONE scan_history row into everything the "Scan
// Details" window shows. batch/expiry/supplier/etc. aren't columns on
// scan_history itself (see services/inventoryService.addScanHistory), so
// they're recovered from the same raw_data payload parseQRPayload /
// ScanVerifyModal already knows how to read. Our own printed batch QR
// codes (type:'batch') have a different shape with no `name`, and a
// whole-delivery code holds several items — so a payload only counts as
// "usable" when it parses to a named item; otherwise the row's own
// item_name / category / quantity columns are shown instead, so the
// window always shows *something* sensible whichever code was scanned.
function summarizeScan(entry) {
  if (!entry) return null
  let parsed = null
  let multi = null
  try {
    if (entry.raw_data) {
      parsed = parseQRPayload(entry.raw_data)
      if (!parsed) multi = parseMultiQRPayload(entry.raw_data)
    }
  } catch {
    // parsed/multi stay null — already their initial values, nothing to reset.
  }
  const usable = parsed && parsed.name ? parsed : null
  const qty = usable ? usable.qty : entry.quantity
  return {
    name: usable?.name || entry.item_name || 'Unknown item',
    category: usable?.category || entry.category || '—',
    quantity: qty != null && qty !== '' ? `${qty} ${usable?.unit || ''}`.trim() : '—',
    batch: usable?.batch || '—',
    expiry: usable?.expiry || '',
    supplier: usable?.supplier || '—',
    minStock: usable?.minStock != null ? String(usable.minStock) : '—',
    received: usable?.receivedDate || '',
    result: entry.result,
    scannedAt: entry.scanned_at,
    rawData: entry.raw_data || '',
    items: multi,
  }
}

export default function ScanTab({ scanHistory, inventory, onProcessRaw, canDelete, onDelete, onViewItem, scanPaused }) {
  const [panel, setPanel] = useState(null) // 'upload' | null
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [decodeStatus, setDecodeStatus] = useState({ text: '', kind: 'info' })
  const [decoding, setDecoding] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  // Scan Details window. detailOpen and detailEntry are separate on
  // purpose: Modal fades out for ~180ms after isOpen goes false, and
  // keeping the entry around until then stops the content from going
  // blank mid-fade.
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailEntry, setDetailEntry] = useState(null)

  // Same enter-selection-mode-first pattern as NotificationCenterTab.jsx
  // and the main Topbar notifications bell — checkboxes stay hidden
  // until Delete is actually clicked, keeping the compact history list
  // uncluttered the rest of the time.
  const [historySelectionMode, setHistorySelectionMode] = useState(false)
  const [historySelected, setHistorySelected] = useState([])
  const visibleHistory = scanHistory.slice(0, 10)

  function toggleHistorySelectionMode() {
    setHistorySelectionMode((m) => !m)
    setHistorySelected([])
  }
  function toggleHistoryOne(id) {
    setHistorySelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function toggleHistoryAll() {
    const visibleIds = visibleHistory.map((s) => s.scan_id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => historySelected.includes(id))
    setHistorySelected(allSelected ? historySelected.filter((id) => !visibleIds.includes(id)) : [...new Set([...historySelected, ...visibleIds])])
  }
  async function handleDeleteHistorySelected() {
    await onDelete(historySelected)
    setHistorySelected([])
    setHistorySelectionMode(false)
  }

  function openScanDetails(entry) {
    setDetailEntry(entry)
    setDetailOpen(true)
  }

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
  const [sessionScanCount, setSessionScanCount] = useState(0)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const codeReaderRef = useRef(null)
  const scanControlsRef = useRef(null)
  // Tracks the most recently processed code + when, purely to dedupe:
  // ZXing's decodeFromVideoElement callback fires on every frame it
  // examines (many times a second), so a single item held steadily in
  // front of the camera would otherwise get re-processed dozens of times
  // a second — opening the confirm modal, closing it, opening it again,
  // over and over — instead of being read once and moving on to the next
  // item. A ref (not state) is used deliberately: this needs to be read
  // and written synchronously inside the decode callback below, which is
  // set up once in startCamera() and would otherwise see a stale,
  // captured-at-mount-time value of this if it were React state.
  const lastScanRef = useRef({ text: '', at: 0 })
  // jsQR fallback for the live camera: ZXing's callback also fires on frames
  // where it found nothing, so those frames get a second chance with jsQR
  // (throttled, on a downscaled copy of the frame, to stay cheap).
  const fallbackCanvasRef = useRef(null)
  const lastFallbackAtRef = useRef(0)
  function readFrameWithJsQr(video) {
    if (!video || !video.videoWidth) return null
    const now = Date.now()
    if (now - lastFallbackAtRef.current < 250) return null
    lastFallbackAtRef.current = now
    if (!fallbackCanvasRef.current) fallbackCanvasRef.current = document.createElement('canvas')
    const canvas = fallbackCanvasRef.current
    const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight))
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, w, h)
    const frame = ctx.getImageData(0, 0, w, h)
    const code = jsQR(frame.data, w, h, { inversionAttempts: 'attemptBoth' })
    return code?.data || null
  }
  if (codeReaderRef.current === null) codeReaderRef.current = createScanReader()
  // Mirrors the `scanPaused` prop into a ref for the same reason
  // lastScanRef exists — the decode callback below is handed to ZXing
  // ONCE per startCamera() call and keeps firing on every frame after
  // that, so it would otherwise only ever see whatever `scanPaused` was
  // at the moment the camera started, not its current value each time a
  // confirm modal opens or closes in the parent.
  const scanPausedRef = useRef(scanPaused)
  useEffect(() => {
    scanPausedRef.current = scanPaused
  }, [scanPaused])

    useEffect(() => stopCamera, []) // stop the camera if the page is left while scanning

  // The scan history row currently open in the "Scanned Item Details"
  // window, parsed into display fields (null until a row is clicked).
  const detail = summarizeScan(detailEntry)
  // The current inventory record for the scanned item (null for a whole-
  // delivery scan, or if the item has since been removed from inventory).
  const detailMatch = detail && !detail.items && inventory ? findInventoryItemsByName(inventory, detail.name)[0] || null : null

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
      setSessionScanCount(0)
      lastScanRef.current = { text: '', at: 0 }
      setDecodeStatus({ text: 'Scanning for QR code or barcode…', kind: 'info' })
      // decodeFromVideoElement calls back on every frame it examines —
      // `result` is only set when something was actually found; on every
      // other frame it fires with a NotFoundException in `error`, which
      // is the library's normal "nothing here yet" signal, not a real
      // error, so it's silently ignored rather than surfaced.
      //
      // Deliberately does NOT stop the camera or call onProcessRaw again
      // for the SAME code within a 3-second cooldown — without this, a
      // single item held steadily in front of the camera gets re-decoded
      // on nearly every frame (many times a second), which used to
      // immediately call stopCamera() and shut the whole feed off after
      // the very first read. That meant scanning a second item required
      // manually pressing "Start Camera" again every single time. Now the
      // feed stays live: each NEWLY seen code (or the same code again
      // after the cooldown, e.g. if it's genuinely rescanned later) is
      // handed to onProcessRaw and the camera just keeps running,
      // ready for the next item to be held up to it — a full session can
      // read as many different items in a row as the person presents,
      // without ever needing to restart the camera in between.
      scanControlsRef.current = await codeReaderRef.current.decodeFromVideoElement(videoRef.current, (result) => {
        if (scanPausedRef.current) return
        const text = result ? result.getText() : readFrameWithJsQr(videoRef.current)
        if (!text) return
        const now = Date.now()
        if (text === lastScanRef.current.text && now - lastScanRef.current.at < 3000) return
        lastScanRef.current = { text, at: now }
        setSessionScanCount((n) => n + 1)
        setDecodeStatus({ text: 'Code detected! Scanning for next item…', kind: 'success' })
        onProcessRaw(text)
      })
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Camera access denied. Please allow camera access in browser settings.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Use Upload Image instead.'
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
      const text = await decodeImageRobust(codeReaderRef.current, imagePreview)
      setDecoding(false)
      if (!text) {
        setDecodeStatus({ text: 'No QR code or barcode found. Use a clearer, well-lit image.', kind: 'error' })
        return
      }
      setDecodeStatus({ text: 'Code detected!', kind: 'success' })
      setPanel(null)
      onProcessRaw(text)
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
            {/* Derived at render time instead of stored via a useEffect
                (see the comment that used to sit above the now-removed
                effect near the top of this component) — avoids the
                react-hooks/set-state-in-effect lint rule entirely, and is
                simpler: this is just "what to show right now", not a
                separate piece of state that needs to be kept in sync. */}
            <StatusIcon status={cameraActive && scanPaused ? { text: 'Waiting for the current item to be confirmed…', kind: 'info' } : decodeStatus} />
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
          {/* Only meaningful once at least one item has been read this
              session — before that, showing "0 scanned" would just read
              as noise. Camera intentionally keeps running after each
              scan now (see startCamera's decode callback), so this is
              the main visible confirmation that holding up item after
              item is actually being picked up, not just the first one. */}
          {cameraActive && sessionScanCount > 0 && (
            <span className="badge badge-green badge-no-dot" style={{ fontSize: 11 }}>
              <CheckCircleIcon width={12} height={12} /> {sessionScanCount} scanned this session
            </span>
          )}
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
                </div>
              </div>
            )}
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

        {/* Bottom action row — Upload Image opens the image-upload panel
            (replaces the old Manual Entry button). The Scan History
            button that used to sit beside it is gone: Scan History is now
            always visible in the side panel. */}
        <div className="qr-bottom-actions">
          <button type="button" className="btn btn-blue" onClick={() => togglePanel('upload')}>
            <ImageIcon width={13} height={13} /> Upload Image
          </button>
        </div>
      </div>

      {/* Right — Scan History (replaces the old "Scanned Item" card).
          .qr-history-card is display:none unless its parent has the
          .history-open class (legacy.css), so that class is always on
          now — the history no longer has a toggle button. */}
      <div className="qr-side-panel history-open">
        <div className="card qr-history-card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 6 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><HistoryIcon width={15} height={15} /> Scan History</h3>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
              {canDelete && historySelectionMode && historySelected.length > 0 && (
                <button type="button" className="btn btn-sm btn-red" onClick={handleDeleteHistorySelected}>
                  <TrashIcon width={12} height={12} /> Delete ({historySelected.length})
                </button>
              )}
              {canDelete && (
                <button type="button" className="btn btn-sm btn-outline" onClick={toggleHistorySelectionMode}>
                  {historySelectionMode ? 'Cancel' : (<><TrashIcon width={12} height={12} /> Delete</>)}
                </button>
              )}
            </div>
          </div>
          {canDelete && historySelectionMode && visibleHistory.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', padding: '8px 14px 0' }}>
              <input type="checkbox" checked={visibleHistory.every((s) => historySelected.includes(s.scan_id))} onChange={toggleHistoryAll} />
              Select all
            </label>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {scanHistory.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No scans yet</div>
            )}
            {visibleHistory.map((s) => (
              <div
                className="scan-history-item"
                key={s.scan_id}
                role="button"
                tabIndex={0}
                title={historySelectionMode ? 'Select this scan' : 'View full details'}
                onClick={() => (historySelectionMode ? toggleHistoryOne(s.scan_id) : openScanDetails(s))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  if (historySelectionMode) toggleHistoryOne(s.scan_id)
                  else openScanDetails(s)
                }}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}
              >
                {historySelectionMode && (
                  <input
                    type="checkbox"
                    checked={historySelected.includes(s.scan_id)}
                    onChange={() => toggleHistoryOne(s.scan_id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 3, flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{timeAgo(s.scanned_at)}</span>
                    {/* Icon-only view button. Decorative on purpose (the whole
                        row is already the clickable control, and its title
                        reads "View full details") — a real <button> in here
                        would nest one interactive element inside another. */}
                    {!historySelectionMode && (
                      <span
                        aria-hidden="true"
                        style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      >
                        <EyeIcon width={13} height={13} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Scanned Item Details"
        icon={<EyeIcon width={16} height={16} />}
        wide={!!detail?.items}
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDetailOpen(false)}>
              Close
            </button>
            {detailMatch && onViewItem && (
              <button
                type="button"
                className="btn btn-blue"
                onClick={() => {
                  setDetailOpen(false)
                  onViewItem(detailMatch)
                }}
              >
                <EyeIcon width={13} height={13} /> View Inventory Item
              </button>
            )}
          </>
        }
      >
        {detail && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{detail.items ? `Delivery of ${detail.items.length} items` : detail.name}</div>
              <span className={`badge ${detail.result === 'Saved' ? 'badge-green' : detail.result === 'Duplicate' ? 'badge-orange' : 'badge-red'} badge-no-dot`}>
                {detail.result}
              </span>
            </div>

            {detail.items ? (
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12 }}>
                <table className="compact-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Batch</th>
                      <th>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it, idx) => (
                      <tr key={`${it.name}-${it.batch}-${idx}`}>
                        <td style={{ fontSize: 12 }}>{it.name}</td>
                        <td style={{ fontSize: 12 }}>{`${it.qty} ${it.unit || ''}`.trim()}</td>
                        <td style={{ fontSize: 12 }}>{it.batch || '—'}</td>
                        <td style={{ fontSize: 12 }}>{it.expiry ? formatDate(it.expiry) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div className="detail-row"><span className="detail-label">Category</span><span className="detail-value">{detail.category}</span></div>
                <div className="detail-row"><span className="detail-label">Quantity</span><span className="detail-value">{detail.quantity}</span></div>
                <div className="detail-row"><span className="detail-label">Batch Number</span><span className="detail-value">{detail.batch}</span></div>
                <div className="detail-row"><span className="detail-label">Expiry Date</span><span className="detail-value">{detail.expiry ? formatDate(detail.expiry) : '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Supplier</span><span className="detail-value">{detail.supplier}</span></div>
                <div className="detail-row"><span className="detail-label">Minimum Stock</span><span className="detail-value">{detail.minStock}</span></div>
                <div className="detail-row"><span className="detail-label">Date Received</span><span className="detail-value">{detail.received ? formatDate(detail.received) : '—'}</span></div>
              </>
            )}

            <div className="detail-row"><span className="detail-label">Result</span><span className="detail-value">{detail.result}</span></div>
            <div className="detail-row">
              <span className="detail-label">Scanned</span>
              <span className="detail-value">{formatDateTime(detail.scannedAt)} ({timeAgo(detail.scannedAt)})</span>
            </div>

            {detail.rawData && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>RAW SCAN DATA</div>
                <pre style={{ margin: 0, padding: 10, maxHeight: 140, overflow: 'auto', fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {detail.rawData}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}