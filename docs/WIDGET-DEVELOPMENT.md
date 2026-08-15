# The Freshness Constitution (read before adding any widget)

Any widget that performs a **live query** (has a `fetch`) MUST let the viewer
see how stale or fresh its data is. `WidgetFrame` stamps every fetch widget's
render data with `_fetchedAt` (the time the query last ran) and renders an
unobtrusive footer on every live widget:

```
⏱ updated 2:34:05 PM · auto-refresh 1h
```

The stamp updates on every load — initial fetch, manual ↻, config change, and
auto-refresh — so viewers can always judge freshness. Static widgets (no
`fetch`: Text/Markdown, Wiki Page) are exempt by definition — they have no
query to be stale.

- **Rule:** a widget with `fetch` MUST declare `refreshSeconds` in `defaults`
  (≥ 30 s — the API-etiquette floor). Enforced by the constitution test
  (`tests/scope-compliance.test.mjs`, run by `npm test` → `npm run build`).
- **Caveats:** when a shared TTL cache serves a hit (Wikistats, SPARQL, CIM),
  the stamp shows when the widget last ran — the underlying data may be up to
  the cache TTL older. The stamp is "when this widget last refreshed", not
  "when the upstream data was produced".

# The Temporal-Scope Constitution (read before adding any widget)

Every widget whose data has a temporal scope MUST display the **resolved**
scope in its subtitle — "2026-07" (month), "2026-02 → 2026-07" (range),
"2026-07-15 → 2026-08-13" (day window) — never "last month" or "30 days".
A number without its time context is useless.

- Every registry entry MUST declare `timeScope`: `'month' | 'range' | 'day' | 'point'`
  (`'point'` = snapshot-as-of-now / static / query-defined — exempt from the
  date rule but must still declare its nature).
- The scope must be derivable from CONFIG ALONE (helpers in `src/lib/scope.js`:
  `resolveMonth`, `shiftMonth`, `fmtMonth`, `fmtMonthRange`, `fmtDayRange`,
  `dayWindow`) — transforms render it from config, not from fetched data.
- **Enforcement is automated:** `tests/scope-compliance.test.mjs` (run by
  `npm test`, wired into `npm run build`) fails any scoped widget whose
  subtitle lacks the date pattern — a non-compliant widget cannot be built,
  so it cannot be deployed. This is the "constitutional" gate.

# Adding a New Widget

The registry pattern means a new widget is **one entry in `WIDGET_TYPES`** plus
(usually) one fetcher in `dataSources.js`. No changes to the grid, frame, or panels.

## Anatomy of a Widget

Every widget is defined by 5 things:

| Piece | Where | What it does |
|---|---|---|
| `defaults` | registry entry | Starting config, merged when added from the catalog |
| `configFields` | registry entry | Renders the ⚙ config form (text / number / select / boolean / textarea) |
| `fetch(config)` | registry entry → dataSources.js | Async API call, returns data or throws. **Omit for static widgets** (e.g. Text/Markdown) — WidgetFrame then renders `transform(null, config)` directly, no network, no refresh interval |
| `transform(data, config)` | registry entry | Shapes API data into a renderer contract |
| `renderer` | registry entry | `StatCard` \| `RankingCard` \| `TrendCard` \| `GlamCard` \| `MarkdownCard` \| `TopPagesExpandedCard` \| `ExcerptCard` \| `EditHistoryCard` \| `QualityCard` \| `AssessmentsCard` \| `GalleryGridCard` \| `GalleryListCard` \| `ArticleListCard` \| `SparqlCard` \| `WikiPageCard` \| `CimSnapshotCard` \| `CimTopFilesCard` \| `FileTrafficCard` |

## Step-by-Step

### 1. Write the fetcher (src/widgets/dataSources.js)

```js
/** N. My Widget — what it does */
export async function fetchMyData(param, wiki = 'en.wikipedia') {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'something',
    titles: param,
    format: 'json',
    origin: '*',            // ← required for browser CORS on Action API
  });
  const data = await fetchJSON(`https://${wiki}.org/w/api.php?${params}`);
  // ...shape the result...
  return { key: value, ... };
}
```

Rules:

- Reuse `fetchJSON` (it sets the UA and throws `HTTP <status>` on failure).
- **Throw** on failure — `WidgetFrame` catches, shows the message + Retry.
- **Never return raw API envelopes** — shape to what the widget needs.
- Keep it to **one or two batched calls**; no per-item loops (API etiquette).

### 2. Register the widget (src/widgets/index.js)

Add an entry to `WIDGET_TYPES`:

```js
myWidget: {
  id: 'myWidget',
  name: 'My Widget',                          // catalog + default title
  icon: '✨',
  description: 'One-line description for the catalog',
  defaults: {
    param: 'Something',
    refreshSeconds: 3600,
  },
  renderer: 'StatCard',                       // StatCard | RankingCard | TrendCard
  dataSource: 'mwapi-something',              // informational only
  configFields: [                             // drives the ⚙ panel
    { key: 'param', label: 'Param', type: 'text', placeholder: 'Something' },
    // type: 'select'  → add options: [{value, label}]
    // type: 'number'  → parsed with parseInt (use 0 as the "off" value)
    // type: 'boolean' → renders a checkbox
    // type: 'textarea' → multi-line text (rows: N, default 6) — e.g. Markdown content
  ],
  fetch: (config) => fetchMyData(config.param),
  transform: (data) => ({
    title: data.param,
    subtitle: 'What you're looking at',
    value: data.key?.toLocaleString(),
    detail: 'Extra line under the big number',
    trend: data.trend,                        // optional: sparkline [{date, views}]
  }),
},
```

### 3. Pick a renderer (or use the transform contract)

- **StatCard** — `{ title, subtitle?, value, detail?, trend?, trendLabel? }`
- **RankingCard** — `{ title, subtitle?, columns: [c1, c2], rows: [[r1c1, r1c2], ...] }`
- **TrendCard** — `{ chartData: [{date, views}], chartKey, chartLabel }`
- **ExcerptCard** (Article Excerpt) — `{ title, description?, extract, thumbnailUrl?, pageUrl? }`
- **EditHistoryCard** (Edit History) — `{ title, project, rows: [{revid, timestamp, user, comment, delta}] }`
- **QualityCard** (Article Quality) — `{ title, grade?, probabilities?, score?, revid, model }`
- **AssessmentsCard** (WikiProject Assessment) — `{ title, rows: [{project, class, importance}], total }`
- **GalleryGridCard** (Article Gallery, grid) — `{ title, subtitle, rows: [{title, caption, thumbUrl, fileUrl}], size }` — **shared with `fileGallery`** (same card, different fetcher)
- **GalleryListCard** (Article Gallery, list) — same contract, rows render thumb-left/caption-right — also shared with `fileGallery`
- **ArticleListCard** (Article List) — `{ title, subtitle, rows: [{title, pageUrl, thumbUrl?, extract?}] }` — clickable rows, optional thumb + 3-line intro. The same row contract works for any pasted-list widget.
- **CimSnapshotCard** (CIM Snapshot / File Spotlight) — `{ title, subtitle?, stats: [{label, value, sub}], trend?: [{date, views}] }` — reuses the GlamCard stat-tile markup, optional monthly-view sparkline.
- **FileTrafficCard** (CIM File Traffic) — `{ title, subtitle, rows: [{date, views}] }` — SVG line chart with labeled X/Y axes and −/+ zoom (client-side slice of the fetched window); the card header shows the displayed range.
- **CimTopFilesCard** (CIM Top Files) — `{ title, subtitle?, rows: [{title, views, thumbUrl?}] }` — ranked rows with 44px thumbs (RankingCard has none).
- **SparqlCard** (SPARQL Query) — one renderer, mode decided by the transform: `{ mode, title, subtitle, … }` where mode is `stat` (StatCard contract), `line` (TrendCard contract), `bar` (`{rows: [{label, value}]}`), or `table` (`{columns, rows: [[cells]]}`). Auto-detect lives in the widget's `transform` (config.renderer overrides).

Need a new shape? Add a renderer component to `WidgetFrame.jsx` and extend the
`WidgetContent` switch — keep it dumb (it only receives the transformed `data`).

### Sharing renderers across widgets

Cards are shared **by name** — several registry entries can dispatch to the
same card, each with its own `fetch`/`transform`. Precedent: `gallery` and
`fileGallery` both render `GalleryGridCard`/`GalleryListCard` via their
`getRenderer`. If your widget's data is a set of media, emit the canonical
image-row contract (`rows: [{ title, thumbUrl, fileUrl, caption }]`) and you
get the grid/list for free. For a new display mode (slideshow / ticker —
ISSUE-33/34/37), add the card ONCE plus one `WidgetContent` case, then each
widget opts in via `getRenderer(config)`. The fetcher is the only
per-widget piece; the transform carries provenance wording (subtitle).

### 4. Optional: add a default starter widget

Edit `DEFAULT_WIDGETS` and `DEFAULT_LAYOUT` in `App.jsx` (mind the layout slots:
12 columns, `w` spans, `minW`/`minH`).

### 5. Document it

Add a row to the widget catalog table in `README.md` and a section in
`docs/DATA-SOURCES.md` (endpoint, params, gotchas).

## Checklist

- [ ] Fetcher throws real errors, no raw envelopes
- [ ] `origin=*` on Action API calls
- [ ] Config change re-fetches automatically (free — WidgetFrame re-runs `load` on config change)
- [ ] `refreshSeconds` honored
- [ ] Empty / error states look right (the frame handles them, but verify the transform's defaults)
- [ ] `npm run lint` passes; `npm run build` succeeds
- [ ] Smoke-test in the browser: add from catalog → configure → reload page (persistence)

## Example: the smallest widget

```js
ping: {
  id: 'ping',
  name: 'API Ping',
  icon: '🏓',
  description: 'Latency check against the Action API',
  defaults: { refreshSeconds: 60 },
  renderer: 'StatCard',
  dataSource: 'mwapi',
  configFields: [],
  fetch: async () => {
    const t0 = performance.now();
    await fetchJSON('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*');
    return { ms: Math.round(performance.now() - t0) };
  },
  transform: (data) => ({ title: 'API latency', value: `${data.ms} ms`, detail: 'en.wikipedia.org' }),
},
```

That's the whole widget — registry entry, zero new files.

## Static widgets (no fetch)

A widget that needs no network — like the **Text / Markdown** card — simply
**omits `fetch`** and derives its render data from config in `transform`:

```js
markdown: {
  id: 'markdown',
  name: 'Text / Markdown',
  icon: '📝',
  description: 'Free-form Markdown card — notes, headings, links',
  defaults: { text: '## Welcome\n\nEdit me with ⚙', refreshSeconds: 86400 },
  renderer: 'MarkdownCard',
  dataSource: 'static (no fetch)',
  configFields: [
    { key: 'text', label: 'Markdown content', type: 'textarea', rows: 8 },
  ],
  transform: (data, config) => ({ markdown: config.text }),
},
```

WidgetFrame renders `transform(null, config)` immediately — no Loading state,
no auto-refresh interval. The Markdown renderer is `src/lib/markdown.js`
(zero-dep, escape-first; subset: headings, bold/italic/code/links, lists,
quotes, hr, fenced code blocks).
