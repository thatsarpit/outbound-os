import { ACCEPTED_OUTREACH_STATUSES, OUTREACH_CHANNELS, OUTREACH_DELIVERY_EXCEPTIONS } from '../../shared/inboxOutreach.js';

/** Return channel presence for one authorized page without loading message bodies. */
export async function inboxOutreachChannels(db, leadIds) {
  const channelsByLead = new Map();
  if (!leadIds.length) return channelsByLead;
  const rows = await db.message.groupBy({
    by: ['leadId', 'channel'],
    orderBy: { channel: 'asc' },
    where: {
      leadId: { in: leadIds },
      direction: 'outbound',
      channel: { in: OUTREACH_CHANNELS },
      status: { in: ACCEPTED_OUTREACH_STATUSES },
      OR: [
        { providerDeliveryStatus: null },
        { providerDeliveryStatus: { notIn: OUTREACH_DELIVERY_EXCEPTIONS } },
      ],
    },
  });
  for (const { leadId, channel } of rows) {
    if (!channelsByLead.has(leadId)) channelsByLead.set(leadId, []);
    channelsByLead.get(leadId).push(channel);
  }
  return channelsByLead;
}
