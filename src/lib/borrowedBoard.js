/**
 * Borrowed boards — what happens when someone opens a link to *someone else's* board (ISSUE-88).
 *
 * The problem this models: boot used to persist whatever it loaded, so opening a `?config=` link
 * permanently replaced the visitor's own board. Nothing on screen said so, and the loss only surfaced on
 * the next visit without the param. The app had no way to express "show me this board" as distinct from
 * "make this my board", so viewing *was* adopting.
 *
 * The rules, in the order they protect the visitor:
 *
 *   1. **Borrowed is not adopted.** A board loaded from the URL is *borrowed*: it is on screen, and
 *      nothing is written to `localStorage` while it is borrowed. The visitor's board is untouched, so
 *      there is nothing to warn about (which is why this needs no dialog).
 *   2. **The first edit adopts it.** The moment the visitor changes something, the borrowed board becomes
 *      theirs — they meant it. That is the same moment the URL's claim goes stale (`urlState`'s C1), so one
 *      signal does both rather than two notions of "the board changed" that could drift.
 *   3. **Adoption is one-deep recoverable.** The board adoption displaces is kept in a second slot for a
 *      day, so "back to my board" still works *after* someone has started editing the borrowed one. A
 *      notice is the affordance; dismissing it drops the recovery (there is no hidden state to discover).
 *
 * Nothing here is irreversible: viewing changes nothing, adopting keeps the displaced board, and dismissing
 * is the visitor's own explicit choice. That is also why no `ConfirmDialog` is needed — a confirm is for
 * acts that cannot be taken back, and after these rules nothing in this flow is one.
 */

/** The slot holding the board a *borrowed* adoption displaced. Deliberately a different key from the board
 *  itself, so a bug in either cannot corrupt the other. */
export const STASH_KEY = 'wikibento-previous-board';

/** How long a displaced board stays recoverable. Long enough for "oops, that was yesterday", short enough
 *  that a stale offer cannot nag forever. */
export const STASH_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The board a URL claims, as a human label, for the notice. `?config=/document-reader-demo.json` is
 * "Document Reader", `?config=/glam-demo.json` is "GLAM" — the point is that the notice *names* the board
 * rather than gesturing at one, because "a shared board" gives the visitor nothing to decide with.
 */
/** Words that are acronyms in this project, so a label reads "GLAM" and "IA Book", not "Glam" and "Ia". */
const ACRONYMS = new Set(['glam', 'ia', 'mlk', 'cim', 'iiif', 'ores', 'sdc', 'qr', 'mint', 'wdqs', 'pdf', 'djvu']);

export function boardLabelFromConfig(configUrl) {
  if (!configUrl || typeof configUrl !== 'string') return 'a shared board';
  let path = configUrl.trim();
  // A wiki page URL or a w.wiki short link: the file name tells us nothing, so say what it is.
  if (/^https?:\/\//i.test(path) && !/\.json(\?|$)/i.test(path)) return 'a shared board';
  path = path.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
  const base = path.replace(/\.json$/i, '').replace(/[-_]demos?$/i, '').replace(/[-_]demo$/i, '');
  if (!base) return 'a shared board';
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Normalise a displaced board for storage: the same payload shape the board itself uses, plus when. */
export function stashPayload(boardPayload, at = Date.now()) {
  return { payload: boardPayload, at };
}

/**
 * Read a displaced board back, or `null`. Tolerant in the same spirit as `readSavedBoard`: anything that is
 * not the expected shape (no key, corrupt JSON, a blob without `widgets`/`layout` arrays) is treated as
 * nothing to recover rather than crashing the boot path.
 */
export function readStash(raw) {
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { payload, at } = parsed;
  if (!payload || typeof payload !== 'object') return null;
  if (!Array.isArray(payload.widgets) || !Array.isArray(payload.layout)) return null;
  const stamp = Number(at);
  if (!Number.isFinite(stamp)) return null;
  return { payload: { widgets: payload.widgets, layout: payload.layout, params: payload.params ?? null }, at: stamp };
}

/** Is a displaced board still worth offering? */
export function stashIsLive(stash, now = Date.now()) {
  if (!stash) return false;
  return now - stash.at < STASH_TTL_MS;
}

/**
 * Should the notice be shown at all, and in which state? The rule that keeps it from becoming noise: it
 * appears only when there is genuinely something at stake — a borrowed board on screen *and* a different
 * board saved. A first-time visitor, or one whose board is the one the link points at, sees nothing.
 *
 * @param {{borrowed: object|null, savedFingerprint: string|null, borrowedFingerprint: string|null,
 *          stash: object|null, dismissed: boolean}} state
 * @returns {'borrowed'|'recover'|null}
 */
export function noticeState({ borrowed, savedFingerprint, borrowedFingerprint, stash, dismissed = false, now = Date.now() }) {
  if (borrowed && savedFingerprint && savedFingerprint !== borrowedFingerprint) return 'borrowed';
  if (!dismissed && stashIsLive(stash, now)) return 'recover';
  return null;
}
