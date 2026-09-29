import { useAuthStore } from '@/stores/auth-store'
import { installFixtureFetch, seedNotifications, seedStores } from './fixtures'

/**
 * Prepares the public demo: the whole dashboard, signed in as an admin of the
 * sample workspace, with every API call answered in the browser. There is no
 * server behind it, so there is nothing to sign in to and nothing to break.
 */
export function startDemo() {
  installFixtureFetch()
  useAuthStore.getState().setProvider('local')
  seedStores()
  seedNotifications()
}
