import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Modal from '@components/ui/Modal'
import { QrCodeIcon, DownloadIcon } from '@components/ui/icons'
import { formatDate } from '@lib/format'

// The canonical payload every batch QR encodes — identifies medicine,
// batch, lot number, expiration, supplier, and quantity (exactly the six
// fields this phase requires), plus a `type: 'batch'` marker and the
// real medicine_batch_id so scanning it can look the batch up directly
// and open its details, instead of going through the generic "unknown
// QR, try to match or create an item" flow that handles externally
// printed (e.g. supplier) QR codes. Generated fresh from live batch data
// every time this modal opens — never stored as a static image/string,
// so it can never go stale relative to the batch's real current state.
export function buildBatchQRPayload(batch) {
  return JSON.stringify({
    type: 'batch',
    medicine_batch_id: batch.medicine_batch_id,
    medicine: batch.item_name,
    batch: batch.batch_code,
    lot: batch.lot_number || null,
    expiration: batch.expiration_date || null,
    supplier: batch.supplier || null,
    quantity: batch.quantity,
  })
}

export default function BatchQRModal({ isOpen, batch, onClose }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen || !batch) return
    QRCode.toDataURL(buildBatchQRPayload(batch), { width: 260, margin: 2 })
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
