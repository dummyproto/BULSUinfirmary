// src/services/offlineQueueService.js
//
// Phase 1 of offline support for Inventory/Consultation actions (see
// useOnlineStatus.js/OfflineBanner.jsx for the existing, purely
// informational "you're offline" detection this builds on top of).
//
// A generic, reusable queue: any part of the app can enqueue a
// "replay this function call later" action while offline, and it gets
// automatically replayed the moment the browser reports connectivity is
// back (the same 'online' event OfflineBanner already listens for).
// Deliberately NOT tied to Inventory or Consultations specifically —
// those get wired on top of this in Phase 2/3; this file only knows
// about generic queued actions.
//
// Persisted to localStorage (not IndexedDB) — every action this queue
// needs to hold (inventory log entries, consultation records) is plain
// JSON with no File/Blob payloads, so localStorage is sufficient and
// needs no new dependency. Survives a full page reload/browser close
// while still offline, which a purely in-memory queue would not.

const STORAGE_KEY = 'offline_action_queue_v1'

// Every module that wants offline support registers its own replay
// function here (Phase 2/3) — e.g. runners.inventory_add_log = async
// (payload) => addInventoryLog(payload). The queue itself stores only
// { type, payload }, not a function reference (functions can't survive
// JSON.stringify/localStorage), and looks the actual function up from
// this registry at flush time.
const runners = {}

export function registerOfflineRunner(type, fn) {
  runners[type] = fn
}

function parseQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupted JSON (manual edit, a botched write) shouldn't crash every
    // page that touches the queue — treat it as empty rather than throw.
    return []
  }
}

// useOfflineQueue.js reads this via useSyncExternalStore(subscribe,
// listQueuedActions) — React requires getSnapshot to return the exact
// same reference across calls whenever nothing has actually changed, or
// it treats every render as "the store changed," re-renders, calls
// getSnapshot again, sees yet another new array, and loops forever
// (the "Maximum update depth exceeded" / "getSnapshot should be cached"
// crash). readQueue() below intentionally reads fresh from localStorage
// wherever the code needs the current ground truth to build the NEXT
// state from (enqueue/remove/flush all do this); this cache exists
// purely so repeated listQueuedActions() calls between actual writes
// return the identical array object, satisfying useSyncExternalStore's
// contract.
let snapshot = parseQueue()

function readQueue() {
  return parseQueue()
}

function writeQueue(items) {
  snapshot = items
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (err) {
    // Storage full/blocked — the in-memory enqueue still happened for
    // this session, it just won't survive a reload. Logged, not thrown:
    // the actual user-facing action (that triggered this enqueue) has
    // already been accepted as "queued" from their perspective.
    console.error('[OFFLINE_QUEUE] Failed to persist queue:', err.message)
  }
}

// Simple listener list so useOfflineQueue() (Phase 1, below) can
// re-render whenever the queue changes, without polling.
const listeners = new Set()
function notify() {
  listeners.forEach((fn) => fn(snapshot))
}

// Called by a form/page when a mutation is attempted while offline
// (see Phase 2/3's wrapping) instead of letting the real network call
// throw. `type` must match something registered via registerOfflineRunner
// — queuing a type with no matching runner would mean it can never
// actually flush, so this fails loudly rather than silently accepting
// an action that could never be replayed.
export function enqueueOfflineAction(type, payload, meta = {}) {
  if (!runners[type]) {
    throw new Error(`No offline runner registered for action type "${type}" — refusing to queue an action that could never be replayed.`)
  }
  const items = readQueue()
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    meta, // human-readable summary for the pending-items UI (Phase 4)
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  }
  items.push(entry)
  writeQueue(items)
  notify()
  return entry.id
}

export function listQueuedActions() {
  return snapshot
}

export function removeQueuedAction(id) {
  const items = readQueue().filter((i) => i.id !== id)
  writeQueue(items)
  notify()
}

// Attempts every queued action in order (oldest first — actions can be
// order-dependent, e.g. two stock adjustments on the same item). Stops
// retrying a given entry's TYPE after a failure and moves on to the
// next entry, rather than one broken entry blocking everything queued
// behind it forever.
let flushing = false
export async function flushOfflineQueue() {
  if (flushing) return // avoid two overlapping flushes (e.g. a manual
  // "Sync now" click racing the automatic on-reconnect flush)
  flushing = true
  try {
    let items = readQueue()
    for (const entry of items) {
      const runner = runners[entry.type]
      if (!runner) {
        // A runner that existed when this was queued but isn't
        // registered in THIS session (e.g. queued on a different page
        // that hasn't been visited yet this load) — leave it queued
        // rather than dropping it; it'll flush next time that page's
        // module has registered its runner.
        continue
      }
      try {
        await runner(entry.payload)
        items = items.filter((i) => i.id !== entry.id)
        writeQueue(items)
        notify()
      } catch (err) {
        entry.attempts += 1
        entry.lastError = err.message
        writeQueue(items)
        notify()
        // Stop this pass on the first real failure — if the connection
        // dropped again mid-flush, every remaining entry would fail the
        // same way; better to wait for the next 'online' event than
        // burn through every queued item logging the same error.
        if (!navigator.onLine) break
      }
    }
  } finally {
    flushing = false
  }
}

// Auto-flush the moment the browser reports connectivity is back —
// same 'online' event useOnlineStatus.js already listens to. Registered
// once, at module load, rather than per-component, so it fires even if
// no Inventory/Consultation page happens to be mounted at that exact
// moment (as long as the tab is open).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue()
  })
}

export function subscribeToQueueChanges(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}