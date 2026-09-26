// Loads .env and fills in generated instance secrets. Must stay first.
import './bootstrapEnv.js';

// ── Env validation — warn on missing critical vars ──
const REQUIRED_VARS = ['DATABASE_URL'];
const RECOMMENDED_VARS = [];
for (const v of REQUIRED_VARS) {
  if (!process.env[v]) console.error(`❌ Missing required env var: ${v}`);
}
for (const v of RECOMMENDED_VARS) {
  if (!process.env[v]) console.warn(`⚠️  Missing recommended env var: ${v} (using default)`);
}

function parseEnvInt(name, defaultVal) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultVal;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    console.warn(`[Config] Env var ${name} must be an integer, got: "${raw}". Using default: ${defaultVal}`);
    return defaultVal;
  }
  return parsed;
}

/**
 * Auto-ramp daily message limit by week.
 * Reads WA_WARMUP_WEEK from env (1-8).
 * Week 1-2: 20/day, Week 3-4: 30/day, Week 5-6: 40/day, Week 7+: 50/day
 */
function computeDailyLimit() {
  const week = parseEnvInt("WA_WARMUP_WEEK", 1);
  if (week <= 2) return 20;
  if (week <= 4) return 30;
  if (week <= 6) return 40;
  return 50;
}


const config = {
  recovery: {
    enabled: process.env.RUNTIME_RECOVERY_ENABLED !== "false",
    heartbeatSeconds: Math.max(30, parseEnvInt("RUNTIME_HEARTBEAT_SECONDS", 60)),
    wakeGapSeconds: Math.max(90, parseEnvInt("RUNTIME_WAKE_GAP_SECONDS", 180)),
    overlapMinutes: Math.max(1, parseEnvInt("RUNTIME_RECOVERY_OVERLAP_MINUTES", 15)),
    initialLookbackHours: Math.max(1, parseEnvInt("RUNTIME_INITIAL_LOOKBACK_HOURS", 24)),
    reconcileIntervalMinutes: Math.max(1, parseEnvInt("RUNTIME_RECONCILE_INTERVAL_MINUTES", 5)),
  },
  whatsapp: {
    adminPhone: process.env.ADMIN_PHONE || "",
    // Total message ceiling per account per day (initial + follow-ups + replies).
    // Lowered 50 → 20 → 15: WhatsApp's anti-spam heuristics penalize sustained
    // daily volume, and 15 leaves comfortable headroom above the natural
    // 5-new + ≤9-followup mix. The newLeadsPerDay budget (5) is the real
    // throughput knob; this is the safety ceiling.
    maxMessagesPerDay: parseEnvInt("WA_MAX_MESSAGES_PER_DAY", 15),
    warmupMode: process.env.WA_WARMUP_MODE === "true",
    warmupLimit: computeDailyLimit(), // auto-ramps based on WA_WARMUP_WEEK

    // Hourly rate limit per account — prevents clustering (WhatsApp-safe).
    // 2/hour spreads the 5 daily new-lead sends across ~3 hours (very human-looking).
    hourlyLimit: parseEnvInt("WA_HOURLY_LIMIT", 2),

    // Initial-outreach budget — how many NEW leads each account first-contacts per day.
    // Follow-ups to existing leads do NOT count against this budget.
    newLeadsPerDay: parseEnvInt("WA_NEW_LEADS_PER_DAY", 5),

    // Anti-ban delays — human-like pauses between messages
    minDelay: 60000,  // 60 seconds minimum
    maxDelay: 120000, // 120 seconds maximum
    typingDelay: { min: 3000, max: 9000 },

    // Error spike detection — if N consecutive sends fail, auto-pause
    pauseOnErrorCount: parseEnvInt("WA_PAUSE_ON_ERROR", 3),
    pauseDurationMs: 1800000, // 30 minutes

    // Auto-reconnect
    reconnectDelay: 30000,
    maxReconnectAttempts: 5,
  },

  followup: {
    delays: [
      parseEnvInt("FOLLOWUP_1_DELAY", 0),
      parseEnvInt("FOLLOWUP_2_DELAY", 240),
      parseEnvInt("FOLLOWUP_3_DELAY", 1440),
      parseEnvInt("FOLLOWUP_4_DELAY", 2880),
      parseEnvInt("FOLLOWUP_5_DELAY", 4320),
    ], // in minutes
  },

  /**
   * Who this instance says it is. Every outbound message, template and
   * sender name resolves from here — services must not carry their own
   * fallback brand string, or a deployment ends up introducing itself
   * under whoever happened to write the code.
   *
   * Deliberately generic defaults: this is used by anyone, not one company.
   */
  business: {
    name: process.env.BUSINESS_NAME || "",
    senderName: process.env.BUSINESS_SENDER_NAME || "",
    industry: process.env.BUSINESS_INDUSTRY || "",
    website: process.env.BUSINESS_WEBSITE || "",
  },

  businessHours: {
    start: parseEnvInt("BUSINESS_HOUR_START", 9),
    end: parseEnvInt("BUSINESS_HOUR_END", 23),
    // Asia/Kolkata, not UTC: the outreach window was previously computed against
    // a hardcoded UTC+5:30 and this setting was never read, so UTC as the
    // default would silently move every existing deployment's window by 5.5h.
    timezone: process.env.BUSINESS_TIMEZONE || "UTC",
  },

  api: {
    port: parseEnvInt("API_PORT", 3001),
  },

};

export default config;
