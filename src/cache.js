const { CACHE_TTL } = require("./config");

class RateCache {
  constructor() {
    this.store = new Map();
    this.lastFullRefresh = null;
  }

  set(key, value) {
    this.store.set(key, {
      data: value,
      timestamp: Date.now(),
    });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  getAll() {
    const result = {};
    for (const [key, entry] of this.store) {
      if (Date.now() - entry.timestamp <= CACHE_TTL) {
        result[key] = entry.data;
      }
    }
    return result;
  }

  setLastRefresh() {
    this.lastFullRefresh = new Date().toISOString();
  }

  getLastRefresh() {
    return this.lastFullRefresh;
  }

  size() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }
}

module.exports = new RateCache();
