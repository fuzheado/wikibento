/**
 * Named option sources for `lookup` board params (ISSUE-68).
 *
 * WHY THIS EXISTS
 * A Board Controls param could already be a fixed pull-down (`select`) or free
 * text (`text`), but not *checked* text: nothing stopped a user from typing a
 * category that doesn't exist — or, worse for the GLAM case, one that exists on
 * Commons but is not registered with Commons Impact Metrics, so all nine CIM
 * widgets show a "register this category" prompt. The museum/library dashboard
 * therefore needs a producer that both suggests and validates.
 *
 * TWO KINDS OF SOURCE (the distinction drives the whole design)
 *
 *  · enumerable — a small, fetchable option set that we download once (24 h TTL,
 *    shared in-flight promise) and filter LOCALLY: instant suggestions, no
 *    debounce, no requests. `cim-category` seeds from the **allow list itself**
 *    and falls back to server search for everything else.
 *
 *  · search — the namespace is unbounded (millions of Commons categories, all
 *    articles), so suggestions must come from the server: CirrusSearch for
 *    categories, `prefixsearch` for files/articles, `wbsearchentities` for
 *    Wikidata. Validation is then best-effort existence, NOT capability.
 *
 * THE CIM ALLOW LIST, AND THE TEMPLATE THAT LOOKS LIKE IT (corrected 2026-09-11)
 * Commons Impact Metrics processes an allow list of ~1,775 primary categories
 * (plus subcategories up to 7 levels deep), published as a TSV by WMF Data
 * Engineering — that TSV is the authoritative enumeration, and this module reads
 * it (73 KB, one category per line, underscored slugs):
 *
 *   https://gitlab.wikimedia.org/repos/data-engineering/airflow-dags/-/raw/main/
 *     main/dags/commons/commons_category_allow_list.tsv
 *
 * It is NOT CORS-enabled, so the browser reaches it through the deployment's
 * generic `/api/proxy` relay (the same mechanism the Top-pages widget uses for
 * hatnote). Where the relay is absent the source degrades to search-only
 * suggestions + probe validation.
 *
 * ⚠️ `{{Views from category}}` does NOT register a category. It is the legacy
 * "category page views" table system (COM:VIEWS) and is a correlation trap:
 * 872 of the 886 categories that transclude it (98.4%) are allow-listed anyway,
 * simply because GLAM categories commonly have both; the 14 that are not
 * allow-listed return 404 on a live CIM probe. An earlier revision of this module
 * seeded from `list=embeddedin` on that template and called it "the documented
 * registration route" — which produced false "not registered" verdicts for
 * categories that work fine (the Met, the Rijksmuseum, the Library of Congress,
 * the National Gallery of Art are all allow-listed and none of them transclude
 * it). Registration is a **Phabricator request** (project
 * `Commons-Impact-Metrics-Requests`), processed by staff at month-end (submit by
 * the 20th, no retroactive backfill) — never a page edit. Source: the
 * `wikimedia-commons` skill's Commons Impact Metrics section.
 *
 * A probe is still required in addition to the list: subcategories (up to 7
 * levels deep) have data without being on the list by name, and a listed
 * category can have no data for a particular month. The probe asks CIM for the
 * resolved month — 200 = has data; 404 = not processed (or no data for that
 * month), disambiguated against the latest PUBLISHED month (probing the
 * calendar's previous month would misread the month-start publish lag as
 * "unregistered" — the bug fixed 2026-09-01).
 *
 * So the allow list supplies instant SUGGESTIONS **and** a definitive `ok`, and
 * the probe settles everything else; suggestions fall back to CirrusSearch so a
 * subcategory or a brand-new category is still findable by typing its name.
 *
 * CirrusSearch rather than prefixsearch for categories (verified 2026-09-10):
 * GLAM categories are named `Images from X` / `Files from Y`, so a prefix search
 * can never find them — `list=prefixsearch&pssearch=Smithsonian&psnamespace=14`
 * returns only `Category:Smithsonian*`. A `hastemplate:` filter was also tried
 * and rejected: the template's own rendered text is indexed, so it matched
 * almost anything ("Met" hit `Hallands kulturhistoriska museum`).
 *
 * Validation never blocks a board: a failed check degrades to `unknown` and the
 * widget still works (the same best-effort contract as SPARQL label resolution).
 */

import { fetchTextWithRetry } from './httpRetry';
import { createTtlCache } from './fetchCache';
import { latestCimMonth } from '../widgets/dataSources';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const CIM_BASE = 'https://wikimedia.org/api/rest_v1/metrics/commons-analytics/';

/** The CIM allow list — the authoritative set of categories CIM processes.
 *  Not CORS-enabled: reached through the deployment's /api/proxy relay. */
const CIM_ALLOW_LIST_URL =
  'https://gitlab.wikimedia.org/repos/data-engineering/airflow-dags/-/raw/main/main/dags/commons/commons_category_allow_list.tsv';

/** The allow list changes at month-end — a day-long cache is plenty. */
const CIM_ALLOW_LIST_TTL = 24 * 60 * 60 * 1000;

// ── pure helpers (no network — covered by tests/param-lookup.test.mjs) ───────

/**
 * Canonicalize a typed value for a source: trim, underscores→spaces (the
 * Action API's canonical titles use spaces — gotcha #13), drop a redundant
 * `Category:` / `File:` prefix, collapse inner whitespace. CIM and the CIM
 * widgets want the BARE category title, which is also what the Ask relay's
 * normalizer enforces.
 */
export function normalizeLookupValue(sourceId, raw) {
  let v = String(raw ?? '').trim().replace(/_/g, ' ');
  if (sourceId === 'cim-category' || sourceId === 'commons-category') {
    v = v.replace(/^Category\s*:\s*/i, '');
  } else if (sourceId === 'commons-file') {
    v = v.replace(/^(File|Image)\s*:\s*/i, '');
  }
  return v.replace(/\s+/g, ' ').trim();
}

/** Case-insensitive match rank: exact (0) → prefix (1) → word start (2) →
 *  substring (3) → no match (null). Lower is better. */
export function matchRank(candidate, query) {
  const c = String(candidate).toLowerCase();
  const q = String(query).toLowerCase().trim();
  if (!q) return 0;
  if (c === q) return 0;
  if (c.startsWith(q)) return 1;
  if (new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(c)) return 2;
  if (c.includes(q)) return 3;
  return null;
}

/** Rank + filter a local option list. Empty query returns the first `limit`
 *  entries in their natural order (a browsable shortlist). */
export function filterLocal(list, query, limit = 8) {
  const scored = [];
  for (const item of list || []) {
    const rank = matchRank(item, query);
    if (rank === null) continue;
    scored.push({ item, rank });
  }
  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * The three-state verdict (plus two edge cases) for a typed value.
 *  ok           — capability-proven (in the registered set, or a curated list)
 *  unregistered — real, but the CIM widgets will show the register prompt
 *  invalid      — nothing by that name
 *  unknown      — could not check (offline / list failed to load)
 *  empty        — no value yet
 */
/**
 * The CIM verdict — the decision table the badge renders, kept pure so it is
 * covered by tests rather than buried in async code.
 *
 *  allowed  — is the category on the allow list? (null when the list is
 *             unreachable, which must NOT be read as "not allowed")
 *  status   — the snapshot probe's HTTP status (200 | 404 | 0 = inconclusive)
 *  exists   — does the Commons category page exist? (undefined = unchecked)
 *
 * `unregistered` (amber, registerable) is deliberately distinct from `invalid`
 * (red, a typo): the museum-dashboard UX turns on telling those apart.
 */
export function cimVerdict({ allowed, status, exists }) {
  if (allowed === true) return { state: 'ok', note: 'on the Commons Impact Metrics allow list' };
  if (status === 200) {
    return {
      state: 'ok',
      note: allowed === null
        ? 'has Commons Impact Metrics data'
        : 'has CIM data (a subcategory of an allow-listed category)',
    };
  }
  if (status === 404) {
    if (exists === false) return { state: 'invalid', note: 'no such Commons category' };
    return {
      state: 'unregistered',
      note: 'not on the Commons Impact Metrics allow list — request it via Phabricator (project Commons-Impact-Metrics-Requests)',
    };
  }
  return { state: 'unknown', note: status ? `Commons Impact Metrics returned ${status}` : 'could not check Commons Impact Metrics' };
}

/** Action API `list=search` / `list=prefixsearch` payload → bare titles. */
export function parseActionSearch(json, { stripNamespace = '' } = {}) {
  const q = json?.query;
  const rows = q?.search || q?.prefixsearch;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => String(r?.title || ''))
    .map((t) => (stripNamespace ? t.replace(new RegExp(`^${stripNamespace}\\s*:\\s*`, 'i'), '') : t))
    .filter(Boolean);
}

/** Wikidata `wbsearchentities` payload → "Label (Q123)" display strings, with
 *  the bare QID kept alongside so the committed value stays an id. */
export function parseWbSearchEntities(json) {
  const rows = json?.search;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => /^[QP]\d+$/.test(String(r?.id || '')))
    .map((r) => ({ value: r.id, label: r.label ? `${r.label} (${r.id})` : r.id }));
}

// ── enumerable source: the CIM allow list ──────────────────────────────────

const cimAllowList = createTtlCache(CIM_ALLOW_LIST_TTL);

/** Parse the allow-list TSV → bare category titles with spaces (the form the
 *  CIM API and the widgets use). Tolerates a BOM, blank lines and comments;
 *  dedupes. Pure, so the contract is covered by tests. */
export function parseAllowList(text) {
  const out = [];
  const seen = new Set();
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    // The TSV holds one underscored slug per line (a category may contain tabs
    // only in theory; take the first field if one appears).
    const slug = line.split('\t')[0].trim();
    const title = slug.replace(/^Category\s*:\s*/i, '').replace(/_/g, ' ').trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

/**
 * Fetch (once per day) every category on the CIM allow list.
 *
 * The TSV is not CORS-enabled, so this goes through the deployment's generic
 * `/api/proxy` relay first (same-origin, and the same mechanism the Top-pages
 * widget uses for hatnote); a direct fetch is attempted second for hosts that
 * serve it with CORS (and for tests). Failures are not cached (createTtlCache
 * drops them) so a transient error self-heals, and callers treat an
 * unreachable list as "no seed": suggestions fall back to search and the probe
 * still supplies the verdict.
 */
export function loadCimAllowList() {
  return cimAllowList.get('cim-allow-list', async () => {
    const proxied = `/api/proxy?url=${encodeURIComponent(CIM_ALLOW_LIST_URL)}`;
    let text;
    try {
      const payload = JSON.parse(await fetchTextWithRetry(proxied, { timeoutMs: 15000 }));
      if (!payload || payload.status !== 200 || typeof payload.body !== 'string') {
        throw new Error(`proxy returned ${payload?.status}`);
      }
      text = payload.body;
    } catch {
      text = await fetchTextWithRetry(CIM_ALLOW_LIST_URL, { timeoutMs: 15000 });
    }
    const list = parseAllowList(text);
    if (!list.length) throw new Error('allow list was empty');
    return list;
  });
}

/** The allow list as a Set for O(1) membership — resolved for the UI badge. */
export async function loadCimAllowListSet() {
  return new Set(await loadCimAllowList());
}

/** Drop the cached set (Refresh / tests). */
export function clearParamSourceCaches() {
  cimAllowList.clear();
}

// ── search sources ──────────────────────────────────────────────────────────

/** CirrusSearch over Commons categories — full-text, which is the only thing
 *  that finds `Images from Metropolitan Museum of Art` from "Metropolitan". */
async function searchCommonsCategories(query, limit) {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srnamespace: '14',
    srlimit: String(limit), format: 'json', formatversion: '2', origin: '*',
  });
  const json = JSON.parse(await fetchTextWithRetry(`${COMMONS_API}?${params}`, { timeoutMs: 15000 }));
  return parseActionSearch(json, { stripNamespace: 'Category' });
}

/** Files live in namespace 6 and DO read left-to-right, so prefix search is
 *  the right (and cheapest) primitive here. */
async function searchCommonsFiles(query, limit) {
  const params = new URLSearchParams({
    action: 'query', list: 'prefixsearch', pssearch: query, psnamespace: '6',
    pslimit: String(limit), format: 'json', formatversion: '2', origin: '*',
  });
  const json = JSON.parse(await fetchTextWithRetry(`${COMMONS_API}?${params}`, { timeoutMs: 15000 }));
  return parseActionSearch(json, { stripNamespace: 'File' });
}

/** Article titles start with their subject, so prefix search fits. (Slice 2
 *  will make the wiki project-aware; en.wikipedia is the default here.) */
async function searchArticles(query, limit) {
  const params = new URLSearchParams({
    action: 'query', list: 'prefixsearch', pssearch: query, psnamespace: '0',
    pslimit: String(limit), format: 'json', formatversion: '2', origin: '*',
  });
  const json = JSON.parse(await fetchTextWithRetry(`${WIKI_API}?${params}`, { timeoutMs: 15000 }));
  return parseActionSearch(json);
}

async function searchWikidataItems(query, limit) {
  const params = new URLSearchParams({
    action: 'wbsearchentities', search: query, language: 'en', uselang: 'en',
    limit: String(limit), format: 'json', origin: '*',
  });
  const json = JSON.parse(await fetchTextWithRetry(`${WIKIDATA_API}?${params}`, { timeoutMs: 15000 }));
  return parseWbSearchEntities(json);
}

// ── the registry ────────────────────────────────────────────────────────────

/**
 * `curated` is not listed: it IS the param's own `options` list (the pre-ISSUE-68
 * behaviour), handled by the control directly.
 */
export const PARAM_SOURCES = {
  'cim-category': {
    id: 'cim-category',
    label: 'Commons category (Commons Impact Metrics)',
    // allow list first (instant + definitive), then CirrusSearch so a
    // subcategory or an unlisted category is still findable by name.
    kind: 'enumerable',
    search: searchCommonsCategories,
    placeholder: 'Metropolitan Museum of Art',
    hint: 'Allow-listed CIM categories are suggested instantly; anything else is searched live and then checked.',
    load: loadCimAllowList,
  },
  'commons-category': {
    id: 'commons-category',
    label: 'Commons category (any)',
    kind: 'search',
    placeholder: 'Images from …',
    hint: 'Any Commons category. CIM widgets only show data for registered ones.',
    search: searchCommonsCategories,
  },
  'commons-file': {
    id: 'commons-file',
    label: 'Commons file',
    kind: 'search',
    placeholder: 'The Earth seen from Apollo 17.jpg',
    hint: 'File title without the File: prefix.',
    search: searchCommonsFiles,
  },
  article: {
    id: 'article',
    label: 'Wikipedia article (en)',
    kind: 'search',
    placeholder: 'Albert Einstein',
    hint: 'English Wikipedia article title.',
    search: searchArticles,
  },
  'wikidata-item': {
    id: 'wikidata-item',
    label: 'Wikidata item',
    kind: 'search',
    placeholder: 'Metropolitan Museum of Art',
    hint: 'Search Wikidata; the committed value is the QID.',
    search: searchWikidataItems,
  },
};

/** Source ids accepted in a spec line / JSON (`curated` = the options list). */
export const PARAM_SOURCE_IDS = ['curated', ...Object.keys(PARAM_SOURCES)];

/** Descriptor for a source id, or null when unknown (the control then falls
 *  back to a plain text input — an unknown source must never break a board). */
export function getParamSource(id) {
  const key = String(id || '').trim();
  if (!key || key === 'curated') return null;
  return PARAM_SOURCES[key] || null;
}

/** Seed-list hits first, then server hits, deduped case-insensitively
 *  (`cim-category` merges its local list with CirrusSearch results). */
export function mergeSuggestions(local, remote, limit = 8) {
  const out = [...(local || [])];
  const seen = new Set(out.map((s) => String(s).toLowerCase()));
  for (const r of remote || []) {
    const key = String(r).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(0, limit);
}

/** Suggest values for a source + query. Enumerable sources filter locally
 *  first (no request) and fall back to their server search when the local list
 *  cannot answer — the CIM seed list is partial, so "Metropolitan" must still
 *  find the Met even though it is not in the 886. Returns display strings. */
export async function suggestForSource(id, query, { limit = 8, options } = {}) {
  const source = getParamSource(id);
  if (!source) return filterLocal(options || [], query, limit);
  if (source.kind === 'enumerable') {
    const q = String(query || '').trim();
    // An empty query shows the hand-picked shortlist when the author gave one
    // (a lookup's `options` = "good starting points"), before the seed list.
    if (!q && options?.length) return filterLocal(options, '', limit);
    const local = filterLocal(await source.load(), query, limit);
    // Enough local hits, or nothing to search with, or no server search → done.
    if (local.length >= Math.min(limit, 3) || q.length < 2 || !source.search) return local;
    try {
      return mergeSuggestions(local, await source.search(q, limit), limit);
    } catch {
      return local;
    }
  }
  const q = String(query || '').trim();
  if (q.length < 2) return filterLocal(options || [], query, limit);
  return source.search(q, limit);
}

/**
 * Validate a committed value. `ok` means "will produce data here"; the control
 * shows an amber `unregistered` for real-but-unprocessed CIM categories rather
 * than a red error, because that is a registerable state, not a typo.
 */
export async function validateLookupValue(id, value, { options } = {}) {
  const source = getParamSource(id);
  const v = normalizeLookupValue(id, value);
  if (!v) return { state: 'empty' };
  if (!source) {
    // curated / unknown source: membership in the authored options list
    const opts = (options || []).map((o) => String(o));
    return { state: opts.length === 0 ? 'ok' : (opts.includes(v) ? 'ok' : 'invalid') };
  }
  if (source.kind === 'enumerable') {
    // The allow list is authoritative for PRIMARY categories — membership is a
    // definitive, offline-confirmable `ok`. Everything else (subcategories up to
    // 7 levels deep, which have data without being listed by name) is settled by
    // the live probe.
    let allowed = null; // null = list unreachable, NOT "not allowed"
    try {
      allowed = (await loadCimAllowListSet()).has(v);
    } catch {
      allowed = null;
    }
    if (allowed === true) return cimVerdict({ allowed: true });
    let status = 0;
    try {
      status = await probeCimCategory(v);
    } catch {
      status = 0;
    }
    // 404 is ambiguous (not allow-listed OR no data for that month) — only call it
    // a typo when the category page does not exist at all.
    let exists;
    if (status === 404) {
      try {
        exists = await categoryExists(v);
      } catch {
        exists = undefined;
      }
    }
    return cimVerdict({ allowed, status, exists });
  }
  // search sources: existence only (no capability notion)
  let exists;
  try {
    exists = await valueExists(id, v);
  } catch {
    return { state: 'unknown', note: 'could not verify' };
  }
  return { state: exists ? 'ok' : 'invalid', note: exists ? '' : `no such ${source.label.toLowerCase()}` };
}

/** Does an exact Commons category page exist? */
async function categoryExists(value) {
  const params = new URLSearchParams({
    action: 'query', titles: `Category:${value}`, format: 'json', formatversion: '2', origin: '*',
  });
  const json = JSON.parse(await fetchTextWithRetry(`${COMMONS_API}?${params}`, { timeoutMs: 15000 }));
  const page = json?.query?.pages?.[0];
  return Boolean(page && !page.missing);
}

/**
 * Ask Commons Impact Metrics directly whether a category has data — the only
 * authoritative capability check (see the header note). Uses the latest
 * PUBLISHED month, never the calendar's previous month, and treats 404 as a
 * verdict rather than an error. Returns the HTTP status, or 0 when the request
 * failed for another reason (network, 429, 5xx) — the caller maps that to
 * `unknown` rather than guessing.
 *
 * Note the fetch layer's contract: `withBody` attaches `.body` to the THROWN
 * error (4xx/5xx throw; only 2xx returns text), so the status is read from the
 * error message the same way `fetchCimMonth` does.
 */
async function probeCimCategory(value) {
  const { year, month } = await latestCimMonth();
  const start = `${year}${String(month).padStart(2, '0')}01`;
  const next = new Date(Date.UTC(year, month, 1)); // month is 1-based → next month
  const end = `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}01`;
  const url = `${CIM_BASE}category-metrics-snapshot/${encodeURIComponent(value.replace(/ /g, '_'))}/${start}/${end}`;
  try {
    // 8 s, not the usual 20–30 s: a throttled (429) or slow CIM response should
    // degrade to `unknown` promptly rather than leave the badge reading
    // "checking…" — verified live at ~18 s under a rate-limited burst, which was
    // honest but far too slow to be useful.
    await fetchTextWithRetry(url, { timeoutMs: 8000, retries: 0, withBody: true });
    return 200;
  } catch (e) {
    const m = /^HTTP (\d{3})/.exec(String(e?.message || ''));
    return m ? Number(m[1]) : 0;
  }
}

/** Existence check for the search sources (one exact-title lookup each). */
async function valueExists(id, value) {
  const source = getParamSource(id);
  const title = id === 'commons-file' ? `File:${value}`
    : id === 'commons-category' ? `Category:${value}`
      : value;
  if (source?.id === 'wikidata-item') {
    const params = new URLSearchParams({ action: 'wbgetentities', ids: value, props: 'info', format: 'json', origin: '*' });
    const json = JSON.parse(await fetchTextWithRetry(`${WIKIDATA_API}?${params}`, { timeoutMs: 15000 }));
    return Boolean(json?.entities && !json.entities[value]?.missing);
  }
  const api = id === 'article' ? WIKI_API : COMMONS_API;
  const params = new URLSearchParams({ action: 'query', titles: title, format: 'json', formatversion: '2', origin: '*' });
  const json = JSON.parse(await fetchTextWithRetry(`${api}?${params}`, { timeoutMs: 15000 }));
  const page = json?.query?.pages?.[0];
  return Boolean(page && !page.missing);
}
