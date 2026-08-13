# Widget Ideas — Idea Bank

The backlist of proposed widgets and dashboard ideas, with links and
feasibility notes. This is the **unprioritized idea bank** — the prioritized
plan lives in [ROADMAP.md](ROADMAP.md); when an idea gets scheduled, move it
there. Add new ideas freely; keep the entry format.

**Format:** `## Idea` → links, what it shows, data source + feasibility
(verified facts preferred — note the date you checked), effort, notes.

**Feasibility patterns seen so far:**
- ✅ **Public JSON + CORS `*`** — browser widget directly (best case)
- ⚠️ **Public JSON, no CORS** — needs a proxy (the ROADMAP "CORS proxy" item) or a server-side fetcher
- 🔒 **Auth required (401)** — not usable for public widgets without OAuth; note if it's an option later
- 🧩 **HTML-only** — iframe embed is the cheap fallback, not a real widget

---

## Wiki Edu Campaign Overview (dashboard.wikiedu.org)

- **Links:** [Campaign overview](https://dashboard.wikiedu.org/campaigns/250_by_2026/overview) · [Full site](https://dashboard.wikiedu.org/explore)
- **What it shows:** per-campaign stats — courses, student editors, words
  added, articles edited/created, references, article views. A StatCard/GLAMCard
  style widget per campaign slug (e.g. `250_by_2026`).
- **Feasibility (verified 2026-08-12):**
  - ✅ `https://dashboard.wikiedu.org/campaigns/{slug}.json` — public JSON, **CORS `*`** (200 for `250_by_2026`)
  - ✅ `https://dashboard.wikiedu.org/campaigns/{slug}/users.json` — public, CORS `*` (28 KB: users, roles, courses)
  - 🔒 `…/campaigns/{slug}/courses.json` → **401 "Please sign in"** — course-level data is auth-only
- **Effort:** S–M (campaign metadata widget is small; the full stats table needs the users/courses surface explored)
- **Notes:** campaign JSON includes title/description/start-end dates; check for
  an embedded stats object. Wiki Edu's dashboard is a Rails app — `{resource}.json`
  is the general pattern to probe.

## Wiki Edu Explore / Campaign Directory

- **Links:** [Explore](https://dashboard.wikiedu.org/explore)
- **What it shows:** browse/filter the campaign catalog (Wiki Education's
  programs, e.g. 250_by_2026) — a "campaigns near you" or directory widget.
- **Feasibility (verified 2026-08-12):** ✅ `https://dashboard.wikiedu.org/campaigns.json`
  exists and is CORS-enabled, but returned `{"campaigns":[]}` without query
  params — the filter surface (term/year/etc.) needs discovery from the Explore
  page's JS bundle.
- **Effort:** M
- **Notes:** lower priority than the campaign overview widget; the explore page
  itself is a discovery UI, not a stats page.

## Wiki Edu Impact — Topic Overview

- **Links:** [Impact home](https://impact.wikiedu.org/) · [Topic 9 — Women geologists](https://impact.wikiedu.org/topics/9)
- **What it shows:** headline numbers and charts for a *topic* (a Wikidata-query-
  backed set of articles): `articles_count` (436), `user_count` (116,712),
  `timepoints_count` (25), dates, slug. **The numbers are already computed** —
  the widget fetches and displays, no computation (the user's key insight:
  "without needing to do any computation").
- **Feasibility (verified 2026-08-12):**
  - ✅ `https://impact.wikiedu.org/api/topics/{id}` — public JSON (rich metadata)
  - ⚠️ **No CORS headers** — browser fetch blocked; needs the Toolforge CORS
    proxy (ROADMAP Phase 1) or a server-side fetcher
- **Effort:** S once a proxy exists; S–M if we add the CORS proxy first
- **Notes:** topic descriptions embed the source Wikidata query (e.g.
  `https://w.wiki/8viv`) — a natural link-out. Time-series charts likely via
  timepoint endpoints (`timepoints_count: 25` — endpoints to be discovered in
  the minified bundle).

## Wiki Edu Impact — Topic Sections (articles / revisions / quality)

- **Links:** [Articles](https://impact.wikiedu.org/topics/8#articles) ·
  [Revisions](https://impact.wikiedu.org/topics/8#revisions) ·
  [WP10 quality](https://impact.wikiedu.org/topics/8#wp10)
- **What it shows:** per-topic tabular/chart sections — the topic's article
  list, revision activity over time, and WP10 article-quality distribution
  (FA/A/B/C/Start/Stub — RankingCard material).
- **Feasibility (verified 2026-08-12):** section endpoints not yet identified —
  my probes (`/api/topics/9/articles|revisions|wp10|quality|timepoints`) all
  404'd; the app bundle is minified (2.3 MB) and hides the paths. Needs one
  session of network-tab archaeology, or a quick Ask for the API on
  dashboard.wikiedu.org's talk/support.
- **Effort:** M (includes endpoint discovery)
- **Notes:** same no-CORS caveat as the topic overview — proxy required.

---

## Tier 1 — Power Widgets (2026-08-12 brainstorm: build first, biggest leverage)

> These three make WikiBento a *framework*, not a dashboard. They multiply the value of every other widget. Full strategy in [ROADMAP.md](ROADMAP.md) §Strategy.

### SPARQL Query

- **What it shows:** run any arbitrary SPARQL query; render results as table / bar chart / map. One widget = infinite metrics (Wikidata stats, category analysis, cross-wiki comparisons, geographic data).
- **Feasibility:** ✅ WDQS (`query.wikidata.org/sparql`) is CORS-enabled; also QLever (`commons-query.wikimedia.org`) for Commons SDC graphs (see `wikimedia-commons-sparql` skill). Pre-written query library + editable query input; renderers: table / bar / map (hand-rolled SVG as elsewhere).
- **Effort:** M (query editor + 3 renderers)
- **Notes:** the "hole card" for power users; consider a query library of curated examples (top images of X, license distribution, depicts counts) to seed it.

### PetScan Query

- **What it shows:** category/template intersections output as a list or table (replaces a dozen niche tools).
- **Feasibility:** ✅ `petscan.wmcloud.org` supports `format=json` (PSID URLs persist queries). ⚠️ **gotcha (verified in HANDOFF):** PetScan ignores the `max` cap in quick-intersection mode — max=100 returned all 239,084 files / 39 MB. Always bound queries by depth/categories, and cap output client-side. Never use it for big categories in the GLAM widget — that does its own bounded categorymembers walk.
- **Effort:** S–M
- **Notes:** Swiss army knife of wiki queries; pairs naturally with the WikiProject Monitor pack (PetScan + recentchanges).

### Arbitrary URL Extractor

- **What it shows:** paste a tool URL + CSS selector/regex, pick a metric (sum, count, top-N). The escape hatch that lets WikiBento wrap *any* tool, even ones without APIs.
- **Feasibility:** ⚠️ needs CORS on the target. CORS-enabled Wikimedia endpoints work directly; anything else needs the ROADMAP **CORS proxy** (Toolforge `fetch`-proxy webservice) — this widget is the reason the proxy graduates from "not needed" to required.
- **Effort:** M (selector UI + metric extraction + proxy wiring)
- **Notes:** fulfills the original "generic widget" vision; makes WikiBento open-ended.

## Tier 2 — GLAM & Impact (2026-08-12 brainstorm: the "money" widgets)

> The clearest path to adoption and funding — institutions with budgets and reporting needs. ✅ Already shipped: GLAM Category Usage (GLAMorgan-style), File Usage Map, Commons Impact Metrics via GLAM widget.

### Commons Gallery

- **What it shows:** image grid from a category (visual appeal + GLAM demo value).
- **Feasibility:** ✅ Commons `categorymembers` (CORS-enabled) — the same API the Category Size widget already uses for its random photo sample; reuse that code path.
- **Effort:** S
- **Notes:** near-free once the Category Size sample code is factored out.

### BaGLAMa-style tracker

- **What it shows:** monthly views per image *over time* for a category (replaces stale BaGLAMa 2).
- **Feasibility:** ⚠️ needs snapshot history. Commons Impact Metrics only keeps the latest monthly snapshot; the GLAM widget already fetches top-file views, but *over-time* data requires archiving CIM snapshots (a scheduled fetch, e.g. monthly Toolforge cron) or a per-file pageviews approach.
- **Effort:** M–L (includes snapshot-archiving design)
- **Notes:** check what CIM's snapshot endpoint exposes per file before committing to an archive design.

### Structured Data panel

- **What it shows:** depicts / creator / license stats for a category (GLAM + research).
- **Feasibility:** ✅ WCQS SPARQL (QLever, no auth) or Commons Action API (`wbgetentities`). Category → MediaInfo entities → statement breakdown.
- **Effort:** M
- **Notes:** see `wikimedia-commons-sdc` and `wikimedia-commons-sparql` skills.

## Tier 3 — Article & Content (2026-08-12 brainstorm: monitoring)

| Idea | Data source | Feasibility | Effort | Notes |
|---|---|---|---|---|
| **Article embed** | REST `/page/{title}` | ✅ CORS-enabled, returns HTML | S | Render article or section inline; strip nav cruft |
| **Revision history** | Action API `revisions` | ✅ | S | Reverse-chronological edit list |
| **Article size/growth** | Action API `rvprop=size` | ✅ | S | Byte count over time — is it growing? |
| **What links here** | Action API `linkshere` | ✅ | S | Incoming link count |
| **Language coverage** | Action API `langlinks` | ✅ | S | How many languages — global reach |
| **Wikidata item card** | Wikibase `wbgetentities` | ✅ | S | The structured data behind an article |

> Pageviews sparkline (daily trend) already ships as Article Pageviews.

### Article Vitals family (2026-08-13 — all endpoints verified live + CORS-checked)

> **✅ SHIPPED 2026-08-13** — all four widgets implemented and verified live:
> 📄 excerpt, 🕓 edithistory, 🏅 quality, 🧭 assessments. See
> docs/DATA-SOURCES.md §9–12 and HANDOFF.md.

> The "vitals" concept: any crucial info about ONE article, in any grid
> arrangement. Recommended as **separate widgets** (one registry entry each,
> per the WIDGET_TYPES pattern) + a shared `resolveLatestRev(title)` helper —
> the grid is the configuration. Rough total: 4 widgets ≈ 250 lines + one
> compact list renderer for edit history. Details in the LLM wiki concept
> page `article-vitals-widget-family`.

| Vitals | Data source | Feasibility | Effort | Notes |
|---|---|---|---|---|
| **Article excerpt** | REST `/page/summary/{title}` (title, description, thumbnail, extract) or `prop=extracts&exintro` | ✅ CORS `*` (REST) / `origin=*` | S | REST summary doubles as a vitals header (description + thumb) |
| **Edit history** | Action API `prop=revisions` (`rvprop=timestamp\|user\|comment\|ids\|size`, `rvdir=older`) | ✅ `origin=*` verified | S | Reverse-chron list; byte deltas via size |
| **Pageviews** | RESTBase | ✅ already shipped | done | Article Pageviews widget (`displayMode: stat\|trend`); time-range selector = Phase 1 |
| **ORES article quality** | Lift Wing POST `enwiki-articlequality` (revid in → FA/GA/B/C/Start/Stub + probabilities) or modern continuous `articlequality` | ✅ origin-reflecting CORS (works from Toolforge); needs revid → `prop=revisions&rvlimit=1` first | S–M | Probabilities per class → distribution-bar visual; frozen Revscoring model is the familiar ORES grade |
| **WikiProject assessment** | Action API `prop=pageassessments` | ✅ `origin=*` verified | S | Per-project class + importance (enwiki has the best coverage; extension absent on frwiki/dewiki — empty state needed) |

**Starter pack tie-in:** a "Vitals" bento (one article → excerpt + pageviews +
quality + assessments) fits the starter-packs ship list.

## Tier 4 — Live & Trending (2026-08-12 brainstorm: "wow, it's alive")

| Idea | Data source | Feasibility | Effort | Notes |
|---|---|---|---|---|
| **Top read today** | Pageviews `top/` endpoint | ✅ | S | Most-viewed articles right now |
| **In the news (ITN)** | Action API parse of ITN template | ✅ | S | Current-events front-page feed |
| **On this day** | Selected anniversaries parse | ✅ | S | Historical engagement driver |
| **Recent changes (filtered)** | Action API `recentchanges` | ✅ | S | Live edit feed, filterable — also `wikimedia-eventstreams` for true realtime |
| **Hashtag tracker** | Hashtags tool API | ⚠️ verify | M | Live campaign monitoring; check `hashtags.wmcloud.org` API shape |

## Tier 5 — Community & Editors (2026-08-12 brainstorm: people)

| Idea | Data source | Feasibility | Effort | Notes |
|---|---|---|---|---|
| **Contribution counter** | Action API `usercontribs` | ✅ | S | Edits by user / date-range |
| **Watchlist feed** | Action API `watchlist` | 🔒 needs OAuth | M | Private data — see ROADMAP OAuth row |
| **WikiProject pulse** | PetScan + `recentchanges` | ✅ (once PetScan widget exists) | M | Activity in a project's articles |
| **Vital articles progress** | Vital list + PageAssessments | ✅ | M | Completeness of "must-have" articles |
| **Discussion monitor** | Talk page `revisions` | ✅ | S | Recent talk-page activity |

## The Killer Widget — Article Watch + Spike Alert (2026-08-12 brainstorm)

- **What it shows:** pageviews with a spike detector — when a watched article's views jump **3× its baseline** (breaking news, viral moment), the widget lights up.
- **Audiences:** newsroom editorial intelligence (the story before it's reported); GLAM institutions ("your collection is suddenly famous"); everyone (the single most screenshot-able widget).
- **Feasibility:** ✅ RESTBase pageviews supports arbitrary ranges — baseline = mean of previous N days vs today/rolling window. Edge cases: partial-day "today" numbers, zero-view days, rate spikes from bot traffic.
- **Effort:** M (baseline-window config 7/30 d, threshold, alert state + glow styling)
- **Notes:** the hero feature that gets WikiBento written up; pairs with 📰 Newsroom Pulse pack. Consider per-widget "watched articles" list + browser notification via the [Notifications API].

## Starter Packs — pre-built bentos (2026-08-12 brainstorm: Strong Yes)

> Grafana/Kibana adoption pattern: people select a dashboard and tweak it, they don't build one. A starter pack is just a `dashboard.json` preset — same format the app already exports (docs/JSON-FORMAT.md). One file per pack, loaded from a picker on first run.

| Pack | Target user | Widgets | Dependencies |
|---|---|---|---|
| 🏛️ GLAM Footprint | Museum/archive director | Commons gallery, GLAMorgan panel, file usage map, CIM, language coverage | Gallery widget + langlinks (Tier 3) |
| 📰 Newsroom Pulse | Journalist/editor | Top read today, ITN, spike alert, pageviews trend, article embed | Top-read + ITN + spike alert |
| 🔭 WikiProject Monitor | WikiProject coordinator | Recent changes (filtered), size growth, category size, discussion monitor, vital articles | RC filter + vital articles |
| 🎪 Edit-a-thon Live | Event organizer | Contribution counter, live RC, new-articles feed, hashtag tracker, Commons gallery | Hashtag tracker |
| 📈 Campaign Tracker | Wiki Loves / campaign lead | Upload counter, per-category growth, top contributors, files-in-use | Needs investigation |
| 🧑‍🔬 Researcher's View | Academic | SPARQL, Wikidata item card, langlinks, pageviews, citation metrics | SPARQL widget + citation widget |
| ✍️ Personal Dashboard | Any editor | Watchlist feed, contribution counter, article watch, on-this-day | 🔒 Watchlist needs OAuth |

**Ship order:** GLAM Footprint, Newsroom Pulse, Edit-a-thon Live (first 3; many required widgets already exist or are Tier-1).

## How to Add an Idea

Copy the format above: **title, links, what it shows, verified feasibility
(date-stamped), effort, notes**. If you checked APIs, record exact endpoints
and CORS status — that's what makes an idea actionable later. When an idea is
scheduled, move it into [ROADMAP.md](ROADMAP.md) with the same detail and leave
a pointer here.
