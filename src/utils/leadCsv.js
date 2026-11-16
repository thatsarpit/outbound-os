/** Keep export formatting independent of the database so identities can be tested. */
export function leadsToCsv(leads) {
  const headers = [
    'ID', 'Name', 'Company', 'Mobile', 'WhatsApp Username', 'WhatsApp User ID',
    'Email', 'Country', 'Product', 'Quantity', 'Source', 'Status', 'Score',
    'Engagement Level', 'Reply Speed', 'Follow-ups Sent',
    'Tags', 'Notes', 'Last Activity', 'Created At',
  ];
  const escape = (value) => {
    let text = String(value ?? '');
    // Spreadsheet apps can execute formula-looking text even inside a quoted CSV field.
    if (typeof value === 'string' && /^[\t\r\n\0]|^\s*[=+\-@＝＋－＠]/u.test(text)) {
      text = `'${text}`;
    }
    return /[,;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = leads.map((lead) => [
    lead.id, lead.name, lead.company || '',
    String(lead.mobile || '').startsWith('no-phone:') ? '' : lead.mobile,
    lead.waUsername || '', lead.waUserId || '',
    lead.email || '', lead.country || '', lead.product || '', lead.quantity || '',
    lead.source, lead.status, lead.score, lead.engagementLevel,
    lead.replySpeed || 'none', lead.followupCount, lead.tags || '', lead.notes || '',
    lead.lastMessageAt ? lead.lastMessageAt.toISOString() : '', lead.createdAt.toISOString(),
  ].map(escape).join(','));
  return [headers.join(','), ...rows].join('\n');
}
