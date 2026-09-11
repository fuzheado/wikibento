/**
 * What board to restore from a saved blob (the localStorage snapshot).
 *
 * Extracted from App.jsx's boot path because the rule is subtle and easy to get wrong: a board with
 * **zero widgets is a legitimate state** the user can now choose ("start with a blank board"), so the
 * loader must tell "the user saved an empty board" apart from "nothing has been saved".
 *
 * It does that from the *shape* of the stored value rather than by counting widgets: if `widgets`
 * and `layout` are both arrays, that save is honoured — even when both are empty. Anything else (no
 * key, corrupt JSON, a blob without those arrays) means there is nothing to restore, and the caller
 * falls back to the starter set.
 *
 * `layout` may be empty even on a populated board (widgets auto-place), so an empty layout must not
 * disqualify a save either. The previous inline rule required both arrays to be *non-empty*, which
 * meant a deliberately blank board came back as the three starter cards on the next reload — and an
 * auto-placed board lost its widgets for the same reason.
 */

/** @returns {{widgets: unknown[], layout: unknown[], params: object|null}|null} */
export function readSavedBoard(raw) {
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!Array.isArray(parsed.widgets) || !Array.isArray(parsed.layout)) return null;
  return { widgets: parsed.widgets, layout: parsed.layout, params: parsed.params ?? null };
}

/**
 * The board snapshot written to localStorage — exactly the shape `readSavedBoard` reads back, so the
 * two cannot drift. `params` is normalized to `null` (never `undefined`, which JSON drops).
 */
export function savedBoardPayload(widgets, layout, params) {
  return { widgets, layout, params: params || null };
}
