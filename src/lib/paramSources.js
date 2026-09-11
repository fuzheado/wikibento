/**
 * Named option sources for `lookup` board params (ISSUE-67).
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
 *    debounce, no requests. `cim-category` seeds from the 886 categories
 *    registered via the documented `{{Views from category}}` route (2 requests /
 *    ~48 KB, verified 2026-09-10) AND falls back to server search, because that
 *    list is only a partial view of what CIM processes (see below).
 *
 *  · search — the namespace is unbounded (millions of Commons categories, all
 *    articles), so suggestions must come from the server: CirrusSearch for
 *    categories, `prefixsearch` for files/articles, `wbsearchentities` for
 *    Wikidata. Validation is then best-effort existence, NOT capability.
 *
 * WHY THE CAPABILITY CHECK IS A LIVE PROBE, NOT A LIST LOOKUP (found 2026-09-10)
 * The template list is only a PARTIAL view of what CIM processes, so treating it
 * as proof would warn users about categories that work fine:
 *
 *     Images from Metropolitan Museum of Art       389,036 files, NOT in the list
 *     Images from the Rijksmuseum                      6,866 files, NOT in the list
 *     Files from the Biodiversity Heritage Library   305,997 files, IS in the list
 *
 * (Neither `Template:Source category` — 4,000+ categories, and it does contain
 * the Library of Congress — nor a union of templates enumerates the universe.)
 * The authoritative check is the one the widgets already use: request the CIM
 * snapshot for the resolved month and read the status — 200 = has data; 404 =
 * unregistered or no data, disambiguated against the latest PUBLISHED month
 * (probing the calendar's previous month would misread the month-start publish
 * lag as "unregistered" — the bug fixed 2026-09-01).
 *
 * So the list supplies instant SUGGESTIONS and the probe supplies the VERDICT;
 * suggestions fall back to CirrusSearch so a category outside the list (the Met!)
 * is still findable by typing its name.
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

/** The template whose transclusion is the DOCUMENTED CIM registration route.
 *  A useful seed list — but NOT the whole registered universe (see below). */
const CIM_TEMPLATE = 'Template:Views from category';

/** CIM registration is processed monthly — a day-long cache is plenty. */
const CIM_REGISTERED_TTL = 24 * 60 * 60 * 1000;

/** Safety valve: `embeddedin` pages 500 at a time; ~886 entries need 2. */
const MAX_CIM_PAGES = 12;

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
export function capabilityState({ value, registered, exists }) {
  const v = String(value ?? '').trim();
  if (!v) return 'empty';
  if (registered) {
    if (registered.has(v)) return 'ok';
    if (exists === true) return 'unregistered';
    if (exists === false) return 'invalid';
    return 'unknown';
  }
  if (exists === true) return 'ok';
  if (exists === false) return 'invalid';
  return 'unknown';
}

/** `list=embeddedin` payload → bare category titles (pure; testable). */
export function parseEmbeddedIn(json) {
  const rows = json?.query?.embeddedin;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => String(r?.title || '').replace(/^Category\s*:\s*/i, ''))
    .filter(Boolean);
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

// ── enumerable source: the CIM-registered category set ──────────────────────

const cimRegistered = createTtlCache(CIM_REGISTERED_TTL);

/** Fetch (once per day) every category Commons Impact Metrics processes.
 *  Paginates `list=embeddedin` on the registration template. Failures are not
 *  cached (createTtlCache drops them) so a transient error self-heals. */
export function loadCimRegistered() {
  return cimRegistered.get('cim-registered', async () => {
    const out = [];
    let cont = null;
    for (let page = 0; page < MAX_CIM_PAGES; page++) {
      const params = new URLSearchParams({
        action: 'query',
        list: 'embeddedin',
        eititle: CIM_TEMPLATE,
        einamespace: '14',
        eilimit: '500',
        format: 'json',
        formatversion: '2',
        origin: '*',
      });
      if (cont) for (const [k, v] of Object.entries(cont)) params.set(k, v);
      const json = JSON.parse(await fetchTextWithRetry(`${COMMONS_API}?${params}`, { timeoutMs: 20000 }));
      out.push(...parseEmbeddedIn(json));
      cont = json?.continue || null;
      if (!cont) break;
    }
    return out.map((c) => c.replace(/_/g, ' '));
  });
}

/** The loaded set as a Set for O(1) membership — resolved for the UI badge. */
export async function loadCimRegisteredSet() {
  return new Set(await loadCimRegistered());
}

/** Drop the cached set (Refresh / tests). */
export function clearParamSourceCaches() {
  cimRegistered.clear();
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
 * `curated` is not listed: it IS the param's own `options` list (the pre-ISSUE-67
 * behaviour), handled by the control directly.
 */
export const PARAM_SOURCES = {
  'cim-category': {
    id: 'cim-category',
    label: 'Commons category (CIM-friendly)',
    // seed list first (instant), then CirrusSearch so categories outside the
    // template-registered seed are still findable — the Met is one of them.
    kind: 'enumerable',
    search: searchCommonsCategories,
    placeholder: 'Metropolitan Museum of Art',
    hint: 'Known CIM categories are suggested instantly; others are searched live and then checked.',
    load: loadCimRegistered,
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
    // Capability is PROBED, not inferred from the seed list — the list is partial
    // (the Met and the Rijksmuseum have CIM data but are not in it). Membership is
    // still a fast, offline-confirmable "ok".
    let registered;
    try {
      registered = await loadCimRegisteredSet();
    } catch {
      registered = null;
    }
    if (registered?.has(v)) return { state: 'ok', note: 'registered with Commons Impact Metrics' };
    let status;
    try {
      status = await probeCimCategory(v);
    } catch {
      return { state: 'unknown', note: 'could not check Commons Impact Metrics' };
    }
    if (status === 200) return { state: 'ok', note: 'has Commons Impact Metrics data' };
    if (status === 404) {
      // The 404 is ambiguous (unregistered OR no data for the month) — only call
      // it unregistered when the category page does not exist at all.
      let exists;
      try {
        exists = await categoryExists(v);
      } catch {
        exists = undefined;
      }
      return {
        state: capabilityState({ value: v, registered, exists }),
        note: exists === false
          ? 'no such Commons category'
          : 'not in Commons Impact Metrics — CIM cards will offer to register it',
      };
    }
    return { state: 'unknown', note: `Commons Impact Metrics returned ${status}` };
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
    await fetchTextWithRetry(url, { timeoutMs: 20000, retries: 0, withBody: true });
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
