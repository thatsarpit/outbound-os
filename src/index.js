import cron from 'node-cron';
import config from './config.js';
import logger from './utils/logger.js';
import whatsappManager from './services/whatsapp.js';
import followupEngine from './services/followup.js';
import leadScorer from './services/leadScorer.js';
import emailService from './services/emailService.js';
import orderNotifier from './services/orderNotifier.js';
import imessageService from './services/imessage.js';
import telegramService from './services/telegram.js';
import interventionEngine from './services/interventionEngine.js';
import reportingService from './services/reportingService.js';
import recoveryCoordinator from './services/recoveryCoordinator.js';
import websiteIntegrationSync from './services/websiteIntegrationSync.js';
import { startApiServer, broadcastEvent } from './api.js';
import prisma from './utils/prismaClient.js';
import { ensureDefaultAdmin } from './auth/rbac.js';

/**
 * Outbound OS — B2B Sales Automation Platform
 * Main entry point that orchestrates all services.
 *
 * Instance-level feature flags (set via env or docker-compose):
 *  INSTANCE_NAME      — e.g. "team" or "partner" — embedded in logs + branding
 *
 * Schedule:
 *  - Message queue:  every 2 min
 *  - Retry failed:   every 15 min
 *  - Counter reset:  midnight IST
 */

const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

async function main() {
  logger.info('='.repeat(50));
  logger.info(`🚀 Outbound OS Starting... [instance: ${INSTANCE_NAME}]`);
  logger.info('='.repeat(50));

  try {
    // ── Step 0: Ensure default admin user exists ──
    await ensureDefaultAdmin();

    // ── Step 0b: Restore persisted pause flag so a crash-while-paused
    // instance doesn't silently start sending again on the next boot. ──

    // ── Step 1: Initialize WhatsApp clients ──
    logger.info('Step 1/4: Initializing WhatsApp...');
    await whatsappManager.initialize();

    // Recover any messages stuck in 'sending' from a prior crash
    await followupEngine.recoverStuckMessages();

    // ── Step 2: Reply detection ──
    // Inbound WhatsApp replies and delivery receipts now arrive over the Cloud
    // API webhook (POST /webhook/whatsapp-cloud in api.js), not from client
    // events, so there is no listener to wire up here. Email replies are still
    // polled over IMAP by emailService.
    logger.info('Step 2/4: Reply detection is webhook-driven (no listener wiring needed)');

    logger.info('Step 3/4: Starting schedulers...');

    // The website's Cloudflare inbox persists consented enquiries and Brevo
    // callbacks while this Mac is asleep. Reconcile it immediately on boot,
    // then every two minutes; acknowledged IDs make every replay idempotent.
    await websiteIntegrationSync.run().catch((error) =>
      logger.warn(`Website integration startup sync skipped: ${error.message}`));
    cron.schedule('*/2 * * * *', async () => {
      try { await websiteIntegrationSync.run(); }
      catch (error) { logger.error(`Website integration sync error: ${error.message}`); }
    });

    // Process message queue every 2 minutes (priority sorted: HOT > WARM > COLD)
    cron.schedule('*/2 * * * *', async () => {
      try {
        await followupEngine.processQueue();
      } catch (error) {
        logger.error(`Message processing cron error: ${error.message}`);
      }
    });

    // Retry failed messages every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      try {
        await followupEngine.retryFailed();
      } catch (error) {
        logger.error(`Retry cron error: ${error.message}`);
      }
    });

    // Reap undelivered first messages every 15 minutes — any initial WA send
    // stuck at single tick >24h gets its queued follow-ups cancelled and the
    // lead switched to email. Stops quota waste on dead numbers.
    cron.schedule('*/15 * * * *', async () => {
      try {
        await followupEngine.reapUndeliveredFirstMessages();
      } catch (error) {
        logger.error(`Undelivered reaper cron error: ${error.message}`);
      }
    });

    // ── 5 Timezone-Aware Outreach Windows ──────────────────────────────
    // Each cron fires at an IST time that matches 9:30 AM for that region

    // Timezone-window outreach was removed: outreach is now driven deliberately
    // through MCP/agent calls rather than five daily blasts against the whole
    // database. Fresh leads still get an immediate first touch via
    // freshLeadOutreach, which is time-critical (HOT tier).
    // ───────────────────────────────────────────────────────────────────

    // ── Boot-time catch-up of missed outreach windows ──
    // If the container crashed during a window or was offline when it fired,
    // queue what the window would have queued — capped by today's remaining
    // budget on each account. Without this, every crash steals a whole
    // day's worth of new outreach from that timezone bucket.
    // ───────────────────────────────────────────────────────────────────

    // Recalculate all lead scores daily at 6 AM IST
    cron.schedule('0 6 * * *', async () => {
      logger.info('📊 Running daily lead score recalculation...');
      try {
        await leadScorer.recalculateAll();
      } catch (error) {
        logger.error(`Score recalculation error: ${error.message}`);
      }
    }, { timezone: config.businessHours.timezone });

    // ── Task Due Alerts — every 15 minutes ──
    // Push SSE event for tasks due within next 30 minutes (so agent has time to act)
    cron.schedule('*/15 * * * *', async () => {
      try {
        const soon = new Date(Date.now() + 30 * 60 * 1000); // 30 min window
        const overdueTasks = await prisma.leadTask.findMany({
          where: { done: false, dueAt: { lte: soon } },
          include: { lead: { select: { id: true, name: true } } },
          orderBy: { dueAt: 'asc' },
          take: 20,
        });
        for (const task of overdueTasks) {
          broadcastEvent('task_due', {
            taskId: task.id,
            leadId: task.leadId,
            leadName: task.lead?.name || 'Unknown',
            title: task.title,
            dueAt: task.dueAt,
            overdue: new Date(task.dueAt) < new Date(),
          });
        }
        if (overdueTasks.length > 0) {
          logger.info(`⏰ Task alert: ${overdueTasks.length} task(s) due soon`);
        }
      } catch (err) {
        logger.error(`Task due cron error: ${err.message}`);
      }
    });

    // Reset daily message counters at midnight IST
    cron.schedule('0 0 * * *', async () => {
      await whatsappManager.resetDailyCounters();
      await emailService.resetDailyCounters();
      // iMessage daily counter reset
      try {
        const { default: imessageService } = await import('./services/imessage.js');
        await imessageService.resetDailyCounters();
      } catch {}
    }, { timezone: config.businessHours.timezone });

    // Ping iMessage (BlueBubbles) accounts every 5 minutes to update online status
    cron.schedule('*/5 * * * *', async () => {
      try {
        const { default: imessageService } = await import('./services/imessage.js');
        await imessageService.pingAll();
      } catch (err) {
        logger.debug(`[iMessage] Ping cron: ${err.message}`);
      }
    });

    // Process staged iMessages independently of WhatsApp and email.
    cron.schedule('* * * * *', async () => {
      try { await imessageService.processQueue(); }
      catch (error) { logger.error(`iMessage queue processing error: ${error.message}`); }
    });

    // Prune ActivityLog rows older than 30 days (runs at 3 AM IST daily)
    cron.schedule('0 3 * * *', async () => {
      try {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const { count } = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
        if (count > 0) logger.info(`🗑️  Pruned ${count} old activity log rows`);
      } catch (err) {
        logger.error(`Activity log prune failed: ${err.message}`);
      }
    }, { timezone: config.businessHours.timezone });

    // ── Email Automation Cron Jobs ──

    // The daily email batch selector was removed with the rest of the automatic
    // outreach. The email queue processor below still runs, so anything an
    // agent or the dashboard enqueues is delivered normally.

    // Retry order notifications that failed, every 30 minutes. Without this a
    // transient outage leaves the customer permanently uninformed about their
    // own order — the row just sits at 'failed'.
    cron.schedule('*/30 * * * *', async () => {
      try {
        await orderNotifier.retryFailedNotifications();
      } catch (error) {
        logger.error(`Order notification retry error: ${error.message}`);
      }
    });

    // Process email queue every 2 minutes (parallel to WA queue)
    cron.schedule('*/2 * * * *', async () => {
      try {
        await emailService.processEmailQueue();
      } catch (error) {
        logger.error(`Email queue processing error: ${error.message}`);
      }
    });

    // Poll IMAP for email replies every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await emailService.syncAllReplies();
      } catch (error) {
        logger.error(`Email IMAP sync error: ${error.message}`);
      }
    });

    const reportSchedules = reportingService.getSchedules();

    cron.schedule(reportSchedules.weekly.cron, async () => {
      try {
        await reportingService.sendReport({ type: 'weekly' });
      } catch (error) {
        logger.error(`Weekly report cron error: ${error.message}`);
      }
    }, { timezone: reportSchedules.weekly.timezone });

    cron.schedule(reportSchedules.monthly.cron, async () => {
      try {
        await reportingService.sendReport({ type: 'monthly' });
      } catch (error) {
        logger.error(`Monthly report cron error: ${error.message}`);
      }
    }, { timezone: reportSchedules.monthly.timezone });

    // ── Smart Intervention: SLA breach check every 30 minutes ──
    cron.schedule('*/30 * * * *', async () => {
      try {
        await interventionEngine.checkSLABreaches();
      } catch (error) {
        logger.error(`SLA check error: ${error.message}`);
      }
    });

    const paceMode = config.whatsapp.warmupMode ? 'WARMUP' : 'CRUISE';
    const dailyLim = config.whatsapp.warmupMode
      ? config.whatsapp.warmupLimit
      : config.whatsapp.maxMessagesPerDay;

    logger.info(`📤 WA message queue: every 2 min (priority: HOT→WARM→COLD)`);
    logger.info(`📧 Email queue: every 2 min | IMAP sync: every 5 min`);
    logger.info(`📬 Daily email selection: 06:05 IST + startup catch-up (two-domain rotation)`);
    logger.info(`💬 iMessage queue: every 1 min`);
    logger.info(`📨 Weekly report: ${reportSchedules.weekly.description}`);
    logger.info(`📨 Monthly report: ${reportSchedules.monthly.description}`);
    logger.info(`🔄 Failed retry: every 15 min`);
    logger.info(`📅 DB outreach: daily 10 AM IST (25 leads/batch)`);
    logger.info(`📊 Score recalc: daily 6 AM IST`);
    logger.info(`🕐 Counter reset: midnight IST (WA + Email)`);
    logger.info(`📊 Pace: ${paceMode} — ${dailyLim} WA msgs/day/account, ${config.whatsapp.hourlyLimit}/hr`);
    logger.info(`⏱️  Delays: ${config.whatsapp.minDelay / 1000}–${config.whatsapp.maxDelay / 1000}s between WA msgs`);

    // ── Step 5: Start API server ──
    logger.info('Step 4/4: Starting API server...');
    global.__httpServer = startApiServer();
    telegramService.initialize().catch((error) =>
      logger.warn(`[Telegram] Listener startup skipped: ${error.message}`));

    // Persistent startup/wake recovery is part of boot, not a best-effort
    // timeout. It repairs channel queues left partially created by a crash.
    logger.info('Starting persistent runtime recovery...');
    const recovery = await recoveryCoordinator.start();
    logger.info(`🔁 Runtime recovery: ${recovery?.lastRecoveryStatus || recovery?.summary?.status || 'ready'}`);

    logger.info('='.repeat(50));
    logger.info('✅ Outbound OS is running!');
    logger.info(`📊 Dashboard API: http://localhost:${config.api.port}`);
    logger.info('='.repeat(50));


  } catch (error) {
    logger.error(`Fatal startup error: ${error.message}`);
    process.exit(1);
  }
}

// ── Graceful shutdown ──
async function gracefulShutdown(signal) {
  logger.info(`${signal} received — shutting down Outbound OS gracefully...`);

  // Stop accepting new HTTP connections (give in-flight requests up to 5s)
  if (global.__httpServer) {
    await new Promise(resolve => global.__httpServer.close(resolve)).catch(() => {});
  }

  try {
    await recoveryCoordinator.stop().catch(() => {});
    await whatsappManager.destroy().catch(() => {});
    await telegramService.stop().catch(() => {});
    await prisma.$disconnect().catch(() => {}); // Flush any pending DB writes
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
  }

  logger.info('Outbound OS shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason?.stack || reason}`);
});

// Hardening: in production the container was restarting ~100×/day because an
// unhandled 'error' event on an ImapFlow socket (ETIMEOUT, etc.) tore the
// process down. Node's default uncaughtException behaviour is to crash; we
// log and continue so a single bad IMAP server can't take WhatsApp + the API
// + every cron with it. EventEmitters that emit 'error' must still attach
// their own listener (see emailService.js) — this is the last-resort net.
process.on('uncaughtException', (err, origin) => {
  logger.error(`Uncaught exception [origin=${origin}]: ${err?.stack || err}`);
  // Best-effort: surface to dashboard so operator notices.
  try {
    // Lazy import to avoid circular deps.
    import('./utils/activityLog.js').then(({ default: activityLog, EVENT_TYPES }) => {
      activityLog.add(EVENT_TYPES?.SYSTEM_ERROR || 'system_error', `Uncaught: ${err?.message || err}`, {
        origin,
        stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
      });
    }).catch(() => {});
  } catch (_) { /* don't let logging fail the handler */ }
});

main();
