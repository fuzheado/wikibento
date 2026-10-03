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

import { dbnameOf } from './reference';

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

/**
 * What a CIM card publishes (ISSUE-96).
 *
 * A CIM card is *about* something — one Commons category, or one Commons file — and **that** is what belongs on the
 * wire. The counts and the trend do not: ISSUE-96's second rule is that a number is not automatically worth
 * publishing, and the question each one has to answer is "what would consume this?". A list of names is what boards
 * actually pipe into Filters, Galleries and Maps; a pageview total is a reading, not a token.
 *
 * The form is a **reference**, not a bare name (ISSUE-92): `commonswiki:Category:Files from the BHL`,
 * `commonswiki:File:Dogs, jackals.jpg`, `enwiki:Marie Curie`. A title without its wiki is ambiguous the moment a
 * board crosses languages, and a CIM ranking is the first `lines` emitter whose every line carries its own project —
 * which is what `resolveRefLines` was written to read.
 */

/** `Dogs,_jackals.jpg` → `File:Dogs, jackals.jpg`: the title form Commons itself uses, idempotent if already given. */
function commonsTitle(raw, prefix) {
  let name = String(raw ?? '').trim();
  if (!name) return '';
  if (name.toLowerCase().startsWith(prefix.toLowerCase())) name = name.slice(prefix.length);
  name = name.replace(/_/g, ' ').trim();
  return name ? `${prefix}${name}` : '';
}

/** The subject of a stats/trend card as a reference. `''` when there is nothing to name (the emitter skips it). */
export function cimSubjectRef(config = {}, data = {}) {
  const subject = cimSubject(config);
  const title = subject === 'file'
    ? commonsTitle(data.file || config.filename, 'File:')
    : commonsTitle(data.category || config.category, 'Category:');
  return title ? `commonswiki:${title}` : '';
}

/**
 * One ranked row → one line of `cimRanking`'s output.
 *
 * Four of the five arms name a thing that lives somewhere, so four carry a reference. Two cannot, and say so rather
 * than inventing one: the wiki arm publishes the wiki code itself (`enwiki` — the dbname every Wikimedia API, dump
 * and replica already uses, so nothing has to be translated on the way out), and the editor arm publishes a bare
 * user name, because `top-editors-monthly` returns no wiki for the editor — a consumer that needs one must be
 * configured with it.
 */
export function cimRankingLine(facet, row = {}) {
  if (facet === 'files') {
    const title = commonsTitle(row.title, 'File:');
    return title ? `commonswiki:${title}` : '';
  }
  if (facet === 'wikis') return dbnameOf(row.wiki) || String(row.wiki ?? '').trim();
  if (facet === 'pages') {
    const title = String(row.page ?? '').trim();
    if (!title) return '';
    const dbname = dbnameOf(row.wiki);
    return dbname ? `${dbname}:${title}` : title;
  }
  if (facet === 'editors') return String(row.user ?? '').trim();
  if (facet === 'categories') {
    const title = commonsTitle(row.category, 'Category:');
    return title ? `commonswiki:${title}` : '';
  }
  return '';
}

/** The ranked list as the newline-joined text the wire carries. `''` when nothing survives. */
export function cimRankingLines(facet, rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => cimRankingLine(facet, row))
    .filter(Boolean)
    .join('\n');
}
