import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';

/**
 * CSV Export Engine
 * Exports leads to CSV with filtering options.
 */
class CSVExporter {

  /**
   * Export leads as CSV string
   * @param {object} filters - Optional filters { status, minScore, maxScore, tags, source, campaignId }
   */
  async exportLeads(filters = {}) {
    const where = {};

    if (filters.status) where.status = filters.status;
    if (filters.source) where.source = filters.source;
    if (filters.minScore !== undefined || filters.maxScore !== undefined) {
      where.score = {};
      if (filters.minScore !== undefined) where.score.gte = parseInt(filters.minScore);
      if (filters.maxScore !== undefined) where.score.lte = parseInt(filters.maxScore);
    }
    if (filters.tags) {
      where.tags = { contains: filters.tags };
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { score: 'desc' },
    });

    // CSV headers
    const headers = [
      'ID', 'Name', 'Company', 'Mobile', 'Email', 'Country',
      'Product', 'Quantity', 'Source', 'Status', 'Score',
      'Engagement Level', 'Reply Speed', 'Follow-ups Sent',
      'Tags', 'Notes', 'Last Activity', 'Created At',
    ];

    const rows = leads.map(lead => [
      lead.id,
      this._escapeCSV(lead.name),
      this._escapeCSV(lead.company || ''),
      lead.mobile,
      lead.email || '',
      lead.country || '',
      this._escapeCSV(lead.product || ''),
      lead.quantity || '',
      lead.source,
      lead.status,
      lead.score,
      lead.engagementLevel,
      lead.replySpeed || 'none',
      lead.followupCount,
      lead.tags || '',
      this._escapeCSV(lead.notes || ''),
      lead.lastMessageAt ? lead.lastMessageAt.toISOString() : '',
      lead.createdAt.toISOString(),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    logger.info(`📤 Exported ${leads.length} leads to CSV`);
    return csv;
  }

  _escapeCSV(value) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

const csvExporter = new CSVExporter();
export default csvExporter;
