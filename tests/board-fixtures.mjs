/**
 * Board-construction fixtures (2026-09-09) — the second half of the Ask
 * benchmark question: "is the info we send enough for widget AND BOARD
 * construction?" The 15 single-widget intent fixtures saturate at top1 100%
 * (bench-variants-2026-09-09.json — all three prompt variants score
 * identically), so they can no longer measure prompt enrichment. These
 * fixtures measure whether the Ask prompt's dataflow knowledge (ASK_MANUAL)
 * produces a correctly ORDERED chain of pre-filled widgets.
 *
 * Scoring: tests/intent-benchmark-lib.mjs scoreChainOptions — the expected
 * chain must appear as an in-order subsequence of the returned options
 * (alternatives are allowed; the chain must survive intact), and each
 * declared config entry must be pre-filled (subjects verbatim when
 * requireSubject).
 *
 * Design notes:
 *  - Chains mirror the four COMMON CHAINS in ASK_MANUAL + the demo boards
 *    (article-switcher, translate-demo, flow-demo): excerpt→translate,
 *    excerpt→speaker, listSource→filterLines→lineCount/articleList,
 *    boardControls→CIM.
 *  - The model is told (ASK_MANUAL) never to invent {{widget:…}} ids — board
 *    wiring happens on the user's board, not in the recommendation. So these
 *    fixtures assert the CHAIN + subjects, not literal wiring tokens. The
 *    scorer records (informationally, not gated) how often the model
 *    volunteers a {{widget:…}} token anyway.
 *  - switcher-institutions has requireSubject: false — the model may pick ANY
 *    one of the named institutions (or a {{param}} placeholder); the bar is
 *    the chain shape, since a full parametrized-board recommendation exceeds
 *    the current output schema (a known Ask gap this fixture documents).
 *  - The translate.to value is a 2-letter code (exact match per
 *    subjectMatches' short-value rule).
 */
export const BOARD_FIXTURES = [
  {
    id: 'chain-translate-article',
    prompt: 'Take the first paragraph of the article Albert Einstein and translate it to Spanish',
    expected: {
      chain: ['excerpt', 'translate'],
      config: {
        excerpt: { article: 'Albert Einstein' },
        translate: { to: 'es' },
      },
    },
    requireSubject: true,
    note: 'the canonical excerpt → translator dataflow chain (ISSUE-58); excerpt emits, translate consumes',
  },
  {
    id: 'chain-speak-article',
    prompt: 'Show me the intro of the article Marie Curie and read it out loud',
    expected: {
      chain: ['excerpt', 'speaker'],
      config: {
        excerpt: { article: 'Marie Curie' },
      },
    },
    requireSubject: true,
    note: 'excerpt → speaker output chain; wiring (speaker.text ← excerpt) is expressed in reasons per ASK_MANUAL, not as {{widget:…}} ids',
  },
  {
    id: 'chain-filter-count',
    prompt: "I'll paste a list of museum names. Keep only the ones containing 'art' and tell me how many are left",
    expected: {
      chain: ['listSource', 'filterLines', 'lineCount'],
      config: {
        filterLines: { pattern: 'art' },
      },
    },
    requireSubject: false,
    note: 'the flow-demo chain: Text List → Filter Lines → Line Count',
  },
  {
    id: 'chain-list-display',
    prompt: 'I want a card that always shows my current list of favorite articles with thumbnails — I\'ll keep editing the list in one place and the card should follow it automatically',
    expected: {
      chain: ['listSource', 'articleList'],
      config: {},
    },
    requireSubject: false,
    note: 'Text List feeds Article List (arrays join with newlines via {{widget:id}} on the board); no subject named',
  },
  {
    id: 'chain-summary-translate-speak',
    prompt: 'Build me a card that shows an article summary, translates it to French, and can speak the translation aloud',
    expected: {
      chain: ['excerpt', 'translate', 'speaker'],
      config: {
        translate: { to: 'fr' },
      },
    },
    requireSubject: false,
    note: 'three-widget chain, no subject named — excerpt feeds translate, translate output feeds speaker',
  },
  {
    id: 'board-switcher-institutions',
    prompt: 'Make a dashboard where I can switch between the Metropolitan Museum of Art and the Library of Congress and see their Commons collection stats',
    expected: {
      chain: ['boardControls', 'cimSnapshot'],
      config: {},
    },
    requireSubject: false,
    note: 'the glam-demo pattern: a params-driven switcher + CIM snapshot. Full realization needs a params block, which the current Ask output schema cannot declare — documented gap',
  },
];
