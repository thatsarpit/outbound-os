/** Cookie-authenticated mutations must originate from a trusted browser page. */
export function browserMutationGuard(allowedOrigins) {
  return (req, res, next) => {
    const inboundDelivery = req.method === 'POST' && /^\/webhooks\/inbound\/[^/]+\/?$/i.test(req.path);
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.headers.cookie
      || /^Bearer /i.test(req.headers.authorization || '') || inboundDelivery) return next();
    const ownOrigin = `${req.protocol}://${req.get('host')}`;
    const origin = req.get('origin');
    if (origin && (origin === ownOrigin || allowedOrigins.includes(origin))) return next();
    if (!origin && req.get('sec-fetch-site') === 'same-origin') return next();
    return res.status(403).json({ error: 'Cookie-authenticated changes must come from a trusted origin' });
  };
}
