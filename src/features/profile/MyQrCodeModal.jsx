import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import Modal from '@components/ui/Modal'
import { QrCodeIcon, DownloadIcon } from '@components/ui/icons'
import { buildUserQrPayload } from '@lib/schoolId'

export default function MyQrCodeModal({ isOpen, onClose, profile }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [error, setError] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!isOpen || !profile) return
    QRCode.toDataURL(buildUserQrPayload(profile), { width: 480, margin: 3 })
      .then(setDataUrl)
      .catch((err) => setError(err.message))
  }, [isOpen, profile])

  // Fullscreen only ever makes sense while the modal itself is open —
  // closing the modal (or the profile changing out from under it) should
  // never leave a dangling fullscreen overlay with nothing to dismiss it.
  useEffect(() => {
    const closeFullscreen = () => setFullscreen(false)
    if (!isOpen) closeFullscreen()
  }, [isOpen])

  if (!isOpen || !profile) return null

  const idLabel = profile.school_id_barcode || profile.student_number || null

  // Slugifies the name/ID into a safe filename — falls back to the raw
  // user_id if somehow both name and idLabel are missing, so this never
  // produces an empty/invalid download name.
  function handleDownload() {
    if (!dataUrl) return
    const namePart = (profile.name || idLabel || profile.user_id || 'qr-code').trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${namePart}-qr-code.png`
    a.click()
  }

  return (
    <>
      <Modal
        isOpen={isOpen && !fullscreen}
        onClose={onClose}
        title="My QR Code"
        icon={<QrCodeIcon width={16} height={16} />}
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-teal" onClick={handleDownload} disabled={!dataUrl} style={{ opacity: dataUrl ? 1 : 0.5 }}>
              <DownloadIcon width={13} height={13} /> Download PNG
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            style={{ background: '#fff', padding: 12, borderRadius: 8, minHeight: 284, minWidth: 284, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: dataUrl ? 'pointer' : 'default' }}
            onClick={() => dataUrl && setFullscreen(true)}
          >
            {error ? (
              <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>
            ) : dataUrl ? (
              <img src={dataUrl} alt={`QR code for ${profile.name}`} width={260} height={260} />
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Generating…</span>
            )}
          </div>
          <div style={{ width: '100%', textAlign: 'center', fontSize: 12, color: 'var(--text-2)' }}>
            <strong>{profile.name}</strong>
            {idLabel && <div style={{ marginTop: 2, color: 'var(--text-3)' }}>{idLabel}</div>}
          </div>
        </div>
      </Modal>

      {fullscreen &&
        createPortal(
          <div
            role="button"
            tabIndex={0}
            onClick={() => setFullscreen(false)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFullscreen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              cursor: 'pointer',
            }}
          >
            {dataUrl && (
              <img
                src={dataUrl}
                alt={`QR code for ${profile.name}`}
                style={{ width: 'min(85vw, 85vh)', height: 'min(85vw, 85vh)', maxWidth: 480, maxHeight: 480 }}
              />
            )}
            <div style={{ textAlign: 'center', color: '#111' }}>
              <strong style={{ fontSize: 16 }}>{profile.name}</strong>
              {idLabel && <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>{idLabel}</div>}
            </div>
            {dataUrl && (
              <button
                type="button"
                className="btn btn-teal"
                // Fullscreen closes on any click within it (see the
                // outer div's onClick) — without stopping propagation
                // here, tapping Download would immediately close the
                // overlay instead of triggering the download.
                onClick={(e) => {
                  e.stopPropagation()
                  handleDownload()
                }}
              >
                <DownloadIcon width={13} height={13} /> Download PNG
              </button>
            )}
            <span style={{ fontSize: 12, color: '#888' }}>Tap anywhere to close</span>
          </div>,
          document.body
        )}
    </>
  )
}