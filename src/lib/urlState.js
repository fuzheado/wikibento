/**
 * URL state — the single reader and single writer for the address bar (ISSUE-87).
 *
 * The rule this module exists to enforce: **the URL is a claim about what is on screen**. When that
 * claim stops being true, the URL is a lie — and a lie in the address bar is the most expensive kind,
 * because it is the artifact people copy, bookmark, e-mail and put in a slide. Two live examples, found
 * by the audit in `docs/URL-STATE.md` and both fixed by using the helpers below:
 *
 *   · ↺ Reset left `?config=/demos.json` in the URL while the board went blank, so a reload (or a
 *     shared link) resurrected the board the user had just thrown away — "reset doesn't stick".
 *   · Share handed over `?config=/demos.json` after the board had been edited, so the recipient got the
 *     *file's* board, not the one being pointed at on screen.
 *
 * The contract, in full, with the inventory of every action and its decided tier, is `docs/URL-STATE.md`.
 *
 *   C1 CLAIM INTEGRITY   A board claim (`?config=`, `#/d/<payload>`) is valid only while the board on
 *                        screen still equals what the claim names. Any action that replaces or modifies
 *                        the board drops the claim.
 *   C2 PRESENT IS OPT-IN `?kiosk=1` / `?lean=1` are set on the deliberate enter path and stripped on
 *                        Exit. Escape keeps them — a present link stays a present link.
 *   C3 VIEW STAYS OUT    Zoom, page number, open panels, sort order, search boxes, selection: component
 *                        state, never the URL. They are not the artifact, and they would make every URL
 *                        enormous. (A deliberate exception — deep-linking a document page — is ISSUE-87's
 *                        open question, not an accident.)
 *   C4 UI STAYS OUT      Dialogs, toasts, boot errors, hover, drag-in-progress.
 *   C5 ONE WRITER        Every `history.*` call and every read of `location.search`/`.hash` in `src/`
 *                        goes through this module. `tests/url-state.test.mjs` scans the source and fails
 *                        if a second writer appears.
 *   C6 REPLACE ONLY      This app does not implement `popstate` re-boot — it reads the URL once at boot.
 *                        A `pushState` would therefore change the URL without changing the board and
 *                        break the Back button. Undo is a toast (see `handleAddAssembly`), not a history
 *                        entry. Adopting push requires becoming URL-driven first; until then, replace.
 *
 * Precedence at boot, unchanged: `?config=` → `#/d/<payload>` → localStorage → the starter board.
 */

import { savedBoardPayload } from './savedBoard.js';

export const TIERS = {
  BOARD: 'board',          // part of what the board *is* — the only tier the URL carries
  PRESENT: 'present',      // how the board is *shown* — carried, deliberately, per C2
  VIEW: 'view',            // where you are *looking* — C3, never carried
  TRANSIENT: 'transient',  // momentary UI — C4, never carried
};

/**
 * The URL-carried keys, as data, because the tests are only as honest as this table. `onBoardChange`
 * is the decision the audit made for each: a claim is dropped when the board diverges, present params
 * are kept (they describe the presentation, not the board).
 */
export const URL_STATE_CONTRACT = [
  {
    key: 'config', param: 'config', tier: TIERS.BOARD, onBoardChange: 'drop',
    note: 'this board came from this file (a demo in public/, or a wiki page)',
  },
  {
    key: 'embed', param: null, hash: true, tier: TIERS.BOARD, onBoardChange: 'drop',
    note: 'the board itself, base64url-encoded as #/d/<payload> — the self-contained share link',
  },
  {
    key: 'kiosk', param: 'kiosk', tier: TIERS.PRESENT, onBoardChange: 'keep',
    note: 'present mode with a fullscreen attempt; survives refresh by design',
  },
  {
    key: 'lean', param: 'lean', tier: TIERS.PRESENT, onBoardChange: 'keep',
    note: 'chrome-free present mode, no fullscreen; the mode a scanned link should carry',
  },
];

/**
 * The other half of the inventory: state the audit decided must NEVER reach the URL. Listed here (not
 * only in the doc) so a reviewer adding one of these to the URL has to delete a line that says why not.
 * Grouped by tier; `page` carries the one open question.
 */
export const NEVER_IN_URL = [
  // VIEW (C3) — component state, lost on reload by design
  'zoom', 'timelineAlignment', 'showOverlap', 'lightTheme', 'readerPage', 'readerSpread',
  'readerShift', 'textPanelOpen', 'searchQuery', 'sortOrder', 'selectedWidget', 'scrollPosition',
  // TRANSIENT (C4)
  'openDialog', 'toast', 'bootError', 'copyFeedback', 'dragInProgress', 'loading',
];

/** Params this module reads back. Anything read must be in the contract (asserted by the test). */
export const READ_PARAMS = URL_STATE_CONTRACT.filter((c) => c.param).map((c) => c.param);

/** Params dropped when the board stops matching the claim (C1). */
export const BOARD_CLAIM_PARAMS = URL_STATE_CONTRACT
  .filter((c) => c.tier === TIERS.BOARD && c.param).map((c) => c.param);

/** The hash shape that carries a whole board (`#/d/<base64url>`), from src/lib/share.js. */
export const EMBED_HASH_RE = /^#\/d\/[A-Za-z0-9_-]+$/;

/**
 * Read the URL state this app cares about — and nothing else. Junk params (`?utm_source=…`) are
 * ignored rather than mirrored, which is half of why a URL can start lying.
 *
 * @param {string} search `window.location.search` (or any `?a=b` string)
 * @param {string} [hash] `window.location.hash`
 */
export function parseUrlState(search, hash = '') {
  const q = new URLSearchParams(search || '');
  const out = { config: null, kiosk: null, lean: null, embed: null };
  for (const c of URL_STATE_CONTRACT) {
    if (c.param) out[c.key] = q.get(c.param);
  }
  out.kiosk = out.kiosk === '1';
  out.lean = out.lean === '1';
  if (EMBED_HASH_RE.test(hash || '')) out.embed = (hash || '').replace('#/d/', '');
  return out;
}

/**
 * What the URL currently claims about the board. `config` wins over `embed`, matching boot precedence;
 * `local` means the URL claims nothing and the board came from localStorage (or defaults).
 *
 * @returns {{kind: 'config'|'embed'|'local', value: string|null}}
 */
export function boardClaim(href) {
  const url = safeUrl(href);
  const { config: configValue, embed } = parseUrlState(url.search, url.hash);
  if (configValue && configValue.trim()) return { kind: 'config', value: configValue.trim() };
  if (embed) return { kind: 'embed', value: embed };
  return { kind: 'local', value: null };
}

/**
 * The board's identity, as a string, for asking "is the URL still telling the truth?".
 *
 * Deliberately built on `savedBoardPayload` — the same serialisation localStorage holds — so the
 * question "does the URL match the board?" and the question "what would a reload restore?" are answered
 * by the same bytes. `includeLayout: false` is for callers that only care about content (a rearranged
 * card is still the demo board); the claim check uses the default, full comparison.
 */
export function boardFingerprint(widgets, layout, params, { includeLayout = true } = {}) {
  const { widgets: w, layout: l, params: p } = savedBoardPayload(widgets, layout, params);
  return JSON.stringify(includeLayout ? { widgets: w, layout: l, params: p } : { widgets: w, params: p });
}

/** Is the claim still true of this board? A missing claim is never "fresh". */
export function claimIsFresh(claim, fingerprint) {
  if (!claim || !claim.fingerprint) return false;
  return claim.fingerprint === fingerprint;
}

/**
 * Drop the board claim from a URL, keeping everything else (present params, unrelated junk-free
 * params). Pure: takes an href, returns an href. Removing the claim is the *only* repair this module
 * offers — it never writes the board into the URL, because C6 forbids inventing history and C3 keeps
 * view state out.
 */
export function stripBoardClaim(href) {
  const url = safeUrl(href);
  for (const p of BOARD_CLAIM_PARAMS) url.searchParams.delete(p);
  if (EMBED_HASH_RE.test(url.hash)) url.hash = '';
  return url.toString();
}

/**
 * Set/delete params on a URL. `null`/`undefined`/`false` deletes; `true` writes `'1'` (the shape both
 * present params and kiosk use); anything else is written as a string. Pure.
 */
export function setParams(href, patch) {
  const url = safeUrl(href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === false) url.searchParams.delete(k);
    else if (v === true) url.searchParams.set(k, '1');
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Does this URL differ from the one on screen, ignoring its own ordering? Cheap "did nothing change". */
export function sameUrl(a, b) {
  return safeUrl(a).toString() === safeUrl(b).toString();
}

/**
 * THE single writer (C5). Every address-bar change in the app ends up here, and every one of them is a
 * `replaceState` (C6) — no history entry, no Back button that changes the URL without changing the
 * board. A no-op outside a browser, so tests and any future SSR path cannot explode on it.
 *
 * @returns {boolean} whether the URL actually changed
 */
export function applyUrl(href) {
  if (typeof window === 'undefined' || !window.history || !window.location) return false;
  const next = safeUrl(href).toString();
  if (next === window.location.href) return false;
  window.history.replaceState(null, '', next);
  return true;
}

/** Drop the board claim from the live URL, if there is one. Returns whether anything changed. */
export function dropBoardClaimOnScreen() {
  if (typeof window === 'undefined') return false;
  const cleaned = stripBoardClaim(window.location.href);
  return applyUrl(cleaned);
}

/** Parse an href/relative URL without throwing on anything a browser might hand us. */
function safeUrl(href) {
  const base = typeof window !== 'undefined' && window.location
    ? window.location.origin + window.location.pathname
    : 'http://localhost/';
  try {
    return new URL(href || base, base);
  } catch {
    return new URL(base);
  }
}
