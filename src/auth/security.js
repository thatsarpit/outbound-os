import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MIN_MAXMEM = 64 * 1024 * 1024;

function getScryptMaxmem(cost, blockSize, parallelization) {
  const required = 128 * cost * blockSize * Math.max(parallelization, 1);
  return Math.max(required * 2, SCRYPT_MIN_MAXMEM);
}

export async function hashPassword(password) {
  const value = String(password || '');
  if (!value) throw new Error('Password is required');

  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(value, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    // Node/OpenSSL needs headroom above the nominal scrypt memory formula.
    maxmem: getScryptMaxmem(SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION),
  });

  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt,
    Buffer.from(derivedKey).toString('hex'),
  ].join('$');
}

export async function verifyPassword(password, storedHash) {
  const value = String(password || '');
  const encoded = String(storedHash || '');
  if (!value || !encoded) return false;

  const [algorithm, costRaw, blockSizeRaw, parallelizationRaw, salt, expectedHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;

  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelizationRaw);
  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelization)) return false;

  const derivedKey = await scrypt(value, salt, Buffer.from(expectedHex, 'hex').length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: getScryptMaxmem(cost, blockSize, parallelization),
  });

  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === Buffer.from(derivedKey).length
    && timingSafeEqual(expected, Buffer.from(derivedKey));
}

export function createSessionToken(size = 32) {
  return randomBytes(size).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}
