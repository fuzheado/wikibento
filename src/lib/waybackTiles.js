/**
 * Wayback replay tile states — pure helpers (no DOM, no fetch).
 *
 * Why this exists: replaying an archived page gives the UI almost no signal. The archive
 * serves the document in one shot (no progress API, `Range` ignored) and a heavy capture can
 * take tens of seconds — measured 6.6 s for en.wikipedia.org 2015 (145 requests) and 28.9 s
 * for nytimes.com 2010 (268 requests), with the archive's own `Server-Timing` naming
 * `cdx.remote` as the pre-content stall (7.8–66.2 s). So the honest thing we CAN render is
 * elapsed time + a bounded give-up, not a percentage. See docs/WAYBACK-REPLAY-LATENCY.md.
 */

/** Tiles mount one at a time — each is a 150–270-request page load against a throttling host. */
export const TILE_STAGGER_MS = 1200;
/** After this, say the wait is normal rather than leaving a silent spinner. */
export const TILE_SLOW_MS = 15000;
/** After this, stop pretending: offer the archive itself. */
export const TILE_TIMEOUT_MS = 75000;

/**
 * The archive's availability API is URL-form sensitive: `nytimes.com` returns
 * `{"archived_snapshots": {}}` while `www.nytimes.com` finds the capture — same site, and the
 * miss is the slower path (6.2 s vs 2.6 s). Always ask about both forms.
 */
export function urlVariants(input) {
  const base = String(input || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!base) return [];
  const host = base.split('/')[0];
  const rest = base.slice(host.length);
  if (/^www\./i.test(host)) return [base, host.replace(/^www\./i, '') + rest];
  return [base, `www.${base}`];
}

export function formatCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '';
  return v.toLocaleString('en-US');
}

/**
 * One tile's phase. Deliberately derived only from signals we actually have:
 * what the lookup returned, whether the iframe fired `load`, and how long we have waited.
 */
export function tilePhase({ row, loaded = false, mounted = true, elapsedMs = 0 } = {}) {
  if (!row) return 'queued';
  if (!row.available) return row.lookupFailed ? 'lookup-failed' : 'no-capture';
  if (loaded) return 'loaded';
  if (!mounted) return 'queued';
  if (elapsedMs >= TILE_TIMEOUT_MS) return 'timed-out';
  if (elapsedMs >= TILE_SLOW_MS) return 'slow';
  return 'loading';
}

const secs = (ms) => `${Math.max(0, Math.round(ms / 1000))} s`;

/** Overlay text for a phase, or '' when the tile should say nothing (loaded). */
export function tileLabel(phase, { row = {}, elapsedMs = 0, captureCount = 0, toleranceDays = 30 } = {}) {
  const total = captureCount > 0 ? `the archive has ${formatCount(captureCount)} captures for this URL` : '';
  switch (phase) {
    case 'queued':
      return 'waiting for its turn…';
    case 'loading':
      return `loading snapshot — ${secs(elapsedMs)}`;
    case 'slow':
      return `still loading — ${secs(elapsedMs)}. Heavy captures routinely take 20–30 s.`;
    case 'timed-out':
      return `gave up after ${secs(TILE_TIMEOUT_MS)} — open the archive to see it yourself.`;
    case 'no-capture':
      return total && !row.sawAnyDate
        ? `nothing near this date — ${total}`
        : `no capture within ±${toleranceDays} days`;
    case 'lookup-failed':
      return 'lookup failed — retry';
    default:
      return '';
  }
}

/** Whether a tile offers the manual retry affordance (a stuck tile is never a dead end). */
export function tileCanRetry(phase) {
  return phase === 'slow' || phase === 'timed-out' || phase === 'lookup-failed';
}

/**
 * Staggered mounting: with N tiles we start the next one TILE_STAGGER_MS after the previous.
 * Keeping this pure means the schedule is testable without a browser.
 */
export function tileMountDelay(index) {
  return Math.max(0, index) * TILE_STAGGER_MS;
}
