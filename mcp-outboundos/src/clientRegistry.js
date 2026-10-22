/** Bounded, expiring DCR metadata; existing issued tokens live separately. */
export class ClientRegistry {
  constructor({ capacity = 1000, ttlMs = 24 * 60 * 60 * 1000, now = Date.now } = {}) {
    this.entries = new Map();
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(id) {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry.value;
  }

  set(id, value) {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expires <= now) this.entries.delete(key);
    }
    if (!this.entries.has(id) && this.entries.size >= this.capacity) {
      this.entries.delete(this.entries.keys().next().value);
    }
    this.entries.set(id, { value, expires: now + this.ttlMs });
  }
}
