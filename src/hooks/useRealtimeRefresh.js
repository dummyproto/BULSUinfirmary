import { useEffect, useRef } from 'react'
import { supabase } from '@services/supabaseClient'

// Migration 037 added every app table to Supabase's `supabase_realtime`
// publication (021 already did this for emergency_alerts specifically).
// This hook is the client-side half: subscribe to Postgres Changes on one
// or more tables and re-run the page's own existing fetch function
// whenever a row is inserted/updated/deleted — by ANYONE, not just the
// current user's own actions — so every page stays live without the
// person needing to hit refresh.
//
// Deliberately calls the page's own already-correct fetch function rather
// than trying to patch the changed row into local state directly: most
// pages' data is joined/derived (flattenUser(), the *_inventory_view
// views, computed low-stock flags, etc.), so "just merge this one row" 
// would either be wrong or would have to reimplement that same join logic
// a second time. A full refetch is simpler, harder to get subtly wrong,
// and — thanks to the debounce below — cheap enough that it doesn't
// matter it's "more than strictly necessary" per event.
//
//   useRealtimeRefresh('inventory', refreshInventory)
//   useRealtimeRefresh(['medicines', 'medicine_batches'], refreshInventory)
//
// `enabled` (default true) lets a caller skip subscribing entirely — e.g.
// a page that only shows realtime data for admins/staff, not patients.
export function useRealtimeRefresh(tables, onChange, enabled = true) {
  // Stashed in a ref so a caller passing a fresh inline function every
  // render doesn't tear down and resubscribe the channel on every
  // render — only the table list and `enabled` should ever do that.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const tableList = Array.isArray(tables) ? tables : [tables]
  // Table lists are static per call site in practice, but arrays are a
  // new reference every render — join to a stable string so the effect
  // below only re-runs when the actual set of tables changes, not on
  // every parent re-render.
  const tableKey = tableList.join(',')

  useEffect(() => {
    if (!enabled || tableList.length === 0) return undefined

    let debounceTimer = null
    function scheduleRefresh() {
      clearTimeout(debounceTimer)
      // 400ms: long enough to collapse a multi-row batch write (e.g.
      // InventoryPage's handleSaveAllStaged inserting several items in a
      // row) into a single refetch, short enough that it still reads as
      // instant to a person watching the screen.
      debounceTimer = setTimeout(() => {
        onChangeRef.current?.()
      }, 400)
    }

    // One channel per unique table-list per mount, subscribing to all
    // three event types on every listed table — callers that only care
    // about INSERTs (rare) can still just ignore the extra invocations,
    // since a debounced full refetch is idempotent either way.
    let channel = supabase.channel(`realtime-refresh-${tableKey}-${Math.random().toString(36).slice(2)}`)
    tableList.forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
    })

    let retryTimer = null
    let cancelled = false
    channel.subscribe((status) => {
      if (cancelled) return
      // Same reconnect-on-drop reasoning as EmergencyAlertListener.jsx —
      // a channel that silently stays dead after a connectivity blip
      // would mean this page quietly stops being "realtime" again with
      // no indication anything's wrong.
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(retryTimer)
        retryTimer = setTimeout(() => {
          if (!cancelled) onChangeRef.current?.()
        }, 5000)
      }
    })

    function handleOnline() {
      onChangeRef.current?.()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      clearTimeout(retryTimer)
      window.removeEventListener('online', handleOnline)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, enabled])
}