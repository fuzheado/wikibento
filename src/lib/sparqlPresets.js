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
    id: 'laureates-by-country',
    label: 'Nobel laureates by country',
    endpoint: 'wdqs',
    // The DEFAULT, and the reason is measured (2026-09-18): 2.9 s and 12 rows — a number and a bar chart, which is
    // what a dashboard card is for. It is bounded twice over, and that is what makes it safe: anchored on ONE award
    // item (wd:Q38104 — the Nobel Prize) rather than on a collection, and a LIMIT on the group-by. A query that
    // counts an entire collection takes a minute or dies (see met-collection); this one cannot, however large
    // Wikidata grows.
    query: `SELECT ?country ?countryLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
    ?item wdt:P166 wd:Q38104 ;   # award received = Nobel Prize
          wdt:P27  ?country .    # country of citizenship
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
  }
  GROUP BY ?country ?countryLabel
  ORDER BY DESC(?count)
  LIMIT 12`,
  },
  {
    id: 'met-collection',
    label: 'Collection depth (Met)',
    endpoint: 'wdqs',
    // Measured 2026-09-18: an aggregate over an entire collection is the one shape WDQS cannot
    // answer quickly (>75 s, client gave up; narrowing to paintings only still took 41 s). Kept because it
    // answers a real question, marked slow, and never the default.
    cost: 'slow',
    query: `# SLOW: counts every item in the Met's collection — expect a minute or a timeout on WDQS. NARROW IT before running, e.g. add a type:
  #   ?item wdt:P31 wd:Q3305213 .
  SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item wdt:P195 wd:Q160236 .
}`,
  },
  {
    id: 'multi-institution',
    label: 'Collection depth — multiple institutions',
    endpoint: 'wdqs',
    // Measured 2026-09-18: an aggregate over an entire collection is the one shape WDQS cannot
    // answer quickly (>75 s, client gave up; narrowing to paintings only still took 41 s). Kept because it
    // answers a real question, marked slow, and never the default.
    cost: 'slow',
    query: `# SLOW: scans four collections at once — expect a minute or a timeout on WDQS. NARROW IT before running, e.g. add a type:
  #   ?item wdt:P31 wd:Q3305213 .
  SELECT ?institution ?institutionLabel (COUNT(DISTINCT ?item) AS ?count) WHERE {
  VALUES ?institution { wd:Q160236 wd:Q190804 wd:Q6373 wd:Q131626 }
  ?item wdt:P195 ?institution .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
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
    query: `SELECT ?who ?whoLabel ?date ?kind ?what ?whatLabel WHERE {
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
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?who ?date`,
  },
  {
    id: 'curie-pair',
    label: 'Two lives, one axis (Marie × Pierre Curie)',
    endpoint: 'wdqs',
    // Same query shape as `two-lives`, different pair — and the pair that shows why the alignment
    // toggle exists: on a calendar axis he starts in 1859 and she in 1867 (eight years apart, so his
    // childhood has no counterpart), while aligned at birth their shared years line up exactly.
    // Pair it with align: 'age' (see public/parallel-lives-demo.json).
    query: `SELECT ?who ?whoLabel ?date ?kind ?what ?whatLabel WHERE {
  VALUES ?who { wd:Q7186 wd:Q37463 }
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
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
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
