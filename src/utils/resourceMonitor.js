/**
 * Resource Monitor
 * Tracks CPU, memory, uptime, and queue depth.
 * Exposes metrics via /api/system/health and /api/system/resources
 */
import os from 'os';
import path from 'node:path';
import { statfsSync } from 'node:fs';
import { sqliteDatabaseUrl } from '../../prisma/database-url.mjs';

class ResourceMonitor {
  constructor() {
    this._startTime = Date.now();
    this._msgQueue = { pending: 0, failed: 0, processed: 0 };
  }

  // ── Queue tracking ─────────────────────────────────────────
  recordMessageQueued()    { this._msgQueue.pending++; }
  recordMessageProcessed() { this._msgQueue.pending = Math.max(0, this._msgQueue.pending - 1); this._msgQueue.processed++; }
  recordMessageFailed()    { this._msgQueue.pending = Math.max(0, this._msgQueue.pending - 1); this._msgQueue.failed++; }
  getQueueStats()          { return { ...this._msgQueue }; }

  // ── CPU snapshot ───────────────────────────────────────────
  getCPUUsage() {
    try {
      const cpus = os.cpus();
      const total = cpus.reduce((sum, cpu) => {
        const t = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        return { user: sum.user + cpu.times.user, idle: sum.idle + cpu.times.idle, total: sum.total + t };
      }, { user: 0, idle: 0, total: 0 });
      const busy = ((total.total - total.idle) / total.total * 100).toFixed(1);
      return parseFloat(busy);
    } catch { return 0; }
  }

  // ── Memory snapshot ────────────────────────────────────────
  getMemoryUsage() {
    const total = os.totalmem();
    const free  = os.freemem();
    const used  = total - free;
    const proc  = process.memoryUsage();
    return {
      systemTotal:   Math.round(total / 1024 / 1024),
      systemUsed:    Math.round(used / 1024 / 1024),
      systemFree:    Math.round(free / 1024 / 1024),
      systemPercent: Math.round(used / total * 100),
      processRss:    Math.round(proc.rss / 1024 / 1024),
      processHeap:   Math.round(proc.heapUsed / 1024 / 1024),
    };
  }

  // The database can live on a different mount from the container root.
  getDiskUsage() {
    try {
      const directory = path.dirname(sqliteDatabaseUrl().slice('file:'.length));
      const { bsize, blocks, bfree, bavail } = statfsSync(directory);
      const used = blocks - bfree;
      const mib = count => Math.floor(count * bsize / 1024 ** 2);
      return {
        available: true, total: mib(blocks), used: mib(used), free: mib(bavail),
        percent: used + bavail > 0 ? Math.ceil(100 * used / (used + bavail)) : 0,
      };
    } catch {
      return { available: false, total: 0, used: 0, free: 0, percent: 0 };
    }
  }

  // ── Full health snapshot ────────────────────────────────────
  getHealth() {
    const uptimeSec = Math.round((Date.now() - this._startTime) / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;

    return {
      status:  'ok',
      uptime:  `${h}h ${m}m ${s}s`,
      uptimeSec,
      cpu:     { usage: this.getCPUUsage(), cores: os.cpus().length },
      memory:  this.getMemoryUsage(),
      disk:    this.getDiskUsage(),
      queue:   this.getQueueStats(),
      node:    process.version,
      platform: os.platform(),
      loadAvg: os.loadavg().map(l => l.toFixed(2)),
    };
  }
}

// Singleton
const resourceMonitor = new ResourceMonitor();
export default resourceMonitor;
