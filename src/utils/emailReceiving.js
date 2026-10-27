/** Routing is configured outside the app; only explicitly cut-over addresses skip IMAP. */
export function usesCloudflareReceiving(account, env = process.env) {
  const email = String(account?.email || '').trim().toLowerCase();
  return Boolean(email) && String(env.EMAIL_CLOUDFLARE_ACCOUNTS || '').split(',')
    .some(value => value.trim().toLowerCase() === email);
}

export function emailReceivingStatus(account, env = process.env) {
  if (usesCloudflareReceiving(account, env)) {
    return { receivingProvider: 'cloudflare', receivingReady: env.EMAIL_INGRESS_ENABLED === 'true'
      && typeof env.EMAIL_INGRESS_SECRET === 'string' && env.EMAIL_INGRESS_SECRET.length >= 32 };
  }
  return { receivingProvider: account?.imapHost ? 'imap' : 'none' };
}
