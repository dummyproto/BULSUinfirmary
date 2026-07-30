import { supabase } from './supabaseClient'

const DEFAULTS = {
  smtp_host: 'smtp.example.edu',
  smtp_port: 587,
  smtp_user: 'clinic@example.edu',
  from_name: 'University Clinic',
  enable_notifications: true,
}

export async function getEmailConfig() {
  const { data, error } = await supabase.from('email_config').select('*').order('email_config_id').limit(1).maybeSingle()
  if (error) throw error
  return data || { email_config_id: null, ...DEFAULTS }
}

/**
 * Upserts the single settings row — inserts it if this is the first save
 * (e.g. a project that applied migration 001 rather than the consolidated
 * schema, which seeds one row automatically), otherwise updates it.
 */
export async function updateEmailConfig(patch) {
  const current = await getEmailConfig()
  if (current.email_config_id) {
    const { data, error } = await supabase
      .from('email_config')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('email_config_id', current.email_config_id)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from('email_config')
    .insert({ ...DEFAULTS, ...patch })
    .select()
    .single()
  if (error) throw error
  return data
}
