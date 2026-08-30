// src/features/inventory/inventoryOfflineActions.js
//
// Phase 2 — registers the actual "how to replay this" functions for
// inventory actions with the generic queue from offlineQueueService.js.
// Kept separate from InventoryPage.jsx (rather than inline there) so
// these register once at module load regardless of which inventory tab
// happens to be mounted, and so InventoryPage.jsx's own handlers stay
// focused on "online vs. queue" instead of also holding the replay
// logic itself.
//
// SCOPE — Phase 2 covers Release and Replenish (Add Stock) specifically,
// the two actions the task named ("inventory updates"). InventoryPage.jsx
// has 14+ other mutation call sites (Merge, Remove, Edit Details, Batch
// operations, QR-scan stock-in, etc.) that are NOT wired for offline use
// yet — those still behave exactly as before (fail normally if offline).
// Extending coverage to those is a natural follow-up, not attempted here.
//
// RISK ACCEPTED (medicine paths only, per explicit confirmation): both
// releaseMedicineStockFIFO and replenishMedicineAsNewBatch pick specific
// batches based on their state AT REPLAY TIME, which may have changed
// since the action was queued while offline (e.g. the batch FIFO would
// have picked is fully depleted by someone else by the time this syncs).
// A queued medicine action can therefore end up applying to a different
// batch than the person saw on screen when they submitted it offline.
// The equipment/supply paths have no such risk (they act on a fixed
// inventory_id, not a batch chosen at write time).

import { registerOfflineRunner } from '@services/offlineQueueService'
import { releaseMedicineStockFIFO, replenishMedicineAsNewBatch } from '@services/medicineService'
import { updateInventoryItem, addInventoryLog } from '@services/inventoryService'

registerOfflineRunner('inventory_release_medicine', async (payload) => {
  await releaseMedicineStockFIFO(payload.medicineId, payload.qty, payload.staffId, payload.notes)
})

registerOfflineRunner('inventory_release_simple', async (payload) => {
  // Equipment/Supply path — a single fixed-target update, no batch
  // selection, so this one has no batch-mismatch risk at all: replaying
  // it later against whatever the item's quantity is BY THEN is exactly
  // as correct as replaying it immediately would have been.
  await updateInventoryItem(payload.inventoryId, { quantity: payload.newQuantity })
  await addInventoryLog({
    inventoryId: payload.inventoryId,
    actionType: 'Release',
    quantityChange: payload.quantityChange,
    previousQuantity: payload.previousQuantity,
    newQuantity: payload.newQuantity,
    staffId: payload.staffId,
    notes: payload.notes,
  })
})

registerOfflineRunner('inventory_replenish_medicine', async (payload) => {
  await replenishMedicineAsNewBatch({
    medicineId: payload.medicineId,
    quantity: payload.quantity,
    expirationDate: payload.expirationDate,
    receivedDate: payload.receivedDate,
    supplierId: payload.supplierId,
    batchNumber: payload.batchNumber,
    purchaseReference: payload.purchaseReference,
    unitCost: payload.unitCost,
    staffId: payload.staffId,
    notes: payload.notes,
  })
})