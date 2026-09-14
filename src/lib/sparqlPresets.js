/**
 * SPARQL widget query library — the "unlock" presets.
 *
 * Each preset = { id, label, endpoint, query }. Picking one in the ⚙ panel
 * fills the query textarea (and the endpoint select). All queries verified
 * live 2026-08-13:
 *  - P1/P2 run on WDQS (CORS *, seconds);
 *  - P3 is NOT SPARQL — Humaniki (humaniki.wmcloud.org) precomputes the
 *    gender gap; the full WDQS double-subquery times out (504, verified);
 *  - P4 runs on QLever (qlever.dev), which REQUIRES explicit PREFIXes
 *    (WDQS's Blazegraph auto-registers wd:/wdt:/p:/ps:/pq:; QLever does not).
 */

export const SPARQL_ENDPOINTS = {
  wdqs: {
    id: 'wdqs',
    label: 'Wikidata (WDQS)',
    url: 'https://query.wikidata.org/sparql',
  },
  'qlever-commons': {
    id: 'qlever-commons',
    label: 'Commons SDC (QLever)',
    url: 'https://qlever.dev/api/wikimedia-commons',
  },
  humaniki: {
    id: 'humaniki',
    label: 'Humaniki (gender gap, precomputed)',
    url: 'https://humaniki.wmcloud.org/api/v1/gender/gap/latest/gte_one_sitelink/properties',
  },
};

export const SPARQL_PRESETS = [
  {
    id: 'met-collection',
    label: 'Collection depth (Met)',
    endpoint: 'wdqs',
    query: `SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item wdt:P195 wd:Q160236 .
}`,
  },
  {
    id: 'multi-institution',
    label: 'Collection depth — multiple institutions',
    endpoint: 'wdqs',
    query: `SELECT ?institution ?institutionLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
  VALUES ?institution { wd:Q160236 wd:Q190804 wd:Q6373 wd:Q131626 }
  ?item wdt:P195 ?institution .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?institution ?institutionLabel
ORDER BY DESC(?count)`,
  },
  {
    id: 'two-lives',
    label: 'Two lives, one axis (Anne Frank × Martin Luther King Jr.)',
    endpoint: 'wdqs',
    // Renders with the `timeline` renderer (see src/lib/timeline.js). Both subjects are deceased
    // people, which is what makes the FILTER below both possible and necessary: Wikidata records
    // POSTHUMOUS awards (MLK has honours dated 1977, 1978, 1984, 2004), and a life timeline that
    // does not stop at death ends with prizes won decades after the subject died. Filtering at the
    // query means the renderer never has to know about it.
    //
    // What this query can and cannot reach, measured 2026-09-12: Wikidata dates what is recordable
    // — birth, death, education, posts, awards, residences (7 events for Anne Frank) — and holds
    // almost nothing of what makes a life narratable: no entry for the diary, the arrest or the
    // transports; and for MLK none for the bus boycott, Birmingham, the March on Washington or
    // Selma. The article prose is where those live (~5–8× more dated material: 66 vs 7 and 139 vs
    // 14 dated statements). See docs/LIFELINE-WIDGET.md.
    query: `SELECT ?who ?whoLabel ?date ?kind ?whatLabel WHERE {
  VALUES ?who { wd:Q4583 wd:Q8027 }
  ?who wdt:P570 ?died .
  { ?who wdt:P569 ?date . BIND("born" AS ?kind) } UNION
  { ?who wdt:P570 ?date . BIND("died" AS ?kind) } UNION
  { ?who p:P69  ?st . ?st ps:P69  ?what ; pq:P580 ?date . BIND("studied at" AS ?kind) } UNION
  { ?who p:P108 ?st . ?st ps:P108 ?what ; pq:P580 ?date . BIND("worked at" AS ?kind) } UNION
  { ?who p:P39  ?st . ?st ps:P39  ?what ; pq:P580 ?date . BIND("held office" AS ?kind) } UNION
  { ?who p:P166 ?st . ?st ps:P166 ?what ; pq:P585 ?date . BIND("awarded" AS ?kind) } UNION
  { ?who p:P26  ?st . ?st ps:P26  ?what ; pq:P580 ?date . BIND("married" AS ?kind) } UNION
  { ?who p:P551 ?st . ?st ps:P551 ?what ; pq:P580 ?date . BIND("lived in" AS ?kind) }
  FILTER(?date <= ?died)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?who ?date`,
  },
  {
    id: 'women-in-red',
    label: 'Women in Red — % of enwiki biographies that are women',
    endpoint: 'humaniki',
    query: '', // served by the Humaniki API, not SPARQL
  },
  {
    id: 'commons-top-depicts',
    label: 'Commons — most-depicted subjects (JPEGs, QLever)',
    endpoint: 'qlever-commons',
    query: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
SELECT ?depicts (COUNT(?file) AS ?count) WHERE {
  ?file wdt:P180 ?depicts ;
         schema:encodingFormat "image/jpeg" .
}
GROUP BY ?depicts ORDER BY DESC(?count) LIMIT 25`,
  },
];

/** Resolve a preset by id (undefined when unknown). */
export function getPreset(id) {
  return SPARQL_PRESETS.find((p) => p.id === id);
}
