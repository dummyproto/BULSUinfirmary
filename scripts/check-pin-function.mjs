// Usage: npm run check:pin
//
// Calls the deployed verify-pin Edge Function with a dummy account (no real
// user is touched, nothing is counted) and reports whether the NEW version is
// live. Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local.

import { readFileSync } from 'node:fs'

function loadEnv(file) {
  const env = {}
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // file missing: fall through to the check below
  }
  return env
}

const env = { ...loadEnv('.env.local'), ...loadEnv('.env'), ...process.env }
const baseUrl = env.FUNCTION_BASE_URL || env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

if (!baseUrl || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/verify-pin`
console.log(`Checking ${url}\n`)

let res
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ email: 'pin-check@invalid.example', pin: '0000' }),
  })
} catch (err) {
  console.error('Could not reach the function:', err.message)
  process.exit(1)
}

const version = res.headers.get('x-function-version')
const body = await res.text()
console.log(`HTTP ${res.status}`)
console.log(`x-function-version: ${version ?? '(none)'}`)
console.log(`body: ${body}\n`)

if (res.status === 404) {
  console.log('RESULT: verify-pin is NOT deployed at all in this project. Run: npm run deploy:pin')
  process.exit(2)
}
if (res.status === 401) {
  console.log('RESULT: 401 — the request was rejected before reaching the function (JWT check).')
  console.log('        In Dashboard > Edge Functions > verify-pin, turn OFF "Verify JWT", or check the anon key.')
  process.exit(2)
}
if (version && version.startsWith('verify-pin v3')) {
  console.log('RESULT: OK — the NEW verify-pin is deployed. PIN login should work now.')
  process.exit(0)
}
console.log('RESULT: OLD verify-pin is still deployed (no version header). Run: npm run deploy:pin')
process.exit(2)