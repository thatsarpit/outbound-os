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
    const restoreFocus = panel.contains(document.activeElement);
    panel.hidden = true;
    settings.setAttribute('aria-expanded', 'false');
    if (restoreFocus) settings.focus();
  };
  const styles = document.createElement('style');
  styles.textContent = `
    .site-privacy { position:fixed;left:16px;bottom:calc(76px + env(safe-area-inset-bottom, 0px));z-index:1000;width:min(380px, calc(100vw - 32px));padding:22px;background:var(--surface, #141419);color:var(--text, #f7f7f9);border:1px solid var(--border-strong, #383842);border-radius:10px;font:14px/1.6 var(--font-sans, system-ui);box-sizing:border-box;box-shadow:0 16px 48px rgb(0 0 0 / .4); }
    .site-privacy__title { margin:0 0 8px;font-size:15px;font-weight:600;letter-spacing:-.015em; }
    .site-privacy__message { margin:0 0 18px;color:var(--text-secondary, #a0a0ac);font-size:13px; }
    .site-privacy__actions { display:flex;flex-wrap:wrap;gap:8px; }
    .site-privacy-button { min-height:44px;padding:10px 14px;border:1px solid var(--border-strong, #383842);border-radius:7px;background:var(--surface-raised, #1c1c22);color:var(--text, #f7f7f9);cursor:pointer;font:500 13px/1.4 var(--font-sans, system-ui); }
    .site-privacy-button:hover { background:var(--surface-overlay, #22222a); }
    .site-privacy-button:focus-visible,.site-privacy a:focus-visible { outline:2px solid var(--focus, #8b99ff);outline-offset:3px; }
    .site-privacy__link { display:inline-flex;align-items:center;min-height:40px;color:var(--text-secondary, #a0a0ac);text-decoration:underline;text-underline-offset:4px;font-size:12px;margin-top:6px; }
    .site-privacy__settings { position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:999;padding-inline:13px;border-radius:999px;box-shadow:0 2px 10px rgb(0 0 0 / .18);font-size:11px; }
    @media(max-width:480px) { .site-privacy { padding:20px; } }
  `;
  document.head.append(styles);
  const panel = document.createElement('section');
  panel.id = 'site-analytics-preferences';
  panel.className = 'site-privacy';
  panel.setAttribute('aria-label', 'Analytics preferences');
  const title = document.createElement('h2');
  title.className = 'site-privacy__title';
  title.textContent = 'Your choice of analytics';
  const message = document.createElement('p');
  message.className = 'site-privacy__message';
  message.textContent = 'Allow Google Analytics to measure visits? This is optional. We do not send enquiry details or search text.';
  const button = (label, handler) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.className = 'site-privacy-button';
    b.addEventListener('click', handler);
    return b;
  };
  const actions = document.createElement('div');
  actions.className = 'site-privacy__actions';
  actions.append(button('Allow analytics', () => setConsent('granted')), button('Decline', () => setConsent('denied')));
  panel.append(title, message, actions);
  const privacy = document.createElement('a');
  privacy.href = script.dataset.gaPrivacy || '/privacy'; privacy.textContent = 'Privacy notice';
  privacy.className = 'site-privacy__link';
  panel.append(privacy);
  panel.hidden = consent === 'granted' || consent === 'denied';
  const settings = button('Analytics preferences', () => {
    panel.hidden = !panel.hidden;
    settings.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) actions.querySelector('button').focus();
  });
  settings.classList.add('site-privacy__settings');
  settings.setAttribute('aria-controls', panel.id);
  settings.setAttribute('aria-expanded', String(!panel.hidden));
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      panel.hidden = true;
      settings.setAttribute('aria-expanded', 'false');
      settings.focus();
    }
  });
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
