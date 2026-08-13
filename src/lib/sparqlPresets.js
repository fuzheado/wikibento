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
