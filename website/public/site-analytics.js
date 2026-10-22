/* Optional GA4 measurement. No Google requests before visitor consent. */
(() => {
  const script = document.currentScript;
  const id = script?.dataset.gaId;
  const hosts = (script?.dataset.gaHosts || '').split(',');
  if (!/^G-[A-Z0-9]+$/.test(id || '') || !hosts.includes(location.hostname) || window.siteAnalytics) return;
  const key = 'site-analytics-consent-v1';
  let consent = null;
  let loaded = false;
  let lastPath = null;
  try { consent = localStorage.getItem(key); } catch { /* Storage may be unavailable. */ }
  const cleanLocation = () => location.origin + location.pathname;
  const referrer = (() => { try { return new URL(document.referrer).origin + '/'; } catch { return ''; } })();
  window.dataLayer = window.dataLayer || [];
  const gtag = function () { window.dataLayer.push(arguments); };
  const pageView = () => {
    if (consent !== 'granted' || !loaded || /^\/(admin|api)(\/|$)/.test(location.pathname) || lastPath === location.pathname) return;
    lastPath = location.pathname;
    gtag('set', {page_location: cleanLocation(), page_referrer: referrer, page_title: script.dataset.gaName || hosts[0]});
    gtag('event', 'page_view', {send_to: id, page_location: cleanLocation(), page_referrer: referrer, page_title: script.dataset.gaName || hosts[0]});
  };
  const load = () => {
    if (loaded) { pageView(); return; }
    loaded = true;
    gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    gtag('js', new Date());
    gtag('config', id, {send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: cleanLocation(), page_referrer: referrer, page_title: script.dataset.gaName || hosts[0]});
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    tag.referrerPolicy = 'origin';
    document.head.append(tag);
    pageView();
  };
  const forgetCookies = () => {
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) return;
      const parts = location.hostname.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        const domain = parts.slice(i).join('.');
        document.cookie = name + '=; Max-Age=0; Path=/; Domain=' + domain;
        document.cookie = name + '=; Max-Age=0; Path=/; Domain=.' + domain;
      }
      document.cookie = name + '=; Max-Age=0; Path=/';
    });
  };
  const setConsent = value => {
    consent = value;
    try { localStorage.setItem(key, value); } catch { /* Keep this visit's choice. */ }
    window['ga-disable-' + id] = value !== 'granted';
    if (value === 'granted') {
      if (loaded) gtag('consent', 'update', {analytics_storage: 'granted'});
      lastPath = null;
      load();
    } else {
      if (loaded) gtag('consent', 'update', {analytics_storage: 'denied'});
      forgetCookies();
    }
    panel.hidden = true;
  };
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Analytics preferences');
  panel.style.cssText = 'position:fixed;left:16px;bottom:56px;z-index:1000;max-width:360px;width:calc(100vw - 32px);padding:16px;background:#fff;color:#17251d;border:1px solid #78867c;border-radius:8px;font:14px/1.5 system-ui;box-sizing:border-box';
  const message = document.createElement('p');
  message.style.margin = '0 0 12px';
  message.textContent = 'Allow Google Analytics to measure visits? This is optional. We do not send enquiry details or search text.';
  const button = (label, handler) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.style.cssText = 'padding:8px 12px;margin:4px 8px 4px 0;border:1px solid #526456;border-radius:4px;background:#fff;color:#17251d;cursor:pointer;font:inherit';
    b.addEventListener('click', handler);
    return b;
  };
  panel.append(message, button('Allow analytics', () => setConsent('granted')), button('Decline', () => setConsent('denied')));
  const privacy = document.createElement('a');
  privacy.href = script.dataset.gaPrivacy || '/privacy'; privacy.textContent = 'Privacy notice';
  privacy.style.cssText = 'display:block;color:#17251d;text-decoration:underline;margin-top:8px';
  panel.append(privacy);
  panel.hidden = consent === 'granted' || consent === 'denied';
  const settings = button('Analytics preferences', () => { panel.hidden = !panel.hidden; });
  settings.style.cssText += ';position:fixed;left:16px;bottom:12px;z-index:999;font-size:12px;margin:0';
  document.body.append(panel, settings);
  const track = (name, params = {}) => {
    if (consent !== 'granted' || !loaded || !/^[a-z][a-z0-9_]{0,39}$/.test(name) || /^\/(admin|api)(\/|$)/.test(location.pathname)) return;
    // Only aggregate numeric fields and fixed currency codes cross this boundary.
    const safe = {};
    for (const field of ['value', 'quantity', 'item_count', 'result_count']) {
      if (typeof params[field] === 'number' && Number.isFinite(params[field])) safe[field] = params[field];
    }
    if (['USD', 'INR', 'GBP', 'EUR', 'AUD', 'CAD'].includes(params.currency)) safe.currency = params.currency;
    gtag('event', name, {...safe, send_to: id, page_location: cleanLocation(), page_referrer: referrer, page_title: script.dataset.gaName || hosts[0]});
  };
  window.siteAnalytics = {setConsent, track};
  window['ga-disable-' + id] = consent !== 'granted';
  if (consent === 'granted') load();
  const navigate = () => queueMicrotask(pageView);
  ['pushState', 'replaceState'].forEach(method => {
    const original = history[method];
    history[method] = function (...args) { const result = original.apply(this, args); navigate(); return result; };
  });
  window.addEventListener('popstate', navigate);
  window.addEventListener('storage', event => {
    if (event.key === key) setConsent(event.newValue === 'granted' ? 'granted' : 'denied');
  });
})();
