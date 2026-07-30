import { supabase } from './supabaseClient'

// Post-Phase-A-migration: `inventory_logs.action_type` now accepts every
// real action the UI produces (Edit, Merge, Remove Expired, Maintained,
// Maintenance Hold, ...) and `inventory_logs.consultation_id` is a real FK
// — no more "collapse into Adjustment" or "encode a marker in notes"
// workarounds needed here.

export async function listInventoryBatches() {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('*, item:inventory!inventory_batches_inventory_id_fkey ( name, category, unit, min_stock )')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((b) => ({ ...b, item_name: b.item?.name ?? 'Unknown', item_category: b.item?.category ?? '—', item_unit: b.item?.unit ?? '' }))
}

export async function createInventoryBatch({ inventoryId, batchCode, quantity, expirationDate, receivedDate, supplier, notes }) {
  const { data, error } = await supabase
    .from('inventory_batches')
    .insert({ inventory_id: inventoryId, batch_code: batchCode, quantity, expiration_date: expirationDate || null, received_date: receivedDate || null, supplier: supplier || null, notes: notes || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateInventoryBatch(batchId, patch) {
  const { data, error } = await supabase.from('inventory_batches').update(patch).eq('batch_id', batchId).select().single()
  if (error) throw error
  return data
}

export async function deleteInventoryBatch(batchId) {
  const { error } = await supabase.from('inventory_batches').delete().eq('batch_id', batchId)
  if (error) throw error
}

export async function listInventory() {
  const { data, error } = await supabase.from('inventory').select('*').order('category').order('name')
  if (error) throw error
  return data
}

export async function createInventoryItem(item) {
  const { data, error } = await supabase.from('inventory').insert(item).select().single()
  if (error) throw error
  return data
}

export async function updateInventoryItem(id, patch) {
  const { data, error } = await supabase
    .from('inventory')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('inventory_id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInventoryItem(id) {
  const { error } = await supabase.from('inventory').delete().eq('inventory_id', id)
  if (error) throw error
}

export async function listInventoryLogs() {
  const { data, error } = await supabase
    .from('inventory_logs')
    .select('*, staff:users!inventory_logs_staff_id_fkey ( name ), item:inventory ( name ), medicine:medicines ( medicine_name ), medicine_batch:medicine_batches ( batch_number )')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((l) => ({
    ...l,
    staff_name: l.staff?.name ?? null,
    item_name: l.item?.name ?? l.medicine?.medicine_name ?? null,
    medicine_batch_number: l.medicine_batch?.batch_number ?? null,
  }))
}

// Date-range-scoped sibling of listInventoryLogs — for the Inventory
// Movement report (Phase 11). Avoids pulling the entire, unbounded
// inventory_logs history just to report on one date range; the report
// only ever needs rows inside the selected period.
export async function listInventoryLogsInRange(from, to) {
  const { data, error } = await supabase
    .from('inventory_logs')
    .select('*, staff:users!inventory_logs_staff_id_fkey ( name ), item:inventory ( name ), medicine:medicines ( medicine_name ), medicine_batch:medicine_batches ( batch_number )')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((l) => ({
    ...l,
    staff_name: l.staff?.name ?? null,
    item_name: l.item?.name ?? l.medicine?.medicine_name ?? null,
    medicine_batch_number: l.medicine_batch?.batch_number ?? null,
  }))
}

export async function addInventoryLog({ inventoryId, actionType, quantityChange, previousQuantity, newQuantity, staffId, notes, consultationId }) {
  const { data, error } = await supabase
    .from('inventory_logs')
    .insert({
      inventory_id: inventoryId,
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
  return data
}

export async function listScanHistory() {
  const { data, error } = await supabase.from('scan_history').select('*').order('scanned_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addScanHistory({ scannedBy, itemName, category, quantity, result, rawData, medicineId, medicineBatchId }) {
  const { data, error } = await supabase
    .from('scan_history')
    .insert({ scanned_by: scannedBy, item_name: itemName, category, quantity, result, raw_data: rawData, medicine_id: medicineId ?? null, medicine_batch_id: medicineBatchId ?? null })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Deducts each prescribed medicine's quantity from `inventory` and writes a
 * matching `inventory_logs` row (action_type 'Release', linked to the
 * consultation via the real `consultation_id` FK). NOT run inside a
 * transaction with the consultation insert — if you need the two to
 * succeed/fail together, wrap both in a Postgres RPC. Matches by exact
 * name (case-insensitive), same matching rule as the in-memory version
 * built in Phase 3.
 */
export async function deductForConsultation(prescribedMeds, staffId, consultationId) {
  const { data: items, error } = await supabase.from('inventory').select('*').eq('category', 'Medicine')
  if (error) throw error

  const deductions = []
  const errors = []

  for (const med of prescribedMeds) {
    const match = items.find((i) => i.name.toLowerCase() === med.name.toLowerCase())
    if (!match) {
      errors.push({ medicine: med.name, message: `"${med.name}" not found in inventory — no deduction made.` })
      continue
    }
    if (match.quantity < med.qty) {
      errors.push({ medicine: med.name, message: `Insufficient stock for "${med.name}" (${match.quantity} ${match.unit} available, ${med.qty} needed).` })
      continue
    }
    const newQty = match.quantity - med.qty
    const { error: updateError } = await supabase.from('inventory').update({ quantity: newQty }).eq('inventory_id', match.inventory_id)
    if (updateError) throw updateError
    await addInventoryLog({ inventoryId: match.inventory_id, actionType: 'Released', quantityChange: -med.qty, previousQuantity: match.quantity, newQuantity: newQty, staffId, notes: 'Deducted from consultation', consultationId })
    deductions.push({ medicine: med.name, qty: med.qty, unit: match.unit, remaining: newQty })
  }

  return { deductions, errors }
}

export async function listLogsForConsultation(consultationId) {
  const { data, error } = await supabase.from('inventory_logs').select('*').eq('consultation_id', consultationId)
  if (error) throw error
  return data
}
