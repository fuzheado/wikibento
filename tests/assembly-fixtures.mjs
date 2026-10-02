/**
 * Frozen assembly replies — what the model ACTUALLY wrote, kept so the board path can be checked offline.
 *
 * Why frozen. A constitution that calls the model is a benchmark: its result moves with the model, the temperature
 * and the day. This one must not move — it asserts the CONTRACT on the validator's side: whatever the model returns,
 * `validateAssembly` and the app's own `validateDashboard` have to produce a board that holds together (unique ids,
 * every reference resolvable, the app able to load it), and a reply that is not JSON has to degrade rather than throw.
 *
 * Provenance: `llm-qwen36-27b`, temperature 0.3, `max_tokens 700`, the assembly suite run three times on 2026-10-01
 * through the Toolforge bastion — transcripts in `bench/results/2026-10-01-boards-assembly-r{1,2,3}.json`. Prompts come
 * from `tests/board-fixtures.mjs` (same order). The mistakes are kept on purpose: they are the input this contract has
 * to survive. `parses: false` marks a reply that was not usable JSON at all (one of the eighteen), which is a case the
 * system must survive rather than a fixture to be repaired.
 */
export const ASSEMBLY_REPLIES = [
  {
    "id": "chain-translate-article",
    "run": "r1",
    "prompt": "Take the first paragraph of the article Albert Einstein and translate it to Spanish",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"einstein-excerpt\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Albert Einstein\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 6,\n        \"h\": 3\n      },\n      {\n        \"id\": \"spanish-translation\",\n        \"widgetType\": \"translate\",\n        \"config\": {\n          \"text\": \"{{widget:einstein-excerpt}}\",\n          \"from\": \"en\",\n          \"to\": \"es\",\n          \"display\": \"translation\"\n        },\n        \"w\": 6,\n        \"h\": 3\n      }\n    ],\n    \"summary\": \"Extracts the lead paragraph of the English Wikipedia article on Albert Einstein and translates it into Spanish.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-speak-article",
    "run": "r1",
    "prompt": "Show me the intro of the article Marie Curie and read it out loud",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"curie-intro\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Marie Curie\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 6,\n        \"h\": 4\n      },\n      {\n        \"id\": \"curie-reader\",\n        \"widgetType\": \"speaker\",\n        \"config\": {\n          \"source\": \"curie-intro\",\n          \"lang\": \"en\",\n          \"speakOnChange\": true\n        },\n        \"w\": 6,\n        \"h\": 4\n      }\n    ],\n    \"summary\": \"Displays the lead paragraph of the Marie Curie article and automatically reads it aloud using text-to-speech.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-filter-count",
    "run": "r1",
    "prompt": "I'll paste a list of museum names. Keep only the ones containing 'art' and tell me how many are left",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"museum-names-list\",\n        \"widgetType\": \"listSource\",\n        \"config\": {\n          \"title\": \"Museum Names\",\n          \"items\": \"\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"art-filter\",\n        \"widgetType\": \"filterLines\",\n        \"config\": {\n          \"source\": \"museum-names-list\",\n          \"title\": \"Museums with 'art'\",\n          \"pattern\": \"art\",\n          \"match\": \"contains\",\n          \"caseSensitive\": false\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"art-count\",\n        \"widgetType\": \"lineCount\",\n        \"config\": {\n          \"source\": \"art-filter\",\n          \"label\": \"Count\"\n        },\n        \"w\": 4,\n        \"h\": 2\n      }\n    ],\n    \"summary\": \"Paste your list into the first widget; the second filters for 'art' and the third shows the final count.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-list-display",
    "run": "r1",
    "prompt": "I want a card that always shows my current list of favorite articles with thumbnails — I'll keep editing the list in one place and the card should follow it automatically",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"favorites-list\",\n        \"widgetType\": \"listSource\",\n        \"config\": {\n          \"title\": \"My Favorite Articles\",\n          \"items\": \"Albert Einstein\\nAda Lovelace\\nMarie Curie\\nNikola Tesla\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"favorites-display\",\n        \"widgetType\": \"articleList\",\n        \"config\": {\n          \"articles\": \"{{widget:favorites-list}}\",\n          \"project\": \"en.wikipedia\",\n          \"enrich\": true\n        },\n        \"w\": 8,\n        \"h\": 6\n      }\n    ],\n    \"summary\": \"A two-widget setup where you edit the list of article titles in the 'listSource' widget, and the 'articleList' widget automatically displays them with thumbnails and intros.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-summary-translate-speak",
    "run": "r1",
    "prompt": "Build me a card that shows an article summary, translates it to French, and can speak the translation aloud",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"article-summary\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Albert Einstein\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"french-translation\",\n        \"widgetType\": \"translate\",\n        \"config\": {\n          \"text\": \"{{widget:article-summary}}\",\n          \"from\": \"en\",\n          \"to\": \"fr\",\n          \"display\": \"translation\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"speak-french\",\n        \"widgetType\": \"speaker\",\n        \"config\": {\n          \"source\": \"french-translation#speech\",\n          \"lang\": \"fr\",\n          \"speakOnChange\": false\n        },\n        \"w\": 4,\n        \"h\": 3\n      }\n    ],\n    \"summary\": \"A dataflow chain that fetches an English article summary, translates it to French, and provides a button to speak the translation aloud.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "board-switcher-institutions",
    "run": "r1",
    "prompt": "Make a dashboard where I can switch between the Metropolitan Museum of Art and the Library of Congress and see their Commons collection stats",
    "raw": "{\n  \"board\": {\n    \"params\": {\n      \"institution\": {\n        \"label\": \"Institution\",\n        \"type\": \"buttons\",\n        \"options\": [\n          \"Images from the Metropolitan Museum of Art\",\n          \"Images from the Library of Congress\"\n        ],\n        \"value\": \"Images from the Metropolitan Museum of Art\"\n      }\n    },\n    \"widgets\": [\n      {\n        \"id\": \"switcher\",\n        \"widgetType\": \"boardControls\",\n        \"config\": {\n          \"title\": \"Select Institution\",\n          \"spec\": \"institution | buttons | Institution | Images from the Metropolitan Museum of Art, Images from the Library of Congress\"\n        },\n        \"w\": 12,\n        \"h\": 2\n      },\n      {\n        \"id\": \"collection-stats\",\n        \"widgetType\": \"glamorgan\",\n        \"config\": {\n          \"category\": \"{{institution}}\",\n          \"depth\": 1,\n          \"showDetail\": true,\n          \"topN\": 5\n        },\n        \"w\": 6,\n        \"h\": 4\n      },\n      {\n        \"id\": \"top-files\",\n        \"widgetType\": \"cimTopFiles\",\n        \"config\": {\n          \"category\": \"{{institution}}\",\n          \"topN\": 10\n        },\n        \"w\": 6,\n        \"h\": 4\n      },\n      {\n        \"id\": \"usage-trend\",\n        \"widgetType\": \"cimTren",
    "parses": false
  },
  {
    "id": "chain-translate-article",
    "run": "r2",
    "prompt": "Take the first paragraph of the article Albert Einstein and translate it to Spanish",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"einstein-excerpt\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Albert Einstein\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 6,\n        \"h\": 3\n      },\n      {\n        \"id\": \"spanish-translation\",\n        \"widgetType\": \"translate\",\n        \"config\": {\n          \"text\": \"{{widget:einstein-excerpt}}\",\n          \"from\": \"en\",\n          \"to\": \"es\",\n          \"display\": \"translation\"\n        },\n        \"w\": 6,\n        \"h\": 3\n      }\n    ],\n    \"summary\": \"Displays the English lead paragraph of the Albert Einstein article and its Spanish translation side-by-side.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-speak-article",
    "run": "r2",
    "prompt": "Show me the intro of the article Marie Curie and read it out loud",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"curie-intro\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Marie Curie\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 6,\n        \"h\": 4\n      },\n      {\n        \"id\": \"curie-reader\",\n        \"widgetType\": \"speaker\",\n        \"config\": {\n          \"source\": \"curie-intro\",\n          \"lang\": \"en\",\n          \"speakOnChange\": true\n        },\n        \"w\": 6,\n        \"h\": 4\n      }\n    ],\n    \"summary\": \"Displays the lead paragraph of the Marie Curie article and automatically reads it aloud using text-to-speech.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-filter-count",
    "run": "r2",
    "prompt": "I'll paste a list of museum names. Keep only the ones containing 'art' and tell me how many are left",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"museum-names-input\",\n        \"widgetType\": \"listSource\",\n        \"config\": {\n          \"title\": \"Museum Names\",\n          \"items\": \"Paste your list of museum names here, one per line.\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"filter-art-museums\",\n        \"widgetType\": \"filterLines\",\n        \"config\": {\n          \"source\": \"museum-names-input\",\n          \"title\": \"Museums containing 'art'\",\n          \"pattern\": \"art\",\n          \"match\": \"contains\",\n          \"caseSensitive\": false\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"count-art-museums\",\n        \"widgetType\": \"lineCount\",\n        \"config\": {\n          \"source\": \"filter-art-museums\",\n          \"label\": \"Count\"\n        },\n        \"w\": 4,\n        \"h\": 2\n      }\n    ],\n    \"summary\": \"A dataflow chain that takes a pasted list of museum names, filters for those containing 'art', and displays the final count.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-list-display",
    "run": "r2",
    "prompt": "I want a card that always shows my current list of favorite articles with thumbnails — I'll keep editing the list in one place and the card should follow it automatically",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"favorites-list\",\n        \"widgetType\": \"listSource\",\n        \"config\": {\n          \"title\": \"My Favorite Articles\",\n          \"items\": \"Albert Einstein\\nAda Lovelace\\nMarie Curie\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"favorites-display\",\n        \"widgetType\": \"articleList\",\n        \"config\": {\n          \"articles\": \"{{widget:favorites-list}}\",\n          \"project\": \"en.wikipedia\",\n          \"enrich\": true\n        },\n        \"w\": 8,\n        \"h\": 6\n      }\n    ],\n    \"summary\": \"A two-widget setup where you edit the list of article titles in the 'listSource' widget, and the 'articleList' widget automatically displays them with thumbnails and intros.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-summary-translate-speak",
    "run": "r2",
    "prompt": "Build me a card that shows an article summary, translates it to French, and can speak the translation aloud",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"article-summary\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Albert Einstein\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"french-translation\",\n        \"widgetType\": \"translate\",\n        \"config\": {\n          \"text\": \"{{widget:article-summary}}\",\n          \"from\": \"en\",\n          \"to\": \"fr\",\n          \"display\": \"translation\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"speak-french\",\n        \"widgetType\": \"speaker\",\n        \"config\": {\n          \"source\": \"french-translation#speech\",\n          \"lang\": \"fr\",\n          \"speakOnChange\": true\n        },\n        \"w\": 4,\n        \"h\": 3\n      }\n    ],\n    \"summary\": \"A dataflow chain that fetches an English article summary, translates it to French, and speaks the result aloud.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "board-switcher-institutions",
    "run": "r2",
    "prompt": "Make a dashboard where I can switch between the Metropolitan Museum of Art and the Library of Congress and see their Commons collection stats",
    "raw": "{\n  \"board\": {\n    \"params\": {\n      \"institution\": {\n        \"label\": \"Institution\",\n        \"type\": \"buttons\",\n        \"options\": [\n          \"Images from the Metropolitan Museum of Art\",\n          \"Images from the Library of Congress\"\n        ],\n        \"value\": \"Images from the Metropolitan Museum of Art\"\n      }\n    },\n    \"widgets\": [\n      {\n        \"id\": \"switcher\",\n        \"widgetType\": \"boardControls\",\n        \"config\": {\n          \"title\": \"Select Institution\",\n          \"spec\": \"institution | buttons | Collection | Images from the Metropolitan Museum of Art, Images from the Library of Congress\"\n        },\n        \"w\": 12,\n        \"h\": 2\n      },\n      {\n        \"id\": \"collection-stats\",\n        \"widgetType\": \"glamorgan\",\n        \"config\": {\n          \"category\": \"{{institution}}\",\n          \"depth\": 0,\n          \"showDetail\": true,\n          \"topN\": 5\n        },\n        \"w\": 6,\n        \"h\": 5\n      },\n      {\n        \"id\": \"top-images\",\n        \"widgetType\": \"gallery\",\n        \"config\": {\n          \"from\": \"category\",\n          \"category\": \"{{institution}}\",\n          \"displayMode\": \"grid\",\n          \"iconSize\": \"medium\",\n          \"order\": \"largest\",\n          \"maxItem",
    "parses": false
  },
  {
    "id": "chain-translate-article",
    "run": "r3",
    "prompt": "Take the first paragraph of the article Albert Einstein and translate it to Spanish",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"einstein-excerpt\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Albert Einstein\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"spanish-translation\",\n        \"widgetType\": \"translate\",\n        \"config\": {\n          \"text\": \"{{widget:einstein-excerpt}}\",\n          \"from\": \"en\",\n          \"to\": \"es\",\n          \"display\": \"translation\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      }\n    ],\n    \"summary\": \"Extracts the lead paragraph of the English Wikipedia article on Albert Einstein and translates it into Spanish.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-speak-article",
    "run": "r3",
    "prompt": "Show me the intro of the article Marie Curie and read it out loud",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"curie-intro\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Marie Curie\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 6,\n        \"h\": 4\n      },\n      {\n        \"id\": \"curie-reader\",\n        \"widgetType\": \"speaker\",\n        \"config\": {\n          \"source\": \"curie-intro\",\n          \"lang\": \"en\",\n          \"speakOnChange\": true\n        },\n        \"w\": 6,\n        \"h\": 4\n      }\n    ],\n    \"summary\": \"Displays the lead paragraph of the Marie Curie article and automatically reads it aloud using text-to-speech.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-filter-count",
    "run": "r3",
    "prompt": "I'll paste a list of museum names. Keep only the ones containing 'art' and tell me how many are left",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"museum-names-input\",\n        \"widgetType\": \"listSource\",\n        \"config\": {\n          \"title\": \"Museum Names\",\n          \"items\": \"\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"filter-art-museums\",\n        \"widgetType\": \"filterLines\",\n        \"config\": {\n          \"source\": \"museum-names-input\",\n          \"title\": \"Museums with 'art'\",\n          \"pattern\": \"art\",\n          \"match\": \"contains\",\n          \"caseSensitive\": false\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"count-art-museums\",\n        \"widgetType\": \"lineCount\",\n        \"config\": {\n          \"source\": \"filter-art-museums\",\n          \"label\": \"Count\"\n        },\n        \"w\": 4,\n        \"h\": 2\n      }\n    ],\n    \"summary\": \"A dataflow chain that takes a pasted list of museum names, filters for those containing 'art', and displays the final count.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-list-display",
    "run": "r3",
    "prompt": "I want a card that always shows my current list of favorite articles with thumbnails — I'll keep editing the list in one place and the card should follow it automatically",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"favorites-list\",\n        \"widgetType\": \"listSource\",\n        \"config\": {\n          \"title\": \"My Favorite Articles\",\n          \"items\": \"Albert Einstein\\nAda Lovelace\\nMarie Curie\\nNikola Tesla\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"favorites-display\",\n        \"widgetType\": \"articleList\",\n        \"config\": {\n          \"articles\": \"{{widget:favorites-list}}\",\n          \"project\": \"en.wikipedia\",\n          \"enrich\": true\n        },\n        \"w\": 8,\n        \"h\": 6\n      }\n    ],\n    \"summary\": \"A two-widget setup where you maintain your article list in the 'listSource' widget, and the 'articleList' widget automatically displays them with thumbnails and intros.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "chain-summary-translate-speak",
    "run": "r3",
    "prompt": "Build me a card that shows an article summary, translates it to French, and can speak the translation aloud",
    "raw": "{\n  \"board\": {\n    \"params\": {},\n    \"widgets\": [\n      {\n        \"id\": \"article-summary\",\n        \"widgetType\": \"excerpt\",\n        \"config\": {\n          \"article\": \"Albert Einstein\",\n          \"project\": \"en.wikipedia\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"french-translation\",\n        \"widgetType\": \"translate\",\n        \"config\": {\n          \"text\": \"{{widget:article-summary}}\",\n          \"from\": \"en\",\n          \"to\": \"fr\",\n          \"display\": \"translation\"\n        },\n        \"w\": 4,\n        \"h\": 3\n      },\n      {\n        \"id\": \"speak-french\",\n        \"widgetType\": \"speaker\",\n        \"config\": {\n          \"source\": \"french-translation#speech\",\n          \"lang\": \"fr\",\n          \"speakOnChange\": false\n        },\n        \"w\": 4,\n        \"h\": 3\n      }\n    ],\n    \"summary\": \"A dataflow chain that fetches an English article summary, translates it to French, and provides a button to speak the French text aloud.\"\n  }\n}",
    "parses": true
  },
  {
    "id": "board-switcher-institutions",
    "run": "r3",
    "prompt": "Make a dashboard where I can switch between the Metropolitan Museum of Art and the Library of Congress and see their Commons collection stats",
    "raw": "{\n  \"board\": {\n    \"params\": {\n      \"institution\": {\n        \"label\": \"Institution\",\n        \"type\": \"buttons\",\n        \"options\": [\n          \"Images from the Metropolitan Museum of Art\",\n          \"Images from the Library of Congress\"\n        ],\n        \"value\": \"Images from the Metropolitan Museum of Art\"\n      }\n    },\n    \"widgets\": [\n      {\n        \"id\": \"switcher\",\n        \"widgetType\": \"boardControls\",\n        \"config\": {\n          \"title\": \"Select Institution\",\n          \"spec\": \"institution | buttons | Collection | Images from the Metropolitan Museum of Art, Images from the Library of Congress\"\n        },\n        \"w\": 4,\n        \"h\": 2\n      },\n      {\n        \"id\": \"collection-stats\",\n        \"widgetType\": \"glamorgan\",\n        \"config\": {\n          \"category\": \"{{institution}}\",\n          \"depth\": 1,\n          \"year\": 2026,\n          \"month\": 1,\n          \"topN\": 5,\n          \"showDetail\": true\n        },\n        \"w\": 4,\n        \"h\": 4\n      },\n      {\n        \"id\": \"collection-gallery\",\n        \"widgetType\": \"gallery\",\n        \"config\": {\n          \"from\": \"category\",\n          \"category\": \"{{institution}}\",\n          \"displayMode\": \"grid\",\n          \"iconSize\": \"medi",
    "parses": false
  }
];
