/**
 * Resource Monitor
 * Tracks CPU, memory, uptime, and queue depth.
 * Exposes metrics via /api/system/health and /api/system/resources
 */
import os from 'os';
import { execSync } from 'child_process';

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

  // ── Disk snapshot (root partition) ─────────────────────────
  getDiskUsage() {
    try {
      const out = execSync("df -m / | tail -1 | awk '{print $2,$3,$4,$5}'").toString().trim();
      const [total, used, free, pct] = out.split(' ');
      return { total: parseInt(total), used: parseInt(used), free: parseInt(free), percent: parseInt(pct) };
    } catch { return { total: 0, used: 0, free: 0, percent: 0 }; }
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
