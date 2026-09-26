const LEVEL = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVEL[process.env.LOG_LEVEL || 'info'] ?? LEVEL.info;

function ts() {
  return new Date().toISOString();
}

export default {
  debug: (...args) => current <= LEVEL.debug && console.debug(`[${ts()}] DEBUG`, ...args),
  info:  (...args) => current <= LEVEL.info  && console.log(`[${ts()}]  INFO`, ...args),
  warn:  (...args) => current <= LEVEL.warn  && console.warn(`[${ts()}]  WARN`, ...args),
  error: (...args) => current <= LEVEL.error && console.error(`[${ts()}] ERROR`, ...args),
};
