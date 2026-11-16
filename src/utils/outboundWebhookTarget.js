import { lookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

const internal = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
]) internal.addSubnet(network, prefix);

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [network, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  internal.addSubnet(network, prefix, 'ipv6');
}

function isPublic(address) {
  const family = isIP(address);
  if (family === 4) return !internal.check(address, 'ipv4');
  // IPv6 local, mapped, translated and special-purpose addresses cannot be used to reach an internal IPv4 service.
  return family === 6 && globalV6.check(address, 'ipv6') && !internal.check(address, 'ipv6');
}

export class OutboundWebhookTargetError extends Error {}

export function parseOutboundWebhookTarget(input, allowed = process.env.OUTBOUND_WEBHOOK_TRUSTED_ORIGINS) {
  let url;
  try { url = new URL(input); }
  catch { throw new OutboundWebhookTargetError('Enter a valid webhook URL.'); }
  const trusted = Boolean(allowed?.split(',').some(origin => origin.trim().replace(/\/$/, '') === url.origin));
  if (url.protocol !== 'https:' && !(trusted && url.protocol === 'http:')) {
    throw new OutboundWebhookTargetError('Webhook destinations must use HTTPS unless their origin is explicitly trusted.');
  }
  if (url.username || url.password || url.hash) {
    throw new OutboundWebhookTargetError('Remove embedded credentials and fragments from the webhook URL.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const localName = !hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(hostname);
  if (!trusted && (isIP(hostname) ? !isPublic(hostname) : localName)) {
    throw new OutboundWebhookTargetError('Webhook destinations must use public addresses unless their origin is explicitly trusted.');
  }
  return { url, trusted };
}

export async function postOutboundWebhook(input, headers, body, { lookupHost = lookup, allowed } = {}) {
  const { url, trusted } = parseOutboundWebhookTarget(input, allowed);
  const request = url.protocol === 'https:' ? https.request : http.request;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      agent: false,
      signal: AbortSignal.timeout(8000),
      lookup(host, options, callback) {
        // Return the vetted addresses directly to the socket. A second DNS
        // lookup between validation and connection would permit DNS rebinding.
        lookupHost(host, { all: true }, (error, addresses) => {
          if (error) return callback(error);
          if (!trusted && addresses.some(({ address }) => !isPublic(address))) {
            return callback(new OutboundWebhookTargetError('The webhook hostname resolves to a non-public address.'));
          }
          const records = addresses.filter(({ family }) => !options.family || family === options.family);
          if (!records.length) return callback(new Error('The webhook hostname has no usable address.'));
          if (options.all) return callback(null, records);
          return callback(null, records[0].address, records[0].family);
        });
      },
    }, response => {
      // The status is sufficient. Never follow redirects or retain a response body.
      resolve(response.statusCode);
      response.destroy();
    });
    req.on('error', reject);
    req.end(body);
  });
}
