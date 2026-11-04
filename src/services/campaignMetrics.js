const acceptedStatuses = new Set(['sent', 'delivered', 'read']);
const failedStatuses = new Set(['failed', 'permanently_failed', 'bounced']);

/** Submission, delivery and replies are independent facts, not exclusive recipient states. */
async function calculateCampaignMetrics(db, campaignId, persist = true) {
  if (!await db.campaign.findUnique({ where: { id: campaignId }, select: { id: true } })) return null;
  const messages = await db.message.findMany({
    where: { campaignId, direction: 'outbound' },
    select: { leadId: true, status: true, sentAt: true },
  });
  const recipients = await db.campaignLead.findMany({ where: { campaignId }, select: { leadId: true, status: true, variant: true } });
  const accepted = new Set(messages.filter(row => row.sentAt || acceptedStatuses.has(row.status)).map(row => row.leadId));
  const failed = new Set(messages.filter(row => failedStatuses.has(row.status)).map(row => row.leadId));
  const delivered = new Set(messages.filter(row => ['delivered', 'read'].includes(row.status)).map(row => row.leadId));
  const read = new Set(messages.filter(row => row.status === 'read').map(row => row.leadId));
  const uncertain = new Set(messages.filter(row => row.status === 'unconfirmed').map(row => row.leadId));
  const messageLeadIds = new Set(messages.map(row => row.leadId));
  // Legacy recipient evidence predates message.campaignId; retain it without losing replies.
  for (const row of recipients) {
    if (['sent', 'replied'].includes(row.status)) accepted.add(row.leadId);
    if (row.status === 'failed' && !messageLeadIds.has(row.leadId)) failed.add(row.leadId);
  }
  const counts = { sentCount: accepted.size, failedCount: failed.size,
    variantACount: recipients.filter(row => accepted.has(row.leadId) && row.variant !== 'B').length,
    variantBCount: recipients.filter(row => accepted.has(row.leadId) && row.variant === 'B').length };
  if (persist) await db.campaign.update({ where: { id: campaignId }, data: counts });
  return { ...counts, delivery: { accepted: accepted.size, delivered: delivered.size, read: read.size,
    failed: failed.size, unconfirmed: uncertain.size,
    awaitingConfirmation: new Set(messages.filter(row => row.status === 'sent').map(row => row.leadId)).size } };
}

export async function readCampaignMetrics(db, campaignId) {
  return db.$transaction(tx => calculateCampaignMetrics(tx, campaignId, false));
}

export async function refreshCampaignMetrics(db, campaignId) {
  return db.$transaction(tx => calculateCampaignMetrics(tx, campaignId));
}

export async function reconcileCampaignCounters(db) {
  const campaigns = await db.campaign.findMany({ select: { id: true } });
  for (const campaign of campaigns) await refreshCampaignMetrics(db, campaign.id);
}

/** A restart must require an explicit resume; it must not redispatch uncertain attempts. */
export async function recoverCampaignRuns(db) {
  return db.$transaction(async tx => {
    const campaigns = await tx.campaign.findMany({ where: { status: 'running' }, select: { id: true } });
    const ids = campaigns.map(row => row.id);
    if (!ids.length) return { paused: 0 };
    await tx.campaignLead.updateMany({ where: { campaignId: { in: ids }, status: 'sending' }, data: { status: 'pending', skipReason: 'restart_review_required' } });
    await tx.message.updateMany({ where: { campaignId: { in: ids }, direction: 'outbound', status: 'sending' },
      data: { status: 'unconfirmed', providerStatusReason: 'confirmation_unknown' } });
    await tx.campaign.updateMany({ where: { id: { in: ids }, status: 'running' }, data: { status: 'paused' } });
    return { paused: ids.length };
  });
}
