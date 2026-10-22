/**
 * Every first-touch message for a lead carries a key built here, and a database
 * unique index on it is what stops a lead being contacted twice on one channel.
 *
 * Earlier first-touch template labels are normalised by the upgrade migration
 * and still recognised by LEGACY_FRESH_LEAD_VARIANTS in freshLeadOutreach.js.
 */
export const FRESH_AUTOMATION_KEY_PREFIX = 'fresh-lead:v3:';

export function buildFreshAutomationKey(leadId, channel) {
  return `${FRESH_AUTOMATION_KEY_PREFIX}lead:${Number(leadId)}:channel:${String(channel).toLowerCase()}`;
}
