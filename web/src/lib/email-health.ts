export const EMAIL_SYNC_STALE_AFTER_MS = 15 * 60_000

type EmailHealthAccount = {
  enabled: boolean
  status: string
  imapHost?: string | null
  imapUser?: string | null
  hasImapPass?: boolean
  lastSyncAt?: string | null
  lastError?: string | null
}

export type EmailReceivingState =
  'not_configured' | 'paused' | 'error' | 'never_synced' | 'invalid_timestamp' | 'stale' | 'current'

export function emailAccountHealth(account: EmailHealthAccount, now = Date.now()) {
  const receivingConfigured = Boolean(
    account.imapHost?.trim() && account.imapUser?.trim() && account.hasImapPass !== false,
  )
  const syncTime = account.lastSyncAt ? Date.parse(account.lastSyncAt) : Number.NaN
  // A future clock by more than five minutes is not evidence of a current sync.
  const validSync = Number.isFinite(syncTime) && syncTime <= now + 5 * 60_000
  let receiving: EmailReceivingState
  if (!receivingConfigured) receiving = 'not_configured'
  else if (!account.enabled) receiving = 'paused'
  else if (account.lastError?.trim()) receiving = 'error'
  else if (!account.lastSyncAt) receiving = 'never_synced'
  else if (!validSync) receiving = 'invalid_timestamp'
  else if (now - syncTime >= EMAIL_SYNC_STALE_AFTER_MS) receiving = 'stale'
  else receiving = 'current'
  return {
    sending: !account.enabled
      ? ('paused' as const)
      : account.status === 'verified'
        ? ('verified' as const)
        : account.status === 'error'
          ? ('error' as const)
          : ('unverified' as const),
    receiving,
    receivingConfigured,
    lastSyncAt: validSync ? account.lastSyncAt || null : null,
  }
}

export function emailHealthSummary(accounts: EmailHealthAccount[], now = Date.now()) {
  const states = accounts.map((account) => ({ account, health: emailAccountHealth(account, now) }))
  const receiving = states.filter(
    ({ account, health }) => account.enabled && health.receivingConfigured,
  )
  const syncs = receiving
    .map(({ health }) => health.lastSyncAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))
  return {
    total: accounts.length,
    enabled: accounts.filter((account) => account.enabled).length,
    sendingVerified: states.filter(({ health }) => health.sending === 'verified').length,
    receivingConfigured: states.filter(({ health }) => health.receivingConfigured).length,
    receivingEnabled: receiving.length,
    receivingCurrent: receiving.filter(({ health }) => health.receiving === 'current').length,
    receivingStale: receiving.filter(({ health }) => health.receiving === 'stale').length,
    receivingUnconfirmed: receiving.filter(({ health }) =>
      ['error', 'never_synced', 'invalid_timestamp'].includes(health.receiving),
    ).length,
    lastSyncAt: syncs[0] || null,
  }
}
