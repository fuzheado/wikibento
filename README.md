# 📊 WikiBento — a Composable Wikimedia Dashboard

![WikiBento demo dashboard](docs/screenshot.png)

WikiBento is a drag-and-drop dashboard for Wikimedia. The things worth keeping an eye on live in many
places — pageview and stats APIs, wiki pages, recent changes, Commons — and WikiBento brings them onto one
reactive board you can arrange, point at a subject, and send as a link: article metrics, external link
counts, category sizes, file usage, GLAM impact stats, listings and feeds you can click through — plus
output widgets that speak (🔊 Speaker) or translate (🌐 Translator) what they hold.

**Why this exists at all,** now that an agent can generate a dashboard from a sentence:
[`docs/WHY-WIKIBENTO.md`](docs/WHY-WIKIBENTO.md) — the argument, and the running ledger of measured API
behaviour (timeouts, CORS realities, honest failure states) that a one-shot dashboard does not have. The
widgets are the demo; the ledger is the product.

It's a single-page React app built on [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)
(the grid engine behind Grafana and Kibana), ≈0.6 MB (~175 KB gzipped), hostable as static files on Toolforge
or anywhere. Every widget hits **real Wikimedia APIs** (RESTBase, the MediaWiki Action API, Commons,
Wikistats) straight from the browser — no backend, no login, no proxy. `npm run build` prints exact figures.

**Live:** [wikibento.toolforge.org](https://wikibento.toolforge.org/) ·
**Example:** [Alysa Liu](https://wikibento.toolforge.org/?config=https://w.wiki/TR9R) ·
**Source:** [github.com/fuzheado/wikibento](https://github.com/fuzheado/wikibento)

---

## Try It (demos)

**Start here: [`?config=/demos.json`](https://wikibento.toolforge.org/?config=/demos.json)** — an index board linking the whole suite (onboarding → flagships).

| demo | what it shows |
|---|---|
| 👋 [Article switcher](https://wikibento.toolforge.org/?config=/article-switcher-demo.json) | the simplest board: one param, two cards |
| 🌐 [Translate chain](https://wikibento.toolforge.org/?config=/translate-demo.json) | two params + widget-to-widget dataflow (excerpt → translator) |
| 🎛️ [Params & galleries](https://wikibento.toolforge.org/?config=/params-demo.json) | buttons, a slider and a month stepper driving galleries |
| 🔀 [Dataflow pipeline](https://wikibento.toolforge.org/?config=/flow-demo.json) | Text List → Filter → Count → Display |
| 🏛️ [One template, any institution](https://wikibento.toolforge.org/?config=/glam-demo.json) | exact GLAM impact stats (Commons Impact Metrics) — **type any institution/category in one box** and every CIM card follows; five flagship collections are the starting shortlist |
| 🔎 [Article vitals](https://wikibento.toolforge.org/?config=/article-vitals-demo.json) | summary, traffic, ORES quality, WikiProjects, edits, images |
| 🧠 [Query power](https://wikibento.toolforge.org/?config=/sparql-demo.json) | live SPARQL across WDQS, Humaniki and QLever |
| 🕰️ [Two lives, one axis](https://wikibento.toolforge.org/?config=/parallel-lives-demo.json) | lives on a shared timeline, two ways (calendar years or aligned at birth) and **zoomable 8×** — Anne Frank × Martin Luther King Jr., Marie × Pierre Curie |
| 📄 [Embed any page](https://wikibento.toolforge.org/?config=/embed-demo.json) | frame a 3D model (Objectium) in a card |
| 🧩 [Full catalog](https://wikibento.toolforge.org/?config=/dashboard.json) | all 39 widget types on one board — its article switcher drives five cards |

Every board also works in **kiosk mode** — add `?kiosk=1`. Configs are plain JSON (see
[docs/JSON-FORMAT.md](docs/JSON-FORMAT.md)); any URL, on-wiki page or GitHub raw file works the same way.

A ready-made dashboard hosted **on Wikimedia Commons** also loads from an on-wiki page —
`?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json` (or the short link
`?config=https://w.wiki/TR9R`, expanded via the same-origin `/api/resolve` endpoint). Any CORS-enabled host
works the same way.

## Widgets

**39 widget types.** Each section below is a category in the in-app **Add Widget** panel; the full table —
what every widget shows and the API behind it — is [docs/WIDGET-CATALOG.md](docs/WIDGET-CATALOG.md).

| category | widgets |
|---|---|
| **Articles (6)** | 📊 Article Pageviews · 📄 Article Excerpt · 🕓 Edit History · 🏅 Article Quality (ORES) · 🧭 WikiProject Assessment · 🖼️ Article Gallery |
| **Categories & GLAM (11)** | 📁 Category Size · 📈 GLAM Category Usage · and nine **CIM** widgets: snapshot, views over time, top files / wikis / pages / editors, global leaderboard, file spotlight, file traffic |
| **Files & Media (4)** | 🖼️ File Usage Map · 🗂️ Commons File Gallery · 🌐 360° Panorama Viewer · 🎬 Video / Media Player |
| **Rankings & Platforms (4)** | 🔗 External Link Count · 🌐 Wiki Stats · 🏆 Top 10 Wikipedias · 🔥 Top Wikipedia Articles |
| **Content & Embeds (7)** | 🎛️ Board Controls · 📝 Text / Markdown · 🔳 QR Code · 🔊 Speaker · 🌐 Translator (MinT) · 📋 Article List · 📄 Wiki Page |
| **Queries & Power (1)** | 🧠 SPARQL Query (WDQS · QLever · Humaniki) |
| **Dataflow (4)** | 🧾 Text List · 🔎 Filter Lines · 🔢 Line Count · 🖨️ Value Display |
| **Web & History (2)** | 📦 Internet Archive Item · 🕰️ Wayback Snapshot Gallery *(alpha)* |

All 30 data-driven widget types render live data in the browser; the 9 static ones (Text/Markdown, QR Code, Board Controls, Speaker, Wiki Page, Text List, Filter Lines, Line Count, Value Display) render from config — no fetch.

## Features

### The board

- **Drag, drop, resize** — a 12-column grid with vertical compaction; grab a title bar to move a widget, the
  bottom-right corner to resize it
- **Responsive** — under 768px the grid collapses to a single-column card stack in grid reading order, so a
  desktop arrangement still makes sense on a phone
- **Presentation** — ⛶ **Present** hides every editing affordance and locks the grid for a clean data wall;
  `?kiosk=1` loads any board that way directly (a shareable presentation link), and ▣ **Lean** does the same
  without taking over the screen
- **Content-fit galleries** — image galleries default to full window width and fit their height to the image
  count after loading, until you resize one yourself, and then your size sticks

### Building a board

> New here? [docs/GUIDE.md](docs/GUIDE.md) explains the model — board params (shared inputs), widget config
> (local settings) and dataflow (derived values) — with worked examples.

- **🎛️ Board params** — declare a `params` block, reference `{{name}}` in any widget. Board Controls renders
  buttons, menus, text fields, number sliders and month steppers, plus a lookup box that validates free text
  against live Wikimedia data (type any museum, and the CIM cards follow) — one click re-aims every
  referencing widget. Each card can be scoped to a subset of params, so one drives the article and another the
  target language.
- **🔀 Widget-to-widget dataflow** — a widget can **emit** its output and another can consume it, either
  through a `source` picker in the ⚙ panel or `{{widget:id}}` interpolation in any config field; consumers
  re-fetch automatically when the value changes. Article Excerpt emits its first paragraph, so a Translator,
  Speaker or Markdown card can read the article. Try it: `?config=/flow-demo.json`.
- **🏷️ Names, not positions** — every widget has a visible, editable instance name. Renaming one that others
  reference repoints them atomically, after a confirm dialog that says how many references it will update.
- **✨ Ask** — describe what you want in plain language ("random sampling of images from a category") and get
  widget recommendations with settings pre-filled, powered by Wikimedia's LiftWing LLM through a same-origin
  relay, with an offline keyword fallback. The catalog it sees is generated by `npm test`, so it cannot drift
  from the registry.
- **Add, configure, inspect** — a searchable catalog; a ⚙ panel per widget with **Apply & Reload** pinned at
  the bottom so every setting stays reachable in a short card (the ⓘ panel likewise); asset-aware titles that
  say what each widget is analyzing.
- **Example board** — ✨ loads a showcase with every widget type; the guided demos are at `?config=/demos.json`.

### Sharing & persistence

- **Layout persistence** — saved to `localStorage` (`wikibento-layout`), survives refresh
- **Export / Import** — ⬇ downloads the whole board as `dashboard.json`; ⬆ loads one back (file or paste) with
  per-field validation, warnings, and nothing applied unless it is valid
- **Shareable links** — 🔗 opens a Share panel with a QR code and a copyable link: the `?config=` URL when
  there is one (short and phone-friendly), else the self-contained `#/d/…` hash; an oversized board gets a
  friendly notice instead of an un-scannable code
- **Reset** — ⓘ About explains the tool; Reset returns the starter board or a blank one, in one dialog

### Reliability

- **Freshness and time scope are visible** — every live widget shows when it last fetched (⏱ "updated
  2:34:05 PM · auto-refresh 1h") and the scope it resolved to ("2026-07"); the latter is enforced by `npm test`
- **A rate-limit-aware HTTP layer** — 4 concurrent fetches, `Retry-After` honoured as a global cool-down, one
  retry per 429 with an actionable *"wait ~Ns, then Retry"*, and a shared TTL cache (two widgets hitting the
  same 195 KB CSV cost one request, with a 15 s timeout and backoff)
- **Per-widget error boundaries** — a crash shows a themed fallback with Try Again instead of taking the
  dashboard down, and the grid reflows on resize

## Quickstart

```bash
npm install
npm run dev            # dev server → http://localhost:5173
npm run build          # tests, then production build → dist/
npm run preview        # serve dist/ at http://localhost:4173
npm test               # unit tests + the cross-document consistency gates
npm run smoke          # grid geometry + panel reachability (every ⚙/ⓘ action at any panel size)
npm run test:browsers  # the same board in Chromium + Firefox + WebKit
npm run lint           # oxlint
```

Also available: `npm run docs-facts` (the consistency gates alone; `:live` also checks what production
serves), `smoke:panels`, `smoke:qr`, `smoke:share`, `smoke:wayback`, and `update:cim-allow-list`.

Browser runs need the engines installed **with the repo's own `playwright-core`**, and some hosts need a
remote-browser daemon or an explicit engine path — see [docs/BROWSER-TESTING.md](docs/BROWSER-TESTING.md).

## Project Structure

```
wikibento/
├── index.html                 # entry HTML (inline SVG favicon)
├── vite.config.js             # Vite + React plugin
├── public/                    # static assets + dashboard.json (hosted sample config)
├── docs/                      # the documentation set (indexed below)
├── pipeline/  video/          # the demo-video engine, and this project's script for it
└── src/
    ├── main.jsx               # React 19 bootstrap
    ├── App.jsx                # grid, state, persistence, toolbar, URL boot
    ├── App.css                # dark theme + all component styles
    ├── components/            # AddWidgetPanel, ImportPanel, SharePanel, AboutPanel, ErrorBoundary
    ├── lib/
    │   ├── dashboardConfig.js # format v1: example dashboard + validateDashboard()
    │   ├── markdown.js        # tiny zero-dep Markdown renderer (Text/Markdown widget)
    │   ├── share.js           # URL loading/sharing (?config=, #/d/<base64>)
    │   └── qr.js              # URL → inline SVG QR code (qrcode-generator)
    └── widgets/
        ├── index.js           # WIDGET_TYPES registry (add a widget here)
        ├── WidgetFrame.jsx    # title bar, config panel, load/error/refresh lifecycle
        └── dataSources.js     # API fetchers (one per widget, batched where needed)
```

## Technology Stack

| Layer | Choice |
|---|---|
| Framework | React 19.2 (StrictMode) |
| Build | Vite 8.2 |
| Grid | react-grid-layout 2.2.4 + react-resizable 4.0.2 |
| Linting | Oxlint (react + oxc plugins) |
| Charts | Hand-rolled SVG (no chart library used) |
| QR codes | `qrcode-generator` (client-side, zero-dep; SVG rendered in-app) |
| Pair-built with | The [Pi coding agent](https://github.com/earendil-works/pi) on **DeepSeek V4** |

A substantial part of this project was written that way: the widget implementations and their batched
fetchers, the rate-limit-aware HTTP layer, the docs↔code consistency gates (`scripts/docs-facts.mjs`), the
widget catalog and this documentation set, and the demo-video pipeline. The agent works in a repository under
review — every change has to pass the test suite and the docs gates, and deploys are made by hand
([Andrew Lih](docs/AUTHORS.md), `User:Fuzheado`), who directs the work and checks the result in a browser.

## Status

WikiBento is smoke-tested per widget in a real browser, against named live assets — the dated record, with
the failures each check was written for, is [docs/VERIFIED-WORKING.md](docs/VERIFIED-WORKING.md). The claims
are checked rather than asserted: `npm test` regenerates the widget manifest and enforces the cross-document
consistency gates, `npm run smoke` enforces grid geometry and that every ⚙/ⓘ action is reachable at any panel
size, and `npm run test:browsers` loads a real board in all three engines.

## Documentation

Every document, grouped by what you would want it for. The long-form material lives here — the README is the
front door.

- **Start here** — [GUIDE](docs/GUIDE.md) (the model + cookbook) · [TUTORIAL](docs/TUTORIAL.md) (build a board
  step by step, then store it on a wiki) · [WIDGET-CATALOG](docs/WIDGET-CATALOG.md) (all 39, with APIs) ·
  [JSON-FORMAT](docs/JSON-FORMAT.md) (board spec v1 + [schema](docs/dashboard.schema.json)) ·
  [SCREENSHOTS](docs/SCREENSHOTS.md) (dated snapshots of real boards)
- **Build & extend** — [ARCHITECTURE](docs/ARCHITECTURE.md) · [WIDGET-DEVELOPMENT](docs/WIDGET-DEVELOPMENT.md)
  · [BOARD-COMPOSITION](docs/BOARD-COMPOSITION.md) (every widget, wired) · [DATA-SOURCES](docs/DATA-SOURCES.md)
  (every endpoint, cap and gotcha) · [MODULARITY-AND-DATAFLOW](docs/MODULARITY-AND-DATAFLOW.md) ·
  [MEDIA-DATAFLOW](docs/MEDIA-DATAFLOW.md) · [SCALABILITY](docs/SCALABILITY.md) ·
  [ASK-ARCHITECTURE](docs/ASK-ARCHITECTURE.md) · [INTENT-BENCHMARK](docs/INTENT-BENCHMARK.md)
- **Why & research** — [WHY-WIKIBENTO](docs/WHY-WIKIBENTO.md) (the case, and the measured ledger) ·
  [PHILOSOPHY](docs/PHILOSOPHY.md) · [PARADIGMS](docs/PARADIGMS.md) · [WIDGET-MESSAGING](docs/WIDGET-MESSAGING.md)
  · [PLUGIN-TRUST](docs/PLUGIN-TRUST.md) · [TOOL-LANDSCAPE](docs/TOOL-LANDSCAPE.md) and its
  [synthesis](docs/TOOL-LANDSCAPE-SYNTHESIS.md) · [TOOLFLOW-ANALYSIS](docs/TOOLFLOW-ANALYSIS.md) ·
  [TAPESTRY-EVALUATION](docs/TAPESTRY-EVALUATION.md) · [GLAMORGAN-WIDGET](docs/GLAMORGAN-WIDGET.md) ·
  [WAYBACK-REPLAY-LATENCY](docs/WAYBACK-REPLAY-LATENCY.md)
- **Ideas** — [WIDGET-IDEAS](docs/WIDGET-IDEAS.md) · [DEMO-IDEAS](docs/DEMO-IDEAS.md) ·
  [ROADMAP](docs/ROADMAP.md) · [ISSUES](docs/ISSUES.md) ·
  [LIFELINE-WIDGET](docs/LIFELINE-WIDGET.md) (timelines of lives, and comparing two of them — measured
  Wikidata-vs-prose coverage, what shipped, what is next)
- **Testing & ops** — [BROWSER-TESTING](docs/BROWSER-TESTING.md) (the suites + engine-install traps) ·
  [VERIFIED-WORKING](docs/VERIFIED-WORKING.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) and the
  [deploy log](docs/DEPLOYMENTS.md) · [AGENT-MEMO](docs/AGENT-MEMO.md) ·
  [BUG-REPORT-ios-safari-fetch](docs/BUG-REPORT-ios-safari-fetch.md) · [AUTHORS](docs/AUTHORS.md)
- **Tutorial video** — [TUTORIAL-VIDEO-STATUS](docs/TUTORIAL-VIDEO-STATUS.md) (state, how to re-run, what is
  missing) · [pipeline/README](pipeline/README.md) (the reusable engine) ·
  [TUTORIAL-VIDEO-TOOLING](docs/TUTORIAL-VIDEO-TOOLING.md) (the ecosystem research behind it)

## Feedback & Feature Requests

- **Bug reports & concrete feature requests** → [GitHub Issues](https://github.com/fuzheado/wikibento/issues) —
  templates for both. A board config (`?config=` link, or the `/dashboard.json` export) plus your browser
  helps more than anything else.
- **Ideas & brainstorming** → [Discussions → Ideas](https://github.com/fuzheado/wikibento/discussions/categories/ideas)
- **Boards you built** → [Discussions → Show and tell](https://github.com/fuzheado/wikibento/discussions/categories/show-and-tell)

Requests that get picked up are tracked with design notes in [docs/ISSUES.md](docs/ISSUES.md) and
[docs/ROADMAP.md](docs/ROADMAP.md), so you can watch an idea become a widget.

## License

Wikimedia-oriented demo dashboard. Data comes from Wikimedia APIs (CC BY-SA 4.0 content licensing applies to
any downstream use of article content; pageview and stat aggregates are public statistics).
