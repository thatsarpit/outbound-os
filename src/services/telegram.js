import crypto from 'crypto';
import { Api, TelegramClient } from 'teleproto';
import { NewMessage } from 'teleproto/events/index.js';
import { StringSession } from 'teleproto/sessions/index.js';

import prisma from '../utils/prismaClient.js';
import logger from '../utils/logger.js';
import { isSameZonedDay } from '../utils/workspaceTime.js';

const ENCRYPTION_PREFIX = 'enc:v1:';
const MAX_MESSAGE_LENGTH = 4096;

function getEncryptionKey() {
  const raw = process.env.LEAD_SYNC_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (raw.length < 16) {
    throw new Error('Encryption key too short - set LEAD_SYNC_ENCRYPTION_KEY (32+ chars)');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decrypt(value) {
  if (!value) return '';
  if (!String(value).startsWith(ENCRYPTION_PREFIX)) return String(value);
  const [iv, tag, ciphertext] = String(value).slice(ENCRYPTION_PREFIX.length).split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Stored Telegram credential is malformed');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('Enter a valid phone number with country code');
  }
  return `+${digits}`;
}

function normalizePeer(value) {
  const peer = String(value || '').trim();
  if (!peer) throw new Error('A Telegram @username, phone number, or peer ID is required');
  if (peer.length > 128) throw new Error('Telegram recipient is too long');
  return peer;
}

function publicError(error) {
  const code = String(error?.errorMessage || error?.code || '').toUpperCase();
  if (code.includes('PHONE_CODE_INVALID')) return 'The Telegram verification code is incorrect';
  if (code.includes('PHONE_CODE_EXPIRED')) return 'The Telegram verification code expired; request a new one';
  if (code.includes('PHONE_NUMBER_INVALID')) return 'Telegram rejected this phone number';
  if (code.includes('PASSWORD_HASH_INVALID')) return 'The Telegram two-step verification password is incorrect';
  if (code.includes('FLOOD_WAIT') || code.includes('PEER_FLOOD')) return 'Telegram temporarily rate-limited this account';
  if (code.includes('USERNAME_NOT_OCCUPIED') || code.includes('PEER_ID_INVALID')) return 'Telegram could not find that recipient';
  return error?.message || 'Telegram request failed';
}

// Daily send counters reset at midnight in the workspace's zone.
function isSameWorkspaceDay(a, b = new Date(), timeZone = undefined) {
  return isSameZonedDay(a, b, timeZone);
}

async function disconnectQuietly(client) {
  try {
    await client?.disconnect();
  } catch {
    // A failed login can close its own transport. Nothing else to clean up.
  }
}

function accountJson(account) {
  if (!account) return null;
  const {
    apiHash: _apiHash,
    session: _session,
    pendingSession: _pendingSession,
    phoneCodeHash: _phoneCodeHash,
    ...safe
  } = account;
  return {
    ...safe,
    hasCredentials: Boolean(account.apiHash),
    hasSession: Boolean(account.session),
  };
}

class TelegramService {
  constructor() {
    this.liveClients = new Map();
  }

  createClient(account, { pending = false } = {}) {
    const storedSession = pending ? account.pendingSession : account.session;
    return new TelegramClient(
      new StringSession(decrypt(storedSession)),
      account.apiId,
      decrypt(account.apiHash),
      { connectionRetries: 5, autoReconnect: false },
    );
  }

  async listAccounts() {
    const accounts = await prisma.telegramAccount.findMany({ orderBy: { createdAt: 'asc' } });
    return accounts.map(accountJson);
  }

  async initialize() {
    const accounts = await prisma.telegramAccount.findMany({
      where: { enabled: true, status: 'connected', session: { not: '' } },
      select: { id: true },
    });
    const results = await Promise.allSettled(accounts.map((account) => this.activate(account.id)));
    const connected = results.filter((result) => result.status === 'fulfilled').length;
    if (accounts.length > 0) logger.info(`[Telegram] ${connected}/${accounts.length} account listener(s) ready`);
    return { connected, total: accounts.length };
  }

  async activate(accountId) {
    const account = await prisma.telegramAccount.findUnique({ where: { id: Number(accountId) } });
    if (!account || !account.enabled || !account.session) return false;

    await this.deactivate(account.id);
    const client = this.createClient(account);
    try {
      await client.connect();
      if (!(await client.checkAuthorization())) throw new Error('Telegram session is no longer authorized');
      const handler = (event) => this.handleInbound(account.id, event).catch((error) => {
        logger.warn(`[Telegram] Inbound message failed for account ${account.id}: ${publicError(error)}`);
      });
      client.addEventHandler(handler, new NewMessage({ incoming: true }));
      this.liveClients.set(account.id, { client, handler });
      await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { status: 'connected', lastConnectedAt: new Date(), lastError: null },
      });
      return true;
    } catch (error) {
      await disconnectQuietly(client);
      const message = publicError(error);
      await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { status: 'error', lastError: message },
      }).catch(() => {});
      throw new Error(message);
    }
  }

  async deactivate(accountId) {
    const live = this.liveClients.get(Number(accountId));
    if (!live) return;
    this.liveClients.delete(Number(accountId));
    await disconnectQuietly(live.client);
  }

  async stop() {
    const ids = [...this.liveClients.keys()];
    await Promise.all(ids.map((id) => this.deactivate(id)));
  }

  async handleInbound(accountId, event) {
    if (!event?.isPrivate || !event.message) return;
    const text = String(event.message.message || event.message.text || '').trim();
    if (!text) return;
    const sender = await event.message.getSender().catch(() => null);
    const senderId = event.message.senderId || sender?.id;
    const username = String(sender?.username || '').trim();
    const phone = String(sender?.phone || '').replace(/\D/g, '');
    const identities = [
      senderId ? String(senderId) : '',
      username,
      username ? `@${username}` : '',
      phone,
      phone ? `+${phone}` : '',
    ].filter(Boolean);
    if (identities.length === 0) return;

    const lead = await prisma.lead.findFirst({ where: { telegramPeer: { in: identities } } });
    if (!lead) {
      logger.info(`[Telegram] Ignored inbound message from an unlinked peer on account ${accountId}`);
      return;
    }
    const telegramMessageId = String(event.message.id);
    const createdAt = event.message.date
      ? new Date(Number(event.message.date) * 1000)
      : new Date();
    try {
      await prisma.$transaction([
        prisma.message.create({
          data: {
            leadId: lead.id,
            direction: 'inbound',
            channel: 'telegram',
            telegramAccountId: accountId,
            telegramMessageId,
            content: text,
            status: 'delivered',
            sentAt: createdAt,
            createdAt,
          },
        }),
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            telegramStatus: 'replied',
            assignedTelegramAccountId: accountId,
            lastMessageAt: createdAt,
            repliedAt: createdAt,
            ...(lead.status === 'closed' || lead.status === 'paused' ? {} : { status: 'replied' }),
          },
        }),
      ]);
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
    }
  }

  async beginConnection({ accountId, name, apiId, apiHash, phoneNumber }) {
    let existing = accountId
      ? await prisma.telegramAccount.findUnique({ where: { id: Number(accountId) } })
      : null;
    if (accountId && !existing) throw new Error('Telegram account not found');
    const parsedApiId = Number.parseInt(String(apiId || existing?.apiId || ''), 10);
    if (!Number.isInteger(parsedApiId) || parsedApiId <= 0) throw new Error('A valid Telegram API ID is required');
    const normalizedPhone = normalizePhone(phoneNumber || existing?.phoneNumber);
    if (!existing) {
      existing = await prisma.telegramAccount.findUnique({
        where: { apiId_phoneNumber: { apiId: parsedApiId, phoneNumber: normalizedPhone } },
      });
    }
    const resolvedHash = String(apiHash || '').trim() || (existing ? decrypt(existing.apiHash) : '');
    if (!resolvedHash) throw new Error('Telegram API hash is required');

    const baseData = {
      name: String(name || existing?.name || 'Telegram').trim() || 'Telegram',
      apiId: parsedApiId,
      apiHash: encrypt(resolvedHash),
      phoneNumber: normalizedPhone,
      enabled: true,
      manualOnly: true,
      status: 'disconnected',
      lastError: null,
    };
    const account = existing
      ? await prisma.telegramAccount.update({ where: { id: existing.id }, data: baseData })
      : await prisma.telegramAccount.create({ data: baseData });

    let client;
    try {
      client = new TelegramClient(
        new StringSession(''),
        account.apiId,
        resolvedHash,
        { connectionRetries: 5, autoReconnect: false },
      );
      await client.connect();
      const sent = await client.sendCode(
        { apiId: account.apiId, apiHash: resolvedHash },
        normalizedPhone,
      );
      if (sent.emailRequired || sent.emailCodeSent) {
        throw new Error('This Telegram account requires an email verification step that Outbound OS does not support yet');
      }
      const updated = await prisma.telegramAccount.update({
        where: { id: account.id },
        data: {
          pendingSession: encrypt(client.session.save()),
          phoneCodeHash: encrypt(sent.phoneCodeHash),
          status: 'code_required',
          lastError: null,
        },
      });
      return { account: accountJson(updated), delivery: sent.isCodeViaApp ? 'telegram' : 'sms' };
    } catch (error) {
      const message = publicError(error);
      await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { status: 'error', lastError: message },
      }).catch(() => {});
      throw new Error(message);
    } finally {
      await disconnectQuietly(client);
    }
  }

  async verifyCode(accountId, code) {
    const account = await prisma.telegramAccount.findUnique({ where: { id: Number(accountId) } });
    if (!account) throw new Error('Telegram account not found');
    if (!account.pendingSession || !account.phoneCodeHash) throw new Error('Request a new Telegram code first');
    const phoneCode = String(code || '').replace(/\s/g, '');
    if (!/^\d{4,8}$/.test(phoneCode)) throw new Error('Enter the Telegram verification code');

    let client;
    try {
      client = this.createClient(account, { pending: true });
      await client.connect();
      let user;
      try {
        const authorization = await client.invoke(new Api.auth.SignIn({
          phoneNumber: account.phoneNumber,
          phoneCodeHash: decrypt(account.phoneCodeHash),
          phoneCode,
        }));
        if (authorization instanceof Api.auth.AuthorizationSignUpRequired) {
          throw new Error('Create the Telegram account in the official app before connecting it here');
        }
        user = authorization.user;
      } catch (error) {
        if (String(error?.errorMessage || '').toUpperCase() === 'SESSION_PASSWORD_NEEDED') {
          const updated = await prisma.telegramAccount.update({
            where: { id: account.id },
            data: {
              pendingSession: encrypt(client.session.save()),
              status: 'password_required',
              lastError: null,
            },
          });
          return { account: accountJson(updated), passwordRequired: true };
        }
        throw error;
      }
      const connected = await this.finishConnection(account.id, client, user);
      setTimeout(() => this.activate(account.id).catch(() => {}), 0).unref?.();
      return { account: connected, passwordRequired: false };
    } catch (error) {
      const message = publicError(error);
      await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { lastError: message },
      }).catch(() => {});
      throw new Error(message);
    } finally {
      await disconnectQuietly(client);
    }
  }

  async verifyPassword(accountId, password) {
    const account = await prisma.telegramAccount.findUnique({ where: { id: Number(accountId) } });
    if (!account) throw new Error('Telegram account not found');
    if (account.status !== 'password_required' || !account.pendingSession) {
      throw new Error('Telegram is not waiting for a two-step verification password');
    }
    if (!password) throw new Error('Enter the Telegram two-step verification password');

    let client;
    try {
      client = this.createClient(account, { pending: true });
      await client.connect();
      const user = await client.signInWithPassword(
        { apiId: account.apiId, apiHash: decrypt(account.apiHash) },
        {
          password: async () => String(password),
          onError: async () => true,
        },
      );
      const connected = await this.finishConnection(account.id, client, user);
      setTimeout(() => this.activate(account.id).catch(() => {}), 0).unref?.();
      return { account: connected };
    } catch (error) {
      const message = publicError(error);
      await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { lastError: message },
      }).catch(() => {});
      throw new Error(message);
    } finally {
      await disconnectQuietly(client);
    }
  }

  async finishConnection(accountId, client, user) {
    const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    const updated = await prisma.telegramAccount.update({
      where: { id: accountId },
      data: {
        session: encrypt(client.session.save()),
        pendingSession: '',
        phoneCodeHash: '',
        telegramUserId: user?.id ? String(user.id) : '',
        username: user?.username || '',
        displayName,
        status: 'connected',
        lastError: null,
        lastConnectedAt: new Date(),
      },
    });
    return accountJson(updated);
  }

  async checkConnection(accountId) {
    const account = await prisma.telegramAccount.findUnique({ where: { id: Number(accountId) } });
    if (!account) throw new Error('Telegram account not found');
    if (!account.session) return { connected: false, account: accountJson(account) };

    let client;
    let ownsClient = false;
    try {
      client = this.liveClients.get(account.id)?.client;
      if (!client) {
        client = this.createClient(account);
        ownsClient = true;
        await client.connect();
      }
      const connected = await client.checkAuthorization();
      const updated = await prisma.telegramAccount.update({
        where: { id: account.id },
        data: connected
          ? { status: 'connected', lastConnectedAt: new Date(), lastError: null }
          : { status: 'disconnected', lastError: 'Telegram session is no longer authorized' },
      });
      return { connected, account: accountJson(updated) };
    } catch (error) {
      const message = publicError(error);
      const updated = await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { status: 'error', lastError: message },
      });
      return { connected: false, account: accountJson(updated) };
    } finally {
      if (ownsClient) await disconnectQuietly(client);
    }
  }

  async sendMessage({ accountId, peer, message }) {
    let account = accountId
      ? await prisma.telegramAccount.findUnique({ where: { id: Number(accountId) } })
      : await prisma.telegramAccount.findFirst({
          where: { enabled: true, status: 'connected', session: { not: '' } },
          orderBy: [{ sentToday: 'asc' }, { id: 'asc' }],
        });
    if (!account || !account.enabled || account.status !== 'connected' || !account.session) {
      throw new Error('Choose a connected Telegram account');
    }
    const recipient = normalizePeer(peer);
    const text = String(message || '').trim();
    if (!text) throw new Error('Message cannot be empty');
    if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Telegram messages cannot exceed ${MAX_MESSAGE_LENGTH} characters`);

    const now = new Date();
    if (!isSameWorkspaceDay(account.lastResetAt, now)) {
      account = await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { sentToday: 0, lastResetAt: now },
      });
    }
    if (account.sentToday >= account.dailyLimit) {
      throw new Error(`This Telegram account reached its manual daily limit of ${account.dailyLimit}`);
    }

    let client;
    try {
      client = this.createClient(account);
      await client.connect();
      if (!(await client.checkAuthorization())) throw new Error('Telegram session is no longer authorized');
      const sent = await client.sendMessage(recipient, { message: text });
      await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { sentToday: { increment: 1 }, lastConnectedAt: now, lastError: null },
      });
      return {
        accountId: account.id,
        peer: recipient,
        messageId: sent?.id == null ? '' : String(sent.id),
        sentAt: now,
      };
    } catch (error) {
      const messageText = publicError(error);
      logger.warn(`[Telegram] Manual send failed for account ${account.id}: ${messageText}`);
      await prisma.telegramAccount.update({
        where: { id: account.id },
        data: { lastError: messageText },
      }).catch(() => {});
      throw new Error(messageText);
    } finally {
      await disconnectQuietly(client);
    }
  }

  async disconnect(accountId) {
    const account = await prisma.telegramAccount.findUnique({ where: { id: Number(accountId) } });
    if (!account) throw new Error('Telegram account not found');
    let client;
    try {
      await this.deactivate(account.id);
      if (account.session) {
        client = this.createClient(account);
        await client.connect();
        if (await client.checkAuthorization()) await client.logOut();
      }
    } catch (error) {
      logger.warn(`[Telegram] Remote logout failed for account ${account.id}: ${publicError(error)}`);
    } finally {
      await disconnectQuietly(client);
    }
    const updated = await prisma.telegramAccount.update({
      where: { id: account.id },
      data: {
        session: '', pendingSession: '', phoneCodeHash: '', status: 'disconnected',
        telegramUserId: '', username: '', displayName: '', lastError: null,
      },
    });
    return accountJson(updated);
  }
}

const telegramService = new TelegramService();

export { accountJson, isSameWorkspaceDay, normalizePeer, normalizePhone, publicError };
export default telegramService;
