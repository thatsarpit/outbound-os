import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { initializeShadowInbox, HermesShadowInbox } from '../../src/services/hermesShadowInbox.js';
import { HermesEventStore } from '../../src/services/hermesEventBridge.js';

export const NOW = 1800000000000;
export const scope = { secret: 'synthetic-harness-ingress-key-at-least-32', source: 'harness-crm', route: '/hooks/shadow', leaseMs: 1000, maxInFlight: 2 };
export const completionSecret = 'synthetic-harness-completion-key-at-least-32';
export const storeOptions = { quietMs: 1, leaseMs: 1000 };
export function openDatabase(filename, journal = 'WAL') {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=${journal}; PRAGMA synchronous=FULL`);
  chmodSync(filename, 0o600);
  return db;
}
export function harness({ journal = 'WAL' } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'hermes-process-'));
  chmodSync(directory, 0o700);
  const senderFile = path.join(directory, 'sender.db'), receiverFile = path.join(directory, 'receiver.db');
  let db, receiver;
  const children = [];
  try {
    db = openDatabase(senderFile, journal);
    const root = new URL('../../prisma/migrations/', import.meta.url);
    for (const name of readdirSync(root).sort()) {
      const file = new URL(`${name}/migration.sql`, root);
      if (existsSync(file)) db.exec(readFileSync(file, 'utf8'));
    }
    receiver = openDatabase(receiverFile, journal);
    initializeShadowInbox(receiver);
    db.prepare('INSERT INTO Lead(name,mobile,updatedAt) VALUES (?,?,?)').run('Synthetic harness', 'no-phone:harness', NOW);
  } catch (error) { receiver?.close(); db?.close(); rmSync(directory, { recursive: true, force: true }); throw error; }
  return { directory, senderFile, receiverFile, db, receiver, children, journal,
    store: new HermesEventStore(db, storeOptions), inbox: new HermesShadowInbox(receiver, scope),
    message() {
      const id = Number(db.prepare(`INSERT INTO Message(leadId,content,channel,direction,status,waAccount)
        VALUES (1,'Synthetic content','whatsapp','inbound','delivered',1)`).run().lastInsertRowid);
      db.prepare('UPDATE HermesInboundEvent SET createdAt=? WHERE messageId=?').run(NOW - 100, id);
      return id;
    },
    async close() {
      const settled = await Promise.allSettled(children.map(child => child.stop()));
      receiver.close(); db.close();
      // Never remove a database while a child might still be writing it.
      const failed = settled.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
export function signedBatch(batch, now = NOW) {
  const body = Buffer.from(batch.body), timestamp = String(Math.floor(now / 1000));
  return { body, source: scope.source, route: scope.route, now, headers: {
    'X-Request-ID': batch.id, 'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Signature-V2': createHmac('sha256', scope.secret).update(timestamp + '.').update(body).digest('hex'),
  } };
}
export function completeContext(s) {
  return { available: true, complete: true, source: s.source, conversationKey: s.conversationKey,
    channel: s.channel, accountId: s.accountId, coveredEventIds: s.events.map(e => e.id), data: { history: 'Synthetic history' } };
}

// IPC messages are buffered: a fast child cannot race a subsequently registered waiter.
export function actor(f, mode) {
  const child = fork(new URL('../fixtures/hermesProcessActor.js', import.meta.url), [mode, f.senderFile, f.receiverFile, f.journal], {
    execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { PATH: process.env.PATH, TMPDIR: f.directory, NODE_ENV: 'test', DATABASE_URL: `file:${f.senderFile}` },
  });
  const messages = [], waiters = new Set();
  let stderr = '', ended = false, exitInfo;
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-8000); });
  const flush = () => { for (const waiter of [...waiters]) waiter(); };
  child.on('message', message => { messages.push(message); flush(); });
  child.on('error', error => { messages.push({ type: 'fatal', error: error.message }); flush(); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => {
    ended = true; exitInfo = { code, signal }; resolve(exitInfo); flush();
  }));
  const api = { pid: child.pid,
    send(value) { child.send(value); },
    wait(type, timeoutMs = 6000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${mode}:${type}; ${stderr}`)), timeoutMs);
        const finish = (error, value) => { clearTimeout(timer); waiters.delete(check); error ? reject(error) : resolve(value); };
        const check = () => {
          const fatal = messages.find(m => m.type === 'fatal');
          if (fatal) return finish(new Error(fatal.error));
          const index = messages.findIndex(m => m.type === type);
          if (index >= 0) return finish(null, messages.splice(index, 1)[0]);
          if (ended) finish(new Error(`Child exited before ${type}: ${JSON.stringify(exitInfo)} ${stderr}`));
        };
        waiters.add(check); check();
      });
    },
    async stop() {
      if (!ended) child.kill('SIGKILL');
      let timer;
      try { return await Promise.race([exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Child ${child.pid} did not exit`)), 4000);
      })]); } finally { clearTimeout(timer); }
    },
  };
  f.children.push(api);
  return api;
}
