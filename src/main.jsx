import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@styles/legacy.css'
import '@styles/app.css'

const root = createRoot(document.getElementById('root'))

const missingEnv = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY

if (missingEnv) {
  // Without these the Supabase client cannot be created. Show a readable
  // message instead of a blank page. App is imported lazily below so its
  // module graph (which creates the client) never loads in this case.
  root.render(
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '15vh auto', padding: 24 }}>
      <h1 style={{ fontSize: 20 }}>Configuration error</h1>
      <p>
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> are not set. Add them to{' '}
        <code>.env.local</code> (local) or your hosting provider&apos;s environment variables, then rebuild.
      </p>
    </div>,
  )
} else {
  import('./App.jsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}