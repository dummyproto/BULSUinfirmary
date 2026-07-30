import { supabase } from './supabaseClient'

// Service layer for the migration-024 normalized structure (supplies /
// supply_batches). Mirrors medicineService.js's own structure exactly —
// same read-via-view approach, same soft-delete-only reasoning — see that
// file's header comment for the full rationale, which applies here
// unchanged.
//
// This is the READ side of the Supply half of the "separate the database"
// request. inventoryService.js's listInventory() still also returns
// Supply-category rows from the legacy `inventory` table for now — the
// same staged cutover migration 007/008 used for Medicine (new structure
// exists and is populated; switching every write-path — Add/Edit/Release/
// Replenish forms, Batches tab — over to it is a separate, later phase).

// ── SUPPLIES (read as unified "inventory item" shape, aggregated live) ──
export async function listSuppliesAsInventoryItems() {
  const { data, error } = await supabase.from('supply_inventory_view').select('*').order('name')
  if (error) throw error
  return data.map((s) => ({ ...s, _source: 'supply', _id: s.supply_id, inventory_id: null }))
}

export async function createSupply(fields) {
  const { data, error } = await supabase.from('supplies').insert(fields).select().single()
  if (error) throw error
  return data
}

export async function updateSupply(id, patch) {
  const { data, error } = await supabase
    .from('supplies')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('supply_id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Soft-delete only — same reasoning as medicineService.deactivateMedicine:
// a supply item can be referenced by years of batch/movement history.
export async function deactivateSupply(id) {
  const { data, error } = await supabase
    .from('supplies')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('supply_id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── SUPPLY BATCHES ──
const SUPPLY_BATCH_WITH_JOINS = `*, supply:supplies!supply_batches_supply_id_fkey ( supply_name, unit ), supplier:suppliers ( supplier_name )`

function flattenSupplyBatch(b) {
  const supplierName = b.supplier?.supplier_name ?? null
  return {
    ...b,
    batch_code: b.batch_number,
    item_name: b.supply?.supply_name ?? 'Unknown',
    item_unit: b.supply?.unit ?? '',
    supplier_name: supplierName,
    supplier: supplierName,
  }
}

export async function listSupplyBatches(supplyId) {
  let query = supabase.from('supply_batches').select(SUPPLY_BATCH_WITH_JOINS).order('created_at', { ascending: false })
  if (supplyId) query = query.eq('supply_id', supplyId)
  const { data, error } = await query
  if (error) throw error
  return data.map(flattenSupplyBatch)
}

export async function createSupplyBatch(fields) {
  const { data, error } = await supabase.from('supply_batches').insert(fields).select(SUPPLY_BATCH_WITH_JOINS).single()
  if (error) throw error
  return flattenSupplyBatch(data)
}

export async function updateSupplyBatch(id, patch) {
  const { data, error } = await supabase
    .from('supply_batches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('supply_batch_id', id)
    .select(SUPPLY_BATCH_WITH_JOINS)
    .single()
  if (error) throw error
  return flattenSupplyBatch(data)
}