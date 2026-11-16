// Receipt facts remain authoritative even if a later delivery update changes the message row.
// Suppression belongs to the sending business, so another account must not inherit it.
export async function suppressedWhatsAppLeads(db, leadIds, accountId = null) {
  if (!leadIds.length) return new Set();
  const suppressed = new Set();
  const ids = [...new Set(leadIds)];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const messages = await db.message.findMany({
      where: { leadId: { in: ids.slice(offset, offset + 200) }, channel: 'whatsapp', direction: 'outbound',
        ...(accountId ? { waAccount: accountId } : {}) },
      select: { leadId: true, waAccount: true, waMessageId: true, providerErrorCode: true },
    });
    for (const row of messages) if (['131050'].includes(row.providerErrorCode)) suppressed.add(row.leadId);
    const providerIds = [...new Set(messages.map(row => row.waMessageId).filter(Boolean))];
    for (let index = 0; index < providerIds.length; index += 500) {
      const receipts = await db.whatsAppReceipt.findMany({
        where: { failureCode: { in: [131050] }, waMessageId: { in: providerIds.slice(index, index + 500) },
          ...(accountId ? { accountId } : {}) },
        select: { accountId: true, waMessageId: true },
      });
      const refused = new Set(receipts.map(row => `${row.accountId}:${row.waMessageId}`));
      for (const row of messages) if (refused.has(`${row.waAccount}:${row.waMessageId}`)) suppressed.add(row.leadId);
    }
  }
  return suppressed;
}

export async function whatsappAddressSuppressed(db, address, accountId) {
  const value = String(address || '').trim();
  const leads = await db.lead.findMany({
    where: { OR: [{ mobile: value.replace(/^\+/, '') }, { mobile: value }, { waUserId: value }] },
    select: { id: true },
  });
  return (await suppressedWhatsAppLeads(db, leads.map(lead => lead.id), accountId)).size > 0;
}
