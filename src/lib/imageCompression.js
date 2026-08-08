/**
 * Client-side image compression via Canvas — no new dependency needed,
 * every browser this app targets already supports it. Used anywhere an
 * uploaded image gets stored as a base64 data URL directly in a Postgres
 * TEXT column (ProfilePage.jsx's avatar, ItemPhotoUpload.jsx's item
 * photo) rather than a real Storage bucket — see the "NOTE" comments on
 * both of those for why that tradeoff exists. Without compression, a
 * single uncompressed phone photo (often 3-8MB) bloats that row and
 * every query that touches it; this keeps uploads under a sane cap.
 *
 * Approach: draw the image onto a canvas (shrinking it first if it
 * exceeds maxDimension on its longer side), then re-encode as JPEG,
 * stepping quality down in increments until the result fits under
 * maxBytes. If it's still too big even at the quality floor, shrink the
 * dimensions further and try the whole quality ladder again. Bails out
 * after a fixed number of rounds rather than looping forever on a
 * pathological image — returns its best attempt at that point either
 * way, since "somewhat over target" from a huge source image is still a
 * major improvement over the untouched original.
 *
 * Trade-off worth knowing: always re-encodes as JPEG, which drops
 * transparency (PNG/GIF alpha channels) and animation (GIF frames).
 * Chosen deliberately — photos (profile pictures, item photos) are what
 * this is actually for, and JPEG compresses photographic content far
 * better than PNG, which is what makes hitting a 1MB target on a real
 * phone photo realistic at all.
 *
 * @param {File} file
 * @param {{ maxBytes?: number, maxDimension?: number }} [options]
 * @returns {Promise<string>} a compressed 'data:image/jpeg;base64,...' URL
 */
export function compressImageFile(file, { maxBytes = 1024 * 1024, maxDimension = 1600 } = {}) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        resolve(shrinkUntilUnderTarget(img, maxBytes, maxDimension))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read this image file — it may be corrupted or an unsupported format.'))
    }
    img.src = objectUrl
  })
}

function shrinkUntilUnderTarget(img, maxBytes, maxDimension) {
  let dimensionScale = 1
  const longerSide = Math.max(img.naturalWidth, img.naturalHeight)
  if (longerSide > maxDimension) dimensionScale = maxDimension / longerSide

  const MAX_DIMENSION_ROUNDS = 4
  for (let round = 0; round < MAX_DIMENSION_ROUNDS; round++) {
    const width = Math.max(1, Math.round(img.naturalWidth * dimensionScale))
    const height = Math.max(1, Math.round(img.naturalHeight * dimensionScale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)

    // Quality ladder — 0.9 down to 0.4, coarse steps. Fewer, bigger
    // steps rather than a fine-grained search: re-encoding is cheap
    // enough per-step, but there's no real benefit to landing at
    // exactly maxBytes versus comfortably under it, so no need for a
    // slower binary search here.
    for (let quality = 0.9; quality >= 0.4; quality -= 0.1) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (estimateDataUrlBytes(dataUrl) <= maxBytes) return dataUrl
      if (quality <= 0.4) {
        // Quality floor reached at this size — shrink dimensions
        // further and restart the quality ladder, unless this was
        // already the last round.
        if (round < MAX_DIMENSION_ROUNDS - 1) {
          dimensionScale *= 0.75
        } else {
          // Out of rounds — return the smallest thing we managed to
          // produce rather than looping forever.
          return dataUrl
        }
      }
    }
  }
  // Unreachable in practice (the loop above always returns), but keeps
  // the function's return type honest for any future refactor.
  throw new Error('Could not compress this image.')
}

// Base64 encodes ~4 bytes for every 3 source bytes — close enough for
// deciding whether we're under a target size; exactness isn't needed
// here, only "comfortably under 1MB or not."
function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((base64.length * 3) / 4)
}