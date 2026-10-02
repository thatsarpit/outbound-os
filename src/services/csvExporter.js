import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { leadsToCsv } from '../utils/leadCsv.js';

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

    const csv = leadsToCsv(leads);

    logger.info(`📤 Exported ${leads.length} leads to CSV`);
    return csv;
  }


}

const csvExporter = new CSVExporter();
export default csvExporter;
