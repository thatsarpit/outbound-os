import log from './logger.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { personalControl } from './personalOAuth.js';

export const mcpRequestContext = new AsyncLocalStorage();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN;

if (!SERVICE_TOKEN) {
  log.warn('MCP_SERVICE_TOKEN not set — backend calls will fail with 401');
}

/**
 * Call the Outbound OS REST API.
 *
 * @param {string} method  HTTP verb
 * @param {string} path    e.g. "/api/leads"
 * @param {object} [opts]
 * @param {object} [opts.body]   JSON body (POST/PATCH/PUT/DELETE)
 * @param {Record<string,string>} [opts.query]  URL query params
 * @returns {Promise<{status: number, data: any}>}
 */
export async function api(method, path, opts = {}) {
  const url = new URL(path, BACKEND_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const context = mcpRequestContext.getStore();
  let credential = SERVICE_TOKEN;
  if (context?.personalToken) {
    // Resource tokens never authenticate directly at the backend. The private
    // control channel issues a short-lived, operation-bound delegation instead.
    const delegated = await personalControl('delegate', {
      token: context.personalToken, tool: context.tool, method: method.toUpperCase(), path: url.pathname,
    });
    credential = delegated.assertion;
  }
  const headers = {
    Authorization: `Bearer ${credential}`,
    'Content-Type': 'application/json',
  };

  const fetchOpts = { method, headers };
  if (opts.body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  log.debug(`→ ${method} ${url.pathname}${url.search}`);
  const res = await fetch(url, fetchOpts);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    log.warn(`← ${res.status} ${url.pathname}: ${msg}`);
    throw Object.assign(new Error(msg), { status: res.status, data });
  }

  log.debug(`← ${res.status} ${url.pathname}`);
  return { status: res.status, data };
}

export const get    = (path, query) => api('GET', path, { query });
export const post   = (path, body, query) => api('POST', path, { body, query });
export const patch  = (path, body) => api('PATCH', path, { body });
export const put    = (path, body) => api('PUT', path, { body });
export const del    = (path, body) => api('DELETE', path, { body });
