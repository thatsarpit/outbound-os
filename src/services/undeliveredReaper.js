/** A missing delivery receipt is not evidence that a number is off WhatsApp. */
export async function reapStaleWhatsAppMessages(db, now = Date.now()) {
  const cutoff = new Date(now - 4 * 60 * 60 * 1000);
  const activeLead = { status: { in: ['new', 'contacted'] }, repliedAt: null,
    followupCount: 0, maxFollowups: { gt: 0 } };
  const pending = { direction: 'outbound', channel: 'whatsapp', status: 'sent',
    ackStatus: { in: [0, 1] }, sentAt: { lte: cutoff, not: null } };
  const candidates = await db.message.findMany({
    where: { ...pending, lead: activeLead }, include: { lead: true }, take: 200,
  });
  const changed = [];
  for (const candidate of candidates) {
    const lead = await db.$transaction(async tx => {
      // Re-read receipts and replies inside the same transaction as the claim.
      if (!await tx.message.findFirst({ where: { id: candidate.id, ...pending, lead: activeLead } })) return null;
      const evidence = await tx.message.findFirst({ where: {
        leadId: candidate.leadId, channel: 'whatsapp', OR: [
          { direction: 'inbound' },
          { direction: 'outbound', OR: [{ id: { gt: candidate.id }, status: { notIn: ['queued', 'cancelled'] } },
            { ackStatus: { gte: 2 } }, { status: { in: ['delivered', 'read'] } }] },
        ],
      } });
      if (evidence) return null;
      const claim = await tx.lead.updateMany({ where: {
        id: candidate.leadId, ...activeLead, updatedAt: candidate.lead.updatedAt,
      }, data: { status: 'wa_undelivered' } });
      if (!claim.count) return null;
      await tx.message.updateMany({ where: { leadId: candidate.leadId,
        status: 'queued', channel: 'whatsapp', direction: 'outbound' }, data: { status: 'cancelled' } });
      return tx.lead.findUnique({ where: { id: candidate.leadId } });
    });
    if (lead) changed.push(lead);
  }
  return changed;
}
