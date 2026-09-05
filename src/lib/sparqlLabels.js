/**
 * Wikidata label resolution for SPARQL results (Issue #6).
 *
 * QLever (Commons SDC) does NOT support the `SERVICE wikibase:label`
 * magic — it tries to federate to a dead host — so the "most-depicted
 * subjects" preset (and any query on QLever that asks for an entity
 * without its label) comes back with bare QIDs. WDQS supports the
 * SERVICE, but an arbitrary user query on ANY endpoint may return
 * entity URIs without requesting their labels.
 *
 * The widget's data path (fetchSparql in dataSources.js) therefore
 * post-processes every SPARQL result: cell values whose source binding
 * was a Wikidata entity URI (http://www.wikidata.org/entity/Q34442) are
 * batch-resolved to their human label via the Action API
 * (`wbgetentities`) and displayed as "road (Q34442)" — the QID stays
 * visible for traceability. Detection happens on the RAW binding
 * (binding.type === 'uri') BEFORE URI shortening, so a literal that
 * merely reads "Q123" can never be misdetected, and non-Wikidata URIs
 * are never touched.
 *
 * Everything here is a pure helper (no fetch, no cache) so tests can
 * exercise detection/batching/language offline. The fetching + 24 h TTL
 * cache live in dataSources.js (fetchSparql); labels are stable, so a
 * day-long cache is safe and the label fetch rides the widget's own
 * refresh lifecycle (no second refresh interval).
 */

const WIKIDATA_ENTITY_RE = /^https?:\/\/(?:www\.)?wikidata\.org\/entity\/(Q\d+|P\d+)$/;

/** When a binding value is a Wikidata entity/property URI → its Q/P id; else null. */
export function wikidataEntityId(value) {
  const m = WIKIDATA_ENTITY_RE.exec(String(value ?? ''));
  return m ? m[1] : null;
}

/** navigator.language ('en-US', 'FR-fr') → primary subtag ('en', 'fr'); fallback 'en'. */
export function labelLanguage(navigatorLanguage) {
  const raw = String(navigatorLanguage ?? '').trim();
  if (!raw) return 'en';
  const primary = raw.split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(primary) ? primary : 'en';
}

/** Split an id list into ≤ `size`-id chunks (wbgetentities caps `ids` at 50). */
export function chunkIds(ids, size = 50) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/**
 * wbgetentities URL for one chunk of ids. `languages` requests the user
 * language PLUS en (both are returned — verified live), so a missing
 * label in the user's language never falls back to a bare QID when an
 * English label exists; `uselang` per the MediaWiki convention.
 * CORS is fine with `origin=*`.
 */
export function buildLabelRequestUrl(ids, lang) {
  const languages = lang === 'en' ? 'en' : `${lang}|en`;
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'labels',
    languages,
    uselang: lang,
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  return `https://www.wikidata.org/w/api.php?${params}`;
}

/** formatversion=2 wbgetentities envelope → { [id]: label | null } (user language first, en fallback). */
export function parseLabelResponse(json, lang) {
  const out = {};
  for (const [id, ent] of Object.entries(json?.entities ?? {})) {
    const labels = ent?.labels ?? {};
    out[id] = labels[lang]?.value || labels.en?.value || null;
  }
  return out;
}

/**
 * Should cells of this var be re-labelled? A var is skipped when its own
 * name marks it as a label column (?xLabel — the WDQS SERVICE convention)
 * or when the query already asks for this var's label (SELECT ?x ?xLabel
 * …): re-labelling would duplicate the label next to its own column. Any
 * other entity var gets the human label.
 */
export function shouldResolveVar(varName, vars) {
  if (/label$/i.test(varName)) return false;
  if (vars.includes(`${varName}Label`)) return false;
  return true;
}

/** "Cat (Q146)" display text — the raw value (QID) is kept when no label was found. */
export function displayValue(value, label) {
  return label ? `${label} (${value})` : value;
}

/**
 * Post-process one SPARQL result: resolve entity cells to "Label (QID)".
 *
 * `cells` = [{ r, v, id }] collected from the raw bindings (row index,
 * var name, entity id — see fetchSparql). Cells whose var fails
 * `shouldResolveVar` are ignored; the remaining ids are deduped, chunked
 * ≤ 50, and resolved through `fetchBatch(idsChunk, lang)` →
 * Promise<{ [id]: label }>. A chunk failure is swallowed (labels are
 * best-effort enrichment — the raw QID stays, the SPARQL result never
 * fails because a label lookup failed). Rows are mutated in place.
 * Returns the number of cells re-labelled.
 */
export async function enrichEntityLabels(rows, cells, vars, { lang = 'en', fetchBatch } = {}) {
  if (!fetchBatch || !cells?.length) return 0;
  const wanted = cells.filter((c) => shouldResolveVar(c.v, vars));
  if (!wanted.length) return 0;
  const ids = [...new Set(wanted.map((c) => c.id))];
  const labels = {};
  for (const chunk of chunkIds(ids, 50)) {
    let got = {};
    try {
      got = (await fetchBatch(chunk, lang)) || {};
    } catch {
      // Labels are best-effort — leave raw QIDs in place.
    }
    Object.assign(labels, got);
  }
  let relabelled = 0;
  for (const c of wanted) {
    const label = labels[c.id];
    if (!label) continue;
    rows[c.r][c.v] = displayValue(rows[c.r][c.v], label);
    relabelled++;
  }
  return relabelled;
}
