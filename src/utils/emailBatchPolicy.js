import { createHash } from 'node:crypto';

const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const aliases = new Map([
  ['usa', 'US'], ['united states of america', 'US'],
  ['uk', 'GB'], ['gbr', 'GB'], ['great britain', 'GB'],
  ['aus', 'AU'],
]);

export function normalizeCountry(value) {
  const text = String(value || '').trim().replaceAll('.', '').replace(/\s+/g, ' ');
  if (!text) return '';
  const code = aliases.get(text.toLowerCase()) || (/^[a-z]{2}$/i.test(text) ? text.toUpperCase() : null);
  return code ? regions.of(code) : text;
}

export function countryAllowed(country, countries) {
  const key = normalizeCountry(country).toLowerCase();
  return Boolean(key) && countries.some(value => normalizeCountry(value).toLowerCase() === key);
}

export function validateCountries(value) {
  if (!Array.isArray(value) || value.length > 250 || value.some(v => typeof v !== 'string' || !normalizeCountry(v).trim() || v.length > 100)) {
    throw new Error('countries must be an array of country names or codes');
  }
  const unique = new Map(value.map(v => [normalizeCountry(v).toLowerCase(), normalizeCountry(v)]));
  return [...unique.values()];
}

export function normalizeRecipientEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && !/@test\.com$/i.test(email) ? email : '';
}

export function batchContactAttributes(lead) {
  const name = String(lead.name || '').trim();
  return Object.fromEntries(Object.entries({
    FIRSTNAME: /^user$/i.test(name) ? '' : name.split(/\s+/)[0].slice(0, 80),
    PRODUCT: String(lead.product || '').trim().slice(0, 180),
    COUNTRY: String(lead.country || '').trim().slice(0, 120),
    COMPANY: String(lead.company || '').trim().slice(0, 180),
  }).filter(([, value]) => Boolean(value)));
}

export function batchRecipientIdentity(lead) {
  return [lead.id, normalizeRecipientEmail(lead.email), batchContactAttributes(lead)];
}

const variables = {
  name: ['FIRSTNAME', 'there'], product: ['PRODUCT', 'our products'],
  country: ['COUNTRY', 'your country'], company: ['COMPANY', 'your company'],
  email: ['EMAIL', ''],
};

function replaceVariables(text, replace) {
  return String(text || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, path) => {
    if (path === 'unsubscribe') return token;
    const key = path.replace(/^lead\./, '');
    if (!Object.hasOwn(variables, key)) throw new Error(`Unsupported batch template variable: ${path}`);
    return replace(key);
  });
}

export function prepareBatchTemplate(template) {
  if (!template?.id || !template.subject?.trim() || !template.htmlBody?.trim()) {
    throw new Error('Select a saved email template with a subject and HTML body');
  }
  const render = text => replaceVariables(text, key => {
    const [attribute, fallback] = variables[key];
    return `{{ contact.${attribute}|default:"${fallback}" }}`;
  });
  return {
    id: template.id, name: template.name,
    subject: render(template.subject), htmlBody: render(template.htmlBody), textBody: render(template.textBody),
    hash: createHash('sha256').update(JSON.stringify([
      template.id, template.subject, template.htmlBody, template.textBody || '',
    ])).digest('hex'),
  };
}

export function renderBatchTemplate(template, lead) {
  const attributes = batchContactAttributes(lead);
  const render = (text, html = false) => replaceVariables(text, key => {
    const [attribute, fallback] = variables[key];
    const value = String((key === 'email' ? normalizeRecipientEmail(lead.email) : attributes[attribute]) || fallback);
    return html ? value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) : value;
  });
  return { subject: render(template.subject), textBody: render(template.textBody), htmlBody: render(template.htmlBody, true) };
}

export function validateBatchSettings(body = {}) {
  const updates = [];
  for (const [field, key] of [['enabled', 'email.daily.enabled'], ['marketingEnabled', 'email.daily.marketing.enabled']]) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') throw new Error(`${field} must be a boolean`);
    updates.push([key, String(body[field])]);
  }
  for (const [field, key, max] of [
    ['batchSize', 'email.daily.batch_size', 200], ['perSenderQuota', 'email.daily.per_sender_quota', 150],
  ]) {
    if (body[field] === undefined) continue;
    if (!Number.isInteger(body[field]) || body[field] < 1 || body[field] > max) throw new Error(`${field} must be an integer from 1 to ${max}`);
    updates.push([key, String(body[field])]);
  }
  if (body.countries !== undefined) updates.push(['email.daily.countries', JSON.stringify(validateCountries(body.countries))]);
  if (body.senderIds !== undefined) {
    if (!Array.isArray(body.senderIds) || body.senderIds.length > 100 || body.senderIds.some(id => !Number.isSafeInteger(id) || id < 1)) {
      throw new Error('senderIds must be an array of positive account IDs');
    }
    updates.push(['email.daily.sender_ids', JSON.stringify([...new Set(body.senderIds)])]);
  }
  if (body.templateId !== undefined) {
    if (body.templateId !== null && (!Number.isSafeInteger(body.templateId) || body.templateId < 1)) throw new Error('templateId must be a positive ID or null');
    updates.push(['email.daily.template_id', body.templateId === null ? '' : String(body.templateId)]);
  }
  if (body.brevoFolderId !== undefined) {
    const value = body.brevoFolderId;
    if (value !== null && (!Number.isSafeInteger(value) || value < 1)) throw new Error('brevoFolderId must be a positive integer or null');
    updates.push(['email.daily.marketing.brevo_folder_id', value === null ? '' : String(value)]);
  }
  return updates;
}
