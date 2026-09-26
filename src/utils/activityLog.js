/**
 * Activity Log
 * In-memory ring buffer of the last 100 system events for the dashboard activity feed.
 */
class ActivityLog {
  constructor(maxSize = 100) {
    this.events = [];
    this.maxSize = maxSize;
  }

  /**
   * Add an event to the log
   * @param {string} type - Event type (lead_created, message_sent, reply_received, etc.)
   * @param {string} message - Human-readable message
   * @param {object} data - Optional data payload
   */
  add(type, message, data = {}) {
    const event = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    this.events.unshift(event);

    // Trim to max size
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(0, this.maxSize);
    }

    // Persist to DB (fire-and-forget) so notifications survive restarts.
    // Skip in test env to keep tests fast and side-effect-free.
    if (process.env.NODE_ENV !== 'test') {
      import('./prismaClient.js').then(({ default: prisma }) => {
        const leadId   = typeof data.leadId   === 'number' ? data.leadId   : null;
        const accountId = typeof data.accountId === 'number' ? data.accountId : null;
        const meta = Object.keys(data).length > 0 ? JSON.stringify(data) : null;
        return prisma.activityLog.create({ data: { type, message, leadId, accountId, meta } });
      }).catch(() => {}); // DB unavailable during cold-start or test-mode — degrade silently
    }

    return event;
  }

  /**
   * Get recent events
   * @param {number} count - Number of events to return
   */
  getRecent(count = 20) {
    return this.events.slice(0, count);
  }

  /**
   * Get events by type
   */
  getByType(type, count = 20) {
    return this.events.filter(e => e.type === type).slice(0, count);
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = [];
  }
}

// Event type constants
export const EVENT_TYPES = {
  LEAD_CREATED: 'lead_created',
  LEAD_IMPORTED: 'lead_imported',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_FAILED: 'message_failed',
  REPLY_RECEIVED: 'reply_received',
  LEAD_TAKEOVER: 'lead_takeover',
  LEAD_RESUMED: 'lead_resumed',
  CAMPAIGN_STARTED: 'campaign_started',
  CAMPAIGN_COMPLETED: 'campaign_completed',
  IMPORT_COMPLETED: 'import_completed',
  SCORE_UPDATED: 'score_updated',
  WA_CONNECTED: 'wa_connected',
  WA_DISCONNECTED: 'wa_disconnected',
  COOKIE_REFRESHED: 'cookie_refreshed',
  EMAIL_SENT: 'email_sent',
  EMAIL_REPLY: 'email_reply',
  EMAIL_BOUNCED: 'email_bounced',
  EMAIL_SYNC_FAILED: 'email_sync_failed',
  EMAIL_ACCOUNT_ADDED: 'email_account_added',
  SYSTEM_ERROR: 'system_error',
  SYSTEM_RECOVERY: 'system_recovery',
};

const activityLog = new ActivityLog();
export default activityLog;
