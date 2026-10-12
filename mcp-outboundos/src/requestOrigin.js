/** Use the same proxy trust boundary as Express's client IP and protocol. */
export function requestOrigin(req) {
  const trust = req.app.get('trust proxy fn');
  const trusted = typeof trust === 'function' && trust(req.socket.remoteAddress, 0);
  const forwardedHost = trusted && req.get('x-forwarded-host');
  const host = (forwardedHost || req.get('host') || '').split(',')[0].trim();
  try {
    if (/[\s"'<>\\]/.test(host)) throw new Error();
    const url = new URL(`${req.protocol}://${host}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    const error = new Error('Invalid request origin');
    error.status = 400;
    throw error;
  }
}
