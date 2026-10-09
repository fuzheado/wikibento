# WikiBento — Handoff

*The state of the project **now**. History: [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) ·
design rationale: [docs/ISSUES.md](docs/ISSUES.md) · feature docs: [README.md](README.md).*

## What this is

WikiBento is a dark-themed, drag-and-drop widget dashboard for Wikimedia —
"insights and action". A single-page React app (React 19, Vite 8,
react-grid-layout) whose **data path is client-side**: every live widget fetches
directly from CORS-enabled APIs (Wikimedia's RESTBase pageviews, MediaWiki Action
API, Commons, Wikistats, Commons Impact Metrics, WDQS/QLever, MinT — and the Internet
Archive's metadata, IIIF and Wayback APIs), beside a **small bounded relay** for the
few jobs a browser cannot do (a map service that refuses browser-shaped requests, two
sources with no CORS header, a short-URL expansion, the Ask advisor's LLM key —
`docs/PROXIES.md` is the inventory). A handful of
static widgets (Text/Markdown, QR, Board Controls, Speaker, Wiki Page, Text List,
and the dataflow nodes) render from config.

Dashboards are JSON configs (format v1) that persist to `localStorage`,
export/import, and load via shareable URLs — embedded in the hash
(`#/d/<base64>`) or fetched from a URL (`?config=<url>`, including on-wiki pages
like `Commons:WikiPortraits/Bento-demo.json`). The Toolforge deployment adds a
few same-origin relays for APIs with no CORS (`/api/staticmap`, `/api/proxy`,
`/api/resolve`, `/api/petscan`, `/api/wayback-gallery`, `/api/ask`) — plus one
route that reaches nothing at all, `/api/validate`, which runs this app's own
board validator so an outside model can check its work (`docs/PROXIES.md`).

## Current state

Feature-complete for v1 and deployed.

| | |
|---|---|
| Live | <https://wikibento.toolforge.org/> |
| production bundle | `index-YcF0cYWn.js`, `server.js` and `validator-bundle.mjs` (the relay, `/api/validate`, and the `/mcp` tool surface) |
| deployed | 2026-10-09 (latest) — **nine deploys that day**; the row-by-row record is `docs/DEPLOYMENTS.md`: the zones MVP and its two follow-ups (bigger targets, a channel of its own), the caching policy that made a working deploy look broken, the OCR'd diagram demo, the mobile jump (ISSUE-144), the empty-card copy (ISSUE-145), a click that misses a zone now doing nothing (ISSUE-146) and **an image-to-image tour that needed no new code** (`?config=/image-tour-demo.json`) — and, on 2026-10-02, the whole Ask door: the served guide, `/api/validate` and the `/mcp` tool surface. **The deploy shape to remember:** a `src/` change ships `dist/` **+** `validator-bundle.mjs` (the bundle, not the server, absorbs app code); `server.js` only when a route changes. |
| registry | 36 widget types — 27 data-driven, 9 static |
| showcase catalog | `?config=/dashboard.json` — 37 widgets covering all 36 types |
| front door for demos | `?config=/demos.json` (the hub) |
| entry board | ✨ Example (3 starter widgets), or `?config=/article-switcher-demo.json` |
| pending deploy | none — production serves this branch's tip, verified 2026-10-09 by running the **whole board sweep against production** (`npm run smoke:boards -- --base https://wikibento.toolforge.org`, every check including the click paths) and `node scripts/docs-facts.mjs --live`; the live MCP and relay checks were last run 2026-10-05 |
| newest capabilities | 🖱 **a click on a picture does nothing unless the card asks for it** (ISSUE-146, live 2026-10-09) — a single image used to be one big `<a href>`, so a click that missed a zone landed on Commons; the Gallery's *Clicking an image* now defaults to **Nothing** in every mode (the picture is a plain element: no href, no long-press "open in a new tab", no tab stop) and the old behaviour is one dropdown away · ◇ **the empty card says what it is doing** (ISSUE-145) — *Nothing selected yet · Fills in from "Levels of organisation". · This card updates when information is sent to it.*, with the two *mistake* cases in the warning colour, and seven gate checks that used to assert the sentence now asserting a `data-state` · 📱 **a reload no longer empties a card** (ISSUE-144) — the mobile jump to the top of the page, measured per frame and fixed by keeping the previous content plus a height floor · 👆 **a picture you can click** (ISSUE-138 slice A, PR #116, live 2026-10-09) — two demos ship it: `?config=/zone-demo.json` (a photograph with zones that are the file's **own Commons notes**) and `?config=/biosphere-demo.json` (**every label of a diagram**, read out of the picture by Apple Vision OCR — 13 words, each mapped to the article its meaning wants, with `hotspotStyle: subtle` so there is no ring to clutter the text) — the 🖼️ Gallery's single-image mode takes a **`zones` text field** (`x,y,w,h | label | kind | value | action`, percentages of the picture), draws each zone as a button in a frame whose aspect ratio *is* the file's (measured, so a percentage lands on the same pixels at any card size), and a click publishes the value on the card's existing `selection` channel — which is why the consumer needs no new wiring at all. `open` zones become wiki URLs; unreadable lines are **reported on the card**, never clamped or dropped. Each zone draws a **marker of at least 30px** (centred on the file's own box, which stays drawn exactly as that file drew it) with a fat-finger margin beyond it, and a click is resolved **by geometry** — inside a box, else the nearest centre — because two of the demo's peaks sit 28px apart. A zone publishes on the card's own **`zones`** channel, beside the `selection` channel the picture's own click uses for the file it shows — the first live demo proved the collision (clicking the photograph fed a *file* to an *article* consumer), and the browser check now asserts both directions. `?config=/zone-demo.json` is the demo: a Commons picture-of-the-day with the file's **own six image notes** as clickable peaks, and an 📄 Article Excerpt beside it that loads whichever one you click · 🖼️ **transparent and vector media sit on a plate** (ISSUE-141, PR #113, 2026-10-08) — a row of chemical diagrams on a shared board came out black-on-black, because every image site painted the card background behind its media; the fix is a light plate behind the picture, `auto` now finds a transparent PNG as well as a vector, and the plate has a **direction** (light ink keeps the dark background instead of forcing a white plate) (Andrew's report from another project, reproduced and closed the same day) · 🔀 **wire a card from the card itself** (PR #109, 2026-10-05) — every card's ⊕ opens a two-sided spawn panel: the producers it can read from, the consumers it can feed, and **refused wires surfaced rather than dropped**; behind it the data model gained its **third axis** (`VALUE_KINDS`: what a value *is*, beside `subject`, what it is *about*, which is what stops a name field being handed prose). `npm run smoke:spawn` — 19 checks in a browser, run against production on the day it shipped · 🌐 **the panorama works like a 360° should on a phone** (ISSUE-137, 2026-10-05) — a ⛶ in the card's meta row expands it over the whole screen, because Pannellum's own fullscreen button is only created where the Fullscreen API exists and iPhone Safari has none for non-video elements; ✕/Esc closes, body scroll locks, the grid slot keeps its shape — and the in-viewer title dropped from Pannellum's 20px headline to 12px (the meta row already names the file). Verified in Playwright WebKit at an iPhone 14 viewport · 📥 **a board ⇄ JSON Canvas** (PRs #100 + #104, 2026-10-04/05) — the export writes a `.jsoncanvas` document (foreign top-level keys survive the round trip) and ⬆ Import reads one back; `smoke:canvas` / `smoke:canvas-import` · 🔀 **the emitter data model, queried both ways** (PR #105, 2026-10-05) — `spawnOptions.js` answers "which cards can this one feed?" from the registry's `outputs`/`kinds`, and the spawn menu offers only pairs the card can read (ISSUE-96's infrastructure; 16 of 36 publish) · 🏗️ **the CIM family is three types** (PRs #98 #99 #101, 2026-10-03/04) — `cimStats`/`cimTrend`/`cimRanking` by result shape, eight retired ids resolving at lookup with the implied selector merged into defaults (boards never rewritten), `cimRanking` publishing ranked references and stats/trend their subject · 🗂️ **the docs split by audience** (2026-10-04) — the founding-era research corpus (8 files) moved to `docs/research/` with dated-record semantics; 41 current-state docs stay flat · 👀 **presentation shows no board notice** (ISSUE-120, 2026-10-02) — in `?kiosk=1` and `?lean=1` the borrowed-board notice is gone, because both modes promise the editing affordances it is made of (Esc and ✕ Exit stay); verified in a built browser with a control that proves the notice *does* appear on a borrowed board first · 🧹 **the demo boards agree with their own layout** (2026-10-02) — react-grid-layout was repairing twelve overlapping pairs across `dashboard.json` (9), `glam-demo.json` (2) and `front-page-demo.json` (1) on every render, so the files now store what the browser was already drawing (`npm run repack:layouts`, measured render-neutral on **all 58 cards**) and `tests/demos.test.mjs` refuses a board that overlaps itself · 🚪 **the door, and its prerequisites** (2026-10-02): **`/board-guide.md`** is served — the contract for writing a board *outside* WikiBento, **assembled** (not a second copy) from the manifest, `docs/JSON-FORMAT.md`, `docs/WIRING-BOARDS.md` and the widget map by `npm run guide:board`, with its §1 example pasted through `validateDashboard` by the suite and `docs-facts` running its own `--check`. It **opens by saying what WikiBento is** (§0, quoted from the README rather than described a second time) and points at the README, the GUIDE, the widget catalog, the one-page **widget map**, the spec and the live demo hub — as **absolute GitHub links**, because a served page that hands out relative paths hands out 404s (the docs are not served here; `docs-facts` fails if one of those comes back); the two bugs under it are fixed (an unknown path was a **500 leaking `/data/project/wikibento/www/js/dist/…`**, now a plain 404 that names nothing, and `/manifest.json` sent no CORS header, now `*` on the three public files and deliberately not on `index.html`); and the advisor is **warned off CIM** for categories outside the allow list — the ⚙ hint, the catalog and the manual all say it (§ *The Ask door and MCP* below) · 🧭 **the widget map** (2026-10-01, asked by Andrew: *"40 some widgets is hard to grasp for human being, and I'm a very visual person"*) — all 36 types on one page, grouped by **what you must supply** (the CIM family as a *gate* row, not a topic), coloured by the panel's families, badged with the gates (static · relay · alpha · publishes · consumes), plus the shipping chains: `docs/widget-map.pdf` (one page, A4 landscape) and its generated twin `docs/WIDGET-MAP.md` — `npm run map:widgets` regenerates both from the manifest, and a docs-facts check fails the build if a registered type is missing · 🧠 **the Ask advisor audited, and two defects fixed** (2026-10-01): `docs/ASK-ARCHITECTURE.md` was rewritten from 171 live runs (the prompt is **11.4K tokens measured**, the catalog alone yields 93% right widgets but **0%** usable envelopes, boards validate 18/18 and render 6/6), and the audit's own ranked fixes 1–4 landed with tests — **`validateAssembly` had been pruning the app's own `id#channel` references** (it deleted the speaker from every canonical chain) and **⬆ Import dropped a board's `params`** · 🤖 **an MCP endpoint** (2026-10-02) — `/mcp`, JSON-RPC over Streamable HTTP, **stateless and authless** (the tools
read public data; a token would protect nothing), with four read-only tools: `get_catalog`, `get_board_guide`,
`validate_board` and `make_board_url`. It runs the app's own validator and share codecs (bundled), so it cannot
disagree with ⬆ Import, and `npm run smoke:mcp` speaks the protocol at it — 16 checks including the refusals
(`docs/MCP.md`) · 🩺 **the board checker, served** (2026-10-02): a board from a chat can be checked **by the chat** — `GET /api/validate?z=<the app's own Share payload>` (or `?d=`, or `?board=`, or POST) returns the same verdict ⬆ Import gives, as JSON, with every message naming the section of the served guide that states the rule; no key, no account, no upstream, 256 KB cap and 30/min per client. `npm run check:board -- board.json` is the same checker in a terminal. ISSUE-134 was settled the same day in favour of the documented model: a value the registry can read is **repaired and reported**, not refused |
| earlier in September–October | 🗺️ **A map in a card** (ISSUE-131) — a coordinate, a Wikidata item or a page title, drawn by Wikimedia's map service at the card's own size, with our pin and OpenStreetMap's credit; the card asks **our own relay** (`/api/staticmap`), because the service refuses browser-shaped requests · 🔒 **every proxied route inventoried and bounded** (ISSUE-133, `docs/PROXIES.md`) — host allowlist, streamed byte cap, deadline, per-client rate limit, in-flight ceiling, bounded caches, and a guard in `npm test` that tries to break them · 🖼️ **Edge to edge on seven types** (ISSUE-126/127) · 🏷️ **widget names checked against the docs** (ISSUE-128) · 🗺️ **the map card's two rough edges closed** (ISSUE-131, 2026-09-30): the header names the **resolved place** (`Q64` → "Berlin") and a failed relay prints **its own reason** with a Try again that re-asks, instead of a broken image (`npm run smoke:map`) · 🧩 **geometry, the standard way** (ISSUE-132, 2026-10-01): paths and areas drawn from the points list, **pasted GeoJSON** and **another widget's geometry** (the Map publishes what it draws as `kind: 'geojson'`, and the ⚙ picker offers only geometry emitters to a geometry field), all through `src/lib/geojson.js` — **RFC 7946**, `FeatureCollection`, `[lon, lat]` WGS84, STAC/OGC time names, rings closed/swapped axes repaired/oversized shapes simplified and said so (`docs/GEOMETRY.md`) · 📐 **the map backlog's spine verified against real images** (ISSUE-132): `mercatorPixel` checked against five rendered maps, and the **card geometry** (`src/lib/mapOverlay.js` — the image→card transform, the SVG twin of `object-fit`, and which points a crop takes away) checked on cards of a different aspect, where the browser's own rendering has to agree to the pixel; both phases have a built-in control that fails the run if a wrong transform slips past (`npm run check:map-landmarks`) · 🧾 **the SPARQL table renderer restored** — a region rewrite on 2026-09-14 deleted `TableCard` while `SparqlCard` kept calling it, so every table-mode query crashed behind "Try again"; found by lint, fixed, guarded by a new test · 🗺️ **points on a map, and a query as a map** (ISSUE-132 items 1–2, 2026-09-30): the Map widget takes a **list of places** (a coordinate, a QID or a page title, one per line, up to 100, batched at 50 per call) with **Frame the points** computing the centre and zoom to fit them, drawn as our own SVG overlay that mirrors the image's `object-fit`; the SPARQL widget draws a result's coordinates as a map, auto-detected or forced. The projection **wraps longitude** now — a Fiji/Samoa fit used to be a blank card, found by the auto-fit probe and pinned as the fifth landmark case (`npm run check:map-landmarks`) |

Pick mode is the newest verb (ISSUE-114). 🖌 **Pick ▾** in the header arms a widget type, and each
click on an item inside a card places a card for that item — the brush persists, so six excerpts from one
list of links is six clicks and no dialog. The menu only offers types that can consume what you clicked; a
row whose own link is a Wikipedia article or a Commons file declares its own kind, which is what made
rankings, top-pages rows, CIM file rows and GLAM filmstrips pickable at once. `npm run smoke:pick` asserts
the interaction and every publisher (19 checks) in a real browser, and it refuses to run at all against a
`dist/` older than `src/`.

**Every widget type is in the showcase catalog** — no exceptions, and
`scripts/docs-facts.mjs` keeps it that way (it fails the build if a registered
type is missing from `public/dashboard.json` without a reasoned entry in its
`CATALOG_EXCLUSIONS`). The catalog's article switcher is a real board param:
one click re-aims five cards (Excerpt, Quality, Assessments, Edit History,
Gallery).

**Constitutions** (all gate `npm run build`, hence a deploy):

| command | asserts |
|---|---|
| `npm test` | the whole suite — a bundle per constitution area: scope, freshness, manifest compliance (including **emitters, channels, `primary`, prose→reference, and the project picker's no-hardcoded-lists rule**), panel, dataflow, demos, assembly, trend-axis, gallery, config-load, references, projects, URL state… — plus `scripts/docs-facts.mjs` — and the browser checks that need the build: **`npm run smoke:built`** (a board in `dist/` renders, no page errors), **`npm run smoke:boards`** (a board from *outside* — pasted through ⬆ Import — draws one card per widget with no card left waiting for a value), then `npm run build:validator` (the bundle `/api/validate` runs) and `npm run smoke:relay` (the routes' bounds). A green suite therefore cannot hide an app that throws in the built bundle, or a pasted board that never appears. |
| `npm run smoke:built` | the **built** artefact loads at all — cards render, no page errors (a bundle-time cycle or use-before-init is invisible to unit tests and to `vite build`) |
| `npm run smoke:boards` | **a board from outside draws**: three demo boards loaded from `?config=` *and* the same three **pasted through the app's own ⬆ Import panel**, plus the frozen model replies from `tests/assembly-fixtures.mjs` pasted the same way — one card per widget by id, no card left waiting for a value, no page or console errors, and it refuses a stale `dist/`. It exists because the audit's Import-`params` defect survived *without a check that drove Import with a params board* | `-- --base <url>` runs the same sweep against a **deployment** instead of a local build (the deploy check, added 2026-10-09).
| `npm run check:board -- board.json` | the **board doctor** (`src/lib/boardDoctor.js`) — the app's own verdict on a board that came from a chat, a notebook or another tool: what blocks the import, what the app repairs silently, what it loads but will ignore, and the gates (relay, experimental, CIM's allow list). `--json` for scripting, `--quiet` for an exit code, `exit 1` when the board cannot load. **The same checker is served** at `/api/validate` (`GET ?board=` / `?d=` / `?z=`, or `POST`), which is what lets a model check its own board inside a conversation |
| `npm run build:validator` | writes `deploy/validator-bundle.mjs` — the app's validator, bundled for the server (the tool has no `src/`). `--check` fails when the bundle is older than `src/`, the stale-artefact trap `dist/` taught; the deploy is **three** files when this changes |
| `npm run check:layouts` | no board in `public/` overlaps itself (`npm run repack:layouts` stores what the browser already renders; measured render-neutral on all 58 cards). A no-overlap assertion in `tests/demos.test.mjs` runs it as part of `npm test` |
| `npm run guide:board` | regenerates `public/board-guide.md` (served at `/board-guide.md`) from the manifest + `docs/JSON-FORMAT.md` + `docs/WIRING-BOARDS.md` + the widget map's chains; `scripts/docs-facts.mjs` runs its `--check`, so an edit to any source doc fails the gate until the page is regenerated |
| `npm run map:widgets` | regenerates the one-page widget map (`docs/widget-map.pdf` · `.png` · `.svg` · `WIDGET-MAP.md`) from the manifest; docs-facts fails if a registered type is missing from it |
| `npm run smoke:mcp` | **the MCP endpoint, spoken to as a client** — part of the suite; **sixteen** assertions. `initialize` returns an `instructions` field of 499 characters (under the 512 ChatGPT reads), revision negotiation answers with the client's revision when it is known, a notification gets 202 with no body, `tools/list` carries schemas, and then a real call of all four tools — `get_catalog` (every type in the manifest the tool serves — the count is read, not written, because a hard-coded 42 outlived the registry), `get_board_guide` (§1 and the whole 64 KB), `validate_board` (clean for a good board, `unusable` naming the missing card for a broken one) and `make_board_url` (`#/d/` and `#/z/` links, the QR ceiling, and a refusal for a board that cannot import) — plus every refusal a client hits: an unknown method (-32601), an unknown tool (-32602, listing the four), `GET` (405), a foreign `Origin` (403) and an oversized body (413). `--base https://wikibento.toolforge.org` runs the read-only half against a deployment (`docs/MCP.md`) |
| `npm run smoke:relay` | the **proxied routes** keep their promises: host allowlist, byte cap, size ladder, a cache hit, the rate limits answering a burst (the default allowance **and** the map's own, which must *not* answer — a board of map images is normal traffic), a second client still served, sane memory — `docs/PROXIES.md` |
| `npm run smoke` | grid geometry (measured px vs intended formulas) + `smoke:panels` |
| `npm run smoke:panels` | every ⚙/ⓘ action reachable at w3 h3 across 3 widths |
| `npm run smoke:spawn` | the **⊕ spawn panel** in a browser — a wired pair actually moves, a refused wire is said out loud, and the value-form axis holds (a name field takes no prose) |
| `npm run smoke:plate` | transparent and vector media **render on the dark surface** — the plate behind the picture, in a real browser (ISSUE-141) |
| `npm run smoke:iabook` | the 📖 Internet Archive reader in a real browser — 33 assertions: the manifest's page count (not the metadata's), search-inside with the word boxed on the page, facing pages, right-to-left order, PNG export |
| `npm run smoke:document` | the 📄 Commons document reader — 37 assertions: page counts from `imageinfo`, the served-width ceiling, the DjVu, the polite refusal of a non-document, and the Wikisource panel open on load and following the page turn |
| `npm run smoke:story` | story mode end to end — a story card for a real article pasted in through ⬆ Import: the panel mix (a mix dominated by one kind means the shape data never arrived), caption coverage, chapters, the progress bar, and screenshots |
| `npm run smoke:pick` | pick mode end to end in a real browser — arm a brush, place a card from a row, refuse a twin, Undo it, the kind gate, and each publisher: 19 checks, against the built app or against production with `--base` |
| `npm run test:browsers` | Chromium + Firefox + WebKit load a dashboard with 0 error frames |
| `npm run test:browsers:demos` | **every demo board the hub links**, including the full-catalog board × every engine × desktop **and** an iPhone profile — asserting a card per widget, no error frames, no console errors, no collapsed card, no `—` placeholder and no empty ranking. ~8–20 min, so it is a release check, not a per-commit one. **It earned its keep on 2026-10-01**: four runs at once from one address pushed the map board past the relay's flat 40/min limit, and every map card showed `too many relay requests` — the limit is now per route (240/min for maps) and the card waits for its box to settle before asking for an image |
| `npm run smoke:url` | the URL tells the truth: a claim is dropped when the board diverges, Share embeds the board on screen, present params stay opt-in and reversible (9 actions traced) |
| `npm run smoke:map` | the Map card in a real browser, and what draws on it: the header names the place the fetch resolved (`Q64` → "Berlin"), a failing relay shows **its own reason** (mocked 502) rather than a broken image, **Try again** recovers, the pin covers the coordinate the map was centred on, a **list of points** draws one marker each — inside the card, framed rather than lost in a world view, counted on the card, with no centre pin — and a **SPARQL result with coordinates** draws the same kind of map from a live query, a list can draw an **area**, geometry **travelled from another map** (its `source` field), and a **pasted GeoJSON path** drew with its date (26 checks); on a host without the relay it checks the honest message instead |
| `npm run check:map-landmarks` | the map geometry against real rendered maps (ISSUE-132), in three phases (the third is a **live Wikidata geoshape**, Museum Island, drawn and then classified inside/outside: land in the island, the Spree just outside, with a mis-scaled control): **image space** — five maps and eleven Wikidata-anchored landmarks across both hemispheres (including a Fiji/Samoa pair **across the date line**, which is what a missing longitude wrap looks like), each predicted pixel classified water/land — and **card space** — the same landmarks on cards of a deliberately different aspect (wide/tall crop, letterbox), where the browser's own `object-fit` + `preserveAspectRatio` placement must match `overlayForPlaces` to the pixel and the map underneath must still be the landmark. Both phases carry a control (a mirrored/doubled projection; a naive stretch) and fail the run if nothing notices |
| `node scripts/docs-facts.mjs --live` | the bundle HANDOFF claims is deployed is what production serves |

### Keeping the docs true — what is gated, and what is still human work

The counts are derived, never hand-maintained, and **every markdown file is scanned** (72 current-state sources, since
2026-10-02 — it was `README.md` + `HANDOFF.md` + the boards before, which is how `docs/BOARD-COMPOSITION.md` kept
a stale count in three places and `docs/DEMO-IDEAS.md` kept another <!-- docs-facts: quotation ("38 widget types", "37") -->). Five additional mechanisms, in the order they
catch things:

| mechanism | what it holds | how to satisfy it |
|---|---|---|
| **count rules** over every current-state doc + every `public/*.json` | `N widget types`, `all N widgets`, `N catalog widgets`, `N measurements`, `renders N cards` … must equal the registry (36 types / 37 catalog widgets) | fix the number, or **state it by reference** ("every type", "the catalog") — the better fix |
| **dated records are printed, not ignored** | `ISSUES` · `DEPLOYMENTS` · `SCREENSHOTS` · `VERIFIED-WORKING` · `WHY-WIKIBENTO` · the bug report · `AGENT-MEMO` may keep the number that was true then; every mismatching claim in them is **listed** in the gate's output | nothing — but read the list; a *stale claim* wearing a record's clothes is what a human notices and a regex cannot |
| **completeness claims** | a file that says "complete reference"/"all N types" must name every registered id, and each numbered section must list as many entries as its heading claims | add the missing entries (that is how `wikiBox`, `iaBook` and `documentReader` were found missing from `BOARD-COMPOSITION.md`) |
| **retired names · retired claims** | names the registry no longer uses, and *sentences* that became false. The claims list is scoped: a global sweep is banned everywhere, the bare phrase only in the four front-door files, because in the design docs it is this project's own vocabulary for a scope decision <!-- docs-facts: quotation ("no backend, no login, no proxy") --> | rewrite the sentence to say what is true, and add the finding to the list. Quote a retired claim on a line marked `docs-facts: quotation` |
| **generated artefacts** | `public/manifest.json`, `public/board-guide.md`, `docs/widget-map.*` are built from the registry + the docs, and the gate runs their `--check` | `npm run guide:board` · `npm run map:widgets` · regenerate after editing a source doc |

Two habits make the rest cheap: **state volatile facts by reference** (counts, hashes, totals), and **spell out numbers
under ten** ("all seven widgets") — which is house style anyway and keeps a dated, correct sentence from looking like a
current count claim. What no gate can do is notice a sentence that is *wrong* rather than inconsistent: the README's
sweeping claim and the guide's missing introduction were both found by a human reading the document <!-- docs-facts: quotation ("no proxy") -->. Read the front door
after a release; the gate will tell you what else moved.

`public/manifest.json` (the Ask advisor's catalog) and `public/dashboard.json`
(the showcase) are both **derived artifacts** kept honest by tests, so they
cannot drift from `src/widgets/index.js`.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # runs the full suite, then → dist/
npx vite preview       # http://localhost:4173
npm run lint           # oxlint (pre-existing warnings only: vendored pannellum + legacy nits)
```

Demo URLs (against `vite preview`):
`http://localhost:4173/?config=/demos.json` — the hub ·
`http://localhost:4173/?config=/dashboard.json` — the full catalog ·
`http://localhost:4173/?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json` — on-wiki config.

## Deploying

Read the `toolforge-nodejs` skill before any `webservice` command (**there is no
`static` webservice type** — this is `node20` serving `dist/` via
`deploy/server.js`), and `docs/DEPLOYMENT.md` for full detail. Fresh-session-safe
shape:

```bash
npm run build
rsync -az --delete dist/ alih@dev.toolforge.org:/data/project/wikibento/www/js/dist/
scp deploy/server.js alih@dev.toolforge.org:/data/project/wikibento/www/js/server.js   # only when server.js changed
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart"
```

- **`server.js` is not part of `dist/`** — if it changed, the deploy is two copies:
  the assets, and the server. Skip the `scp` and the new routes are simply not there
  (the app still works, which is what makes it easy to miss).
- **`/api/validate` needs a third file.** The endpoint runs the app's own validator, bundled
  (`npm run build:validator` → `deploy/validator-bundle.mjs`, a build artefact, not committed — like `dist/`). So a
  deploy after the validator changed is **three** copies: `dist/`, `server.js`, `validator-bundle.mjs`. The route answers
  `503` when the bundle is missing, naming it, rather than pretending boards are invalid. `node scripts/build-validator.mjs
  --check` fails if the bundle is older than `src/` — the same stale-artefact trap `dist/` taught.

- SSH as the **personal** account (`ssh alih@dev.toolforge.org`) — `tools.wikibento@`
  is not an SSH login and fails with `publickey`. Tool commands go through
  `sudo -niu tools.wikibento` (never `become` over a chained SSH command).
- Host inventory alias: `tools` = `alih@dev.toolforge.org` (use `host_exec`).
- After deploying, verify: the bundle hash in the served `index.html`,
  `/api/resolve` → 200, and `node scripts/docs-facts.mjs --live`.
- Then **update the two lines above** ("production bundle" / "deployed") and add a
  row to `docs/DEPLOYMENTS.md`.
- `public/*.json` changes (`dashboard.json`, the demo boards) ship with a deploy —
  they are not live before one.

## Architecture in one screen

```
App.jsx (state: widgets[] + layout[] + params{}, URL boot, borrowed-vs-adopted
persistence, claim drop on divergence)
├── GridLayout (12 cols, vertical compaction, single column under 768px)
│   └── WidgetFrame × N (fetch lifecycle, request-serial guard, ⚙ panel, emit publisher)
│       └── renderer: StatCard | RankingCard | TrendCard | GlamCard | MarkdownCard | …
├── AddWidgetPanel / ImportPanel / SharePanel / AboutPanel
└── src/widgets/index.js — WIDGET_TYPES registry (THE extension point)
    each entry: { id, name, icon, category, defaults, configFields, fetch, transform,
                  renderer, timeScope, emit?, source?, defaultLayout?, autoHeight?,
                  labelFromConfig?, getRenderer?, needsRelay?, experimental? }
    fetch → raw data; transform → renderer contract; WidgetFrame owns loading/error/retry
    static widgets (markdown, qrCode, speaker, boardControls, dataflow nodes) omit `fetch`
    emit → publishes output for dataflow consumers (a `source` field / {{widget:id}})
```

Key files: `src/lib/urlState.js` (the URL contract: one reader, one writer, claim
integrity) · `src/lib/borrowedBoard.js` (borrowed boards, the recovery stash, the
notice's rule) · `src/lib/reference.js` (a page plus its wiki: `enwiki:Weddell Sea`,
and the one project→host mapping) · `src/lib/projects.js` (every wiki, ordered
recency → default → curated → rest) · `src/lib/wikiBox.js` (rendering a wiki template:
sanitise, scope, rewrite, and what a click means) · `src/lib/speech.js` (the typed speech value — text + language — and choosing a voice by language) · `src/lib/mapImage.js` (the static-map URL, the size ladder, and `mercatorPixel`) · `src/lib/mapOverlay.js` (where a place lands on a card: the image→card transform, the SVG twin of `object-fit`, and the crop's own visibility) · `src/lib/geojson.js` (geometry in and out: RFC 7946 intake, repairs, refusals, the size cap, time, and the rows a timeline reads) · `src/lib/paramSources.js` (the validated lookup sources: Commons categories, galleries, files, articles, QIDs) · `src/widgets/index.js` (registry) · `src/widgets/dataSources.js`
(fetchers, one per type, batched) · `src/widgets/WidgetFrame.jsx` (lifecycle +
renderers) · `src/lib/dashboardConfig.js` (format + `validateDashboard()` + the
example board) · `src/lib/params.js` (board params, reference resolution) ·
`src/lib/dataflow.js` (emitter signatures) · `src/lib/httpRetry.js` (rate-limit
layer) · `src/lib/markdown.js` · `src/lib/share.js` · `src/components/ProjectField.jsx` (the shared project
picker, used by widget ⚙ panels and Settings) · `src/components/SettingsPanel.jsx` (⚙ — your wiki, recents,
present-mode fullscreen) · `src/components/BoardNotice.jsx` (the borrowed/recover bar) · `deploy/server.js`
(relays) · `scripts/docs-facts.mjs` (docs↔code constitution).

Docs worth knowing: `docs/GUIDE.md` (user model: board params vs widget config vs
dataflow) and its sequel `docs/WIRING-BOARDS.md` (sources, consumers, channels, references — and what a value is) ·
`docs/BOARD-COMPOSITION.md` (complete wiring reference, LLM-parseable) ·
`docs/JSON-FORMAT.md` + `dashboard.schema.json` · `docs/DATA-SOURCES.md` ·
`docs/ARCHITECTURE.md` (incl. the third-party API-contract watchlist) ·
`docs/WIDGET-DEVELOPMENT.md` (how to add a type) · `docs/MEDIA-DATAFLOW.md`
(design direction: should graphics travel the wire?) · `docs/DEMO-IDEAS.md` ·
`docs/ROADMAP.md` · `docs/ISSUES.md` (canonical tracker). The long lists live in their
own files now — `docs/WIDGET-CATALOG.md` (every widget, what it shows, its API),
`docs/VERIFIED-WORKING.md` (the dated smoke-test record), `docs/BROWSER-TESTING.md`
(the browser suites + engine-install traps), `docs/EXPORT.md` (the export formats, and why PNG of an HTML
widget is not a server feature) · `docs/URL-STATE.md` (what the address bar may claim — the six rules, the
action-by-action inventory, and the audit that enforces them) and `docs/LIFELINE-WIDGET.md` (the timeline renderer, with the measured
Wikidata-vs-prose coverage) — so the README stays a front door.

**Doc convention: append-only applies to exactly two files.** `docs/DEPLOYMENTS.md` (the
deploy log) and `docs/WHY-WIKIBENTO.md` (the measured ledger, where a claim is added with
its receipt and never quietly revised). Every other document — including the README and
`docs/TUTORIAL-VIDEO-TOOLING.md` — is **edited in place**: cut, merge, rewrite, and delete
what has stopped being true. A record of what happened may only grow; a description of what
is must be allowed to shrink, or the README becomes a changelog and stops being a front door
(which is exactly what happened: it reached 639 lines, ~250 of them an appended test log).

## Hard-won gotchas (don't rediscover these)

- **A picture's box is unknown until the bitmap arrives, and everything below it pays.** 2026-10-09, measured with
  `scripts/mobile-reflow-probe.mjs` (WebKit, 390×844): the picture card grew **58 → 274px in one frame at 516ms** and
  pushed the consumer's on-screen top **402 → 618px** while the scroller never moved — the content moved under the reader,
  which is what "jumpy on a phone" actually is. Two things that look like fixes and are not: a stylesheet `aspect-ratio`
  (it applied — computed `3 / 2` — and the step still happened, +200px at 162ms, because the pre-measure placeholder has no
  definite width to resolve the ratio against), and moving the card. The fix belongs in the component (the `<img>`'s real
  `width`/`height`, which imageinfo already carries) plus an app-level "keep the reader's place". Numbers, options and the
  recommendation: `docs/research/MOBILE-RESIZE-STABILITY.md`.

- **A card that empties itself throws the reader to the top of the page on a phone.** 2026-10-09, from an iPhone: clicking
  a zone filled the consumer card, but the page jumped. Measured per animation frame in WebKit at 390×844 with the reader
  scrolled to the bottom — the card's content was gated on `!state.loading`, so the article was replaced by a **34px
  "Loading…" line**; the stacked mobile board is auto-height, so the document shrank to **exactly the viewport height**;
  a page that shrinks below the scroll offset is **clamped to 0** by the browser, 304px above the reader, and it stays
  there when the new content arrives. Neither `overflow-anchor: none` nor a CSS height floor changes it (both tried,
  both measured) — the card has to keep its size. And the drill taught a second lesson: the two halves of the fix (keep
  the previous content; hold the height) each prevent the collapse alone, so reverting either one still passes the gate;
  restore *both* to see it fail. When two fixes cover the same symptom, prove the gate with the behaviour, not with one
  edit.

- **A cached data file makes a working feature look broken, and no browser sweep will tell you.** 2026-10-09: a deploy
  moved the zones demo's consumer to the `zones` channel, but that file's URL had not changed and non-asset files were
  served `Cache-Control: public, max-age=3600` — so Andrew's browser kept the *previous* board for an hour and the card
  sat at "Waiting for a reference" whatever he clicked. Incognito proved the code was fine in one try. The sweep could not
  have caught it: Playwright starts with an empty cache, so it always fetched the new file and passed. Two lessons, both
  now mechanical — **only name-hashed files may be cached hard** (everything else revalidates), and the door checks
  assert the header, because a browser check is not evidence about a returning browser. Telling someone to hard-reload is
  a workaround; the policy is the fix.

37. **A helper that returns early silently drops the rest — and a read-modify-write in one expression truncates the file.**
   Two traps from the geometry work (2026-10-01), both invisible when reading the code back: `Array.prototype.some` stops at
   the first truthy result, so the feature-collection intake kept **one** feature out of an array of three (the shape a board
   or another widget hands you most often), and `open(path,'w').write(open(path).read())` truncates a 127 KB file to zero
   *before* the read happens — and then the bundle and the tests still pass, because an empty module is a valid module. The
   habits that catch both: assert the *count* of what you expect to be processed (the intake test counts features), and write
   with a tool that re-reads and verifies (`scripts/assert-edit.mjs`), never a bare find-and-replace.

36. **A field whose box is empty while the card shows data is a lie about the widget.** Two of the ways that
   happens are invisible in code review: `configFieldValue` not consulting the registry default (so a boolean
   defaulting to `true` renders CHECKED and shows UNCHECKED), and a value that comes from the BOARD (the
   Board Controls `spec` is the editor for the dashboard's `params` block, so reading back needs the board's
   context, not the widget's config). `tests/config-fields.test.mjs` now sweeps every registry field for the
   first, and asserts the reporter's own board for the second.
37. **Check that a build produced a NEW asset filename.** A JSX error meant `vite build` had been failing
   while the tests kept passing; `dist/` still held the previous bundle, so a deploy shipped old code and a
   whole round of measurements described something that was never served. `npx vite build` is quick — run it
   and compare the filename in `dist/assets/` before believing any measurement or writing it into HANDOFF.
35. **A `srcset` whose `sizes` arrives a frame later is worse than no `srcset`.** With width descriptors and
   no `sizes`, the browser assumes 100vw, fetches the largest candidate, then fetches AGAIN once `sizes`
   appears — measured as 72 requests for 36 tiles, i.e. both renditions of every image. Measure the container
   before the `<img>` mounts (a `ResizeObserver` runs before paint, so nothing is seen), and always ship
   `srcset` and `sizes` together. Related measurement trap: `encodedBodySize` counts cache hits, so use
   `transferSize` in a FRESH browser when comparing before/after — the first attempt reported a 100% saving
   that was entirely the disk cache.
34. **`width: 100%` + `aspect-ratio` on an image inside a grid row sized `auto` is a cyclic dependency.**
   The row asks the image its height, the height depends on a column width the row has not decided, and the
   browser falls back to the image's INTRINSIC size — nothing, for a lazy-loaded image — and never re-expands
   when it arrives. A gallery grid did this, and `overflow: hidden` on the tile turned every image into a
   thin band (ISSUE-107). Give the image a **definite** height and the rows `min-content`; do not reach for
   `min-height: 0` on the tile, which is what *permits* a row shorter than its content.
1. **`exturlusage` clamps `eulimit` to 500** for non-bot users (verified:
   `eulimit=5000` returns 500 + a warning). The fetcher paginates 10 pages =
   5,000, matching Special:LinkSearch. `eunamespace=0` gives article-space-only counts.
2. **Commons `prop=globalusage` entries have NO `ns` field**
   (keys: title/url/wiki only). The GLAM widget's article-space filter uses a
   URL-path namespace heuristic (`NON_ARTICLE_NS` in `dataSources.js`); localized
   namespace names (`Diskussion:`, `ノート:`) are conservatively counted as articles.
3. **PetScan ignores the `max` cap** in quick-intersection mode (`max=100` →
   all 239,084 files, 39 MB). Never call PetScan directly from the app for big
   categories — go through the `/api/petscan` relay, which is capped.
4. **Multi-title GETs have two independent limits.** Long filenames blow the URL
   (HTTP 414) → batch by *encoded length* (~4,500 chars). **But** the anonymous
   `titles` cap is **50** per query (`toomanyvalues`; lowlimit 50 / highlimit 500
   for bots) — length-only chunking silently breaks when short filenames pack 70+
   titles into one chunk (every query returns empty `query.pages`, with **no error
   surface**). Chunk by **min(count 50, length 4,500)**. This cost a real bug:
   the GLAM widget reported 0 used/0 views while glamtools returned 518 files ·
   38 used · 40 pages · 110,092 views.
5. **Commons Impact Metrics is allow-list only.** Unregistered categories 404 with
   "the category you asked for is not loaded yet" (the allow list is a published
   TSV of ~1,775 primary categories; additions go through a **Phabricator
   request**, project `Commons-Impact-Metrics-Requests`, by the 20th — **not** the
   `{{Views from category}}` template, which is the unrelated legacy
   category-page-views system) — and that 404 is *ambiguous*:
   a registered category with no data for the month returns the same body. Default
   months must resolve through `latestCimMonth()`, never `prevCimMonth()`.
6. **Playwright coordinate clicks miss after layout shifts** (images loading change
   widget heights). Click via JS (`element.click()`) or re-snapshot, not stale refs.
7. **Wikimedia API etiquette**: pace requests (≥1s), use `$WIKIMEDIA_USER_AGENT`,
   honor 429 `Retry-After`; batch 50 titles/call. See `docs/SCALABILITY.md`.
   From browsers, set **no custom fetch headers** — a `User-Agent` header triggers
   a preflight that RESTBase rejects (see the Firefox/Safari entry in
   `docs/BUG-REPORT-ios-safari-fetch.md`).
8. **top.hatnote.com has NO CORS headers** — the Toolforge deployment fetches it
   through `/api/proxy`; elsewhere the widget falls back to the CORS-enabled WMF
   Pageviews `top` endpoint. Data updates ~02:00 UTC; month/day in URLs are **not**
   zero-padded; there is no "latest" path — back off from today.
9. **w.wiki redirects are browser-unfollowable to wiki pages**: the 301 carries
   `Access-Control-Allow-Origin: *`, but the target page sends no CORS headers, so
   `fetch()` fails and `redirect:'manual'` exposes no `Location`. Expand
   server-side via `/api/resolve`.
10. **CSS: `overflow: hidden` on a flex item makes `min-height: auto` compute to 0** —
    a fixed-height flex column crushes such children to a sliver when content
    overflows. Fix: `flex-shrink: 0` on children and let the container scroll.
    (Same family: `.grid-item { overflow: hidden }` clipped config panels until
    ISSUE-54 made them scroll with a sticky action.)
11. **A stale `index.html` bites after deploys** — `rsync --delete` removes old
    bundles, so a cached `index.html` 404s. It is served `Cache-Control: no-cache`
    (assets stay immutable); hard-refresh (⌘⇧R) if a deploy looks missing.
12. **Commons `imageinfo` needs the `File:` prefix re-added after normalization**:
    strip it for display, but query titles must be `File:Title` — without the
    prefix every title resolves as a missing main-namespace page and the gallery
    silently shows "0 files · N not found".
13. **`formatversion=2` returns canonical titles WITH spaces** even when you query
    `Ada_Lovelace` — look up batched enrichment results by the *returned* title,
    not the underscore form (the Article List enrichment returned empty
    thumbs/extracts until this was fixed).

14. **Wikidata labels need `mul`, or Marie Curie renders as `Q7186`.** Names that are identical in every
    language live under Wikidata's language-neutral **`mul`** code, and those items have **no `en` label at
    all** (Q7186: 247 sitelinks, an English *description*, nothing under `en`). So
    `wbgetentities&props=labels&languages=en` *and* WDQS's `wikibase:label` with `"en"` both hand back the
    bare QID — silently, because a QID is a perfectly valid-looking cell. Request `<lang>|en|mul` (Action
    API) and `"en,mul"` (label service) and read `mul` last. `wbsearchentities` is exempt: it matches across
    languages (verified with `strictlanguage=1`). This was live in *every* entity-labelling widget until
    2026-09-14; `tests/wikidata-labels.test.mjs` now fails the build if a label lookup forgets.
15. **Rewriting a region of a file can silently delete a component.** A region rewrite of `WidgetFrame.jsx`
    took `BarCard` out while the SPARQL registry still pointed at it, so every bar-rendered query threw
    `ReferenceError` — swallowed by the widget error boundary as "Try Again", green test suite, three commits
    on `main` (never production, which predated the commit). `tests/renderer-registry.test.mjs` now asserts
    that every renderer named in the registry — and every card the dispatcher switches on — exists. Lesson:
    after replacing a block of a source file, grep for what *was* inside it. **It happened again, in the same commit**:
    the rewrite also took `TableCard`, and it stayed broken for two weeks (found 2026-09-30 by `npm run lint`, which had
    been printing `jsx-no-undef` on every run all along — a lint line nobody reads is not a gate). `TableCard` is reached
    *inside* `SparqlCard`, not by a registry `renderer:` name, so the registry assertion could not see it; the test now
    also asserts that every component the frame renders as JSX is defined, and that assertion was verified by deleting
    the component and watching it fail.
16. **Never truncate text in the data layer.** Timeline labels were clipped to 36 characters in the layout
    module *before* rendering, so "October 1944 · lived in Bergen-Belsen concentration camp" kept its
    ellipsis at **every** zoom level — and the check written to catch truncation measured *layout* overflow,
    which reported zero, because the shortened string fitted. Clip in CSS (where zoom can widen it) and keep
    the full string for the tooltip.

17. **For Internet Archive books, the manifest is the truth and the leaf numbering will bite you.** The
    item metadata disagreed with the manifest (20 vs **16 canvases**) and nothing looked broken;
    `…/iiif/{id}$0/full/…` is an **HTTP 500** (that route is 1-based while canvas ids are 0-based); an
    **out-of-range leaf is not an error** — `$20` on a 16-page book returns HTTP 200 with a ~1.4 KB
    **blank filler image**, so probing for a 404 never fails; and `download/{id}/page/n{N}.jpg` is 0-based
    and 404s on the last leaf, disagreeing with the IIIF route. Read the manifest, use each canvas's own
    image-service id, and never build `$N` URLs. (Each book's IIIF **Content Search** is also the only
    search-inside route a browser can reach — the standalone FTS host does not resolve.)

18. **Playwright: `waitForFunction(fn, arg, options)`** — the second parameter is the ARGUMENT, so
    `waitForFunction(fn, { timeout: 90000 })` silently passes an object to your predicate and leaves the
    default 30 s timeout. Passing `undefined` for the arg (or a long timeout may never apply) costs a
    confusing "Timeout 30000ms exceeded" on a wait you believe you raised. Same family: `locator.click({
    force: true })` skips the scroll-into-view, so a click on an element **below the fold** dispatches at
    coordinates nothing occupies and does nothing — drive it through the DOM instead
    (`el.click()` inside `page.evaluate`) when the test is about behaviour rather than clickability.

19. **A Commons document page render exists only at certain widths, and an invented one is an HTTP 400 that
    browsers hide.** Measured identically on a PDF and a DjVu: **120 · 250 · 330 · 500 · 960 · 1280** are
    served; **70, 150, 200, 320, 400, 640, 700, 800, 1024, 1200 return an HTML error page**, which Chrome
    then refuses to give to an `<img>` at all — `net::ERR_BLOCKED_BY_ORB`, a blank page with no visible
    reason. It is not MediaWiki's image-thumb set (150/200/400/640/800/1024 are standard image widths and all
    fail here). `iiurlwidth` is the safe route because the API **rewrites** to a legal width (320 → 330,
    700 → 960), which is why the source advertises `caps.widths` and the reader's ladder is built from that
    list. Related: document renders top out at 960, and a document strip needs 120, not the IA reader's 70.

20. **A Wikisource transcription is not a proofread text — carry the grade with the words.** When a Commons
    document has a `Page:` transcription, one `prop=proofread|revisions` call returns the text *and* its
    quality (`{"quality": 1, "quality_text": "Not proofread"}`). Measured: the 1926 Britannica Supplement's
    1,208 pages are all **level 1** — bulk-imported OCR, never human-checked. Print the grade above the text
    (`uncorrected OCR` at level 1) or the panel invites someone to quote OCR as the edition. Two measured
    cases: a 1,208-page bulk-OCR reference set (level 1) and a 38-page validated pamphlet (level 4) — **use
    the small one as a fixture** and keep the big one for measurements. Also: a
    transcription is detected by a `Page:`/`Index:` usage on a Wikisource (`globalusage`, ns 104/106) — being
    *linked* from a Wikisource article is not one — and `prop=proofread` on an `Index:` page returns nothing,
    so grades only come per page.

21. **react-grid-layout reports *lifecycle* events that look exactly like user actions.** Two traps, each of
which silently changed behaviour until an audit caught it, and both the same root cause: at mount RGL **fills
gaps in an authored layout** and reports `onLayoutChange`, and RGL 2.2 also fires a drag/resize **stop**
handler once while placing the board. So "the layout changed" and "the user dragged something" can both be
true on a board nobody has touched. What that cost: the URL's board claim was dropped on arrival (ISSUE-87),
and a borrowed board *adopted itself* before the visitor edited anything (ISSUE-88). The rules that now hold:
a mount-time placement is never an edit; the discriminator for a real gesture is `onDragStart` /
`onResizeStart` (a *start* cannot happen without a pointer); and arrangement is excluded from the board
fingerprint entirely. Generalisation worth keeping: **when a library reports an event, ask whether it can fire
without a user** — driving the real app is what found both.

22. **Read what you must protect at boot, not in the path that applies a board.** A `useRef` does not
survive a navigation, and on a `?config=` load the "load the saved board" branch never runs — so the first
attempt at ISSUE-88 adopted a borrowed board while holding `null` as "the board being displaced", and the
visitor's board was written over with nothing stashed. Whose board is saved is now read *first and
unconditionally* at the top of boot. Same shape as the state-ordering rules elsewhere in this file: **the
thing that must not be lost has to be captured before the thing that might lose it.**

23. **A `CompressionStream` deadlocks if you close the writer before reading the readable.** It backpressures:
if nobody consumes `readable`, the queue fills and `await writer.close()` never resolves — no error, no
warning, a promise that simply never settles. Measured while building the compressed share link (ISSUE-89):
1.6 KB of gzip hung, a 15-byte test string did not, and **Node does not reproduce it**, so the unit tests
passed while the app quietly fell back to the uncompressed link and rendered no QR. The shape that works —
read first, write and close concurrently, await both:
`const consumed = new Response(cs.readable).arrayBuffer(); const writer = cs.writable.getWriter(); await Promise.all([writeAndClose(), consumed])`.
Two habits from the hunt, both worth keeping: when a promise never settles, **probe each step** (an array on
`globalThis` beats console logging here, because a rejected effect promise is swallowed by its own `.catch`);
and a stream pipeline that works in Node is not evidence about a browser.

24. **A template's *wrapper* and its *content* are different pages, and only one of them renders off the Main
    Page.** Measured: `{{Picture of the day}}` and `{{On this day}}` return an `imbox`/`tmbox` maintenance notice
    ("This image was selected as picture of the day…") when parsed anywhere else — while the dated subpages
    `{{POTD/2026-09-16}}` and `{{Wikipedia:Selected anniversaries/September 16}}` return the real boxes. Related,
    and the reason to reach for `action=parse&text=` rather than `page=`: parsing a *transclusion* skips
    `<noinclude>`, so a template's documentation box and categories stay out of the result. Both were found by
    driving the widget and *looking* at the card — the HTML was valid and the notice was invisible to every unit
    test. Generalisation: when a wiki page renders "something", check whether it renders the same thing in your
    context.

25. **`{{CURRENTYEAR}}` works on the wiki and breaks a board.** MediaWiki magic words do expand inside a parsed
    transclusion (verified), which is exactly what a self-updating dated box needs — but in a Wikibento *board*
    `{{name}}` already means a param reference, so a config containing them fails the demos constitution (measured:
    "every {{widget:id}} and {{param}} resolves inside the board"). The widget therefore expands its own
    single-brace tokens — `{date}`, `{monthname}`, `{day}`, `{month}`, `{year}` — so `POTD/{date}` is both
    self-updating and board-legal. Lexical collisions between a host platform's syntax and ours are worth checking
    before building on the host's version.

26. **One edit per script, assert, then grep — because a later failure silently discards earlier ones.** A
    multi-edit script that asserts on its second edit writes *nothing*, so the first edit is lost while the run
    still prints the first `✔`. This cost three separate debugging rounds in one session (a loader whose import
    vanished, an output handler that stayed on the old signature, a picker that fell back to 7 options) and every
    time the symptom looked like a *logic* bug rather than a lost write. The habit that prevents it: one edit,
    `assert old in s`, write, then **grep the file for the new text** before moving on — and when a runtime
    behaviour surprises you, print `repr()` of the region first, because indentation guessed from a `sed` dump is
    wrong about half the time (that one recurred all day, on Python, JSX, CSS and Markdown alike).

27. **`{{param}}` in JSX *children* is an object literal containing an undefined identifier.** Every card that
    wants to *show* a placeholder must write `<code>{'{{param}}'}</code>`, not `<code>{{param}}</code>` — the
    braces are an expression, so `{{param}}` compiles to `{ {param} }` and throws `ReferenceError: param is not
    defined`, which the error boundary renders as "widget crashed". It stayed hidden for months because the
    branch that contained it (the 🔊 Speaker's *no text yet* message) only renders when the widget has **no**
    text — and no shipped board had a text-less speaker until a wired one arrived (source set, text field
    empty), which is now the normal way to use it. Worth knowing: the crash text names the *transformed* line
    number, so a stack trace pointing past the end of the file is this, not a stale bundle.

28. **Transform the module after editing it — a duplicate import is a blank page, not an error message.** `import
    ProjectField` written twice in `WidgetFrame.jsx` (once with `FALLBACK_PROJECTS`, which I did not notice) does
    not fail loudly: the dev server answers **500 for the whole module**, the app never boots, the page is empty,
    and the symptom looks exactly like a bad board config. Ten minutes went into checking JSON that was fine. The
    one-second check, which belongs in the loop after every module edit: `npx esbuild --bundle <file> --loader:.jsx=jsx --outfile=/dev/null` (or just `npm test`, which bundles everything). Related and worth knowing: a stack trace naming a line past the end of the file is the *transformed* file — see gotcha 27.

29. **A body that stretches is a body that collapses when the height is `auto`.** `.widget-body` is `flex: 1;
    min-height: 0` so a fixed-height grid cell gives a card a scrolling body — but the phone stack sets
    `.grid-item { height: auto }`, where `flex: 1` has no line to grow into, so the body rendered at **0px** and
    every stacked card showed only its 58px header. Reproduce it in one line of Playwright (an iPhone 14 context)
    and check `.widget-body`'s `scrollHeight`, not its text: the data was all there, invisible. Fixed with
    `.mobile-stack .widget-body { flex: 0 0 auto; min-height: auto }` — and by making the demo sweep assert it.

33. **A print check that does not wait is a check that lies.** The sweep's print pass armed the sheet and measured
    300ms later: on the Met board the images had not arrived, every card was short, nothing collided — "0 overlaps"
    — while the real PDF had four cards printed over each other. `window.print()` snapshots a *settled* board, so a
    check for it has to measure a settled one: wait for every image to decode and for no card to be loading, then
    measure. The same lesson in the other direction is what makes the export work at all now: the app holds the sheet
    (`preparePrint`) until the board has settled, instead of printing whatever happened to be on screen.

32b. **…and the same mistake one level down: a card sized by its content instead of its cell.** Making Document-mode
    cards full width reflowed their insides (a chart at four times its width, an image overflowing its card); the fix
    was to give each card its grid proportion — and the first attempt at *that* left the width to the flex item's
    content, which measured 19% of the page for one card and 100% for another. Two levels, one lesson: a card's
    width comes from the grid, never from what is inside it.

32. **Two cards can be in the same *row* and still not be in the same *cell*.** Grouping a board's cards into
    "shelves" by overlapping vertical spans is a plausible way to paginate it, and it is wrong the moment a layout is
    a staggered mosaic: on the Met demo a tall card's column is re-used by the card below it, so the shelf held five
    cards, two pairs shared a column, and page two printed four cards on top of each other. What works is the grid
    the board is *already drawn on* — column, span, row and row-span straight from the layout — because CSS grid
    cannot overlap two items. The general form: when reproducing an arrangement, copy the coordinates you are given
    rather than inferring a structure from them.

31. **A safety timeout that fires mid-operation is worse than no timeout.** The print sheet disarmed itself three
    seconds after arming, because `afterprint` is unreliable (Safari, a cancelled dialogue) — and three seconds is
    not enough for a real print job. Generating the Anne Frank board's PDF took longer, the timer cleared the layout
    slots mid-print, and the PDF came out with the disarmed layout: the bug the sheet exists to fix, now intermittent
    and much harder to see. The disarm is now driven by `afterprint` **plus a `beforeprint` that re-arms**, so a
    stale armed state is harmless and no timer is needed. When you reach for "clean up eventually", ask what happens
    if the cleanup wins the race — and prefer an operation that re-establishes the state over one that expires it.

30. **A component can exist, be named by the registry, and never render.** `PanoramaCard` was defined in
    `WidgetFrame.jsx`, named by the `panorama360` widget, and had **no `case` in the content dispatcher** — so every
    360° card fell through to `default: StatCard` and showed an empty "—" for as long as the widget shipped. The gate
    that should have caught it asserted that a renderer *exists* (it did), not that it is *reachable*; there are two
    assertions now, and the second one is the one that decides what a user sees. The general lesson is worth
    keeping: **existence is not reachability**, in code, in docs, and in tests.

## Open issues & known bugs

Tracked design work is `docs/ISSUES.md`; the plan is `docs/ROADMAP.md`. What is
actually broken or unfinished today:

- **ISSUE-115** — production logs a *report-only* Content-Security-Policy violation for the Wayback iframe, plus embed
  warnings from the Wikipedia pages inside the wiki-page box (touch icons, a stylesheet, a blocked autofocus). Nothing is
  blocked and the cards render — filed because the console looks alarming, and both browser checks now treat it as a note.
- **ISSUE-116** — `/api/petscan` answered **502** twice while verifying a deploy. The proxy and PetScan both answer when
- **ISSUE-120** — a shared board's *"Viewing a shared board"* notice with its two buttons appears in `?kiosk=1`, a mode
  whose promise is that editing affordances are gone (Esc already exits kiosk). A design question, filed with options.
- **ISSUE-125** — one genuine JavaScript error in WebKit, found by the demos sweep and left fatal there:
  `Argument 1 ('blob') to FileReader.readAsBinaryString must be an instance of Blob`. Most likely the CORS-image PNG
- **ISSUE-132** — the **map backlog**: **points, paths and polygons are done** (2026-09-30/10-01: the points list with
  framing, the SPARQL map renderer, and geometry as **GeoJSON** — `docs/GEOMETRY.md` settles the format, the intake rules and
  the time names). What remains, in `docs/WIDGET-IDEAS.md` → *"Map widget — what Tier 1 left to do"*: **icon shapes, sizes
  and labels** (drawing them is easy; **collision** is the real problem), the **itinerary** animation stepped with ▶ ◀ over a
  board param, a **time filter / replay** on the card (the data already carries `datetime`/`times`), and **interactivity**
  (pan/zoom/layers — Tier 2, Leaflet, a separate widget type by design). Multilingual labels already work via `?lang=`, and
  the static-layer question is answered by a style picker in the ⚙ panel.
  export or a document reader handing a cross-origin value to a `FileReader`; a hypothesis for the next session.
  asked directly, so it is intermittent and most likely an upstream timeout; recorded rather than guessed at.

- ~~**Reset doesn't stick on a URL-loaded board.**~~ **Fixed 2026-09-15** — and it was the visible
  half of a bigger problem: the URL was a claim nothing kept honest. Reset now drops the claim, an edit
  drops it too, and Share builds its link from the board instead of from the address bar. The contract,
  the full action-by-action inventory and the audit live in `docs/URL-STATE.md`; `npm run smoke:url`
  fails if any of it regresses.
- ~~**A shared link overwrites the visitor's own saved board.**~~ **Fixed 2026-09-16 (ISSUE-88)** — the same
  family as the Reset bug: the app treated a URL as state to adopt rather than a document to show. A URL board
  is now *borrowed*: shown, never written, until the visitor edits; the board an adoption displaces stays
  recoverable for a day, and a notice offers [Save this as mine] / [Back to my board]. One signal does both
  jobs — the fingerprint divergence that drops the URL's claim is the moment of adoption.
- ~~**Three demo boards' *authored* layouts overlap themselves.**~~ **Fixed 2026-10-02.** Measured on 2026-09-18 at
  7/2/1 overlapping pairs, and found at 9/2/1 on 2026-10-02 — i.e. it had *grown*, because a new tile was added into a
  collision and nothing checked. `scripts/repack-layout.mjs` (`npm run repack:layouts`) reimplements
  react-grid-layout's own vertical compaction and stores the result, so the file stops contradicting the renderer; a
  no-overlap assertion in `tests/demos.test.mjs` now holds every board in `public/` to it. It moves **`y` values
  only** — 26 of them across the three boards, no reformatting, no reordering, characters preserved — and the
  claim that it changes nothing on screen was **measured, not assumed**: all 58 cards across the three boards render at
  identical geometry (translate + size) before and after. `npm run check:layouts` reports overlaps without writing.
- **Don't diagnose an artifact diff without pinning the commit.** A rebuild of the
  working tree did not match the deployed bundle, which invited a "toolchain drift"
  explanation — but `HEAD` had moved past the **deployed commit**, and the 🔳 QR
  widget (PR #47) had never been deployed. Rebuilding the deployed commit with the
  same toolchain reproduced the live bundle byte-for-byte, so nothing had drifted.
  Before comparing an artifact to a rebuild, pin the commit
  (`git log --oneline <deployed-commit>..origin/main` shows what is merged but not
  live) — the worked numbers live in `docs/DEPLOYMENTS.md`.
- **PNG of an arbitrary widget is a decision, not an oversight.** Client-side PNG works where a widget draws
  itself as SVG, **or** where its images come from a CORS-enabled host (`iiif.archive.org`,
  `upload.wikimedia.org`, `thumb.wikimedia.org` — measured to send ACAO), which is how a book or document page
  exports as a real PNG. It cannot work for an *arbitrary* HTML/CSS card: Chromium taints a canvas for any SVG containing a `foreignObject` (measured — even
  one holding just `<p>hello</p>`), so an HTML/CSS card can produce a valid .svg but never a .png in the
  page. A server-side render service was considered and **rejected** on 2026-09-14 (four costs: re-fetching
  the whole board per image from a shared Toolforge IP, a browser in a 1 Gi pod parsing untrusted content, a
  permanent patching liability, and it would be a *re-render* rather than a capture of the user's view). The
  reasoning, the alternatives and the trigger for revisiting are in [docs/ISSUES.md](docs/ISSUES.md)
  ISSUE-79 and [docs/EXPORT.md](docs/EXPORT.md).
- **AddWidgetPanel** has no Escape-to-close and no focus trap (SharePanel has
  Escape-to-close).
- **Wikistats CSV parser is naive** (no quoted-field handling) — fetching is cached
  and retried, but the parse still assumes no commas in fields.
- **`handleLayoutChange` persists to `localStorage` on every drag tick** (only *during* a real gesture now — a
  mount-time auto-placement no longer persists, see gotcha 21) — fine at the current payload size, wasteful as
  boards grow.
- **The legacy Wikistats CSV is flaky, and the ranking depends on it.** `wikistats.wmcloud.org/api.php?action=dump&table=wikipedias&format=csv`
  answered 500-with-an-empty-body for a stretch on 2026-09-18 and then recovered. The single-edition Wiki Stats card
  no longer uses it (siteinfo), but `topWikipedias` needs a list of every edition and **no replacement exists** — the
  site matrix carries no article counts. A persistent failure shows an error rather than an empty ranking, and
  finding a better source for "largest Wikipedias" is an open question rather than a task.
- **The Ask path can name a wiki that does not exist.** The project picker constrains the UI (ISSUE-93), but the
  Ask path reads the *manifest* and passes an unfamiliar project through: 364 wikis cannot be enumerated in a
  validator, so the widget's own error state is the guard. Aliases and shapes are normalised (`Commons` →
  `commons.wikimedia`, `German` → `de.wikipedia`); an invented wiki reaches the fetcher and reports itself.
- **A mixed-project Article List is fetched with its first line's project.** `resolveRefLines` parses a reference per
  line, but the fetcher takes one project per call, so lines naming different wikis need per-item fetching — a
  feature, not a fix (ISSUE-92's known limit).
- **Settings has no home for anything else yet, on purpose.** The panel holds three preferences (your wiki, the
  recents, present-mode fullscreen). The bar for a fourth: a preference *of the person* with no better home.
- ~~**Two pre-existing dev-only React warnings**~~ **Fixed 2026-09-18** — both, while making the demo sweep's
  console signal usable: ✨ Ask is now a *sibling* of + Add Widget (it was nested inside it — invalid HTML that made
  browsers auto-split the tags) and the media player puts React's `key` on `<audio>`/`<video>` instead of spreading it
  out of `mediaProps`. Each was a one-console-error-per-load tax on every sweep row, which is why they finally got
  done: a check nobody can read is a check nobody runs.

## The Ask door and MCP — the plan, all six rows done (agreed 2026-10-01, built and deployed 2026-10-02)

**Where this stands: the whole plan is done and deployed** — the guide, the doctor, the regression net, the served
validator and the MCP endpoint (`/mcp`, four read-only tools), all on 2026-10-02. Nothing in this section is a task list
any more; it is the record of what the audit found and how each finding was answered, kept because the *how* is the part
that gets re-derived. **The one thing outstanding is not work: it is a reader connecting a real model and writing a
board**, which is the test every measurement above was a proxy for. The background:

The background is the **Phase 2 audit of the Ask advisor**: [`docs/ASK-ARCHITECTURE.md`](docs/ASK-ARCHITECTURE.md) (rewritten 2026-10-01 — machinery map, a status table for the old F1–F4 findings and plan items 1–8, measured baselines, the failure taxonomy, the ranked fixes), the raw runs in `bench/results/2026-10-01-*.json`, and [INTENT-BENCHMARK](docs/INTENT-BENCHMARK.md). What matters for planning:

- **The prompt's budget is measured, not guessed:** API `usage.prompt_tokens` = suggest **11,386**, board **11,493**, catalog alone **9,976** — **4.13 chars/token**, where the docs' 3.5 heuristic had us believing we sat at the 12–14K ceiling. `tests/ask-validation.test.mjs` now asserts both prompts stay inside **12,600** tokens and names the block that grew, so the guide below can be added safely.
- **The catalog alone is not a door.** Given the manifest and nothing else the model picks the right widget **93%** of the time and gets **78%** of chains — but **0%** of replies fit the output schema (48/48 misses): it invents its own envelope. A door must serve **the shape** and a **validator**, not just the catalog.
- **Boards already pass the machinery:** `validateAssembly` **18/18**, the app's own `validateDashboard` **18/18** with no warnings, **6/6 render** in the built app. The *chains* wobble (assembly 67%, suggest 77%).
- **Ranked fixes 1–4 are done** (2026-10-01; the record with the evidence is in `docs/VERIFIED-WORKING.md`): channel-qualified references, a chain few-shot, `wiki`→`project`, the token constitution. **5–8 remain** (see the order below).

**MCP, as it was established before building** (verified against the spec and both vendors' docs — do not
re-research; the built endpoint is `docs/MCP.md`): a server is a **JSON-RPC endpoint** (`initialize`, `tools/list`, `tools/call`) over stdio or **Streamable HTTP** (one HTTPS path taking POST/GET/DELETE, replying `application/json` or SSE; sessions optional; `Origin` validation required; auth optional). **No LLM and no API key on our side** — the model runs in the client. **Claude:** Customize → Connectors → *Add custom connector* → URL, works on **free** (one connector), Pro, Max, Team, Enterprise; authless is supported; SSE is being deprecated, so use Streamable HTTP. **ChatGPT:** developer mode → create an app for your remote MCP server; **Pro** connects read/fetch-scoped servers (write actions need Business/Enterprise/Edu); SSE + Streamable HTTP, auth optional. Both connect **from their own cloud**, so the server must be publicly reachable — Toolforge is. A **stateless** endpoint (JSON responses, no sessions, no SSE) dodges the one unknown that cannot be checked from here (whether Toolforge's ingress buffers SSE). Put it in the **same zero-dep process as the relay**, sharing the manifest cache and the relay guard (rate limit, byte cap, deadline, in-flight ceiling).

**The order Andrew agreed to (2026-10-01):**

| # | work | cost | why this order |
|---|---|---|---|
| 1 | ✅ **DONE 2026-10-02 — #6, the CIM gate.** An **CIM GATE** line in `askManual()` (both modes; the gated types derived from the manifest's `dataSource`), a qualified intent rule, and a `hint` on `CIM_CATEGORY_FIELD` — one sentence, three readers (the ⚙ panel, the prompt's catalog, the manual). Two silent traps fixed underneath: `scripts/generate-manifest.mjs` kept only `{key, type}` from a shared config-field constant, and its `prop()` ignores a property that follows a comment line. `tests/ask-validation.test.mjs` asserts the hint arrives. | 15 min | removes a guaranteed dead card |
| 2 | ✅ **DONE and DEPLOYED 2026-10-02 — Slice 1, the door's prerequisites.** The **404** (a body that names nothing; `/api/*` answers 404 JSON), **CORS** on `/manifest.json` + `/board-guide.md` + `/dashboard.schema.json` (deliberately not on `index.html`), and **`public/board-guide.md`** — the assembled contract (envelope with a coherent example, the catalog with channels and `showIf`, the gates, the chains, both specs verbatim), now also opening with §0 *what WikiBento is* and absolute pointers. Built by `npm run guide:board`; gated by docs-facts (its own `--check`) and by the demos suite (its example must import with zero warnings). | ½ day | two real bugs, plus the artifact the audit proved load-bearing |
| 3 | ✅ **DONE 2026-10-02 — #7, the board path's regression net.** Two halves. **Offline**: `tests/assembly-fixtures.mjs` (18 frozen model replies, three of them not JSON at all) + `tests/assembly-contract.test.mjs` — no throw, no half-board from bad JSON, every reference resolvable in the surviving board, and the app can load it. **Browser**: `npm run smoke:boards` (in `npm test`) — our boards via `?config=` *and* pasted through ⬆ Import, plus the model boards the same way; one card per widget, no card left waiting for a value. Both verified by restoring the defect they exist for. | ½ day | the Import-`params` defect survived *because no check ever drove Import with a params board* |
| 4 | ✅ **DONE 2026-10-02 — Slice 2, part 1 — the shared validator + `npm run check:board`.** `src/lib/boardDoctor.js`: one verdict from the app's own machinery (`validateDashboard`, `findUnresolvedRefs`, the registry's `outputs`/`primary`), reporting the severity model in three lists plus the gates. Found **ISSUE-134** (a mistyped value refused where the docs promised coercion) — settled the same day in favour of the documentation. | ½ day | the checker had to exist before a service could serve it |
| 5 | ✅ **DONE and DEPLOYED 2026-10-02 — Slice 2 — the validator as a service.** **`/api/validate`** (GET `?board=`/`?d=`/`?z=`, POST, OPTIONS) runs `src/lib/boardDoctor.js` via `deploy/validator-bundle.mjs` (`npm run build:validator`; the app's hash codecs are reused, so a board shared from the app decodes here as it does on load). 200 with the verdict in the body even when it is `unusable`; 400 with a hint when there is no board, 413 past 256 KB, 429 per client (30/min), `ACAO: *` because the callers are other origins by design. Asserted in `scripts/relay-guard-e2e.mjs` (7 checks). Also in this deploy: **ISSUE-134** resolved — a value the registry can read is repaired and reported, the clamp is enforced for real, and `refreshSeconds` is raised to its floor instead of refusing the board. | 1 day | **an outside model can check its own board** — the door stops being one-shot |
| 6 | ✅ **DONE 2026-10-02 — Slice 3: the MCP endpoint.** `/mcp` speaks JSON-RPC 2.0 over Streamable HTTP, **stateless** (one POST in, one JSON out — no session, no SSE, which is also what makes it safe here: whether Toolforge's ingress buffers a long-lived stream is not answerable from this repo) and **authless** (Andrew's call — the four tools read public data, so a token protects nothing; the bounds are the relay's, and `Origin` is validated as the spec requires). The four tools: `get_catalog`, `get_board_guide` (§0–§6 or all), `validate_board` (the app's validator, bundled) and `make_board_url` (the app's own `#/d/`/`#/z/` codecs, refusing a board that cannot import, and reporting the 1,500-char QR ceiling). `instructions` is 499 characters — under the 512 ChatGPT reads. Verified by `npm run smoke:mcp` (16 assertions, in `npm test`) and connected the same way a reader would. **Original plan:** The four read-only tools an outside agent actually wants — `get_catalog` (the manifest), `get_board_guide` (`/board-guide.md`), `validate_board` (the endpoint above, as a tool) and `make_board_url` (the board → a `#/d/` or `#/z/` link; the encoder half of the validator bundle already builds exactly what the Share panel would — and the QR stops at 1,500 chars, so a link that big needs the URL, not a code) — as **stateless JSON-RPC over Streamable HTTP** in this same process, **authless** (Andrew, 2026-10-02) and reusing the relay's abuse controls. An `instructions` field carries the first 512 characters self-contained (what ChatGPT reads), and `scripts/mcp-e2e.mjs` speaks JSON-RPC locally. Then connect it in Claude (free tier is enough for one connector) and ChatGPT (Pro, read scope) and measure a real board-writing conversation. | 1–2 days | the door stops being one-shot for **tools** as well as chats |

**Decisions — all made 2026-10-02, none outstanding:**

1. **`category-sample-photos` (#5): leave it as it is.** Its 1/15 in the intent baseline is an accepted, known difference
   rather than an open item — the owner looked at both answers and kept the current one. Revisit only if the fixture is
   recalibrated as a whole (`docs/ASK-ARCHITECTURE.md`).
2. **The MCP endpoint is authless** — three read-only tools over public data, both vendors support it, and a token
   protects nothing. **With Andrew's constraint: it must be protected from abuse and denial-of-service** — which is the
   machinery the relay already has and the endpoint will reuse: per-client and per-route rate limits, a request byte cap,
   a deadline, an in-flight ceiling, bounded caches, and no upstream on the read path that a caller controls.
   `scripts/relay-guard-e2e.mjs` is where those properties are asserted for the existing routes, and the MCP endpoint's
   own assertions belong in the same file.
3. **A mistyped config value is repaired, not refused (ISSUE-134)** — the code was brought into line with
   `docs/JSON-FORMAT.md` and AGENTS.md rather than the reverse: the validator reports the severity model in three lists,
   and the clamp it had always promised is now applied for real. Recorded in `docs/ISSUES.md` with what changed.

**Not ours:** **#8, the prefix-caching question.** The LiftWing API returns `prompt_tokens_details: null`, so whether a stable ~11.5K-token prefix is cached cannot be verified from here: ask the maintainers on Phabricator, or measure p95 latency on a stable prefix at volume. Until then, do not assume the long prompt is free.

**Reproducing any of it:** [`docs/ASK-ARCHITECTURE.md`](docs/ASK-ARCHITECTURE.md) → *How to re-measure* (the shipped benches, plus a description of the three probes, which were deleted on purpose so they are re-created rather than trusted). One-liner for the board suite: `WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --boards --variants baseline --via toolforge --out X.json`.

## Next steps

Roadmap detail in `docs/ROADMAP.md`; the design ideas below are specced there.

1. **The Ask door is finished** — the plan section above records all six rows, done and deployed on 2026-10-02 (the
   guide, the board doctor, the regression net, the served validator, the MCP tool surface), and the three decisions it
   raised are made. **What is left is not work on our side: it is a reader connecting a real model and writing a board**
   (`docs/MCP.md` has the connection steps) — and then whatever that turns up. Nothing below this line is urgent; the
   list remains valid, in rough priority order:

   - **ISSUE-148 — the picture's placeholder→bitmap step moves everything below it** (measured 2026-10-09; the memo is
     [`docs/research/MOBILE-RESIZE-STABILITY.md`](docs/research/MOBILE-RESIZE-STABILITY.md), the probe is
     `node scripts/mobile-reflow-probe.mjs`). On WebKit at 390×844 the picture card grew **58 → 274px in one frame at
     516ms** and pushed the consumer's on-screen top **402 → 618px** while the scroller never moved (17 → 17): the page did
     not scroll, the content moved under the reader. Clicking is *already* stable (the consumer held its on-screen top while
     growing 117 → 528px), and image-first works because the growing card is then above nothing the reader has read.
     **Recommended: (A)** render the `<img>` with its real `width`/`height` attributes (imageinfo carries them) and give the
     pre-measure placeholder the same ratio — the stylesheet route was measured and does **not** work (`aspect-ratio: 3/2
     !important` applied, and the step still happened, +200px at 162ms, because the placeholder has no definite width to
     resolve against) — and **(B)** an app-level *keep the reader's place*: before a value-driven reflow, record the card at
     the viewport top plus the offset within it and restore it after. B is the general guarantee that ISSUE-144's height
     floor is one case of; `overflow-anchor: none` on changing cards goes alongside, and the authoring rule (the changing
     card belongs below the card you interact with) is worth writing into the spawn menu's placement.

   - ~~**Two small map gaps**~~ **Done 2026-09-30** — the frame consults `labelFromData(data)` when a widget declares it
     (`src/lib/widgetTitle.js`), so the Map's header reads "Berlin"; a failing relay prints its own reason with a Try again;
     and `npm run smoke:map` asserts both in a browser. **Also done: the off-centre landmark test** — `mercatorPixel` is
     verified against four real rendered maps by `npm run check:map-landmarks`, so the overlay spine is ready to build on.
     **The renderer landed the same day, and geometry followed (2026-10-01)** — the Map widget draws a **list of points**
     (framed by `fitPlaces`), the SPARQL widget draws a **result's coordinates** as a map, and both now speak **GeoJSON**:
     paths and areas from the list, pasted geometry, and another map's shape over the wire. **The next map work, in this
     order:** custom **icon shapes, sizes and labels** (drawing them is easy; collision is the real problem), the
     **itinerary stepper** over a board param, a **time filter and replay** on the card (the data already carries
     `datetime`/`times`), and Tier 2 (Leaflet) only when pan and zoom are actually wanted — the static card prints and exports.
   - **ISSUE-125 — the WebKit `FileReader` error is the one thing the sweep still fails on from our own code** (see the
     open-issues list). Everything else it reports is upstream weather: archive.org's CORS, the Action API's 429s and
     WDQS throttling put the `wayback` / `assessments` / `depicts` widgets into an error STATE, and the counts move
     between runs. Fix the policy, not the symptoms: the sweep now treats a report-only CSP note and a cross-origin
     refusal as notes, on pageerrors as well as console lines.
   - **The story's footer count needs re-aiming** (small): it reports how many captions the *join* filled, and since
     ISSUE-121 the wikitext path supplies them first, so it reads 0. Either count what was rendered instead, or drop it.
   - **Video, v2 — click to play inline.** v1 (shipped) draws a poster and links to the Commons file page; the app
     already has the pieces for playing in place (`videoinfo` derivatives: 240p/480p/1080p vp9 webm, used by the Media
     Player card). Audio stays out of the gallery by decision.
   - **Story mode could take video panels** — deliberately left images-only in ISSUE-124 so its verified counts (93
     panels, 91 captioned, 7 chapters) stayed pinned. A poster panel with a ▶ is the natural follow-up.
   - **A `template` kind, if you want to pick template names** — the Box's other input. Held back because templates are
     usually transcluded rather than linked, so there is little in content to click.
   - **Clickable zones on an image — slice A is live (2026-10-09); B–E remain** (ISSUE-138,
     [`docs/ZONES.md`](docs/ZONES.md); the wireframes are `docs/zone-*.png`). **What shipped:** the Gallery's single-image
     mode takes a **`zones` text field** (`x,y,w,h | label | kind | value | action`, percentages of the picture; `at pitch,yaw`
     for a sphere), draws each zone as a **≥30px target centred on the file's own box** (the true outline stays exactly where
     the file drew it), resolves a click **by geometry** (inside a box, else the nearest centre — two of the demo's peaks sit
     28px apart), and publishes on the card's own **`zones`** channel, beside the `selection` channel the picture's own click
     uses for the file it shows (the first live demo proved that collision: clicking the photograph fed a *file* to an
     *article* consumer). Unreadable lines are reported on the card, never clamped or dropped; a `hotspotStyle` switch and a
     `zones` output channel came with it. A zone list is **structured text** in a textarea, following the map's
     `points`/`geojson` precedent, so no new field type was needed at all. Two demos: `?config=/zone-demo.json` (a photograph
     whose six zones are the file's **own Commons `{{ImageNote}}` boxes**) and `?config=/biosphere-demo.json` (13 labels read
     out of a diagram by **Apple Vision OCR**, `hotspotStyle: subtle` so there is no ring to clutter the text).
     **What remains, in the order designed:** **B** the editor — a draggable overlay plus three crop fits (letterbox · fill
     crop · **`smart`**, which keeps every zone visible and falls back to letterbox rather than hide one) · **C** the
     Commons-notes import **and its target suggestions**: one API call brings a file's boxes in with their labels, and the
     labels are *proposed* as targets — measured on a real file, the head form alone hit 8 of 11 names **with three of them
     the wrong thing** (an artwork item, a municipality, an 1820 ship), the full label hit 0 of 3, and head-plus-role-words on
     the label's own wiki fixed it; hence propose with descriptions, never bind silently, and let "no target" be a normal
     outcome · **D** the 360° half (about half a day — the vendored Pannellum 2.5.7 needs no new rendering: `hotSpots` pins,
     `clickHandlerFunc`, `mouseEventToCoords()` to place a pin by clicking the sphere; `docs/zone-sphere.png` is a live render
     of the app's own panorama, two pins drawn and a dispatched click delivering `{kind:'article', value:'en:Mauna Kea'}`) ·
     **E** tours and arrival views — **and the image→image half is already live** (see below):
`public/image-tour-demo.json` chains three views with no new code, because a zone publishes `File:…` on its card's
     `zones` channel and the next card's *Commons files* field reads `{{widget:prev#zones}}`; the board sweep asserts
     `21 → 26 → 29 → 26`. Making it scale past one card per view takes **E1** (a `## File:…` header in the `zones` field,
     so one card holds a whole tour) and **E2** (`set` — a zone sets a board param, so `files: {{place}}` makes one card a
     tour) — each ½ day, specified in `docs/ZONES.md` §*Image to image*. For 360°: `scenes` + a `go` action, and `sceneId`
     hotspots pass `targetPitch`/`targetYaw`/`targetHfov` with `loadScene` taking the same three, so a jump lands facing
     what you came to see.
   - **ISSUE-96 — finish the emitter audit.** **16 of 36** widget types publish anything (the 🖼️ Gallery publishes on every source since 2026-09-18; the 🎞️ Commons Gallery joined on
     2026-09-18: captions as `lines`, the clicked file as `selection`; the 🗺️ **Map** joined 2026-10-01, publishing what it draws as a `geojson` payload — the first non-text kind; and the three **CIM** types joined
     2026-10-03: `cimStats`/`cimTrend` publish the subject they resolved as a reference, `cimRanking` the ranked names — one emitter where this checklist used to name five, because the family is three types now), and the audit ranks the
     obvious next ones (`articleList`, `quality`'s ORES grade, `assessments`, the article and category galleries (`small`, `contain`, `list`), `edithistory`, every
     ranking, `sparql`, `waybackGallery`, `mediaPlayer`/`panorama360`, `wikiPage` as a reference, `markdown`). Each
     is a one-line `emit` plus an `outputs` declaration; **the work is checking each one's data shape.** The
     consumer side needs nothing: any text field already interpolates `{{widget:id}}`.
   - **ISSUE-97 — typed payloads — first one shipped (2026-09-16), the row-shaped ones remain.** The pattern is
     now proven end to end on the 🌐 Translator's `#speech` value (`{ type: 'speech', text, lang }`) read through a
     `source` field: the text channel kept, a typed channel added beside it, `primary` deciding what the bare id
     means. Next: the same for a ranking with counts (`{ type: 'ranking', rows: [{ title, count }] }`), a file list
     and an edit list — and copy the speaker's `readSpeechPayload` strictness (a value without a `type` is *not*
     that type, so plain strings keep their old meaning).
   - ~~**ISSUE-99 — the page box, made project-aware.**~~ **Done 2026-09-16** (below): a wiki picker beside the
     box, a reference as the committed value, the `en:`/`de:`/`commons:` shortcut. What remains of this family is
     ISSUE-68's Slice 2 — a Finder **widget** (a prominent search-and-pick card with result previews), which would
     set the param rather than compete with it.
   - **ISSUE-98 — should a widget's display be a template?** Andrew's question after seeing the Translator show
     original *and* translation. Today: the *Show* select is the whole answer, and it covers the real need (show
     less) with no new grammar. Filed with the two design traps (a widget-local namespace colliding with the
     board's, and a template becoming a contract with a widget's internals — the thing ISSUE-97 says a consumer
     must never depend on).
   - **ISSUE-91's `class:` field** — the widget taxonomy. It was waiting for the `interactive` class to have
     implementations to describe; it now has three (channels, `selection`, `linkAction`).
   - **ISSUE-83/84/85 — the Document Reader's reading enhancements** (how much room the transcription gets, a copy
     button that carries the proofreading grade, and where the text lives). Filed from Andrew's notes, none built.
   - **ISSUE-86 — duplicate / copy-paste a widget.** The machinery exists (`handleAddAssembly`'s `idMap`,
     `validateDashboard`, the undo toast); it needs the ⧉ button. Also latent: `Date.now()` ids collide within a
     millisecond.
   - **The widget map** — `docs/WIDGET-MAP.md` + `docs/widget-map.pdf` (generated by `npm run map:widgets` from the manifest):
  all 36 types grouped by *what you must supply*, the gates (static · relay · alpha · publishes · consumes), and the shipping
  chains. The docs gate fails if a registry type is missing from it.
- **Then the Internet Archive media family** — `iaPlaylist` → `iaVideo` + keyframe filmstrip → `iaAudio`, all
     measured and specced in `docs/INTERNET-ARCHIVE.md`.
     - **ISSUE-103's known limit** — the 🎞️ Commons Gallery reads literal `<gallery>` blocks from the wikitext, so a
       gallery generated *by a template* reads as empty (the rendered HTML would catch those, at 10× the bytes: 654 KB
       against 56 KB for London). Worth deciding per case rather than assuming; everything else about galleries shipped.
     - **The gallery merge's two lessons** (2026-09-18) — now written where they are read: **`AGENTS.md`** (loaded
       automatically in this directory) for the operating rules, and `docs/BROWSER-TESTING.md` for the sweep. In one
       line each: the registry is an object keyed by id, so `id:`-based deletions corrupt it silently
       (`commonsGallery` → `fileUsage`, with 588/609 tests passing); and **know which build a sweep measured** — with no
       `--base` the script serves the local `dist/` and refuses a stale one (which is what `npm test` relies on), and
       `--base <url>` is how a *deployment* is measured. This file said the opposite until 2026-10-09 (ISSUE-147): the rule
       and the script must agree, and when they do not, the script is right.

     - **The print's known tweaks** (Andrew, 2026-09-18: *"all much better but could use some tweaking"*). Three
       small, well-understood follow-ups, in the order I would take them:
       (1) **a scale chooser in the 🖨 menu** — *fit* (today's behaviour) or *100%* — because Board and Document mode
       now scale the board to A4's content width, which is a lot of shrinkage for a 1480px board: a deliberate
       trade of page count against text size;
       (2) **Document mode should keep a tall card whole when it fits a page** — it flows now (21 → 7 pages) at the
       cost of a chart occasionally being cut by a page boundary; a JS paginator that knows each card's height could
       insert breaks only where a card would straddle;
       (3) **the poster's allowance is generous** — the page is the board's box × 1.25, so there is ~25% white space
       at the bottom. It is deliberate (script cannot measure the printed layout, and a page slightly too short is a
       second page nobody wanted), but a measured allowance would tighten it.
     - **Also filed, not queued** — ISSUE-101 (an edge-to-edge single-image tile — delivered as a gallery mode) and ISSUE-102 (quiz / trivia
       mode for an event, GitHub #95) came in from a parallel session. Both are self-contained and neither blocks
       anything here.
2. **Tier-A wiring view** — a derived, read-only map of who drives whom on a board.
   Fully specced in `docs/MODULARITY-AND-DATAFLOW.md` §Part 6, not started. This is
   the biggest remaining UX gap now that params and dataflow both ship.
3. **Open widget designs**: ISSUE-41 (board templating), ISSUE-42 (five content
   primitives), ISSUE-43 (`model3D`, the missing fifth primitive — needs CORS on
   Objectium's `/file` + `/thumbnail` routes, or a proxy), ISSUE-48 (media player
   poster frames), ISSUE-49 (TimedText subtitles).
4. **ROADMAP phases**: Phase 1 (time-range selectors, CIM-first GLAM mode),
   Phase 1.5 (batching/efficiency layer), Phase 2 (map + force-graph renderers),
   Phase 2.5 (board-to-board navigation + the Stage & Scene immersion layer).
5. **Quick win**: a Wiki Edu campaign widget — dashboard.wikiedu.org exposes
   CORS-enabled JSON (`/campaigns/{slug}.json`, `/users.json`); verified endpoints
   in `docs/WIDGET-IDEAS.md`.
6. **Demo suite** grows from `docs/DEMO-IDEAS.md` (11 concepts A–K with wiring,
   venue and effort).

## Tooling: the parallel-subagent lane is blocked (2026-10-09)

Every launch of a background child on this machine fails in 0s with *"Background children require the host npm package …
does not provide @earendil-works/pi-agent-core/node"*. Diagnosed rather than guessed:

- `pi-subagents@0.75.0` resolves `@earendil-works/pi-agent-core/node` (`src/runs/background/runner-aliases.js:20`, marked
  `optional: true`), and hard-fails the launch when no alias resolves (`async-execution.js:419`).
- The installed `pi-agent-core@1.0.0` exports only `.` and `./package.json`, and its `dist/` contains **no `node*` file at
  all** — there is nothing to resolve. npm's **1.1.0** exports only `.` too, and `pi-subagents`' own **0.76.1** still lists
  the same alias, so **upgrading either side alone does not fix it**.

Two things worth keeping: `subagent({action:'list'})` reports the built-in agents as *executable* while every launch fails,
so **"listed" is not "launchable"** — and per protocol nothing silently fell back to another runner; work that had assumed
delegation was done directly instead.

## Identity & attribution

- Author: **Andrew Lih** — Wikipedia/Commons username **User:Fuzheado**
- Use `User:Fuzheado` in User-Agents and on-wiki pages; **never** `User:AndrewLih`
  (old alias). See `docs/AUTHORS.md`; the identity is also in `~/.pi/agent/AGENTS.md`.

## External contributions

Public feature requests and bug reports arrive via **GitHub Issues** (templates in
`.github/ISSUE_TEMPLATE/`). Triage flow: duplicate/clarify → move accepted items
into `docs/ISSUES.md` with the next ISSUE-NN number → roadmap/ship per the usual
process. `docs/ISSUES.md` is the canonical internal tracker.

## Session notes for AI agents

- **LiftWing LLM testing (benchmarks, scoring loops): use the "Toolforge trick"** —
  the public endpoint is ~90–100 requests/hour per IP, but running the same call
  from `ssh alih@dev.toolforge.org` (bastion egress on WMF's higher tier) is
  effectively unlimited at ~140 ms/request. Base64-encode the payload over the SSH
  hop. Ready-made: `scripts/benchmark-ask-variants.mjs --via toolforge` and
  `scripts/probe-ask-edge.mjs`; canonical write-up in the `wikimedia-ml-services`
  skill and `docs/DATA-SOURCES.md`.
- **The geometry format is settled — do not re-litigate it.** `docs/GEOMETRY.md` records the decision (2026-10-01): **GeoJSON
  (RFC 7946)** in a typed envelope, `[lon, lat]` WGS84, STAC/OGC time names with `times` per vertex, intake that repairs and
  refuses by name, and the caps (200 features · 2,000 vertices · 256 KB). `src/lib/geojson.js` is the only door in and out,
  and paths/polygons/areas already flow: the points list, pasted geometry, and another widget's shape over a kind-filtered
  `source` field. The next map work is icons+labels (collision), the itinerary stepper, and a time filter — each already
  possible without changing the format.
- **Docs have a constitution now.** `scripts/docs-facts.mjs` derives the truth
  (registry counts, catalog coverage, the panel-measurement count, build-size
  magnitude) and fails the build when prose contradicts it. Volatile facts are
  banned from README/HANDOFF: no bare git SHAs, no running test totals, no
  decimal-precise byte sizes — put history in `docs/DEPLOYMENTS.md` and design
  rationale in `docs/ISSUES.md`, and fix counts *by running the script*, not by
  guessing. `--live` verifies the deployed bundle.
- The LLM wiki (`~/.llm-wiki`) has observations from this project's development
  (search `wikiwidget`, `wikibento`, `commons-impact-metrics`).
- Relevant skills: `toolforge-nodejs` (**read before any `webservice` command**),
  `wikimedia-toolforge`, `wikimedia-commons` (incl. Commons Impact Metrics),
  `wikimedia-api-access`, `commons-file-resolution`, `wikimedia-api-strategy`,
  `playwright-cli`, `cross-browser-testing`, `browser-ux-debugging`.
- **Widget ideas bank:** `docs/WIDGET-IDEAS.md` — unprioritized proposals with
  verified API/CORS notes; move to `docs/ROADMAP.md` when scheduled.
- **Ask-advisor benchmarks:** `bench/README.md` + `bench/results/` (date-prefixed).
  Prompt changes should be re-measured — single-shot runs wobble ±7%, so repeat
  before claiming a regression. Fixtures: `tests/intent-fixtures.mjs`,
  `tests/board-fixtures.mjs`, `tests/fixture-*.mjs`.
- **The on-wiki demo config is `Commons:WikiPortraits/Bento-demo.json`** — the
  WikiPortraits project hosts it; coordinate changes with that page's editors. Its
  size tracks that page, not this repo.

## Tutorial video (state as of 2026-09-12)

> **Picking this up? Read [`docs/TUTORIAL-VIDEO-TOOLING.md`](docs/TUTORIAL-VIDEO-TOOLING.md) first** — it opens
> with a five-step "if you are picking this up", then the layout, the costs, and what is still missing.
> The reusable technique (and every trap paid for) is the skill at
> `~/.pi/agent/skills/narrated-tutorial-video/SKILL.md`; the engine's contract is
> [`pipeline/README.md`](pipeline/README.md).

**Two layers.** `pipeline/` is the engine (beats, voiceover, overlays, encoding, review) and holds **no
WikiBento strings**; `video/` is this project (script, scene plan, `demo.config.mjs`, `actions.mjs`). A second
project copies `video/` and leaves `pipeline/` alone. npm scripts `tutorial:beats|narrate|record|build|review`
each pass `--config video/demo.config.mjs`.

**Current take:** 2:42, `~/Movies/wikibento-tutorial-latest.mp4` (timestamped versions kept beside it; the
`~/Movies` copies are not in git). Verified end to end, including that each scene shows what its narration
claims: scene 1 clicks a subject and the board ripples to Marie Curie, scene 5 really drags a widget, scene 3's
Reset dialog is on screen while its options are described.

**Cheap to iterate:** `build` is per-chapter cached — a caption edit ≈ 18s, a scene re-record + build ≈ 1 min,
a full rebuild ≈ 90s. Changing only words needs no re-recording at all.

**Open, and none of it blocks a re-make:** sound effects (2 🔊 markers need post-production — nothing records
audio from the browser); the per-scene `note` line still lives in `video/scenes.json` rather than the script;
removing a widget is now only visible, not taught; the "another service" line waits on one extra widget on the
demo board; and the take is not published anywhere yet — record the URL here when it is.

**Decisions worth not re-litigating:** two ffmpegs on purpose (Playwright's own for recording, the system one
for assembling); text is rendered by a browser, never by ffmpeg (this machine's ffmpeg has no text filters at
all); fx runs in-page so magnified text stays crisp; the script owns the words, captions and markers, and
`scenes.json` keeps only what prose cannot express.
