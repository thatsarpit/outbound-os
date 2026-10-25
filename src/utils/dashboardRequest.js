/** Reserve service endpoints before deciding whether a request serves the SPA. */
export function isDashboardFileRequest(req) {
  return ['GET', 'HEAD'].includes(req.method)
    && !/^\/(?:api|webhook)(?:\/|$)/i.test(req.path)
    && !/^\/(?:health|healthz)\/?$/i.test(req.path);
}
