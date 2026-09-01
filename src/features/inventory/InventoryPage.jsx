import { useEffect, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { useConfirm } from '@context/ConfirmContext'
import { useOnlineStatus } from '@hooks/useOnlineStatus'
import Spinner from '@components/ui/Spinner'
import ItemsTab from './ItemsTab'
import ScanTab from './ScanTab'
import LogTab from './LogTab'
import AlertsTab from './AlertsTab'
import SuppliersTab from './SuppliersTab'
import AddEditSupplierModal from './AddEditSupplierModal'
import InventoryDashboardTab from './InventoryDashboardTab'
import BatchQRModal from './BatchQRModal'
import BatchDetailModal from './BatchDetailModal'
import AddItemModal from './AddItemModal'
import AddBatchModal from './AddBatchModal'
import ReplenishBatchModal from './ReplenishBatchModal'
import ReleaseBatchModal from './ReleaseBatchModal'
import ReleaseBatchPickerModal from './ReleaseBatchPickerModal'
import EditBatchModal from './EditBatchModal'
import EditItemModal from './EditItemModal'
import ReplenishModal from './ReplenishModal'
import ReleaseModal from './ReleaseModal'
import ReleasePickerModal from './ReleasePickerModal'
import RestoreEquipmentModal from './RestoreEquipmentModal'
import ScanVerifyModal, { parseQRPayload } from './ScanVerifyModal'
import { getInventoryStatus, mergeDisplayExpirationDate, findInventoryItemMatch, itemKey, isPastISODate, batchKey } from './lib/inventoryHelpers'
import {
  listInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  listInventoryLogs,
  deleteInventoryLogs,
  addInventoryLog,
  listScanHistory,
  deleteScanHistory,
  addScanHistory,
  listInventoryBatches,
  createInventoryBatch,
  updateInventoryBatch,
} from '@services/inventoryService'
import {
  listMedicinesAsInventoryItems,
  listMedicineBatches,
  createMedicine,
  updateMedicine,
  deactivateMedicine,
  updateMedicineBatch,
  archiveMedicineBatch,
  restoreArchivedBatch,
  addMedicineMovement,
  releaseMedicineStockFIFO,
  replenishMedicineAsNewBatch,
  removeExpiredBatchQuantity,
  reportDamagedBatch,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createReceivingRecord,
  getMedicineBatchById,
  runExpirationCheck,
} from '@services/medicineService'
import { listSuppliesAsInventoryItems, listSupplyBatches, updateSupply, deactivateSupply } from '@services/supplyService'
import { listEquipmentAsInventoryItems, listEquipmentBatches, updateEquipment, deactivateEquipment } from '@services/equipmentService'
import { clearInventoryNotifications } from '@services/inventoryNotificationsService'
import { listUsers } from '@services/usersService'
import { notify } from '@services/notificationsService'
import { InventoryIcon, CameraIcon, ClipboardIcon, BellIcon, AlertOctagonIcon, AlertTriangleIcon, TruckIcon, BarChartIcon } from '@components/ui/icons'
import { useRealtimeRefresh } from '@hooks/useRealtimeRefresh'
import { enqueueOfflineAction } from '@services/offlineQueueService'
import './inventoryOfflineActions' // registers the offline runners — import kept for its side effect only

const TABS = [
  { key: 'dashboard', label: 'Dashboard', Icon: BarChartIcon },
  { key: 'items', label: 'Items', Icon: InventoryIcon },
  { key: 'suppliers', label: 'Suppliers', Icon: TruckIcon },
  { key: 'scan', label: 'QR Scanner', Icon: CameraIcon },
  { key: 'log', label: 'Log', Icon: ClipboardIcon },
  { key: 'alerts', label: 'Alerts', Icon: BellIcon },
]

export default function InventoryPage() {
  const { profile } = useAuth()
    const { show } = useToast()
  const isOnline = useOnlineStatus()
  const confirm = useConfirm()
  const currentUserId = profile?.user_id ?? null
  // Phase 2 offline support (Release + Replenish only — see
  // inventoryOfflineActions.js's own scope note) — checked at the top of
  // each of those two handlers to decide "run it now" vs. "queue it".
  const canDeleteLogs = profile?.role === 'admin' || !!profile?.permissions?.delete_logs

 const [tab, setTab] = useState('dashboard')
  // Which sub-view the merged Items tab shows — 'items' (the item
  // list/grid) or 'batches' (the batch-tracking tables, formerly its own
  // top-level tab). Lifted up here rather than kept local to ItemsTab so
  // InventoryDashboardTab's "View Batches" quick-link (onNavigateToBatches
  // below) can land directly on the Batches sub-view, not just the tab.
  const [itemsSubTab, setItemsSubTab] = useState('items')
  const [loading, setLoading] = useState(true)
  const [inventory, setInventory] = useState([])
  const [batches, setBatches] = useState([])
  const [logs, setLogs] = useState([])
  const [scanHistory, setScanHistory] = useState([])
  const [staff, setStaff] = useState([])
  const [suppliers, setSuppliers] = useState([])

  const [itemsFilters, setItemsFilters] = useState({ search: '', category: 'All', status: 'All' })
  const [logSearch, setLogSearch] = useState('')
  const [batchSearch, setBatchSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')

  const [addItemOpen, setAddItemOpen] = useState(false)
  // Pre-fill for AddItemModal when opened from a scanned "pending item"
  // QR code (see handleProcessRaw below) — null means the modal opens
  // blank as usual. addItemModalKey forces a full remount whenever a
  // new pending item is scanned, so the form correctly resets to the
  // new pre-fill data (React's own recommended fix for "reset state
  // when external data changes," rather than an effect calling
  // setState synchronously).
  const [pendingItemPrefill, setPendingItemPrefill] = useState(null)
  const [addItemModalKey, setAddItemModalKey] = useState(0)
  const [editItemId, setEditItemId] = useState(null)
  const [replenishItemId, setReplenishItemId] = useState(null)
  const [releaseItemId, setReleaseItemId] = useState(null)
  const [releasePickerOpen, setReleasePickerOpen] = useState(false)
  const [restoreItemId, setRestoreItemId] = useState(null)
  const [scanVerify, setScanVerify] = useState(null) // { rawData, matchedItem }

  const [addBatchOpen, setAddBatchOpen] = useState(false)
  const [editBatchId, setEditBatchId] = useState(null)
  const [replenishBatchId, setReplenishBatchId] = useState(null)
  const [releaseBatchId, setReleaseBatchId] = useState(null)
  const [releaseBatchPickerOpen, setReleaseBatchPickerOpen] = useState(false)
  const [supplierModal, setSupplierModal] = useState(null) // { mode: 'add' } | { mode: 'edit', supplier }
  const [qrBatchKey, setQrBatchKey] = useState(null)
  const [scannedBatch, setScannedBatch] = useState(null)
  // Phase 7 — separate from scannedBatch above on purpose: scannedBatch
  // stays the read-only "view" flow (used by the Notification Center's
  // click-to-open-batch handler below), this is the confirm-before-save
  // flow specifically for scanning the clinic's own printed batch QR —
  // the two triggers should never cross-talk or clobber each other's state.
  const [scanReplenishBatch, setScanReplenishBatch] = useState(null)

  // Medicine Expiration alerts (Notification System Phase 4, automated
  // in Phase 8). Unlike stock releases, "an item is still expired" isn't
  // a discrete user action — there's nothing to hook the way
  // addMedicineMovement hooks a release. This call is now a thin RPC
  // wrapper around run_expiration_check() (migration 018), the single
  // source of truth for the whole algorithm (tiering, dedup, auto-clear,
  // status sync) — the SAME function also runs daily via pg_cron
  // independent of anyone opening this page, so this call here is a
  // "check right now too" nudge, not the only way it ever runs.
  async function checkExpirationAlerts() {
    try {
      await runExpirationCheck()
    } catch {
      // Best-effort — expiration alerts should never block the page.
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listInventory(),
      listInventoryLogs(),
      listScanHistory(),
      listUsers(),
      listInventoryBatches(),
      listMedicinesAsInventoryItems(),
      listMedicineBatches(),
      listSuppliesAsInventoryItems(),
      listSupplyBatches(),
      listEquipmentAsInventoryItems(),
      listEquipmentBatches(),
      listSuppliers(),
    ])
      .then(async ([inv, log, scan, users, batchList, medicines, medBatches, supplies, supplyBatchList, equipmentItems, equipmentBatchList, supplierList]) => {
        if (cancelled) return
        // Medicine, Supply, and Equipment now all live in normalized
        // tables (migrations 007/008 for Medicine, 024/025 for Supply and
        // Equipment) — legacy `inventory` rows for all three categories
        // still exist in the database (nothing was deleted) but are
        // suppressed from display here so each item shows exactly once,
        // from its authoritative new source. This is the same staged
        // cutover pattern Medicine already went through; nothing on
        // `inventory` itself changes as part of it.
        const legacyMigrated = inv.filter((i) => !['Medicine', 'Supply', 'Equipment'].includes(i.category))
        const legacyMigratedBatches = batchList.filter((b) => !['Medicine', 'Supply', 'Equipment'].includes(b.item_category))
        setInventory([...legacyMigrated, ...medicines, ...supplies, ...equipmentItems])
        setLogs(log)
        setScanHistory(scan)
        setStaff(users.filter((u) => u.role === 'staff' || u.role === 'admin'))
        setBatches([
          ...legacyMigratedBatches,
          ...medBatches.map((b) => ({ ...b, _source: 'medicine', item_category: 'Medicine' })),
          ...supplyBatchList.map((b) => ({ ...b, _source: 'supply', item_category: 'Supply' })),
          ...equipmentBatchList.map((b) => ({ ...b, _source: 'equipment', item_category: 'Equipment' })),
        ])
        setSuppliers(supplierList)
        // Loading ends here — everything the page actually renders is
        // already set above. checkExpirationAlerts() (a server-side RPC)
        // was previously awaited before setLoading(false) ran, meaning
        // the spinner stayed up for this extra round-trip even though the
        // inventory list itself was already fully ready to show. Running
        // it in the background instead means the page becomes interactive
        // as soon as its own data arrives — any status change it makes
        // (e.g. an item flipping to Near Expiry) shows up moments later
        // via the realtime subscriptions below, rather than the whole
        // page waiting on it first.
        if (!cancelled) setLoading(false)
        checkExpirationAlerts().catch(() => {
          // Non-critical — see the try/catch this mirrors elsewhere in
          // this file for the same reasoning. A failed background
          // expiration check must never disrupt the page the person is
          // already looking at.
        })
      })
      .catch((err) => show(`Failed to load inventory: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshInventory() {
    const [inv, medicines, supplies, equipmentItems] = await Promise.all([
      listInventory(),
      listMedicinesAsInventoryItems(),
      listSuppliesAsInventoryItems(),
      listEquipmentAsInventoryItems(),
    ])
    setInventory([
      ...inv.filter((i) => !['Medicine', 'Supply', 'Equipment'].includes(i.category)),
      ...medicines,
      ...supplies,
      ...equipmentItems,
    ])
  }
  async function refreshLogs() {
    setLogs(await listInventoryLogs())
  }
  async function handleDeleteInventoryLogs(ids) {
    const ok = await confirm(
      ids.length === 1
        ? 'Delete this log entry?\nThis cannot be undone.'
        : `Delete ${ids.length} log entries?\nThis cannot be undone.`,
      { confirmLabel: 'Delete', danger: true }
    )
    if (!ok) return
    try {
      await deleteInventoryLogs(ids)
      setLogs((list) => list.filter((l) => !ids.includes(l.inventory_log_id)))
      show(ids.length === 1 ? 'Log entry deleted' : `${ids.length} log entries deleted`, 'success')
    } catch (err) {
      show(`Failed to delete: ${err.message}`, 'error')
    }
  }
  async function handleDeleteScanHistory(ids) {
    const ok = await confirm(
      ids.length === 1
        ? 'Delete this scan history entry?\nThis cannot be undone.'
        : `Delete ${ids.length} scan history entries?\nThis cannot be undone.`,
      { confirmLabel: 'Delete', danger: true }
    )
    if (!ok) return
    try {
      await deleteScanHistory(ids)
      setScanHistory((list) => list.filter((s) => !ids.includes(s.scan_id)))
      show(ids.length === 1 ? 'Scan history entry deleted' : `${ids.length} scan history entries deleted`, 'success')
    } catch (err) {
      show(`Failed to delete: ${err.message}`, 'error')
    }
  }
  async function refreshBatches() {
    const [legacyBatches, medBatches, supplyBatchList, equipmentBatchList] = await Promise.all([
      listInventoryBatches(),
      listMedicineBatches(),
      listSupplyBatches(),
      listEquipmentBatches(),
    ])
    setBatches([
      ...legacyBatches.filter((b) => !['Medicine', 'Supply', 'Equipment'].includes(b.item_category)),
      ...medBatches.map((b) => ({ ...b, _source: 'medicine', item_category: 'Medicine' })),
      ...supplyBatchList.map((b) => ({ ...b, _source: 'supply', item_category: 'Supply' })),
      ...equipmentBatchList.map((b) => ({ ...b, _source: 'equipment', item_category: 'Equipment' })),
    ])
  }
  async function refreshSuppliers() {
    setSuppliers(await listSuppliers())
  }
  async function refreshScanHistory() {
    setScanHistory(await listScanHistory())
  }

  // Every category (Medicine/Supply/Equipment) writes to its own
  // normalized tables (see the big comment in the mount effect above),
  // so each realtime subscription below lists every table that feeds its
  // corresponding refresh* function — not just the "obvious" one — or a
  // change made through a different category's path would silently not
  // show up here for anyone else already on the page.
  useRealtimeRefresh(['inventory', 'medicines', 'supplies', 'equipment'], refreshInventory)
  useRealtimeRefresh(['inventory_batches', 'medicine_batches', 'supply_batches', 'equipment_batches'], refreshBatches)
  useRealtimeRefresh('suppliers', refreshSuppliers)
  useRealtimeRefresh('inventory_logs', refreshLogs)
  useRealtimeRefresh('scan_history', refreshScanHistory)

  const low = inventory.filter((i) => getInventoryStatus(i) === 'Low Stock').length
  const expired = inventory.filter((i) => getInventoryStatus(i) === 'Expired').length
  const expiring = inventory.filter((i) => getInventoryStatus(i) === 'Near Expiry').length
  const alertCount = low + expired + expiring

  // ── SHARED MERGE HELPER (Items) ──
  // Every one of the item-quantity flows below — staged Add Item finding
  // a duplicate, Edit Save detecting a duplicate, plain Replenish, QR
  // scan stock-in, and Add Batch's non-medicine branch — used to
  // separately repeat the same two calls: bump the existing legacy
  // `inventory` row's quantity (plus whatever other fields that flow
  // merges in) via updateInventoryItem, then addInventoryLog a matching
  // before/after quantity pair for it. That duplication is consolidated
  // here. Each caller still builds its OWN `patch` object — they
  // genuinely differ in which fields they merge and how (e.g. QR scan
  // stock-in sets min_stock directly where the others Math.max it
  // against the existing value) — only the "write it, then log exactly
  // that delta" plumbing is shared. Returns the updated row so callers
  // that keep their own local copy of the inventory list (staged Add
  // Item's `working` array) can splice it back in.
  async function mergeQuantityIntoItem(item, patch, { quantity, actionType = 'Replenish', notes }) {
    const updated = await updateInventoryItem(item.inventory_id, { ...patch, quantity: item.quantity + quantity })
    if (quantity > 0) {
      await addInventoryLog({
        inventoryId: item.inventory_id,
        actionType,
        quantityChange: quantity,
        previousQuantity: item.quantity,
        newQuantity: item.quantity + quantity,
        staffId: currentUserId,
        notes,
      })
    }
    return updated
  }

  // ── SHARED MERGE HELPER (Batches) ──
  // Same idea as mergeQuantityIntoItem above, but for adding quantity to
  // an existing medicine batch — handleReplenishBatch's medicine branch
  // (manual "Replenish Batch" modal) and handleScanBatchReplenish
  // (confirming a scanned batch QR) used to each repeat the identical
  // updateMedicineBatch + addMedicineMovement pair, differing only in
  // the notes text and what happens after (the QR flow also logs scan
  // history and navigates back to the Items tab). That shared pair is
  // consolidated here; each call site keeps its own notes/follow-up.
  async function mergeQuantityIntoMedicineBatch(batch, form, notes) {
    await updateMedicineBatch(batch.medicine_batch_id, {
      quantity: batch.quantity + form.qty,
      expiration_date: form.expiry || batch.expiration_date,
      received_date: form.received || batch.received_date,
      supplier_id: form.supplierId || batch.supplier_id,
      status: 'Active',
    })
    await addMedicineMovement({
      medicineId: batch.medicine_id,
      medicineBatchId: batch.medicine_batch_id,
      actionType: 'Received',
      quantityChange: form.qty,
      previousQuantity: batch.quantity,
      newQuantity: batch.quantity + form.qty,
      staffId: currentUserId,
      notes,
    })
  }

  // ── ADD ITEM (staged multi-item, with merge-into-existing detection) ──
  async function handleSaveAllStaged(staged) {
    let added = 0
    let consolidated = 0
    try {
      let working = inventory
      for (const f of staged) {
        const supplierRow = f.supplierId ? suppliers.find((s) => String(s.supplier_id) === f.supplierId) : null
        const match = findInventoryItemMatch(working, { name: f.name, category: f.category, unit: f.unit, supplier: supplierRow?.supplier_name || null })

        if (f.category === 'Medicine') {
          if (match && match._source === 'medicine') {
            // Existing medicine — a new delivery is always a new batch
            // (Medicine stock has no standalone aggregate to bump
            // directly anymore, see Phase 2/3 design).
            await replenishMedicineAsNewBatch({
              medicineId: match._id,
              quantity: f.quantity,
              expirationDate: f.expiry || null,
              receivedDate: f.received || null,
              supplierId: supplierRow?.supplier_id || null,
              batchNumber: f.batchNo || null,
              staffId: currentUserId,
              notes: 'Merged into existing medicine (Add Item)',
            })
            consolidated++
          } else {
            const medicine = await createMedicine({ medicine_name: f.name, unit: f.unit, min_stock: f.minStock || 0, active: true, image_url: f.photoUrl || null })
            if (f.quantity > 0) {
              await replenishMedicineAsNewBatch({
                medicineId: medicine.medicine_id,
                quantity: f.quantity,
                expirationDate: f.expiry || null,
                receivedDate: f.received || null,
                supplierId: supplierRow?.supplier_id || null,
                batchNumber: f.batchNo || null,
                staffId: currentUserId,
                notes: 'Initial stock',
              })
            }
            added++
          }
          continue
        }

        // Supply / Equipment — unchanged legacy path, except the supplier
        // NAME (still a plain VARCHAR on this table) now comes from the
        // resolved dropdown selection instead of free-typed text.
        if (match) {
          const updated = await mergeQuantityIntoItem(
            match,
            {
              unit: f.unit || match.unit,
              min_stock: Math.max(f.minStock || 0, match.min_stock || 0) || match.min_stock,
              batch_no: f.batchNo || match.batch_no,
              supplier: supplierRow?.supplier_name || match.supplier,
              expiration_date: mergeDisplayExpirationDate(match.expiration_date, f.expiry || null),
              received_date: f.received || match.received_date,
              image_url: f.photoUrl || match.image_url,
            },
            { quantity: f.quantity, notes: 'Merged into existing inventory item' }
          )
          working = working.map((i) => (i.inventory_id === updated.inventory_id ? updated : i))
          consolidated++
        } else {
          const created = await createInventoryItem({
            name: f.name,
            category: f.category,
            quantity: f.quantity,
            unit: f.unit,
            min_stock: f.minStock,
            expiration_date: f.expiry || null,
            batch_no: f.batchNo || null,
            received_date: f.received || new Date().toISOString().slice(0, 10),
            supplier: supplierRow?.supplier_name || null,
            is_fifo: false,
            needs_maintenance: false,
            image_url: f.photoUrl || null,
          })
          working = [...working, created]
          if (f.quantity > 0) await addInventoryLog({ inventoryId: created.inventory_id, actionType: 'Replenish', quantityChange: f.quantity, previousQuantity: 0, newQuantity: f.quantity, staffId: currentUserId, notes: 'Initial stock' })
          added++
        }
      }
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      const parts = []
      if (added > 0) parts.push(`${added} new item${added === 1 ? '' : 's'}`)
      if (consolidated > 0) parts.push(`${consolidated} item${consolidated === 1 ? '' : 's'} merged with existing`)
      show(parts.join(', ') || 'Items processed', 'success')
    } catch (err) {
      show(`Failed to save items: ${err.message}`, 'error')
    }
  }

  // ── EDIT ──
  const editingItem = inventory.find((i) => itemKey(i) === editItemId) || null
  async function handleEditSave(form) {
    const item = editingItem
    try {
      if (item._source === 'medicine') {
        // Medicine has no "merge duplicate" concept the way legacy items
        // do — editing here only ever updates the medicine's own
        // permanent fields (name/unit/min_stock); quantity/expiry live on
        // its batches and are never touched by this form.
        await updateMedicine(item._id, { medicine_name: form.name, unit: form.unit, min_stock: form.minStock, image_url: form.photoUrl || null })
        await addMedicineMovement({ medicineId: item._id, actionType: 'Edit', quantityChange: 0, previousQuantity: item.quantity, newQuantity: item.quantity, staffId: currentUserId, notes: `Item details updated (unit: ${form.unit}, minStock: ${form.minStock})` })
        show('Medicine updated successfully', 'success')
        await Promise.all([refreshInventory(), refreshLogs()])
        setEditItemId(null)
        return
      }

      if (item._source === 'equipment' || item._source === 'supply') {
        // Same reasoning as the Equipment/Supply branches already fixed
        // elsewhere in this file (handleReplenish, handleRemove,
        // handleRestoreSubmit): these items live in their own normalized
        // tables now, so item.inventory_id is always null — falling
        // through to updateInventoryItem()/deleteInventoryItem() below
        // (which target the legacy `inventory` table) sends a PATCH with
        // a null id, which Postgres rejects outright ("invalid input
        // syntax for type integer: null").
        //
        // quantity is NOT sent here — Postgres itself confirmed it isn't
        // a real column on `supplies` ("Could not find the 'quantity'
        // column of 'supplies' in the schema cache"), and since a PATCH
        // fails atomically on any invalid column, sending it (even
        // unchanged, as item.quantity) was silently failing the ENTIRE
        // save — which is why min_stock/image_url appeared to do
        // nothing too. This handler edits item *details*, not stock
        // count, so quantity was never actually needed here regardless —
        // Replenish/Release own that job. expiration_date is likewise NOT
        // sent for either table now — Postgres confirmed it missing on
        // BOTH 'supplies' AND 'equipment' (two separate, direct errors,
        // not a guess this time), so the earlier "Equipment only" carve-
        // out was wrong too.
        //
        // name/unit/min_stock/image_url ARE sent — all four confirmed
        // real columns (equipment_name/supply_name/unit/min_stock/
        // image_url all showed up directly in information_schema.columns,
        // supply_name additionally confirmed via an existing working
        // join in supplyService.js). The name column itself differs per
        // table (equipment_name vs supply_name), unlike every other
        // field here which shares the same name on both tables.
        const updateFn = item._source === 'equipment' ? updateEquipment : updateSupply
        const nameField = item._source === 'equipment' ? 'equipment_name' : 'supply_name'
        const patch = { [nameField]: form.name, unit: form.unit, min_stock: form.minStock, image_url: form.photoUrl || null }
        await updateFn(item._id, patch)
        try {
          // equipmentId/supplyId (migration 028) — not inventoryId, which
          // is always null for these items and is exactly why this insert
          // used to fail every time. Still wrapped in try/catch: not
          // critical enough to undo a save that already succeeded, in
          // case this item somehow predates the migration.
          await addInventoryLog({ [item._source === 'equipment' ? 'equipmentId' : 'supplyId']: item._id, actionType: 'Edit', quantityChange: 0, previousQuantity: item.quantity, newQuantity: item.quantity, staffId: currentUserId, notes: `Item details updated (unit: ${form.unit}, minStock: ${form.minStock})` })
        } catch {
          // Non-critical — see the same try/catch elsewhere in this file
          // for why (inventory_logs.inventory_id has no row for these
          // items to reference).
        }
        show('Item updated successfully', 'success')
        await Promise.all([refreshInventory(), refreshLogs()])
        setEditItemId(null)
        return
      }

      const supplierRow = form.supplierId ? suppliers.find((s) => String(s.supplier_id) === form.supplierId) : null
      const match = findInventoryItemMatch(inventory, { name: form.name, category: form.category, unit: form.unit, supplier: supplierRow?.supplier_name || null }, item.inventory_id)
      if (match) {
        await mergeQuantityIntoItem(
          match,
          {
            category: form.category || match.category,
            unit: form.unit || match.unit,
            min_stock: Math.max(form.minStock || 0, match.min_stock || 0) || match.min_stock,
            batch_no: form.batchNo || match.batch_no,
            supplier: supplierRow?.supplier_name || match.supplier,
            expiration_date: mergeDisplayExpirationDate(match.expiration_date, form.expiry),
            received_date: form.received || match.received_date,
            image_url: form.photoUrl || match.image_url,
          },
          { quantity: item.quantity, actionType: 'Merge', notes: `Merged from duplicate item details (ID: ${item.inventory_id})` }
        )
        await deleteInventoryItem(item.inventory_id)
        show(`"${form.name}" merged into existing inventory item.`, 'success')
      } else {
        await updateInventoryItem(item.inventory_id, {
          name: form.name, category: form.category, unit: form.unit, min_stock: form.minStock,
          batch_no: form.batchNo, expiration_date: form.expiry, received_date: form.received, supplier: supplierRow?.supplier_name || null,
          image_url: form.photoUrl || null,
        })
        await addInventoryLog({ inventoryId: item.inventory_id, actionType: 'Edit', quantityChange: 0, previousQuantity: item.quantity, newQuantity: item.quantity, staffId: currentUserId, notes: `Item details updated (category: ${form.category}, unit: ${form.unit}, minStock: ${form.minStock})` })
        show('Item updated successfully', 'success')
      }
            await Promise.all([refreshInventory(), refreshLogs()])
      setEditItemId(null)
    } catch (err) {
      // Editing while offline throws a raw browser fetch error ("Failed
      // to fetch" / "NetworkError when attempting to fetch resource.")
      // that doesn't explain WHY it failed — and this used to close the
      // modal regardless of success or failure (setEditItemId(null) ran
      // unconditionally after this catch), making a failed save while
      // offline look identical to a successful one. Both fixed together:
      // a clear, specific reason when offline is the actual cause, and
      // the modal now only closes on the success paths above, so a
      // failed save stays open (with the person's edits still in place)
      // instead of silently discarding them.
      show(isOnline ? `Failed to update item: ${err.message}` : 'You appear to be offline. Check your connection and try again.', 'error')
    }
  }

  // ── REPLENISH ──
  const replenishingItem = inventory.find((i) => itemKey(i) === replenishItemId) || null
  async function handleReplenish(form) {
    const item = replenishingItem
    const supplierRow = form.supplierId ? suppliers.find((s) => String(s.supplier_id) === form.supplierId) : null
    try {
      if (item._source === 'medicine') {
        if (!isOnline) {
          // Queued instead of run — see inventoryOfflineActions.js's own
          // risk note: replenishMedicineAsNewBatch always creates a NEW
          // batch rather than picking an existing one, so unlike release
          // there's no "which batch" ambiguity to worry about here —
          // this one genuinely is safe to replay verbatim once synced.
          enqueueOfflineAction(
            'inventory_replenish_medicine',
            {
              medicineId: item._id,
              quantity: form.qty,
              expirationDate: form.expiry || null,
              receivedDate: form.received || null,
              supplierId: form.supplierId || null,
              batchNumber: form.batchNo || null,
              staffId: currentUserId,
              notes: form.notes,
            },
            { summary: `Replenish ${item.name} by ${form.qty} ${item.unit} (new batch)` }
          )
          show(`You're offline — ${item.name} restock (+${form.qty} ${item.unit}) will sync automatically once you're back online.`, 'warning')
          setReplenishItemId(null)
          return
        }
        await replenishMedicineAsNewBatch({
          medicineId: item._id,
          quantity: form.qty,
          expirationDate: form.expiry || null,
          receivedDate: form.received || null,
          supplierId: form.supplierId || null,
          batchNumber: form.batchNo || null,
          staffId: currentUserId,
          notes: form.notes,
        })
        await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
        show(`${item.name} replenished by ${form.qty} ${item.unit} (new batch)`, 'success')
        setReplenishItemId(null)
        return
      }

      if (item._source === 'equipment' || item._source === 'supply') {
        // Both `quantity` and `expiration_date` are now confirmed NOT to
        // be real columns on either `equipment` or `supplies` — direct
        // Postgres errors for both fields, on both tables, not a guess.
        // That means stock for these two categories is almost certainly
        // computed from equipment_batches/supply_batches (the same
        // pattern medicines' quantity already uses via medicine_batches),
        // not stored on the item's own row — so replenishing correctly
        // needs to write to those batch tables instead, which this
        // handler was never built to do. Failing loudly and clearly here
        // is safer than silently sending a doomed PATCH and surfacing
        // whatever confusing "column not found" error Postgres happens
        // to report first.
        show(`Restocking ${item._source === 'equipment' ? 'Equipment' : 'Supply'} items isn't supported yet — this needs to go through the Batches tab instead.`, 'error')
        return
      }

      await mergeQuantityIntoItem(
        item,
        {
          expiration_date: mergeDisplayExpirationDate(item.expiration_date, form.expiry),
          batch_no: form.batchNo || item.batch_no,
          received_date: form.received || item.received_date,
          supplier: supplierRow?.supplier_name || item.supplier,
        },
        { quantity: form.qty, notes: form.notes }
      )
      await Promise.all([refreshInventory(), refreshLogs()])
      show(`${item.name} replenished by ${form.qty} ${item.unit}`, 'success')
    } catch (err) {
      show(`Failed to replenish: ${err.message}`, 'error')
    }
    setReplenishItemId(null)
  }

  // ── RELEASE (single item / release picker share this) ──
  const releasingItem = inventory.find((i) => itemKey(i) === releaseItemId) || null
  async function doRelease(key, form) {
    const item = inventory.find((i) => itemKey(i) === key)
    if (!item) return
    try {
      if (item._source === 'medicine') {
        if (!isOnline) {
          // Queued instead of run — see inventoryOfflineActions.js's own
          // risk note: FIFO batch selection happens at REPLAY time, not
          // now, so the batch(es) this actually deducts from once synced
          // may differ from whatever would have been picked if this ran
          // immediately. Accepted risk, per explicit confirmation.
          enqueueOfflineAction(
            'inventory_release_medicine',
            { medicineId: item._id, qty: form.qty, staffId: currentUserId, notes: form.notes },
            { summary: `Release ${form.qty} ${item.unit} of ${item.name}` }
          )
          show(`You're offline — releasing ${form.qty} ${item.unit} of ${item.name} will sync automatically once you're back online.`, 'warning')
          return
        }
        const touched = await releaseMedicineStockFIFO(item._id, form.qty, currentUserId, form.notes)
        await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
        const remaining = item.quantity - form.qty
        const batchSummary = touched.map((t) => `${t.batchNumber} (-${t.deducted})`).join(', ')
        // Low/Critical/Out-of-Stock alerting now happens automatically
        // inside releaseMedicineStockFIFO's addMedicineMovement call
        // (Notification System Phase 3) — no separate notify() needed
        // here anymore, avoiding a duplicate/stale-threshold alert
        // alongside the centralized one.
        show(`${item.name}: ${form.qty} ${item.unit} released from ${batchSummary}${remaining <= item.min_stock ? ' — now low stock' : ''}`, remaining <= item.min_stock ? 'warning' : 'success')
        return
      }

      if (!isOnline) {
        // Equipment/Supply path — safe to queue verbatim (see
        // inventoryOfflineActions.js's own note: a fixed inventory_id
        // target, not a batch chosen at write time, so there's no
        // mismatch risk here at all).
        const newQuantity = item.quantity - form.qty
        enqueueOfflineAction(
          'inventory_release_simple',
          {
            inventoryId: item.inventory_id,
            quantityChange: -form.qty,
            previousQuantity: item.quantity,
            newQuantity,
            staffId: currentUserId,
            notes: form.notes || 'Manual release',
          },
          { summary: `Release ${form.qty} ${item.unit} of ${item.name}` }
        )
        show(`You're offline — releasing ${form.qty} ${item.unit} of ${item.name} will sync automatically once you're back online.`, 'warning')
        return
      }

      await updateInventoryItem(item.inventory_id, { quantity: item.quantity - form.qty })
      await addInventoryLog({ inventoryId: item.inventory_id, actionType: 'Release', quantityChange: -form.qty, previousQuantity: item.quantity, newQuantity: item.quantity - form.qty, staffId: currentUserId, notes: form.notes || 'Manual release' })
      await Promise.all([refreshInventory(), refreshLogs()])
      const remaining = item.quantity - form.qty
      const wasAlreadyLow = item.quantity <= item.min_stock
      if (remaining <= item.min_stock && !wasAlreadyLow) {
        try {
          await notify({ targetRole: 'staff', message: `${item.name} is now low stock (${remaining} ${item.unit} remaining).`, type: 'warning', module: '/inventory' })
        } catch {
          // Non-critical — the release itself already succeeded.
        }
        show(`${item.name}: ${form.qty} ${item.unit} released — now low stock`, 'warning')
      } else if (remaining <= item.min_stock) {
        show(`${item.name}: ${form.qty} ${item.unit} released — still low stock`, 'warning')
      } else {
        show(`${item.name}: ${form.qty} ${item.unit} released`, 'success')
      }
    } catch (err) {
      show(`Failed to release stock: ${err.message}`, 'error')
    }
  }
  function handleReleaseSubmit(form) {
    doRelease(releaseItemId, form)
    setReleaseItemId(null)
  }
  function handleReleasePickerSubmit(itemId, form) {
    doRelease(itemId, form)
    setReleasePickerOpen(false)
  }

  // ── REMOVE ──
  async function handleRemove(key) {
    const item = inventory.find((i) => itemKey(i) === key)
    if (!item) return

    try {
      if (item._source === 'medicine') {
        if (getInventoryStatus(item) === 'Expired') {
          const raw = window.prompt(`Expired stock: ${item.quantity} ${item.unit}\nHow many do you want to remove?`, String(item.quantity))
          if (raw === null) return
          const removeQty = parseInt(raw, 10)
          if (!Number.isFinite(removeQty) || removeQty <= 0) return show('Enter a valid quantity to remove', 'error')
          if (removeQty > item.quantity) return show(`Cannot remove more than available expired stock (${item.quantity} ${item.unit})`, 'error')
          if (!(await confirm(`Remove ${removeQty} ${item.unit} of expired "${item.name}"? This cannot be undone.`))) return

          // Distribute the removal across this medicine's expired batches,
          // oldest-expiration first — mirrors the FIFO release logic, but
          // scoped to only the batches that are actually expired.
          const expiredBatches = batches
            .filter((b) => b._source === 'medicine' && b.medicine_id === item._id && b.status !== 'Depleted' && isPastISODate(b.expiration_date))
            .sort((a, b) => (a.expiration_date || '').localeCompare(b.expiration_date || ''))
          let remaining = removeQty
          for (const batch of expiredBatches) {
            if (remaining <= 0) break
            const deduct = Math.min(batch.quantity, remaining)
            await removeExpiredBatchQuantity(batch.medicine_batch_id, deduct, currentUserId, 'Expired stock removed')
            remaining -= deduct
          }
          show(`${removeQty} ${item.unit} removed from ${item.name}`, 'success')
        } else {
          if (!(await confirm(`Remove "${item.name}" from inventory?\nThis will deactivate the medicine — its batch and movement history is preserved, not deleted.`))) return
          await deactivateMedicine(item._id)
          await addMedicineMovement({ medicineId: item._id, actionType: 'Removed', quantityChange: -item.quantity, previousQuantity: item.quantity, newQuantity: item.quantity, staffId: currentUserId, notes: `Medicine deactivated (${item.quantity} ${item.unit} on hand)` })
          show(`${item.name} removed`, 'success')
        }
        await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
        return
      }

      if (item._source === 'equipment' || item._source === 'supply') {
        // Equipment/Supply live in their own normalized tables now —
        // item.inventory_id is always null for these, so the legacy
        // deleteInventoryItem()/addInventoryLog() path below (which
        // targets the old `inventory` table) both fails outright: the
        // log insert violates inventory_logs_has_subject (no valid
        // subject column set), and even if it didn't, deleting by a
        // null id wouldn't actually remove anything from the equipment/
        // supplies tables the item really lives in. Deactivating here
        // instead mirrors exactly how Medicine removal already works
        // above (deactivate, don't hard-delete — batch/movement history
        // stays intact).
        const deactivateFn = item._source === 'equipment' ? deactivateEquipment : deactivateSupply
        await deactivateFn(item._id)
        try {
          // equipmentId/supplyId (migration 028) — not inventoryId, which
          // is always null for these items and is exactly why this insert
          // used to fail every time.
          await addInventoryLog({ [item._source === 'equipment' ? 'equipmentId' : 'supplyId']: item._id, actionType: 'Removed', quantityChange: -item.quantity, previousQuantity: item.quantity, newQuantity: 0, staffId: currentUserId, notes: `"${item.name}" removed from inventory (${item.quantity} ${item.unit})` })
        } catch {
          // Non-critical — see comment above.
        }
        show(`${item.name} removed`, 'success')
        await Promise.all([refreshInventory(), refreshLogs()])
        return
      }

      if (getInventoryStatus(item) === 'Expired') {
        const raw = window.prompt(`Expired stock: ${item.quantity} ${item.unit}\nHow many do you want to remove?`, String(item.quantity))
        if (raw === null) return
        const removeQty = parseInt(raw, 10)
        if (!Number.isFinite(removeQty) || removeQty <= 0) return show('Enter a valid quantity to remove', 'error')
        if (removeQty > item.quantity) return show(`Cannot remove more than available expired stock (${item.quantity} ${item.unit})`, 'error')
        if (!(await confirm(`Remove ${removeQty} ${item.unit} of expired "${item.name}"? This cannot be undone.`))) return

        if (removeQty >= item.quantity) {
          // Log BEFORE deleting — inventory_logs.inventory_id has a strict
          // FK to inventory; inserting a log row after the parent item is
          // already deleted would violate that constraint and throw, which
          // would both mask the successful delete behind a false "failed"
          // error AND mean the movement never gets recorded at all.
          await addInventoryLog({ inventoryId: item.inventory_id, actionType: 'Remove Expired', quantityChange: -removeQty, previousQuantity: item.quantity, newQuantity: 0, staffId: currentUserId, notes: `All expired stock of "${item.name}" removed` })
          await deleteInventoryItem(item.inventory_id)
          show(`${item.name} removed from inventory`, 'success')
        } else {
          await updateInventoryItem(item.inventory_id, { quantity: item.quantity - removeQty })
          await addInventoryLog({ inventoryId: item.inventory_id, actionType: 'Remove Expired', quantityChange: -removeQty, previousQuantity: item.quantity, newQuantity: item.quantity - removeQty, staffId: currentUserId, notes: 'Expired stock removed' })
          show(`${removeQty} ${item.unit} removed from ${item.name}`, 'success')
        }
      } else {
        if (!(await confirm(`Remove "${item.name}" from inventory?\nQuantity to remove: ${item.quantity} ${item.unit}\nThis cannot be undone.`))) return
        await addInventoryLog({ inventoryId: item.inventory_id, actionType: 'Removed', quantityChange: -item.quantity, previousQuantity: item.quantity, newQuantity: 0, staffId: currentUserId, notes: `"${item.name}" removed from inventory (${item.quantity} ${item.unit})` })
        await deleteInventoryItem(item.inventory_id)
        show(`${item.name} removed`, 'success')
      }
            await Promise.all([refreshInventory(), refreshLogs()])
    } catch (err) {
      // Same reasoning as handleEditSave's catch above — while offline,
      // err.message is just the browser's raw fetch failure text, which
      // doesn't tell the person removing an item WHY it didn't work.
      show(isOnline ? `Failed to remove item: ${err.message}` : 'You appear to be offline. Check your connection and try again.', 'error')
    }
  }

  // ── MAINTENANCE RESTORE ──
  // Equipment-only — Medicine is never Equipment, so this handler only
  // ever sees Equipment items (a medicine row's needs_maintenance is
  // always false, see medicine_inventory_view, so it never surfaces a
  // Restore action in the first place). Equipment now lives in its own
  // normalized `equipment` table (see equipmentService.js) rather than
  // the legacy `inventory` table this used to target, so this writes to
  // updateEquipment(), keyed by item._id (the real equipment_id) —
  // item.inventory_id is always null for these items and would produce
  // an invalid PATCH (…inventory_id=eq.null → 400) if used here.
  // Single row only: restoring sets `quantity` to the number of units
  // actually returned to active stock. Any held-back units are no longer
  // tracked as inventory — they're recorded in the log's notes/quantity
  // delta for audit purposes, rather than living on as a second row.
  const restoringItem = inventory.find((i) => itemKey(i) === restoreItemId) || null
  async function handleRestoreSubmit() {
    // Both `quantity` and `expiration_date` are confirmed NOT to be real
    // columns on `equipment` (direct Postgres errors, not a guess) — the
    // same underlying issue as handleReplenish's Equipment/Supply branch
    // above. This handler's whole premise (set quantity to the number of
    // units actually returned to active stock) can't work as a direct
    // column write when quantity isn't stored on the row at all — it's
    // almost certainly computed from equipment_batches, so a real fix
    // needs to write there instead. Failing clearly here rather than
    // attempting the doomed PATCH.
    show('Restoring Equipment from maintenance isn\'t supported yet — this needs to go through the Batches tab instead.', 'error')
    setRestoreItemId(null)
  }

  // ── SCAN ──
  async function handleProcessRaw(raw) {
    // Our own batch QR codes carry a `type: 'batch'` marker (see
    // BatchQRModal.buildBatchQRPayload) — a generic external/supplier QR
    // never has this field, so checking it first is a safe, additive
    // discriminator that doesn't disturb the existing generic flow at
    // all for anything that isn't one of our own codes.
    let batchPayload = null
    let pendingItemPayload = null
    try {
      const obj = JSON.parse(raw.trim())
      if (obj && obj.type === 'batch' && obj.medicine_batch_id) batchPayload = obj
      // "Pending item" QR codes come from the standalone QR generator
      // tool — printed for an item that doesn't exist in inventory yet,
      // so there's no medicine_batch_id to look up at all. Instead of
      // failing, this opens Add Item pre-filled with whatever the QR
      // itself carried (name/category/unit/notes), the same graceful
      // "use the QR's own embedded data" fallback RegisterQrScan.jsx
      // already uses for unseeded registration codes.
      else if (obj && obj.type === 'pending_item' && obj.item_name) pendingItemPayload = obj
    } catch {
      // Not JSON, or not our format — falls through to the generic flow below.
    }

    if (pendingItemPayload) {
      setPendingItemPrefill({
        name: pendingItemPayload.item_name,
        category: pendingItemPayload.category || 'Medicine',
        unit: pendingItemPayload.unit || '',
      })
      setAddItemModalKey((k) => k + 1)
      setAddItemOpen(true)
      show('Scanned a pending item — review and save to add it to inventory.', 'info')
      return
    }

    if (batchPayload) {
      try {
        const batch = await getMedicineBatchById(batchPayload.medicine_batch_id)
        if (!batch) {
          show('This batch no longer exists — it may have been removed.', 'error')
          await addScanHistory({ scannedBy: currentUserId, itemName: batchPayload.medicine || 'Unknown', category: 'Medicine', quantity: 0, result: 'Invalid', rawData: raw, medicineBatchId: batchPayload.medicine_batch_id })
          setScanHistory(await listScanHistory())
          return
        }
        // Phase 7: previously just opened a read-only view (setScannedBatch)
        // and logged a 'BatchView' scan-history entry immediately — the
        // batch could be looked at but never actually restocked from a
        // scan. Now opens the same confirm-before-save step every other
        // scan type already used (ReplenishBatchModal, pre-filled with
        // this exact batch's identity) — nothing is written to the
        // database, and no scan-history entry is created, until the user
        // confirms. Canceling === scanning nothing happened at all.
        setScanReplenishBatch({ ...batch, _scanRawData: raw })
      } catch (err) {
        show(`Failed to open batch details: ${err.message}`, 'error')
      }
      return
    }

    // Existing generic flow — unchanged, still handles externally
    // printed / supplier QR codes exactly as before.
    const parsed = parseQRPayload(raw)
    if (!parsed || !parsed.name) {
      show('Invalid QR data — could not extract item information', 'error')
      addScanHistory({ scannedBy: currentUserId, itemName: 'Unknown', category: '—', quantity: 0, result: 'Invalid', rawData: raw })
        .then(() => listScanHistory())
        .then(setScanHistory)
        .catch((err) => show(`Failed to log scan: ${err.message}`, 'error'))
      return
    }
    const match = findInventoryItemMatch(inventory, { name: parsed.name, category: parsed.category, unit: parsed.unit, supplier: parsed.supplier || null })
    setScanVerify({ rawData: raw, matchedItem: match })
  }

  async function handleScanSave(form) {
    try {
      const supplierRow = form.supplierId ? suppliers.find((s) => String(s.supplier_id) === form.supplierId) : null
      const match = findInventoryItemMatch(inventory, { name: form.name, category: form.category, unit: form.unit, supplier: supplierRow?.supplier_name || null })

      if (form.category === 'Medicine') {
        if (match && match._source === 'medicine') {
          await replenishMedicineAsNewBatch({
            medicineId: match._id,
            quantity: form.qty,
            expirationDate: form.expiry || null,
            receivedDate: form.receivedDate || null,
            supplierId: form.supplierId || null,
            batchNumber: form.batch || null,
            staffId: currentUserId,
            notes: `QR scan stock-in · Received: ${form.receivedDate}`,
          })
          show(`${form.name} restocked by ${form.qty} ${form.unit} (new batch)`, 'success')
        } else {
          const medicine = await createMedicine({ medicine_name: form.name, unit: form.unit, min_stock: form.minStock, active: true })
            await replenishMedicineAsNewBatch({
              medicineId: medicine.medicine_id,
              quantity: form.qty,
              expirationDate: form.expiry || null,
              receivedDate: form.receivedDate || null,
              supplierId: form.supplierId || null,
              batchNumber: form.batch || null,
              staffId: currentUserId,
              notes: `Initial stock via QR scan`,
            })
          }
          show(`${form.name} added to inventory`, 'success')

      } else if (match) {
        await mergeQuantityIntoItem(
          match,
          {
            min_stock: form.minStock,
            expiration_date: mergeDisplayExpirationDate(match.expiration_date, form.expiry),
            batch_no: form.batch || match.batch_no,
            received_date: form.receivedDate || match.received_date,
            supplier: supplierRow?.supplier_name || match.supplier,
          },
          { quantity: form.qty, notes: `QR scan stock-in · Batch: ${form.batch || '—'} · Received: ${form.receivedDate}` }
        )
        show(`${form.name} restocked by ${form.qty} ${form.unit}`, 'success')
      } else {
        const created = await createInventoryItem({
          name: form.name, category: form.category, quantity: form.qty, unit: form.unit, min_stock: form.minStock,
          expiration_date: form.expiry || null, batch_no: form.batch || null, received_date: form.receivedDate || null,
          supplier: supplierRow?.supplier_name || null, is_fifo: false, needs_maintenance: false,
        })
        if (form.qty > 0) {
          await addInventoryLog({ inventoryId: created.inventory_id, actionType: 'Replenish', quantityChange: form.qty, previousQuantity: 0, newQuantity: form.qty, staffId: currentUserId, notes: `Initial stock via QR scan · Batch: ${form.batch || '—'}` })
        }
        show(`${form.name} added to inventory`, 'success')
      }
      await addScanHistory({ scannedBy: currentUserId, itemName: form.name, category: form.category, quantity: form.qty, result: 'Saved', rawData: scanVerify?.rawData || '' })
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      setScanHistory(await listScanHistory())
      setScanVerify(null)
      setTab('items')
    } catch (err) {
      show(`Failed to save scanned item: ${err.message}`, 'error')
    }
  }

  // ── BATCHES (Phase F — previously unreachable in the original nav, now a real feature; Phase 3 — Medicine batches route through the new normalized tables) ──
  async function handleAddBatch(form) {
    try {
      let target = form.itemId ? inventory.find((i) => itemKey(i) === form.itemId) : null
      const isNewMedicine = form.newItem && form.newItem.category === 'Medicine'
      const supplierRow = form.supplierId ? suppliers.find((s) => String(s.supplier_id) === form.supplierId) : null

      if (!target && form.newItem && !isNewMedicine) {
        target = await createInventoryItem({
          name: form.newItem.name,
          category: form.newItem.category,
          quantity: 0,
          unit: form.newItem.unit,
          min_stock: form.newItem.minStock,
          expiration_date: form.expiry,
          batch_no: form.batchCode,
          received_date: form.received,
          supplier: supplierRow?.supplier_name || null,
          is_fifo: false,
          needs_maintenance: false,
        })
      }
      if (!target && !isNewMedicine && !form.newItem) return show('Select an item or provide new-item details', 'error')

      if ((target && target._source === 'medicine') || isNewMedicine) {
        let medicineId = target?._id
        let medicineName = target?.name
        let medicineUnit = target?.unit
        if (!medicineId) {
          const medicine = await createMedicine({ medicine_name: form.newItem.name, unit: form.newItem.unit, min_stock: form.newItem.minStock, active: true })
          medicineId = medicine.medicine_id
          medicineName = medicine.medicine_name
          medicineUnit = medicine.unit
        }

        const duplicate = batches.find((b) => b._source === 'medicine' && b.medicine_id === medicineId && b.batch_code === form.batchCode)
        if (duplicate) return show(`Batch "${form.batchCode}" already exists for this medicine. Use Replenish on that batch instead.`, 'error')

        // Phase 4b: Add Batch now creates a real receiving_records entry
        // too (previously only the now-removed dedicated Receiving tab
        // did this) — an immutable "what was received" audit document,
        // distinct from the batch's own mutable quantity, exactly the
        // distinction the original Receiving feature existed for. This
        // also fixes a real, separate bug: the old Receiving flow never
        // captured an expiration date at all (createReceivingRecord
        // didn't accept one) — every batch created that way had no
        // expiration tracking. Fixed at the source; this call now
        // correctly passes one through.
        await createReceivingRecord({
          medicineId,
          batchNumber: form.batchCode,
          expirationDate: form.expiry || null,
          supplierId: supplierRow?.supplier_id || null,
          invoiceNumber: form.invoiceNumber || null,
          quantity: form.qty,
          receivedDate: form.received || new Date().toISOString().slice(0, 10),
          receivedBy: currentUserId,
          remarks: form.notes || null,
        })

        await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
        setAddBatchOpen(false)
        show(`Batch ${form.batchCode} added — ${medicineName} +${form.qty} ${medicineUnit}`, 'success')
        return
      }

      const duplicate = batches.find(
        (b) => b._source !== 'medicine' && b.inventory_id === target.inventory_id && b.batch_code === form.batchCode && (b.expiration_date || '') === (form.expiry || '') && (b.received_date || '') === (form.received || '')
      )
      if (duplicate) return show(`Batch "${form.batchCode}" with the same expiry and received date already exists. Use Replenish on that batch instead.`, 'error')

      await createInventoryBatch({ inventoryId: target.inventory_id, batchCode: form.batchCode, quantity: form.qty, expirationDate: form.expiry, receivedDate: form.received, supplier: supplierRow?.supplier_name || null, notes: form.notes })
      await mergeQuantityIntoItem(
        target,
        {
          batch_no: form.batchCode,
          expiration_date: mergeDisplayExpirationDate(target.expiration_date, form.expiry),
          received_date: form.received,
          supplier: supplierRow?.supplier_name || target.supplier,
        },
        { quantity: form.qty, notes: `New batch added: ${form.batchCode}${form.notes ? ' — ' + form.notes : ''}` }
      )

      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      setAddBatchOpen(false)
      show(`Batch ${form.batchCode} added — ${target.name} +${form.qty} ${target.unit}`, 'success')
    } catch (err) {
      show(`Failed to add batch: ${err.message}`, 'error')
    }
  }

  // ── EDIT BATCH ── Always updates exactly the one batch that was opened —
  // never searches for a "matching" batch to merge into (batches only
  // ever combine via an explicit Replenish on a specific existing batch).
  const editingBatch = batches.find((b) => batchKey(b) === editBatchId) || null
  async function handleEditBatchSave(form) {
    const batch = editingBatch
    try {
      await updateMedicineBatch(batch.medicine_batch_id, {
        batch_number: form.batchNumber,
        lot_number: form.lotNumber,
        supplier_id: form.supplierId || null,
        received_date: form.received,
        expiration_date: form.expiry,
        quantity: form.quantity,
        unit_cost: form.unitCost,
        purchase_reference: form.purchaseReference,
      })
      const qtyChange = form.quantity - batch.quantity
      // Always log — even when quantity is unchanged, other fields (lot
      // number, supplier, dates) may still have been corrected, and every
      // transaction must be recorded, not just quantity-changing ones.
      await addMedicineMovement({
        medicineId: batch.medicine_id,
        medicineBatchId: batch.medicine_batch_id,
        actionType: 'Adjustment',
        quantityChange: qtyChange,
        previousQuantity: batch.quantity,
        newQuantity: form.quantity,
        staffId: currentUserId,
        notes: qtyChange !== 0 ? `Batch details corrected (${batch.batch_code} → ${form.batchNumber}), quantity ${batch.quantity} → ${form.quantity}` : `Batch details corrected (${batch.batch_code} → ${form.batchNumber})`,
      })
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      show(`Batch ${form.batchNumber} updated`, 'success')
    } catch (err) {
      show(`Failed to update batch: ${err.message}`, 'error')
    }
    setEditBatchId(null)
  }

  // ── ARCHIVE / UNARCHIVE BATCH ── Soft-removal — takes the batch out of
  // active stock (medicine_inventory_view only sums Active batches) while
  // preserving its full history, same reasoning as deactivating a medicine.
  async function handleArchiveBatch(key) {
    const batch = batches.find((b) => batchKey(b) === key)
    if (!batch) return
    if (!(await confirm(`Archive batch "${batch.batch_code}"?\nIt will be removed from active stock but its history is kept — this is not a delete.`, { danger: false, confirmLabel: 'Archive' }))) return
    try {
      await archiveMedicineBatch(batch.medicine_batch_id)
      await addMedicineMovement({ medicineId: batch.medicine_id, medicineBatchId: batch.medicine_batch_id, actionType: 'Archived', quantityChange: 0, previousQuantity: batch.quantity, newQuantity: batch.quantity, staffId: currentUserId, notes: `Batch ${batch.batch_code} archived` })
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      show(`Batch ${batch.batch_code} archived`, 'success')
    } catch (err) {
      show(`Failed to archive batch: ${err.message}`, 'error')
    }
  }

  async function handleUnarchiveBatch(key) {
    const batch = batches.find((b) => batchKey(b) === key)
    if (!batch) return
    try {
      await restoreArchivedBatch(batch.medicine_batch_id, batch.quantity > 0 ? 'Active' : 'Depleted')
      await addMedicineMovement({ medicineId: batch.medicine_id, medicineBatchId: batch.medicine_batch_id, actionType: 'Adjustment', quantityChange: 0, previousQuantity: batch.quantity, newQuantity: batch.quantity, staffId: currentUserId, notes: `Batch ${batch.batch_code} restored from archive` })
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      show(`Batch ${batch.batch_code} restored`, 'success')
    } catch (err) {
      show(`Failed to restore batch: ${err.message}`, 'error')
    }
  }

  // ── REPORT DAMAGED ── A genuinely distinct movement type from Expired —
  // damage can happen to any batch regardless of its expiry status.
  async function handleReportDamaged(key) {
    const batch = batches.find((b) => batchKey(b) === key)
    if (!batch || batch._source !== 'medicine') return
    const raw = window.prompt(`On hand: ${batch.quantity} ${batch.item_unit}\nHow many were damaged?`, '1')
    if (raw === null) return
    const damagedQty = parseInt(raw, 10)
    if (!Number.isFinite(damagedQty) || damagedQty <= 0) return show('Enter a valid quantity', 'error')
    if (damagedQty > batch.quantity) return show(`Cannot report more than what's on hand (${batch.quantity} ${batch.item_unit})`, 'error')
    const notes = window.prompt('Remarks (optional) — e.g. cause of damage', '') || ''
    try {
      await reportDamagedBatch(batch.medicine_batch_id, damagedQty, currentUserId, notes || undefined)
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      show(`${damagedQty} ${batch.item_unit} of ${batch.item_name} reported damaged from batch ${batch.batch_code}`, 'warning')
    } catch (err) {
      show(`Failed to report damaged stock: ${err.message}`, 'error')
    }
  }

  // ── SUPPLIERS ──
  async function handleSaveSupplier(fields) {
    try {
      if (supplierModal?.mode === 'edit') {
        await updateSupplier(supplierModal.supplier.supplier_id, fields)
        show(`${fields.supplier_name} updated`, 'success')
      } else {
        await createSupplier(fields)
        show(`${fields.supplier_name} added`, 'success')
      }
      await refreshSuppliers()
      setSupplierModal(null)
    } catch (err) {
      show(`Failed to save supplier: ${err.message}`, 'error')
    }
  }

  async function handleDeleteSupplier(supplier) {
    if (!(await confirm(`Delete supplier "${supplier.supplier_name}"?`))) return
    try {
      await deleteSupplier(supplier.supplier_id)
      await refreshSuppliers()
      show(`${supplier.supplier_name} deleted`, 'success')
    } catch (err) {
      show(err.message, 'error')
    }
  }

  // ── RECEIVING RECORDS ── Every save automatically keeps its own linked
  // batch in sync — creating always makes exactly one new batch; editing
  // always adjusts that same batch by the quantity delta. Never creates a
  // second batch or a second record for the same event.

  // "Clicking an alert row should open that item's detail." The Alerts
  // tab no longer has its own per-row action buttons (Restock/Remove/
  // Restore/etc.) — this single handler replaces all of them, navigating
  // to the Items tab filtered by name.
  function handleAlertItemClick(item) {
    setTab('items')
    setItemsFilters((f) => ({ ...f, search: item.name, status: 'All' }))
  }

  const replenishingBatch = batches.find((b) => batchKey(b) === replenishBatchId) || null
  async function handleReplenishBatch(form) {
    const batch = replenishingBatch
    const supplierRow = form.supplierId ? suppliers.find((s) => String(s.supplier_id) === form.supplierId) : null
    try {
      if (batch._source === 'medicine') {
        await mergeQuantityIntoMedicineBatch(batch, form, `Batch replenish: ${batch.batch_code}${form.notes ? ' — ' + form.notes : ''}`)
        await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
        show(`Batch ${batch.batch_code} replenished — ${batch.item_name} +${form.qty} ${batch.item_unit}`, 'success')
        setReplenishBatchId(null)
        return
      }

      const item = inventory.find((i) => i.inventory_id === batch.inventory_id)
      await updateInventoryBatch(batch.batch_id, {
        quantity: batch.quantity + form.qty,
        expiration_date: form.expiry || batch.expiration_date,
        received_date: form.received || batch.received_date,
        supplier: supplierRow?.supplier_name || batch.supplier,
      })
      if (item) {
        await updateInventoryItem(item.inventory_id, {
          quantity: item.quantity + form.qty,
          batch_no: batch.batch_code,
          expiration_date: mergeDisplayExpirationDate(item.expiration_date, form.expiry),
          received_date: form.received || item.received_date,
          supplier: supplierRow?.supplier_name || item.supplier,
        })
      }
      await addInventoryLog({ inventoryId: batch.inventory_id, actionType: 'Replenish', quantityChange: form.qty, previousQuantity: batch.quantity, newQuantity: batch.quantity + form.qty, staffId: currentUserId, notes: `Batch replenish: ${batch.batch_code}${form.notes ? ' — ' + form.notes : ''}` })
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      show(`Batch ${batch.batch_code} replenished — ${batch.item_name} +${form.qty} ${batch.item_unit}`, 'success')
    } catch (err) {
      show(`Failed to replenish batch: ${err.message}`, 'error')
    }
    setReplenishBatchId(null)
  }

  // Phase 7 (QR Scanner) — the confirm-and-save step for scanning the
  // clinic's own printed batch QR. Deliberately mirrors
  // handleReplenishBatch's medicine branch above (same
  // updateMedicineBatch + addMedicineMovement pair, same 'Received'
  // action type) rather than replenishMedicineAsNewBatch — a batch QR
  // identifies one specific, already-existing batch, so confirming
  // should add to THAT batch's quantity, not create a duplicate new one
  // with the same batch number. Scan-history logging happens here, only
  // after a successful save — not at scan-detection time — matching
  // exactly when the generic (non-batch) scan flow logs its own 'Saved'
  // entry in handleScanSave above. Canceling the modal never calls this
  // function at all, so nothing is written to the database.
  async function handleScanBatchReplenish(form) {
    const batch = scanReplenishBatch
    if (!batch) return
    try {
      await mergeQuantityIntoMedicineBatch(batch, form, `Batch replenish via QR scan: ${batch.batch_code}${form.notes ? ' — ' + form.notes : ''}`)
      await addScanHistory({
        scannedBy: currentUserId,
        itemName: batch.item_name,
        category: 'Medicine',
        quantity: form.qty,
        result: 'Saved',
        rawData: batch._scanRawData || '',
        medicineId: batch.medicine_id,
        medicineBatchId: batch.medicine_batch_id,
      })
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
      setScanHistory(await listScanHistory())
      setScanReplenishBatch(null)
      setTab('items')
      show(`Batch ${batch.batch_code} replenished — ${batch.item_name} +${form.qty} ${batch.item_unit}`, 'success')
    } catch (err) {
      show(`Failed to add stock: ${err.message}`, 'error')
    }
  }

  async function doReleaseBatch(key, form) {
    const batch = batches.find((b) => batchKey(b) === key)
    if (!batch) return
    try {
      if (batch._source === 'medicine') {
        const newQty = Math.max(0, batch.quantity - form.qty)
        const goingToDepleted = newQty <= 0
        await updateMedicineBatch(batch.medicine_batch_id, { quantity: newQty, status: goingToDepleted ? 'Depleted' : batch.status })
        if (goingToDepleted) {
          // A fully-Depleted batch leaves run_expiration_check()'s
          // Active/Expired loop, so any expiring_* alert it already had
          // would otherwise stay open forever (found during the Phase 9
          // final review — same gap class fixed in medicineService.js's
          // archive/damage/expired-removal/FIFO-release paths).
          try {
            await clearInventoryNotifications(null, ['expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired'], batch.medicine_batch_id)
          } catch {
            // Non-critical.
          }
        }
        await addMedicineMovement({ medicineId: batch.medicine_id, medicineBatchId: batch.medicine_batch_id, actionType: 'Released', quantityChange: -form.qty, previousQuantity: batch.quantity, newQuantity: newQty, staffId: currentUserId, notes: `Batch release: ${batch.batch_code}${form.notes ? ' — ' + form.notes : ''}` })
        await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])
        // Low/Critical/Out-of-Stock alerting happens automatically
        // inside addMedicineMovement above (Notification System Phase 3).
        show(`${batch.item_name}: ${form.qty} ${batch.item_unit} released from batch ${batch.batch_code}`, 'success')
        return
      }

      const item = inventory.find((i) => i.inventory_id === batch.inventory_id)
      await updateInventoryBatch(batch.batch_id, { quantity: batch.quantity - form.qty })
      if (item) await updateInventoryItem(item.inventory_id, { quantity: Math.max(0, item.quantity - form.qty) })
      await addInventoryLog({ inventoryId: batch.inventory_id, actionType: 'Release', quantityChange: -form.qty, previousQuantity: batch.quantity, newQuantity: batch.quantity - form.qty, staffId: currentUserId, notes: `Batch release: ${batch.batch_code}${form.notes ? ' — ' + form.notes : ''}` })
      await Promise.all([refreshInventory(), refreshBatches(), refreshLogs()])

      const updatedItem = item ? { ...item, quantity: Math.max(0, item.quantity - form.qty) } : null
      const wasAlreadyLow = item ? getInventoryStatus(item) === 'Low Stock' : false
      if (updatedItem && getInventoryStatus(updatedItem) === 'Low Stock' && !wasAlreadyLow) {
        try {
          await notify({ targetRole: 'staff', message: `Low stock alert: ${updatedItem.name} is now at ${updatedItem.quantity} ${updatedItem.unit}`, type: 'warning', module: '/inventory' })
        } catch {
          // Non-critical.
        }
      }
      show(`${batch.item_name}: ${form.qty} ${batch.item_unit} released from batch ${batch.batch_code}`, 'success')
    } catch (err) {
      show(`Failed to release batch: ${err.message}`, 'error')
    }
  }
  function handleReleaseBatchSubmit(form) {
    doReleaseBatch(releaseBatchId, form)
    setReleaseBatchId(null)
  }
  function handleReleaseBatchPickerSubmit(batchId, form) {
    doReleaseBatch(batchId, form)
    setReleaseBatchPickerOpen(false)
  }

  const tabItems = TABS.map((t) => {
    if (t.key === 'items') return { ...t, label: `Items (${inventory.length})` }
    if (t.key === 'suppliers') return { ...t, label: `Suppliers (${suppliers.length})` }
    if (t.key === 'log') return { ...t, label: `Log (${logs.length})` }
    if (t.key === 'alerts') return { ...t, label: `Alerts${alertCount > 0 ? ` (${alertCount})` : ''}` }
    return t
  })

  if (loading) return <Spinner label="Loading inventory…" />

  return (
    <>
      {alertCount > 0 && (
        <div className="inv-alert-banner">
          {expired > 0 && (
            <span className="inv-alert-pill danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <AlertOctagonIcon width={13} height={13} /> {expired} Expired
            </span>
          )}
          {low > 0 && (
            <span className="inv-alert-pill warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <AlertTriangleIcon width={13} height={13} /> {low} Low Stock
            </span>
          )}
          {expiring > 0 && (
            <span className="inv-alert-pill info" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <BellIcon width={13} height={13} /> {expiring} Expiring in 30 days
            </span>
          )}
          <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 'auto' }} onClick={() => setTab('alerts')}>
            View All Alerts →
          </button>
        </div>
      )}

      <div className="tab-row inv-subnav-tabs" style={{ marginBottom: 16 }}>
        {tabItems.map((t) => (
          <button key={t.key} type="button" className={`tab-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <t.Icon width={14} height={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div>
          <InventoryDashboardTab
            inventory={inventory}
            onNavigateToStatus={(status) => {
              setTab('items')
              setItemsFilters((f) => ({ ...f, status }))
            }}
            onNavigateToBatches={() => {
              setTab('items')
              setItemsSubTab('batches')
            }}
          />
        </div>
      )}

      {tab === 'items' && (
        <div>
          <ItemsTab
            inventory={inventory}
            filters={itemsFilters}
            onFiltersChange={setItemsFilters}
            onAddItem={() => setAddItemOpen(true)}
            onReleasePicker={() => setReleasePickerOpen(true)}
            onEdit={setEditItemId}
            onRelease={setReleaseItemId}
            onRemove={handleRemove}
            onRestore={setRestoreItemId}
            onReplenish={setReplenishItemId}
            subTab={itemsSubTab}
            onSubTabChange={setItemsSubTab}
            batches={batches}
            batchSearch={batchSearch}
            onBatchSearchChange={setBatchSearch}
            onAddBatch={() => setAddBatchOpen(true)}
            onReleaseBatchPicker={() => setReleaseBatchPickerOpen(true)}
            onEditBatch={setEditBatchId}
            onReplenishBatch={setReplenishBatchId}
            onReleaseBatch={setReleaseBatchId}
            onArchiveBatch={handleArchiveBatch}
            onUnarchiveBatch={handleUnarchiveBatch}
            onReportDamaged={handleReportDamaged}
            onViewQR={setQrBatchKey}
          />
        </div>
      )}
      {tab === 'suppliers' && (
        <div>
          <SuppliersTab
            suppliers={suppliers}
            batches={batches}
            search={supplierSearch}
            onSearchChange={setSupplierSearch}
            onAdd={() => setSupplierModal({ mode: 'add' })}
            onEdit={(supplier) => setSupplierModal({ mode: 'edit', supplier })}
            onDelete={handleDeleteSupplier}
          />
        </div>
      )}
      {tab === 'scan' && (
  <div>
    <ScanTab
      scanHistory={scanHistory}
      onProcessRaw={handleProcessRaw}
      canDelete={canDeleteLogs}
      onDelete={handleDeleteScanHistory}
      scanPaused={!!scanVerify || !!scanReplenishBatch || (addItemOpen && !!pendingItemPrefill)}
    />
  </div>
)}
      {tab === 'log' && <div><LogTab logs={logs} staff={staff} search={logSearch} onSearchChange={setLogSearch} canDelete={canDeleteLogs} onDelete={handleDeleteInventoryLogs} /></div>}
      {tab === 'alerts' && (
        <div>
          <AlertsTab inventory={inventory} onItemClick={handleAlertItemClick} />
        </div>
      )}


      <AddItemModal
        key={addItemModalKey}
        isOpen={addItemOpen}
        onClose={() => {
          setAddItemOpen(false)
          setPendingItemPrefill(null)
        }}
        onSaveAll={handleSaveAllStaged}
        onError={(msg) => show(msg, 'error')}
        suppliers={suppliers}
        inventory={inventory}
        initialData={pendingItemPrefill}
      />

      <EditItemModal key={editItemId ?? 'edit-item-closed'} isOpen={editItemId !== null} item={editingItem} onClose={() => setEditItemId(null)} onSave={handleEditSave} suppliers={suppliers} onError={(msg) => show(msg, 'error')} />

      <ReplenishModal key={replenishItemId ?? 'replenish-item-closed'} isOpen={replenishItemId !== null} item={replenishingItem} onClose={() => setReplenishItemId(null)} onSubmit={handleReplenish} onError={(msg) => show(msg, 'error')} suppliers={suppliers} />

      <ReleaseModal key={releaseItemId ?? 'release-item-closed'} isOpen={releaseItemId !== null} item={releasingItem} onClose={() => setReleaseItemId(null)} onSubmit={handleReleaseSubmit} onError={(msg) => show(msg, 'error')} />

      <ReleasePickerModal isOpen={releasePickerOpen} inventory={inventory} onClose={() => setReleasePickerOpen(false)} onSubmit={handleReleasePickerSubmit} onError={(msg) => show(msg, 'error')} />

      <RestoreEquipmentModal key={restoreItemId ?? 'restore-item-closed'} isOpen={restoreItemId !== null} item={restoringItem} onClose={() => setRestoreItemId(null)} onSubmit={handleRestoreSubmit} onError={(msg) => show(msg, 'error')} />

      <ScanVerifyModal
        key={scanVerify?.rawData ?? 'scan-verify-closed'}
        isOpen={scanVerify !== null}
        rawData={scanVerify?.rawData}
        matchedItem={scanVerify?.matchedItem}
        onClose={() => setScanVerify(null)}
        onSave={handleScanSave}
        suppliers={suppliers}
      />

      <AddBatchModal isOpen={addBatchOpen} onClose={() => setAddBatchOpen(false)} onSubmit={handleAddBatch} onError={(msg) => show(msg, 'error')} inventory={inventory} suppliers={suppliers} />

      <EditBatchModal
        key={editBatchId ?? 'edit-batch-closed'}
        isOpen={editBatchId !== null}
        batch={editingBatch}
        onClose={() => setEditBatchId(null)}
        onSubmit={handleEditBatchSave}
        onError={(msg) => show(msg, 'error')}
        suppliers={suppliers}
      />

      <ReplenishBatchModal
        key={replenishBatchId ?? 'replenish-batch-closed'}
        isOpen={replenishBatchId !== null}
        batch={replenishingBatch}
        onClose={() => setReplenishBatchId(null)}
        onSubmit={handleReplenishBatch}
        onError={(msg) => show(msg, 'error')}
        suppliers={suppliers}
      />

      {/* Phase 7 (QR Scanner) — the confirm-before-save step for scanning
          the clinic's own printed batch QR. Same modal component reused
          (not a new one), but a separate instance/state from the one
          above so the Batches tab's own Replenish button and this scan
          flow can never interfere with each other. */}
      <ReplenishBatchModal
        key={scanReplenishBatch ? `scan-${scanReplenishBatch.medicine_batch_id}` : 'scan-closed'}
        isOpen={scanReplenishBatch !== null}
        batch={scanReplenishBatch}
        onClose={() => setScanReplenishBatch(null)}
        onSubmit={handleScanBatchReplenish}
        onError={(msg) => show(msg, 'error')}
        suppliers={suppliers}
      />

      <ReleaseBatchModal
        key={releaseBatchId ?? 'release-batch-closed'}
        isOpen={releaseBatchId !== null}
        batch={batches.find((b) => batchKey(b) === releaseBatchId) || null}
        onClose={() => setReleaseBatchId(null)}
        onSubmit={handleReleaseBatchSubmit}
        onError={(msg) => show(msg, 'error')}
      />

      <ReleaseBatchPickerModal
        isOpen={releaseBatchPickerOpen}
        batches={batches}
        onClose={() => setReleaseBatchPickerOpen(false)}
        onSubmit={handleReleaseBatchPickerSubmit}
        onError={(msg) => show(msg, 'error')}
      />

      <AddEditSupplierModal
        key={supplierModal ? supplierModal.mode + (supplierModal.supplier?.supplier_id ?? '') : 'supplier-closed'}
        isOpen={supplierModal !== null}
        supplier={supplierModal?.mode === 'edit' ? supplierModal.supplier : null}
        onClose={() => setSupplierModal(null)}
        onSubmit={handleSaveSupplier}
        onError={(msg) => show(msg, 'error')}
      />

      <BatchQRModal key={qrBatchKey ?? 'batch-qr-closed'} isOpen={qrBatchKey !== null} batch={batches.find((b) => batchKey(b) === qrBatchKey) || null} onClose={() => setQrBatchKey(null)} />

      <BatchDetailModal
        isOpen={scannedBatch !== null}
        batch={scannedBatch}
        onClose={() => setScannedBatch(null)}
        onEditBatch={(key) => {
          setScannedBatch(null)
          setEditBatchId(key)
        }}
        onReplenishBatch={(key) => {
          setScannedBatch(null)
          setReplenishBatchId(key)
        }}
        onReleaseBatch={(key) => {
          setScannedBatch(null)
          setReleaseBatchId(key)
        }}
        onArchiveBatch={(key) => {
          setScannedBatch(null)
          handleArchiveBatch(key)
        }}
      />
    </>
  )
}