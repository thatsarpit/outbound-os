import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import activityLog, { EVENT_TYPES } from '../utils/activityLog.js';
import config from '../config.js';
import freshLeadOutreach from './freshLeadOutreach.js';
import followupEngine from './followup.js';
import emailService from './emailService.js';
import dailyEmailScheduler from './dailyEmailScheduler.js';
import { computeRecoverySince, isWakeGap } from '../utils/recovery.js';

const KEYS = {
  heartbeatAt: 'runtime.heartbeat_at',
  startedAt: 'runtime.started_at',
  stoppedAt: 'runtime.stopped_at',
  lastRecoveryAt: 'runtime.last_recovery_at',
  lastRecoveryReason: 'runtime.last_recovery_reason',
  lastRecoveryStatus: 'runtime.last_recovery_status',
  lastRecoverySummary: 'runtime.last_recovery_summary',
  lastDowntimeMs: 'runtime.last_downtime_ms',
  lastMaintenanceAt: 'runtime.last_maintenance_at',
};

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readConfig(keys = Object.values(KEYS)) {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: keys } } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function writeConfig(values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  await prisma.$transaction(entries.map(([key, value]) => prisma.systemConfig.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  })));
}

class RecoveryCoordinator {
  constructor() {
    this.running = false;
    this.started = false;
    this.heartbeatTimer = null;
    this.maintenanceTimer = null;
    this.lastTickMs = null;
    this.current = null;
  }

  async _heartbeat(at = new Date()) {
    await writeConfig({ [KEYS.heartbeatAt]: at.toISOString() });
  }

  async start() {
    if (this.started || !config.recovery.enabled) return this.getStatus();
    this.started = true;
    this.lastTickMs = Date.now();
    await writeConfig({ [KEYS.startedAt]: new Date().toISOString() });

    // Await startup recovery before declaring the runtime healthy. This makes
    // a launchd restart deterministic: catch-up is part of boot, not a best-
    // effort timeout that disappears if the process restarts again.
    await this.runRecovery({ reason: 'startup' });

    const heartbeatMs = config.recovery.heartbeatSeconds * 1000;
    const wakeGapMs = config.recovery.wakeGapSeconds * 1000;
    this.heartbeatTimer = setInterval(async () => {
      const nowMs = Date.now();
      const previousTickMs = this.lastTickMs;
      const woke = isWakeGap(previousTickMs, nowMs, wakeGapMs);
      this.lastTickMs = nowMs;
      try {
        if (woke) {
          logger.warn(`🌅 Runtime wake detected after ${Math.round((nowMs - previousTickMs) / 1000)}s gap`);
          await this.runRecovery({ reason: 'wake' });
        } else if (!this.running) {
          await this._heartbeat(new Date(nowMs));
        }
      } catch (error) {
        logger.warn(`Runtime heartbeat/recovery tick failed: ${error.message}`);
      }
    }, heartbeatMs);
    this.heartbeatTimer.unref?.();

    const maintenanceMs = config.recovery.reconcileIntervalMinutes * 60 * 1000;
    this.maintenanceTimer = setInterval(() => {
      this.runMaintenance().catch((error) =>
        logger.warn(`Runtime reconciliation maintenance failed: ${error.message}`));
    }, maintenanceMs);
    this.maintenanceTimer.unref?.();

    return this.getStatus();
  }

  async runRecovery({ reason = 'manual' } = {}) {
    if (this.running) return { skipped: true, reason: 'recovery_in_progress' };
    this.running = true;
    const runStarted = new Date();
    let since = null;
    try {
      const state = await readConfig([KEYS.heartbeatAt]);
      const previousHeartbeat = validDate(state[KEYS.heartbeatAt]);
      since = computeRecoverySince({
        previousHeartbeat,
        now: runStarted,
        initialLookbackHours: config.recovery.initialLookbackHours,
        overlapMinutes: config.recovery.overlapMinutes,
      });
      const downtimeMs = previousHeartbeat
        ? Math.max(0, runStarted.getTime() - previousHeartbeat.getTime())
        : null;

      this.current = { reason, status: 'running', startedAt: runStarted.toISOString(), since: since.toISOString() };
      await writeConfig({
        [KEYS.lastRecoveryReason]: reason,
        [KEYS.lastRecoveryStatus]: 'running',
        ...(downtimeMs !== null ? { [KEYS.lastDowntimeMs]: downtimeMs } : {}),
      });
      activityLog.add(EVENT_TYPES.SYSTEM_RECOVERY || 'system_recovery', `Runtime recovery started (${reason})`, {
        since: since.toISOString(), downtimeMs,
      });

      // First ingest replies received while this process was down. Outbound
      // processors re-check lead state after claiming, so replied/paused leads
      // are cancelled before any due message is dispatched.
      let emailReplySync = { ok: true };
      try {
        const replies = await emailService.syncAllReplies();
        emailReplySync = { ok: true, replies: Array.isArray(replies) ? replies.length : undefined };
      } catch (error) {
        emailReplySync = { ok: false, error: error.message };
      }

      const reconciliation = await freshLeadOutreach.reconcileRecent({ since });
      const stuck = await followupEngine.recoverStuckMessages();
      let dailyEmail = { skipped: true, reason: 'not_run' };
      try {
        // Idempotent by IST date: this catches a 06:05 cron missed while the
        // Mac slept without ever selecting the daily batch twice.
        dailyEmail = await dailyEmailScheduler.run();
      } catch (error) {
        dailyEmail = { failed: true, error: error.message };
      }
      const degraded = reconciliation.errors > 0
        || emailReplySync.ok === false
        || dailyEmail.failed === true;
      const summary = {
        reason,
        startedAt: runStarted.toISOString(),
        finishedAt: new Date().toISOString(),
        since: since.toISOString(),
        reconciliation,
        stuckMessagesRecovered: Number(stuck?.count ?? stuck ?? 0),
        emailReplySync,
        dailyEmail,
      };

      this.current = { ...summary, status: degraded ? 'degraded' : 'ok' };
      await writeConfig({
        [KEYS.lastRecoveryAt]: summary.finishedAt,
        [KEYS.lastRecoveryReason]: reason,
        [KEYS.lastRecoveryStatus]: this.current.status,
        [KEYS.lastRecoverySummary]: JSON.stringify(summary),
        [KEYS.heartbeatAt]: summary.finishedAt,
      });
      activityLog.add(EVENT_TYPES.SYSTEM_RECOVERY || 'system_recovery', `Runtime recovery ${this.current.status} (${reason})`, {
        reconciliation,
      });
      return this.current;
    } catch (error) {
      const failedAt = new Date().toISOString();
      this.current = {
        reason,
        status: 'failed',
        startedAt: runStarted.toISOString(),
        finishedAt: failedAt,
        since: since?.toISOString() || null,
        error: error.message,
      };
      await writeConfig({
        [KEYS.lastRecoveryAt]: failedAt,
        [KEYS.lastRecoveryReason]: reason,
        [KEYS.lastRecoveryStatus]: 'failed',
        [KEYS.lastRecoverySummary]: JSON.stringify(this.current),
        [KEYS.heartbeatAt]: failedAt,
      }).catch(() => {});
      activityLog.add(EVENT_TYPES.SYSTEM_ERROR, `Runtime recovery failed (${reason}): ${error.message}`);
      logger.error(`Runtime recovery failed (${reason}): ${error.stack || error.message}`);
      return this.current;
    } finally {
      this.running = false;
      this.lastTickMs = Date.now();
    }
  }

  async runMaintenance() {
    if (this.running) return { skipped: true, reason: 'recovery_in_progress' };
    const state = await readConfig([KEYS.lastMaintenanceAt, KEYS.lastRecoveryAt]);
    const anchor = validDate(state[KEYS.lastMaintenanceAt])
      || validDate(state[KEYS.lastRecoveryAt])
      || new Date(Date.now() - config.recovery.initialLookbackHours * 60 * 60 * 1000);
    const since = new Date(anchor.getTime() - config.recovery.overlapMinutes * 60 * 1000);
    const [stuck, reconciliation] = await Promise.all([
      followupEngine.recoverStuckMessages(),
      freshLeadOutreach.reconcileRecent({ since }),
    ]);
    const finishedAt = new Date().toISOString();
    await writeConfig({ [KEYS.lastMaintenanceAt]: finishedAt });
    return { finishedAt, stuckMessagesRecovered: Number(stuck?.count ?? stuck ?? 0), reconciliation };
  }

  async getStatus() {
    const state = await readConfig().catch(() => ({}));
    let summary = this.current;
    if (!summary && state[KEYS.lastRecoverySummary]) {
      try { summary = JSON.parse(state[KEYS.lastRecoverySummary]); } catch { /* ignore corrupt legacy value */ }
    }
    return {
      enabled: config.recovery.enabled,
      running: this.running,
      started: this.started,
      heartbeatSeconds: config.recovery.heartbeatSeconds,
      wakeGapSeconds: config.recovery.wakeGapSeconds,
      lastHeartbeatAt: state[KEYS.heartbeatAt] || null,
      lastStartedAt: state[KEYS.startedAt] || null,
      lastStoppedAt: state[KEYS.stoppedAt] || null,
      lastRecoveryAt: state[KEYS.lastRecoveryAt] || null,
      lastRecoveryReason: state[KEYS.lastRecoveryReason] || null,
      lastRecoveryStatus: state[KEYS.lastRecoveryStatus] || null,
      lastDowntimeMs: state[KEYS.lastDowntimeMs] ? Number(state[KEYS.lastDowntimeMs]) : null,
      lastMaintenanceAt: state[KEYS.lastMaintenanceAt] || null,
      summary,
    };
  }

  async stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.heartbeatTimer = null;
    this.maintenanceTimer = null;
    const stoppedAt = new Date();
    await writeConfig({
      [KEYS.stoppedAt]: stoppedAt.toISOString(),
      [KEYS.heartbeatAt]: stoppedAt.toISOString(),
    }).catch(() => {});
    this.started = false;
  }
}

export { KEYS as RECOVERY_CONFIG_KEYS };
export default new RecoveryCoordinator();
