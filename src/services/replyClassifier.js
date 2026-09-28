/**
 * Deterministic reply classifier.
 *
 * Replaces the LLM classification pass. The model is gone, but two behaviours
 * it drove are not optional: a lead who says "stop" or complains must be paused
 * so we stop messaging them, and an out-of-office auto-reply must not be
 * treated as a real reply. Keyword rules handle both without a model.
 *
 * Rules are ordered — opt-out is checked before everything else, because a
 * message like "stop, I'm on leave" must pause rather than reschedule.
 *
 * Returns the same shape the LLM did, so callers are unchanged:
 *   { intent, urgency, nextAction, summary, confidence }
 */

// Phrases that mean "stop messaging me" wherever they appear in a reply.
// Leads write in their own language, so the common ways of saying it in the
// languages Outbound OS is used with are here too. Only unambiguous phrases:
// a word that also means something harmless ("para", "basta con…") belongs
// in OPT_OUT_WORDS, which must be the whole message.
const OPT_OUT = [
  // English
  'stop', 'unsubscribe', 'opt out', 'opt-out', 'remove me', 'do not contact',
  "don't contact", 'take me off', 'no longer interested', 'leave me alone',
  // Hindi and Hinglish
  'बंद करो', 'बंद करें', 'मत भेजो', 'मैसेज मत', 'अनसब्सक्राइब',
  'band karo', 'band kar do', 'mat bhejo', 'message mat karo', 'msg mat karo',
  // Spanish
  'darme de baja', 'dar de baja', 'no me escriban', 'no me escribas', 'no me contacten',
  'no más mensajes', 'deja de escribirme', 'dejen de escribirme', 'cancelar suscripción',
  // Portuguese
  'pare de me mandar', 'parem de me mandar', 'não quero mais receber', 'sair da lista',
  'descadastrar', 'não me mande mais', 'cancelar inscrição',
  // French
  'désabonner', 'me désinscrire', 'ne plus recevoir', "arrêtez de m'écrire", 'arrêtez de m’écrire',
  // German
  'abmelden', 'nicht mehr kontaktieren', 'keine nachrichten mehr', 'hören sie auf',
  // Italian
  'disiscrivimi', 'cancellami', 'non contattatemi', 'non scrivetemi più',
  // Indonesian and Malay
  'berhenti berlangganan', 'jangan hubungi', 'jangan kirim',
  // Turkish
  'abonelikten çık', 'mesaj atmayın', 'rahatsız etmeyin',
  // Russian
  'отписаться', 'не пишите', 'больше не пишите',
  // Arabic
  'إلغاء الاشتراك', 'الغاء الاشتراك', 'لا تراسلني', 'توقف عن',
];

// Single words that are an opt-out only when they are the whole reply, the
// way SMS STOP keywords work: "PARAR" on its own means stop; "sem parar"
// ("non-stop") inside a sentence does not.
const OPT_OUT_WORDS = new Set([
  'stop', 'stopp', 'unsubscribe', 'parar', 'pare', 'sair', 'baja', 'cancelar',
  'arrêt', 'arrêter', 'arret', 'arreter', 'basta', 'berhenti', 'iptal', 'dur',
  'стоп', 'хватит', 'توقف', 'إلغاء', 'الغاء', 'बंद', 'रोको',
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match that works beyond ASCII: \b only knows Latin letters, so
// it would never find a boundary around Devanagari or Arabic. Letters, marks
// and digits all count as part of a word.
const OPT_OUT_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}])(${OPT_OUT.map(escapeRegex).join('|')})(?![\\p{L}\\p{M}\\p{N}])`,
  'u',
);

function isOptOut(text) {
  if (OPT_OUT_PATTERN.test(text)) return true;
  // Keep combining marks (\p{M}): Devanagari vowel signs are marks, and
  // stripping them would turn "बंद" into "बद".
  const bare = text.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return OPT_OUT_WORDS.has(bare);
}

const COMPLAINT = [
  'spam', 'scam', 'fraud', 'harass', 'report you', 'illegal', 'complain',
  'stop bothering', 'stop messaging',
];

const OUT_OF_OFFICE = [
  'out of office', 'ooo', 'on leave', 'on vacation', 'annual leave',
  'currently away', 'maternity leave', 'paternity leave', 'auto-reply',
  'automatic reply', 'will be back on', 'away from my desk', 'public holiday',
];

const POSITIVE = [
  'interested', 'send me', 'share the', 'quote', 'pricing', 'price list',
  'how much', 'cost', 'moq', 'sample', 'catalog', 'catalogue', 'available',
  'proceed', 'order', 'buy', 'purchase', 'yes please', 'go ahead',
];

const QUESTION = ['?', 'what', 'when', 'where', 'which', 'can you', 'could you', 'do you'];

const NEGATIVE_SOFT = [
  'not interested', 'no thanks', 'no thank you', 'not now', 'already have',
  'nahi chahiye', 'नहीं चाहिए', 'no me interesa', 'não tenho interesse', 'pas intéressé', 'kein interesse',
];

const has = (text, list) => list.some((k) => text.includes(k));

/**
 * @param {object} _lead - kept for signature parity with the previous LLM call
 * @param {string} replyText
 * @returns {{intent:string,urgency:string,nextAction:string,summary:string,confidence:string}|null}
 */
export function classifyReply(_lead, replyText) {
  const raw = String(replyText || '').trim();
  if (!raw) return null;
  const text = raw.normalize('NFC').toLowerCase();
  const summary = raw.replace(/\s+/g, ' ').slice(0, 140);

  // Order matters: opt-out and complaint win over everything.
  if (has(text, COMPLAINT)) {
    return { intent: 'complaint', urgency: 'high', nextAction: 'stop_contact', summary, confidence: 'high' };
  }
  // Opt-out phrases match whole words only, so "stockist" or "nonstop" don't
  // trigger "stop".
  if (isOptOut(text)) {
    return { intent: 'negative', urgency: 'high', nextAction: 'stop_contact', summary, confidence: 'high' };
  }
  if (has(text, OUT_OF_OFFICE)) {
    return { intent: 'out_of_office', urgency: 'low', nextAction: 'reschedule', summary, confidence: 'medium' };
  }
  if (has(text, NEGATIVE_SOFT)) {
    return { intent: 'negative', urgency: 'low', nextAction: 'stop_contact', summary, confidence: 'medium' };
  }
  if (has(text, POSITIVE)) {
    return { intent: 'positive', urgency: 'high', nextAction: 'reply_now', summary, confidence: 'medium' };
  }
  if (has(text, QUESTION)) {
    return { intent: 'question', urgency: 'medium', nextAction: 'reply_now', summary, confidence: 'low' };
  }
  return { intent: 'neutral', urgency: 'medium', nextAction: 'review', summary, confidence: 'low' };
}

export default { classifyReply };
