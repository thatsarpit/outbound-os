const slug = /^[a-z][a-z0-9-]{0,39}$/;
const accent = /^#[0-9a-f]{6}$/i;

function validOrigin(value, env) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password) return false;
    return url.protocol === 'https:' || (env.NODE_ENV !== 'production' &&
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch {
    return false;
  }
}

export function chatWidget(key, env = process.env) {
  if (!slug.test(key) || env.OUTBOUNDOS_WORKSPACE_ID || env.OUTBOUNDOS_BROWSER_CHAT !== 'true') return null;
  try {
    const settings = widgetSettings(env);
    if (!settings || !Object.hasOwn(settings, key)) return null;
    const widget = settings[key];
    if (!widget || typeof widget.title !== 'string' || !widget.title.trim() || widget.title.length > 64 ||
      !Array.isArray(widget.origins) || widget.origins.length > 12 ||
      widget.origins.some(origin => !validOrigin(origin, env))) return null;
    return {
      title: widget.title.trim(),
      welcome: typeof widget.welcome === 'string' && widget.welcome.trim() ? widget.welcome.trim().slice(0, 240) : 'How can we help?',
      accent: accent.test(widget.accent) ? widget.accent : '#4257b2',
      origins: [...new Set(widget.origins)],
    };
  } catch {
    return null;
  }
}

function widgetSettings(env) {
  try {
    const settings = JSON.parse(env.OUTBOUNDOS_CHAT_WIDGETS || '{}');
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  } catch {
    return {};
  }
}

export function configuredChatWidgets(env = process.env) {
  return Object.keys(widgetSettings(env)).flatMap(key => {
    const widget = chatWidget(key, env);
    return widget ? [{ key, ...widget }] : [];
  });
}
