/**
 * Shared HTTP layer for every widget fetch (ISSUE-61).
 *
 * Why it exists: a board load fires one request per widget in parallel, and a
 * throttled IP (VPN / shared NAT) then sees HTTP 429 for *everything* — the
 * old code retried after 500 ms straight into the wall, ignored `Retry-After`,
 * and the config fetch didn't retry at all. This module adds three guards:
 *
 *   1. A concurrency cap + adaptive gap (a pacer) so the app never stampedes
 *      an API. The gap is 0 until a 429 is seen, then it stays raised.
 *   2. `Retry-After` is honored (capped at 10 s) and sets a global cool-down
 *      so other in-flight widgets back off too, not just the one that saw 429.
 *   3. A 429 that survives its retries fails with an actionable message
 *      instead of a bare "HTTP 429".
 *
 * Pure helpers (`parseRetryAfter`) and the pacer are exported for tests.
 */

/** Never wait longer than this inside a widget fetch — beyond it we fail with
 *  a "wait and Retry" message instead of hanging the card. */
export const MAX_RETRY_WAIT_MS = 10_000;

/** Concurrency cap: a full 37-widget catalog loads 4 at a time, not 37. */
const MAX_CONCURRENT = 4;

/** Pacing gap applied after any 429 (ms). 0 = unthrottled fast path. */
const RATE_LIMITED_GAP_MS = 500;

/** Cool-down used when the server sends no readable Retry-After (Wikimedia
 *  exposes it via Access-Control-Expose-Headers; other hosts may not). */
const DEFAULT_429_COOLDOWN_MS = 1000;

// ── pacer state (module-level: one queue for the whole app) ──
let active = 0;
let gapMs = 0;
let lastStart = 0;
let cooldownUntil = 0;
const queue = [];
let timer = null;

const nowMs = () => Date.now();

function schedule(ms) {
  if (timer) return;
  timer = setTimeout(() => { timer = null; pump(); }, Math.max(0, ms));
}

function pump() {
  if (!queue.length || active >= MAX_CONCURRENT) return;
  const t = nowMs();
  if (t < cooldownUntil) return schedule(cooldownUntil - t);
  const wait = lastStart + gapMs - t;
  if (wait > 0) return schedule(wait);
  const { resolve } = queue.shift();
  active += 1;
  lastStart = nowMs();
  resolve();
  if (queue.length && active < MAX_CONCURRENT) schedule(0);
}

/** Reserve a request slot; resolves when it is this request's turn. */
export function acquireSlot() {
  return new Promise((resolve) => { queue.push({ resolve }); pump(); });
}

/** Release a slot (always call, success or failure). */
export function releaseSlot() {
  active = Math.max(0, active - 1);
  pump();
}

/** Register a 429: pace every subsequent request and hold a cool-down. */
export function noteRateLimit(retryAfterMs = 0) {
  gapMs = Math.max(gapMs, RATE_LIMITED_GAP_MS);
  cooldownUntil = Math.max(cooldownUntil, nowMs() + Math.min(retryAfterMs || 0, MAX_RETRY_WAIT_MS));
  pump();
}

/** Test/debug hook — clears the queue, counters and adaptive state. */
export function resetPacerForTests() {
  active = 0;
  gapMs = 0;
  lastStart = 0;
  cooldownUntil = 0;
  queue.length = 0;
  if (timer) { clearTimeout(timer); timer = null; }
}

/** Test/debug hook — a snapshot of the pacer. */
export function pacerState() {
  return { active, gapMs, cooldownUntil, queued: queue.length };
}

/**
 * Parse a `Retry-After` header (seconds or HTTP-date) → ms, capped at
 * MAX_RETRY_WAIT_MS. Returns null when absent/unparseable.
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.min(Math.round(Number(s) * 1000), MAX_RETRY_WAIT_MS);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return Math.min(Math.max(0, t - now), MAX_RETRY_WAIT_MS);
  return null;
}

/** Actionable 429 message (kept starting with "HTTP 429" so the catch path
 *  below treats it as terminal rather than transient). */
function rateLimitMessage(shortUrl, retryAfterMs, terminal = false) {
  const wait = retryAfterMs
    ? (terminal ? ` — wait ~${Math.ceil(retryAfterMs / 1000)}s, then Retry` : ` — retrying in ~${Math.ceil(retryAfterMs / 1000)}s`)
    : (terminal ? ' — wait a moment, then Retry' : '');
  return `HTTP 429 — Wikimedia is rate-limiting this browser${wait} (${shortUrl})`;
}

/**
 * fetch() with a pacer, a timeout, and retry-with-backoff for transient
 * failures (network errors, 5xx, 429). Other 4xx fail fast.
 * Returns the response text.
 */
export async function fetchTextWithRetry(url, { timeoutMs = 15000, retries = 2, method = 'GET', body = null, contentType = null, withBody = false } = {}) {
  const shortUrl = url.replace(/^https?:\/\//, '').slice(0, 80); // for error messages
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await acquireSlot();
      let resp;
      try {
        resp = await fetch(url, {
          method,
          // NOTE: no custom User-Agent here. In browsers, User-Agent is a FORBIDDEN
          // header — Chromium strips it before the CORS preflight check, but Firefox
          // and WebKit include it in the preflight, and Wikimedia's REST endpoints
          // reject `user-agent` in Access-Control-Allow-Headers (RESTBase allows only
          // `api-user-agent`; the CIM service 405s OPTIONS outright). Net effect with
          // the header set: every RESTBase/CIM fetch dies with NetworkError in
          // Firefox/Safari while Chrome works (verified 2026-09-03, fixed by removing
          // it). The header was also a no-op — browsers always send their own UA.
          // Server-side code (deploy/server.js relays) sends the descriptive UA;
          // browser requests are identified by the browser's own UA + Origin.
          headers: body ? { 'Content-Type': contentType || 'application/json' } : undefined,
          body,
          signal: controller.signal,
        });
      } finally {
        releaseSlot();
      }
      if (resp.status === 429) {
        const raMs = parseRetryAfter(resp.headers.get('retry-after'));
        noteRateLimit(raMs ?? DEFAULT_429_COOLDOWN_MS);
        // A rate limit is retried AT MOST once: under a sustained throttle more
        // attempts just pile on. (5xx keep the normal retry budget.)
        if (attempt < Math.min(retries, 1)) {
          lastErr = new Error(rateLimitMessage(shortUrl, raMs));
        } else {
          const err = new Error(rateLimitMessage(shortUrl, raMs, true));
          err.retryAfterMs = raMs || null;
          throw err; // "HTTP 429 …" → rethrown as terminal by the catch below
        }
      } else if (resp.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${resp.status} (${shortUrl})`);
      } else if (!resp.ok) {
        let errBody = null;
        if (withBody) { try { errBody = (await resp.text()).slice(0, 300); } catch { /* body optional */ } }
        const err = new Error(`HTTP ${resp.status} (${shortUrl})`);
        if (errBody) err.body = errBody;
        throw err;
      } else {
        return await resp.text();
      }
    } catch (e) {
      // 4xx are terminal (bad title, not-loaded, auth, rate limit exhausted) —
      // never retry them; only 5xx / timeouts / network errors are transient.
      if (e instanceof Error && /^HTTP 4\d\d /.test(e.message)) throw e;
      if (e.name === 'AbortError') {
        lastErr = new Error(`timed out after ${timeoutMs / 1000}s (${shortUrl})`);
      } else if (!(e instanceof Error && e.message.startsWith('HTTP '))) {
        lastErr = e.message.includes(shortUrl) ? e : new Error(`${e.message} (${shortUrl})`);
      } else {
        lastErr = e;
      }
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw lastErr;
}
