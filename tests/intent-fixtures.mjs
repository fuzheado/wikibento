/**
 * Intent→widget benchmark fixtures (ISSUE-44, design item 6 — the
 * "evaluation as a constitution" suite). Each entry is a realistic
 * human-typed Ask prompt mapped to the widget (and pre-filled config) a
 * correct advisor should recommend.
 *
 * Serves three purposes:
 *  1. Ground truth for the offline scorecard (tests/intent-benchmark.test.mjs,
 *     wired into `npm test` — scores the local tier, hard-asserts schema).
 *  2. Ground truth for the live LLM scorer (scripts/benchmark-ask.mjs —
 *     scores /api/ask's exact prompt against the same fixtures).
 *  3. The few-shot example pool for prompt enrichment (when we enrich the
 *     manifest, these prompts+expected options become in-prompt examples).
 *
 * Adding an intent: give it a unique `id`, a prompt as a user would type it,
 * the ONE widget that best matches, and the config keys that must be
 * pre-filled. Set `requireSubject: true` when the prompt names a real
 * subject and the config must carry it (not a placeholder). For subject-less
 * intents (rankings, static cards) leave config `{}`.
 *
 * PREFERRED: add entries via the interviewer tool instead of hand-editing —
 * `node scripts/interview-fixtures.mjs` (interactive; shows the widget card
 * and captures natural phrasing) or `--add --widget <id> --prompt "…"`
 * (agent/CI path). Both validate against the manifest before writing.
 *
 * Draft v1 (2026-08-16): 15 entries covering every widget family + the
 * confusable pairs (fileUsage vs cimFileSpotlight, glamorgan vs cimSnapshot,
 * categorySize vs gallery). Review/edit the prompts and expected values —
 * this catalog is the contract future Ask work is measured against.
 *
 * Category-span delineation (probed live 2026-08-16, llm-qwen36-27b): the
 * model extracts the FULL category span exactly whether quoted
 * ("Category …"), unquoted with a clause boundary (em-dash), or unquoted
 * with no boundary ("…in the United States and how many files…"). Quoting
 * in fixtures would model idealized input, so prompts stay in the realistic
 * unquoted form — and where the realistic form is also the hardest
 * (no boundary), that is the form the fixture uses.
 */
export const INTENT_FIXTURES = [
  {
    id: 'pageviews-article',
    prompt: 'How many pageviews has the article Ada Lovelace gotten in the last 30 days?',
    expected: { widgetType: 'pageviews', config: { article: 'Ada Lovelace' } },
    requireSubject: true,
    note: 'article-stat family; the article name must be pre-filled',
  },
  {
    id: 'linkcount-domain',
    prompt: 'How many English Wikipedia articles link to example.org?',
    expected: { widgetType: 'linkcount', config: { domain: 'example.org' } },
    requireSubject: true,
    note: 'domain input — bare domain, no protocol; "articles" hints namespace 0',
  },
  {
    id: 'category-sample-photos',
    prompt: 'Show me a random sampling of images from the category Featured pictures on Wikimedia Commons',
    expected: { widgetType: 'categorySize', config: { category: 'Featured pictures on Wikimedia Commons' } },
    requireSubject: true,
    note: 'the canonical few-shot example; category input — NOT fileGallery',
  },
  {
    id: 'wikistats-language',
    prompt: 'How many articles, edits and active users does the German Wikipedia have?',
    expected: { widgetType: 'wikistats', config: { lang: 'de' } },
    requireSubject: true,
    note: 'language-edition aggregate; lang select, not wikiPage',
  },
  {
    id: 'file-usage-map',
    prompt: 'Which wikis and pages use the file File:Earth from space.jpg?',
    expected: { widgetType: 'fileUsage', config: { filename: 'File:Earth from space.jpg' } },
    requireSubject: true,
    note: 'confusable pair: live globalusage walk — NOT cimFileSpotlight (precomputed)',
  },
  {
    id: 'glam-category-impact',
    prompt: 'What is the GLAM impact of the category Wiki Loves Monuments 2024 in the United States and how many files, pages and total views does it have?',
    expected: { widgetType: 'glamorgan', config: { category: 'Wiki Loves Monuments 2024 in the United States' } },
    requireSubject: true,
    note: 'confusable pair: live walk with pageviews — NOT cimSnapshot (precomputed, allow-list); unquoted long category span with NO boundary delimiter (hardest realistic form, see header)',
  },
  {
    id: 'top-wikipedias',
    prompt: 'What are the ten largest Wikipedias by article count?',
    expected: { widgetType: 'topWikipedias', config: {} },
    requireSubject: false,
    note: 'subject-less ranking; no config needed',
  },
  {
    id: 'top-articles-de',
    prompt: 'What were the most visited articles on the German Wikipedia yesterday?',
    expected: { widgetType: 'topPages', config: { lang: 'de' } },
    requireSubject: true,
    note: 'language edition named; dateMode stays default (latest)',
  },
  {
    id: 'excerpt-article',
    prompt: 'Display the first paragraph and short description of the article Albert Einstein',
    expected: { widgetType: 'excerpt', config: { article: 'Albert Einstein' } },
    requireSubject: true,
    note: 'article-summary family; NOT gallery/edithistory',
  },
  {
    id: 'edit-history-article',
    prompt: 'Show me the recent edits to Albert Einstein with the byte changes',
    expected: { widgetType: 'edithistory', config: { article: 'Albert Einstein' } },
    requireSubject: true,
    note: 'revisions feed, not excerpt; user said "edits"',
  },
  {
    id: 'quality-article',
    prompt: 'What is the predicted quality class of the article Albert Einstein?',
    expected: { widgetType: 'quality', config: { article: 'Albert Einstein' } },
    requireSubject: true,
    note: 'ORES family; "quality class" is the discriminator',
  },
  {
    id: 'gallery-article',
    prompt: 'Show me the significant images with captions from the article Mona Lisa',
    expected: { widgetType: 'gallery', config: { article: 'Mona Lisa' } },
    requireSubject: true,
    note: 'article media, NOT categorySize (input is an ARTICLE) and NOT fileGallery (input is files)',
  },
  {
    id: 'sparql-count',
    prompt: 'Run a SPARQL query on Wikidata that counts all human beings',
    expected: { widgetType: 'sparql', config: {} },
    requireSubject: false,
    note: 'power widget; the query text is optional in config — id match is the bar',
  },
  {
    id: 'panorama-360',
    prompt: 'Show me the 360 degree panorama of the Commons file File:Example.jpg',
    expected: { widgetType: 'panorama360', config: { filename: 'File:Example.jpg' } },
    requireSubject: true,
    note: 'media family; "360" is the discriminator, NOT mediaPlayer',
  },
  {
    id: 'wayback-snapshots',
    prompt: 'Show me archived snapshots of https://example.org from 2015, 2018 and 2020',
    expected: { widgetType: 'waybackGallery', config: { url: 'https://example.org' } },
    requireSubject: true,
    note: 'web-history family; full https URL per VALUE RULES',
  },
];