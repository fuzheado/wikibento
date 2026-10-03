/**
 * The Commons Impact Metrics family: nine API calls, three widgets.
 *
 * CIM answers nine questions over one precomputed dataset — a headline snapshot, a monthly pageview series, and
 * ranked rows — for either a category or a single file. Nine widget types shipped first (2026-08-13, the family
 * that motivated this project's "Grafana for one API" framing); they factor into three by RESULT SHAPE, and that is
 * not a tidiness argument. The three shapes are also the three renderer families and the three `timeScope` values,
 * so the type boundary, the presentation boundary and the temporal-scope constitution all fall in the same place:
 *
 *   cimStats   — one subject, one month        (month)  category-metrics-snapshot · media-file-metrics-snapshot
 *   cimTrend   — monthly views over a window   (range)  pageviews-per-{category,media-file}-monthly
 *   cimRanking — ranked rows for one month     (month)  the five top-* endpoints
 *
 * Everything the nine types read is preserved as configuration, with the old config KEY NAMES unchanged, so a board
 * that already exists keeps meaning what it meant — the one key it gains (`subject` / `facet`) is supplied from the
 * retired id below, at lookup, without touching the stored JSON.
 *
 * Retired ids resolve exactly as the gallery family's do (ISSUE-105, `src/lib/gallerySource.js`): `widgetDef()`
 * resolves them to the merged definition, and this module is the single place that says what the old id MEANT.
 * A board is not always ours to rewrite, so nothing is migrated on load — the meaning is inferred instead.
 */

/** The two subjects a CIM stats/trend card can be about. */
export const CIM_SUBJECTS = ['category', 'file'];

/** The five facets `cimRanking` ranks; `categories` is the global leaderboard (no subject). */
export const CIM_FACETS = ['files', 'wikis', 'pages', 'editors', 'categories'];

/**
 * Old type id → the merged type and the selector value the old id implied.
 *
 * The gallery's map is a plain `oldId → id` because its four sources are distinguishable from the config fields a
 * board carries (`inferGallerySource`). CIM is not: `cimTopPages`, `cimTopWikis` and `cimTopEditors` carry the very
 * same config keys, so the retired id is the only evidence of which one a board meant. Hence a value that names the
 * implied config as well as the type.
 */
export const LEGACY_CIM_IDS = {
  cimSnapshot: { type: 'cimStats', config: { subject: 'category' } },
  cimFileSpotlight: { type: 'cimStats', config: { subject: 'file' } },
  cimFileTraffic: { type: 'cimTrend', config: { subject: 'file' } },
  cimTopFiles: { type: 'cimRanking', config: { facet: 'files' } },
  cimTopWikis: { type: 'cimRanking', config: { facet: 'wikis' } },
  cimTopPages: { type: 'cimRanking', config: { facet: 'pages' } },
  cimTopEditors: { type: 'cimRanking', config: { facet: 'editors' } },
  cimLeaderboard: { type: 'cimRanking', config: { facet: 'categories' } },
};
// Eight ids, not nine: `cimTrend` kept its own name — the merged trend type answers for a category by default, which
// is exactly what the old widget meant, so a board carrying the id reads as it always did and nothing has to be
// translated. Only the ids whose meaning is not the merged default appear above.

/** Is this the id of a CIM widget that used to be its own type? */
export function isLegacyCimId(typeId) {
  return Object.prototype.hasOwnProperty.call(LEGACY_CIM_IDS, typeId);
}

/**
 * Which subject a CIM stats/trend config is about.
 *
 * An explicit `subject` wins, because that is what the merged widget writes. Failing that, the field the config
 * carries decides — `filename` means a file, `category` means a category, the same rule `inferGallerySource` uses
 * and for the same reason: a hand-written board should not have to know when the merge happened. The retired id's
 * meaning is the last resort, and `category` the default, because that is the arm the family shipped with.
 */
export function cimSubject(config = {}, typeId) {
  if (CIM_SUBJECTS.includes(config.subject)) return config.subject;
  if (config.filename) return 'file';
  if (config.category) return 'category';
  const legacy = LEGACY_CIM_IDS[typeId];
  return (legacy && legacy.config.subject) || 'category';
}

/** Which facet a CIM ranking config ranks. Explicit wins, then the retired id's meaning, then the flagship arm. */
export function cimFacet(config = {}, typeId) {
  if (CIM_FACETS.includes(config.facet)) return config.facet;
  const legacy = LEGACY_CIM_IDS[typeId];
  return (legacy && legacy.config.facet) || 'files';
}
