/**
 * What a board SAYS its config is, versus what the app reads — two bugs from one share link (2026-09-18).
 *
 * A decoded `#/z/` board (a Neon-sign-museums board assembled outside the app) showed:
 *
 *   includeAll: 'True',  hideDecorative: 'True',  minSize: '200',  maxItems: '12',  allowExternalImages: 'False'
 *
 * Those are strings. `!!'False'` is `true`, so a widget that asked NOT to include caption-less images rendered as
 * though it had — a silent behaviour change, not a cosmetic one. The coercion helper the Ask pipeline uses lives in
 * `deploy/server.js`, so only the server ever coerced: anything loaded from a board file went in as written.
 *
 * The same board also carried every source field of every widget — a gallery with `from: 'article'` also stored
 * `page`, `category`, `files`, `order`, `linkAction` … 17 keys where 7 apply. That is `compactConfig`'s job below.
 *
 * Both are driven by the registry's own field types, so a new widget gets this without anyone remembering.
 */

/** Coerce one value according to its field definition. Unknown shapes are left alone rather than guessed at. */
export function coerceFieldValue(field, value) {
  if (value === undefined || value === null) return value;
  switch (field?.type) {
    case 'number': {
      if (typeof value === 'number') return value;
      // A string from a hand-written board: '200' → 200, 'twelve' → the value as written (validate, don't invent).
      const n = Number(String(value).trim());
      return Number.isFinite(n) ? n : value;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const t = String(value).trim().toLowerCase();
      if (['true', 'yes', '1', 'on'].includes(t)) return true;
      if (['false', 'no', '0', 'off', ''].includes(t)) return false;
      return value;
    }
    default:
      return value;
  }
}

/**
 * A widget's config as the app should read it: types coerced, and every field the card will use present.
 *
 * Merging the registry defaults matters as much as the coercion — the data path reads `config.x` directly in places,
 * and a board that omits a key (which is what `compactConfig` produces) must still behave exactly like one that
 * spells it out. A stored value always wins.
 */
export function normalizeConfigForDef(config, def) {
  const out = { ...(config || {}) };
  for (const field of def?.configFields || []) {
    if (out[field.key] === undefined && def?.defaults && def.defaults[field.key] !== undefined) {
      out[field.key] = def.defaults[field.key];
    }
    if (out[field.key] !== undefined) out[field.key] = coerceFieldValue(field, out[field.key]);
  }
  // Keys the registry does not declare (frame-level `_title`, a retired field) are left exactly as they arrived.
  return out;
}

/**
 * The inverse for storage: keep what the board actually says, drop what the registry would say anyway.
 *
 * Only declared fields are considered, and only when the value is identical to the default — so `_title`, a
 * hand-tuned value, or a retired key all survive. Round-trips: `normalizeConfigForDef(compactConfig(c, def), def)`
 * equals `normalizeConfigForDef(c, def)`, which is asserted in the tests.
 */
export function compactConfig(config, def) {
  const out = {};
  for (const [key, value] of Object.entries(config || {})) {
    const field = (def?.configFields || []).find((f) => f.key === key);
    if (!field) { out[key] = value; continue; }
    const fallback = def?.defaults ? def.defaults[key] : undefined;
    if (fallback !== undefined && JSON.stringify(fallback) === JSON.stringify(value)) continue;
    out[key] = value;
  }
  return out;
}
