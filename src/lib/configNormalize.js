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

/**
 * The refresh floor, enforced here because this is where values are READ.
 *
 * It lives in this file since 2026-10-02 because the validator stopped refusing boards over values it can normalise,
 * and a floor that is only a refusal is no protection at all: the card would have polled the API every 5 s. Import,
 * `?config=`, localStorage and `#/z/` all pass through `normalizeConfigForDef`, so this is the one place that covers
 * every intake path.
 */
export const MIN_REFRESH_SECONDS = 30;

/** Coerce one value according to its field definition. Unknown shapes are left alone rather than guessed at. */
export function coerceFieldValue(field, value) {
  if (value === undefined || value === null) return value;
  switch (field?.type) {
    case 'number': {
      if (typeof value === 'number') return clampToField(field, value);
      // A string from a hand-written board: '200' → 200, 'twelve' → the value as written (validate, don't invent).
      const n = Number(String(value).trim());
      return Number.isFinite(n) ? clampToField(field, n) : value;
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
/** `frame: 'bare' | 'card'` was this setting's spelling for the day it shipped (2026-09-29) before it became the
 *  boolean `edgeToEdge`. It is the one key translated rather than left alone: a board saved in that window, or a doc
 *  example written then, would otherwise keep a dead key *and* silently lose the setting.
 */
function migrateLegacyFrame(config, def) {
  if (config.frame === undefined) return config;
  if (!(def?.configFields || []).some((f) => f.key === 'edgeToEdge')) return config;
  if (config.edgeToEdge === undefined) {
    const v = String(config.frame).trim().toLowerCase();
    config.edgeToEdge = v === 'bare' || v === 'none' || v === 'edge' || v === 'true';
  }
  delete config.frame;
  return config;
}

/**
 * A number field's declared range is a rule, not a hint: the panel already clamps its inputs, and `validateDashboard`
 * has always promised "(will be clamped)" while nothing clamped. Now it does — for every intake path.
 */
function clampToField(field, n) {
  if (field?.min !== undefined && n < field.min) return field.min;
  if (field?.max !== undefined && n > field.max) return field.max;
  return n;
}

export function normalizeConfigForDef(config, def) {
  const out = migrateLegacyFrame({ ...(config || {}) }, def);
  // `wiki: "commons.wikimedia"` where the registry says `project`: the Ask advisor writes this (3 of 30 rows in the
  // 2026-10-01 audit) and so do people. Dropped, the card quietly used its *default* project — a wrong wiki with no
  // error, the worst kind. Repaired here so every intake path gets it (Import, ?config=, localStorage, a board another
  // model produced); `validateWidgetConfig` warns when it happens, because it changes meaning.
  if (out.wiki !== undefined && out.project === undefined && (def?.configFields || []).some((f) => f.key === 'project')) {
    out.project = out.wiki;
    delete out.wiki;
  }
  for (const field of def?.configFields || []) {
    if (out[field.key] === undefined && def?.defaults && def.defaults[field.key] !== undefined) {
      out[field.key] = def.defaults[field.key];
    }
    if (out[field.key] !== undefined) out[field.key] = coerceFieldValue(field, out[field.key]);
  }
  // The refresh floor is the one rule that belongs to the CARD rather than to a field: a board may write any
  // `refreshSeconds` it likes, and the app must not poll Wikimedia seven times as often as it promised.
  if (out.refreshSeconds !== undefined) {
    const secs = Number(out.refreshSeconds);
    out.refreshSeconds = Number.isFinite(secs) && secs > 0 ? Math.max(MIN_REFRESH_SECONDS, secs) : out.refreshSeconds;
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

/**
 * The top-level keys a board document carries that this format does not define — `version`, `widgets`, `layout` and
 * `params` are ours; anything else belongs to whoever wrote it.
 *
 * The rule these implement is the one JSON Canvas learned the hard way and states as its extension contract:
 * *retain what you do not model*. A reader that keeps only the fields it understands makes every save a silent
 * pruning — the file stays valid, still opens, and something is quietly missing (measured, 2026-10-03: this project
 * already did it at **config** level, via `compactConfig` above carrying unmodelled config keys through, and at
 * **widget** level, via `savedBoardPayload`'s spread — and pruned at **board** level, which is where a plugin
 * namespace or a future version would put its state). This closes the third level.
 *
 * Returns `null` when there is nothing foreign, so a plain board keeps exactly the shape it had.
 */
export function boardExtras(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const extras = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === 'version' || key === 'widgets' || key === 'layout' || key === 'params') continue;
    extras[key] = v;
  }
  return Object.keys(extras).length ? extras : null;
}
