/**
 * Google Sheets Sync Service
 *
 * Pushes lead rows to a Google Sheet via a Google Apps Script Web App URL.
 * No OAuth required — the Apps Script acts as a public (or restricted) webhook.
 *
 * Setup (one-time, by user):
 *   1. Open your Google Sheet.
 *   2. Extensions → Apps Script → paste the adapter code below → Deploy as Web App
 *      (Execute as: Me, Access: Anyone with link)
 *   3. Copy the deployment URL and paste it in Settings → Google Sheets Webhook URL
 *
 * Apps Script adapter (paste into script editor):
 *
 * This version maps values onto the sheet's own header row by name rather than
 * by position. The previous positional version had two problems: adding a field
 * (Email) shifted every column after it on sheets already in use, and a sheet
 * created before a field existed never grew a header for it. Header-driven means
 * you add a column whenever you want one and rows fill it in; unknown keys are
 * ignored and missing ones are left blank.
 * ─────────────────────────────────────────────
 * const HEADERS = ['Event','ID','Name','Company','Mobile','Email','Country',
 *                  'Product','Quantity','Status','Score','Tier','Source',
 *                  'Deal Value','Created At'];
 * const FIELD_BY_HEADER = {
 *   'Event': 'event', 'ID': 'id', 'Name': 'name', 'Company': 'company',
 *   'Mobile': 'mobile', 'Email': 'email', 'Country': 'country',
 *   'Product': 'product', 'Quantity': 'quantity', 'Status': 'status',
 *   'Score': 'score', 'Tier': 'leadTier', 'Source': 'source',
 *   'Deal Value': 'dealValue', 'Created At': 'createdAt'
 * };
 *
 * function doPost(e) {
 *   const data = JSON.parse(e.postData.contents);
 *   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads') ||
 *                 SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *   if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
 *   const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
 *                        .getValues()[0].map(String);
 *   sheet.appendRow(headers.map(function (h) {
 *     const key = FIELD_BY_HEADER[h.trim()];
 *     const value = key ? data[key] : undefined;
 *     // Force text so a leading '+' or a long number is not mangled into
 *     // scientific notation or silently truncated by Sheets.
 *     if (key === 'mobile' && value) return "'" + value;
 *     return value == null ? '' : value;
 *   }));
 *   return ContentService.createTextOutput(JSON.stringify({ ok: true }))
 *                        .setMimeType(ContentService.MimeType.JSON);
 * }
 * ─────────────────────────────────────────────
 *
 * Already have a sheet from the old adapter? Add an `Email` and a `Quantity`
 * header cell to the end of row 1, then replace the script with the above.
 *
 * Triggered by: lead.created, lead.replied, lead.engaged, lead.status_changed
 */

import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { isSendableMobile } from '../utils/inboundLead.js';

const CONFIG_KEY = 'sheets.webhook_url';
const ENABLED_KEY = 'sheets.enabled';
const EVENTS_KEY = 'sheets.events'; // JSON array

class SheetsSyncService {
  constructor() {
    this._url = null;
    this._enabled = false;
    this._events = ['lead.created', 'lead.replied', 'lead.engaged'];
    this._loaded = false;
  }

  async _load() {
    if (this._loaded) return;
    try {
      const rows = await prisma.systemConfig.findMany({
        where: { key: { in: [CONFIG_KEY, ENABLED_KEY, EVENTS_KEY] } },
      });
      for (const row of rows) {
        if (row.key === CONFIG_KEY) this._url = row.value;
        if (row.key === ENABLED_KEY) this._enabled = row.value === 'true';
        if (row.key === EVENTS_KEY) {
          try { this._events = JSON.parse(row.value); } catch {}
        }
      }
      this._loaded = true;
    } catch (e) {
      logger.warn(`SheetsSync config load failed: ${e.message}`);
    }
  }

  /** Invalidate in-memory cache (after settings save) */
  reload() { this._loaded = false; }

  /**
   * Dispatch a lead event to Google Sheets.
   * @param {string} event - e.g. 'lead.created'
   * @param {object} lead  - Lead record
   */
  async dispatch(event, lead) {
    await this._load();
    if (!this._enabled || !this._url) return;
    if (!this._events.includes(event) && !this._events.includes('*')) return;

    const row = {
      event,
      id: lead.id,
      name: lead.name,
      company: lead.company,
      // A placeholder stands in when Lead.mobile has no real number (the column
      // is required). Send it as blank rather than letting `no-phone:...` look
      // like a contact number in the sheet.
      mobile: isSendableMobile(lead.mobile) ? lead.mobile : '',
      email: lead.email,
      country: lead.country,
      product: lead.product,
      quantity: lead.quantity,
      status: lead.status,
      score: lead.score,
      leadTier: lead.leadTier,
      source: lead.source,
      dealValue: lead.dealValue,
      createdAt: lead.createdAt,
    };

    await this._post(row, `${event} for lead ${lead.id}`);
  }

  /**
   * POST a row, retrying transient failures.
   *
   * Apps Script web apps cold-start, rate-limit and occasionally 500, and this
   * had no retry at all: one blip and the row was gone for good, with nothing
   * but a warn line to show for it. A lost row here looks exactly like the bug
   * everyone was chasing — a lead in the CRM that never reached the sheet.
   *
   * Retries 5xx and network errors only. A 4xx means the script itself rejected
   * the row, and sending it again would just fail the same way.
   */
  async _post(row, label, attempt = 1) {
    const MAX_ATTEMPTS = 3;
    try {
      const res = await fetch(this._url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        logger.info(`📊 SheetsSync: pushed ${label}`);
        return true;
      }
      if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        return this._post(row, label, attempt + 1);
      }
      logger.warn(`📊 SheetsSync: gave up on ${label} after ${res.status}`);
      return false;
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        return this._post(row, label, attempt + 1);
      }
      logger.warn(`📊 SheetsSync: gave up on ${label} after ${attempt} attempts: ${e.message}`);
      return false;
    }
  }

  /** Test the connection — sends a synthetic test row */
  async test(url) {
    const row = {
      event: 'test',
      id: 0,
      name: 'Test Lead',
      company: 'OutboundOS Test',
      mobile: '+910000000000',
      email: 'test@example.com',
      country: 'India',
      product: 'Test Product',
      quantity: '100 boxes',
      status: 'new',
      score: 75,
      leadTier: 'HOT',
      source: 'test',
      dealValue: null,
      createdAt: new Date().toISOString(),
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Google Apps Script returned ${res.status}`);
    return { ok: true };
  }

  getConfig() {
    return { url: this._url, enabled: this._enabled, events: this._events };
  }
}

export default new SheetsSyncService();
