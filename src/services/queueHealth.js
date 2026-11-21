import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';

export const QUEUE_SCAN_INTERVALS = Object.freeze({
  whatsapp: 2,
  email: 2,
  imessage: 1,
  campaigns: 1,
});

export const OVERDUE_GRACE_MINUTES = 5;

const scanKey = worker => 'runtime.queue.' + worker + '.last_scan_at';

// A scan is recorded after the worker successfully reads its due work,
// including an empty queue. Targeted dispatch calls do not count.
export async function recordQueueScan(worker, db = prisma) {
  const key = scanKey(worker);
  const value = new Date().toISOString();
  try {
    await db.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  } catch (error) {
    logger.warn('Could not record ' + worker + ' queue scan: ' + error.message);
  }
}

export async function queueWorkerStatus(db) {
  const workerEntries = Object.entries(QUEUE_SCAN_INTERVALS);
  const records = await db.systemConfig.findMany({
    where: { key: { in: workerEntries.map(([worker]) => scanKey(worker)) } },
  });
  const scans = new Map(records.map(row => [row.key, row.value]));
  const now = Date.now();

  return workerEntries.map(([worker, intervalMinutes]) => {
    const scan = Date.parse(scans.get(scanKey(worker)));
    const valid = Number.isFinite(scan) && scan <= now;
    // Allow a late tick before marking a scan stale.
    const staleAfterMs = 3 * intervalMinutes * 60_000;
    return {
      worker,
      intervalMinutes,
      lastScanAt: valid ? new Date(scan).toISOString() : null,
      state: !valid ? 'not_recorded' : now - scan >= staleAfterMs ? 'stale' : 'recent',
    };
  });
}
