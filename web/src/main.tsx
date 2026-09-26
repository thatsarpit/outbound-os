import { ClerkProvider } from '@clerk/react'
import { ClerkAuthBridge } from './components/auth/clerk-auth-bridge'
import { LocalAuthBridge } from './components/auth/local-auth-bridge'
import { loadAuthConfig } from './lib/auth-config'
import { useAuthStore } from './stores/auth-store'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initSentry, captureError } from './lib/sentry'
import './styles/globals.css'

initSentry()

/**
 * Root-level error boundary — the final safety net beneath the route-level
 * boundary in AppShell. Catches crashes that happen *outside* the route outlet
 * too (Topbar, Sidebar, providers) which would otherwise blank the whole app.
 *
 * Special-cases dynamic-import / chunk-load failures: after a fresh deploy the
 * browser may still hold an index.html that references old JS chunk hashes;
 * those 404 and the lazy import() rejects. We reload once (guarded by a
 * sessionStorage flag so we never loop) to pull the new index.html + chunks.
 */
const CHUNK_ERROR_RE =
  /Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i

class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (CHUNK_ERROR_RE.test(error?.message || '')) {
      // Stale-chunk after redeploy: hard-reload once to fetch fresh assets.
      const KEY = 'chunk-reload-once'
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
        return
      }
    }
    console.error('[RootBoundary]', error)
    captureError(error, { boundary: 'root' })
  }

  render() {
    if (this.state.error) {
      const isChunk = CHUNK_ERROR_RE.test(this.state.error.message || '')
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: '#0a0a0f',
            color: '#e8e8f0',
            fontFamily: 'system-ui, sans-serif',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600 }}>
            {isChunk ? 'A new version is available' : 'Something went wrong'}
          </p>
          <p style={{ fontSize: 13, color: '#9b9bb0', maxWidth: 480 }}>
            {isChunk
              ? 'The app was updated. Reload to get the latest version.'
              : this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('chunk-reload-once')
              window.location.reload()
            }}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: '#e8e8f0',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
if (rootEl) {
  const root = createRoot(rootEl)
  void loadAuthConfig().then((authConfig) => {
    useAuthStore.getState().setProvider(authConfig.provider)
    if (authConfig.provider === 'clerk') {
      if (!authConfig.clerkPublishableKey) {
        console.error('Clerk sign-in is enabled but no publishable key is configured.')
      }
      root.render(
        <StrictMode>
          <ClerkProvider publishableKey={authConfig.clerkPublishableKey ?? ''} afterSignOutUrl="/">
            {/* Feeds Clerk's hook state into the Zustand auth store —
                see the module doc in stores/auth-store.ts. */}
            <ClerkAuthBridge />
            <RootBoundary>
              <App />
            </RootBoundary>
          </ClerkProvider>
        </StrictMode>,
      )
      return
    }
    root.render(
      <StrictMode>
        <LocalAuthBridge />
        <RootBoundary>
          <App />
        </RootBoundary>
      </StrictMode>,
    )
  })
}
