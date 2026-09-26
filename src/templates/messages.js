/**
 * Message Templates — Tiered by Lead Freshness
 * ================================================
 * HOT  = consumed < 2 hours ago  → immediate, specific, urgent
 * WARM = consumed 2hrs – 7 days  → competitive, credibility-driven
 * COLD = consumed > 7 days       → soft re-engagement, non-pushy
 *
 * Variables: {{name}}, {{product}}, {{quantity}}, {{strength}}, {{company}}, {{country}}
 * Business identity variables: {{persona}}, {{business}}, {{certifications}}
 */
import profile from '../businessProfile.js';

// Shorthand helpers — evaluated at call-time so .env hot-reloads work correctly
const P = () => profile.personaName;
const B = () => profile.businessName;
const C = () => profile.businessCertifications;

const templates = {

  // ═══════════════════════════════════
  // 🔥 HOT LEADS (fresh inquiry, < 2h)
  // ═══════════════════════════════════

  hot_followup1: [
    // These are 2-part messages — split on |||
    `Hi, I am {{persona}} from {{business}}. I can see you need {{product}} — we have it in stock right now.|||Can you confirm the quantity you need? I can share our best price immediately.`,
    `Hi, I am {{persona}} from {{business}}. Thank you for your inquiry about {{product}}.|||We have fresh stock available{{strength_str}}. I can arrange shipping quickly. Shall I send you a quote?`,
    `Hi, I am {{persona}} from {{business}}. We received your requirement for {{product}}.|||We can fulfil {{quantity_str}} with immediate dispatch. Want me to share pricing details right now?`,
  ],

  hot_followup2: [
    `Hi {{name}}, checking back on {{product}}. We can match your quantity and ship within 48 hours. Shall I confirm availability for you?`,
    `Hi {{name}}, just following up on {{product}}. We have it ready — can we discuss pricing quickly?`,
  ],

  hot_followup3: [
    `Hi {{name}}, still following up on {{product}}. Is there something specific you need — COA, pricing, or shipping timeline? Happy to help.`,
    `Hello {{name}}, wanted to check in on your {{product}} requirement. Are you still looking? We can offer attractive rates.`,
  ],

  hot_followup4: [
    `Hi {{name}}, another quick follow-up on {{product}}. We're offering special pricing this week. Let me know if you want details.`,
    `Hello {{name}}, noticed no reply yet on {{product}}. If you have any questions about quality or shipping, I'm here.`,
  ],

  hot_followup5: [
    `Hi {{name}}, final follow-up on {{product}}. If you ever need it in the future, please reach out — we'd love to work with you. Best wishes!`,
    `Hello {{name}}, closing out on {{product}} for now. Our offer remains open anytime. Wishing you a great day!`,
  ],

  // ════════════════════════════════════
  // ♨️ WARM LEADS (2hrs – 7 days old)
  // ════════════════════════════════════

  warm_followup1: [
    `Hi, I am {{persona}} from {{business}}. I noticed your inquiry for {{product}}.|||We are a {{certifications}} and have worked with buyers from {{country_str}}. Can I share our pricing and COA?`,
    `Hi, I am {{persona}} from {{business}}. We saw your requirement for {{product}}.|||We offer {{certifications}} products with competitive pricing and fast shipping. Interested in more details?`,
    `Hi, I am {{persona}} from {{business}}. Reaching out about your {{product}} requirement.|||We're a verified supplier with a strong export track record. Shall I send you our product specs and pricing?`,
  ],

  warm_followup2: [
    `Hi {{name}}, following up on {{product}}. We offer bulk pricing, COA, and can ship to {{country_str}} smoothly. Shall I send a quote?`,
    `Hello {{name}}, just checking in on your {{product}} inquiry. If you're comparing suppliers, we'd love a chance to offer our best price.`,
  ],

  warm_followup3: [
    `Hi {{name}}, wanted to touch base on {{product}}. We have certified stock and flexible MOQ. Still interested?`,
    `Hello {{name}}, checking back on {{product}}. Any questions I can answer about quality, packaging, or pricing?`,
  ],

  warm_followup4: [
    `Hi {{name}}, one more note on {{product}}. We're running a competitive rate this month. Happy to share if you're still comparing options.`,
    `Hi {{name}}, following up again on {{product}}. If timing isn't right yet, just let me know when you're ready.`,
  ],

  // ═══════════════════════════════════
  // ❄️ COLD LEADS (> 7 days old)
  // ═══════════════════════════════════

  cold_followup1: [
    `Hi, I am {{persona}} from {{business}}. Hope you're doing well.|||I noticed your earlier inquiry for {{product}}. Is this requirement still open? We may have something suitable for you.`,
    `Hi, I am {{persona}} from {{business}}. We came across your earlier interest in {{product}}.|||Just wanted to check if you're still looking. We have fresh stock and can offer good pricing. Let me know!`,
  ],

  cold_followup2: [
    `Hi {{name}}, just a gentle follow-up from {{business}}. If your {{product}} requirement is still active, we'd love to assist. Feel free to reach out anytime!`,
    `Hello {{name}}, circling back on {{product}}. If you found what you needed — great! If not, we're happy to help. No pressure at all.`,
  ],

};

// ─────────────────────────────────────────
// Helper to build context strings
// ─────────────────────────────────────────
function buildContext(lead) {
  return {
    strength_str: lead.strength ? ` (${lead.strength})` : '',
    quantity_str: lead.quantity || 'your required quantity',
    country_str: lead.country || 'your country',
  };
}

/**
 * Get a personalized message for a given lead tier and follow-up step.
 * @param {string} tier            - 'HOT' | 'WARM' | 'COLD'
 * @param {number} step            - follow-up step 1–5
 * @param {object} lead            - lead data
 * @param {object|null} resolvedProfile - already-resolved persona/business profile (from _resolveProfile())
 * @returns {string|string[]} Single string or 2-part array (for step 1)
 */
export function getMessage(tier = 'WARM', step, lead, resolvedProfile = null) {
  const tierKey = (tier || 'WARM').toLowerCase();
  const key = `${tierKey}_followup${step}`;

  // Fallback chain: exact key → warm equivalent → generic
  const pool = templates[key]
    || templates[`warm_followup${step}`]
    || [`Hi ${lead.name || 'there'}, following up on your inquiry about ${lead.product || 'your requirement'}. Let us know if you're interested.`];

  const raw = pool[Math.floor(Math.random() * pool.length)];
  const ctx = buildContext(lead);

  // Per-account persona — fall back to global profile if no resolved profile supplied
  const persona  = resolvedProfile?.personaName              || profile.personaName;
  const business = resolvedProfile?.businessName             || profile.businessName;
  const certs    = resolvedProfile?.businessCertifications   || profile.businessCertifications;

  const filled = raw
    .replace(/\{\{persona\}\}/g,        persona)
    .replace(/\{\{business\}\}/g,       business)
    .replace(/\{\{certifications\}\}/g, certs)
    .replace(/\{\{name\}\}/g, lead.name?.split(' ')[0] || 'there')
    .replace(/\{\{product\}\}/g, lead.product || 'your requirement')
    .replace(/\{\{quantity\}\}/g, lead.quantity || 'your required quantity')
    .replace(/\{\{quantity_str\}\}/g, ctx.quantity_str)
    .replace(/\{\{strength_str\}\}/g, ctx.strength_str)
    .replace(/\{\{country_str\}\}/g, ctx.country_str)
    .replace(/\{\{company\}\}/g, lead.company || '')
    .replace(/\{\{strength\}\}/g, lead.strength || '');

  // Step 1 messages for HOT/WARM/COLD are 2-part (split on |||)
  if (step === 1) {
    return filled.split('|||').map(s => s.trim()).filter(Boolean);
  }
  return filled;
}

export default templates;
