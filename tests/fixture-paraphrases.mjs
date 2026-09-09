/**
 * Paraphrase-robustness fixtures (2026-09-09) — the same 15 ground-truth
 * intents as tests/intent-fixtures.mjs but with deliberately re-worded
 * prompts: different phrasing, different subjects, different structure.
 * Purpose: measure whether the Ask advisor GENERALIZES or has quietly
 * overfit to the fixture phrasings (and to the few-shot examples added
 * 2026-09-09 — the wayback example deliberately uses a different site, but
 * the rest of the prompt was tuned against these exact fixtures).
 *
 * Same expected values as the originals (same widgetType + config semantics),
 * so scoring is identical; only `prompt` (+ subject) differs. Run with:
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs \
 *     --fixtures ./tests/fixture-paraphrases.mjs --via toolforge
 */
export const INTENT_FIXTURES = [
  {
    id: 'pageviews-article',
    prompt: "I'm curious how much traffic the Grace Hopper article gets — daily views over the past month",
    expected: { widgetType: 'pageviews', config: { article: 'Grace Hopper' } },
    requireSubject: true,
  },
  {
    id: 'linkcount-domain',
    prompt: 'Do a count of en.wikipedia articles that link to bbc.co.uk',
    expected: { widgetType: 'linkcount', config: { domain: 'bbc.co.uk' } },
    requireSubject: true,
  },
  {
    id: 'category-sample-photos',
    prompt: 'Give me a random selection of pictures out of Category:Images from Wiki Loves Africa 2024',
    expected: { widgetType: 'categorySize', config: { category: 'Images from Wiki Loves Africa 2024' } },
    requireSubject: true,
    note: 'prompt has the "Category:" prefix the VALUE RULES say to strip',
  },
  {
    id: 'wikistats-language',
    prompt: 'Which statistics does the French language edition of Wikipedia show — articles, edits, users?',
    expected: { widgetType: 'wikistats', config: { lang: 'fr' } },
    requireSubject: true,
  },
  {
    id: 'file-usage-map',
    prompt: 'Where on the wikis is File:Blue Marble, AS17-227-8998.jpeg used? List the pages per wiki',
    expected: { widgetType: 'fileUsage', config: { filename: 'File:Blue Marble, AS17-227-8998.jpeg' } },
    requireSubject: true,
  },
  {
    id: 'glam-category-impact',
    prompt: 'For the category Photographs by Alex Stoen, tell me its GLAM statistics: number of files, how many pages they appear on, and total pageviews',
    expected: { widgetType: 'glamorgan', config: { category: 'Photographs by Alex Stoen' } },
    requireSubject: true, },
  {
    id: 'top-wikipedias',
    prompt: 'Rank the biggest Wikipedia language versions by how many articles they have',
    expected: { widgetType: 'topWikipedias', config: {} },
    requireSubject: false,
  },
  {
    id: 'top-articles-de',
    prompt: 'Which German Wikipedia pages got the most hits last week?',
    expected: { widgetType: 'topPages', config: { lang: 'de' } },
    requireSubject: true,
  },
  {
    id: 'excerpt-article',
    prompt: 'Give me a card with the lead section and short description of the article Katherine Johnson',
    expected: { widgetType: 'excerpt', config: { article: 'Katherine Johnson' } },
    requireSubject: true,
  },
  {
    id: 'edit-history-article',
    prompt: 'Who has been editing the Douglas Adams page lately? Show the recent revisions',
    expected: { widgetType: 'edithistory', config: { article: 'Douglas Adams' } },
    requireSubject: true,
  },
  {
    id: 'quality-article',
    prompt: 'What quality class does the ORES model predict for the article Marie Tharp?',
    expected: { widgetType: 'quality', config: { article: 'Marie Tharp' } },
    requireSubject: true,
  },
  {
    id: 'gallery-article',
    prompt: 'Display all the pictures used in the Rosalind Franklin article',
    expected: { widgetType: 'gallery', config: { article: 'Rosalind Franklin' } },
    requireSubject: true,
  },
  {
    id: 'sparql-count',
    prompt: 'Count the number of instance-of-human items in Wikidata with a SPARQL query',
    expected: { widgetType: 'sparql', config: {} },
    requireSubject: false,
  },
  {
    id: 'panorama-360',
    prompt: 'I want to look around inside this 360 photo from Commons: File:Liberty Island panorama 2.jpg',
    expected: { widgetType: 'panorama360', config: { filename: 'File:Liberty Island panorama 2.jpg' } },
    requireSubject: true,
  },
  {
    id: 'wayback-snapshots',
    prompt: 'Archive views of bbc.com — one capture each from March 2012, March 2016 and March 2021',
    expected: { widgetType: 'waybackGallery', config: { url: 'https://bbc.com' } },
    requireSubject: true,
    note: 'paraphrase of the few-shot-heavy fixture; different site, different date format ("March 2012")',
  },
];
