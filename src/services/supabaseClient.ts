import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

const REMEMBER_ME_KEY = 'bulsu-remember-me'

export function setRememberMe(remember: boolean) {
  localStorage.setItem(REMEMBER_ME_KEY, remember ? '1' : '0')

  const staleBackend = remember ? sessionStorage : localStorage

  Object.keys(staleBackend)
    .filter((k) => k.startsWith('sb-'))
    .forEach((k) => staleBackend.removeItem(k))
}

function getActiveStorage() {
  return localStorage.getItem(REMEMBER_ME_KEY) === '0'
    ? sessionStorage
    : localStorage
}

export function getRememberMe() {
  return localStorage.getItem(REMEMBER_ME_KEY) !== '0'
}

const dynamicAuthStorage = {
  getItem: (key: string) => getActiveStorage().getItem(key),

  setItem: (key: string, value: string) =>
    getActiveStorage().setItem(key, value),

  removeItem: (key: string) =>
    getActiveStorage().removeItem(key),
}

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: dynamicAuthStorage,
    },
  }
)