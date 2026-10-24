import relay, { storeIncomingEmail, reconcileStoredMail } from './worker.js';
import { kvMailSpool } from './kv-spool.js';

function bindings(env) {
  return { ...env, MAIL_SPOOL: kvMailSpool(env.MAIL_SPOOL_KV) };
}

export default {
  async email(message, env) {
    let key;
    try {
      key = await storeIncomingEmail(message, bindings(env));
    } catch {
      // Explicitly reject rather than silently consume mail when Free storage
      // is unavailable. The sender must know this message was not accepted.
      console.error('Inbound email could not be retained; rejecting delivery.');
      message.setReject('The receiving service is temporarily unavailable. Please resend later.');
      return;
    }
    if (!key) return;
    try {
      // Allow cross-region KV visibility before the first delivery attempt.
      await env.MAIL_DELIVERIES.send({ action: 'PutObject', object: { key } }, { delaySeconds: 60 });
    } catch {
      // The awaited KV put already retained the original. Scheduled recovery
      // must still find it if the separate queue operation fails.
      console.error('Inbound email retained privately; scheduled recovery will retry enqueue.');
    }
  },
  async queue(batch, env) { await relay.queue(batch, bindings(env)); },
  async scheduled(_controller, env) {
    if (env.RELAY_ENABLED === 'true') await reconcileStoredMail(bindings(env));
  },
  async fetch() { return new Response('Not found', { status: 404 }); },
};
