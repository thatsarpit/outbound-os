import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sqliteDatabaseUrl } from '../../prisma/database-url.mjs';
import { EMAIL_INGRESS_MAX_BYTES } from './emailIngressSignature.js';

const MAGIC = Buffer.from('OSEM1');
export function inboundEmailSpoolDirectory() {
  const database = sqliteDatabaseUrl().slice('file:'.length);
  return path.join(path.dirname(database), 'private', 'inbound-email');
}

/** Original MIME stays outside public media, encrypted with the backed-up instance key. */
export class InboundEmailSpool {
  constructor({ directory, secret } = {}) {
    this.directory = directory;
    this.secret = secret;
  }
  _key() {
    const secret = this.secret || process.env.LEAD_SYNC_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret || secret.length < 16) throw new Error('Inbound email encryption key is not configured');
    return createHash('sha256').update(`outboundos:inbound-email:v1\0${secret}`).digest();
  }
  _path(name) {
    if (!/^[a-f0-9]{64}\.mime\.enc$/.test(name)) throw new Error('Invalid inbound email object name');
    return path.join(this.directory || inboundEmailSpoolDirectory(), name);
  }
  async store(dedupeKey, bytes) {
    // Partial and recovered MIME use different immutable objects, so a hot
    // database backup can still read the original referenced by its snapshot.
    const digest = createHash('sha256').update(bytes).digest('hex');
    const name = `${createHash('sha256').update(`${dedupeKey}\0${digest}`).digest('hex')}.mime.enc`;
    const target = this._path(name);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this._key(), iv);
    cipher.setAAD(Buffer.from(dedupeKey));
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await chmod(path.dirname(target), 0o700);
    try {
      await writeFile(temporary, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]), { mode: 0o600, flag: 'wx' });
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
    return name;
  }
  async read(name, dedupeKey) {
    const file = await open(this._path(name), 'r');
    let encrypted;
    try {
      const { size } = await file.stat();
      if (size < 33 || size > EMAIL_INGRESS_MAX_BYTES + 33) throw new Error('Invalid encrypted email size');
      const buffer = Buffer.alloc(size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length !== size) throw new Error('Encrypted email size changed');
      encrypted = buffer.subarray(0, length);
    } finally { await file.close(); }
    if (encrypted.length < 33 || !encrypted.subarray(0, 5).equals(MAGIC)) throw new Error('Invalid encrypted email object');
    const decipher = createDecipheriv('aes-256-gcm', this._key(), encrypted.subarray(5, 17));
    decipher.setAAD(Buffer.from(dedupeKey));
    decipher.setAuthTag(encrypted.subarray(17, 33));
    return Buffer.concat([decipher.update(encrypted.subarray(33)), decipher.final()]);
  }
}
