import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Modal from '@components/ui/Modal'
import { QrCodeIcon, DownloadIcon } from '@components/ui/icons'
import { formatDate } from '@lib/format'

// Kept intentionally minimal — the app re-fetches the batch's live data
// from the database on scan (see InventoryPage.jsx's handleProcessRaw),
// so every extra field beyond these two does nothing but make the QR
// code physically denser and harder for a phone camera to read
// reliably. `medicine` is kept as a short fallback label only used if
// the batch has since been deleted (see the 'Invalid' scan-history
// branch) — everything else that used to be encoded here (batch code,
// lot, expiration, supplier, quantity) was never actually read back
// after a scan; it was pure dead weight on the QR's density.
export function buildBatchQRPayload(batch) {
  return JSON.stringify({
    type: 'batch',
    medicine_batch_id: batch.medicine_batch_id,
    medicine: batch.item_name,
  })
}

export default function BatchQRModal({ isOpen, batch, onClose }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen || !batch) return
    QRCode.toDataURL(buildBatchQRPayload(batch), { width: 320, margin: 3 })
      .then(setDataUrl)
      .catch((err) => setError(err.message))
  }, [isOpen, batch])

  if (!isOpen || !batch) return null

  function handleDownload() {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `batch-qr-${batch.batch_code}.png`
    a.click()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Batch QR Code"
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
        <div style={{ background: '#fff', padding: 12, borderRadius: 8, minHeight: 284, minWidth: 284, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>
          ) : dataUrl ? (
            <img src={dataUrl} alt={`QR code for batch ${batch.batch_code}`} width={260} height={260} />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Generating…</span>
          )}
        </div>
        <div style={{ width: '100%', fontSize: 12, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>
            <strong>{batch.item_name}</strong>
          </div>
          <div>Batch: {batch.batch_code}</div>
          {batch.lot_number && <div>Lot: {batch.lot_number}</div>}
          <div>Expiration: {batch.expiration_date ? formatDate(batch.expiration_date) : 'N/A'}</div>
          <div>Supplier: {batch.supplier || '—'}</div>
          <div>
            Quantity: {batch.quantity} {batch.item_unit}
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
          Scanning this code with the QR Scanner tab opens this batch's details directly.
        </p>
      </div>
    </Modal>
  )
}
