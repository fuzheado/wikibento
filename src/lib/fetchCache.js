/**
 * Tiny TTL fetch cache with in-flight coalescing.
 *
 * Multiple widgets often hit the same endpoint (Wiki Stats + Top 10 both
 * fetch the 195 KB Wikistats CSV). Keyed by URL; concurrent callers share
 * one in-flight request; failures are not cached (the entry is dropped so
 * the next call retries fresh).
 */
export function createTtlCache(ttlMs) {
  const map = new Map();
  return {
    /** Resolve `producer()` for `key`, reusing a fresh cached promise. */
    get(key, producer) {
      const hit = map.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.promise;
      const entry = { promise: null, expiresAt: Date.now() + ttlMs };
      map.set(key, entry);
      entry.promise = Promise.resolve()
        .then(producer)
        .catch((err) => {
          map.delete(key); // don't cache failures
          throw err;
        });
      return entry.promise;
    },
    /** Drop one entry (or all, when key is omitted) — e.g. after a manual refresh. */
    clear(key) {
      if (key === undefined) map.clear();
      else map.delete(key);
    },
  };
}
