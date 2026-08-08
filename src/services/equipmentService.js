import { supabase } from './supabaseClient'

// Service layer for the migration-024 normalized structure (equipment /
// equipment_batches). Mirrors medicineService.js / supplyService.js's
// exact structure — see medicineService.js's header comment for the full
// staged-cutover rationale, unchanged here.

// ── EQUIPMENT (read as unified "inventory item" shape, aggregated live) ──
export async function listEquipmentAsInventoryItems() {
  const { data, error } = await supabase.from('equipment_inventory_view').select('*').order('name')
  if (error) throw error
  return data.map((e) => ({ ...e, _source: 'equipment', _id: e.equipment_id, inventory_id: null }))
}

export async function createEquipment(fields) {
  const { data, error } = await supabase.from('equipment').insert(fields).select().single()
  if (error) throw error
  return data
}

export async function updateEquipment(id, patch) {
  const { data, error } = await supabase
    .from('equipment')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('equipment_id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Soft-delete only — same reasoning as medicineService.deactivateMedicine.
export async function deactivateEquipment(id) {
  const { data, error } = await supabase
    .from('equipment')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('equipment_id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── EQUIPMENT BATCHES ──
const EQUIPMENT_BATCH_WITH_JOINS = `*, equipment:equipment!equipment_batches_equipment_id_fkey ( equipment_name, unit ), supplier:suppliers ( supplier_name )`

function flattenEquipmentBatch(b) {
  const supplierName = b.supplier?.supplier_name ?? null
  return {
    ...b,
    batch_code: b.batch_number,
    item_name: b.equipment?.equipment_name ?? 'Unknown',
    item_unit: b.equipment?.unit ?? '',
    supplier_name: supplierName,
    supplier: supplierName,
  }
}

export async function listEquipmentBatches(equipmentId) {
  let query = supabase.from('equipment_batches').select(EQUIPMENT_BATCH_WITH_JOINS).order('created_at', { ascending: false })
  if (equipmentId) query = query.eq('equipment_id', equipmentId)
  // Same reasoning as listInventoryBatches() in inventoryService.js —
  // called unfiltered as part of InventoryPage's initial parallel load,
  // so an unbounded fetch here directly slows down every page visit.
  query = query.limit(500)
  const { data, error } = await query
  if (error) throw error
  return data.map(flattenEquipmentBatch)
}

export async function createEquipmentBatch(fields) {
  const { data, error } = await supabase.from('equipment_batches').insert(fields).select(EQUIPMENT_BATCH_WITH_JOINS).single()
  if (error) throw error
  return flattenEquipmentBatch(data)
}

export async function updateEquipmentBatch(id, patch) {
  const { data, error } = await supabase
    .from('equipment_batches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('equipment_batch_id', id)
    .select(EQUIPMENT_BATCH_WITH_JOINS)
    .single()
  if (error) throw error
  return flattenEquipmentBatch(data)
}

// Toggles the manual "flag this as needing attention now" switch —
// independent of the date-based overdue check equipment_inventory_view
// also folds into needs_maintenance (see migration 025's comment).
export async function setEquipmentBatchMaintenanceFlag(id, needsMaintenance) {
  return updateEquipmentBatch(id, { needs_maintenance: needsMaintenance })
}