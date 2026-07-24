// Ported 1:1 from DB.invStatus / isPastISODate / mergeDisplayExpirationDate /
// sortInventoryByCategory / inventoryCategorySummary / findInventoryItemMatch
// in the legacy core.js + js/admin/inventory.js.
//
// NOTE (scope decision, flagged for Phase 4): the legacy app also maintains
// a parallel `batches` table for true multi-batch FIFO tracking per item —
// but its own "Batches" tab is unreachable in the UI (renderInventory()
// silently redirects `_invTab==='batches'` back to 'items'), so no user of
// the current app can actually see or manage individual batches today. This
// pass models inventory the way the real schema's `inventory` table already
// does it — quantity/expiration_date/batch_no live directly on the item as
// a single "current batch" — and leaves the separate `inventory_batches`
// multi-batch sub-system for a later pass, since it would add a lot of
// surface area for a feature nothing in the current UI exposes.

// Merged inventory rows come from two real tables now (legacy `inventory`
// for Supply/Equipment, `medicines` for Medicine — see Phase 2/3), whose
// IDs are separate sequences that could coincidentally collide (e.g.
// medicine_id=5 and a Supply item's inventory_id=5 both existing at
// once). This gives every row a single, collision-proof identity to use
// for React keys and action routing, instead of assuming inventory_id is
// unique across the whole merged list.
// Same collision reasoning as itemKey() above, for the Batches tab —
// medicine_batches.medicine_batch_id and the legacy
// inventory_batches.batch_id are separate sequences that could
// numerically collide once both are merged into one displayed list.
export function batchKey(batch) {
  return batch._source === 'medicine' ? `medicine:${batch.medicine_batch_id}` : `legacy:${batch.batch_id}`
}

export function itemKey(item) {
  return item._source === 'medicine' ? `medicine:${item._id}` : `legacy:${item.inventory_id}`
}

export function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

export function isPastISODate(dateStr) {
  return !!dateStr && String(dateStr).slice(0, 10) < todayISODate()
}

export function mergeDisplayExpirationDate(currentDate, incomingDate) {
  if (!incomingDate) return currentDate || null
  if (isPastISODate(incomingDate)) return currentDate || incomingDate
  if (!currentDate || isPastISODate(currentDate)) return incomingDate
  return incomingDate < currentDate ? incomingDate : currentDate
}

// Consolidates what were 5 separate, slightly-inconsistent inline
// day-math implementations (some Math.ceil, some Math.floor, some
// reversed subtraction order) found scattered across AlertsTab,
// BatchesTab, InventoryPage, ItemsTab, and ReportsPage during the
// Phase 12 review. Positive = in the future, negative = in the past.
export function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date(todayISODate())) / (1000 * 60 * 60 * 24))
}

// Shared 30-day threshold for "coming up soon" — previously duplicated
// inconsistently across AlertsTab/BatchesTab/InventoryPage as inline
// arithmetic; consolidated here so "Near Expiry" means the same thing
// everywhere it's checked.
export function isNearExpiry(dateStr, days = 30) {
  const diffDays = daysUntil(dateStr)
  return diffDays !== null && diffDays >= 0 && diffDays <= days
}

// Phase 8 — full supported status set: Available, Low Stock, Critical
// Stock, Out of Stock, Near Expiry, Expired, Damaged, Archived. All
// derived automatically from quantity / expiration_date / batch data on
// every call — nothing here is a stored flag a person has to remember to
// update, so "do not require manual updates" holds by construction.
//
// Damaged/Archived only become reachable at this aggregate level when
// quantity has hit zero AND the medicine's most recent batch says why —
// "batch availability", not just quantity/expiry, is what distinguishes
// "ran out normally" (Out of Stock) from "everything was archived" or
// "the last of it was damaged". A medicine with some batches archived
// but others still Active simply shows its real Active-only quantity, no
// special-casing needed — the aggregate (medicine_inventory_view) already
// only sums Active batches.
// Batch-level status — was defined twice, character-for-character
// identically, in BatchesTab.jsx and BatchDetailModal.jsx (found during
// the Phase 12 review). Consolidated here as the single source of truth,
// same status vocabulary as getInventoryStatus but scoped to one batch
// rather than an aggregate item.
export function getBatchStatus(b) {
  // Explicit, persisted states always win — set via an action (Archive,
  // Report Damaged, Release-to-zero), not derived from quantity/expiry.
  if (b.status === 'Archived' || b.status === 'Damaged' || b.status === 'Recalled') return b.status
  if (b.quantity <= 0) return 'Depleted'
  if (isPastISODate(b.expiration_date)) return 'Expired'
  if (isNearExpiry(b.expiration_date)) return 'Near Expiry'
  if (!b.expiration_date) return 'No Expiry'
  return 'Available'
}

export function getInventoryStatus(item) {
  const expired = isPastISODate(item.expiration_date)

  // Equipment's maintenance concept is unrelated to this status set (no
  // batches, not expiry-driven the same way) — kept exactly as it was,
  // not one of Phase 8's 8 statuses.
  if (item.category === 'Equipment' && (item.needs_maintenance || expired)) return 'Needs Maintenance'

  if (item.quantity <= 0) {
    if (item.latest_batch_status === 'Archived') return 'Archived'
    if (item.latest_batch_status === 'Damaged') return 'Damaged'
    return 'Out of Stock'
  }
  if (expired) return 'Expired'
  if (isNearExpiry(item.expiration_date)) return 'Near Expiry'

  const minStock = item.min_stock || 0
  // Critical Stock: a meaningfully more urgent tier than Low Stock —
  // half the reorder point, not just at/below it.
  if (minStock > 0 && item.quantity <= Math.ceil(minStock / 2)) return 'Critical Stock'
  if (minStock > 0 && item.quantity <= minStock) return 'Low Stock'
  return 'Available'
}

const CATEGORY_ORDER = ['Medicine', 'Supply', 'Equipment']

export function sortInventoryByCategory(items) {
  return [...items].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    const aRank = ai === -1 ? CATEGORY_ORDER.length : ai
    const bRank = bi === -1 ? CATEGORY_ORDER.length : bi
    if (aRank !== bRank) return aRank - bRank
    return (a.name || '').localeCompare(b.name || '')
  })
}

export function inventoryCategorySummary(items, category) {
  const group = items.filter((i) => i.category === category)
  const low = group.filter((i) => ['Low Stock', 'Critical Stock'].includes(getInventoryStatus(i))).length
  const out = group.filter((i) => getInventoryStatus(i) === 'Out of Stock').length
  const expired = group.filter((i) => getInventoryStatus(i) === 'Expired').length
  return `${group.length} item${group.length !== 1 ? 's' : ''}${low ? ` · ${low} low` : ''}${out ? ` · ${out} out of stock` : ''}${expired ? ` · ${expired} expired` : ''}`
}

function normalizeKey(value) {
  return (value || '').toString().trim().toLowerCase()
}

function itemIdentity({ name, category, unit, supplier }) {
  return [normalizeKey(name), normalizeKey(category), normalizeKey(unit), normalizeKey(supplier)].join('|')
}

// Finds an existing item with the same name/category/unit/supplier — used
// to decide whether an add/edit/replenish should merge stock into an
// existing row instead of creating a duplicate.
export function findInventoryItemMatch(inventory, { name, category, unit, supplier }, excludeId) {
  const wanted = itemIdentity({ name, category, unit, supplier })
  return inventory.find((i) => i.inventory_id !== excludeId && itemIdentity(i) === wanted) || null
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ${h > 1 ? 'hours' : 'hour'} ago`
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
