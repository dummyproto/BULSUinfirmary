import { useRef } from 'react'
import { CameraIcon, XIcon } from '@components/ui/icons'
import { compressImageFile } from '@lib/imageCompression'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIZE_BYTES = 2 * 1024 * 1024

/**
 * Reusable photo picker for inventory items — same validation and
 * base64-data-URL approach as ProfilePage.jsx's handleAvatarUpload
 * (same size/type limits, same "no real Storage bucket, just a TEXT
 * column" tradeoff, same auto-compression to under 1MB via
 * compressImageFile), factored out here since both AddItemModal and
 * EditItemModal need the identical control.
 *
 * `value` is the current image (a data URL string, or '' / null / undefined
 * for none). `onChange(dataUrl)` fires with the new (compressed) data URL
 * on a successful upload, or with '' when the person removes the photo.
 */
export default function ItemPhotoUpload({ value, onChange, onError }) {
  const fileInputRef = useRef(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      onError?.('Only JPG, PNG, GIF, or WEBP images are allowed')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      onError?.('Image must be smaller than 2MB')
      return
    }
    // Reset immediately (not after the async compress call below) so
    // selecting the exact same file again still fires this handler
    // (browsers don't fire a change event for a no-op re-selection
    // otherwise).
    e.target.value = ''
    try {
      const compressedDataUrl = await compressImageFile(file, { maxBytes: 1024 * 1024 })
      onChange(compressedDataUrl)
    } catch (err) {
      onError?.(err.message)
    }
  }

  return (
    <div className="form-group full">
      <label>PHOTO (OPTIONAL)</label>
      <div className="item-photo-upload">
        <div className="item-photo-preview" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} title="Click to upload a photo">
          {value ? <img src={value} alt="" /> : <CameraIcon width={22} height={22} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => fileInputRef.current?.click()}>
            <CameraIcon width={13} height={13} /> {value ? 'Change Photo' : 'Upload Photo'}
          </button>
          {value && (
            <button type="button" className="btn btn-sm btn-outline" onClick={() => onChange('')}>
              <XIcon width={13} height={13} /> Remove
            </button>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>JPG, PNG, GIF, or WEBP · max 2MB</span>
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>
    </div>
  )
}