import { AppShell } from '@/components/layout/app-shell'
import { installFixtureFetch, seedNotifications, seedStores } from '@/demo/fixtures'

/**
 * Dev-only harness for reviewing the application shell without a backend.
 *
 * The shell is otherwise only reachable behind authentication, which makes the
 * chrome — sidebar, top bar, command palette, layout rhythm — awkward to review
 * while it is being built. This seeds the auth store with the sample data in
 * `demo/fixtures.ts` and renders the real `AppShell`.
 *
 * Gated on `import.meta.env.DEV` at the route level, so it is tree-shaken out
 * of production builds.
 */

// Seeded at module scope, not during render: calling store setters while
// DevShellPage was rendering made React warn about updating another component
// mid-render. This still runs before the shell mounts, which is what matters.
let seeded = false
if (!seeded) {
  seeded = true
  installFixtureFetch()
  seedStores()
  // `?empty=1` skips the notification seed, so the bell's empty state can be
  // reviewed without editing this file.
  if (!window.location.search.includes('empty')) seedNotifications()
}

export default function DevShellPage() {
  return <AppShell />
}
