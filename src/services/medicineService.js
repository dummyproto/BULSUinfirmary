import { supabase } from './supabaseClient'
import { checkStockLevelAlert, createEventNotification, clearInventoryNotifications } from './inventoryNotificationsService'
import { isPastISODate } from '@features/inventory/lib/inventoryHelpers'

// Which addMedicineMovement action types generate a Phase 5 event
// notification — mirrors EVENT_TYPE_BY_ACTION in
// inventoryNotificationsService.js; kept here too so the "should I even
// bother fetching the batch number" check doesn't need to reach into
// that module's internals.
const EVENT_ACTION_TYPES = new Set(['Received', 'Released', 'Damaged', 'Adjustment', 'Archived'])

// Expiration alert types run_expiration_check() (migration 018) manages
// — used here to clear stale ones when a batch leaves the
// Active/Expired lifecycle entirely (Archived, or fully Damaged out).
// The SQL function's own loop only ever processes batches still in
// Active/Expired status, so it will never touch — and therefore never
// clear — a stale alert left over from before a batch was archived or
// damaged; that has to happen explicitly, here, at the point of
// transition (found during the Phase 9 final review).
const EXPIRY_ALERT_TYPES = ['expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired']

// Service layer for the Phase 2 normalized structure (medicines /
// medicine_batches / suppliers). inventoryService.js still owns
// Supply/Equipment (the legacy `inventory` table) — this file is
// Medicine-only, matching the schema's actual scope.
//
// Every quantity/expiration/status value the UI displays for a medicine
// comes from `medicine_inventory_view` (migration 008) — a live computed
// aggregate, never a stored cache — which is what makes "no duplicated
// values" true here in a way the old inventory.quantity cache never was.

const BATCH_WITH_JOINS = `*, medicine:medicines!medicine_batches_medicine_id_fkey ( medicine_name, unit ), supplier:suppliers ( supplier_name )`

function flattenBatch(b) {
  const supplierName = b.supplier?.supplier_name ?? null
  return {
    ...b,
    batch_code: b.batch_number, // UI compatibility — legacy inventory_batches used this field name
    item_name: b.medicine?.medicine_name ?? 'Unknown',
    item_unit: b.medicine?.unit ?? '',
    supplier_name: supplierName,
    supplier: supplierName, // UI compatibility — legacy inventory_batches used a plain free-text `supplier` column; overrides the raw joined object from `...b`
  }
}

// ── MEDICINES (read as unified "inventory item" shape, aggregated live) ──
export async function listMedicinesAsInventoryItems() {
  const { data, error } = await supabase.from('medicine_inventory_view').select('*').order('name')
  if (error) throw error
  return data.map((m) => ({ ...m, _source: 'medicine', _id: m.medicine_id, inventory_id: null }))
}

export async function createMedicine(fields) {
  const { data, error } = await supabase.from('medicines').insert(fields).select().single()
  if (error) throw error
  return data
}

export async function updateMedicine(id, patch) {
  const { data, error } = await supabase
    .from('medicines')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('medicine_id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Soft-delete only — a medicine can be referenced by years of batch and
// movement history (medicine_batches, inventory_logs, consultation
// records). A hard DELETE would cascade-erase all of it. Setting
// `active = false` removes it from every live view/list (the aggregate
// view already filters on `active = true`) while preserving history —
// this is what "every delete action must preserve database integrity"
// means for a medicine specifically, as opposed to a batch (see below).
export async function deactivateMedicine(id) {
  const { error } = await supabase.from('medicines').update({ active: false, updated_at: new Date().toISOString() }).eq('medicine_id', id)
  if (error) throw error
}

export async function restoreMedicine(id) {
  const { error } = await supabase.from('medicines').update({ active: true, updated_at: new Date().toISOString() }).eq('medicine_id', id)
  if (error) throw error
}

// ── SUPPLIERS ──
export async function listSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('supplier_name')
  if (error) throw error
  return data
}

export async function createSupplier(fields) {
  const { data, error } = await supabase.from('suppliers').insert(fields).select().single()
  if (error) throw error
  return data
}

export async function updateSupplier(id, patch) {
  const { error } = await supabase.from('suppliers').update({ ...patch, updated_at: new Date().toISOString() }).eq('supplier_id', id)
  if (error) throw error
}

// Batches/logs reference suppliers with ON DELETE SET NULL — a real
// delete here is safe, it just un-links historical batches from a
// supplier name rather than breaking anything.
export async function getSupplierBatchCount(id) {
  const { count, error } = await supabase.from('medicine_batches').select('medicine_batch_id', { count: 'exact', head: true }).eq('supplier_id', id)
  if (error) throw error
  return count || 0
}

// Blocks deletion of a supplier that's still referenced by any batch —
// checked here first for a clear, specific error message; the database
// itself also refuses via ON DELETE RESTRICT (migration 010) as a second,
// independent guarantee that holds even for direct API/SQL access that
// bypasses this application-level check.
export async function deleteSupplier(id) {
  const inUse = await getSupplierBatchCount(id)
  if (inUse > 0) {
    throw new Error(`This supplier is linked to ${inUse} batch${inUse === 1 ? '' : 'es'} and can't be deleted. Remove or reassign those batches first.`)
  }
  const { error } = await supabase.from('suppliers').delete().eq('supplier_id', id)
  if (error) throw error
}

// ── MEDICINE BATCHES ──
export async function listMedicineBatches() {
  const { data, error } = await supabase.from('medicine_batches').select(BATCH_WITH_JOINS).order('created_at', { ascending: false })
  if (error) throw error
  return data.map(flattenBatch)
}

/** Single-batch fetch for the QR-scan "open batch details" flow (Phase 9) — same joins/shape as listMedicineBatches, just one row. */
export async function getMedicineBatchById(batchId) {
  const { data, error } = await supabase.from('medicine_batches').select(BATCH_WITH_JOINS).eq('medicine_batch_id', batchId).maybeSingle()
  if (error) throw error
  return data ? flattenBatch(data) : null
}

export async function createMedicineBatch(fields) {
  const { data, error } = await supabase.from('medicine_batches').insert(fields).select().single()
  if (error) throw error
  return data
}

export async function updateMedicineBatch(id, patch) {
  const { data, error } = await supabase
    .from('medicine_batches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('medicine_batch_id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// A real hard delete is safe here — inventory_logs/consultation_medications
// reference medicine_batches with ON DELETE SET NULL, chosen specifically
// in Phase 2 so this would never break referential integrity, just null
// out the batch reference in historical movement rows. Prefer
// archiveMedicineBatch() for the normal "this batch is done" case —
// this hard delete exists mainly for genuine mistakes (a batch added in
// error with no real history yet).
export async function deleteMedicineBatch(id) {
  const { error } = await supabase.from('medicine_batches').delete().eq('medicine_batch_id', id)
  if (error) throw error
}

// Archive = soft-removal. Excluded from medicine_inventory_view's active
// quantity/expiration aggregate automatically (it only sums status =
// 'Active' batches), while the row itself — and every inventory_logs /
// consultation_medications reference to it — stays intact. This is the
// normal path for "this batch is done, take it off the active list";
// deleteMedicineBatch (a real hard delete) is for genuine mistakes only.
export async function archiveMedicineBatch(id) {
  const { error } = await supabase.from('medicine_batches').update({ status: 'Archived' }).eq('medicine_batch_id', id)
  if (error) throw error
  // Archived batches are outside run_expiration_check()'s
  // Active/Expired loop from this point on, so any expiration alert it
  // already raised for this batch would otherwise stay open forever —
  // clear it explicitly here instead.
  try {
    await clearInventoryNotifications(null, EXPIRY_ALERT_TYPES, id)
  } catch {
    // Non-critical — the archive itself already succeeded.
  }
}

export async function restoreArchivedBatch(id, previousStatus = 'Active') {
  const { error } = await supabase.from('medicine_batches').update({ status: previousStatus }).eq('medicine_batch_id', id)
  if (error) throw error
}

/**
 * Deducts `qty` from a medicine's Active batches oldest-expiration-first
 * (true FIFO — the thing Phase 1 found `is_fifo` never actually did).
 * Depletes each batch in order until the full quantity is covered, marks
 * any batch that hits 0 as 'Depleted', and writes one inventory_logs
 * 'Release' row per batch touched. Throws if total Active stock is
 * insufficient (no partial deduction on failure).
 */
export async function releaseMedicineStockFIFO(medicineId, qty, staffId, notes, consultationId) {
  const { data: allActive, error } = await supabase
    .from('medicine_batches')
    .select('*')
    .eq('medicine_id', medicineId)
    .eq('status', 'Active')
    .order('expiration_date', { ascending: true, nullsFirst: false })
  if (error) throw error

  // Never release an expired batch, even if its stored `status` still
  // says 'Active' — nothing automatically flips that column the instant
  // a date passes (see syncExpiredBatchStatus below, which handles that
  // separately). This explicit filter is the actual fix: it's correct
  // immediately, regardless of whether that sync has run recently.
  const batches = allActive.filter((b) => !isPastISODate(b.expiration_date))
  const expiredCount = allActive.length - batches.length

  const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0)
  if (totalAvailable < qty) {
    const expiredNote = expiredCount > 0 ? ` (${expiredCount} batch(es) excluded — expired)` : ''
    throw new Error(`Insufficient non-expired stock — only ${totalAvailable} unit(s) available across active batches${expiredNote}, ${qty} requested.`)
  }

  let remaining = qty
  const touched = []
  for (const batch of batches) {
    if (remaining <= 0) break
    const deduct = Math.min(batch.quantity, remaining)
    const newQty = batch.quantity - deduct
    const goingToDepleted = newQty <= 0
    await updateMedicineBatch(batch.medicine_batch_id, { quantity: newQty, status: goingToDepleted ? 'Depleted' : 'Active' })
    if (goingToDepleted) {
      // Same reasoning as archiveMedicineBatch/reportDamagedBatch/
      // removeExpiredBatchQuantity above — a fully-Depleted batch also
      // leaves run_expiration_check()'s Active/Expired loop, so any
      // expiring_* alert it already had would otherwise stay open forever.
      try {
        await clearInventoryNotifications(null, EXPIRY_ALERT_TYPES, batch.medicine_batch_id)
      } catch {
        // Non-critical.
      }
    }
    await addMedicineMovement({
      medicineId,
      medicineBatchId: batch.medicine_batch_id,
      actionType: 'Released',
      quantityChange: -deduct,
      previousQuantity: batch.quantity,
      newQuantity: newQty,
      staffId,
      notes: `${notes || 'Manual release'} (FIFO from batch ${batch.batch_number})`,
      consultationId,
    })
    touched.push({ batchNumber: batch.batch_number, deducted: deduct, remaining: newQty })
    remaining -= deduct
  }
  return touched
}

/**
 * Adds a brand-new batch for a fresh delivery — the Medicine equivalent
 * of the old item-level "Replenish" button. Medicine stock has no
 * standalone aggregate column to bump directly anymore (see Phase 2); a
 * new delivery is always a new batch.
 */
export async function replenishMedicineAsNewBatch({ medicineId, quantity, expirationDate, receivedDate, supplierId, batchNumber, purchaseReference, unitCost, staffId, notes }) {
  const batch = await createMedicineBatch({
    medicine_id: medicineId,
    batch_number: batchNumber || `AUTO-${Date.now()}`,
    supplier_id: supplierId || null,
    received_date: receivedDate || new Date().toISOString().slice(0, 10),
    expiration_date: expirationDate || null,
    quantity,
    unit_cost: unitCost || null,
    purchase_reference: purchaseReference || null,
    status: 'Active',
  })
  await addMedicineMovement({ medicineId, medicineBatchId: batch.medicine_batch_id, actionType: 'Received', quantityChange: quantity, previousQuantity: 0, newQuantity: quantity, staffId, notes: notes || 'Received — new batch' })
  return batch
}

/**
 * Notification System Phase 8 — the entire expiration-check algorithm
 * (tiering, dedup, auto-clear, and "automatically update status") now
 * lives in exactly one place: the run_expiration_check() PL/pgSQL
 * function (migration 018), not here. This is a thin wrapper, not a
 * parallel implementation — it's called both from here (on Inventory
 * page load, same trigger point Phase 4 originally used) and from
 * pg_cron on a daily schedule, so the algorithm itself never has two
 * copies to keep in sync.
 */
export async function runExpirationCheck() {
  const { error } = await supabase.rpc('run_expiration_check')
  if (error) throw error
}

/** Reports a quantity of a batch as damaged — reduces on-hand quantity, logs a 'Damaged' movement. Never deletes the batch or its history. */
export async function reportDamagedBatch(batchId, damagedQty, staffId, notes) {
  const { data: batch, error } = await supabase.from('medicine_batches').select('*').eq('medicine_batch_id', batchId).single()
  if (error) throw error
  const newQty = Math.max(0, batch.quantity - damagedQty)
  // Reaching zero via damage is a meaningfully different outcome from
  // reaching zero via normal consumption — 'Damaged' instead of the
  // generic 'Depleted' preserves that distinction for audit/insurance
  // purposes, and is what makes "Damaged" a real, queryable status
  // (Phase 8) rather than just a movement-log entry (Phase 7).
  const goingToDamaged = newQty <= 0
  await updateMedicineBatch(batchId, { quantity: newQty, status: goingToDamaged ? 'Damaged' : batch.status })
  if (goingToDamaged) {
    // Same reasoning as archiveMedicineBatch above — a fully-Damaged
    // batch also leaves run_expiration_check()'s Active/Expired loop.
    try {
      await clearInventoryNotifications(null, EXPIRY_ALERT_TYPES, batchId)
    } catch {
      // Non-critical.
    }
  }
  await addMedicineMovement({
    medicineId: batch.medicine_id,
    medicineBatchId: batchId,
    actionType: 'Damaged',
    quantityChange: -damagedQty,
    previousQuantity: batch.quantity,
    newQuantity: newQty,
    staffId,
    notes: notes || 'Damaged stock reported',
  })
}

/** Removes a specific quantity from a specific expired batch (partial or full). */
export async function removeExpiredBatchQuantity(batchId, removeQty, staffId, notes) {
  const { data: batch, error } = await supabase.from('medicine_batches').select('*').eq('medicine_batch_id', batchId).single()
  if (error) throw error
  const newQty = Math.max(0, batch.quantity - removeQty)
  const goingToDepleted = newQty <= 0
  await updateMedicineBatch(batchId, { quantity: newQty, status: goingToDepleted ? 'Depleted' : batch.status })
  if (goingToDepleted) {
    // Same reasoning as archiveMedicineBatch/reportDamagedBatch above —
    // a fully-Depleted batch also leaves run_expiration_check()'s
    // Active/Expired loop, and this batch already had an 'expired'
    // alert (that's why it was being removed) that would otherwise
    // never get cleared.
    try {
      await clearInventoryNotifications(null, EXPIRY_ALERT_TYPES, batchId)
    } catch {
      // Non-critical.
    }
  }
  await addMedicineMovement({ medicineId: batch.medicine_id, medicineBatchId: batchId, actionType: 'Expired', quantityChange: -removeQty, previousQuantity: batch.quantity, newQuantity: newQty, staffId, notes: notes || 'Expired stock removed' })
}

// ── MOVEMENTS (inventory_logs, reused — see migration 007/008 reasoning) ──
export async function addMedicineMovement({ medicineId, medicineBatchId, actionType, quantityChange, previousQuantity, newQuantity, staffId, notes, consultationId }) {
  const { data, error } = await supabase
    .from('inventory_logs')
    .insert({
      inventory_id: null,
      medicine_id: medicineId,
      medicine_batch_id: medicineBatchId ?? null,
      action_type: actionType,
      quantity_change: quantityChange,
      previous_quantity: previousQuantity ?? null,
      new_quantity: newQuantity ?? null,
      staff_id: staffId,
      log_date: new Date().toISOString().slice(0, 10),
      notes: notes || null,
      consultation_id: consultationId ?? null,
    })
    .select()
    .single()
  if (error) throw error

  // Stock-level alerting (Notification System Phase 3) — every
  // quantity-changing medicine action calls this function, so hooking
  // in here means low/critical/out-of-stock alerts fire automatically
  // without needing to be wired into each of the ~7 individual actions
  // that can change a medicine's quantity. A quick, single-row lookup
  // against the current authoritative state (not a value passed in from
  // a caller's possibly-stale local copy) — cheap, indexed, correct.
  // Stock-level alerting (Notification System Phase 3) — every
  // quantity-changing medicine action calls this function, so hooking
  // in here means low/critical/out-of-stock alerts fire automatically
  // without needing to be wired into each of the ~7 individual actions
  // that can change a medicine's quantity. A quick, single-row lookup
  // against the current authoritative state (not a value passed in from
  // a caller's possibly-stale local copy) — cheap, indexed, correct.
  //
  // The same fetch also supplies the medicine name for the event
  // notification below (Phase 5) — one query serves both, rather than
  // each fetching it separately.
  if (medicineId) {
    try {
      const { data: current } = await supabase.from('medicine_inventory_view').select('*').eq('medicine_id', medicineId).maybeSingle()
      if (current) {
        await checkStockLevelAlert({ _id: current.medicine_id, name: current.name, quantity: current.quantity, unit: current.unit, min_stock: current.min_stock, expiration_date: current.expiration_date, category: current.category }, staffId)

        if (medicineBatchId && EVENT_ACTION_TYPES.has(actionType)) {
          try {
            const { data: batchRow } = await supabase.from('medicine_batches').select('batch_number').eq('medicine_batch_id', medicineBatchId).maybeSingle()
            await createEventNotification({
              actionType,
              medicineId,
              medicineName: current.name,
              batchId: medicineBatchId,
              batchNumber: batchRow?.batch_number,
              quantityChange,
              staffId,
            })
          } catch {
            // Event notification is a side effect, never the reason the movement fails.
          }
        }
      }
    } catch {
      // Alerting is a side effect of the movement, never the reason it fails.
    }
  }

  return data
}

/**
 * Medicine-table equivalent of inventoryService.js's deductForConsultation
 * — matches prescribed medicines by name against the new `medicines`
 * table and deducts via true FIFO batch deduction (releaseMedicineStockFIFO)
 * instead of touching a single aggregate column. Same {deductions, errors}
 * return shape so callers can merge results from both this and the legacy
 * function transparently.
 */
export async function deductMedicinesForConsultation(prescribedMeds, staffId, consultationId) {
  const { data: medicines, error } = await supabase.from('medicines').select('*').eq('active', true)
  if (error) throw error

  const deductions = []
  const errors = []

  for (const med of prescribedMeds) {
    const match = medicines.find((m) => m.medicine_name.toLowerCase() === med.name.toLowerCase())
    if (!match) {
      errors.push({ medicine: med.name, message: `"${med.name}" not found in inventory — no deduction made.`, notFound: true })
      continue
    }
    try {
      const touched = await releaseMedicineStockFIFO(match.medicine_id, med.qty, staffId, 'Deducted from consultation', consultationId)
      const remaining = touched.length ? touched[touched.length - 1].remaining : 0
      deductions.push({ medicine: med.name, qty: med.qty, unit: match.unit, remaining })
    } catch (err) {
      errors.push({ medicine: med.name, message: err.message })
    }
  }

  return { deductions, errors }
}

// ── RECEIVING RECORDS (Phase 6) ──
// The immutable "what was received" event — see migration 011's header
// comment for why this is a separate table from medicine_batches rather
// than extra columns on it (batch quantity is mutable; the received
// quantity should stay historically accurate regardless of what happens
// to the stock afterward).

const RECEIVING_WITH_JOINS = `*, medicine:medicines ( medicine_name, unit ), supplier:suppliers ( supplier_name ), receiver:users!receiving_records_received_by_fkey ( name )`

function flattenReceivingRecord(r) {
  return {
    ...r,
    medicine_name: r.medicine?.medicine_name ?? 'Unknown',
    unit: r.medicine?.unit ?? '',
    supplier_name: r.supplier?.supplier_name ?? null,
    received_by_name: r.receiver?.name ?? 'Unknown',
  }
}

export async function listReceivingRecords() {
  const { data, error } = await supabase.from('receiving_records').select(RECEIVING_WITH_JOINS).order('received_date', { ascending: false })
  if (error) throw error
  return data.map(flattenReceivingRecord)
}

// Date-range-scoped sibling — Receiving History and Supplier Deliveries
// reports (Phase 11) only ever need one period at a time; no reason to
// pull every receiving record ever recorded to build them.
export async function listReceivingRecordsInRange(from, to) {
  const { data, error } = await supabase
    .from('receiving_records')
    .select(RECEIVING_WITH_JOINS)
    .gte('received_date', from)
    .lte('received_date', to)
    .order('received_date', { ascending: false })
  if (error) throw error
  return data.map(flattenReceivingRecord)
}

/**
 * Creates a receiving record AND its linked batch together — a receiving
 * record must always automatically create exactly one inventory batch,
 * never the other way around, and never a second batch for the same
 * event. The batch is created FIRST and the record references it via a
 * NOT NULL FK, so if the record insert ever failed, only the batch would
 * exist yet — no dangling half-created record either way.
 */
export async function createReceivingRecord({ medicineId, batchNumber, expirationDate, supplierId, invoiceNumber, purchaseReference, quantity, receivedDate, receivedBy, remarks }) {
  const batch = await createMedicineBatch({
    medicine_id: medicineId,
    batch_number: batchNumber,
    supplier_id: supplierId || null,
    received_date: receivedDate,
    expiration_date: expirationDate || null,
    quantity,
    purchase_reference: purchaseReference || null,
    status: 'Active',
  })

  const { data, error } = await supabase
    .from('receiving_records')
    .insert({
      medicine_id: medicineId,
      medicine_batch_id: batch.medicine_batch_id,
      supplier_id: supplierId || null,
      invoice_number: invoiceNumber || null,
      purchase_reference: purchaseReference || null,
      quantity,
      received_date: receivedDate,
      received_by: receivedBy,
      remarks: remarks || null,
    })
    .select()
    .single()
  if (error) throw error

  await addMedicineMovement({
    medicineId,
    medicineBatchId: batch.medicine_batch_id,
    actionType: 'Received',
    quantityChange: quantity,
    previousQuantity: 0,
    newQuantity: quantity,
    staffId: receivedBy,
    notes: `Received${invoiceNumber ? ` — Invoice ${invoiceNumber}` : ''}${remarks ? ' — ' + remarks : ''}`,
  })

  return { record: data, batch }
}

/**
 * Edits a receiving record's own details. If the received quantity is
 * corrected, the linked batch is adjusted by the DELTA (new - old), not
 * overwritten outright — the batch may already have been partially
 * released via FIFO since it was received, and a blind overwrite would
 * silently un-release stock that's genuinely gone. This is what makes
 * editing "correctly update inventory quantities" instead of just
 * technically changing a number, and it never creates a second batch —
 * always the one this record already points to.
 */
export async function updateReceivingRecord(id, { batchNumber, supplierId, invoiceNumber, purchaseReference, quantity, receivedDate, remarks, editedBy }) {
  const { data: existing, error: fetchError } = await supabase.from('receiving_records').select('*, batch:medicine_batches(*)').eq('receiving_record_id', id).single()
  if (fetchError) throw fetchError

  const qtyDelta = quantity - existing.quantity
  const newBatchQty = Math.max(0, existing.batch.quantity + qtyDelta)
  const goingToDepleted = newBatchQty <= 0 && existing.batch.status !== 'Depleted'

  await updateMedicineBatch(existing.medicine_batch_id, {
    batch_number: batchNumber,
    supplier_id: supplierId || null,
    received_date: receivedDate,
    purchase_reference: purchaseReference || null,
    quantity: newBatchQty,
    status: newBatchQty <= 0 ? 'Depleted' : existing.batch.status === 'Depleted' ? 'Active' : existing.batch.status,
  })
  if (goingToDepleted) {
    // Same gap class as archive/damage/expired-removal/release above —
    // a batch newly reaching Depleted leaves run_expiration_check()'s
    // tracking loop, so any expiring_* alert it already had would
    // otherwise stay open forever. Found completing the Phase 9 sweep
    // for every place a batch transitions to a terminal status.
    try {
      await clearInventoryNotifications(null, EXPIRY_ALERT_TYPES, existing.medicine_batch_id)
    } catch {
      // Non-critical.
    }
  }

  const { data, error } = await supabase
    .from('receiving_records')
    .update({
      supplier_id: supplierId || null,
      invoice_number: invoiceNumber || null,
      purchase_reference: purchaseReference || null,
      quantity,
      received_date: receivedDate,
      remarks: remarks || null,
      updated_at: new Date().toISOString(),
    })
    .eq('receiving_record_id', id)
    .select()
    .single()
  if (error) throw error

  // Always log — even when qtyDelta is 0, other fields (batch number,
  // supplier, dates) may still have been corrected, and "every
  // transaction must be recorded" applies to those edits too, not just
  // quantity changes.
  await addMedicineMovement({
    medicineId: existing.medicine_id,
    medicineBatchId: existing.medicine_batch_id,
    actionType: 'Adjustment',
    quantityChange: qtyDelta,
    previousQuantity: existing.batch.quantity,
    newQuantity: newBatchQty,
    staffId: editedBy,
    notes: qtyDelta !== 0 ? `Receiving record corrected: quantity ${existing.quantity} → ${quantity}` : 'Receiving record details corrected',
  })

  return data
}

// ── DASHBOARD (Phase 10) ──
// Monthly movement and Top Used Medicines are genuinely expensive to
// compute client-side (inventory_logs grows unbounded) — both are
// pushed to the database via the RPC functions from migration 015. The
// simpler per-item status counts (Low/Critical Stock, Expired, Near
// Expiry) are deliberately NOT duplicated here — the Inventory page
// already has that data loaded from listMedicinesAsInventoryItems() for
// every other tab, so the dashboard reuses it via getInventoryStatus()
// rather than re-fetching the same rows a second time.

export async function getMonthlyMovement(monthsBack = 6) {
  const { data, error } = await supabase.rpc('get_monthly_inventory_movement', { months_back: monthsBack })
  if (error) throw error
  return data
}

export async function getTopUsedMedicines(daysBack = 30, resultLimit = 5) {
  const { data, error } = await supabase.rpc('get_top_used_medicines', { days_back: daysBack, result_limit: resultLimit })
  if (error) throw error
  return data
}

// A real COUNT query (head: true — no row data transferred), not a
// client-side filter over fetched batch rows.
export async function getDamagedBatchCount() {
  const { count, error } = await supabase.from('medicine_batches').select('medicine_batch_id', { count: 'exact', head: true }).eq('status', 'Damaged')
  if (error) throw error
  return count || 0
}

// Cumulative — "expiring within 90 days" naturally includes anything
// expiring within 30 or 7 days too (they're all within 90 days), matching
// plain-language interpretation rather than an exclusive day-band. A real
// COUNT-only query (head: true, no row data), same pattern as
// getDamagedBatchCount above — batch-level, since expiration is inherently
// a per-batch concept, not an aggregate-medicine one.
export async function getExpiringBatchCount(days) {
  const today = new Date().toISOString().slice(0, 10)
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { count, error } = await supabase
    .from('medicine_batches')
    .select('medicine_batch_id', { count: 'exact', head: true })
    .eq('status', 'Active')
    .not('expiration_date', 'is', null)
    .gte('expiration_date', today)
    .lte('expiration_date', until)
  if (error) throw error
  return count || 0
}

export async function getRecentlyReceived(limitCount = 5) {
  const { data, error } = await supabase
    .from('receiving_records')
    .select('*, medicine:medicines ( medicine_name, unit )')
    .order('received_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limitCount)
  if (error) throw error
  return data.map((r) => ({ ...r, medicine_name: r.medicine?.medicine_name ?? 'Unknown', unit: r.medicine?.unit ?? '' }))
}

export async function getRecentlyReleased(limitCount = 5) {
  const { data, error } = await supabase
    .from('inventory_logs')
    .select('*, item:inventory ( name ), medicine:medicines ( medicine_name, unit ), staff:users!inventory_logs_staff_id_fkey ( name )')
    .in('action_type', ['Released', 'Release'])
    .order('created_at', { ascending: false })
    .limit(limitCount)
  if (error) throw error
  return data.map((l) => ({
    ...l,
    item_name: l.item?.name ?? l.medicine?.medicine_name ?? 'Unknown',
    unit: l.medicine?.unit ?? '',
    staff_name: l.staff?.name ?? '—',
  }))
}
