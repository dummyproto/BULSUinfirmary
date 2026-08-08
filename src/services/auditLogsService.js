import { supabase } from './supabaseClient'

export async function listAuditLogs({ from, to } = {}) {
  let query = supabase
    .from('audit_logs')
    .select('*, user:users!audit_logs_user_id_fkey ( name )')
    .order('created_at', { ascending: false })
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)
  // Safety-net cap — from/to already narrow this down when a caller
  // passes them, but this is the system-wide audit trail, the one table
  // in this app most guaranteed to grow forever with normal use. A hard
  // limit here means a call made without a date range (or with an
  // unexpectedly wide one) can never balloon into fetching the entire
  // history at once.
  query = query.limit(500)
  const { data, error } = await query
  if (error) throw error
  return data.map((l) => ({ ...l, user_name: l.user?.name ?? null }))
}

// NOTE: `ip_address` genuinely can't be captured client-side in a browser
// (the legacy prototype hardcoded '127.0.0.1', which was never real either).
// Real IP capture needs a server-side hook (e.g. a Supabase Edge Function
// reading the request header) — left NULL here rather than faking it.
export async function addAuditLog({ userId, action, details }) {
  const { data, error } = await supabase.from('audit_logs').insert({ user_id: userId, action, details, ip_address: null }).select().single()
  if (error) throw error
  return data
}