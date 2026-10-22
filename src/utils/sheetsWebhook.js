/** Sheets uses Apps Script web apps, never arbitrary server-side URLs. */
export function sheetsWebhookUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Use a Google Apps Script web app URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.port
    || url.username || url.password || url.hash || !/^\/macros\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/.test(url.pathname)) {
    throw new Error('Use an HTTPS Google Apps Script web app URL');
  }
  return `https://script.google.com${url.pathname}${url.search}`;
}

export async function postSheetsWebhook(value, row) {
  let target = sheetsWebhookUrl(value);
  let method = 'POST';
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(target, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(row) } : {}),
      redirect: 'manual',
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    const next = new URL(location || '', target);
    if (!location || next.protocol !== 'https:' || next.port || next.username || next.password
      || !['script.google.com', 'script.googleusercontent.com'].includes(next.hostname)) {
      throw new Error('Google Apps Script returned an unsafe redirect');
    }
    await response.body?.cancel();
    if ([301, 302, 303].includes(response.status)) method = 'GET';
    const origin = next.hostname === 'script.google.com' ? 'https://script.google.com' : 'https://script.googleusercontent.com';
    target = `${origin}${next.pathname}${next.search}`;
  }
  throw new Error('Google Apps Script returned too many redirects');
}
