/**
 * Commons Impact Metrics allow list — the shared constants and parser.
 *
 * Kept in a module with NO imports on purpose: the app (via src/lib/paramSources.js)
 * and the build-time snapshot fetcher (scripts/fetch-cim-allow-list.mjs) both need
 * this parser, and a dependency-free file is importable by plain Node — the app's
 * other modules use extensionless imports that only Vite/esbuild resolve.
 *
 * WHAT THE LIST IS: the categories WMF Data Engineering processes for Commons
 * Impact Metrics (~1,775 primary categories; subcategories up to 7 levels deep also
 * have data). It is the authoritative *enumeration*, published as a TSV. It is NOT
 * related to the `{{Views from category}}` template, which is the legacy COM:VIEWS
 * category-page-views system and registers nothing (see docs/ISSUE-68 / the
 * `wikimedia-commons` skill).
 */

/** Upstream TSV: one underscored category slug per line, no header, no CORS. */
export const CIM_ALLOW_LIST_URL =
  'https://gitlab.wikimedia.org/repos/data-engineering/airflow-dags/-/raw/main/main/dags/commons/commons_category_allow_list.tsv';

/** Where the build-time snapshot lives (same-origin for the browser). */
export const CIM_ALLOW_LIST_SNAPSHOT = '/cim-allow-list.json';

/** The upstream list changes at month-end; warn when the snapshot is older. */
export const CIM_ALLOW_LIST_MAX_AGE_DAYS = 180;

/**
 * Parse the allow-list TSV → bare category titles with spaces (the form the CIM
 * API and the widgets use). Tolerates a BOM, blank lines and `#` comments;
 * dedupes. Pure, so the contract is covered by tests.
 */
export function parseAllowList(text) {
  const out = [];
  const seen = new Set();
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    // One slug per line; take the first field in case a tab ever appears.
    const slug = line.split('\t')[0].trim();
    const title = slug.replace(/^Category\s*:\s*/i, '').replace(/_/g, ' ').trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

/** Parse the bundled snapshot (`{ source, fetchedAt, count, categories }`). */
export function parseAllowListSnapshot(text) {
  const data = JSON.parse(text);
  const categories = Array.isArray(data) ? data : data?.categories;
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('allow-list snapshot has no categories');
  }
  return {
    source: data?.source || CIM_ALLOW_LIST_URL,
    fetchedAt: data?.fetchedAt || '',
    categories: categories.map(String),
  };
}
