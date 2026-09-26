import { withDefaultCountryCode } from '../utils/phoneDefaults.js';
import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { formatPhoneForWA } from '../utils/delay.js';

/**
 * CSV Import Engine
 * Parses CSV data, deduplicates by mobile number, and creates leads.
 */
class CSVImporter {

  /**
   * Column names recognised in common CRM and marketplace exports
   */
  static COLUMN_MAP = {
    // Name columns
    name: ['name', 'buyer_name', 'contact_name', 'sender_name', 'buyer name', 'contact name', 'contact person name'],
    company: ['company', 'company_name', 'sender_company', 'company name'],
    mobile: ['mobile', 'phone', 'mobile_no', 'sender_mobile', 'mobile number', 'phone number', 'mob', 'mob_no', 'sender_mobile_alt'],
    email: ['email', 'email_id', 'sender_email', 'email id'],
    product: ['product', 'product_name', 'subject', 'product name', 'query subject', 'product interest'],
    country: ['country', 'country_name', 'sender_country', 'country name'],
    quantity: ['quantity', 'qty', 'requirement_qty'],
    externalId: ['external_id', 'external id', 'query_id', 'unique_query_id', 'indiamart_id', 'query id', 'lead_id'],
    // Extended columns found in richer CRM exports
    consumedAt: ['consumed on date', 'consumed_at', 'lead date'],
    dealValue: ['estimated value', 'estimated value ($ usd)', 'order value', 'deal value'],
    source: ['source'],
    status: ['status'],
    memberSince: ['member since'],
    assignedTo: ['assigned to'],
    remarks: ['conversation remarks', 'remarks'],
    sentiment: ['sentiment'],
    followup1Remarks: ['1st follow-up remarks'],
    followup1Sentiment: ['1st follow-up sentiment'],
    followup2Remarks: ['2nd follow-up remarks'],
    followup2Sentiment: ['2nd follow-up sentiment'],
    orderId: ['order id'],
    orderDate: ['order date'],
    orderDetails: ['order details'],
    orderValue: ['order value ($ usd)'],
  };

  /**
   * Parse CSV text into rows
   */
  parseCSV(csvText) {
    const lines = csvText.split('\n').filter(l => l.trim().replace(/,/g, '').trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    // Parse header row
    const headers = this._parseLine(lines[0]).map(h => h.trim().toLowerCase());

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this._parseLine(lines[i]);
      if (values.length > 0) {
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = (values[idx] || '').trim();
        });
        rows.push(row);
      }
    }

    return { headers, rows };
  }

  /**
   * Parse a single CSV line, handling quoted fields
   */
  _parseLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  /**
   * Map CSV columns to our Lead fields
   */
  _mapColumns(headers) {
    const mapping = {};

    for (const [field, aliases] of Object.entries(CSVImporter.COLUMN_MAP)) {
      for (const alias of aliases) {
        let match = headers.find(h => h === alias);
        if (!match) match = headers.find(h => h.includes(alias));
        if (match) {
          mapping[field] = match;
          break;
        }
      }
    }

    return mapping;
  }

  /**
   * Import CSV data
   * @param {string} csvText - Raw CSV content
   * @param {string} filename - Original filename for batch tracking
   * @returns {object} Import results
   */
  async importCSV(csvText, filename, { poolId = null, tags = [] } = {}) {
    const { headers, rows } = this.parseCSV(csvText);

    if (rows.length === 0) {
      return { success: false, error: 'No data rows found in CSV' };
    }

    const columnMapping = this._mapColumns(headers);

    if (!columnMapping.mobile) {
      return {
        success: false,
        error: 'Could not identify mobile/phone column. Found headers: ' + headers.join(', '),
        detectedHeaders: headers,
      };
    }

    return this._runImport(rows, columnMapping, filename, { poolId, tags });
  }

  /**
   * Import rows that are already objects with canonical field names.
   *
   * Same path as a CSV import — dedupe, backfill, batch tracking — without
   * requiring a file. This is what lets a caller that already holds structured
   * leads (the MCP server, another service) use the tested importer instead of
   * writing its own inserts, which is how the CRM ends up with leads that have
   * no pool and no batch to roll back.
   */
  async importRows(rows, filename, { poolId = null, tags = [] } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: 'No rows supplied' };
    }
    // The shared body addresses fields through a mapping; for canonical input
    // that mapping is the identity.
    const identity = Object.fromEntries(Object.keys(CSVImporter.COLUMN_MAP).map((k) => [k, k]));
    if (!rows.some((r) => r[identity.mobile])) {
      return { success: false, error: 'No row carried a mobile number' };
    }
    return this._runImport(rows, identity, filename, { poolId, tags });
  }

  async _runImport(rows, columnMapping, filename, { poolId = null, tags: extraTags = [] } = {}) {
    // Create import batch tracker
    const batch = await prisma.importBatch.create({
      data: { filename, totalRows: rows.length, status: 'processing' },
    });

    let imported = 0;
    let duplicates = 0;
    let failed = 0;

    const validRows = [];
    const allMobiles = [];

    // 1. Clean and validate row data
    for (const row of rows) {
      let mobile = row[columnMapping.mobile] || '';
      // Handle +(CC)-number format: +(61)-491570157 → 61491570157
      mobile = mobile.replace(/[^0-9+]/g, '');
      if (!mobile || mobile.length < 7) {
        failed++;
        continue;
      }

      if (mobile.startsWith('+')) mobile = mobile.substring(1);
      mobile = withDefaultCountryCode(mobile);
      if (mobile.startsWith('0')) mobile = mobile.replace(/^0+/, '');
      // Fix double country code: if starts with country code repeated (e.g. 117... for US)
      // US numbers: if starts with '1' and is 12+ digits, likely doubled — strip leading '1'
      if (mobile.startsWith('1') && mobile.length >= 12) {
        const withoutFirst = mobile.substring(1);
        if (withoutFirst.length === 11 && withoutFirst.startsWith('1')) {
          mobile = withoutFirst; // was 1-1XXXXXXXXXX, now 1XXXXXXXXXX
        }
      }

      row._cleanMobile = mobile;
      validRows.push(row);
      allMobiles.push(mobile);
    }

    try {
      // 2. Batch fetch existing leads
      const existingLeads = await prisma.lead.findMany({
        where: { mobile: { in: allMobiles } },
        select: { id: true, mobile: true, company: true, email: true, product: true, country: true, quantity: true }
      });

      const existingMap = new Map();
      for (const lead of existingLeads) existingMap.set(lead.mobile, lead);

      const newLeadsData = [];
      const updatePromises = [];

      // 3. Separate logic for new inserts and updates
      for (const row of validRows) {
        const mobile = row._cleanMobile;
        const existing = existingMap.get(mobile);

        if (existing) {
          // A row whose number is already queued for creation earlier in this
          // same file. There is no database row to patch yet — the marker
          // carries no id — so count it as a duplicate and move on. Falling
          // through built an update against the literal id "pending", which
          // Prisma rejects, and that aborted the whole import after the
          // inserts had already been written.
          if (existing.queuedInThisBatch) {
            duplicates++;
            continue;
          }

          const updates = {};
          if (!existing.company && row[columnMapping.company]) updates.company = row[columnMapping.company];
          if (!existing.email && row[columnMapping.email]) updates.email = row[columnMapping.email];
          if (!existing.product && row[columnMapping.product]) updates.product = row[columnMapping.product];
          if (!existing.country && row[columnMapping.country]) updates.country = row[columnMapping.country];
          if (!existing.quantity && row[columnMapping.quantity]) updates.quantity = row[columnMapping.quantity];

          if (Object.keys(updates).length > 0) {
            updatePromises.push(prisma.lead.update({ where: { id: existing.id }, data: updates }));
          }
          duplicates++;
        } else {
          // Build tags from extended CSV fields
          const tags = [];
          const csvSource = row[columnMapping.source];
          if (csvSource) tags.push(`source:${csvSource.toLowerCase().replace(/\s+/g, '-')}`);
          const memberSince = row[columnMapping.memberSince];
          if (memberSince) tags.push(`member-since:${memberSince}`);

          // Parse consumed date
          let consumedAt = null;
          const consumedRaw = row[columnMapping.consumedAt];
          if (consumedRaw) {
            const parsed = new Date(consumedRaw);
            if (!isNaN(parsed)) consumedAt = parsed;
          }

          // Parse deal value
          let dealValue = null;
          const dealRaw = row[columnMapping.dealValue] || row[columnMapping.orderValue];
          if (dealRaw) {
            const parsed = parseFloat(String(dealRaw).replace(/[^0-9.]/g, ''));
            if (!isNaN(parsed) && parsed > 0) dealValue = parsed;
          }

          // Map CSV status to our status
          const csvStatus = (row[columnMapping.status] || '').toLowerCase().trim();
          const statusMap = { new: 'new', contacted: 'contacted', replied: 'replied', engaged: 'engaged', closed: 'closed' };
          const mappedStatus = statusMap[csvStatus] || 'new';

          // Notes from assigned-to and remarks
          const noteParts = [];
          const assignedTo = row[columnMapping.assignedTo];
          if (assignedTo) noteParts.push(`Originally assigned to: ${assignedTo}`);

          newLeadsData.push({
            name: row[columnMapping.name] || 'Unknown',
            mobile,
            company: row[columnMapping.company] || null,
            email: row[columnMapping.email] || null,
            product: row[columnMapping.product] || null,
            country: row[columnMapping.country] || null,
            quantity: row[columnMapping.quantity] || null,
            externalId: row[columnMapping.externalId] || null,
            source: 'csv_import',
            importBatchId: batch.id,
            status: mappedStatus,
            poolId: poolId || null,
            tags: [...new Set([...tags, ...extraTags])].join(', ') || null,
            consumedAt,
            dealValue,
            notes: noteParts.length > 0 ? noteParts.join('\n') : null,
          });

          // Collect LeadNote data for post-create (remarks, follow-ups, orders)
          const noteContents = [];
          const remarks = row[columnMapping.remarks];
          const remarksSentiment = row[columnMapping.sentiment];
          if (remarks) noteContents.push({ content: `Conversation: ${remarks}${remarksSentiment ? ` (${remarksSentiment})` : ''}`, type: 'note' });
          const fu1 = row[columnMapping.followup1Remarks];
          const fu1s = row[columnMapping.followup1Sentiment];
          if (fu1) noteContents.push({ content: `Follow-up 1: ${fu1}${fu1s ? ` (${fu1s})` : ''}`, type: 'note' });
          const fu2 = row[columnMapping.followup2Remarks];
          const fu2s = row[columnMapping.followup2Sentiment];
          if (fu2) noteContents.push({ content: `Follow-up 2: ${fu2}${fu2s ? ` (${fu2s})` : ''}`, type: 'note' });
          const orderId = row[columnMapping.orderId];
          const orderDate = row[columnMapping.orderDate];
          const orderDetails = row[columnMapping.orderDetails];
          if (orderId || orderDetails) {
            noteContents.push({ content: `Order: ${orderId || 'N/A'} — ${orderDate || ''} — ${orderDetails || ''}`.trim(), type: 'note' });
          }
          if (noteContents.length > 0) {
            row._pendingNotes = noteContents;
          }
          // Add to map to prevent duplicate creates in the same batch. Flagged
          // rather than given a fake id, so the branch above can tell it apart
          // from a real row.
          existingMap.set(mobile, { queuedInThisBatch: true });
        }
      }

      // 4. Execute inserts in bulk
      if (newLeadsData.length > 0) {
        // Two rows in one file can carry the same number — the same buyer
        // enquiring twice. The existing-lead check above only compares against
        // what is already in the database, so without this the file's own
        // repeats would each become a separate lead.
        const seenInBatch = new Set();
        const uniqueNewLeads = [];
        for (const lead of newLeadsData) {
          if (seenInBatch.has(lead.mobile)) {
            duplicates++;
            continue;
          }
          seenInBatch.add(lead.mobile);
          uniqueNewLeads.push(lead);
        }

        // No `skipDuplicates`: Prisma only supports it on PostgreSQL and
        // CockroachDB, and this deployment is SQLite — passing it makes the
        // whole call throw, which took the entire import down with it. The
        // de-duplication it was standing in for is done explicitly above.
        const res = await prisma.lead.createMany({ data: uniqueNewLeads });
        imported += res.count;
        failed += (uniqueNewLeads.length - res.count);
      }

      // 4b. Create LeadNote records for imported leads with remarks/follow-ups/orders
      const rowsWithNotes = validRows.filter(r => r._pendingNotes && r._pendingNotes.length > 0);
      if (rowsWithNotes.length > 0) {
        // Look up the newly created leads by mobile to get their IDs
        const noteMobiles = rowsWithNotes.map(r => r._cleanMobile);
        const noteLeads = await prisma.lead.findMany({
          where: { mobile: { in: noteMobiles } },
          select: { id: true, mobile: true },
        });
        const mobileToId = new Map(noteLeads.map(l => [l.mobile, l.id]));
        const noteData = [];
        for (const row of rowsWithNotes) {
          const leadId = mobileToId.get(row._cleanMobile);
          if (!leadId) continue;
          for (const note of row._pendingNotes) {
            noteData.push({ leadId, content: note.content, type: note.type });
          }
        }
        if (noteData.length > 0) {
          await prisma.leadNote.createMany({ data: noteData });
          logger.info(`📝 Created ${noteData.length} LeadNotes from CSV import`);
        }
      }

      // 5. Execute sparse updates
      if (updatePromises.length > 0) {
        for (let i = 0; i < updatePromises.length; i += 50) {
          await Promise.all(updatePromises.slice(i, i + 50));
        }
      }

      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { imported, duplicates, failed, status: 'completed' },
      });

      logger.info(`📥 CSV Import complete: ${imported} imported, ${duplicates} duplicates, ${failed} failed`);
    } catch (e) {
      logger.error(`CSV Import Batch failed: ${e.message}`);
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { imported, duplicates, failed, status: 'failed' },
      });
      return { success: false, error: e.message };
    }

    return {
      success: true,
      batchId: batch.id,
      totalRows: rows.length,
      imported,
      duplicates,
      failed,
      columnMapping,
    };
  }

  async getBatches() {
    return prisma.importBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}

const csvImporter = new CSVImporter();
export default csvImporter;
