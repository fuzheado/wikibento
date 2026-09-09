/**
 * Multilingual robustness fixtures (2026-09-09) — the same intents as
 * tests/intent-fixtures.mjs, prompted in European languages. The LiftWing
 * models are multilingual; the Ask advisor was only ever benchmarked in
 * English. Subjects stay ASCII-safe so tests/intent-benchmark-lib.mjs
 * subjectMatches ([a-z0-9]+ tokenization) applies unchanged.
 *
 * Run: WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs \
 *        --fixtures ./tests/fixture-multilingual.mjs --via toolforge
 */
export const INTENT_FIXTURES = [
  {
    id: 'pageviews-article-es',
    prompt: '¿Cuántas visitas ha tenido el artículo Ada Lovelace en los últimos 30 días?',
    expected: { widgetType: 'pageviews', config: { article: 'Ada Lovelace' } },
    requireSubject: true,
    note: 'Spanish — article title stays in English (enwiki default)',
  },
  {
    id: 'excerpt-article-fr',
    prompt: "Montre-moi le résumé de l'article Albert Einstein avec sa description",
    expected: { widgetType: 'excerpt', config: { article: 'Albert Einstein' } },
    requireSubject: true,
    note: 'French — excerpt',
  },
  {
    id: 'wikistats-language-de',
    prompt: 'Wie viele Artikel, Bearbeitungen und aktive Benutzer hat die italienische Wikipedia?',
    expected: { widgetType: 'wikistats', config: { lang: 'it' } },
    requireSubject: true,
    note: 'German prompt asking about the ITALIAN edition — cross-language extraction',
  },
  {
    id: 'gallery-article-it',
    prompt: 'Mostra le immagini utilizzate nella voce Albert Einstein',
    expected: { widgetType: 'gallery', config: { article: 'Albert Einstein' } },
    requireSubject: true,
    note: 'Italian — gallery',
  },
  {
    id: 'category-sample-photos-pt',
    prompt: 'Mostre uma amostra aleatória de imagens da categoria Featured pictures on Wikimedia Commons',
    expected: { widgetType: 'categorySize', config: { category: 'Featured pictures on Wikimedia Commons' } },
    requireSubject: true,
    note: 'Portuguese prompt, English category name (real Commons category)',
  },
  {
    id: 'quality-article-es',
    prompt: '¿Qué clase de calidad predice el modelo ORES para el artículo Marie Curie?',
    expected: { widgetType: 'quality', config: { article: 'Marie Curie' } },
    requireSubject: true,
    note: 'Spanish — ORES quality',
  },
];
