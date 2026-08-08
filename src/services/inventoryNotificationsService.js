import { supabase } from './supabaseClient'
import { notifyIfNew } from './notificationsService'
import { getInventoryStatus } from '@features/inventory/lib/inventoryHelpers'

// Dedicated inventory notification system (Notification System project).
// Deliberately separate from notificationsService.js's general
// `notifications` table — see the Phase 1 analysis for why a shared
// table can't do this job (no medicine/batch FK, no category field).
//
// PRIORITY_BY_TYPE and the cross-post threshold are the single place
// these decisions are made — every alert-creating function in
// medicineService.js calls through createInventoryNotification() below
// rather than each deciding priority/cross-posting itself, which is
// exactly the kind of scattered-logic this system replaces (the 5
// separate hand-written low-stock notify() calls found in Phase 1).
const PRIORITY_BY_TYPE = {
  low_stock: 'medium',
  critical_stock: 'high',
  out_of_stock: 'critical',
  expiring_90: 'low',
  expiring_60: 'medium',
  expiring_30: 'high',
  expiring_7: 'critical',
  expired: 'critical',
  received: 'low',
  released: 'low',
  damaged: 'high',
  adjustment: 'low',
  archived: 'low',
}

// Only the most urgent alerts also cross-post to the existing general
// `notifications` table (Topbar bell) — everything still lives in full,
// with type/medicine/batch detail, in inventory_notifications; this is
// a lightweight visibility nudge for people who only check the bell,
// not a second copy of the data.
const CROSS_POST_PRIORITIES = new Set(['high', 'critical'])

const WITH_JOINS = `*, medicine:medicines ( medicine_name, unit ), batch:medicine_batches ( batch_number ), creator:users ( name )`

function flatten(n) {
  return {
    ...n,
    medicine_name: n.medicine?.medicine_name ?? null,
    unit: n.medicine?.unit ?? '',
    batch_number: n.batch?.batch_number ?? null,
    created_by_name: n.creator?.name ?? 'System',
  }
}

const STOCK_ALERT_TYPES = ['low_stock', 'critical_stock', 'out_of_stock']

/**
 * The single function that decides low/critical/out-of-stock alerting
 * for a medicine — called from exactly one place (addMedicineMovement in
 * medicineService.js), which every quantity-changing action already
 * calls (confirmed in the Phase 12 review), so this fires automatically
 * on every Replenish/Release/Damage/Receiving/Batch-Edit/Archive action
 * without needing to be wired into each of them individually.
 *
 * Always clears the OTHER stock-tier alerts before creating the current
 * one — this is what makes "auto-clear when stock is replenished" work:
 * Critical → Available clears everything; Critical → Low swaps which
 * alert is showing; nothing needs a separate "resolve" step.
 */
const EVENT_TYPE_BY_ACTION = {
  Received: 'received',
  Released: 'released',
  Damaged: 'damaged',
  Adjustment: 'adjustment',
  Archived: 'archived',
  // Deliberately NOT mapped: 'Expired' (removeExpiredBatchQuantity) —
  // Phase 4's dedicated, date-driven expiration alerting already covers
  // this more accurately; firing an event alert here too would
  // duplicate it. Also not mapped: 'Edit'/'Removed' (medicine-level
  // metadata changes with no specific batch) — outside Phase 5's list
  // of five event types, and "must reference the affected batch"
  // wouldn't hold for them anyway.
}

/**
 * Event alerts (Notification System Phase 5) — one notification per
 * occurrence, unlike the state-based Low Stock/Expiration alerts which
 * dedupe to a single open alert per medicine/batch. Each event is
 * genuinely a new thing that happened, so no dedup check here — that's
 * a deliberate difference from createInventoryNotification's normal
 * behavior, not an oversight; Received/Released/etc are meant to show
 * up as a real activity feed in the Notification Center (Phase 6).
 */
export async function createEventNotification({ actionType, medicineId, medicineName, batchId, batchNumber, quantityChange, staffId }) {
  const eventType = EVENT_TYPE_BY_ACTION[actionType]
  if (!eventType || !medicineId || !batchId) return null

  const name = medicineName || 'Medicine'
  const batchLabel = batchNumber ? `batch ${batchNumber}` : 'a batch'
  const titleByType = {
    received: `Stock Received: ${name}`,
    released: `Stock Released: ${name}`,
    damaged: `Damaged Stock: ${name}`,
    adjustment: `Inventory Adjusted: ${name}`,
    archived: `Batch Archived: ${name}`,
  }
  const messageByType = {
    received: `${quantityChange > 0 ? '+' : ''}${quantityChange} unit(s) received into ${batchLabel} of ${name}.`,
    released: `${quantityChange} unit(s) released from ${batchLabel} of ${name}.`,
    damaged: `${Math.abs(quantityChange)} unit(s) of ${name} reported damaged in ${batchLabel}.`,
    adjustment: `${batchLabel} of ${name} was corrected/adjusted${quantityChange ? ` (${quantityChange > 0 ? '+' : ''}${quantityChange})` : ''}.`,
    archived: `${batchLabel} of ${name} was archived and removed from active stock.`,
  }

  const priority = PRIORITY_BY_TYPE[eventType] || 'low'
  const { data, error } = await supabase
    .from('inventory_notifications')
    .insert({
      notification_type: eventType,
      medicine_id: medicineId,
      batch_id: batchId,
      title: titleByType[eventType],
      message: messageByType[eventType],
      priority,
      created_by: staffId ?? null,
    })
    .select()
    .single()
  if (error) throw error

  if (CROSS_POST_PRIORITIES.has(priority)) {
    try {
      await notifyIfNew({ targetRole: 'staff', message: titleByType[eventType], type: priority === 'critical' ? 'danger' : 'warning', module: '/inventory' })
    } catch {
      // Cross-post is a visibility nudge, never the reason the real alert fails.
    }
  }

  return data
}

export async function checkStockLevelAlert(item, staffId) {
  if (!item || item._id == null) return
  const status = getInventoryStatus(item)
  const typeForStatus = { 'Low Stock': 'low_stock', 'Critical Stock': 'critical_stock', 'Out of Stock': 'out_of_stock' }
  const activeType = typeForStatus[status]

  const toClear = activeType ? STOCK_ALERT_TYPES.filter((t) => t !== activeType) : STOCK_ALERT_TYPES
  await clearInventoryNotifications(item._id, toClear)

  if (!activeType) return

  const titleByType = {
    low_stock: `Low Stock: ${item.name}`,
    critical_stock: `Critical Stock: ${item.name}`,
    out_of_stock: `Out of Stock: ${item.name}`,
  }
  const messageByType = {
    low_stock: `${item.name} is at ${item.quantity} ${item.unit}, at or below the reorder point of ${item.min_stock}.`,
    critical_stock: `${item.name} is critically low at ${item.quantity} ${item.unit} — well below the reorder point of ${item.min_stock}. Reorder soon.`,
    out_of_stock: `${item.name} is out of stock (0 ${item.unit} available). Restock as soon as possible.`,
  }

  await createInventoryNotification({
    notificationType: activeType,
    medicineId: item._id,
    title: titleByType[activeType],
    message: messageByType[activeType],
    createdBy: staffId ?? null,
  })
}

// Batch-level expiration alerting (tiering, dedup, auto-clear) lived
// here through Phase 4, but as of Phase 8 (Automation) the whole
// algorithm moved to the run_expiration_check() PL/pgSQL function
// (migration 018) — the single source of truth, callable both from the
// client (medicineService.runExpirationCheck(), an RPC wrapper) and from
// pg_cron on a daily schedule. Keeping a second JS implementation here
// alongside the SQL one would mean the same algorithm living in two
// places with no way to guarantee they'd stay in sync.

export async function listInventoryNotifications({ unreadOnly = false, type = null } = {}) {
  let query = supabase.from('inventory_notifications').select(WITH_JOINS).order('created_at', { ascending: false })
  if (unreadOnly) query = query.eq('is_read', false)
  if (type) query = query.eq('notification_type', type)
  // Also called unfiltered as part of InventoryPage's initial parallel
  // load (see the Notifications tab), same reasoning as the batch
  // queries above.
  query = query.limit(300)
  const { data, error } = await query
  if (error) throw error
  return data.map(flatten)
}

export async function countUnreadInventoryNotifications() {
  const { count, error } = await supabase.from('inventory_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  if (error) throw error
  return count || 0
}

export async function markInventoryNotificationRead(id) {
  const { error } = await supabase.from('inventory_notifications').update({ is_read: true }).eq('id', id)
  if (error) throw error
}

/** Deletes a single inventory notification — the × per row in NotificationsModal.jsx. */
export async function deleteInventoryNotification(id) {
  const { error } = await supabase.from('inventory_notifications').delete().eq('id', id)
  if (error) throw error
}

export async function markAllInventoryNotificationsRead() {
  const { error } = await supabase.from('inventory_notifications').update({ is_read: true }).eq('is_read', false)
  if (error) throw error
}

/**
 * The single entry point every alert-generating function uses. Prevents
 * duplicates structurally — by (medicine_id, notification_type,
 * unread), not by matching message text (which breaks the moment a
 * message includes a changing number, e.g. "5 remaining" vs "3
 * remaining" — a real limitation of the existing notifyIfNew() pattern
 * this system deliberately avoids repeating). If an unread notification
 * of the same type already exists for this medicine, this is a no-op —
 * the existing one is left as-is rather than creating a second one.
 */
export async function createInventoryNotification({ notificationType, medicineId, batchId, title, message, createdBy }) {
  // Dedup key: batch-specific when a batch is involved (expiration
  // alerts — two batches of the same medicine at the same tier need two
  // separate alerts, not one that silently "already exists"), otherwise
  // medicine-level (stock alerts, which are a per-medicine aggregate
  // concept with no single batch to key off).
  if (batchId) {
    const { data: existing, error: findError } = await supabase
      .from('inventory_notifications')
      .select('id')
      .eq('batch_id', batchId)
      .eq('notification_type', notificationType)
      .eq('is_read', false)
      .limit(1)
    if (findError) throw findError
    if (existing && existing.length > 0) return null
  } else if (medicineId) {
    const { data: existing, error: findError } = await supabase
      .from('inventory_notifications')
      .select('id')
      .eq('medicine_id', medicineId)
      .eq('notification_type', notificationType)
      .eq('is_read', false)
      .limit(1)
    if (findError) throw findError
    if (existing && existing.length > 0) return null
  }

  const priority = PRIORITY_BY_TYPE[notificationType] || 'medium'
  const { data, error } = await supabase
    .from('inventory_notifications')
    .insert({
      notification_type: notificationType,
      medicine_id: medicineId ?? null,
      batch_id: batchId ?? null,
      title,
      message,
      priority,
      created_by: createdBy ?? null,
    })
    .select()
    .single()
  if (error) throw error

  if (CROSS_POST_PRIORITIES.has(priority)) {
    try {
      await notifyIfNew({ targetRole: 'staff', message: title, type: priority === 'critical' ? 'danger' : 'warning', module: '/inventory' })
    } catch {
      // Cross-post is a visibility nudge, not the source of truth — never let it block the real alert.
    }
  }

  return data
}

/**
 * Auto-clear (Phase 3/4 requirement) — deletes any unread alert(s) of the
 * given type(s) for a medicine once the condition that triggered them no
 * longer applies (e.g. stock replenished past the reorder point). These
 * are transient operational alerts, not the permanent audit trail
 * (inventory_logs already is that) — clearing a resolved alert by
 * removing the row is the correct behavior here, not something that
 * needs its own "resolved" column.
 */
/**
 * Auto-clear (Phase 3/4 requirement). Pass batchId for batch-specific
 * alerts (expiration), medicineId for medicine-level ones (stock) — same
 * keying distinction as createInventoryNotification's dedup check above.
 */
export async function clearInventoryNotifications(medicineId, notificationTypes, batchId = null) {
  let query = supabase.from('inventory_notifications').delete().in('notification_type', notificationTypes).eq('is_read', false)
  query = batchId ? query.eq('batch_id', batchId) : query.eq('medicine_id', medicineId)
  const { error } = await query
  if (error) throw error
}