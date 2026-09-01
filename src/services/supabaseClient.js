import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev rather than letting every query silently 400 later.
  console.error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

const REMEMBER_ME_KEY = 'bulsu-remember-me'

// Called from LoginPage.jsx right before signIn(), so the session about
// to be created lands in the right backend from the start.
//
// Also proactively clears any stale Supabase session data left behind
// in the OTHER storage — without this, choosing "don't remember me" on
// a machine that previously had a "remembered" session left a fully
// valid token still sitting in localStorage, completely defeating the
// point of unchecking the box on a shared/public computer. Prefix
// match (not one hardcoded key) since Supabase can store more than one
// sb-*-prefixed entry depending on the auth flow in use.
export function setRememberMe(remember) {
  localStorage.setItem(REMEMBER_ME_KEY, remember ? '1' : '0')
  const staleBackend = remember ? sessionStorage : localStorage
  Object.keys(staleBackend)
    .filter((k) => k.startsWith('sb-'))
    .forEach((k) => staleBackend.removeItem(k))
}

function getActiveStorage() {
  // Default to localStorage (persists across browser restarts) unless
  // explicitly turned off — matches the pre-existing persistSession:true
  // behavior for anyone who's never touched the new checkbox, and how
  // most apps default to staying signed in.
  return localStorage.getItem(REMEMBER_ME_KEY) === '0' ? sessionStorage : localStorage
}

// Read-side counterpart to setRememberMe() above, for LoginPage's
// checkbox to initialize itself FROM on mount — the same '0' check
// getActiveStorage() itself uses, so the checkbox's default state and
// which storage a login actually lands in never disagree. Without this,
// the checkbox always started unchecked regardless of what was
// previously saved, so a session that WAS remembered (flag='1' in
// localStorage) still showed an unchecked box on the next visit to this
// page — and logging in again from there silently wrote the flag back
// to '0', downgrading a working "remembered" account back to
// session-only without the person ever having unchecked anything
// themselves. That's what made Remember Me look like it "forgot" the
// account over repeated visits.
export function getRememberMe() {
  return localStorage.getItem(REMEMBER_ME_KEY) !== '0'
}

// Read/write always re-check the flag rather than capturing it once, so
// a value written under one choice stays reachable under that same
// choice on every later read too (the flag itself always lives in
// localStorage regardless, so it survives across storage backends).
const dynamicAuthStorage = {
  getItem: (key) => getActiveStorage().getItem(key),
  setItem: (key, value) => getActiveStorage().setItem(key, value),
  removeItem: (key) => getActiveStorage().removeItem(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: dynamicAuthStorage,
  },
})